import { describe, expect, it } from "vitest";
import { RECEIPT_PDF_MAX_BYTES, checkReceiptPdf, hasPdfSignature, sha256Hex } from "./pdf";

const PDF_HEAD = new TextEncoder().encode("%PDF-1.7");

describe("checkReceiptPdf", () => {
  const ok = { name: "ticket.pdf", type: "application/pdf", size: 120_000 };

  it("acepta un PDF normal", () => {
    expect(checkReceiptPdf(ok, PDF_HEAD)).toBeNull();
  });

  it("acepta un PDF sin tipo MIME si la extensión es .pdf (algunos navegadores no lo informan)", () => {
    expect(checkReceiptPdf({ ...ok, type: "" }, PDF_HEAD)).toBeNull();
  });

  it("rechaza un archivo vacío", () => {
    expect(checkReceiptPdf({ ...ok, size: 0 }, PDF_HEAD)).toMatch(/vacío/);
  });

  it("rechaza un PDF de más de 15 MB", () => {
    expect(checkReceiptPdf({ ...ok, size: RECEIPT_PDF_MAX_BYTES + 1 }, PDF_HEAD)).toMatch(/demasiado grande/);
    expect(checkReceiptPdf({ ...ok, size: RECEIPT_PDF_MAX_BYTES }, PDF_HEAD)).toBeNull();
  });

  it("rechaza un archivo que no es PDF (por tipo/extensión)", () => {
    expect(checkReceiptPdf({ name: "foto.png", type: "image/png", size: 1000 }, PDF_HEAD)).toMatch(/debe ser un PDF/);
  });

  it("rechaza un .pdf cuyo contenido no lo es (firma %PDF-)", () => {
    const texto = new TextEncoder().encode("hola mundo");
    expect(checkReceiptPdf(ok, texto)).toMatch(/no parece un PDF válido/);
  });
});

describe("hasPdfSignature", () => {
  it("solo reconoce %PDF- al inicio", () => {
    expect(hasPdfSignature(PDF_HEAD)).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode("xx%PDF-"))).toBe(false);
    expect(hasPdfSignature(new Uint8Array([0x25, 0x50]))).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("calcula el SHA-256 en hexadecimal (vector conocido de 'abc')", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("mismo contenido, mismo hash; distinto contenido, distinto hash", async () => {
    const a = await sha256Hex(new TextEncoder().encode("ticket-1"));
    expect(await sha256Hex(new TextEncoder().encode("ticket-1"))).toBe(a);
    expect(await sha256Hex(new TextEncoder().encode("ticket-2"))).not.toBe(a);
  });
});
