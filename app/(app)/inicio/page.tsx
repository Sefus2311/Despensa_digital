import Link from "next/link";
import { Card } from "@/components/Card";
import { getCurrentUserAndHousehold } from "@/lib/household";

export default async function InicioPage() {
  const { supabase, householdId } = await getCurrentUserAndHousehold();

  const { count: productCount } = await supabase
    .from("receipt_items")
    .select("id, receipts!inner(household_id)", { count: "exact", head: true })
    .eq("receipts.household_id", householdId);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Inicio</h1>
      </header>

      <Card>
        <h2 className="font-medium mb-1">Próximamente necesitarás</h2>
        <p className="text-sm text-neutral-500">
          Todavía necesitamos más compras para aprender tu consumo.
        </p>
      </Card>

      <Card>
        <h2 className="font-medium mb-1">¿Qué puedo cocinar?</h2>
        <p className="text-sm text-neutral-500">
          Cuando conozcamos mejor tu despensa podremos proponerte comidas.
        </p>
      </Card>

      <Link href="/despensa">
        <Card>
          <h2 className="font-medium mb-1">Mi despensa</h2>
          <p className="text-sm text-neutral-500">
            {productCount ?? 0} producto{productCount === 1 ? "" : "s"}{" "}
            registrado{productCount === 1 ? "" : "s"}.
          </p>
        </Card>
      </Link>
    </div>
  );
}
