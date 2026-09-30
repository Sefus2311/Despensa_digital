"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/roles";
import { isProductCategory } from "@/lib/constants/product-categories";
import {
  buildDictionaryCsv,
  collectMergeCandidates,
  parseDictionarySearchParams,
} from "@/lib/interpreter/dictionary";
import {
  getDictionarySummary,
  mergeCanonicalProducts,
  searchDictionary,
  searchDictionaryForExport,
  updateDictionaryBrand,
  updateDictionaryCanonicalName,
  updateDictionaryCategory,
  updateDictionaryRetailer,
} from "@/lib/interpreter/repository";
import type { DictionaryEntry, DictionarySummary } from "@/lib/types/database";

// Editor del Diccionario: exclusivamente admin (más estricto que el resto
// del módulo del intérprete, que admite delegate -- sección 1 del encargo).
// Cada acción vuelve a comprobar el rol aquí (no solo en la página) y las
// RPC de escritura lo vuelven a exigir en el propio SQL: ni una llamada
// directa a supabase.rpc(...) desde la consola del navegador se lo salta.

export interface DictionaryPageData {
  rows: DictionaryEntry[];
  hasMore: boolean;
  summary: DictionarySummary | null;
  error?: string;
}

/**
 * Vuelve a consultar la tabla con los filtros/orden/página recibidos --
 * la usan tanto la carga inicial (Server Component) como cada cambio de
 * búsqueda/filtro/orden/página desde el cliente (sin recargar la página).
 */
export async function fetchDictionaryPage(
  rawParams: Record<string, string | undefined>
): Promise<DictionaryPageData> {
  if (!(await isAdmin())) {
    return { rows: [], hasMore: false, summary: null, error: "No autorizado." };
  }

  const supabase = await createClient();
  const params = parseDictionarySearchParams(rawParams);

  const [{ rows, hasMore, error }, { summary }] = await Promise.all([
    searchDictionary(supabase, params),
    getDictionarySummary(supabase),
  ]);

  if (error) {
    return { rows: [], hasMore: false, summary, error: "No se pudo cargar el diccionario." };
  }
  return { rows, hasMore, summary };
}

export type CellEditResult = { error?: string };

export async function editCanonicalName(canonicalProductId: string, value: string): Promise<CellEditResult> {
  if (!(await isAdmin())) return { error: "No autorizado." };
  if (!value.trim()) return { error: "El nombre no puede estar vacío." };

  const supabase = await createClient();
  const { error } = await updateDictionaryCanonicalName(supabase, canonicalProductId, value);
  if (error) return { error: "No se pudo guardar el nombre." };

  revalidatePath("/admin/dictionary");
  return {};
}

export async function editCategory(canonicalProductId: string, value: string): Promise<CellEditResult> {
  if (!(await isAdmin())) return { error: "No autorizado." };
  if (!isProductCategory(value)) return { error: "Selecciona una categoría válida." };

  const supabase = await createClient();
  const { error } = await updateDictionaryCategory(supabase, canonicalProductId, value);
  if (error) return { error: "No se pudo guardar la categoría." };

  revalidatePath("/admin/dictionary");
  return {};
}

export async function editBrand(retailerProductId: string, value: string): Promise<CellEditResult> {
  if (!(await isAdmin())) return { error: "No autorizado." };
  if (!value.trim()) return { error: "Escribe una marca, o deja el valor anterior." };

  const supabase = await createClient();
  const { error } = await updateDictionaryBrand(supabase, retailerProductId, value.trim());
  if (error) return { error: "No se pudo guardar la marca." };

  revalidatePath("/admin/dictionary");
  return {};
}

export async function editRetailer(aliasId: string, value: string): Promise<CellEditResult> {
  if (!(await isAdmin())) return { error: "No autorizado." };
  if (!value.trim()) return { error: "El supermercado no puede estar vacío." };

  const supabase = await createClient();
  const { error } = await updateDictionaryRetailer(supabase, aliasId, value);
  if (error) return { error: "No se pudo guardar el supermercado (¿ya existe ese texto para ese producto?)." };

  revalidatePath("/admin/dictionary");
  return {};
}

export type MergeResult = { error?: string; success?: string };

/**
 * UNIFICAR: `rows` son las filas (alias) que el admin seleccionó, de las que
 * se derivan los productos canónicos realmente implicados
 * (collectMergeCandidates) -- `targetId` es el que sobrevive, el resto se
 * fusiona en él. Transaccional en SQL (merge_canonical_products): si algo
 * falla a mitad, no queda ninguna unificación a medias.
 */
export async function mergeDictionaryEntries(
  rows: DictionaryEntry[],
  targetId: string,
  finalName: string
): Promise<MergeResult> {
  if (!(await isAdmin())) return { error: "No autorizado." };

  const candidates = collectMergeCandidates(rows);
  if (candidates.length < 2) {
    return { error: "Selecciona al menos dos productos distintos para unificar." };
  }
  if (!candidates.some((c) => c.canonicalProductId === targetId)) {
    return { error: "El valor definitivo debe ser uno de los productos seleccionados." };
  }
  if (!finalName.trim()) {
    return { error: "El valor definitivo no puede estar vacío." };
  }

  const sourceIds = candidates.map((c) => c.canonicalProductId).filter((id) => id !== targetId);

  const supabase = await createClient();
  const { error } = await mergeCanonicalProducts(supabase, sourceIds, targetId, finalName.trim());
  if (error) {
    return { error: "No se pudo unificar. No se ha modificado nada (la operación es todo o nada)." };
  }

  revalidatePath("/admin/dictionary");
  return { success: `Se unificaron ${candidates.length} productos como ${finalName.trim()}.` };
}

export type ExportResult = { csv: string } | { error: string };

/** Exporta TODO lo que cumple los filtros actuales (no solo la página cargada) -- sección 16. */
export async function exportDictionaryCsv(rawParams: Record<string, string | undefined>): Promise<ExportResult> {
  if (!(await isAdmin())) return { error: "No autorizado." };

  const supabase = await createClient();
  const { search, retailer, category, estado, sort, sortDir } = parseDictionarySearchParams(rawParams);
  const { rows, error } = await searchDictionaryForExport(supabase, { search, retailer, category, estado, sort, sortDir });

  if (error) return { error: "No se pudo exportar." };
  return { csv: buildDictionaryCsv(rows) };
}
