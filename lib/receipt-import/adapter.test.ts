import { describe, expect, it } from "vitest";
import { toImportPayload } from "./adapter";
import { validImportJson } from "./fixtures";
import { validateReceiptImport } from "./validate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function payloadFrom(json: unknown) {
  const result = validateReceiptImport(json);
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join(" | "));
  return toImportPayload(result.data);
}

describe("toImportPayload: pesos en kg", () => {
  function weighedLine(raw_text: string, purchase_quantity: number) {
    const json: Json = validImportJson();
    Object.assign(json.lines[0], {
      raw_text,
      purchase_quantity,
      inventory_quantity: null,
      unit: "gr.",
      unit_price: null,
      total_price: 2.52,
      review_required: false,
      notes: null,
    });
    json.lines = [json.lines[0]];
    json.receipt.total = 2.52;
    return json;
  }

  function lineFrom(json: Json) {
    return payloadFrom(json).lines[0];
  }

  it("etiqueta en kg una cantidad pequeña en gr., sin tocar número ni texto", () => {
    const raw = "OFE CALAMAR GROS 0,194 kg NET x 12,99 €/kg 2,52";
    expect(lineFrom(weighedLine(raw, 0.194))).toMatchObject({
      raw_name: raw,
      quantity: 0.194,
      inventory_quantity: 0.194,
      unit: "kg",
      review_required: false,
      notes: null,
    });
  });

  it("gramos reales se quedan en gr.", () => {
    expect(lineFrom(weighedLine("QUESO CURADO", 350))).toMatchObject({ quantity: 350, unit: "gr." });
  });

  it("un volumen muy pequeño no se cambia, pero pide revisar", () => {
    const json = weighedLine("ZUMO 1,5", 1.5);
    json.lines[0].unit = "ml.";
    const line = lineFrom(json);
    expect(line).toMatchObject({ quantity: 1.5, unit: "ml.", review_required: true });
    expect(line.notes).toMatch(/litros/);
  });

  it("no altera una línea normal", () => {
    const line = payloadFrom(validImportJson()).lines[1];
    expect(line).toMatchObject({ quantity: 1, inventory_quantity: 6000, review_required: false, notes: null });
  });
});

describe("toImportPayload", () => {
  it("11. fuerza pending_review aunque el fichero diga otro estado", () => {
    for (const status of ["PENDIENTE_REVISION", "CONFIRMADO", "IMPORTADO", "reviewed", undefined]) {
      const json: Json = { ...validImportJson(), status };
      expect(payloadFrom(json).receipt.status).toBe("pending_review");
    }
  });

  it("guarda el supermercado en MAYÚSCULAS (conservando tildes, Ñ y Ç)", () => {
    const json: Json = validImportJson();
    json.receipt.supermarket = "  merCadona ";
    expect(payloadFrom(json).receipt.store_name).toBe("MERCADONA");

    json.receipt.supermarket = "el corte inglés ñandú plaça";
    expect(payloadFrom(json).receipt.store_name).toBe("EL CORTE INGLÉS ÑANDÚ PLAÇA");
  });

  it("guarda el producto interpretado con la primera letra en mayúscula y conserva raw_text tal cual", () => {
    const payload = payloadFrom(validImportJson());
    expect(payload.lines[0].product_name).toBe("Atún claro en aceite de oliva");
    expect(payload.lines[0].raw_name).toBe("2 TONYINA CLARA OLIV 4,90 9,80");
    // las categorías oficiales siguen en mayúsculas
    expect(payload.lines[0].category).toBe("ALIMENTACIÓN");
  });

  it("nunca incluye un home_id en el payload (la casa la aporta el servidor)", () => {
    const serializado = JSON.stringify(payloadFrom(validImportJson()));
    expect(serializado).not.toMatch(/home_id/i);
  });

  it("conserva las unidades oficiales y los datos de identificación para detectar duplicados", () => {
    const payload = payloadFrom(validImportJson());
    expect(payload.lines.map((l) => l.unit)).toEqual(["ud.", "ml."]);
    expect(payload.receipt.receipt_number).toBe("2243-015-845459");
    expect(payload.receipt.source_message_id).toBe("msg-123");
    expect(payload.receipt.source_provider).toBe("GMAIL");
  });

  it("guarda los datos secundarios (impuestos, dirección, origen) en import_data", () => {
    const { import_data } = payloadFrom(validImportJson()).receipt;
    expect(import_data.taxes).toHaveLength(1);
    expect(import_data.payment_method).toBe("TARJETA BANCARIA");
    expect((import_data.store as { city: string }).city).toBe("VILAFRANCA DEL PENEDÈS");
  });

  it("usa el hash del PDF como source_document_hash si el JSON no trae uno, y respeta el del JSON si lo trae", () => {
    const result = validateReceiptImport(validImportJson());
    if (!result.ok) throw new Error("fixture inválido");
    expect(toImportPayload(result.data, { documentHash: "abc123" }).receipt.source_document_hash).toBe("abc123");
    expect(toImportPayload(result.data).receipt.source_document_hash).toBeNull();

    const json: Json = validImportJson();
    json.source.original_document_hash = "hash-del-json";
    expect(payloadFrom(json).receipt.source_document_hash).toBe("hash-del-json");
    const conHash = validateReceiptImport(json);
    if (!conHash.ok) throw new Error("fixture inválido");
    expect(toImportPayload(conHash.data, { documentHash: "abc123" }).receipt.source_document_hash).toBe("hash-del-json");
  });

  it("sin cantidad de inventario explícita, usa la cantidad comprada en líneas de inventario", () => {
    const json: Json = validImportJson();
    delete json.lines[0].inventory_quantity;
    expect(payloadFrom(json).lines[0].inventory_quantity).toBe(2);
  });
});
