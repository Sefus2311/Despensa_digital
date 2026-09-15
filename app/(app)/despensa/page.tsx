import { Card } from "@/components/Card";
import { getCurrentUserAndHome } from "@/lib/home";

interface PantryRow {
  canonical_product_id: string;
  canonical_name: string;
  category: string | null;
  brand: string | null;
  quantity: number;
  unit: string | null;
  purchase_date: string | null;
  raw_name: string;
}

export default async function DespensaPage() {
  const { supabase, homeId } = await getCurrentUserAndHome();

  const [{ data: pantryData }, { data: pendingCountData }] = await Promise.all([
    supabase.rpc("get_home_pantry", { p_home_id: homeId }),
    supabase.rpc("count_home_pending_interpretation", { p_home_id: homeId }),
  ]);

  const products = ((pantryData ?? []) as PantryRow[]).sort((a, b) =>
    a.canonical_name.localeCompare(b.canonical_name, "es")
  );
  const pendingCount = (pendingCountData as number | null) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Mi despensa</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Productos ya interpretados de tus tickets. Todavía no calculamos stock real.
        </p>
      </header>

      {pendingCount > 0 && (
        <Card className="bg-amber-50">
          <p className="text-sm text-amber-800">
            {pendingCount} producto{pendingCount === 1 ? "" : "s"} de tus tickets{" "}
            {pendingCount === 1 ? "todavía no está validado" : "todavía no están validados"} por
            el intérprete y no {pendingCount === 1 ? "aparece" : "aparecen"} aquí todavía.
          </p>
        </Card>
      )}

      {products.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">
            {pendingCount > 0
              ? "Tus productos están pendientes de validación por el intérprete."
              : "Aún no hay productos. Escanea tu primer ticket para empezar."}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((p) => (
            <li key={p.canonical_product_id}>
              <Card>
                <p className="font-medium">{p.canonical_name}</p>
                {(p.brand || p.category) && (
                  <p className="text-xs text-neutral-400">
                    {[p.brand, p.category].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="text-sm text-neutral-500 mt-1 flex justify-between">
                  <span>
                    Última compra:{" "}
                    {p.purchase_date
                      ? new Date(p.purchase_date).toLocaleDateString("es-ES")
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
