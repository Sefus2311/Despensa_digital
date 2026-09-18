import Link from "next/link";
import { Card } from "@/components/Card";
import { RecipeCard } from "@/components/recetas/RecipeCard";
import { getCurrentUserAndHome } from "@/lib/home";
import { computeStockQuantity } from "@/lib/pantry";
import { summarizeAvailability, type PantryStockRow } from "@/lib/recipes";
import type { Receta, RecetaIngrediente } from "@/lib/types/database";

interface PantryRow {
  canonical_product_id: string;
  quantity: number;
  package_quantity: number | null;
  unit: string | null;
}

export default async function RecetasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase, homeId, homes } = await getCurrentUserAndHome();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  let recetasQuery = supabase
    .from("recetas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (query) recetasQuery = recetasQuery.ilike("titulo", `%${query}%`);

  const [{ data: recetasData }, { data: pantryData }] = await Promise.all([
    recetasQuery,
    supabase.rpc("get_home_pantry", { p_home_id: homeId }),
  ]);

  const recetas = (recetasData ?? []) as Receta[];
  const pantry: PantryStockRow[] = ((pantryData ?? []) as PantryRow[]).map((p) => ({
    canonical_product_id: p.canonical_product_id,
    stock: computeStockQuantity(p.quantity, p.package_quantity),
    unit: p.unit,
  }));

  const recetaIds = recetas.map((r) => r.id);
  const { data: ingredientesData } =
    recetaIds.length > 0
      ? await supabase.from("receta_ingredientes").select("*").in("receta_id", recetaIds)
      : { data: [] as RecetaIngrediente[] };
  const ingredientesPorReceta = new Map<string, RecetaIngrediente[]>();
  for (const ing of (ingredientesData ?? []) as RecetaIngrediente[]) {
    const list = ingredientesPorReceta.get(ing.receta_id) ?? [];
    list.push(ing);
    ingredientesPorReceta.set(ing.receta_id, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Recetas</h1>
        <p className="text-[15px] text-[var(--color-muted)] mt-1">
          {homes.length > 1 ? "Se comprueban contra la despensa de tu Casa activa." : "Comprueba qué puedes cocinar hoy."}
        </p>
      </header>

      <Card className="flex flex-col gap-3">
        <form method="GET" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Buscar receta"
            className="ui-field__input flex-1"
          />
          <button type="submit" className="rounded-xl border border-[var(--color-border)] px-4 font-medium">
            Buscar
          </button>
        </form>
        <Link href="/recetas/new" className="ui-button ui-button--primary">
          + Nueva receta
        </Link>
      </Card>

      {recetas.length === 0 ? (
        <Card>
          <p className="text-[15px] text-[var(--color-muted)]">
            {query ? "Sin resultados." : "Todavía no hay recetas. Crea la primera."}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {recetas.map((receta) => (
            <li key={receta.id}>
              <RecipeCard
                receta={receta}
                availability={summarizeAvailability(ingredientesPorReceta.get(receta.id) ?? [], pantry)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
