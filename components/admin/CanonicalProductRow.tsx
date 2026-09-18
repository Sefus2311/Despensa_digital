"use client";

import { useActionState } from "react";
import {
  updateCanonicalProductAction,
  type ProductActionState,
} from "@/app/(app)/admin/products/actions";

export function CanonicalProductRow({
  id,
  canonicalName,
  category,
  defaultUnit,
}: {
  id: string;
  canonicalName: string;
  category: string | null;
  defaultUnit: string | null;
}) {
  const [state, formAction, pending] = useActionState<ProductActionState, FormData>(
    updateCanonicalProductAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 py-3">
      <input type="hidden" name="id" value={id} />
      <input name="canonical_name" defaultValue={canonicalName} required className="ui-field__input" />
      <div className="flex gap-2">
        <input
          name="category"
          defaultValue={category ?? ""}
          placeholder="Categoría"
          className="ui-field__input flex-1"
        />
        <input
          name="default_unit"
          defaultValue={defaultUnit ?? ""}
          placeholder="Unidad"
          className="ui-field__input flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--color-primary)] text-white px-3 text-[15px] font-medium disabled:opacity-60"
        >
          Guardar
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="text-[15px] text-[var(--color-danger)]">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-[15px] text-green-700">{state.success}</p>}
    </form>
  );
}
