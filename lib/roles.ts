import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SystemRole } from "@/lib/types/database";

/**
 * Rol de sistema del usuario autenticado (null si no hay sesión). Es
 * ortogonal a la pertenencia a una Casa: nunca decide acceso a datos
 * domésticos, sólo capacidades globales de la plataforma (moderación del
 * intérprete, administración). El acceso a Casas sigue dependiendo
 * exclusivamente de home_members (ver lib/home.ts).
 *
 * `cache()` deduplica la consulta dentro de la misma petición.
 */
export const getCurrentSystemRole = cache(async function getCurrentSystemRole(): Promise<SystemRole | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .maybeSingle();

  return (data?.system_role as SystemRole | undefined) ?? null;
});

export async function isAdmin(): Promise<boolean> {
  return (await getCurrentSystemRole()) === "admin";
}

export async function isDelegate(): Promise<boolean> {
  return (await getCurrentSystemRole()) === "delegate";
}

/** Delegados y administradores pueden moderar el intérprete global. */
export async function canModerateInterpreter(): Promise<boolean> {
  const role = await getCurrentSystemRole();
  return role === "delegate" || role === "admin";
}

/** Sólo un administrador puede gestionar usuarios y roles. */
export async function canManageUsers(): Promise<boolean> {
  return isAdmin();
}
