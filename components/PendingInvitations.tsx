"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/Card";
import { respondToInvitation } from "@/app/(app)/actions";

interface Invitation {
  id: string;
  homeName: string;
}

export function PendingInvitations({ invitations }: { invitations: Invitation[] }) {
  const [isPending, startTransition] = useTransition();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<{ id: string; message: string } | null>(null);

  if (invitations.length === 0) return null;

  function respond(id: string, accept: boolean) {
    setErrorFor(null);
    setRespondingId(id);
    startTransition(async () => {
      const result = await respondToInvitation(id, accept);
      setRespondingId(null);
      if (result?.error) setErrorFor({ id, message: result.error });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {invitations.map((inv) => (
        <Card key={inv.id} elevation="none" className="border-[var(--color-primary)]">
          <p className="text-sm">
            Te han invitado a unirte a <strong>{inv.homeName}</strong>.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              disabled={isPending && respondingId === inv.id}
              onClick={() => respond(inv.id, true)}
              className="ui-button ui-button--primary flex-1"
            >
              Aceptar
            </button>
            <button
              type="button"
              disabled={isPending && respondingId === inv.id}
              onClick={() => respond(inv.id, false)}
              className="ui-button ui-button--secondary flex-1"
            >
              Rechazar
            </button>
          </div>
          {errorFor?.id === inv.id && (
            <p role="alert" className="text-[15px] text-red-600 mt-2">
              {errorFor.message}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
