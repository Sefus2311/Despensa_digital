import { describe, expect, it } from "vitest";
import {
  RECETA_FOTOS_MAX,
  RECETA_FOTO_MAX_BYTES,
  checkRecetaFoto,
  extensionForImageType,
  hasImageSignature,
} from "./receta-fotos";

const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP_HEAD = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBP"),
]);

describe("hasImageSignature", () => {
  it("reconoce JPEG, PNG y WebP", () => {
    expect(hasImageSignature(JPEG_HEAD)).toBe(true);
    expect(hasImageSignature(PNG_HEAD)).toBe(true);
    expect(hasImageSignature(WEBP_HEAD)).toBe(true);
  });

  it("rechaza contenido que no es ninguna de las tres firmas", () => {
    expect(hasImageSignature(new TextEncoder().encode("no es una imagen"))).toBe(false);
    expect(hasImageSignature(new Uint8Array([0xff, 0xd8]))).toBe(false); // JPEG truncado
  });
});

describe("checkRecetaFoto", () => {
  const foto = { name: "plato.jpg", type: "image/jpeg", size: 200_000 };

  it("acepta una foto normal cuando aún caben más", () => {
    expect(checkRecetaFoto(foto, JPEG_HEAD, 0)).toBeNull();
    expect(checkRecetaFoto(foto, JPEG_HEAD, 2)).toBeNull();
  });

  it("rechaza una cuarta foto (Intento de cuarta foto)", () => {
    expect(checkRecetaFoto(foto, JPEG_HEAD, RECETA_FOTOS_MAX)).toMatch(/máximo de 3 fotos/);
  });

  it("rechaza un archivo vacío", () => {
    expect(checkRecetaFoto({ ...foto, size: 0 }, JPEG_HEAD, 0)).toMatch(/vacía/);
  });

  it("rechaza una foto demasiado grande", () => {
    expect(checkRecetaFoto({ ...foto, size: RECETA_FOTO_MAX_BYTES + 1 }, JPEG_HEAD, 0)).toMatch(
      /demasiado grande/
    );
    expect(checkRecetaFoto({ ...foto, size: RECETA_FOTO_MAX_BYTES }, JPEG_HEAD, 0)).toBeNull();
  });

  it("rechaza un formato distinto de JPEG/PNG/WEBP", () => {
    expect(checkRecetaFoto({ name: "doc.pdf", type: "application/pdf", size: 1000 }, JPEG_HEAD, 0)).toMatch(
      /JPEG, PNG o WEBP/
    );
  });

  it("acepta sin tipo MIME si la extensión es de imagen (algunos navegadores no lo informan)", () => {
    expect(checkRecetaFoto({ name: "plato.png", type: "", size: 1000 }, PNG_HEAD, 0)).toBeNull();
  });

  it("rechaza un .jpg cuyo contenido no es realmente una imagen", () => {
    const textoPlano = new TextEncoder().encode("esto no es una foto");
    expect(checkRecetaFoto(foto, textoPlano, 0)).toMatch(/no parece una imagen válida/);
  });
});

describe("extensionForImageType", () => {
  it("mapea cada tipo MIME a su extensión", () => {
    expect(extensionForImageType("image/png")).toBe("png");
    expect(extensionForImageType("image/webp")).toBe("webp");
    expect(extensionForImageType("image/jpeg")).toBe("jpg");
    expect(extensionForImageType("")).toBe("jpg");
  });
});
