"use client";

import { useActionState, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { AliasDetailPanel } from "@/components/admin/AliasDetailPanel";
import { formatCategoryBrandLine } from "@/lib/pantry";
import type { ProductCategory } from "@/lib/constants/product-categories";
import {
  restoreAliasAction,
  updateAliasAction,
  type AliasActionState,
} from "@/app/(app)/admin/interpreter/actions";

type PanelMode = "view" | "edit" | "delete";

export function AliasRow({
  aliasId,
  retailer,
  rawName,
  canonicalName,
  brand,
  category,
  confidenceScore,
  timesConfirmed,
  active,
  deleted,
}: {
  aliasId: string;
  retailer: string;
  rawName: string;
  canonicalName: string;
  brand: string | null;
  category: ProductCategory;
  confidenceScore: number | null;
  timesConfirmed: number;
  active: boolean;
  deleted: boolean;
}) {
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [activeState, activeFormAction, activePending] = useActionState<AliasActionState, FormData>(
    updateAliasAction,
    null
  );
  const [restoreState, restoreFormAction, restorePending] = useActionState<AliasActionState, FormData>(
    restoreAliasAction,
    null
  );

  return (
    // El panel de detalle (Modal, position: fixed) se renderiza FUERA de este
    // div: si quedara dentro heredaría el opacity-50 de abajo y aparecería
    // translúcido, dejando ver el listado detrás (bug ya visto en pantalla).
    <>
      <div className={`flex flex-col gap-1 py-3 ${active && !deleted ? "" : "opacity-50"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[15px] text-[var(--color-muted)]">{retailer}</span>
            <p className="font-mono text-[15px] text-[var(--color-muted)] truncate">{rawName}</p>
            <p className="font-medium">→ {canonicalName}</p>
            <p className="text-[15px] text-[var(--color-muted)]">{formatCategoryBrandLine(category, brand)}</p>
          </div>

          <Dropdown label="⋮" align="right">
            <ul className="flex flex-col gap-1 min-w-[180px]">
              <li>
                <button
                  type="button"
                  onClick={() => setPanelMode("view")}
                  className="w-full rounded-md px-2 py-2 text-[15px] text-left hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
                >
                  Ver / Revisar
                </button>
              </li>
              {!deleted && (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={() => setPanelMode("edit")}
                      className="w-full rounded-md px-2 py-2 text-[15px] text-left hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
                    >
                      Editar
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setPanelMode("delete")}
                      className="w-full rounded-md px-2 py-2 text-[15px] text-left text-[var(--color-danger-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
                    >
                      Eliminar
                    </button>
                  </li>
                </>
              )}
              {deleted && (
                <li>
                  <form action={restoreFormAction}>
                    <input type="hidden" name="alias_id" value={aliasId} />
                    <button
                      type="submit"
                      disabled={restorePending}
                      className="w-full rounded-md px-2 py-2 text-[15px] text-left hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] disabled:opacity-60"
                    >
                      Restaurar
                    </button>
                  </form>
                </li>
              )}
            </ul>
          </Dropdown>
        </div>

        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="flex gap-3 text-[15px] text-[var(--color-muted)]">
            {confidenceScore != null && <span>{Math.round(confidenceScore * 100)}% confianza</span>}
            <span>{timesConfirmed} confirmaciones</span>
            {deleted && <span className="text-[var(--color-danger-text)]">Eliminado</span>}
          </div>
          <form action={activeFormAction} onChange={(e) => e.currentTarget.requestSubmit()}>
            <input type="hidden" name="alias_id" value={aliasId} />
            <label className="flex items-center gap-1 text-[15px] text-[var(--color-muted)]">
              <input type="checkbox" name="active" defaultChecked={active} disabled={activePending || deleted} />
              Activo
            </label>
          </form>
        </div>

        {activeState?.error && (
          <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
            {activeState.error}
          </p>
        )}
        {restoreState?.error && (
          <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
            {restoreState.error}
          </p>
        )}
      </div>

      {panelMode && (
        <AliasDetailPanel aliasId={aliasId} initialMode={panelMode} onClose={() => setPanelMode(null)} />
      )}
    </>
  );
}
