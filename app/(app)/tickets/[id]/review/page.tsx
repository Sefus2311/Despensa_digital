import { notFound } from "next/navigation";
import { getCurrentUserAndHousehold } from "@/lib/household";
import { getReceiptImageUrl } from "../../actions";
import { ReviewForm } from "./ReviewForm";

export default async function ReviewTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, householdId } = await getCurrentUserAndHousehold();

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, store_name, purchase_date, total_amount, image_path, status")
    .eq("id", id)
    .eq("household_id", householdId)
    .maybeSingle();

  if (!receipt) {
    notFound();
  }

  const { data: items } = await supabase
    .from("receipt_items")
    .select("id, raw_name, quantity, unit, unit_price, total_price")
    .eq("receipt_id", id)
    .order("created_at", { ascending: true });

  const imageUrl = await getReceiptImageUrl(receipt.image_path);
  const isPdf = receipt.image_path.toLowerCase().endsWith(".pdf");

  return (
    <ReviewForm
      receiptId={receipt.id}
      imageUrl={imageUrl}
      isPdf={isPdf}
      isEditing={receipt.status === "reviewed"}
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
        }))
      }
    />
  );
}
