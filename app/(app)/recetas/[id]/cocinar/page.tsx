import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons/Icon";
import { CocinarPanel, type MissingItem } from "@/components/recetas/CocinarPanel";
import { getCurrentUserAndHome } from "@/lib/home";
import { computeStockQuantity } from "@/lib/pantry";
import {
  isShoppableIngredient,
  scaleIngredients,
  toBaseUnits,
  summarizeAvailability,
  type PantryStockRow,
} from "@/lib/recipes";
import { canonicalizeUnit, toBaseUnit } from "@/lib/units";
import type { Receta, RecetaIngrediente, RecetaPaso } from "@/lib/types/database";
import { addMissingToShoppingList } from "./actions";

interface PantryRow {
  canonical_product_id: string;
  quantity: number;
  package_quantity: number | null;
  unit: string | null;
}

const MAX_RACIONES = 100;

// Raciones deseadas: entero 1..100 desde ?raciones=; si falta o es inválido,
// las de la receta (factor ×1, mismas cantidades que la receta original).
function parseRaciones(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_RACIONES ? n : fallback;
}

export default async function CocinarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ raciones?: string }>;
}) {
  const { id } = await params;
  const { raciones: racionesParam } = await searchParams;
  const { supabase, homeId } = await getCurrentUserAndHome();

  const { data: recetaData } = await supabase.from("recetas").select("*").eq("id", id).maybeSingle();
  if (!recetaData) notFound();
  const receta = recetaData as Receta;

  const [{ data: ingredientesData }, { data: pasosData }, { data: pantryData }] = await Promise.all([
    supabase.from("receta_ingredientes").select("*").eq("receta_id", id).order("orden", { ascending: true }),
    supabase.from("receta_pasos").select("*").eq("receta_id", id).order("numero", { ascending: true }),
    supabase.rpc("get_home_pantry", { p_home_id: homeId }),
  ]);

  const racionesDeseadas = parseRaciones(racionesParam, receta.raciones);
  // cantidadNecesaria = cantidadReceta × racionesDeseadas / racionesBaseReceta,
  // calculada por ingrediente sobre copias (scaleIngredients no muta ni
  // comparte estado entre ingredientes).
  // Después kg -> gr. y l -> ml., para comparar con la despensa y para la lista.
  const ingredientes = toBaseUnits(
    scaleIngredients((ingredientesData ?? []) as RecetaIngrediente[], receta.raciones, racionesDeseadas)
  );
  const pasos = (pasosData ?? []) as RecetaPaso[];
  const pantry: PantryStockRow[] = ((pantryData ?? []) as PantryRow[]).map((p) => {
    const base = toBaseUnit(computeStockQuantity(p.quantity, p.package_quantity), p.unit);
    return { canonical_product_id: p.canonical_product_id, stock: base.cantidad ?? 0, unit: base.unidad };
  });

  const summary = summarizeAvailability(ingredientes, pantry);

  function toMissingItem(check: (typeof summary.checks)[number]): MissingItem {
    return {
      productoId: check.ingredient.producto_id,
      nombreMostrado: check.ingredient.nombre_mostrado,
      cantidad: check.missingQuantity ?? check.ingredient.cantidad,
      unidad: canonicalizeUnit(check.ingredient.unidad),
    };
  }

  // Filtro de la lista de la compra: solo pasan los ingredientes con unidad
  // ud./gr./ml. Los demás (cucharadas, al gusto...) siguen en la receta pero
  // no generan línea.
  const requeridosComprables = summary.missingRequired.filter((c) => isShoppableIngredient(c.ingredient));
  const opcionalesComprables = summary.missingOptional.filter((c) => isShoppableIngredient(c.ingredient));
  const noComprables = [...summary.missingRequired, ...summary.missingOptional]
    .filter((c) => !isShoppableIngredient(c.ingredient))
    .map((c) => c.ingredient.nombre_mostrado);

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

      <Card>
        <form method="GET" className="flex items-end gap-2">
          <div className="ui-field flex-1">
            <label className="ui-field__label" htmlFor="raciones">
              Raciones a cocinar (la receta es para {receta.raciones})
            </label>
            <input
              id="raciones"
              name="raciones"
              type="number"
              min={1}
              max={MAX_RACIONES}
              step={1}
              defaultValue={racionesDeseadas}
              className="ui-field__input"
            />
          </div>
          <button type="submit" className="ui-button ui-button--secondary">
            Recalcular
          </button>
        </form>
      </Card>

      {summary.canCook ? (
        <Card>
          <p className="text-[15px] font-medium text-[var(--color-primary-text)]">
            Puedes cocinarla — tienes todos los ingredientes necesarios.
          </p>
        </Card>
      ) : (
        <CocinarPanel
          requeridos={requeridosComprables.map(toMissingItem)}
          opcionales={opcionalesComprables.map(toMissingItem)}
          noComprables={noComprables}
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
