// Importes en céntimos enteros: comparar decimales (0.1 + 0.2 !== 0.3) daría
// falsos "no coincide". Los importes de un ticket tienen 2 decimales, así que
// redondear x * 100 al entero más cercano es exacto para ellos.
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function formatCents(cents: number): string {
  return EUR.format(cents / 100);
}
