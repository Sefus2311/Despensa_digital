"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthFormState } from "../actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    login,
    null
  );

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold font-display mb-1">Bienvenido de nuevo</h1>
      <p className="text-[var(--color-muted)] mb-8">
        Entra para ver tu despensa y tus tickets.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="ui-field__label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="ui-field__input mt-1"
          />
        </div>

        <div>
          <label htmlFor="password" className="ui-field__label">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="ui-field__input mt-1"
          />
        </div>

        {state?.error && (
          <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 w-full rounded-xl bg-[var(--color-primary)] text-white py-3.5 font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-[15px] text-center">
        <Link href="/register" className="text-[var(--color-primary-text)] font-medium">
          Crear una cuenta
        </Link>
        <Link href="/recuperar" className="text-[var(--color-muted)]">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </main>
  );
}
