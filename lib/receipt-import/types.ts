// Contrato `receipt_interpretation_v1` (importación manual de tickets por JSON).
// Los tipos describen el JSON YA validado y normalizado (los opcionales ausentes
// llegan como null / [] -- ver validate.ts); no describen el JSON crudo.

export const RECEIPT_IMPORT_SCHEMA = "receipt_interpretation_v1";
/** Versión mayor soportada: se acepta cualquier "1.x". */
export const RECEIPT_IMPORT_SUPPORTED_MAJOR = 1;
/** Tope de tamaño del fichero/texto (cliente y servidor). */
export const RECEIPT_IMPORT_MAX_BYTES = 1_000_000;
export const RECEIPT_IMPORT_MAX_LINES = 500;

export interface ReceiptImportSource {
  channel: string | null;
  provider: string | null;
  provider_message_id: string | null;
  email_subject: string | null;
  attachment_filename: string | null;
  original_document_hash: string | null;
}

export interface ReceiptImportTax {
  rate: number | null;
  taxable_base: number | null;
  tax_amount: number | null;
  total_with_tax: number | null;
}

export interface ReceiptImportData {
  supermarket: string;
  tax_id: string | null;
  store_address: string | null;
  store_postal_code: string | null;
  store_city: string | null;
  store_phone: string | null;
  /** YYYY-MM-DD, ya comprobada como fecha real. */
  purchase_date: string;
  purchase_time: string | null;
  operator: string | null;
  receipt_number: string | null;
  currency: string | null;
  subtotal: number | null;
  tax_total: number | null;
  total: number;
  total_origin: string | null;
  payment_method: string | null;
  taxes: ReceiptImportTax[];
}

export interface ReceiptImportLine {
  line_number: number;
  /** Texto del ticket tal cual llega (sin trim ni cambios de mayúsculas). */
  raw_text: string;
  product_name: string;
  brand: string | null;
  commercial_name: string | null;
  /** Categoría oficial (PRODUCT_CATEGORIES), ya resuelta. */
  category: string;
  purchase_quantity: number;
  units_per_pack: number | null;
  inventory_quantity: number | null;
  unit: string;
  unit_price: number | null;
  total_price: number;
  is_inventory_item: boolean;
  confidence: number | null;
  review_required: boolean;
  notes: string | null;
}

export interface ReceiptImportValidation {
  calculated_lines_total: number | null;
  receipt_total: number | null;
  totals_match: boolean | null;
}

export interface ReceiptImportV1 {
  schema: typeof RECEIPT_IMPORT_SCHEMA;
  schema_version: string;
  source: ReceiptImportSource;
  receipt: ReceiptImportData;
  lines: ReceiptImportLine[];
  discounts: unknown[];
  warnings: unknown[];
  /** Informativo: la aplicación nunca se fía de él, recalcula los totales. */
  validation: ReceiptImportValidation;
}

export interface ReceiptImportIssue {
  /** Ruta dentro del JSON, p. ej. "lines[2].unit" (para depurar; no se muestra tal cual). */
  path: string;
  /** Mensaje en español listo para el usuario. */
  message: string;
}

export type ReceiptImportParseResult =
  | { ok: true; data: ReceiptImportV1 }
  | { ok: false; issues: ReceiptImportIssue[] };
