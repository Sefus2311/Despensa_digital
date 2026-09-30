import type { createClient } from "@/lib/supabase/server";
import type { DictionaryEntry, DictionarySummary } from "@/lib/types/database";
import type { AliasEditInput } from "./validation";
import { DICTIONARY_PAGE_SIZE, type DictionarySearchParams } from "./dictionary";

// Único punto de escritura/lectura Supabase para la gestión de un alias del
// Intérprete: las Server Actions llaman aquí en vez de hacer supabase.rpc(...)
// directamente. No depende de React ni de ningún componente -- recibe el
// cliente ya creado, igual que lib/home.ts -- para que el mismo contrato
// pueda reutilizarse desde otro punto de entrada (p.ej. una futura
// herramienta externa) sin duplicar la lógica de llamada a cada RPC.
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getAliasDetail(supabase: SupabaseServerClient, aliasId: string) {
  return supabase.rpc("get_interpreter_alias_detail", { p_id: aliasId });
}

export async function updateAliasFull(
  supabase: SupabaseServerClient,
  aliasId: string,
  input: AliasEditInput
) {
  return supabase.rpc("update_interpreter_alias_full", {
    p_alias_id: aliasId,
    p_canonical_name: input.canonicalName,
    p_category: input.category,
    p_default_unit: input.defaultUnit,
    p_brand: input.brand,
    p_commercial_name: input.commercialName,
    p_package_quantity: input.packageQuantity,
    p_package_unit: input.packageUnit,
  });
}

export async function deleteAlias(supabase: SupabaseServerClient, aliasId: string) {
  return supabase.rpc("delete_product_alias", { p_id: aliasId });
}

export async function restoreAlias(supabase: SupabaseServerClient, aliasId: string) {
  return supabase.rpc("restore_product_alias", { p_id: aliasId });
}

export async function updateAliasActive(
  supabase: SupabaseServerClient,
  aliasId: string,
  active: boolean
) {
  return supabase.rpc("update_product_alias", { p_id: aliasId, p_active: active });
}

// ----------------------------------------------------------------------------
// Editor del Diccionario (0024_dictionary_editor.sql) -- solo admin.
// ----------------------------------------------------------------------------

export async function searchDictionary(supabase: SupabaseServerClient, params: DictionarySearchParams) {
  // Se pide una fila de más para saber si hay página siguiente sin un COUNT(*)
  // aparte (caro en tablas grandes) -- mismo criterio que admin_list_users.
  const { data, error } = await supabase.rpc("admin_search_dictionary", {
    p_search: params.search || null,
    p_retailer: params.retailer || null,
    p_category: params.category || null,
    p_estado: params.estado,
    p_sort: params.sort,
    p_sort_dir: params.sortDir,
    p_limit: DICTIONARY_PAGE_SIZE + 1,
    p_offset: (params.page - 1) * DICTIONARY_PAGE_SIZE,
  });

  if (error) return { rows: [] as DictionaryEntry[], hasMore: false, error };

  const rows = (data ?? []) as DictionaryEntry[];
  const hasMore = rows.length > DICTIONARY_PAGE_SIZE;
  return { rows: hasMore ? rows.slice(0, DICTIONARY_PAGE_SIZE) : rows, hasMore, error: null };
}

/** Todas las filas que cumplan los filtros (sin paginar) -- para exportar CSV. Tope defensivo, no una carga real de "todo". */
export async function searchDictionaryForExport(
  supabase: SupabaseServerClient,
  params: Omit<DictionarySearchParams, "page">,
  limit = 5000
) {
  const { data, error } = await supabase.rpc("admin_search_dictionary", {
    p_search: params.search || null,
    p_retailer: params.retailer || null,
    p_category: params.category || null,
    p_estado: params.estado,
    p_sort: params.sort,
    p_sort_dir: params.sortDir,
    p_limit: limit,
    p_offset: 0,
  });

  return { rows: (data ?? []) as DictionaryEntry[], error };
}

export async function getDictionarySummary(supabase: SupabaseServerClient) {
  const { data, error } = await supabase.rpc("admin_dictionary_summary");
  return { summary: (data ?? null) as DictionarySummary | null, error };
}

export async function updateDictionaryRetailer(supabase: SupabaseServerClient, aliasId: string, retailer: string) {
  return supabase.rpc("update_product_alias_retailer", { p_id: aliasId, p_retailer: retailer });
}

/** Solo canonical_name -- ver comentario de la función SQL sobre por qué no se reutiliza update_canonical_product. */
export async function updateDictionaryCanonicalName(
  supabase: SupabaseServerClient,
  canonicalProductId: string,
  name: string
) {
  return supabase.rpc("update_dictionary_canonical_name", { p_id: canonicalProductId, p_canonical_name: name });
}

/** Solo category -- misma razón. */
export async function updateDictionaryCategory(
  supabase: SupabaseServerClient,
  canonicalProductId: string,
  category: string
) {
  return supabase.rpc("update_dictionary_category", { p_id: canonicalProductId, p_category: category });
}

/** update_retailer_product ya hace COALESCE campo a campo -- editar solo la marca es seguro tal cual. */
export async function updateDictionaryBrand(
  supabase: SupabaseServerClient,
  retailerProductId: string,
  brand: string
) {
  return supabase.rpc("update_retailer_product", { p_id: retailerProductId, p_brand: brand });
}

export async function mergeCanonicalProducts(
  supabase: SupabaseServerClient,
  sourceIds: string[],
  targetId: string,
  finalName: string | null
) {
  return supabase.rpc("merge_canonical_products", {
    p_source_ids: sourceIds,
    p_target_id: targetId,
    p_final_name: finalName,
  });
}
