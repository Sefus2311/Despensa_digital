import { Card } from "@/components/Card";
import { CanonicalProductRow } from "@/components/admin/CanonicalProductRow";
import { RetailerProductRow } from "@/components/admin/RetailerProductRow";
import { createClient } from "@/lib/supabase/server";
import type { CanonicalProduct, RetailerProduct } from "@/lib/types/database";

type SimilarProduct = { id: string; canonical_name: string; category: string | null; similarity: number };
type RetailerProductRowShape = RetailerProduct & {
  canonical_products: { canonical_name: string } | null;
};

// El acceso mínimo (delegate/admin) ya lo exige app/(app)/admin/layout.tsx.
// No incluye fusión de productos: section 15/16 de la tarea la deja como
// "preparar pero no implementar todavía" por el riesgo de mezclar historial.
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dup?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const dup = params.dup?.trim() ?? "";

  const supabase = await createClient();

  const canonicalQuery = supabase
    .from("canonical_products")
    .select("id, canonical_name, category, default_unit")
    .order("canonical_name", { ascending: true })
    .limit(50);
  if (q) canonicalQuery.ilike("canonical_name", `%${q}%`);

  const retailerQuery = supabase
    .from("retailer_products")
    .select("id, retailer, brand, commercial_name, package_quantity, package_unit, canonical_products(canonical_name)")
    .order("commercial_name", { ascending: true })
    .limit(50);
  if (q) retailerQuery.or(`commercial_name.ilike.%${q}%,brand.ilike.%${q}%`);

  const [{ data: canonicalProducts, error: canonicalError }, { data: retailerProductsData, error: retailerError }] =
    await Promise.all([canonicalQuery, retailerQuery]);
  const retailerProducts = retailerProductsData as RetailerProductRowShape[] | null;

  let similar: SimilarProduct[] = [];
  if (dup) {
    const { data } = await supabase.rpc("find_similar_canonical_products", { p_name: dup, p_limit: 10 });
    similar = (data ?? []) as SimilarProduct[];
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Productos</h1>
        <p className="text-sm text-neutral-500">Canónicos y de tienda del intérprete global.</p>
      </header>

      <Card>
        <form method="GET" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar producto o marca"
            className="ui-field__input flex-1"
          />
          <button type="submit" className="rounded-xl border border-[var(--color-border)] px-4 font-medium">
            Buscar
          </button>
        </form>
      </Card>

      <Card>
        <p className="text-sm font-medium mb-2">Detectar posibles duplicados</p>
        <form method="GET" className="flex gap-2">
          <input
            type="search"
            name="dup"
            defaultValue={dup}
            placeholder="Ej. Yogurt griego natural"
            className="ui-field__input flex-1"
          />
          <button type="submit" className="rounded-xl border border-[var(--color-border)] px-4 font-medium">
            Comparar
          </button>
        </form>
        {dup && (
          <div className="mt-3 flex flex-col divide-y divide-neutral-100">
            {similar.length === 0 && <p className="text-sm text-neutral-500">Sin coincidencias similares.</p>}
            {similar.map((s) => (
              <div key={s.id} className="py-2 flex items-center justify-between">
                <span className="text-sm">{s.canonical_name}</span>
                <span className="text-[15px] text-neutral-500">{Math.round(s.similarity * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2">Productos canónicos</h2>
        <Card className="divide-y divide-neutral-100">
          {canonicalError && <p className="text-sm text-red-600">No se pudieron cargar.</p>}
          {!canonicalError && (canonicalProducts ?? []).length === 0 && (
            <p className="text-sm text-neutral-500">Sin resultados.</p>
          )}
          {(canonicalProducts as Pick<CanonicalProduct, "id" | "canonical_name" | "category" | "default_unit">[] | null)?.map(
            (p) => (
              <CanonicalProductRow
                key={p.id}
                id={p.id}
                canonicalName={p.canonical_name}
                category={p.category}
                defaultUnit={p.default_unit}
              />
            )
          )}
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Productos de tienda</h2>
        <Card className="divide-y divide-neutral-100">
          {retailerError && <p className="text-sm text-red-600">No se pudieron cargar.</p>}
          {!retailerError && (retailerProducts ?? []).length === 0 && (
            <p className="text-sm text-neutral-500">Sin resultados.</p>
          )}
          {retailerProducts?.map((p) => (
            <RetailerProductRow
              key={p.id}
              id={p.id}
              retailer={p.retailer}
              brand={p.brand}
              commercialName={p.commercial_name}
              packageQuantity={p.package_quantity}
              packageUnit={p.package_unit}
              canonicalName={p.canonical_products?.canonical_name ?? "—"}
            />
          ))}
        </Card>
      </div>
    </div>
  );
}
