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
      <h1 className="text-2xl font-semibold mb-1">Crea tu cuenta</h1>
      <p className="text-neutral-500 mb-8">
        En menos de un minuto empiezas a fotografiar tickets.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label htmlFor="display_name" className="text-sm font-medium">
            Nombre
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            autoComplete="name"
            required
            className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          />
        </div>

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

        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          />
          <p className="mt-1 text-xs text-neutral-500">Mínimo 8 caracteres.</p>
        </div>

        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 w-full rounded-xl bg-teal-700 text-white py-3.5 font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {pending ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>

      <div className="mt-6 text-sm text-center">
        <span className="text-neutral-500">¿Ya tienes cuenta? </span>
        <Link href="/login" className="text-teal-700 font-medium">
          Entra
        </Link>
      </div>
    </main>
  );
}
