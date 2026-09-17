import type { createClient } from "@/lib/supabase/server";
import type { AliasEditInput } from "./validation";

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
