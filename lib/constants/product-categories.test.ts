import { describe, expect, it } from "vitest";
import {
  CATEGORY_IMAGE,
  CATEGORY_SLUG,
  categoryFromSlug,
  isProductCategory,
  PRODUCT_CATEGORIES,
} from "./product-categories";

describe("PRODUCT_CATEGORIES", () => {
  it("es exactamente la lista oficial de 7 categorías, en mayúsculas", () => {
    expect(PRODUCT_CATEGORIES).toEqual([
      "ALIMENTACIÓN",
      "BEBIDAS",
      "HIGIENE PERSONAL",
      "LIMPIEZA",
      "MASCOTAS",
      "HOGAR",
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
    expect(isProductCategory("CONSUMIBLES DEL HOGAR")).toBe(false);
    expect(isProductCategory("INVENTADA")).toBe(false);
    expect(isProductCategory("")).toBe(false);
    expect(isProductCategory(null)).toBe(false);
    expect(isProductCategory(undefined)).toBe(false);
  });
});

describe("CATEGORY_SLUG / categoryFromSlug", () => {
  it("cada categoría tiene un slug y round-tripea a través de categoryFromSlug", () => {
    for (const category of PRODUCT_CATEGORIES) {
      const slug = CATEGORY_SLUG[category];
      expect(slug).toBeTruthy();
      expect(categoryFromSlug(slug)).toBe(category);
    }
  });

  it("HIGIENE PERSONAL usa el slug con guion, no con espacio", () => {
    expect(CATEGORY_SLUG["HIGIENE PERSONAL"]).toBe("higiene-personal");
  });

  it("un slug desconocido no resuelve a ninguna categoría", () => {
    expect(categoryFromSlug("no-existe")).toBeNull();
  });
});

describe("CATEGORY_IMAGE", () => {
  it("cada categoría apunta a su PNG exacto en /images/categories/", () => {
    expect(CATEGORY_IMAGE).toEqual({
      "ALIMENTACIÓN": "/images/categories/alimentacion.png",
      "BEBIDAS": "/images/categories/bebidas.png",
      "HIGIENE PERSONAL": "/images/categories/higiene-personal.png",
      "LIMPIEZA": "/images/categories/limpieza.png",
      "MASCOTAS": "/images/categories/mascotas.png",
      "HOGAR": "/images/categories/hogar.png",
      "VARIOS": "/images/categories/varios.png",
    });
  });
});
