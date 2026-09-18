import { ProposalCard } from "@/components/admin/ProposalCard";
import { createClient } from "@/lib/supabase/server";
import type { InterpreterProposal } from "@/lib/types/database";

// El acceso mínimo (delegate/admin) ya lo exige app/(app)/admin/layout.tsx.
export default async function AdminInterpreterPendingPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interpreter_proposals")
    .select("*")
    .in("status", ["pending", "conflict"])
    .limit(100);

  const proposals = ((data ?? []) as InterpreterProposal[]).sort((a, b) => {
    if ((a.status === "conflict") !== (b.status === "conflict")) {
      return a.status === "conflict" ? -1 : 1;
    }
    if (a.user_conflicts !== b.user_conflicts) return b.user_conflicts - a.user_conflicts;
    if (a.user_confirmations !== b.user_confirmations) return b.user_confirmations - a.user_confirmations;
    const aConf = a.ai_confidence ?? -1;
    const bConf = b.ai_confidence ?? -1;
    if (aConf !== bConf) return bConf - aConf;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Propuestas pendientes</h1>
        <p className="text-[15px] text-[var(--color-muted)]">
          Ordenadas por conflictos, confirmaciones, confianza IA y antigüedad.
        </p>
      </header>

      {error && <p className="text-[15px] text-[var(--color-danger)]">No se pudieron cargar las propuestas.</p>}
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
