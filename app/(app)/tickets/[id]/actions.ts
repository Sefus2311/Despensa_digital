"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserAndHome } from "@/lib/home";
import { isProductCategory } from "@/lib/constants/product-categories";
import { normalizeOptionalSupermarketName } from "@/lib/supermarkets";

export type SaveReviewState = { error?: string } | null;

interface ItemInput {
  rawName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  category: string;
  brand: string | null;
  // Interpretación (importación JSON, 0019). Ausentes/null en líneas manuales.
  productName?: string | null;
  commercialName?: string | null;
  unitsPerPack?: number | null;
  inventoryQuantity?: number | null;
  confidence?: number | null;
  reviewRequired?: boolean;
  notes?: string | null;
  isInventoryItem?: boolean;
}

// Los números opcionales llegan del cliente: se descartan si no son válidos.
function nonNegativeOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
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
  const { supabase, homeId } = await getCurrentUserAndHome();

  // El supermercado se guarda siempre en MAYÚSCULAS (dato real, no CSS); este
  // mismo valor es el que se envía después al intérprete como `retailer`.
  const storeName = normalizeOptionalSupermarketName(String(formData.get("store_name") ?? ""));
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

  // Respaldo del <select required> del cliente -- la regla de negocio en sí
  // (qué categorías existen, fallback a VARIOS) vive solo en
  // normalize_product_category (SQL), no se duplica aquí.
  if (validItems.some((i) => !isProductCategory(i.category))) {
    return { error: "Selecciona una categoría válida para cada producto." };
  }

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, home_id")
    .eq("id", receiptId)
    .eq("home_id", homeId)
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
    validItems.map((item, index) => {
      const confidence = nonNegativeOrNull(item.confidence);
      return {
        receipt_id: receiptId,
        raw_name: item.rawName.trim(),
        quantity: item.quantity || 1,
        unit: item.unit,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        line_number: index + 1,
        // El producto interpretado se guarda siempre en minúsculas.
        product_name: item.productName?.trim().toLowerCase() || null,
        category: item.category,
        brand: item.brand?.trim() || null,
        commercial_name: item.commercialName?.trim() || null,
        units_per_pack: nonNegativeOrNull(item.unitsPerPack),
        inventory_quantity: nonNegativeOrNull(item.inventoryQuantity),
        confidence: confidence !== null && confidence <= 1 ? confidence : null,
        review_required: item.reviewRequired === true,
        notes: item.notes?.trim() || null,
        is_inventory_item: item.isInventoryItem !== false,
      };
    })
  );

  if (itemsError) {
    return { error: "No se pudieron guardar los productos." };
  }

  // Alimenta el intérprete global con lo que el usuario acaba de escribir.
  // V0.1 no tiene OCR/IA todavía: el texto que el usuario teclea es a la vez
  // el "texto crudo del ticket" y su propia interpretación, así que se envían
  // ambos iguales. submit_interpreter_proposal ya sabe confirmar/detectar
  // conflicto si otro usuario ha propuesto algo distinto para el mismo
  // (supermercado, texto). Es un intento best-effort: si falla, no debe
  // impedir guardar el ticket (el intérprete es auxiliar, no crítico).
  if (storeName) {
    await Promise.allSettled(
      validItems.map((item) =>
        supabase.rpc("submit_interpreter_proposal", {
          p_retailer: storeName,
          p_raw_name: item.rawName.trim(),
          p_proposed_canonical_name: item.productName?.trim().toLowerCase() || item.rawName.trim(),
          p_proposed_brand: item.brand?.trim() || null,
          p_proposed_category: item.category,
          p_proposed_quantity: item.quantity || null,
          p_proposed_unit: item.unit,
        })
      )
    );
  }

  revalidatePath("/historial");
  revalidatePath(`/historial/${receiptId}`);
  revalidatePath("/despensa");
  revalidatePath("/inicio");
  redirect(`/historial/${receiptId}`);
}
