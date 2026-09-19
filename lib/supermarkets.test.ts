import { describe, expect, it } from "vitest";
import {
  buildSupermarketOptions,
  normalizeOptionalSupermarketName,
  normalizeSupermarketName,
} from "./supermarkets";

describe("normalizeSupermarketName", () => {
  it("pasa a mayúsculas sea cual sea la capitalización de entrada", () => {
    expect(normalizeSupermarketName("Mercadona")).toBe("MERCADONA");
    expect(normalizeSupermarketName("mercadona")).toBe("MERCADONA");
    expect(normalizeSupermarketName("mErCaDoNa")).toBe("MERCADONA");
    expect(normalizeSupermarketName("Bonpreu")).toBe("BONPREU");
  });

  it("recorta y colapsa espacios", () => {
    expect(normalizeSupermarketName("  El   Corte Inglés ")).toBe("EL CORTE INGLÉS");
  });

  it("conserva las tildes, Ñ y Ç en mayúscula", () => {
    expect(normalizeSupermarketName("áéíóú")).toBe("ÁÉÍÓÚ");
    expect(normalizeSupermarketName("ñandú")).toBe("ÑANDÚ");
    expect(normalizeSupermarketName("Plaça Ç")).toBe("PLAÇA Ç");
  });

  it("es idempotente", () => {
    const once = normalizeSupermarketName("Consum Ñu");
    expect(normalizeSupermarketName(once)).toBe(once);
  });
});

describe("normalizeOptionalSupermarketName", () => {
  it("devuelve null para vacío, espacios o ausente", () => {
    expect(normalizeOptionalSupermarketName("")).toBeNull();
    expect(normalizeOptionalSupermarketName("   ")).toBeNull();
    expect(normalizeOptionalSupermarketName(null)).toBeNull();
    expect(normalizeOptionalSupermarketName(undefined)).toBeNull();
  });

  it("normaliza cuando hay valor", () => {
    expect(normalizeOptionalSupermarketName(" lidl ")).toBe("LIDL");
  });
});

describe("buildSupermarketOptions", () => {
  it("deduplica variantes de mayúsculas y ordena alfabéticamente", () => {
    expect(
      buildSupermarketOptions(["Mercadona", "MERCADONA", "mercadona", "Lidl", "Bonpreu", "condis"])
    ).toEqual(["BONPREU", "CONDIS", "LIDL", "MERCADONA"]);
  });

  it("ignora vacíos y nulos", () => {
    expect(buildSupermarketOptions([null, undefined, "", "  ", "Dia"])).toEqual(["DIA"]);
  });

  it("ordena respetando el locale español (Ñ después de N)", () => {
    expect(buildSupermarketOptions(["Óptimo", "Ñu", "Nova", "Zeta"])).toEqual(["NOVA", "ÑU", "ÓPTIMO", "ZETA"]);
  });
});
