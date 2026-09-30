// Lógica pura (sin Supabase) del Editor del Diccionario -- separada de la
// página/acciones para poder testearla sin red ni base de datos. Espejo, en
// TypeScript, de las mismas reglas que aplica admin_search_dictionary() en
// SQL (0024_dictionary_editor.sql): una sola fuente de verdad para "qué
// significa cada filtro", ninguna se reimplementa distinto en el cliente.
import type { DictionaryEntry } from "@/lib/types/database";

export type DictionaryEstadoFilter = "todos" | "revisar" | "duplicados";
export type DictionarySortField =
  | "raw_name"
  | "canonical_name"
  | "retailer"
  | "category"
  | "brand"
  | "times_confirmed";
export type DictionarySortDir = "asc" | "desc";

export const DICTIONARY_PAGE_SIZE = 50;

const VALID_ESTADOS: readonly string[] = ["todos", "revisar", "duplicados"];
const VALID_SORTS: readonly string[] = [
  "raw_name",
  "canonical_name",
  "retailer",
  "category",
  "brand",
  "times_confirmed",
];

export interface DictionarySearchParams {
  search: string;
  retailer: string;
  category: string;
  estado: DictionaryEstadoFilter;
  sort: DictionarySortField;
  sortDir: DictionarySortDir;
  /** 1-based. */
  page: number;
}

/** Interpreta los `searchParams` de /admin/dictionary con valores por defecto seguros ante cualquier entrada. */
export function parseDictionarySearchParams(
  params: Record<string, string | undefined>
): DictionarySearchParams {
  const estado = (VALID_ESTADOS.includes(params.estado ?? "") ? params.estado : "todos") as DictionaryEstadoFilter;
  const sort = (VALID_SORTS.includes(params.sort ?? "") ? params.sort : "canonical_name") as DictionarySortField;
  const sortDir: DictionarySortDir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);

  return {
    search: params.q?.trim() ?? "",
    retailer: params.retailer?.trim() ?? "",
    category: params.category?.trim() ?? "",
    estado,
    sort,
    sortDir,
    page,
  };
}

/** Vuelve a pulsar la misma columna alterna el sentido; pulsar otra empieza siempre en ascendente. */
export function nextSortDirection(
  currentSort: DictionarySortField,
  currentDir: DictionarySortDir,
  clicked: DictionarySortField
): DictionarySortDir {
  if (currentSort !== clicked) return "asc";
  return currentDir === "asc" ? "desc" : "asc";
}

// ----------------------------------------------------------------------------
// Exportar CSV (sección 16): separador ";" -- Excel en es-ES lo abre bien sin
// asistente de importación (usa "," como separador decimal).
// ----------------------------------------------------------------------------
const CSV_HEADERS = ["Texto detectado", "Nombre normalizado", "Supermercado", "Categoría", "Marca", "Usos", "Estado"];

function escapeCsvField(value: string): string {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV del contenido recibido (el llamador decide si es la página visible o todo lo filtrado). */
export function buildDictionaryCsv(rows: DictionaryEntry[]): string {
  const lines = [CSV_HEADERS.join(";")];
  for (const row of rows) {
    lines.push(
      [
        row.raw_name,
        row.canonical_name,
        row.retailer,
        row.category,
        row.brand ?? "",
        String(row.times_confirmed),
        row.estado === "revisar" ? "REVISAR" : "OK",
      ]
        .map(escapeCsvField)
        .join(";")
    );
  }
  // \r\n: máxima compatibilidad con Excel en Windows.
  return lines.join("\r\n");
}

// ----------------------------------------------------------------------------
// Unificar (secciones 11-13): las filas de la tabla son alias, pero lo que se
// unifica es el producto canónico -- varias filas pueden ya compartir el
// mismo canonical_product_id (aliases distintos del mismo producto), y
// unificar exige al menos DOS productos canónicos distintos, no dos alias
// cualesquiera.
// ----------------------------------------------------------------------------
export interface MergeCandidate {
  canonicalProductId: string;
  canonicalName: string;
}

/** Productos canónicos distintos presentes en las filas seleccionadas (deduplicados, en orden de aparición). */
export function collectMergeCandidates(rows: DictionaryEntry[]): MergeCandidate[] {
  const seen = new Map<string, MergeCandidate>();
  for (const row of rows) {
    if (!seen.has(row.canonical_product_id)) {
      seen.set(row.canonical_product_id, {
        canonicalProductId: row.canonical_product_id,
        canonicalName: row.canonical_name,
      });
    }
  }
  return [...seen.values()];
}

/** ¿Hay algo que unificar con esta selección? Hacen falta 2+ productos canónicos distintos. */
export function canMergeSelection(rows: DictionaryEntry[]): boolean {
  return collectMergeCandidates(rows).length >= 2;
}

/** "3 productos se unificarán como X" -- cuenta productos canónicos distintos, no filas/alias. */
export function describeMerge(candidates: MergeCandidate[], finalName: string): string {
  const n = candidates.length;
  return `${n} producto${n === 1 ? "" : "s"} se unificará${n === 1 ? "" : "n"} como ${finalName}`;
}
