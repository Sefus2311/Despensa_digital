"use client";

import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  helpText?: string;
  error?: string;
  id?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, helpText, error, id, className, required, ...props },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const helpId = helpText ? `${textareaId}-help` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="ui-field">
      <label htmlFor={textareaId} className="ui-field__label">
        {label} {required && <span aria-hidden="true" className="ui-field__required">*</span>}
      </label>
      <textarea
        ref={ref}
        id={textareaId}
        className={[
          "ui-field__input",
          "ui-field__textarea",
          error && "ui-field__input--error",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...props}
      />
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
