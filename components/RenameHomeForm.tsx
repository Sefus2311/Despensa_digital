"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { renameHome, type RenameHomeState } from "@/app/(app)/actions";

export function RenameHomeForm({
  homeId,
  homeName,
}: {
  homeId: string;
  homeName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<RenameHomeState, FormData>(
    renameHome,
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setEditing(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{homeName}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Renombrar casa"
          className="text-neutral-400 hover:text-[var(--color-primary)]"
        >
          <Icon name="editar" size={16} />
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="home_id" value={homeId} />
      <div className="flex items-center gap-2">
        <input
          name="name"
          defaultValue={homeName}
          autoFocus
          required
          className="ui-field__input flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Guardar nombre"
          className="text-[var(--color-primary)]"
        >
          <Icon name="guardar" size={18} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancelar"
          className="text-neutral-400"
        >
          <Icon name="cerrar" size={18} />
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
