import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons/Icon";
import { getCurrentUserAndHome } from "@/lib/home";
import { formatCurrency } from "@/lib/format";
import { getReceiptImageUrl } from "../../tickets/actions";
import { ReceiptImage } from "@/components/ReceiptImage";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, homeId } = await getCurrentUserAndHome();

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, store_name, purchase_date, total_amount, image_path")
    .eq("id", id)
    .eq("home_id", homeId)
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
          <Link href="/historial" className="text-[15px] text-[var(--color-primary-text)]">
            ← Historial
          </Link>
          <Link
            href={`/tickets/${receipt.id}/review`}
            className="flex items-center gap-1 text-[15px] font-medium text-[var(--color-primary-text)]"
          >
            <Icon name="editar" size={16} />
            Editar
          </Link>
        </div>
        <h1 className="text-2xl font-semibold font-display mt-1">
          {receipt.store_name || "Ticket"}
        </h1>
        <p className="text-[15px] text-[var(--color-muted)]">
          {receipt.purchase_date
            ? new Date(receipt.purchase_date).toLocaleDateString("es-ES")
            : "Sin fecha"}{" "}
          ·{" "}
          {receipt.total_amount != null ? formatCurrency(receipt.total_amount) : "Sin total"}
        </p>
      </header>

      {imageUrl && <ReceiptImage src={imageUrl} isPdf={isPdf} />}

      <div className="flex flex-col gap-2">
        {(items ?? []).map((item) => (
          <Card key={item.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-[15px]">{item.raw_name}</p>
              <p className="text-[15px] text-[var(--color-muted)]">
                {Number(item.quantity)} {item.unit ?? ""}
              </p>
            </div>
            <span className="text-[15px] font-medium">
              {item.total_price != null ? formatCurrency(item.total_price) : "—"}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
