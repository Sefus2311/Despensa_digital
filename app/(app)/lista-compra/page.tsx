import { Card } from "@/components/Card";
import { AddItemForm } from "@/components/lista-compra/AddItemForm";
import { ShoppingListRow } from "@/components/lista-compra/ShoppingListRow";
import { getCurrentUserAndHome } from "@/lib/home";
import type { ShoppingListItem } from "@/lib/types/database";

export default async function ListaCompraPage() {
  const { supabase, homeId } = await getCurrentUserAndHome();

  const { data } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("home_id", homeId)
    .order("created_at", { ascending: false });

  const items = (data ?? []) as ShoppingListItem[];
  const pendientes = items.filter((i) => !i.is_checked);
  const comprados = items.filter((i) => i.is_checked);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Lista de la compra</h1>
        <p className="text-[15px] text-[var(--color-muted)] mt-1">De tu Casa activa.</p>
      </header>

      <Card>
        <AddItemForm />
      </Card>

      <div>
        <h2 className="font-medium mb-1">Por comprar ({pendientes.length})</h2>
        {pendientes.length === 0 ? (
          <Card>
            <p className="text-[15px] text-[var(--color-muted)]">Nada pendiente por ahora.</p>
          </Card>
        ) : (
          <Card className="flex flex-col divide-y divide-[var(--color-border)]">
            {pendientes.map((item) => (
              <ShoppingListRow key={item.id} item={item} />
            ))}
          </Card>
        )}
      </div>

      {comprados.length > 0 && (
        <div>
          <h2 className="font-medium mb-1">Ya comprado ({comprados.length})</h2>
          <Card className="flex flex-col divide-y divide-[var(--color-border)]">
            {comprados.map((item) => (
              <ShoppingListRow key={item.id} item={item} />
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
