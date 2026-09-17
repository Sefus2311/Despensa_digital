import { describe, expect, it } from "vitest";
import { parseAliasEditInput } from "./validation";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseAliasEditInput", () => {
  it("rechaza un nombre canónico vacío", () => {
    const result = parseAliasEditInput(formData({ canonical_name: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("El nombre del producto no puede estar vacío.");
  });

  it("rechaza un nombre canónico compuesto solo de espacios", () => {
    const result = parseAliasEditInput(formData({ canonical_name: "   " }));
    expect(result.ok).toBe(false);
  });

  it("rechaza una cantidad no numérica", () => {
    const result = parseAliasEditInput(
      formData({ canonical_name: "Yogur natural", package_quantity: "no-numero" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("La cantidad debe ser un número válido.");
  });

  it("rechaza una cantidad negativa", () => {
    const result = parseAliasEditInput(
      formData({ canonical_name: "Yogur natural", package_quantity: "-5" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("La cantidad debe ser un número válido.");
  });

  it("acepta un caso válido completo y recorta/normaliza los opcionales", () => {
    const result = parseAliasEditInput(
      formData({
        canonical_name: "  Yogur griego natural  ",
        category: "  Lácteos  ",
        default_unit: "",
        brand: "Hacendado",
        commercial_name: "Yogur griego 4x125g",
        package_quantity: "500",
        package_unit: "g",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        canonicalName: "Yogur griego natural",
        category: "Lácteos",
        defaultUnit: null,
        brand: "Hacendado",
        commercialName: "Yogur griego 4x125g",
        packageQuantity: 500,
        packageUnit: "g",
      });
    }
  });

  it("acepta un caso válido sin ningún campo opcional", () => {
    const result = parseAliasEditInput(formData({ canonical_name: "Leche entera" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        canonicalName: "Leche entera",
        category: null,
        defaultUnit: null,
        brand: null,
        commercialName: null,
        packageQuantity: null,
        packageUnit: null,
      });
    }
  });
});
