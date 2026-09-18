import { Card } from "@/components/Card";
import { Alert } from "@/components/ui/Alert";
import { getCurrentUserAndHome } from "@/lib/home";
import { computeStockQuantity, formatCategoryBrandLine } from "@/lib/pantry";
import type { ProductCategory } from "@/lib/constants/product-categories";

interface PantryRow {
  canonical_product_id: string;
  canonical_name: string;
  category: ProductCategory;
  brand: string | null;
  quantity: number;
  package_quantity: number | null;
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
        <h1 className="text-2xl font-semibold font-display">Mi despensa</h1>
        <p className="text-[15px] text-[var(--color-muted)] mt-1">
          Productos ya interpretados de tus tickets.
        </p>
      </header>

      {pendingCount > 0 && (
        <Alert tone="warning">
          {pendingCount} producto{pendingCount === 1 ? "" : "s"} de tus tickets{" "}
          {pendingCount === 1 ? "todavía no está validado" : "todavía no están validados"} por
          el intérprete y no {pendingCount === 1 ? "aparece" : "aparecen"} aquí todavía.
        </Alert>
      )}

      {products.length === 0 ? (
        <Card>
          <p className="text-[15px] text-[var(--color-muted)]">
            {pendingCount > 0
              ? "Tus productos están pendientes de validación por el intérprete."
              : "Aún no hay productos. Escanea tu primer ticket para empezar."}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((p) => {
            const stock = computeStockQuantity(p.quantity, p.package_quantity);
            return (
              <li key={p.canonical_product_id}>
                <Card>
                  <p className="font-semibold">{p.canonical_name}</p>
                  <p className="text-[15px] text-[var(--color-muted)] mt-0.5">
                    {formatCategoryBrandLine(p.category, p.brand)}
                  </p>
                  <div className="text-[15px] text-[var(--color-muted)] mt-1 flex justify-between items-baseline">
                    <span>
                      Comprado:{" "}
                      {p.purchase_date
                        ? new Date(p.purchase_date).toLocaleDateString("es-ES")
                        : "—"}
                    </span>
                    <span
                      className="text-[var(--color-text)] font-semibold"
                      aria-label={`Stock: ${stock} ${p.unit ?? "unidades"}`}
                    >
                      {stock}
                    </span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
