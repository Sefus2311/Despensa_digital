import { notFound } from "next/navigation";
import { getCurrentUserAndHome } from "@/lib/home";
import { DEFAULT_PRODUCT_CATEGORY } from "@/lib/constants/product-categories";
import { RECEIPT_STATUS_PENDING_REVIEW } from "@/lib/receipt-status";
import { getReceiptImageUrl } from "../../actions";
import { ReviewForm } from "./ReviewForm";

export default async function ReviewTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, homeId } = await getCurrentUserAndHome();

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, store_name, purchase_date, total_amount, image_path, status")
    .eq("id", id)
    .eq("home_id", homeId)
    .maybeSingle();

  if (!receipt) {
    notFound();
  }

  const { data: items } = await supabase
    .from("receipt_items")
    .select(
      "id, raw_name, quantity, unit, unit_price, total_price, product_name, category, brand, commercial_name, units_per_pack, inventory_quantity, confidence, review_required, notes, is_inventory_item"
    )
    .eq("receipt_id", id)
    .order("line_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  // Los tickets importados por JSON no tienen imagen (image_path null).
  const imageUrl = receipt.image_path ? await getReceiptImageUrl(receipt.image_path) : null;
  const isPdf = receipt.image_path?.toLowerCase().endsWith(".pdf") ?? false;

  return (
    <ReviewForm
      receiptId={receipt.id}
      imageUrl={imageUrl}
      isPdf={isPdf}
      isEditing={receipt.status === "reviewed"}
      isPendingReview={receipt.status === RECEIPT_STATUS_PENDING_REVIEW}
      initialStoreName={receipt.store_name ?? ""}
      initialPurchaseDate={
        receipt.purchase_date ?? new Date().toISOString().slice(0, 10)
      }
      initialTotalAmount={receipt.total_amount?.toString() ?? ""}
      initialItems={
        (items ?? []).map((i) => ({
          rawName: i.raw_name,
          quantity: Number(i.quantity),
          unit: i.unit,
          unitPrice: i.unit_price !== null ? Number(i.unit_price) : null,
          totalPrice: i.total_price !== null ? Number(i.total_price) : null,
          // Las líneas anteriores a 0019 no guardan categoría/marca: se parte
          // del mismo fallback que usa el intérprete cuando no puede
          // determinar la categoría.
          category: i.category ?? DEFAULT_PRODUCT_CATEGORY,
          brand: i.brand,
          // Campos de la interpretación (null en líneas escritas a mano, que
          // conservan la edición sencilla de siempre).
          productName: i.product_name,
          commercialName: i.commercial_name,
          unitsPerPack: i.units_per_pack !== null ? Number(i.units_per_pack) : null,
          inventoryQuantity: i.inventory_quantity !== null ? Number(i.inventory_quantity) : null,
          confidence: i.confidence !== null ? Number(i.confidence) : null,
          reviewRequired: i.review_required,
          notes: i.notes,
          isInventoryItem: i.is_inventory_item,
        }))
      }
    />
  );
}
