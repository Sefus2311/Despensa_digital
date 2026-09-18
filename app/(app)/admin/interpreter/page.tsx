import { Card } from "@/components/Card";
import { AliasRow } from "@/components/admin/AliasRow";
import { createClient } from "@/lib/supabase/server";

// El acceso mínimo (delegate/admin) ya lo exige app/(app)/admin/layout.tsx.
// Diccionario global: consulta y corrección de conocimiento ya aprobado
// (product_aliases -> retailer_products -> canonical_products).
//
// Simplificación intencional de V0.1: se trae una página razonable de
// aliases (los más recientemente actualizados) y se filtra en el servidor
// con JS en vez de construir una consulta con filtros anidados sobre las
// tablas relacionadas -- suficiente mientras el catálogo es pequeño.
type AliasRowShape = {
  id: string;
  retailer: string;
  raw_name: string;
  confidence_score: number | null;
  times_confirmed: number;
  active: boolean;
  deleted_at: string | null;
  retailer_products: {
    brand: string | null;
    canonical_products: { canonical_name: string; category: string | null } | null;
  } | null;
};

export default async function AdminInterpreterPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    retailer?: string;
    category?: string;
    min_confidence?: string;
    estado?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const retailer = params.retailer?.trim().toLowerCase() ?? "";
  const category = params.category?.trim().toLowerCase() ?? "";
  const minConfidence = Number(params.min_confidence) || 0;
  const estado = params.estado === "eliminados" ? "eliminados" : "activos";

  const supabase = await createClient();
  let query = supabase
    .from("product_aliases")
    .select(
      "id, retailer, raw_name, confidence_score, times_confirmed, active, deleted_at, retailer_products(brand, canonical_products(canonical_name, category))"
    );
  query = estado === "eliminados" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(100)
    .overrideTypes<AliasRowShape[]>();

  const aliases = (data ?? []).filter((a) => {
    const canonicalName = a.retailer_products?.canonical_products?.canonical_name ?? "";
    const brand = a.retailer_products?.brand ?? "";
    const aliasCategory = a.retailer_products?.canonical_products?.category ?? "";

    if (
      q &&
      !a.raw_name.toLowerCase().includes(q) &&
      !canonicalName.toLowerCase().includes(q) &&
      !brand.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (retailer && a.retailer.toLowerCase() !== retailer) return false;
    if (category && aliasCategory.toLowerCase() !== category) return false;
    if ((a.confidence_score ?? 0) < minConfidence) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Gestión del intérprete</h1>
        <p className="text-[15px] text-[var(--color-muted)]">Diccionario global aprobado (product_aliases).</p>
      </header>

      <Card>
        <form method="GET" className="flex flex-col gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por texto de ticket, producto o marca"
            className="ui-field__input"
          />
          <div className="flex gap-2">
            <input
              name="retailer"
              defaultValue={retailer}
              placeholder="Supermercado"
              className="ui-field__input flex-1"
            />
            <input
              name="category"
              defaultValue={category}
              placeholder="Categoría"
              className="ui-field__input flex-1"
            />
          </div>
          <div className="flex gap-2">
            <select name="min_confidence" defaultValue={params.min_confidence ?? ""} className="ui-field__input flex-1">
              <option value="">Cualquier confianza</option>
              <option value="0.5">50%+</option>
              <option value="0.8">80%+</option>
              <option value="0.95">95%+</option>
            </select>
            <select name="estado" defaultValue={estado} className="ui-field__input flex-1">
              <option value="activos">Activos</option>
              <option value="eliminados">Eliminados</option>
            </select>
          </div>
          <button type="submit" className="rounded-xl border border-[var(--color-border)] py-2 font-medium">
            Buscar
          </button>
        </form>
      </Card>

      <Card className="divide-y divide-neutral-100">
        {error && <p className="text-[15px] text-[var(--color-danger-text)]">No se pudo cargar el diccionario.</p>}
        {!error && aliases.length === 0 && <p className="text-[15px] text-[var(--color-muted)]">Sin resultados.</p>}
        {aliases.map((a) => (
          <AliasRow
            key={a.id}
            aliasId={a.id}
            retailer={a.retailer}
            rawName={a.raw_name}
            canonicalName={a.retailer_products?.canonical_products?.canonical_name ?? "—"}
            brand={a.retailer_products?.brand ?? null}
            category={a.retailer_products?.canonical_products?.category ?? null}
            confidenceScore={a.confidence_score}
            timesConfirmed={a.times_confirmed}
            active={a.active}
            deleted={a.deleted_at != null}
          />
        ))}
      </Card>
    </div>
  );
}
