"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/Card";
import { Badge } from "@/components/ui/Badge";
import {
  approveProposalAction,
  rejectProposalAction,
  type ProposalActionState,
} from "@/app/(app)/admin/interpreter/actions";
import type { InterpreterProposal } from "@/lib/types/database";

const REJECTION_REASONS = [
  { value: "interpretacion_incorrecta", label: "Interpretación incorrecta" },
  { value: "duplicado", label: "Duplicado" },
  { value: "ticket_invalido", label: "Ticket inválido" },
  { value: "informacion_insuficiente", label: "Información insuficiente" },
  { value: "otro", label: "Otro" },
];

type Mode = "view" | "edit" | "reject";

export function ProposalCard({ proposal }: { proposal: InterpreterProposal }) {
  const [mode, setMode] = useState<Mode>("view");
  const [approveState, approveAction, approvePending] = useActionState<
    ProposalActionState,
    FormData
  >(approveProposalAction, null);
  const [rejectState, rejectAction, rejectPending] = useActionState<ProposalActionState, FormData>(
    rejectProposalAction,
    null
  );

  const confidencePct =
    proposal.ai_confidence != null ? Math.round(proposal.ai_confidence * 100) : null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-medium text-[var(--color-muted)]">{proposal.retailer}</span>
        {proposal.status === "conflict" && <Badge tone="warning">Conflicto</Badge>}
      </div>

      <div>
        <p className="text-[15px] text-[var(--color-muted)]">Texto original del ticket</p>
        <p className="font-mono text-[15px]">{proposal.raw_name}</p>
      </div>

      {mode !== "edit" ? (
        <div>
          <p className="text-[15px] text-[var(--color-muted)]">Propuesta interpretada</p>
          <p className="font-medium">{proposal.proposed_canonical_name}</p>
          <p className="text-[15px] text-[var(--color-muted)]">
            {[proposal.proposed_brand, proposal.proposed_category].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="text-[15px] text-[var(--color-muted)]">
            {proposal.proposed_quantity ?? "—"} {proposal.proposed_unit ?? ""}
          </p>
        </div>
      ) : (
        <form
          action={approveAction}
          className="flex flex-col gap-2"
          onSubmit={() => setMode("view")}
        >
          <input type="hidden" name="proposal_id" value={proposal.id} />
          <label className="text-[15px] text-[var(--color-muted)]">
            Producto normalizado
            <input
              name="canonical_name"
              defaultValue={proposal.proposed_canonical_name}
              required
              className="ui-field__input mt-1"
            />
          </label>
          <label className="text-[15px] text-[var(--color-muted)]">
            Marca
            <input name="brand" defaultValue={proposal.proposed_brand ?? ""} className="ui-field__input mt-1" />
          </label>
          <label className="text-[15px] text-[var(--color-muted)]">
            Categoría
            <input
              name="category"
              defaultValue={proposal.proposed_category ?? ""}
              className="ui-field__input mt-1"
            />
          </label>
          <div className="flex gap-2">
            <label className="text-[15px] text-[var(--color-muted)] flex-1">
              Cantidad
              <input
                name="quantity"
                type="number"
                step="0.001"
                defaultValue={proposal.proposed_quantity ?? ""}
                className="ui-field__input mt-1"
              />
            </label>
            <label className="text-[15px] text-[var(--color-muted)] flex-1">
              Unidad
              <input
                name="unit"
                defaultValue={proposal.proposed_unit ?? ""}
                className="ui-field__input mt-1"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={approvePending}
              className="flex-1 rounded-lg bg-[var(--color-primary)] text-white py-2 text-[15px] font-medium disabled:opacity-60"
            >
              Guardar y aprobar
            </button>
            <button
              type="button"
              onClick={() => setMode("view")}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[15px]"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-3 text-[15px] text-[var(--color-muted)]">
        {confidencePct !== null && <span>{confidencePct}% confianza IA</span>}
        <span>{proposal.user_confirmations} confirmaciones</span>
        {proposal.user_conflicts > 0 && <span>{proposal.user_conflicts} conflictos</span>}
      </div>

      {mode === "view" && (
        <div className="flex gap-2">
          <form action={approveAction} className="flex-1">
            <input type="hidden" name="proposal_id" value={proposal.id} />
            <button
              type="submit"
              disabled={approvePending}
              className="w-full rounded-lg bg-[var(--color-primary)] text-white py-2 text-[15px] font-medium disabled:opacity-60"
            >
              Aprobar
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[15px]"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setMode("reject")}
            className="rounded-lg border border-[var(--color-danger)] text-[var(--color-danger)] px-3 py-2 text-[15px]"
          >
            Rechazar
          </button>
        </div>
      )}

      {mode === "reject" && (
        <form
          action={rejectAction}
          className="flex flex-col gap-2"
          onSubmit={() => setMode("view")}
        >
          <input type="hidden" name="proposal_id" value={proposal.id} />
          <select name="rejection_reason" defaultValue="" className="ui-field__input">
            <option value="" disabled>
              Motivo del rechazo
            </option>
            {REJECTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={rejectPending}
              className="flex-1 rounded-lg bg-[var(--color-danger)] text-white py-2 text-[15px] font-medium disabled:opacity-60"
            >
              Confirmar rechazo
            </button>
            <button
              type="button"
              onClick={() => setMode("view")}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[15px]"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {approveState?.error && (
        <p role="alert" className="text-[15px] text-[var(--color-danger)]">
          {approveState.error}
        </p>
      )}
      {rejectState?.error && (
        <p role="alert" className="text-[15px] text-[var(--color-danger)]">
          {rejectState.error}
        </p>
      )}
    </Card>
  );
}
