import { describe, expect, it } from "vitest";
import { isProductCategory, PRODUCT_CATEGORIES } from "./product-categories";

describe("PRODUCT_CATEGORIES", () => {
  it("es exactamente la lista oficial de 7 categorías, en mayúsculas", () => {
    expect(PRODUCT_CATEGORIES).toEqual([
      "ALIMENTACIÓN",
      "BEBIDAS",
      "HIGIENE PERSONAL",
      "LIMPIEZA",
      "CONSUMIBLES DEL HOGAR",
      "MASCOTAS",
      "VARIOS",
    ]);
  });
});

describe("isProductCategory", () => {
  it("acepta las 7 categorías oficiales", () => {
    for (const category of PRODUCT_CATEGORIES) {
      expect(isProductCategory(category)).toBe(true);
    }
  });

  it("rechaza categorías arbitrarias fuera de la lista", () => {
    expect(isProductCategory("Lácteos")).toBe(false);
    expect(isProductCategory("alimentación")).toBe(false);
    expect(isProductCategory("INVENTADA")).toBe(false);
    expect(isProductCategory("")).toBe(false);
    expect(isProductCategory(null)).toBe(false);
    expect(isProductCategory(undefined)).toBe(false);
  });
});
