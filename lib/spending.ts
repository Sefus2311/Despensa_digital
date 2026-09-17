// Lógica pura (sin Supabase) para el resumen de gasto de Historial --
// separada de la página para poder testearla sin red ni base de datos.

export interface DateRange {
  /** YYYY-MM-DD, inclusive */
  start: string;
  /** YYYY-MM-DD, exclusivo */
  end: string;
}

function toISODate(year: number, monthIndex: number, day: number): string {
  // Date normaliza componentes fuera de rango (monthIndex 12 -> enero del año
  // siguiente), así que "mes siguiente"/"año siguiente" se puede pedir
  // directamente sin lógica de desbordamiento a mano.
  const d = new Date(year, monthIndex, day);
  const yyyy = d.getFullYear().toString().padStart(4, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Límites del mes natural que contiene `referenceDate`, en la zona horaria
 * local del proceso que ejecuta esto (el servidor de Next.js) -- coherente
 * con que `receipts.purchase_date` es una fecha de calendario sin hora.
 */
export function getMonthBoundaries(referenceDate: Date): DateRange {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  return { start: toISODate(year, month, 1), end: toISODate(year, month + 1, 1) };
}

/** Límites del año natural que contiene `referenceDate`. */
export function getYearBoundaries(referenceDate: Date): DateRange {
  const year = referenceDate.getFullYear();
  return { start: toISODate(year, 0, 1), end: toISODate(year + 1, 0, 1) };
}

/** Primer día del mes de `date`, `delta` meses antes/después. */
export function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** Primer día del año de `date`, `delta` años antes/después. */
export function shiftYear(date: Date, delta: number): Date {
  return new Date(date.getFullYear() + delta, 0, 1);
}

const MONTH_PARAM_RE = /^(\d{4})-(\d{2})$/;

/** "2026-09" -> 1 de septiembre de 2026. Valor ausente/inválido -> `fallback`. */
export function parseMonthParam(value: string | undefined, fallback: Date): Date {
  const match = value ? MONTH_PARAM_RE.exec(value) : null;
  if (!match) return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
  const [, year, month] = match;
  return new Date(Number(year), Number(month) - 1, 1);
}

export function formatMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const YEAR_PARAM_RE = /^\d{4}$/;

/** "2025" -> 1 de enero de 2025. Valor ausente/inválido -> `fallback`. */
export function parseYearParam(value: string | undefined, fallback: Date): Date {
  if (!value || !YEAR_PARAM_RE.test(value)) return new Date(fallback.getFullYear(), 0, 1);
  return new Date(Number(value), 0, 1);
}

export function formatYearParam(date: Date): string {
  return String(date.getFullYear());
}

function monthOf(dateOnly: string): Date {
  return new Date(Number(dateOnly.slice(0, 4)), Number(dateOnly.slice(5, 7)) - 1, 1);
}

/**
 * ¿Se puede retroceder un mes más desde `selectedMonth`? No, si no hay ningún
 * dato (`earliestPurchaseDate` nulo) o si el mes anterior ya queda antes del
 * mes de la compra más antigua -- así el botón "‹" nunca lleva a un mes que
 * no puede tener compras.
 */
export function canGoToPreviousMonth(selectedMonth: Date, earliestPurchaseDate: string | null): boolean {
  if (!earliestPurchaseDate) return false;
  return shiftMonth(selectedMonth, -1) >= monthOf(earliestPurchaseDate);
}

/** ¿Se puede avanzar un mes más? No, más allá del mes actual (no hay compras futuras). */
export function canGoToNextMonth(selectedMonth: Date, today: Date = new Date()): boolean {
  return shiftMonth(selectedMonth, 1) <= new Date(today.getFullYear(), today.getMonth(), 1);
}

/** Igual que canGoToPreviousMonth, para años. */
export function canGoToPreviousYear(selectedYear: Date, earliestPurchaseDate: string | null): boolean {
  if (!earliestPurchaseDate) return false;
  return shiftYear(selectedYear, -1).getFullYear() >= Number(earliestPurchaseDate.slice(0, 4));
}

/** Igual que canGoToNextMonth, para años. */
export function canGoToNextYear(selectedYear: Date, today: Date = new Date()): boolean {
  return shiftYear(selectedYear, 1).getFullYear() <= today.getFullYear();
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });

/** "septiembre de 2026" -> "Septiembre de 2026". */
export function formatMonthLabel(date: Date): string {
  const raw = MONTH_LABEL_FORMATTER.format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isSameYear(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear();
}

/** Valor del <select> para "todos los comercios" (sin filtro). */
export const STORE_FILTER_ALL = "";
/** Valor del <select> para las compras sin comercio identificado. */
export const STORE_FILTER_UNIDENTIFIED = "__sin_identificar__";
export const UNIDENTIFIED_STORE_LABEL = "Sin identificar";

/**
 * Traduce el valor del <select> "Lugar de compra" al parámetro p_store_key
 * que espera get_home_spending_summary()/el filtro de la lista: null = sin
 * filtro, "" = sólo compras sin comercio (store_key normaliza a "" cuando
 * store_name es nulo), cualquier otro valor = ese store_key tal cual (ya
 * viene normalizado desde SQL, no hace falta volver a normalizarlo aquí).
 */
export function resolveStoreFilterParam(searchParamValue: string | undefined): string | null {
  if (!searchParamValue || searchParamValue === STORE_FILTER_ALL) return null;
  if (searchParamValue === STORE_FILTER_UNIDENTIFIED) return "";
  return searchParamValue;
}

export interface StoreFilterOption {
  value: string;
  label: string;
}

/**
 * Construye las opciones del filtro a partir de las filas
 * {store_key, store_name} de los tickets de la Casa. store_key ya viene
 * normalizado por SQL (normalize_product_text), así que aquí sólo se
 * deduplica y se ordena -- no se reimplementa ninguna normalización.
 */
export function buildStoreFilterOptions(
  rows: { store_key: string | null; store_name: string | null }[]
): StoreFilterOption[] {
  const labelByKey = new Map<string, string>();

  for (const row of rows) {
    const key = row.store_key ?? "";
    if (labelByKey.has(key)) continue;
    const label = key === "" ? UNIDENTIFIED_STORE_LABEL : row.store_name?.trim() || UNIDENTIFIED_STORE_LABEL;
    labelByKey.set(key, label);
  }

  const named = [...labelByKey.entries()]
    .filter(([key]) => key !== "")
    .sort((a, b) => a[1].localeCompare(b[1], "es"));

  const options: StoreFilterOption[] = [{ value: STORE_FILTER_ALL, label: "Todos" }];
  for (const [key, label] of named) {
    options.push({ value: key, label });
  }
  if (labelByKey.has("")) {
    options.push({ value: STORE_FILTER_UNIDENTIFIED, label: UNIDENTIFIED_STORE_LABEL });
  }

  return options;
}
