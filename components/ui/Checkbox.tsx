"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  /** Acepta nodos (p. ej. un enlace embebido en el texto), no solo texto plano. */
  label: ReactNode;
  id?: string;
}

// La etiqueta envuelve todo el control para que el objetivo táctil sea
// mayor que el cuadrado nativo de 20x20 (mínimo táctil 44px, mobile first).
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label htmlFor={inputId} className="ui-checkbox">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={["ui-checkbox__input", className].filter(Boolean).join(" ")}
        {...props}
      />
      <span className="ui-checkbox__label">{label}</span>
    </label>
  );
});
