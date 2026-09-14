"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_HOME_COOKIE } from "@/lib/home";

const HOME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 año

async function setCurrentHomeCookie(homeId: string) {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_HOME_COOKIE, homeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: HOME_COOKIE_MAX_AGE,
  });
}

/**
 * Cambia la Casa activa (selector de cabecera). No toca default_home_id.
 * Se llama directamente desde un onClick (no vía <form action>): dentro de
 * un menú que se autocierra al hacer clic, envolverla en un <form> corría
 * el riesgo de que el propio cierre desmontara el formulario a mitad del
 * envío y el navegador cancelara el submit.
 */
export async function switchHome(homeId: string) {
  if (!homeId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: membership } = await supabase
    .from("home_members")
    .select("home_id")
    .eq("user_id", user.id)
    .eq("home_id", homeId)
    .maybeSingle();

  if (!membership) return;

  await setCurrentHomeCookie(homeId);
  revalidatePath("/", "layout");
}

export type CreateHomeState = { error?: string } | null;

/** Crea una Casa adicional y cambia a ella. Único camino de alta (vía RPC
 * `create_home`, que valida y crea todo con SECURITY DEFINER). */
export async function createHome(
  _prevState: CreateHomeState,
  formData: FormData
): Promise<CreateHomeState> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Ponle un nombre a la Casa." };
  }

  const supabase = await createClient();
  const { data: newHomeId, error } = await supabase.rpc("create_home", {
    p_name: name,
  });

  if (error || !newHomeId) {
    return { error: "No se pudo crear la Casa. Inténtalo de nuevo." };
  }

  await setCurrentHomeCookie(newHomeId as string);
  revalidatePath("/", "layout");
  return null;
}

export type RenameHomeState = { error?: string } | null;

/** Renombra una Casa del usuario. La política RLS `homes_update_member` ya
 * limita el update a Casas de las que el usuario es miembro. */
export async function renameHome(
  _prevState: RenameHomeState,
  formData: FormData
): Promise<RenameHomeState> {
  const homeId = String(formData.get("home_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Ponle un nombre a la Casa." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homes")
    .update({ name })
    .eq("id", homeId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "No se pudo renombrar la Casa." };
  }

  revalidatePath("/", "layout");
  return null;
}

export type InviteHomeState = { error?: string } | null;

/** Invita a alguien por email a una Casa. Solo funciona si quien llama es
 * owner de esa Casa (lo valida la propia función `invite_to_home`, que
 * también devuelve los errores de validación ya en español). */
export async function inviteToHome(
  _prevState: InviteHomeState,
  formData: FormData
): Promise<InviteHomeState> {
  const homeId = String(formData.get("home_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();

  if (!homeId || !email) {
    return { error: "Introduce un email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_to_home", {
    p_home_id: homeId,
    p_email: email,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return null;
}

/** Cancela una invitación pendiente enviada por el owner. */
export async function cancelInvitation(invitationId: string) {
  if (!invitationId) return;
  const supabase = await createClient();
  await supabase.rpc("cancel_invitation", { p_invitation_id: invitationId });
  revalidatePath("/", "layout");
}

export type RespondInvitationState = { error?: string } | null;

/** La persona invitada acepta o rechaza. Si acepta, pasa a ser member de
 * esa Casa (lo hace `respond_to_invitation`, SECURITY DEFINER). */
export async function respondToInvitation(
  invitationId: string,
  accept: boolean
): Promise<RespondInvitationState> {
  if (!invitationId) {
    return { error: "Invitación no válida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_invitation", {
    p_invitation_id: invitationId,
    p_accept: accept,
  });

  if (error) {
    return { error: "No se pudo procesar la invitación." };
  }

  revalidatePath("/", "layout");
  return null;
}
