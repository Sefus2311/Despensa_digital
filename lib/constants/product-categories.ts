// Única fuente de verdad para las categorías de producto en el frontend.
// Debe mantenerse en el mismo orden y con los mismos literales que el enum
// `product_category` de supabase/migrations/0013_product_categories.sql /
// 0014_rename_hogar_category.sql — esas migraciones son la fuente de verdad
// equivalente en la base de datos.
export const PRODUCT_CATEGORIES = [
  "ALIMENTACIÓN",
  "BEBIDAS",
  "HIGIENE PERSONAL",
  "LIMPIEZA",
  "MASCOTAS",
  "HOGAR",
  "VARIOS",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const DEFAULT_PRODUCT_CATEGORY: ProductCategory = "VARIOS";

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

// Slug de cada categoría — coincide con el nombre de fichero (sin extensión)
// de su imagen en /public/images/categories/. Se usa también como valor del
// parámetro ?categoria= de "Mi despensa" para no tener que url-encodear la
// tilde/espacios del literal de categoría en el enlace.
export const CATEGORY_SLUG: Record<ProductCategory, string> = {
  "ALIMENTACIÓN": "alimentacion",
  "BEBIDAS": "bebidas",
  "HIGIENE PERSONAL": "higiene-personal",
  "LIMPIEZA": "limpieza",
  "MASCOTAS": "mascotas",
  "HOGAR": "hogar",
  "VARIOS": "varios",
};

export function categoryFromSlug(slug: string): ProductCategory | null {
  const found = PRODUCT_CATEGORIES.find((category) => CATEGORY_SLUG[category] === slug);
  return found ?? null;
}

// Ilustración grande de cada categoría en la vista de "Mi despensa"
// (/public/images/categories/*.png) — deben ser exactamente estos PNG, no
// iconos ni emojis.
export const CATEGORY_IMAGE: Record<ProductCategory, string> = Object.fromEntries(
  PRODUCT_CATEGORIES.map((category) => [category, `/images/categories/${CATEGORY_SLUG[category]}.png`])
) as Record<ProductCategory, string>;
