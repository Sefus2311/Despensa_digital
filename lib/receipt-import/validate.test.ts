import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validImportJson } from "./fixtures";
import { toCents } from "./money";
import { parseReceiptImportJson, validateReceiptImport } from "./validate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function messages(input: unknown): string[] {
  const result = validateReceiptImport(input);
  return result.ok ? [] : result.issues.map((i) => i.message);
}

describe("validateReceiptImport", () => {
  it("1. acepta un JSON válido y lo normaliza", () => {
    const result = validateReceiptImport(validImportJson());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toHaveLength(2);
    expect(result.data.receipt.total).toBe(22.15);
    expect(result.data.validation.totals_match).toBe(true);
  });

  it("acepta el fichero como texto (con BOM)", () => {
    const text = "﻿" + JSON.stringify(validImportJson());
    expect(parseReceiptImportJson(text).ok).toBe(true);
  });

  it("2. rechaza un JSON mal formado", () => {
    const result = parseReceiptImportJson("{ esto no es json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toBe("El archivo no contiene un JSON válido.");
  });

  it("3. rechaza una versión de esquema no compatible", () => {
    const v2: Json = { ...validImportJson(), schema_version: "2.0" };
    expect(messages(v2)[0]).toMatch(/versión del formato \(2\.0\) no es compatible/);
    const otroSchema: Json = { ...validImportJson(), schema: "otra_cosa" };
    expect(messages(otroSchema)[0]).toMatch(/formato del ticket no es compatible/);
    // cualquier 1.x se admite
    expect(validateReceiptImport({ ...validImportJson(), schema_version: "1.3" }).ok).toBe(true);
  });

  it("4. rechaza campos obligatorios ausentes", () => {
    const sinSuper: Json = validImportJson();
    sinSuper.receipt.supermarket = "  ";
    expect(messages(sinSuper)).toContain("Falta el supermercado.");

    const sinFecha: Json = validImportJson();
    delete sinFecha.receipt.purchase_date;
    expect(messages(sinFecha).join(" ")).toMatch(/fecha de compra no es válida/);

    const fechaImposible: Json = validImportJson();
    fechaImposible.receipt.purchase_date = "2026-02-31";
    expect(messages(fechaImposible).join(" ")).toMatch(/fecha de compra no es válida/);

    const sinTotal: Json = validImportJson();
    delete sinTotal.receipt.total;
    expect(messages(sinTotal).join(" ")).toMatch(/total del ticket no es válido/);

    const sinReceipt: Json = validImportJson();
    delete sinReceipt.receipt;
    expect(messages(sinReceipt)).toContain("Falta el bloque «receipt» del ticket.");

    const lineaIncompleta: Json = validImportJson();
    delete lineaIncompleta.lines[0].raw_text;
    delete lineaIncompleta.lines[0].product_name;
    delete lineaIncompleta.lines[0].unit;
    const errores = messages(lineaIncompleta).join(" ");
    expect(errores).toMatch(/raw_text/);
    expect(errores).toMatch(/product_name/);
    expect(errores).toMatch(/unidad/);
  });

  it("5. rechaza un ticket sin líneas", () => {
    const vacio: Json = { ...validImportJson(), lines: [] };
    expect(messages(vacio)).toContain("El ticket no contiene productos.");
    const sinLines: Json = validImportJson();
    delete sinLines.lines;
    expect(messages(sinLines).join(" ")).toMatch(/Falta la lista de productos/);
  });

  it("6. rechaza cantidades o precios negativos", () => {
    const cantidad: Json = validImportJson();
    cantidad.lines[0].purchase_quantity = -1;
    expect(messages(cantidad).join(" ")).toMatch(/cantidad comprada no puede ser negativa/);

    const precio: Json = validImportJson();
    precio.lines[0].total_price = -9.8;
    expect(messages(precio).join(" ")).toMatch(/precio total no puede ser negativo/);

    const unitario: Json = validImportJson();
    unitario.lines[0].unit_price = -4.9;
    expect(messages(unitario).join(" ")).toMatch(/unit_price/);

    const total: Json = validImportJson();
    total.receipt.total = -22.15;
    expect(messages(total).join(" ")).toMatch(/total del ticket no es válido/);
  });

  it("7. rechaza una unidad no admitida para inventario", () => {
    const kg: Json = validImportJson();
    kg.lines[0].unit = "kg";
    expect(messages(kg).join(" ")).toMatch(/unidad «kg» no es válida para inventario/);

    // una línea que no es de inventario (p. ej. bolsa) admite otra unidad
    const bolsa: Json = validImportJson();
    bolsa.lines[0].unit = "bolsa";
    bolsa.lines[0].is_inventory_item = false;
    expect(validateReceiptImport(bolsa).ok).toBe(true);
  });

  it("normaliza variantes de unidad a ud./gr./ml.", () => {
    const variantes: Json = validImportJson();
    variantes.lines[0].unit = "UNIDADES";
    variantes.lines[1].unit = "ML";
    const result = validateReceiptImport(variantes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.lines.map((l) => l.unit)).toEqual(["ud.", "ml."]);
  });

  it("rechaza una categoría que no es oficial y acepta variantes de escritura", () => {
    const rara: Json = validImportJson();
    rara.lines[0].category = "CARNICERÍA";
    expect(messages(rara).join(" ")).toMatch(/«CARNICERÍA» no es una categoría oficial/);

    const sinAcento: Json = validImportJson();
    sinAcento.lines[0].category = "alimentacion";
    const result = validateReceiptImport(sinAcento);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.lines[0].category).toBe("ALIMENTACIÓN");
  });

  it("8. rechaza si la suma de las líneas no coincide con el total", () => {
    const descuadre: Json = validImportJson();
    descuadre.receipt.total = 22.1;
    const errores = messages(descuadre).join(" ");
    expect(errores).toMatch(/suma de las líneas/);
    expect(errores).toMatch(/no coincide con el total del ticket/);
  });

  it("no se fía de validation.totals_match: lo recalcula", () => {
    const mentira: Json = validImportJson();
    mentira.lines[1].total_price = 1;
    mentira.validation.totals_match = true;
    expect(messages(mentira).join(" ")).toMatch(/suma de las líneas/);

    const acierta: Json = validImportJson();
    acierta.validation.totals_match = false;
    const result = validateReceiptImport(acierta);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.validation.totals_match).toBe(true);
  });

  it("9. compara importes en céntimos (sin errores de coma flotante)", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(toCents(0.1) + toCents(0.2)).toBe(toCents(0.3));

    const flotante: Json = validImportJson();
    flotante.receipt.total = 0.3;
    flotante.lines = [
      { ...flotante.lines[0], line_number: 1, total_price: 0.1 },
      { ...flotante.lines[1], line_number: 2, total_price: 0.2 },
    ];
    expect(validateReceiptImport(flotante).ok).toBe(true);

    // 19,99 + 0,01 = 20,00 aunque en flotante no sea exacto
    const otro: Json = validImportJson();
    otro.receipt.total = 20;
    otro.lines = [
      { ...otro.lines[0], line_number: 1, total_price: 19.99 },
      { ...otro.lines[1], line_number: 2, total_price: 0.01 },
    ];
    expect(validateReceiptImport(otro).ok).toBe(true);
  });

  it("12. rechaza un home_id externo (en cualquier bloque)", () => {
    const raiz: Json = { ...validImportJson(), home_id: "00000000-0000-0000-0000-000000000001" };
    expect(messages(raiz).join(" ")).toMatch(/no puede indicar la casa \(home_id\)/);

    const target: Json = validImportJson();
    target.target.home_id = "otra-casa";
    expect(messages(target).join(" ")).toMatch(/home_id/);

    const receipt: Json = validImportJson();
    receipt.receipt.home_id = "otra-casa";
    expect(messages(receipt).join(" ")).toMatch(/home_id/);

    const resolucion: Json = validImportJson();
    resolucion.target.home_resolution = "HOME_BY_ID";
    expect(messages(resolucion).join(" ")).toMatch(/destino «HOME_BY_ID» no es compatible/);

    // home_id nulo no cuenta
    const nulo: Json = validImportJson();
    nulo.home_id = null;
    expect(validateReceiptImport(nulo).ok).toBe(true);
  });

  it("los campos opcionales pueden ser null o faltar sin romper", () => {
    const minimo: Json = validImportJson();
    delete minimo.source;
    delete minimo.discounts;
    delete minimo.warnings;
    delete minimo.validation;
    delete minimo.target;
    minimo.receipt = {
      supermarket: "Lidl",
      purchase_date: "2026-09-18",
      total: 22.15,
      taxes: null,
      subtotal: "no-es-numero",
    };
    for (const line of minimo.lines) {
      line.brand = null;
      delete line.commercial_name;
      delete line.units_per_pack;
      delete line.confidence;
      delete line.notes;
    }
    const result = validateReceiptImport(minimo);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.receipt.subtotal).toBeNull();
      expect(result.data.source.provider_message_id).toBeNull();
      expect(result.data.receipt.taxes).toEqual([]);
    }
  });

  it("conserva raw_text exactamente como llega", () => {
    const raro: Json = validImportJson();
    raro.lines[0].raw_text = "  2 TONYINA  CLARA OLIV 4,90 9,80 ";
    const result = validateReceiptImport(raro);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.lines[0].raw_text).toBe("  2 TONYINA  CLARA OLIV 4,90 9,80 ");
  });
});

describe("fichero de ejemplo (docs/examples)", () => {
  it("es un JSON válido según el contrato", () => {
    const text = readFileSync(
      path.resolve(__dirname, "../../docs/examples/receipt_interpretation_v1.example.json"),
      "utf-8"
    );
    const result = parseReceiptImportJson(text);
    expect(result.ok).toBe(true);
  });
});
