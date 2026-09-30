"use client";

import { useRef, useState } from "react";
import type { CellEditResult } from "@/app/(app)/admin/dictionary/actions";

/**
 * Celda editable tipo hoja de cálculo (sección 4): clic para editar, Enter o
 * perder el foco para guardar, Escape para cancelar. Si se pasan `options`,
 * edita con un <select> (valores controlados: supermercado, categoría) en
 * vez de texto libre -- así una edición manual no puede introducir una
 * variante nueva de un valor que ya está normalizado.
 */
export function EditableCell({
  value,
  options,
  placeholder,
  onSave,
}: {
  value: string;
  options?: readonly string[];
  placeholder?: string;
  onSave: (value: string) => Promise<CellEditResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  async function commit(nextValue: string) {
    if (nextValue === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await onSave(nextValue);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="w-full text-left text-[15px] rounded px-1 py-0.5 -mx-1 hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
      >
        {value || <span className="text-[var(--color-muted)]">{placeholder ?? "—"}</span>}
      </button>
    );
  }

  if (options) {
    return (
      <div className="flex flex-col gap-1">
        <select
          autoFocus
          value={draft}
          disabled={saving}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          onBlur={() => setEditing(false)}
          className="ui-field__input"
        >
          {!options.includes(draft) && draft && <option value={draft}>{draft}</option>}
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {error && <p className="text-[13px] text-[var(--color-danger-text)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        className="ui-field__input"
      />
      {error && <p className="text-[13px] text-[var(--color-danger-text)]">{error}</p>}
    </div>
  );
}
