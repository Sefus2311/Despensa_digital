// Única fuente de verdad para las categorías de producto en el frontend.
// Debe mantenerse en el mismo orden y con los mismos literales que el enum
// `product_category` de supabase/migrations/0013_product_categories.sql —
// esa migración es la fuente de verdad equivalente en la base de datos.
export const PRODUCT_CATEGORIES = [
  "ALIMENTACIÓN",
  "BEBIDAS",
  "HIGIENE PERSONAL",
  "LIMPIEZA",
  "CONSUMIBLES DEL HOGAR",
  "MASCOTAS",
  "VARIOS",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const DEFAULT_PRODUCT_CATEGORY: ProductCategory = "VARIOS";

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}
