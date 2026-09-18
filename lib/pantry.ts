import type { ProductCategory } from "@/lib/constants/product-categories";

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
