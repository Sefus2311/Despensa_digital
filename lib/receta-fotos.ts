// Reglas de las fotografías de receta. Lógica pura (sin Supabase): la usan
// tanto el componente cliente (feedback inmediato al elegir el archivo) como
// las Server Actions (comprobación autoritativa) -- mismo patrón que
// lib/receipt-import/pdf.ts para el PDF de un ticket.

export const RECETA_FOTOS_MAX = 3;
export const RECETA_FOTO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB (tope de red de seguridad; el cliente redimensiona antes de subir)
export const RECETA_FOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface RecetaFotoFileInfo {
  name: string;
  type: string;
  size: number;
}

const SIGNATURES: { type: (typeof RECETA_FOTO_ALLOWED_TYPES)[number]; bytes: number[] }[] = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** Los primeros bytes que hace falta leer para reconocer cualquiera de los tres formatos (WebP incluido). */
export const RECETA_FOTO_SIGNATURE_BYTES = 12;

/** JPEG (FFD8FF), PNG (firma de 8 bytes) o WebP ("RIFF"...."WEBP"). */
export function hasImageSignature(head: Uint8Array): boolean {
  const matchesJpegOrPng = SIGNATURES.some(
    ({ bytes }) => head.length >= bytes.length && bytes.every((byte, i) => head[i] === byte)
  );
  if (matchesJpegOrPng) return true;

  if (head.length < 12) return false;
  const ascii = (start: number, end: number) => String.fromCharCode(...head.subarray(start, end));
  return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

/** Devuelve el mensaje de error (español, listo para el usuario) o null si la foto es aceptable. */
export function checkRecetaFoto(
  file: RecetaFotoFileInfo,
  head: Uint8Array,
  fotosActuales: number
): string | null {
  if (fotosActuales >= RECETA_FOTOS_MAX) {
    return `Esta receta ya tiene el máximo de ${RECETA_FOTOS_MAX} fotos.`;
  }
  if (file.size === 0) return "La foto está vacía.";
  if (file.size > RECETA_FOTO_MAX_BYTES) {
    return `La foto es demasiado grande (máximo ${RECETA_FOTO_MAX_BYTES / (1024 * 1024)} MB).`;
  }

  const looksLikeImage =
    (RECETA_FOTO_ALLOWED_TYPES as readonly string[]).includes(file.type) ||
    /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!looksLikeImage) return "Solo se admiten fotos en JPEG, PNG o WEBP.";

  if (!hasImageSignature(head)) return "El archivo no parece una imagen válida.";
  return null;
}

/** Extensión de archivo a partir del tipo MIME detectado (para el nombre en Storage). */
export function extensionForImageType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}
