import { describe, expect, it } from "vitest";
import { classifyIngredient, summarizeAvailability, type PantryStockRow } from "./recipes";
import type { RecetaIngrediente } from "./types/database";

function ingredient(overrides: Partial<RecetaIngrediente>): RecetaIngrediente {
  return {
    id: "ing-1",
    receta_id: "receta-1",
    producto_id: "prod-1",
    nombre_mostrado: "Ingrediente",
    cantidad: null,
    unidad: null,
    opcional: false,
    control_stock: true,
    orden: 0,
    notas: null,
    ...overrides,
  };
}

describe("classifyIngredient", () => {
  it("Caso A: cantidad suficiente en despensa -> disponible", () => {
    const pollo = ingredient({ producto_id: "pollo", cantidad: 500, unidad: "g" });
    const pantry: PantryStockRow[] = [{ canonical_product_id: "pollo", stock: 600, unit: "g" }];
    expect(classifyIngredient(pollo, pantry).availability).toBe("disponible");
  });

  it("Caso B: el producto no está en la despensa -> faltante", () => {
    const cebolla = ingredient({ producto_id: "cebolla", cantidad: 1, unidad: "unidad" });
    expect(classifyIngredient(cebolla, []).availability).toBe("faltante");
  });

  it("Caso C: hay menos cantidad de la necesaria -> parcial, con el déficit", () => {
    const pollo = ingredient({ producto_id: "pollo", cantidad: 500, unidad: "g" });
    const pantry: PantryStockRow[] = [{ canonical_product_id: "pollo", stock: 250, unit: "g" }];
    const check = classifyIngredient(pollo, pantry);
    expect(check.availability).toBe("parcial");
    expect(check.missingQuantity).toBe(250);
  });

  it("sin producto_id (no vinculado a canonical_products) -> siempre faltante", () => {
    const sinVincular = ingredient({ producto_id: null, nombre_mostrado: "Especia rara" });
    expect(classifyIngredient(sinVincular, []).availability).toBe("faltante");
    expect(classifyIngredient(sinVincular, []).linked).toBe(false);
  });

  it("control_stock=false: binario, no exige cantidad exacta", () => {
    const sal = ingredient({ producto_id: "sal", control_stock: false, cantidad: 5, unidad: "g" });
    const pantryConSal: PantryStockRow[] = [{ canonical_product_id: "sal", stock: 0.001, unit: "kg" }];
    // Aunque la unidad/cantidad no serían comparables, con control_stock=false
    // basta con que el producto exista en la despensa.
    expect(classifyIngredient(sal, pantryConSal).availability).toBe("disponible");
    expect(classifyIngredient(sal, []).availability).toBe("faltante");
  });

  it("unidades distintas: no convierte, trata como disponible si existe el producto", () => {
    const aceite = ingredient({ producto_id: "aceite", cantidad: 200, unidad: "ml" });
    const pantry: PantryStockRow[] = [{ canonical_product_id: "aceite", stock: 1, unit: "l" }];
    expect(classifyIngredient(aceite, pantry).availability).toBe("disponible");
  });
});

describe("summarizeAvailability", () => {
  it("Caso A: todo disponible -> canCook true, sin faltantes", () => {
    const ingredients = [
      ingredient({ producto_id: "patata", cantidad: 600, unidad: "g" }),
      ingredient({ producto_id: "huevo", cantidad: 6, unidad: "unidad" }),
    ];
    const pantry: PantryStockRow[] = [
      { canonical_product_id: "patata", stock: 1000, unit: "g" },
      { canonical_product_id: "huevo", stock: 12, unit: "unidad" },
    ];
    const summary = summarizeAvailability(ingredients, pantry);
    expect(summary.canCook).toBe(true);
    expect(summary.missingRequired).toHaveLength(0);
  });

  it("Caso B: falta 1 ingrediente obligatorio -> canCook false", () => {
    const ingredients = [
      ingredient({ producto_id: "patata", cantidad: 600, unidad: "g" }),
      ingredient({ producto_id: "cebolla", cantidad: 1, unidad: "unidad" }),
    ];
    const pantry: PantryStockRow[] = [{ canonical_product_id: "patata", stock: 1000, unit: "g" }];
    const summary = summarizeAvailability(ingredients, pantry);
    expect(summary.canCook).toBe(false);
    expect(summary.missingRequired).toHaveLength(1);
  });

  it("Caso D: falta un ingrediente opcional -> no impide cocinar", () => {
    const ingredients = [
      ingredient({ producto_id: "patata", cantidad: 600, unidad: "g" }),
      ingredient({ producto_id: "cebolla", cantidad: 1, unidad: "unidad", opcional: true }),
    ];
    const pantry: PantryStockRow[] = [{ canonical_product_id: "patata", stock: 1000, unit: "g" }];
    const summary = summarizeAvailability(ingredients, pantry);
    expect(summary.canCook).toBe(true);
    expect(summary.missingRequired).toHaveLength(0);
    expect(summary.missingOptional).toHaveLength(1);
  });
});
