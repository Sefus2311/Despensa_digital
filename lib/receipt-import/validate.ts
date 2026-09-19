// Validación centralizada del contrato receipt_interpretation_v1. Función pura
// (sin red ni Supabase): la usan el cliente (feedback inmediato) y el servidor
// (autoritativa) con exactamente las mismas reglas.
import { PRODUCT_CATEGORIES } from "@/lib/constants/product-categories";
import { canonicalizeUnit, normalizeStandardUnit } from "@/lib/units";
import { formatCents, toCents } from "./money";
import {
  RECEIPT_IMPORT_MAX_BYTES,
  RECEIPT_IMPORT_MAX_LINES,
  RECEIPT_IMPORT_SCHEMA,
  RECEIPT_IMPORT_SUPPORTED_MAJOR,
  type ReceiptImportIssue,
  type ReceiptImportLine,
  type ReceiptImportParseResult,
  type ReceiptImportTax,
  type ReceiptImportV1,
} from "./types";

const MAX_REPORTED_ISSUES = 20;
const HOME_RESOLUTION_CURRENT = "CURRENT_USER_DEFAULT_HOME";

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Texto opcional: string recortado (vacío -> null); números se pasan a texto; el resto -> null. */
function optString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (isFiniteNumber(value)) return String(value);
  return null;
}

/** Número opcional de datos secundarios: lo no numérico se ignora (nunca rompe la importación). */
function optNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function withoutDiacritics(text: string): string {
  // U+0300–U+036F: marcas combinantes que deja NFD tras separar las tildes.
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "alimentacion" / "Alimentación" -> "ALIMENTACIÓN"; categoría no oficial -> null. */
export function resolveOfficialCategory(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = withoutDiacritics(raw.trim()).toUpperCase();
  return PRODUCT_CATEGORIES.find((c) => withoutDiacritics(c) === key) ?? null;
}

function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function hasExternalHomeId(record: unknown): boolean {
  if (!isRecord(record)) return false;
  return ["home_id", "homeId"].some((key) => record[key] !== undefined && record[key] !== null);
}

/** Primer paso: texto -> JSON. No valida el contrato. */
export function parseJsonText(
  text: string
): { ok: true; value: unknown } | { ok: false; issue: ReceiptImportIssue } {
  if (new TextEncoder().encode(text).length > RECEIPT_IMPORT_MAX_BYTES) {
    return {
      ok: false,
      issue: { path: "", message: "El archivo es demasiado grande (máximo 1 MB)." },
    };
  }
  try {
    // Quita el BOM (U+FEFF) que algunos editores de Windows añaden al inicio.
    return { ok: true, value: JSON.parse(text.replace(/^﻿/, "")) };
  } catch {
    return { ok: false, issue: { path: "", message: "El archivo no contiene un JSON válido." } };
  }
}

/** Texto (contenido del fichero) -> contrato validado. */
export function parseReceiptImportJson(text: string): ReceiptImportParseResult {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return { ok: false, issues: [parsed.issue] };
  return validateReceiptImport(parsed.value);
}

function validateLine(raw: unknown, index: number, issues: ReceiptImportIssue[]): ReceiptImportLine | null {
  const path = `lines[${index}]`;
  if (!isRecord(raw)) {
    issues.push({ path, message: `Línea ${index + 1}: formato no válido.` });
    return null;
  }

  const label = isFiniteNumber(raw.line_number) ? raw.line_number : index + 1;
  const before = issues.length;
  const fail = (field: string, message: string) =>
    issues.push({ path: `${path}.${field}`, message: `Línea ${label}: ${message}` });

  if (!isFiniteNumber(raw.line_number) || !Number.isInteger(raw.line_number) || raw.line_number < 1) {
    fail("line_number", "el número de línea (line_number) debe ser un entero desde 1.");
  }
  if (typeof raw.raw_text !== "string" || raw.raw_text.trim() === "") {
    fail("raw_text", "falta el texto original del ticket (raw_text).");
  }
  const productName = typeof raw.product_name === "string" ? raw.product_name.trim() : "";
  if (productName === "") fail("product_name", "falta el nombre del producto (product_name).");

  const category = resolveOfficialCategory(raw.category);
  if (raw.category == null || (typeof raw.category === "string" && raw.category.trim() === "")) {
    fail("category", "falta la categoría.");
  } else if (!category) {
    fail("category", `la categoría «${String(raw.category)}» no es una categoría oficial.`);
  }

  if (!isFiniteNumber(raw.purchase_quantity)) {
    fail("purchase_quantity", "falta la cantidad comprada (purchase_quantity) o no es un número.");
  } else if (raw.purchase_quantity < 0) {
    fail("purchase_quantity", "la cantidad comprada no puede ser negativa.");
  }

  if (!isFiniteNumber(raw.total_price)) {
    fail("total_price", "falta el precio total (total_price) o no es un número.");
  } else if (raw.total_price < 0) {
    fail("total_price", "el precio total no puede ser negativo.");
  }

  const isInventoryItem =
    raw.is_inventory_item === undefined || raw.is_inventory_item === null ? true : raw.is_inventory_item === true;

  let unit = "";
  if (typeof raw.unit !== "string" || raw.unit.trim() === "") {
    fail("unit", "falta la unidad (unit).");
  } else if (isInventoryItem && normalizeStandardUnit(raw.unit) === null) {
    fail("unit", `la unidad «${raw.unit}» no es válida para inventario (usa ud., gr. o ml.).`);
  } else {
    unit = canonicalizeUnit(raw.unit) ?? raw.unit.trim();
  }

  const optionalNonNegative = (field: "units_per_pack" | "inventory_quantity" | "unit_price"): number | null => {
    const value = raw[field];
    if (value === undefined || value === null) return null;
    if (!isFiniteNumber(value)) {
      fail(field, `«${field}» debe ser un número.`);
      return null;
    }
    if (value < 0) {
      fail(field, `«${field}» no puede ser negativo.`);
      return null;
    }
    return value;
  };
  const unitsPerPack = optionalNonNegative("units_per_pack");
  const inventoryQuantity = optionalNonNegative("inventory_quantity");
  const unitPrice = optionalNonNegative("unit_price");

  let confidence: number | null = null;
  if (raw.confidence !== undefined && raw.confidence !== null) {
    if (!isFiniteNumber(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) {
      fail("confidence", "la confianza debe ser un número entre 0 y 1.");
    } else {
      confidence = raw.confidence;
    }
  }

  if (issues.length > before) return null;

  return {
    line_number: raw.line_number as number,
    raw_text: raw.raw_text as string,
    product_name: productName,
    brand: optString(raw.brand),
    commercial_name: optString(raw.commercial_name),
    category: category as string,
    purchase_quantity: raw.purchase_quantity as number,
    units_per_pack: unitsPerPack,
    inventory_quantity: inventoryQuantity,
    unit,
    unit_price: unitPrice,
    total_price: raw.total_price as number,
    is_inventory_item: isInventoryItem,
    confidence,
    review_required: raw.review_required === true,
    notes: optString(raw.notes),
  };
}

function normalizeTaxes(raw: unknown): ReceiptImportTax[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((tax) => ({
    rate: optNumber(tax.rate),
    taxable_base: optNumber(tax.taxable_base),
    tax_amount: optNumber(tax.tax_amount),
    total_with_tax: optNumber(tax.total_with_tax),
  }));
}

/**
 * Valida un valor ya parseado contra receipt_interpretation_v1. Devuelve el
 * contrato normalizado o la lista de problemas (en español, para el usuario).
 * No se fía de `validation.totals_match` ni del `status`/`home_id` del fichero.
 */
export function validateReceiptImport(input: unknown): ReceiptImportParseResult {
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: "", message: "El formato del ticket no es compatible." }] };
  }

  if (input.schema !== RECEIPT_IMPORT_SCHEMA) {
    return {
      ok: false,
      issues: [
        {
          path: "schema",
          message: `El formato del ticket no es compatible (se esperaba «${RECEIPT_IMPORT_SCHEMA}»).`,
        },
      ],
    };
  }

  const version = typeof input.schema_version === "string" ? input.schema_version : "";
  const major = /^(\d+)\.\d+(\.\d+)?$/.exec(version)?.[1];
  if (major === undefined || Number(major) !== RECEIPT_IMPORT_SUPPORTED_MAJOR) {
    return {
      ok: false,
      issues: [
        {
          path: "schema_version",
          message: `La versión del formato${version ? ` (${version})` : ""} no es compatible; se admite la ${RECEIPT_IMPORT_SUPPORTED_MAJOR}.x.`,
        },
      ],
    };
  }

  const issues: ReceiptImportIssue[] = [];

  // La casa nunca sale del fichero: se resuelve siempre con la casa activa.
  const target = isRecord(input.target) ? input.target : null;
  if (
    hasExternalHomeId(input) ||
    hasExternalHomeId(target) ||
    hasExternalHomeId(input.receipt) ||
    hasExternalHomeId(input.source)
  ) {
    issues.push({
      path: "home_id",
      message: "El fichero no puede indicar la casa (home_id): el ticket se importa siempre en la casa activa.",
    });
  }
  if (target && target.home_resolution != null && target.home_resolution !== HOME_RESOLUTION_CURRENT) {
    issues.push({
      path: "target.home_resolution",
      message: `El destino «${String(target.home_resolution)}» no es compatible; se admite ${HOME_RESOLUTION_CURRENT}.`,
    });
  }

  const receiptRaw = input.receipt;
  if (!isRecord(receiptRaw)) {
    issues.push({ path: "receipt", message: "Falta el bloque «receipt» del ticket." });
  }
  if (!Array.isArray(input.lines)) {
    issues.push({ path: "lines", message: "Falta la lista de productos («lines»)." });
  } else if (input.lines.length === 0) {
    issues.push({ path: "lines", message: "El ticket no contiene productos." });
  } else if (input.lines.length > RECEIPT_IMPORT_MAX_LINES) {
    issues.push({ path: "lines", message: `El ticket tiene demasiadas líneas (máximo ${RECEIPT_IMPORT_MAX_LINES}).` });
  }

  let supermarket = "";
  let purchaseDate = "";
  let total: number | null = null;
  if (isRecord(receiptRaw)) {
    supermarket = typeof receiptRaw.supermarket === "string" ? receiptRaw.supermarket.trim() : "";
    if (supermarket === "") issues.push({ path: "receipt.supermarket", message: "Falta el supermercado." });

    if (isRealIsoDate(receiptRaw.purchase_date)) {
      purchaseDate = receiptRaw.purchase_date;
    } else {
      issues.push({
        path: "receipt.purchase_date",
        message: "La fecha de compra no es válida (se esperaba AAAA-MM-DD).",
      });
    }

    if (isFiniteNumber(receiptRaw.total) && receiptRaw.total >= 0) {
      total = receiptRaw.total;
    } else {
      issues.push({
        path: "receipt.total",
        message: "El total del ticket no es válido (debe ser un número igual o superior a cero).",
      });
    }
  }

  const lines: ReceiptImportLine[] = [];
  let allLinesValid =
    Array.isArray(input.lines) && input.lines.length > 0 && input.lines.length <= RECEIPT_IMPORT_MAX_LINES;
  if (allLinesValid) {
    (input.lines as unknown[]).forEach((rawLine, index) => {
      const line = validateLine(rawLine, index, issues);
      if (line) lines.push(line);
      else allLinesValid = false;
    });
  }

  // Recalculado siempre por la aplicación, en céntimos (no se usa validation.totals_match).
  let calculatedCents: number | null = null;
  if (allLinesValid && total !== null) {
    calculatedCents = lines.reduce((sum, line) => sum + toCents(line.total_price), 0);
    if (calculatedCents !== toCents(total)) {
      issues.push({
        path: "receipt.total",
        message: `La suma de las líneas (${formatCents(calculatedCents)}) no coincide con el total del ticket (${formatCents(toCents(total))}).`,
      });
    }
  }

  if (issues.length > 0 || !isRecord(receiptRaw) || total === null) {
    const shown = issues.slice(0, MAX_REPORTED_ISSUES);
    if (issues.length > shown.length) {
      shown.push({ path: "", message: `… y ${issues.length - shown.length} problemas más.` });
    }
    return { ok: false, issues: shown };
  }

  const source = isRecord(input.source) ? input.source : {};

  const data: ReceiptImportV1 = {
    schema: RECEIPT_IMPORT_SCHEMA,
    schema_version: version,
    source: {
      channel: optString(source.channel),
      provider: optString(source.provider),
      provider_message_id: optString(source.provider_message_id),
      email_subject: optString(source.email_subject),
      attachment_filename: optString(source.attachment_filename),
      original_document_hash: optString(source.original_document_hash),
    },
    receipt: {
      supermarket,
      tax_id: optString(receiptRaw.tax_id),
      store_address: optString(receiptRaw.store_address),
      store_postal_code: optString(receiptRaw.store_postal_code),
      store_city: optString(receiptRaw.store_city),
      store_phone: optString(receiptRaw.store_phone),
      purchase_date: purchaseDate,
      purchase_time: optString(receiptRaw.purchase_time),
      operator: optString(receiptRaw.operator),
      receipt_number: optString(receiptRaw.receipt_number),
      currency: optString(receiptRaw.currency),
      subtotal: optNumber(receiptRaw.subtotal),
      tax_total: optNumber(receiptRaw.tax_total),
      total,
      total_origin: optString(receiptRaw.total_origin),
      payment_method: optString(receiptRaw.payment_method),
      taxes: normalizeTaxes(receiptRaw.taxes),
    },
    lines,
    discounts: Array.isArray(input.discounts) ? input.discounts : [],
    warnings: Array.isArray(input.warnings) ? input.warnings : [],
    validation: {
      calculated_lines_total: calculatedCents === null ? null : calculatedCents / 100,
      receipt_total: total,
      totals_match: calculatedCents === null ? null : calculatedCents === toCents(total),
    },
  };

  return { ok: true, data };
}
