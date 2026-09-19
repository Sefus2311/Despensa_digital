import { Card } from "@/components/Card";
import { AliasRow } from "@/components/admin/AliasRow";
import { ProposalCard } from "@/components/admin/ProposalCard";
import { InterpreterEstadoSelect } from "@/components/admin/InterpreterEstadoSelect";
import { createClient } from "@/lib/supabase/server";
import { sortPendingProposals } from "@/lib/interpreter/proposals";
import { Select } from "@/components/ui";
import {
  DEFAULT_PRODUCT_CATEGORY,
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from "@/lib/constants/product-categories";
import { buildSupermarketOptions, normalizeSupermarketName } from "@/lib/supermarkets";
import type { InterpreterProposal } from "@/lib/types/database";

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
    canonical_products: { canonical_name: string; category: ProductCategory } | null;
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
  // Se compara ya normalizado (MAYÚSCULAS): "Mercadona"/"mercadona" = "MERCADONA".
  const retailer = params.retailer ? normalizeSupermarketName(params.retailer) : "";
  const category = params.category?.trim().toLowerCase() ?? "";
  const minConfidence = Number(params.min_confidence) || 0;
  const estado =
    params.estado === "eliminados" ? "eliminados" : params.estado === "validar" ? "validar" : "activos";

  const supabase = await createClient();

  // "Validar" reutiliza la misma tabla/orden que /admin/interpreter/pending
  // (interpreter_proposals con status pending/conflict) -- no es un tercer
  // valor de product_aliases, es conocimiento todavía sin aprobar, por eso
  // usa otra fuente de datos y otra tarjeta (ProposalCard) dentro de la misma
  // página, en vez de forzarlo al modelo de AliasRow.
  let proposals: InterpreterProposal[] = [];
  let aliases: AliasRowShape[] = [];
  let error: { message: string } | null = null;

  if (estado === "validar") {
    const { data, error: queryError } = await supabase
      .from("interpreter_proposals")
      .select("*")
      .in("status", ["pending", "conflict"])
      .limit(100);
    error = queryError;

    proposals = sortPendingProposals((data ?? []) as InterpreterProposal[]).filter((p) => {
      if (
        q &&
        !p.raw_name.toLowerCase().includes(q) &&
        !p.proposed_canonical_name.toLowerCase().includes(q) &&
        !(p.proposed_brand ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (retailer && normalizeSupermarketName(p.retailer) !== retailer) return false;
      if (category && (p.proposed_category ?? "").toLowerCase() !== category) return false;
      if ((p.ai_confidence ?? 0) < minConfidence) return false;
      return true;
    });
  } else {
    let query = supabase
      .from("product_aliases")
      .select(
        "id, retailer, raw_name, confidence_score, times_confirmed, active, deleted_at, retailer_products(brand, canonical_products(canonical_name, category))"
      );
    query = estado === "eliminados" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

    const { data, error: queryError } = await query
      .order("updated_at", { ascending: false })
      .limit(100)
      .overrideTypes<AliasRowShape[]>();
    error = queryError;

    aliases = (data ?? []).filter((a) => {
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
      if (retailer && normalizeSupermarketName(a.retailer) !== retailer) return false;
      if (category && aliasCategory.toLowerCase() !== category) return false;
      if ((a.confidence_score ?? 0) < minConfidence) return false;
      return true;
    });
  }

  // Lista real de supermercados existentes en BD (list_supermarkets, migración
  // 0017), sin duplicados y ordenada. Si el RPC aún no existe, se cae a los
  // supermercados de las filas ya cargadas para que la página siga funcionando.
  const { data: supermarketRows, error: supermarketsError } = await supabase.rpc("list_supermarkets");
  const supermarketNames: string[] = supermarketsError
    ? [...proposals.map((p) => p.retailer), ...aliases.map((a) => a.retailer)]
    : ((supermarketRows ?? []) as string[]);
  const supermarketOptions = buildSupermarketOptions(supermarketNames);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Gestión del intérprete</h1>
        <p className="text-[15px] text-[var(--color-muted)]">
          {estado === "validar"
            ? "Propuestas pendientes de revisión (interpreter_proposals)."
            : "Diccionario global aprobado (product_aliases)."}
        </p>
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
            <div className="flex-1">
              <Select label="SUPERMERCADO" name="retailer" defaultValue={retailer}>
                <option value="">TODOS</option>
                {supermarketOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <Select
                label="CATEGORÍA"
                name="category"
                defaultValue={PRODUCT_CATEGORIES.find((c) => c.toLowerCase() === category) ?? ""}
              >
                <option value="">TODAS</option>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <select name="min_confidence" defaultValue={params.min_confidence ?? ""} className="ui-field__input flex-1">
              <option value="">Cualquier confianza</option>
              <option value="0.5">50%+</option>
              <option value="0.8">80%+</option>
              <option value="0.95">95%+</option>
            </select>
            <InterpreterEstadoSelect defaultValue={estado} />
          </div>
          <button type="submit" className="rounded-xl border border-[var(--color-border)] py-2 font-medium">
            Buscar
          </button>
        </form>
      </Card>

      {estado === "validar" ? (
        <div className="flex flex-col gap-3">
          {error && (
            <p className="text-[15px] text-[var(--color-danger-text)]">No se pudieron cargar las propuestas.</p>
          )}
          {!error && proposals.length === 0 && (
            <Card>
              <p className="text-[15px] text-[var(--color-muted)]">No hay propuestas pendientes.</p>
            </Card>
          )}
          {proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
      ) : (
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
              category={a.retailer_products?.canonical_products?.category ?? DEFAULT_PRODUCT_CATEGORY}
              confidenceScore={a.confidence_score}
              timesConfirmed={a.times_confirmed}
              active={a.active}
              deleted={a.deleted_at != null}
            />
          ))}
        </Card>
      )}
    </div>
  );
}
