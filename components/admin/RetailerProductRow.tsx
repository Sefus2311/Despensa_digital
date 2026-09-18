"use client";

import { useActionState } from "react";
import {
  updateRetailerProductAction,
  type ProductActionState,
} from "@/app/(app)/admin/products/actions";

export function RetailerProductRow({
  id,
  retailer,
  brand,
  commercialName,
  packageQuantity,
  packageUnit,
  canonicalName,
}: {
  id: string;
  retailer: string;
  brand: string | null;
  commercialName: string;
  packageQuantity: number | null;
  packageUnit: string | null;
  canonicalName: string;
}) {
  const [state, formAction, pending] = useActionState<ProductActionState, FormData>(
    updateRetailerProductAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 py-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-[15px] text-neutral-400">
        {retailer} · producto normalizado: {canonicalName}
      </p>
      <input name="commercial_name" defaultValue={commercialName} className="ui-field__input" />
      <input name="brand" defaultValue={brand ?? ""} placeholder="Marca" className="ui-field__input" />
      <div className="flex gap-2">
        <input
          name="package_quantity"
          type="number"
          step="0.001"
          defaultValue={packageQuantity ?? ""}
          placeholder="Cantidad"
          className="ui-field__input flex-1"
        />
        <input
          name="package_unit"
          defaultValue={packageUnit ?? ""}
          placeholder="Unidad"
          className="ui-field__input flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--color-primary)] text-white px-3 text-sm font-medium disabled:opacity-60"
        >
          Guardar
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="text-[15px] text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-[15px] text-green-700">{state.success}</p>}
    </form>
  );
}
