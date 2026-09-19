import type { RecetaIngrediente } from "@/lib/types/database";
import { isPurchasableUnit, sameUnit, toBaseUnit } from "@/lib/units";

export type IngredientAvailability = "disponible" | "parcial" | "faltante";

// Stock ya resuelto (computeStockQuantity aplicado) por producto normalizado
// -- lo construye quien llama a partir de get_home_pantry(), esta función
// no sabe nada de tickets/packs, solo compara números.
export interface PantryStockRow {
  canonical_product_id: string;
  stock: number;
  unit: string | null;
}

export interface IngredientCheck {
  ingredient: RecetaIngrediente;
  availability: IngredientAvailability;
  /** Solo cuando availability === "parcial": cuánto falta, en la unidad del ingrediente. */
  missingQuantity: number | null;
  /** false cuando el ingrediente no tiene producto_id (sin vincular a canonical_products). */
  linked: boolean;
}

// Reglas (sección 14-16 del encargo):
// - sin producto_id -> siempre "faltante" (nada contra qué comparar).
// - control_stock=false -> binario: existe o no existe en la despensa.
// - unidades que no coinciden (o falta cantidad/unidad) -> binario también,
//   nunca se inventa una conversión.
// - unidades coinciden -> compara cantidades; "parcial" si hay algo pero no
//   lo suficiente, "faltante" si no hay nada.
export function classifyIngredient(
  ingredient: RecetaIngrediente,
  pantry: PantryStockRow[]
): IngredientCheck {
  if (!ingredient.producto_id) {
    return { ingredient, availability: "faltante", missingQuantity: null, linked: false };
  }

  const pantryRow = pantry.find((p) => p.canonical_product_id === ingredient.producto_id);

  if (!ingredient.control_stock) {
    return {
      ingredient,
      availability: pantryRow ? "disponible" : "faltante",
      missingQuantity: null,
      linked: true,
    };
  }

  if (!pantryRow) {
    return { ingredient, availability: "faltante", missingQuantity: ingredient.cantidad, linked: true };
  }

  const comparableQuantities =
    ingredient.cantidad != null && ingredient.unidad != null && sameUnit(ingredient.unidad, pantryRow.unit);

  if (!comparableQuantities) {
    return { ingredient, availability: "disponible", missingQuantity: null, linked: true };
  }

  if (pantryRow.stock >= ingredient.cantidad!) {
    return { ingredient, availability: "disponible", missingQuantity: null, linked: true };
  }

  return {
    ingredient,
    availability: pantryRow.stock > 0 ? "parcial" : "faltante",
    missingQuantity: ingredient.cantidad! - pantryRow.stock,
    linked: true,
  };
}

export interface AvailabilitySummary {
  checks: IngredientCheck[];
  missingRequired: IngredientCheck[];
  missingOptional: IngredientCheck[];
  /** Sin faltantes/parciales obligatorios -- los opcionales nunca lo impiden. */
  canCook: boolean;
}

export function summarizeAvailability(
  ingredients: RecetaIngrediente[],
  pantry: PantryStockRow[]
): AvailabilitySummary {
  const checks = ingredients.map((ingredient) => classifyIngredient(ingredient, pantry));
  const missing = checks.filter((c) => c.availability !== "disponible");
  const missingRequired = missing.filter((c) => !c.ingredient.opcional);
  const missingOptional = missing.filter((c) => c.ingredient.opcional);
  return { checks, missingRequired, missingOptional, canCook: missingRequired.length === 0 };
}

/**
 * Escalado por raciones: cantidadNecesaria = cantidadReceta × racionesDeseadas / racionesBaseReceta.
 * Función pura, un ingrediente cada vez (no comparte estado entre llamadas).
 * Sin cantidad -> null. Redondea a 2 decimales para evitar ruido de coma flotante.
 */
export function scaleQuantity(
  cantidad: number | null,
  racionesBase: number,
  racionesDeseadas: number
): number | null {
  if (cantidad == null) return null;
  if (!(racionesBase > 0) || !(racionesDeseadas > 0)) return cantidad;
  return Math.round(((cantidad * racionesDeseadas) / racionesBase) * 100) / 100;
}

/** Devuelve copias de los ingredientes con la cantidad escalada; no muta los originales. */
export function scaleIngredients(
  ingredients: RecetaIngrediente[],
  racionesBase: number,
  racionesDeseadas: number
): RecetaIngrediente[] {
  return ingredients.map((ing) => ({
    ...ing,
    cantidad: scaleQuantity(ing.cantidad, racionesBase, racionesDeseadas),
  }));
}

/** Copias con kg -> gr. y l -> ml. aplicados (ver toBaseUnit); no muta los originales. */
export function toBaseUnits(ingredients: RecetaIngrediente[]): RecetaIngrediente[] {
  return ingredients.map((ing) => {
    const { cantidad, unidad } = toBaseUnit(ing.cantidad, ing.unidad);
    return { ...ing, cantidad, unidad };
  });
}

/**
 * Regla única de qué ingrediente puede generar una línea en la lista de la
 * compra: solo si su unidad es ud., gr. o ml. (cualquier variante). Las
 * unidades culinarias (cucharada, pellizco, al gusto...) o la ausencia de
 * unidad no generan línea. Solo afecta a la lista: la receta no se modifica.
 */
export function isShoppableIngredient(ingredient: Pick<RecetaIngrediente, "unidad">): boolean {
  return isPurchasableUnit(ingredient.unidad);
}
