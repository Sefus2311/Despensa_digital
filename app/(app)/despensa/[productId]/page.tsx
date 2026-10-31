import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { EditPantryItemForm } from "@/components/despensa/EditPantryItemForm";
import { Icon } from "@/components/icons/Icon";
import { CATEGORY_SLUG } from "@/lib/constants/product-categories";
import { getCurrentUserAndHome } from "@/lib/home";
import { computeStockQuantity } from "@/lib/pantry";
import { canonicalizeUnit } from "@/lib/units";
import type { HomePantryItem } from "@/lib/types/database";

export default async function EditPantryItemPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const { supabase, homeId } = await getCurrentUserAndHome();

  const { data: pantryData } = await supabase.rpc("get_home_pantry", { p_home_id: homeId });
  const item = ((pantryData ?? []) as HomePantryItem[]).find(
    (p) => p.canonical_product_id === productId
  );

  if (!item) {
    notFound();
  }

  const purchaseStock = computeStockQuantity(item.purchase_quantity, item.purchase_package_quantity);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Link
          href={`/despensa?categoria=${CATEGORY_SLUG[item.category]}`}
          className="inline-flex items-center gap-1 text-[15px] font-medium text-[var(--color-primary-text)]"
        >
          <Icon name="volver" size={18} />
          Volver a la categoría
        </Link>
        <h1 className="text-2xl font-semibold font-display">Editar artículo</h1>
      </header>

      <EditPantryItemForm
        canonicalProductId={item.canonical_product_id}
        initialName={item.canonical_name}
        initialCategory={item.category}
        initialBrand={item.brand ?? ""}
        initialStock={computeStockQuantity(item.quantity, item.package_quantity)}
        initialUnit={canonicalizeUnit(item.unit) ?? ""}
      />

      <Card className="flex flex-col gap-2">
        <h2 className="font-medium">Compra de origen</h2>
        <p className="text-[15px] text-[var(--color-muted)]">
          Este registro es permanente: editar el artículo no lo modifica, aunque la cantidad disponible llegue a cero.
        </p>
        <dl className="text-[15px] flex flex-col gap-1">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-muted)]">Supermercado</dt>
            <dd className="text-right">{item.store_name ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-muted)]">Fecha</dt>
            <dd className="text-right">
              {item.purchase_date ? new Date(item.purchase_date).toLocaleDateString("es-ES") : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-muted)]">En el ticket</dt>
            <dd className="text-right font-mono break-words min-w-0">{item.raw_name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-muted)]">Comprado</dt>
            <dd className="text-right">
              {purchaseStock} {item.purchase_unit ?? ""}
            </dd>
          </div>
        </dl>
        <Link
          href={`/historial/${item.receipt_id}`}
          className="inline-flex min-h-11 items-center text-[15px] font-medium text-[var(--color-primary-text)]"
        >
          Ver ticket
        </Link>
      </Card>
    </div>
  );
}
