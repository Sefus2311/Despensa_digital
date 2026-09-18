"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/Card";
import type { CocinarState } from "@/app/(app)/recetas/[id]/cocinar/actions";

export interface MissingItem {
  productoId: string | null;
  nombreMostrado: string;
  cantidad: number | null;
  unidad: string | null;
}

function formatCantidad(item: MissingItem) {
  if (item.cantidad == null) return "";
  return `${item.cantidad}${item.unidad ? ` ${item.unidad}` : ""} `;
}

export function CocinarPanel({
  requeridos,
  opcionales,
  action,
}: {
  requeridos: MissingItem[];
  opcionales: MissingItem[];
  action: (prevState: CocinarState, formData: FormData) => Promise<CocinarState>;
}) {
  const [state, formAction, pending] = useActionState<CocinarState, FormData>(action, null);
  const [selectedOptional, setSelectedOptional] = useState<Set<number>>(new Set());

  if (requeridos.length === 0 && opcionales.length === 0) {
    return null;
  }

  const itemsToSend = [...requeridos, ...opcionales.filter((_, i) => selectedOptional.has(i))];

  return (
    <Card className="flex flex-col gap-3">
      {requeridos.length > 0 && (
        <div>
          <p className="text-[15px] font-medium mb-1">Faltan {requeridos.length} ingrediente{requeridos.length === 1 ? "" : "s"}:</p>
          <ul className="text-[15px] text-[var(--color-muted)] flex flex-col gap-0.5">
            {requeridos.map((item, i) => (
              <li key={i}>
                {formatCantidad(item)}
                {item.nombreMostrado}
              </li>
            ))}
          </ul>
        </div>
      )}

      {opcionales.length > 0 && (
        <div>
          <p className="text-[15px] font-medium mb-1">
            Ingredientes opcionales que también faltan (elige si quieres añadirlos):
          </p>
          <ul className="flex flex-col gap-1">
            {opcionales.map((item, i) => (
              <li key={i}>
                <label className="flex items-center gap-2 text-[15px] text-[var(--color-muted)]">
                  <input
                    type="checkbox"
                    checked={selectedOptional.has(i)}
                    onChange={(e) =>
                      setSelectedOptional((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        return next;
                      })
                    }
                    className="w-5 h-5 accent-[var(--color-primary)]"
                  />
                  {formatCantidad(item)}
                  {item.nombreMostrado}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={formAction}>
        <input type="hidden" name="items_json" value={JSON.stringify(itemsToSend)} />
        {state?.error && (
          <p role="alert" className="text-[15px] text-[var(--color-danger-text)] mb-2">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="text-[15px] text-[var(--color-success-text)] mb-2">{state.success}</p>
        )}
        <button
          type="submit"
          disabled={pending || itemsToSend.length === 0}
          className="w-full rounded-xl bg-[var(--color-primary)] text-white py-3.5 font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {pending ? "Añadiendo..." : "Añadir a la lista de la compra"}
        </button>
      </form>
    </Card>
  );
}
