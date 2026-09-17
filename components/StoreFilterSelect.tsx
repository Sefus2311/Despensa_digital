"use client";

import type { StoreFilterOption } from "@/lib/spending";

export function StoreFilterSelect({
  options,
  defaultValue,
  mesParam,
  anioParam,
}: {
  options: StoreFilterOption[];
  defaultValue: string;
  /** Mes/año seleccionados actualmente, para no perderlos al cambiar de comercio. */
  mesParam: string;
  anioParam: string;
}) {
  return (
    <form method="GET" className="ui-field">
      <label className="ui-field__label" htmlFor="lugar-de-compra">
        Lugar de compra
      </label>
      <input type="hidden" name="mes" value={mesParam} />
      <input type="hidden" name="anio" value={anioParam} />
      <select
        id="lugar-de-compra"
        name="lugar"
        defaultValue={defaultValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="ui-field__input"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </form>
  );
}
