"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserAndHome } from "@/lib/home";
import { CATEGORY_SLUG } from "@/lib/constants/product-categories";
import { buildPantryItemEdit, parsePantryItemInput } from "@/lib/pantry";
import type { HomePantryItem } from "@/lib/types/database";

export type UpdatePantryItemState = { error?: string } | null;

/**
 * Guarda las correcciones de un artículo en pantry_item_edits. Solo escribe en
 * esa tabla: el ticket y sus líneas (el registro de compra) no se tocan nunca.
 * El artículo se vuelve a leer de la Casa activa, sin fiarse del cliente: si no
 * pertenece a ella, no existe para este usuario.
 */
export async function updatePantryItem(
  canonicalProductId: string,
  _prevState: UpdatePantryItemState,
  formData: FormData
): Promise<UpdatePantryItemState> {
  const { supabase, user, homeId } = await getCurrentUserAndHome();

  const parsed = parsePantryItemInput({
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    stock: String(formData.get("stock") ?? ""),
    unit: String(formData.get("unit") ?? ""),
  });
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { data: pantryData } = await supabase.rpc("get_home_pantry", { p_home_id: homeId });
  const item = ((pantryData ?? []) as HomePantryItem[]).find(
    (p) => p.canonical_product_id === canonicalProductId
  );
  if (!item) {
    return { error: "Artículo no encontrado en esta despensa." };
  }

  const { error } = await supabase.from("pantry_item_edits").upsert(
    {
      home_id: homeId,
      canonical_product_id: canonicalProductId,
      ...buildPantryItemEdit(item, parsed.value),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "home_id,canonical_product_id" }
  );

  if (error) {
    return { error: "No se pudieron guardar los cambios." };
  }

  revalidatePath("/despensa");
  revalidatePath(`/despensa/${canonicalProductId}`);
  revalidatePath("/recetas");
  revalidatePath("/inicio");
  redirect(`/despensa?categoria=${CATEGORY_SLUG[parsed.value.category]}`);
}
