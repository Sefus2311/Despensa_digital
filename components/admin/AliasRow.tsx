"use client";

import { useActionState } from "react";
import { updateAliasAction, type AliasActionState } from "@/app/(app)/admin/interpreter/actions";

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
}: {
  aliasId: string;
  retailer: string;
  rawName: string;
  canonicalName: string;
  brand: string | null;
  category: string | null;
  confidenceScore: number | null;
  timesConfirmed: number;
  active: boolean;
}) {
  const [state, formAction, pending] = useActionState<AliasActionState, FormData>(
    updateAliasAction,
    null
  );

  return (
    <div className={`flex flex-col gap-1 py-3 ${active ? "" : "opacity-50"}`}>
      <span className="text-xs text-neutral-400">{retailer}</span>
      <p className="font-mono text-xs text-neutral-500">{rawName}</p>
      <p className="font-medium">→ {canonicalName}</p>
      <p className="text-xs text-neutral-500">
        {[brand, category].filter(Boolean).join(" · ") || "—"}
      </p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex gap-3 text-xs text-neutral-500">
          {confidenceScore != null && <span>{Math.round(confidenceScore * 100)}% confianza</span>}
          <span>{timesConfirmed} confirmaciones</span>
        </div>
        <form action={formAction} onChange={(e) => e.currentTarget.requestSubmit()}>
          <input type="hidden" name="alias_id" value={aliasId} />
          <label className="flex items-center gap-1 text-xs text-neutral-500">
            <input type="checkbox" name="active" defaultChecked={active} disabled={pending} />
            Activo
          </label>
        </form>
      </div>
      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </div>
  );
}
