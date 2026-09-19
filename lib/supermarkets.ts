// Única regla de normalización para nombres de supermercado. Todo punto de la
// app que persista o compare un supermercado debe pasar por aquí -- así el dato
// real almacenado queda siempre en MAYÚSCULAS (no es un efecto visual de CSS).
// Equivalente en base de datos: normalize_supermarket_name() en
// supabase/migrations/0017_supermarkets_uppercase.sql (red de seguridad).

/**
 * "  mErCaDoNa " -> "MERCADONA". Recorta, colapsa espacios internos y pasa a
 * mayúsculas conservando Á É Í Ó Ú Ü Ñ Ç (toUpperCase de JS es Unicode-aware).
 */
export function normalizeSupermarketName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Variante para valores opcionales de formulario/BD: vacío o ausente -> null.
 */
export function normalizeOptionalSupermarketName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const normalized = normalizeSupermarketName(name);
  return normalized === "" ? null : normalized;
}

/**
 * Lista para el selector de supermercado: normaliza cada nombre, elimina
 * duplicados ("Mercadona" / "MERCADONA" / "mercadona" son el mismo) y ordena
 * alfabéticamente (locale es).
 */
export function buildSupermarketOptions(names: (string | null | undefined)[]): string[] {
  const unique = new Set<string>();
  for (const name of names) {
    const normalized = normalizeOptionalSupermarketName(name);
    if (normalized) unique.add(normalized);
  }
  return [...unique].sort((a, b) => a.localeCompare(b, "es"));
}
