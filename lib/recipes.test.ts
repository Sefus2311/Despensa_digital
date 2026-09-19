import { describe, expect, it } from "vitest";
import {
  classifyIngredient,
  isShoppableIngredient,
  scaleIngredients,
  scaleQuantity,
  toBaseUnits,
  summarizeAvailability,
  type PantryStockRow,
} from "./recipes";
import { canonicalizeUnit } from "./units";
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

describe("isShoppableIngredient (filtro de la lista de la compra)", () => {
  it("2 ud. Limón -> se añade", () => {
    expect(isShoppableIngredient(ingredient({ nombre_mostrado: "Limón", cantidad: 2, unidad: "ud." }))).toBe(true);
  });
  it("300 gr. Gambas -> se añade", () => {
    expect(isShoppableIngredient(ingredient({ nombre_mostrado: "Gambas", cantidad: 300, unidad: "gr." }))).toBe(true);
  });
  it("500 ml. Leche -> se añade", () => {
    expect(isShoppableIngredient(ingredient({ nombre_mostrado: "Leche", cantidad: 500, unidad: "ml." }))).toBe(true);
  });
  it("Pimienta al gusto -> NO se añade", () => {
    expect(isShoppableIngredient(ingredient({ nombre_mostrado: "Pimienta", unidad: "al gusto" }))).toBe(false);
  });
  it("Perejil pellizco -> NO se añade", () => {
    expect(isShoppableIngredient(ingredient({ nombre_mostrado: "Perejil", cantidad: 1, unidad: "pellizco" }))).toBe(false);
  });
  it("Aceite cucharadas -> NO se añade", () => {
    expect(isShoppableIngredient(ingredient({ nombre_mostrado: "Aceite", cantidad: 10, unidad: "cucharadas" }))).toBe(false);
  });
  it("acepta variantes históricas de las tres unidades (g, unidad, ML)", () => {
    expect(isShoppableIngredient(ingredient({ unidad: "g" }))).toBe(true);
    expect(isShoppableIngredient(ingredient({ unidad: "unidad" }))).toBe(true);
    expect(isShoppableIngredient(ingredient({ unidad: "ML" }))).toBe(true);
  });
  it("sin unidad -> NO se añade", () => {
    expect(isShoppableIngredient(ingredient({ unidad: null }))).toBe(false);
  });
});

describe("escalado por raciones", () => {
  const receta = [
    ingredient({ id: "a", nombre_mostrado: "Tomates cherry", cantidad: 300, unidad: "gr." }),
    ingredient({ id: "b", nombre_mostrado: "Gambas", cantidad: 350, unidad: "gr." }),
    ingredient({ id: "c", nombre_mostrado: "Tallarines", cantidad: 400, unidad: "gr." }),
  ];

  it("fórmula: cantidad × deseadas / base", () => {
    expect(scaleQuantity(300, 4, 8)).toBe(600);
    expect(scaleQuantity(350, 4, 6)).toBe(525);
    expect(scaleQuantity(100, 4, 1)).toBe(25);
  });

  it("de 4 a 8 raciones: todo exactamente ×2 (300/350/400 -> 600/700/800)", () => {
    expect(scaleIngredients(receta, 4, 8).map((i) => i.cantidad)).toEqual([600, 700, 800]);
  });

  it("mismas raciones: cantidades idénticas (factor ×1)", () => {
    expect(scaleIngredients(receta, 4, 4).map((i) => i.cantidad)).toEqual([300, 350, 400]);
  });

  it("ingredientes consecutivos son independientes: la cantidad de uno no afecta al siguiente", () => {
    const escalados = scaleIngredients(receta, 4, 8);
    expect(escalados[1].cantidad).toBe(700);
    // el mismo ingrediente escalado solo, fuera de la lista, da lo mismo
    expect(scaleQuantity(350, 4, 8)).toBe(escalados[1].cantidad);
    // y el orden de la lista no altera ningún resultado
    const invertidos = scaleIngredients([...receta].reverse(), 4, 8).map((i) => i.cantidad);
    expect(invertidos).toEqual([800, 700, 600]);
  });

  it("no muta los ingredientes originales", () => {
    scaleIngredients(receta, 4, 8);
    expect(receta.map((i) => i.cantidad)).toEqual([300, 350, 400]);
  });

  it("sin cantidad -> sigue sin cantidad", () => {
    expect(scaleQuantity(null, 4, 8)).toBeNull();
  });
});

describe("flujo receta -> escalado -> filtro -> líneas de la lista", () => {
  it("solo genera líneas para ud./gr./ml., escaladas y con unidad estándar", () => {
    const receta = [
      ingredient({ id: "1", nombre_mostrado: "Limón", cantidad: 2, unidad: "unidad" }),
      ingredient({ id: "2", nombre_mostrado: "Gambas", cantidad: 350, unidad: "g" }),
      ingredient({ id: "3", nombre_mostrado: "Leche", cantidad: 500, unidad: "ml" }),
      ingredient({ id: "4", nombre_mostrado: "Aceite", cantidad: 10, unidad: "cucharadas" }),
      ingredient({ id: "5", nombre_mostrado: "Sal", cantidad: null, unidad: "al gusto" }),
    ];
    const summary = summarizeAvailability(scaleIngredients(receta, 4, 8), []);
    const lineas = summary.missingRequired
      .filter((c) => isShoppableIngredient(c.ingredient))
      .map((c) => ({
        nombre: c.ingredient.nombre_mostrado,
        cantidad: c.missingQuantity ?? c.ingredient.cantidad,
        unidad: canonicalizeUnit(c.ingredient.unidad),
      }));

    expect(lineas).toEqual([
      { nombre: "Limón", cantidad: 4, unidad: "ud." },
      { nombre: "Gambas", cantidad: 700, unidad: "gr." },
      { nombre: "Leche", cantidad: 1000, unidad: "ml." },
    ]);
  });
});

describe("classifyIngredient con variantes de unidad", () => {
  it("'g' de la receta y 'gr.' de la despensa se comparan como la misma unidad", () => {
    const pollo = ingredient({ producto_id: "pollo", cantidad: 500, unidad: "g" });
    const pantry: PantryStockRow[] = [{ canonical_product_id: "pollo", stock: 250, unit: "gr." }];
    const check = classifyIngredient(pollo, pantry);
    expect(check.availability).toBe("parcial");
    expect(check.missingQuantity).toBe(250);
  });
});

describe("kg/l convertidos a gr./ml. antes de comparar y de generar la lista", () => {
  it("1.5 kg de patata (receta) vs 1000 gr. en despensa -> parcial, faltan 500 gr.", () => {
    const [patata] = toBaseUnits([ingredient({ producto_id: "patata", cantidad: 1.5, unidad: "kg" })]);
    expect(patata).toMatchObject({ cantidad: 1500, unidad: "gr." });
    const check = classifyIngredient(patata, [{ canonical_product_id: "patata", stock: 1000, unit: "gr." }]);
    expect(check.availability).toBe("parcial");
    expect(check.missingQuantity).toBe(500);
    expect(isShoppableIngredient(patata)).toBe(true);
  });

  it("0.5 l de leche -> 500 ml. y se añade a la lista", () => {
    const [leche] = toBaseUnits([ingredient({ cantidad: 0.5, unidad: "l" })]);
    expect(leche).toMatchObject({ cantidad: 500, unidad: "ml." });
    expect(isShoppableIngredient(leche)).toBe(true);
  });

  it("no muta los ingredientes originales", () => {
    const original = [ingredient({ cantidad: 2, unidad: "kg" })];
    toBaseUnits(original);
    expect(original[0]).toMatchObject({ cantidad: 2, unidad: "kg" });
  });
});
