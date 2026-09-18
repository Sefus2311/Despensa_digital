"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthFormState } from "../actions";

export default function RecuperarPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    null
  );

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold font-display mb-1">Recuperar contraseña</h1>
      <p className="text-neutral-500 mb-8">
        Te enviamos un enlace para restablecerla.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          />
        </div>

        {state?.error && (
          <p role="status" className="text-sm text-neutral-700">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 w-full rounded-xl bg-teal-700 text-white py-3.5 font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {pending ? "Enviando..." : "Enviar enlace"}
        </button>
      </form>

      <div className="mt-6 text-sm text-center">
        <Link href="/login" className="text-teal-700 font-medium">
          Volver a entrar
        </Link>
      </div>
    </main>
  );
}
