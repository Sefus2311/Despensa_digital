import { Badge } from "@/components/ui/Badge";
import {
  compareWithReference,
  type ConflictReference,
  type DiffSegment,
} from "@/lib/interpreter/conflicts";
import type { InterpreterProposal } from "@/lib/types/database";

function DiffText({ segments }: { segments: DiffSegment[] }) {
  if (segments.length === 0) {
    return <span className="text-[var(--color-muted)]">Sin indicar</span>;
  }
  return (
    <>
      {segments.map((segment, index) => (
        <span key={index}>
          {index > 0 && " "}
          {segment.changed ? <mark className="ui-mark">{segment.text}</mark> : segment.text}
        </span>
      ))}
    </>
  );
}

// Lo aprobado (o la otra candidata) frente a esta propuesta, campo a campo.
// Lo que provoca el conflicto va resaltado y, además, con la etiqueta
// "Diferente": el estado nunca depende solo del color (DESIGN_SYSTEM §6).
export function ConflictComparison({
  reference,
  proposal,
}: {
  reference: ConflictReference;
  proposal: InterpreterProposal;
}) {
  const fields = compareWithReference(reference, proposal);
  const referenceLabel = reference.kind === "approved" ? "Aprobado" : "Otra propuesta";
  const hasDifferences = fields.some((field) => field.differs);

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-semibold">{field.label}</p>
            {field.differs && <Badge tone="warning">Diferente</Badge>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
            <dt className="text-[var(--color-muted)]">{referenceLabel}</dt>
            <dd className="min-w-0 break-words">
              <DiffText segments={field.reference} />
            </dd>
            <dt className="text-[var(--color-muted)]">Propuesta</dt>
            <dd className="min-w-0 break-words">
              <DiffText segments={field.proposed} />
            </dd>
          </dl>
        </div>
      ))}

      {!hasDifferences && (
        <p className="text-[15px] text-[var(--color-muted)]">
          No hay diferencias en producto, categoría ni marca: lo aprobado ya dice lo mismo que esta propuesta.
        </p>
      )}

      <div className="text-[15px] text-[var(--color-muted)]">
        <p>
          Envase propuesto: {proposal.proposed_quantity ?? "—"} {proposal.proposed_quantity != null ? (proposal.proposed_unit ?? "") : ""}
        </p>
        {reference.kind === "approved" && (
          <>
            <p>
              Envase aprobado: {reference.packageQuantity ?? "—"} {reference.packageUnit ?? ""}
            </p>
            <p>Aprobado confirmado {reference.timesConfirmed ?? 0} veces</p>
          </>
        )}
      </div>
    </div>
  );
}
