import { describe, expect, it } from "vitest";
import { formatCurrency } from "./format";

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
