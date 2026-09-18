"use client";

import { useActionState } from "react";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/constants/product-categories";
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
  category: ProductCategory;
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
        <select name="category" defaultValue={category} required className="ui-field__input flex-1">
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
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
        <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-[15px] text-[var(--color-success-text)]">{state.success}</p>}
    </form>
  );
}
