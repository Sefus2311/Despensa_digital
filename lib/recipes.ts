import type { RecetaIngrediente } from "@/lib/types/database";

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
    ingredient.cantidad != null && ingredient.unidad != null && ingredient.unidad === pantryRow.unit;

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
