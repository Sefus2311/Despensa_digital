import Link from "next/link";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons/Icon";
import { getCurrentUserAndHome } from "@/lib/home";
import { logout } from "@/app/(auth)/actions";
import { RenameHomeForm } from "@/components/RenameHomeForm";
import { HomeInvitePanel } from "@/components/HomeInvitePanel";
import { getCurrentSystemRole } from "@/lib/roles";

// Mismas clases que el resto de botones primarios de MD (p. ej. "Guardar y
// revisar", "Confirmar compra"), adaptadas a par de botones a media anchura.
// Se evita la clase ui-button--primary del kit reutilizable porque su
// padding-inline (24px) no deja sitio a "Administración" en un móvil
// estrecho -- align-items:stretch (por defecto en el flex contenedor, sin
// items-center) iguala la altura de los dos botones si alguno llega a
// partirse en dos líneas.
const ACCESS_BUTTON_CLASSES =
  "flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] text-white py-3 px-2 text-[15px] font-medium text-center active:scale-[0.98] transition-transform";

export default async function PerfilPage() {
  const { supabase, user, homeId, homeName } = await getCurrentUserAndHome();
  const systemRole = await getCurrentSystemRole();
  // Misma regla de acceso que ya exigían los enlaces de abajo -- no se
  // duplica ni se relaja: Administración sigue exigiendo admin (ver
  // app/(app)/admin/page.tsx e docs/ROLES_AND_PERMISSIONS.md), Intérprete
  // admite delegate o admin.
  const canSeeAdmin = systemRole === "admin";
  const canSeeInterpreter = systemRole === "admin" || systemRole === "delegate";

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: pendingInvitations } = await supabase
    .from("home_invitations")
    .select("id, invited_email")
    .eq("home_id", homeId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      {(canSeeAdmin || canSeeInterpreter) && (
        <div className="flex gap-2">
          {canSeeAdmin && (
            <Link href="/admin" className={ACCESS_BUTTON_CLASSES}>
              <Icon name="ajustes" size={18} />
              Administración
            </Link>
          )}
          {canSeeInterpreter && (
            <Link href="/admin/interpreter" className={ACCESS_BUTTON_CLASSES}>
              <Icon name="buscar" size={18} />
              Intérprete
            </Link>
          )}
        </div>
      )}

      <header>
        <h1 className="text-2xl font-semibold font-display">Perfil</h1>
      </header>

      <Card className="flex flex-col gap-3 divide-y divide-neutral-100">
        <div className="pb-3">
          <p className="text-[15px] text-[var(--color-muted)]">Nombre</p>
          <p className="font-medium">{profile?.display_name || "—"}</p>
        </div>
        <div className="pt-3 pb-3">
          <p className="text-[15px] text-[var(--color-muted)]">Email</p>
          <p className="font-medium">{user.email}</p>
        </div>
        <div className="pt-3">
          <p className="text-[15px] text-[var(--color-muted)]">Casa</p>
          <RenameHomeForm homeId={homeId} homeName={homeName} />
        </div>
      </Card>

      <Card>
        <HomeInvitePanel homeId={homeId} pendingInvitations={pendingInvitations ?? []} />
      </Card>

      <form action={logout}>
        <button
          type="submit"
          className="w-full rounded-xl border border-[var(--color-danger)] text-[var(--color-danger-text)] py-3.5 font-medium active:scale-[0.98] transition-transform"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
