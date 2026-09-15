"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/roles";
import type { SystemRole } from "@/lib/types/database";

export type ChangeUserRoleState = { error?: string; success?: string } | null;

const VALID_ROLES: SystemRole[] = ["user", "delegate", "admin"];

/**
 * Cambia el rol de otro usuario por id. La comprobación real de autorización
 * vive en la función RPC `set_user_role` (SECURITY DEFINER, verifica que
 * quien llama es admin y registra en admin_audit_log) -- este chequeo de
 * `isAdmin()` es sólo para devolver un error temprano.
 */
export async function changeUserRoleAction(
  _prevState: ChangeUserRoleState,
  formData: FormData
): Promise<ChangeUserRoleState> {
  if (!(await isAdmin())) {
    return { error: "No autorizado." };
  }

  const targetUserId = String(formData.get("user_id") ?? "");
  const newRole = String(formData.get("role") ?? "");

  if (!targetUserId) {
    return { error: "Usuario no válido." };
  }
  if (!VALID_ROLES.includes(newRole as SystemRole)) {
    return { error: "Rol no válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_role", {
    p_target_user_id: targetUserId,
    p_new_role: newRole,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: `Rol actualizado a "${newRole}".` };
}
