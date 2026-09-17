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
