import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { UserRoleRow } from "@/components/admin/UserRoleRow";
import { isAdmin } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { AdminUserListItem, SystemRole } from "@/lib/types/database";

const PAGE_SIZE = 20;
const ROLES: SystemRole[] = ["user", "delegate", "admin"];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; offset?: string }>;
}) {
  if (!(await isAdmin())) {
    notFound();
  }

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const role = ROLES.includes(params.role as SystemRole) ? (params.role as SystemRole) : null;
  const offset = Math.max(Number(params.offset) || 0, 0);

  const supabase = await createClient();
  const { data: users, error } = await supabase.rpc("admin_list_users", {
    p_search: q || null,
    p_role: role,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  const rows = (users ?? []) as AdminUserListItem[];

  const nextParams = new URLSearchParams();
  if (q) nextParams.set("q", q);
  if (role) nextParams.set("role", role);
  nextParams.set("offset", String(offset + PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Usuarios</h1>
        <p className="text-sm text-neutral-500">
          Rol de sistema por usuario. No da acceso a datos de sus Casas.
        </p>
      </header>

      <Card>
        <form method="GET" className="flex flex-col gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por email o nombre"
            className="ui-field__input"
          />
          <select name="role" defaultValue={role ?? ""} className="ui-field__input">
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl border border-[var(--color-border)] py-2 font-medium"
          >
            Buscar
          </button>
        </form>
      </Card>

      <Card className="divide-y divide-neutral-100">
        {error && <p className="text-sm text-red-600">No se pudo cargar la lista de usuarios.</p>}
        {!error && rows.length === 0 && <p className="text-sm text-neutral-500">Sin resultados.</p>}
        {rows.map((u) => (
          <UserRoleRow
            key={u.id}
            userId={u.id}
            email={u.email}
            displayName={u.display_name}
            role={u.system_role}
            createdAt={u.created_at}
          />
        ))}
      </Card>

      {rows.length === PAGE_SIZE && (
        <a
          href={`/admin/users?${nextParams.toString()}`}
          className="text-center text-sm text-[var(--color-primary)] font-medium py-2"
        >
          Cargar más
        </a>
      )}
    </div>
  );
}
