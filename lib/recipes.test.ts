import { describe, expect, it } from "vitest";
import {
  classifyIngredient,
  decidableIngredients,
  findUndecidedIngredients,
  isShoppableIngredient,
  scaleIngredients,
  scaleQuantity,
  selectIngredientsToBuy,
  toBaseUnits,
  summarizeAvailability,
  type CookingDecision,
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

describe("flujo de decisión TENGO/COMPRAR de 'Quiero cocinar esto'", () => {
  const arroz = ingredient({ id: "arroz", producto_id: "prod-arroz", nombre_mostrado: "Arroz", cantidad: 300, unidad: "gr." });
  const cebolla = ingredient({ id: "cebolla", producto_id: null, nombre_mostrado: "Cebolla", cantidad: 2, unidad: "ud." });
  const sal = ingredient({ id: "sal", producto_id: "prod-sal", nombre_mostrado: "Sal", cantidad: null, unidad: "al gusto" });

  describe("decidableIngredients", () => {
    it("solo incluye ingredientes con unidad comprable (ud./gr./ml.), tengan o no producto normalizado", () => {
      expect(decidableIngredients([arroz, cebolla, sal])).toEqual([arroz, cebolla]);
    });
  });

  describe("findUndecidedIngredients", () => {
    it("Caso F: devuelve los decidibles que todavía no tienen TENGO ni COMPRAR", () => {
      expect(findUndecidedIngredients([arroz, cebolla, sal], {})).toEqual([arroz, cebolla]);
      expect(findUndecidedIngredients([arroz, cebolla, sal], { arroz: "tengo" })).toEqual([cebolla]);
      expect(findUndecidedIngredients([arroz, cebolla, sal], { arroz: "tengo", cebolla: "comprar" })).toEqual([]);
    });

    it("un ingrediente no comprable (sal, al gusto) nunca aparece como pendiente de decidir", () => {
      expect(findUndecidedIngredients([sal], {})).toEqual([]);
    });
  });

  describe("selectIngredientsToBuy", () => {
    it("Caso A: normalizado + TENGO -> no se selecciona para comprar", () => {
      expect(selectIngredientsToBuy([arroz], { arroz: "tengo" })).toEqual([]);
    });

    it("Caso B: normalizado + COMPRAR -> se selecciona con su cantidad y unidad", () => {
      const seleccion = selectIngredientsToBuy([arroz], { arroz: "comprar" });
      expect(seleccion).toEqual([arroz]);
      expect(seleccion[0]).toMatchObject({ cantidad: 300, unidad: "gr.", producto_id: "prod-arroz" });
    });

    it("Caso C: sin producto normalizado + TENGO -> no bloquea la decisión y no se selecciona", () => {
      expect(selectIngredientsToBuy([cebolla], { cebolla: "tengo" })).toEqual([]);
    });

    it("Caso D: sin producto normalizado + COMPRAR -> se selecciona igualmente (producto_id null se conserva)", () => {
      const seleccion = selectIngredientsToBuy([cebolla], { cebolla: "comprar" });
      expect(seleccion).toEqual([cebolla]);
      expect(seleccion[0].producto_id).toBeNull();
    });

    it("Caso G: cambiar la decisión (COMPRAR -> TENGO) cambia el resultado", () => {
      const decisiones: Partial<Record<string, CookingDecision>> = { arroz: "comprar" };
      expect(selectIngredientsToBuy([arroz], decisiones)).toEqual([arroz]);
      decisiones.arroz = "tengo";
      expect(selectIngredientsToBuy([arroz], decisiones)).toEqual([]);
    });

    it("un ingrediente no comprable (sal, al gusto) nunca se envía a la lista aunque se le asigne una decisión", () => {
      expect(selectIngredientsToBuy([sal], { sal: "comprar" })).toEqual([]);
    });

    it("sin ninguna decisión, no selecciona nada", () => {
      expect(selectIngredientsToBuy([arroz, cebolla], {})).toEqual([]);
    });
  });
});
