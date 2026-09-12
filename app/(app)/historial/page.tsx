import Link from "next/link";
import { Card } from "@/components/Card";
import { getCurrentUserAndHousehold } from "@/lib/household";

export default async function HistorialPage() {
  const { supabase, householdId } = await getCurrentUserAndHousehold();

  const { data: receipts } = await supabase
    .from("receipts")
    .select("id, store_name, purchase_date, total_amount, status")
    .eq("household_id", householdId)
    .order("purchase_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const receiptIds = (receipts ?? []).map((r) => r.id);
  const { data: itemCounts } = receiptIds.length
    ? await supabase
        .from("receipt_items")
        .select("receipt_id")
        .in("receipt_id", receiptIds)
    : { data: [] as { receipt_id: string }[] };

  const countByReceipt = new Map<string, number>();
  for (const row of itemCounts ?? []) {
    countByReceipt.set(row.receipt_id, (countByReceipt.get(row.receipt_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Historial</h1>
      </header>

      {!receipts || receipts.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">
            Todavía no has guardado ningún ticket. Pulsa &quot;Escanear&quot;
            para añadir el primero.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {receipts.map((r) => (
            <li key={r.id}>
              <Link
                href={
                  r.status === "reviewed"
                    ? `/historial/${r.id}`
                    : `/tickets/${r.id}/review`
                }
              >
                <Card>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {r.store_name || "Ticket sin nombre"}
                    </span>
                    {r.status !== "reviewed" && (
                      <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
                        Pendiente
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-neutral-500 mt-1 flex justify-between">
                    <span>
                      {r.purchase_date
                        ? new Date(r.purchase_date).toLocaleDateString("es-ES")
                        : "Sin fecha"}
                    </span>
                    <span>
                      {r.total_amount != null
                        ? `${Number(r.total_amount).toFixed(2)} €`
                        : "—"}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {countByReceipt.get(r.id) ?? 0} productos
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
