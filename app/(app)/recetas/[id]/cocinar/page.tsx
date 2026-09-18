import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons/Icon";
import { CocinarPanel, type MissingItem } from "@/components/recetas/CocinarPanel";
import { getCurrentUserAndHome } from "@/lib/home";
import { computeStockQuantity } from "@/lib/pantry";
import { summarizeAvailability, type PantryStockRow } from "@/lib/recipes";
import type { Receta, RecetaIngrediente, RecetaPaso } from "@/lib/types/database";
import { addMissingToShoppingList } from "./actions";

interface PantryRow {
  canonical_product_id: string;
  quantity: number;
  package_quantity: number | null;
  unit: string | null;
}

export default async function CocinarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, homeId } = await getCurrentUserAndHome();

  const { data: recetaData } = await supabase.from("recetas").select("*").eq("id", id).maybeSingle();
  if (!recetaData) notFound();
  const receta = recetaData as Receta;

  const [{ data: ingredientesData }, { data: pasosData }, { data: pantryData }] = await Promise.all([
    supabase.from("receta_ingredientes").select("*").eq("receta_id", id).order("orden", { ascending: true }),
    supabase.from("receta_pasos").select("*").eq("receta_id", id).order("numero", { ascending: true }),
    supabase.rpc("get_home_pantry", { p_home_id: homeId }),
  ]);

  const ingredientes = (ingredientesData ?? []) as RecetaIngrediente[];
  const pasos = (pasosData ?? []) as RecetaPaso[];
  const pantry: PantryStockRow[] = ((pantryData ?? []) as PantryRow[]).map((p) => ({
    canonical_product_id: p.canonical_product_id,
    stock: computeStockQuantity(p.quantity, p.package_quantity),
    unit: p.unit,
  }));

  const summary = summarizeAvailability(ingredientes, pantry);

  function toMissingItem(check: (typeof summary.checks)[number]): MissingItem {
    return {
      productoId: check.ingredient.producto_id,
      nombreMostrado: check.ingredient.nombre_mostrado,
      cantidad: check.missingQuantity ?? check.ingredient.cantidad,
      unidad: check.ingredient.unidad,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Link
          href={`/recetas/${id}`}
          className="inline-flex items-center gap-1 text-[15px] font-medium text-[var(--color-primary-text)]"
        >
          <Icon name="volver" size={18} />
          {receta.titulo}
        </Link>
        <h1 className="text-2xl font-semibold font-display">A cocinar</h1>
      </header>

      {summary.canCook ? (
        <Card>
          <p className="text-[15px] font-medium text-[var(--color-primary-text)]">
            Puedes cocinarla — tienes todos los ingredientes necesarios.
          </p>
        </Card>
      ) : (
        <CocinarPanel
          requeridos={summary.missingRequired.map(toMissingItem)}
          opcionales={summary.missingOptional.map(toMissingItem)}
          action={addMissingToShoppingList.bind(null, id)}
        />
      )}

      <div>
        <h2 className="font-medium mb-2">Pasos de preparación</h2>
        <Card className="flex flex-col gap-3">
          {pasos.length === 0 && (
            <p className="text-[15px] text-[var(--color-muted)]">Esta receta todavía no tiene pasos.</p>
          )}
          {pasos.map((paso) => (
            <div key={paso.id} className="flex gap-2">
              <span className="font-semibold text-[var(--color-muted)]">{paso.numero}.</span>
              <p className="text-[15px]">{paso.texto}</p>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
