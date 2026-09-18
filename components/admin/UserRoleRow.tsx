"use client";

import { useActionState } from "react";
import { changeUserRoleAction, type ChangeUserRoleState } from "@/app/(app)/admin/users/actions";
import type { SystemRole } from "@/lib/types/database";

export function UserRoleRow({
  userId,
  email,
  displayName,
  role,
  createdAt,
}: {
  userId: string;
  email: string;
  displayName: string | null;
  role: SystemRole;
  createdAt: string;
}) {
  const [state, formAction, pending] = useActionState<ChangeUserRoleState, FormData>(
    changeUserRoleAction,
    null
  );

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{displayName || email}</p>
          <p className="text-[15px] text-neutral-500 truncate">{email}</p>
        </div>
        <span className="text-[15px] rounded-full bg-neutral-100 px-2 py-1 shrink-0">{role}</span>
      </div>
      <p className="text-[15px] text-neutral-400">
        Alta: {new Date(createdAt).toLocaleDateString("es-ES")}
      </p>

      <form
        action={formAction}
        onSubmit={(e) => {
          const nextRole = String(new FormData(e.currentTarget).get("role"));
          if (nextRole !== role && (nextRole === "admin" || role === "admin")) {
            const label = displayName || email;
            if (!window.confirm(`¿Cambiar el rol de ${label} de "${role}" a "${nextRole}"?`)) {
              e.preventDefault();
            }
          }
        }}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="user_id" value={userId} />
        <select name="role" defaultValue={role} className="ui-field__input flex-1">
          <option value="user">user</option>
          <option value="delegate">delegate</option>
          <option value="admin">admin</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--color-primary)] text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          Guardar
        </button>
      </form>

      {state?.error && (
        <p role="alert" className="text-[15px] text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-[15px] text-green-700">{state.success}</p>}
    </div>
  );
}
