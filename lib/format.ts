// Formato monetario compartido por la app (es-ES, EUR). `useGrouping: true` es
// necesario de forma explícita: en Node, Intl.NumberFormat("es-ES", { style:
// "currency" }) NO agrupa millares por defecto (useGrouping: "auto" no agrupa
// para este locale+style), así que sin forzarlo "3842.7" saldría "3842,70 €"
// en vez de "3.842,70 €".
const CURRENCY_FORMATTER = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  useGrouping: true,
});

export function formatCurrency(amount: number | null | undefined): string {
  return CURRENCY_FORMATTER.format(amount ?? 0);
}

/**
 * Nombre de producto interpretado: siempre con la primera letra en mayúscula,
 * el resto en minúsculas -- sea cual sea cómo lo escriba el usuario o lo
 * proponga una importación. `toUpperCase`/`toLowerCase` son Unicode-aware,
 * así que conservan Á É Í Ó Ú Ñ Ç. Cadena vacía o solo espacios -> "".
 * Equivalente en base de datos: capitalize_first_letter() en
 * supabase/migrations/0021_capitalize_product_names.sql.
 */
export function capitalizeFirstLetter(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
