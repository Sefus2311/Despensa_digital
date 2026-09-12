"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserAndHousehold } from "@/lib/household";

export type SaveReviewState = { error?: string } | null;

interface ItemInput {
  rawName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

/**
 * Guarda los datos generales del ticket + sus líneas.
 * En V0.1 las líneas se reemplazan por completo en cada guardado
 * (borrado + reinserción) porque el volumen por ticket es pequeño
 * y simplifica mucho la lógica frente a un diff fino.
 */
export async function saveReceiptReview(
  receiptId: string,
  _prevState: SaveReviewState,
  formData: FormData
): Promise<SaveReviewState> {
  const { supabase, householdId } = await getCurrentUserAndHousehold();

  const storeName = String(formData.get("store_name") ?? "").trim() || null;
  const purchaseDate = String(formData.get("purchase_date") ?? "") || null;
  const totalAmountRaw = formData.get("total_amount");
  const totalAmount = totalAmountRaw ? Number(totalAmountRaw) : null;

  const itemsRaw = String(formData.get("items_json") ?? "[]");
  let items: ItemInput[] = [];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { error: "No se pudieron leer las líneas del ticket." };
  }

  const validItems = items.filter((i) => i.rawName.trim().length > 0);

  if (validItems.length === 0) {
    return { error: "Añade al menos un producto antes de guardar." };
  }

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, household_id")
    .eq("id", receiptId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (!receipt) {
    return { error: "Ticket no encontrado." };
  }

  const { error: updateError } = await supabase
    .from("receipts")
    .update({
      store_name: storeName,
      purchase_date: purchaseDate,
      total_amount: totalAmount,
      status: "reviewed",
    })
    .eq("id", receiptId);

  if (updateError) {
    return { error: "No se pudo guardar el ticket." };
  }

  await supabase.from("receipt_items").delete().eq("receipt_id", receiptId);

  const { error: itemsError } = await supabase.from("receipt_items").insert(
    validItems.map((item) => ({
      receipt_id: receiptId,
      raw_name: item.rawName.trim(),
      quantity: item.quantity || 1,
      unit: item.unit,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
    }))
  );

  if (itemsError) {
    return { error: "No se pudieron guardar los productos." };
  }

  revalidatePath("/historial");
  revalidatePath("/despensa");
  revalidatePath("/inicio");
  redirect("/historial");
}
