"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/icons/Icon";
import { switchHome, createHome, type CreateHomeState } from "@/app/(app)/actions";
import type { UserHome } from "@/lib/home";

export function HomeSwitcher({
  currentHomeId,
  currentHomeName,
  homes,
}: {
  currentHomeId: string;
  currentHomeName: string;
  homes: UserHome[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <Dropdown label={`🏠 ${currentHomeName} ⌄`} align="right">
        <ul className="flex flex-col gap-1 min-w-[180px]">
          {homes.map((home) => (
            <li key={home.id}>
              <button
                type="button"
                disabled={home.id === currentHomeId || isPending}
                onClick={() => startTransition(() => switchHome(home.id))}
                className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-[15px] text-left hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] disabled:cursor-default disabled:font-medium"
              >
                <span className="w-4 text-[var(--color-primary-text)]">
                  {home.id === currentHomeId ? "✓" : ""}
                </span>
                {home.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--color-border)] mt-1 pt-1">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-[15px] text-left text-[var(--color-primary-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
          >
            <Icon name="anadir" size={16} />
            Añadir otra casa
          </button>
        </div>
      </Dropdown>

      <CreateHomeModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

function CreateHomeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<CreateHomeState, FormData>(
    createHome,
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      onClose();
    }
    wasPending.current = pending;
  }, [pending, state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Añadir otra casa">
      <form action={formAction} className="flex flex-col gap-3">
        <div className="ui-field">
          <label className="ui-field__label" htmlFor="home-name">
            Nombre de la Casa
          </label>
          <input
            id="home-name"
            name="name"
            className="ui-field__input"
            placeholder="Casa playa"
            autoFocus
            required
          />
        </div>
        {state?.error && (
          <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className="ui-button ui-button--primary">
          {pending ? "Creando..." : "Crear casa"}
        </button>
      </form>
    </Modal>
  );
}
