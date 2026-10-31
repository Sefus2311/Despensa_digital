import Link from "next/link";
import { Card } from "@/components/Card";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/icons/Icon";
import { CategoryCard } from "@/components/despensa/CategoryCard";
import { getCurrentUserAndHome } from "@/lib/home";
import { computeStockQuantity } from "@/lib/pantry";
import { categoryFromSlug, PRODUCT_CATEGORIES } from "@/lib/constants/product-categories";
import type { HomePantryItem } from "@/lib/types/database";

export default async function DespensaPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { supabase, homeId } = await getCurrentUserAndHome();
  const { categoria } = await searchParams;
  const selectedCategory = categoria ? categoryFromSlug(categoria) : null;

  const [{ data: pantryData }, { data: pendingCountData }] = await Promise.all([
    supabase.rpc("get_home_pantry", { p_home_id: homeId }),
    supabase.rpc("count_home_pending_interpretation", { p_home_id: homeId }),
  ]);

  // Más reciente arriba, más antiguo abajo; sin fecha de compra al final
  // (fechas ISO yyyy-mm-dd: la comparación de cadenas ya es cronológica).
  const products = ((pantryData ?? []) as HomePantryItem[]).sort((a, b) => {
    if (!a.purchase_date && !b.purchase_date) return 0;
    if (!a.purchase_date) return 1;
    if (!b.purchase_date) return -1;
    return b.purchase_date.localeCompare(a.purchase_date);
  });
  const pendingCount = (pendingCountData as number | null) ?? 0;

  if (selectedCategory) {
    const categoryProducts = products.filter((p) => p.category === selectedCategory);
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <Link
            href="/despensa"
            className="inline-flex items-center gap-1 text-[15px] font-medium text-[var(--color-primary-text)]"
          >
            <Icon name="volver" size={18} />
            Todas las categorías
          </Link>
          <h1 className="text-2xl font-semibold font-display uppercase">{selectedCategory}</h1>
        </header>

        {categoryProducts.length === 0 ? (
          <Card>
            <p className="text-[15px] text-[var(--color-muted)]">
              Todavía no hay productos guardados en esta categoría.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {categoryProducts.map((p) => {
              const stock = computeStockQuantity(p.quantity, p.package_quantity);
              return (
                <li key={p.canonical_product_id}>
                  <Link href={`/despensa/${p.canonical_product_id}`} className="block">
                    <Card>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{p.canonical_name}</p>
                        <Icon name="editar" size={16} />
                      </div>
                      {p.brand && (
                        <p className="text-[15px] text-[var(--color-muted)] mt-0.5 uppercase">{p.brand}</p>
                      )}
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
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Mi despensa</h1>
        <p className="text-[15px] text-[var(--color-muted)] mt-1">Explora tu despensa por categorías.</p>
      </header>

      {pendingCount > 0 && (
        <Alert tone="warning">
          {pendingCount} producto{pendingCount === 1 ? "" : "s"} de tus tickets{" "}
          {pendingCount === 1 ? "todavía no está validado" : "todavía no están validados"} por
          el intérprete y no {pendingCount === 1 ? "aparece" : "aparecen"} aquí todavía.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        {PRODUCT_CATEGORIES.map((category, index) => (
          <CategoryCard key={category} category={category} priority={index === 0} />
        ))}
      </div>
    </div>
  );
}
