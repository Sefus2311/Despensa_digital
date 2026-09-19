import { ProposalCard } from "@/components/admin/ProposalCard";
import { createClient } from "@/lib/supabase/server";
import { sortPendingProposals } from "@/lib/interpreter/proposals";
import type { InterpreterProposal } from "@/lib/types/database";

// El acceso mínimo (delegate/admin) ya lo exige app/(app)/admin/layout.tsx.
export default async function AdminInterpreterPendingPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interpreter_proposals")
    .select("*")
    .in("status", ["pending", "conflict"])
    .limit(100);

  const proposals = sortPendingProposals((data ?? []) as InterpreterProposal[]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Propuestas pendientes</h1>
        <p className="text-[15px] text-[var(--color-muted)]">
          Ordenadas por conflictos, confirmaciones, confianza IA y antigüedad.
        </p>
      </header>

      {error && <p className="text-[15px] text-[var(--color-danger-text)]">No se pudieron cargar las propuestas.</p>}
      {!error && proposals.length === 0 && (
        <p className="text-[15px] text-[var(--color-muted)]">No hay propuestas pendientes.</p>
      )}

      <div className="flex flex-col gap-3">
        {proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </div>
    </div>
  );
}
