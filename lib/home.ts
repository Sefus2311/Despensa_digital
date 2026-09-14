import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const CURRENT_HOME_COOKIE = "current_home_id";

export interface UserHome {
  id: string;
  name: string;
}

/**
 * Resuelve la Casa activa del usuario autenticado, en este orden:
 * 1. la Casa seleccionada en la cookie `current_home_id` (cambio de Casa
 *    desde el selector de cabecera), si sigue siendo una Casa del usuario;
 * 2. si no, su Casa principal (`profiles.default_home_id`);
 * 3. si no, su membresía más antigua (red de seguridad).
 *
 * Centraliza el acceso para que páginas y acciones no resuelvan esto cada
 * una por su cuenta, y para poder cambiar de Casa sin tocar cada pantalla.
 * `cache()` deduplica la consulta dentro de la misma petición (la llaman
 * tanto el layout, para la cabecera, como cada página).
 */
export const getCurrentUserAndHome = cache(async function getCurrentUserAndHome() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("home_members")
    .select("home_id, homes(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (membershipsError) {
    console.error("[getCurrentUserAndHome] fallo al buscar memberships:", membershipsError);
  }

  const homes: UserHome[] = (memberships ?? [])
    .map((m) => m.homes as unknown as UserHome | null)
    .filter((h): h is UserHome => h !== null);

  if (homes.length === 0) {
    // No debería ocurrir (el trigger crea la Casa al registrarse), pero se
    // cubre el caso por robustez.
    redirect("/login");
  }

  const cookieStore = await cookies();
  const cookieHomeId = cookieStore.get(CURRENT_HOME_COOKIE)?.value;

  let current = homes.find((h) => h.id === cookieHomeId);

  if (!current) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_home_id")
      .eq("id", user.id)
      .maybeSingle();

    current = homes.find((h) => h.id === profile?.default_home_id);
  }

  if (!current) {
    current = homes[0];
  }

  return {
    supabase,
    user,
    homeId: current.id,
    homeName: current.name,
    homes,
  };
});
