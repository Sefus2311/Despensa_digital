import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons/Icon";
import { CocinarPanel, type CocinarIngredient } from "@/components/recetas/CocinarPanel";
import { getCurrentUserAndHome } from "@/lib/home";
import { decidableIngredients, isShoppableIngredient, scaleIngredients, toBaseUnits } from "@/lib/recipes";
import { canonicalizeUnit } from "@/lib/units";
import type { Receta, RecetaIngrediente, RecetaPaso } from "@/lib/types/database";
import { addMissingToShoppingList } from "./actions";

const MAX_RACIONES = 100;

// Raciones deseadas: entero 1..100 desde ?raciones=; si falta o es inválido,
// las de la receta (factor ×1, mismas cantidades que la receta original).
function parseRaciones(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_RACIONES ? n : fallback;
}

// "Quiero cocinar esto": muestra TODOS los ingredientes (sección 3 del
// encargo) para que el usuario decida ingrediente a ingrediente si ya lo
// tiene o necesita comprarlo -- deliberadamente sin cruzar con la despensa
// (eso es "disponibilidad", no "normalización"; ver lib/recipes.ts). La
// comparación automática queda para una fase futura sin rediseñar este flujo.
export default async function CocinarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ raciones?: string }>;
}) {
  const { id } = await params;
  const { raciones: racionesParam } = await searchParams;
  const { supabase } = await getCurrentUserAndHome();

  const { data: recetaData } = await supabase.from("recetas").select("*").eq("id", id).maybeSingle();
  if (!recetaData) notFound();
  const receta = recetaData as Receta;

  const [{ data: ingredientesData }, { data: pasosData }] = await Promise.all([
    supabase.from("receta_ingredientes").select("*").eq("receta_id", id).order("orden", { ascending: true }),
    supabase.from("receta_pasos").select("*").eq("receta_id", id).order("numero", { ascending: true }),
  ]);

  const racionesDeseadas = parseRaciones(racionesParam, receta.raciones);
  // cantidadNecesaria = cantidadReceta × racionesDeseadas / racionesBaseReceta,
  // calculada por ingrediente sobre copias (scaleIngredients no muta ni
  // comparte estado entre ingredientes); después kg -> gr. y l -> ml.
  const ingredientes = toBaseUnits(
    scaleIngredients((ingredientesData ?? []) as RecetaIngrediente[], receta.raciones, racionesDeseadas)
  );
  const pasos = (pasosData ?? []) as RecetaPaso[];

  // Solo los ingredientes con unidad ud./gr./ml. requieren una decisión --
  // los demás (cucharadas, al gusto...) nunca van a la lista de la compra.
  const decidibles: CocinarIngredient[] = decidableIngredients(ingredientes).map((ing) => ({
    id: ing.id,
    nombreMostrado: ing.nombre_mostrado,
    cantidad: ing.cantidad,
    unidad: canonicalizeUnit(ing.unidad),
    productoId: ing.producto_id,
  }));
  const noComprables = ingredientes.filter((ing) => !isShoppableIngredient(ing)).map((ing) => ing.nombre_mostrado);

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

      <CocinarPanel
        ingredientes={decidibles}
        noComprables={noComprables}
        action={addMissingToShoppingList.bind(null, id)}
      />

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
