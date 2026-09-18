"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register, type AuthFormState } from "../actions";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    register,
    null
  );

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold font-display mb-1">Crea tu cuenta</h1>
      <p className="text-[var(--color-muted)] mb-8">
        En menos de un minuto empiezas a fotografiar tickets.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label htmlFor="display_name" className="ui-field__label">
            Nombre
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            autoComplete="name"
            required
            className="ui-field__input mt-1"
          />
        </div>

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
            autoComplete="new-password"
            minLength={8}
            required
            className="ui-field__input mt-1"
          />
          <p className="mt-1 text-[15px] text-[var(--color-muted)]">Mínimo 8 caracteres.</p>
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
          {pending ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>

      <div className="mt-6 text-[15px] text-center">
        <span className="text-[var(--color-muted)]">¿Ya tienes cuenta? </span>
        <Link href="/login" className="text-[var(--color-primary-text)] font-medium">
          Entra
        </Link>
      </div>
    </main>
  );
}
