"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserAndHome } from "@/lib/home";
import { isPurchasableUnit, toBaseUnit } from "@/lib/units";

export type CocinarState = { error?: string; success?: string } | null;

interface MissingItemInput {
  productoId: string | null;
  nombreMostrado: string;
  cantidad: number | null;
  unidad: string | null;
}

// Añade los faltantes elegidos a la lista de la compra de la Casa activa --
// nunca crea otra lista independiente, usa add_to_shopping_list (0015),
// que ya evita duplicados fusionando con una línea existente sin marcar.
export async function addMissingToShoppingList(
  recetaId: string,
  _prevState: CocinarState,
  formData: FormData
): Promise<CocinarState> {
  const { supabase, homeId } = await getCurrentUserAndHome();

  let items: MissingItemInput[] = [];
  try {
    items = JSON.parse(String(formData.get("items_json") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer los ingredientes." };
  }

  // Filtro autoritativo (el cliente ya lo aplica, pero no se confía en él):
  // solo ud./gr./ml. generan línea en la lista de la compra.
  // kg -> gr. y l -> ml. ya vienen convertidos desde la página; se repite aquí
  // (es idempotente) para no depender de lo que envíe el cliente.
  items = items
    .map((item) => {
      const base = toBaseUnit(item.cantidad, item.unidad);
      return { ...item, cantidad: base.cantidad, unidad: base.unidad };
    })
    .filter((item) => isPurchasableUnit(item.unidad));

  if (items.length === 0) {
    return { error: "No hay ingredientes con unidad comprable (ud., gr. o ml.) que añadir." };
  }

  for (const item of items) {
    const { error } = await supabase.rpc("add_to_shopping_list", {
      p_home_id: homeId,
      p_display_name: item.nombreMostrado,
      p_canonical_product_id: item.productoId,
      p_quantity: item.cantidad,
      p_unit: item.unidad,
      p_source: "receta",
      p_source_receta_id: recetaId,
    });
    if (error) {
      return { error: "No se pudieron añadir todos los ingredientes a la lista." };
    }
  }

  revalidatePath("/lista-compra");
  return { success: `Se añadieron ${items.length} ingrediente${items.length === 1 ? "" : "s"} a la lista de la compra.` };
}
