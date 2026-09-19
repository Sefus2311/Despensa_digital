import type { InterpreterProposal } from "@/lib/types/database";

// Orden compartido por /admin/interpreter (pestaña "Validar") y
// /admin/interpreter/pending: conflictos primero, luego más conflictos de
// usuario, más confirmaciones, mayor confianza IA y, por último, más
// antiguas primero -- prioriza lo que más necesita atención de un moderador.
export function sortPendingProposals(proposals: InterpreterProposal[]): InterpreterProposal[] {
  return [...proposals].sort((a, b) => {
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
}
