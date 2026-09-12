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
      <h1 className="text-2xl font-semibold mb-1">Bienvenido de nuevo</h1>
      <p className="text-neutral-500 mb-8">
        Entra para ver tu despensa y tus tickets.
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

        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          />
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
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-sm text-center">
        <Link href="/register" className="text-teal-700 font-medium">
          Crear una cuenta
        </Link>
        <Link href="/recuperar" className="text-neutral-500">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </main>
  );
}
