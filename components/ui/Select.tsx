"use client";

import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  helpText?: string;
  error?: string;
  id?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, helpText, error, id, className, required, children, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const helpId = helpText ? `${selectId}-help` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="ui-field">
      <label htmlFor={selectId} className="ui-field__label">
        {label} {required && <span aria-hidden="true" className="ui-field__required">*</span>}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={["ui-field__input", error && "ui-field__input--error", className]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...props}
      >
        {children}
      </select>
      {helpText && !error && (
        <p id={helpId} className="ui-field__help">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
