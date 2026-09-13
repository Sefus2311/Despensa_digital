import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons/Icon";
import { getCurrentUserAndHousehold } from "@/lib/household";
import { getReceiptImageUrl } from "../../tickets/actions";
import { ReceiptImage } from "@/components/ReceiptImage";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, householdId } = await getCurrentUserAndHousehold();

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, store_name, purchase_date, total_amount, image_path")
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
    <div className="flex flex-col gap-4">
      <header>
        <div className="flex items-center justify-between">
          <Link href="/historial" className="text-sm text-teal-700">
            ← Historial
          </Link>
          <Link
            href={`/tickets/${receipt.id}/review`}
            className="flex items-center gap-1 text-sm font-medium text-teal-700"
          >
            <Icon name="editar" size={16} />
            Editar
          </Link>
        </div>
        <h1 className="text-2xl font-semibold mt-1">
          {receipt.store_name || "Ticket"}
        </h1>
        <p className="text-sm text-neutral-500">
          {receipt.purchase_date
            ? new Date(receipt.purchase_date).toLocaleDateString("es-ES")
            : "Sin fecha"}{" "}
          ·{" "}
          {receipt.total_amount != null
            ? `${Number(receipt.total_amount).toFixed(2)} €`
            : "Sin total"}
        </p>
      </header>

      {imageUrl && <ReceiptImage src={imageUrl} isPdf={isPdf} />}

      <div className="flex flex-col gap-2">
        {(items ?? []).map((item) => (
          <Card key={item.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{item.raw_name}</p>
              <p className="text-xs text-neutral-500">
                {Number(item.quantity)} {item.unit ?? ""}
              </p>
            </div>
            <span className="text-sm font-medium">
              {item.total_price != null
                ? `${Number(item.total_price).toFixed(2)} €`
                : "—"}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
