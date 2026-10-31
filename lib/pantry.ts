import { isProductCategory, type ProductCategory } from "@/lib/constants/product-categories";
import { capitalizeFirstLetter } from "@/lib/format";
import { canonicalizeUnit } from "@/lib/units";
import type { HomePantryItem, PantryItemEdit } from "@/lib/types/database";

// stock = cantidad_comprada × unidades_por_pack (1 si el producto no es pack,
// p.ej. una pieza suelta o algo vendido a peso/volumen -- ver
// supabase/migrations/0013_product_categories.sql, que es quien decide qué
// package_quantity llega aquí).
export function computeStockQuantity(
  purchasedQuantity: number,
  packageQuantity: number | null
): number {
  return purchasedQuantity * (packageQuantity ?? 1);
}

// "CATEGORÍA · MARCA", o solo "CATEGORÍA" si no hay marca (sin separador).
export function formatCategoryBrandLine(category: ProductCategory, brand: string | null): string {
  const trimmedBrand = brand?.trim();
  return trimmedBrand ? `${category} · ${trimmedBrand.toUpperCase()}` : category;
}

export interface PantryItemInput {
  name: string;
  category: ProductCategory;
  brand: string;
  stock: number;
  unit: string | null;
}

// numeric(10, 3) de pantry_item_edits.stock_quantity.
const MAX_STOCK = 9_999_999;

function roundStock(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Valida lo que llega del formulario de edición; el 0 es válido (artículo agotado). */
export function parsePantryItemInput(raw: {
  name: string;
  category: string;
  brand: string;
  stock: string;
  unit: string;
}): { value: PantryItemInput } | { error: string } {
  const name = raw.name.trim();
  if (!name) return { error: "Escribe el nombre del producto." };
  if (!isProductCategory(raw.category)) return { error: "Selecciona una categoría válida." };

  const stock = raw.stock.trim() === "" ? NaN : Number(raw.stock);
  if (!Number.isFinite(stock) || stock < 0 || stock > MAX_STOCK) {
    return { error: "Escribe una cantidad disponible válida (0 o más)." };
  }

  return {
    value: {
      name: capitalizeFirstLetter(name),
      category: raw.category,
      brand: raw.brand.trim(),
      stock: roundStock(stock),
      unit: canonicalizeUnit(raw.unit),
    },
  };
}

/**
 * Traduce el formulario a la fila de pantry_item_edits. Un campo igual al dato
 * original se guarda como null (heredar): así renombrar un producto no congela
 * su cantidad ni su categoría, y volver al valor original deshace la corrección.
 */
export function buildPantryItemEdit(
  item: HomePantryItem,
  input: PantryItemInput
): Pick<
  PantryItemEdit,
  "display_name" | "category" | "brand" | "stock_quantity" | "stock_unit" | "stock_receipt_id"
> {
  const purchaseStock = roundStock(
    computeStockQuantity(item.purchase_quantity, item.purchase_package_quantity)
  );
  const stockChanged =
    input.stock !== purchaseStock || input.unit !== canonicalizeUnit(item.purchase_unit);

  return {
    display_name: input.name === capitalizeFirstLetter(item.catalog_name) ? null : input.name,
    category: input.category === item.catalog_category ? null : input.category,
    brand: input.brand === (item.catalog_brand?.trim() ?? "") ? null : input.brand,
    stock_quantity: stockChanged ? input.stock : null,
    stock_unit: stockChanged ? input.unit : null,
    stock_receipt_id: stockChanged ? item.receipt_id : null,
  };
}
