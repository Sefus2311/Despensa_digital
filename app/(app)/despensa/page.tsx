import { Card } from "@/components/Card";
import { getCurrentUserAndHousehold } from "@/lib/household";

interface Row {
  raw_name: string;
  quantity: number;
  unit: string | null;
  created_at: string;
  receipts: { household_id: string; purchase_date: string | null } | null;
}

export default async function DespensaPage() {
  const { supabase, householdId } = await getCurrentUserAndHousehold();

  const { data } = await supabase
    .from("receipt_items")
    .select(
      "raw_name, quantity, unit, created_at, receipts!inner(household_id, purchase_date)"
    )
    .eq("receipts.household_id", householdId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  // Agrupación simple por nombre normalizado: nos quedamos con la compra
  // más reciente de cada producto. En V0.2 esto se sustituirá por un
  // product_id canónico + stock estimado real.
  const grouped = new Map<
    string,
    { name: string; quantity: number; unit: string | null; date: string | null }
  >();

  for (const row of rows) {
    const key = row.raw_name.trim().toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: row.raw_name,
        quantity: Number(row.quantity),
        unit: row.unit,
        date: row.receipts?.purchase_date ?? null,
      });
    }
  }

  const products = Array.from(grouped.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Mi despensa</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Productos vistos en tus tickets. Todavía no calculamos stock real.
        </p>
      </header>

      {products.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">
            Aún no hay productos. Escanea tu primer ticket para empezar.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((p) => (
            <li key={p.name}>
              <Card>
                <p className="font-medium">{p.name}</p>
                <div className="text-sm text-neutral-500 mt-1 flex justify-between">
                  <span>
                    Última compra:{" "}
                    {p.date
                      ? new Date(p.date).toLocaleDateString("es-ES")
                      : "—"}
                  </span>
                  <span>
                    Cantidad: {p.quantity} {p.unit ?? ""}
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
