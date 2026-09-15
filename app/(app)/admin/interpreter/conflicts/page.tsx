import { Card } from "@/components/Card";
import { ProposalCard } from "@/components/admin/ProposalCard";
import { createClient } from "@/lib/supabase/server";
import type { InterpreterProposal } from "@/lib/types/database";

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

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Conflictos</h1>
        <p className="text-sm text-neutral-500">
          Mismo texto de ticket, interpretaciones incompatibles. Elige la correcta.
        </p>
      </header>

      {error && <p className="text-sm text-red-600">No se pudieron cargar los conflictos.</p>}
      {!error && groups.size === 0 && <p className="text-sm text-neutral-500">Sin conflictos abiertos.</p>}

      <div className="flex flex-col gap-4">
        {Array.from(groups.entries()).map(([key, group]) => (
          <div key={key} className="flex flex-col gap-2">
            <Card className="bg-amber-50">
              <p className="text-xs text-neutral-500">{group[0].retailer}</p>
              <p className="font-mono text-sm">{group[0].raw_name}</p>
              <p className="text-xs text-neutral-500">{group.length} interpretaciones en conflicto</p>
            </Card>
            {group.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
