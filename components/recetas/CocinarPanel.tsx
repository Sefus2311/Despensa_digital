"use client";

import { useActionState, useState, useTransition } from "react";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons/Icon";
import type { CookingDecision } from "@/lib/recipes";
import type { CocinarState } from "@/app/(app)/recetas/[id]/cocinar/actions";

export interface CocinarIngredient {
  id: string;
  nombreMostrado: string;
  cantidad: number | null;
  unidad: string | null;
  productoId: string | null;
}

function formatCantidad(item: CocinarIngredient): string {
  if (item.cantidad == null) return "";
  return ` — ${item.cantidad}${item.unidad ? ` ${item.unidad}` : ""}`;
}

const DECISION_BUTTON_BASE =
  "flex-1 flex items-center justify-center gap-1.5 rounded-lg border-2 py-2.5 text-[15px] font-medium transition-colors";
const DECISION_BUTTON_OFF = "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]";
const DECISION_BUTTON_ON = "border-[var(--color-primary)] bg-[var(--color-primary)] text-white";

/**
 * Pantalla de decisión de "Quiero cocinar esto": un TENGO/COMPRAR por
 * ingrediente, mutuamente excluyentes y sin preselección (sección 6 del
 * encargo) -- nunca se infiere la decisión a partir de la despensa. Solo al
 * confirmar se envían a la lista de la compra los marcados COMPRAR.
 */
export function CocinarPanel({
  ingredientes,
  noComprables,
  action,
}: {
  ingredientes: CocinarIngredient[];
  /** Informativos: unidad no comprable (cucharada, al gusto...), nunca requieren decisión. */
  noComprables: string[];
  action: (prevState: CocinarState, formData: FormData) => Promise<CocinarState>;
}) {
  const [state, formAction, pending] = useActionState<CocinarState, FormData>(action, null);
  const [, startTransition] = useTransition();
  const [decisions, setDecisions] = useState<Partial<Record<string, CookingDecision>>>({});
  const [undecidedIds, setUndecidedIds] = useState<Set<string>>(new Set());
  // "Ya tengo todo": no hay ningún ingrediente que enviar al servidor -- se
  // resuelve en el cliente, sin llamar a la acción, y no es un error.
  const [nothingToBuy, setNothingToBuy] = useState(false);

  function decide(id: string, decision: CookingDecision) {
    setDecisions((prev) => ({ ...prev, [id]: decision }));
    setUndecidedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNothingToBuy(false);

    const undecided = ingredientes.filter((ing) => decisions[ing.id] == null);
    if (undecided.length > 0) {
      setUndecidedIds(new Set(undecided.map((ing) => ing.id)));
      return;
    }

    const seleccionados = ingredientes.filter((ing) => decisions[ing.id] === "comprar");
    if (seleccionados.length === 0) {
      // Todo marcado TENGO: no hay nada que añadir, y eso no es un error.
      setNothingToBuy(true);
      return;
    }

    const formData = new FormData();
    formData.set(
      "items_json",
      JSON.stringify(
        seleccionados.map((ing) => ({
          productoId: ing.productoId,
          nombreMostrado: ing.nombreMostrado,
          cantidad: ing.cantidad,
          unidad: ing.unidad,
        }))
      )
    );
    startTransition(() => formAction(formData));
  }

  if (ingredientes.length === 0 && noComprables.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-4">
      {ingredientes.length === 0 ? (
        <p className="text-[15px] text-[var(--color-muted)]">
          Esta receta no tiene ingredientes que se puedan añadir a la lista de la compra.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] font-medium">Marca qué ingredientes ya tienes y cuáles necesitas comprar.</p>
          {ingredientes.map((ing) => {
            const decision = decisions[ing.id];
            const isUndecided = undecidedIds.has(ing.id);
            return (
              <div
                key={ing.id}
                className={`flex flex-col gap-2 rounded-xl p-3 ${
                  isUndecided
                    ? "bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]"
                    : "bg-[var(--color-surface)]"
                }`}
              >
                <p className="text-[15px] font-medium">
                  {ing.nombreMostrado}
                  <span className="text-[var(--color-muted)] font-normal">{formatCantidad(ing)}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={decision === "tengo"}
                    onClick={() => decide(ing.id, "tengo")}
                    className={`${DECISION_BUTTON_BASE} ${decision === "tengo" ? DECISION_BUTTON_ON : DECISION_BUTTON_OFF}`}
                  >
                    <Icon name="confirmar" size={16} />
                    Tengo
                  </button>
                  <button
                    type="button"
                    aria-pressed={decision === "comprar"}
                    onClick={() => decide(ing.id, "comprar")}
                    className={`${DECISION_BUTTON_BASE} ${decision === "comprar" ? DECISION_BUTTON_ON : DECISION_BUTTON_OFF}`}
                  >
                    <Icon name="anadir" size={16} />
                    Comprar
                  </button>
                </div>
                {isUndecided && (
                  <p className="text-[13px] text-[var(--color-danger-text)]">
                    Decide si ya lo tienes o necesitas comprarlo.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {noComprables.length > 0 && (
        <p className="text-[15px] text-[var(--color-muted)]">
          No se gestionan desde la lista de la compra: {noComprables.join(", ")}.
        </p>
      )}

      {ingredientes.length > 0 && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          {undecidedIds.size > 0 && (
            <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
              Todavía tienes {undecidedIds.size} ingrediente{undecidedIds.size === 1 ? "" : "s"} por decidir.
            </p>
          )}
          {state?.error && (
            <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
              {state.error}
            </p>
          )}
          {state?.success && <p className="text-[15px] text-[var(--color-success-text)]">{state.success}</p>}
          {nothingToBuy && (
            <p className="text-[15px] text-[var(--color-success-text)]">
              Ya tienes todos los ingredientes: no se ha añadido nada a la lista de la compra.
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-[var(--color-primary)] text-white py-3.5 font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {pending ? "Añadiendo..." : "Añadir a la lista de la compra"}
          </button>
        </form>
      )}
    </Card>
  );
}
