"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserAndHome } from "@/lib/home";

export type ListaCompraState = { error?: string } | null;

export async function addManualItem(
  _prevState: ListaCompraState,
  formData: FormData
): Promise<ListaCompraState> {
  const { supabase, homeId } = await getCurrentUserAndHome();

  const productoId = String(formData.get("producto_id") ?? "").trim() || null;
  const nombreMostrado = String(formData.get("nombre_mostrado") ?? "").trim();
  const cantidadRaw = String(formData.get("cantidad") ?? "").trim();
  const unidad = String(formData.get("unidad") ?? "").trim() || null;

  if (!nombreMostrado) {
    return { error: "Escribe qué producto quieres añadir." };
  }

  const { error } = await supabase.rpc("add_to_shopping_list", {
    p_home_id: homeId,
    p_display_name: nombreMostrado,
    p_canonical_product_id: productoId,
    p_quantity: cantidadRaw ? Number(cantidadRaw) : null,
    p_unit: unidad,
    p_source: "manual",
  });

  if (error) {
    return { error: "No se pudo añadir el producto." };
  }

  revalidatePath("/lista-compra");
  return null;
}

export async function toggleChecked(itemId: string, checked: boolean) {
  const { supabase } = await getCurrentUserAndHome();
  await supabase.from("shopping_list_items").update({ is_checked: checked }).eq("id", itemId);
  revalidatePath("/lista-compra");
}

export async function removeItem(itemId: string) {
  const { supabase } = await getCurrentUserAndHome();
  await supabase.from("shopping_list_items").delete().eq("id", itemId);
  revalidatePath("/lista-compra");
}
