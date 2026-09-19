// Comprobaciones del PDF asociado a un ticket importado. Lógica pura (sin red
// ni Supabase): la usan el cliente (feedback inmediato) y el servidor
// (autoritativa), igual que validate.ts.

/** Mismo tope que la subida normal de tickets (uploadReceipt). */
export const RECEIPT_PDF_MAX_BYTES = 15 * 1024 * 1024;

export interface PdfFileInfo {
  name: string;
  type: string;
  size: number;
}

/** Todo PDF válido empieza por "%PDF-". */
export function hasPdfSignature(head: Uint8Array): boolean {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  return head.length >= signature.length && signature.every((byte, i) => head[i] === byte);
}

/**
 * Devuelve el mensaje de error (en español) o null si el PDF es aceptable.
 * `head` = primeros bytes del archivo (con 5 basta).
 */
export function checkReceiptPdf(file: PdfFileInfo, head: Uint8Array): string | null {
  if (file.size === 0) return "El PDF está vacío.";
  if (file.size > RECEIPT_PDF_MAX_BYTES) return "El PDF es demasiado grande (máximo 15 MB).";

  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) return "El archivo adjunto debe ser un PDF.";

  if (!hasPdfSignature(head)) return "El archivo adjunto no parece un PDF válido.";
  return null;
}

/** SHA-256 en hexadecimal (Web Crypto: disponible en el navegador y en Node). */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = bytes instanceof Uint8Array ? (bytes.slice().buffer as ArrayBuffer) : bytes;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
