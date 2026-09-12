import { Card } from "@/components/Card";
import { getCurrentUserAndHousehold } from "@/lib/household";
import { logout } from "@/app/(auth)/actions";

export default async function PerfilPage() {
  const { supabase, user, householdName } = await getCurrentUserAndHousehold();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Perfil</h1>
      </header>

      <Card className="flex flex-col gap-3 divide-y divide-neutral-100">
        <div className="pb-3">
          <p className="text-xs text-neutral-500">Nombre</p>
          <p className="font-medium">{profile?.display_name || "—"}</p>
        </div>
        <div className="pt-3 pb-3">
          <p className="text-xs text-neutral-500">Email</p>
          <p className="font-medium">{user.email}</p>
        </div>
        <div className="pt-3">
          <p className="text-xs text-neutral-500">Hogar</p>
          <p className="font-medium">{householdName}</p>
        </div>
      </Card>

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
