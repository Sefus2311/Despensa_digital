import Link from "next/link";
import { Card } from "@/components/Card";
import { getCurrentUserAndHome } from "@/lib/home";
import { logout } from "@/app/(auth)/actions";
import { RenameHomeForm } from "@/components/RenameHomeForm";
import { HomeInvitePanel } from "@/components/HomeInvitePanel";
import { getCurrentSystemRole } from "@/lib/roles";

export default async function PerfilPage() {
  const { supabase, user, homeId, homeName } = await getCurrentUserAndHome();
  const systemRole = await getCurrentSystemRole();

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
      <header>
        <h1 className="text-2xl font-semibold font-display">Perfil</h1>
      </header>

      <Card className="flex flex-col gap-3 divide-y divide-neutral-100">
        <div className="pb-3">
          <p className="text-[15px] text-neutral-500">Nombre</p>
          <p className="font-medium">{profile?.display_name || "—"}</p>
        </div>
        <div className="pt-3 pb-3">
          <p className="text-[15px] text-neutral-500">Email</p>
          <p className="font-medium">{user.email}</p>
        </div>
        <div className="pt-3">
          <p className="text-[15px] text-neutral-500">Casa</p>
          <RenameHomeForm homeId={homeId} homeName={homeName} />
        </div>
      </Card>

      <Card>
        <HomeInvitePanel homeId={homeId} pendingInvitations={pendingInvitations ?? []} />
      </Card>

      {(systemRole === "admin" || systemRole === "delegate") && (
        <Card className="flex flex-col gap-2">
          {systemRole === "admin" && (
            <Link href="/admin" className="font-medium text-[var(--color-primary)]">
              Administración
            </Link>
          )}
          <Link href="/admin/interpreter" className="font-medium text-[var(--color-primary)]">
            Intérprete
          </Link>
        </Card>
      )}

      <form action={logout}>
        <button
          type="submit"
          className="w-full rounded-xl border border-red-200 text-red-600 py-3.5 font-medium active:scale-[0.98] transition-transform"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
