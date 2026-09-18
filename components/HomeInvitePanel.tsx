"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { inviteToHome, cancelInvitation, type InviteHomeState } from "@/app/(app)/actions";

interface PendingInvite {
  id: string;
  invited_email: string;
}

export function HomeInvitePanel({
  homeId,
  pendingInvitations,
}: {
  homeId: string;
  pendingInvitations: PendingInvite[];
}) {
  const [state, formAction, pending] = useActionState<InviteHomeState, FormData>(
    inviteToHome,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  const [isCancelling, startTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  function handleCancel(id: string) {
    setCancellingId(id);
    startTransition(async () => {
      await cancelInvitation(id);
      setCancellingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="home_id" value={homeId} />
        <label className="ui-field__label" htmlFor="invite-email">
          Invitar a esta Casa
        </label>
        <div className="flex gap-2">
          <input
            id="invite-email"
            type="email"
            name="email"
            placeholder="email@ejemplo.com"
            required
            className="ui-field__input flex-1"
          />
          <button type="submit" disabled={pending} className="ui-button ui-button--primary">
            {pending ? "Invitando..." : "Invitar"}
          </button>
        </div>
        {state?.error && (
          <p role="alert" className="text-[15px] text-red-600">
            {state.error}
          </p>
        )}
      </form>

      {pendingInvitations.length > 0 && (
        <ul className="flex flex-col gap-1">
          {pendingInvitations.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between gap-2 text-sm text-neutral-500"
            >
              <span className="truncate">{inv.invited_email} · pendiente</span>
              <button
                type="button"
                disabled={isCancelling && cancellingId === inv.id}
                onClick={() => handleCancel(inv.id)}
                className="text-[15px] text-red-600 underline shrink-0"
              >
                Cancelar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
