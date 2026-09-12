import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * V0.1: cada usuario pertenece a un único household (el creado
 * automáticamente al registrarse). Este helper centraliza cómo se
 * obtiene, para poder introducir selección de household en el futuro
 * sin tocar cada pantalla.
 */
export async function getCurrentUserAndHousehold() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, role, households(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("[getCurrentUserAndHousehold] fallo al buscar membership:", membershipError);
  }

  if (!membership) {
    // No debería ocurrir (el trigger crea el household al registrarse),
    // pero se cubre el caso por robustez.
    redirect("/login");
  }

  return {
    supabase,
    user,
    householdId: membership.household_id as string,
    householdName:
      (membership.households as unknown as { name: string } | null)?.name ??
      "Mi hogar",
  };
}
