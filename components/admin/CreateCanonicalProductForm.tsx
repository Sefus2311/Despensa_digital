"use client";

import { useActionState } from "react";
import { PRODUCT_CATEGORIES } from "@/lib/constants/product-categories";
import { createCanonicalProductAction, type ProductActionState } from "@/app/(app)/admin/products/actions";

export function CreateCanonicalProductForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState<ProductActionState, FormData>(
    createCanonicalProductAction,
    null
  );

  if (state?.success) {
    return <p className="text-[15px] text-[var(--color-success-text)]">{state.success}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="canonical_name" value={defaultName} />
      <select name="category" defaultValue="VARIOS" className="ui-field__input">
        {PRODUCT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {state?.error && <p className="text-[15px] text-[var(--color-danger-text)]">{state.error}</p>}
      <button type="submit" disabled={pending} className="ui-button ui-button--primary">
        {pending ? "Creando..." : `Crear "${defaultName}"`}
      </button>
    </form>
  );
}
