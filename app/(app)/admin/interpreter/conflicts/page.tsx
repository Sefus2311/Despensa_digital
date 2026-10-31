import { Card } from "@/components/Card";
import { ProposalCard } from "@/components/admin/ProposalCard";
import type { ProductCategory } from "@/lib/constants/product-categories";
import { pickConflictReference, type ConflictReference } from "@/lib/interpreter/conflicts";
import { createClient } from "@/lib/supabase/server";
import type { InterpreterProposal } from "@/lib/types/database";

interface ApprovedAliasRow {
  retailer: string;
  normalized_raw_name: string;
  times_confirmed: number;
  retailer_products: {
    brand: string | null;
    package_quantity: number | null;
    package_unit: string | null;
    canonical_products: { canonical_name: string; category: ProductCategory };
  };
}

// El acceso mínimo (delegate/admin) ya lo exige app/(app)/admin/layout.tsx.
// Agrupa las propuestas en conflicto por clave (retailer + raw_name
// normalizado); aprobar cualquiera de las candidatas resuelve el grupo
// entero (approve_interpreter_proposal rechaza automáticamente al resto).
export default async function AdminInterpreterConflictsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interpreter_proposals")
    .select("*")
    .eq("status", "conflict")
    .order("created_at", { ascending: true })
    .limit(200);

  const proposals = (data ?? []) as InterpreterProposal[];

  const groups = new Map<string, InterpreterProposal[]>();
  for (const p of proposals) {
    const key = `${p.retailer}::${p.normalized_raw_name}`;
    const group = groups.get(key) ?? [];
    group.push(p);
    groups.set(key, group);
  }

  // Lo ya aprobado para esas mismas claves: un conflicto de una sola propuesta
  // es justo uno que contradice esto, y sin verlo no se puede decidir. Mismos
  // filtros que submit_interpreter_proposal al detectarlo.
  const { data: aliasData } =
    proposals.length > 0
      ? await supabase
          .from("product_aliases")
          .select(
            "retailer, normalized_raw_name, times_confirmed, retailer_products(brand, package_quantity, package_unit, canonical_products(canonical_name, category))"
          )
          .in("retailer", [...new Set(proposals.map((p) => p.retailer))])
          .in("normalized_raw_name", [...new Set(proposals.map((p) => p.normalized_raw_name))])
          .eq("active", true)
          .is("deleted_at", null)
      : { data: [] };

  const approvedByKey = new Map<string, ConflictReference>();
  for (const alias of (aliasData ?? []) as unknown as ApprovedAliasRow[]) {
    const product = alias.retailer_products;
    approvedByKey.set(`${alias.retailer}::${alias.normalized_raw_name}`, {
      kind: "approved",
      name: product.canonical_products.canonical_name,
      category: product.canonical_products.category,
      brand: product.brand,
      packageQuantity: product.package_quantity,
      packageUnit: product.package_unit,
      timesConfirmed: alias.times_confirmed,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Conflictos</h1>
        <p className="text-[15px] text-[var(--color-muted)]">
          Mismo texto de ticket, interpretaciones incompatibles. Elige la correcta.
        </p>
      </header>

      {error && <p className="text-[15px] text-[var(--color-danger-text)]">No se pudieron cargar los conflictos.</p>}
      {!error && groups.size === 0 && <p className="text-[15px] text-[var(--color-muted)]">Sin conflictos abiertos.</p>}

      <div className="flex flex-col gap-4">
        {Array.from(groups.entries()).map(([key, group]) => (
          <div key={key} className="flex flex-col gap-2">
            <Card className="ui-card--warning-tint">
              <p className="text-[15px] text-[var(--color-muted)]">{group[0].retailer}</p>
              <p className="font-mono text-[15px]">{group[0].raw_name}</p>
              <p className="text-[15px] text-[var(--color-muted)]">
                {approvedByKey.has(key)
                  ? `${group.length === 1 ? "1 propuesta contradice" : `${group.length} propuestas contradicen`} lo ya aprobado`
                  : `${group.length} interpretaciones en conflicto`}
              </p>
            </Card>
            {group.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                reference={pickConflictReference(p, group, approvedByKey.get(key) ?? null)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
