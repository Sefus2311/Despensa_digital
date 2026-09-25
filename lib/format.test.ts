import { describe, expect, it } from "vitest";
import { capitalizeFirstLetter, formatCurrency } from "./format";

// Intl.NumberFormat("es-ES", { style: "currency" }) separa el símbolo con un
// espacio de no separación (U+00A0), no un espacio normal.
const NBSP = " ";

describe("formatCurrency", () => {
  it("formatea cantidades sin millares", () => {
    expect(formatCurrency(327.45)).toBe(`327,45${NBSP}€`);
  });

  it("agrupa los millares con punto", () => {
    expect(formatCurrency(3842.7)).toBe(`3.842,70${NBSP}€`);
  });

  it("formatea cero", () => {
    expect(formatCurrency(0)).toBe(`0,00${NBSP}€`);
  });

  it("trata null/undefined como cero (sin compras)", () => {
    expect(formatCurrency(null)).toBe(`0,00${NBSP}€`);
    expect(formatCurrency(undefined)).toBe(`0,00${NBSP}€`);
  });

  it("redondea a dos decimales", () => {
    expect(formatCurrency(1234.567)).toBe(`1.234,57${NBSP}€`);
  });
});

describe("capitalizeFirstLetter", () => {
  it("primera letra en mayúscula, el resto en minúsculas, sea cual sea la entrada", () => {
    expect(capitalizeFirstLetter("atún claro en aceite de oliva")).toBe("Atún claro en aceite de oliva");
    expect(capitalizeFirstLetter("ATÚN CLARO")).toBe("Atún claro");
    expect(capitalizeFirstLetter("AtÚn ClArO")).toBe("Atún claro");
  });

  it("es idempotente", () => {
    const once = capitalizeFirstLetter("leche entera");
    expect(capitalizeFirstLetter(once)).toBe(once);
  });

  it("conserva Á É Í Ó Ú Ñ Ç en mayúscula inicial", () => {
    expect(capitalizeFirstLetter("óptimo")).toBe("Óptimo");
    expect(capitalizeFirstLetter("ñu")).toBe("Ñu");
    expect(capitalizeFirstLetter("çapata")).toBe("Çapata");
  });

  it("cadena vacía -> vacía; no lanza con un solo carácter", () => {
    expect(capitalizeFirstLetter("")).toBe("");
    expect(capitalizeFirstLetter("a")).toBe("A");
  });
});
