import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { isAdmin } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { AdminAuditLogEntry } from "@/lib/types/database";

const ACTION_LABELS: Record<string, string> = {
  role_change: "Cambio de rol",
  bootstrap_first_admin: "Alta del primer administrador",
  interpreter_proposal_approved: "Propuesta aprobada",
  interpreter_proposal_edited_and_approved: "Propuesta editada y aprobada",
  interpreter_proposal_rejected: "Propuesta rechazada",
  canonical_product_edited: "Producto normalizado editado",
  retailer_product_edited: "Producto de tienda editado",
  product_alias_edited: "Alias editado",
};

export default async function AdminAuditPage() {
  if (!(await isAdmin())) {
    notFound();
  }

  const supabase = await createClient();
  const { data: entries, error } = await supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (entries ?? []) as AdminAuditLogEntry[];
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => !!id)));

  const { data: actors } =
    actorIds.length > 0
      ? await supabase.from("profiles").select("id, email, display_name").in("id", actorIds)
      : { data: [] as { id: string; email: string; display_name: string | null }[] };

  const actorMap = new Map((actors ?? []).map((a) => [a.id, a.display_name || a.email]));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Auditoría</h1>
        <p className="text-sm text-neutral-500">
          Actividad administrativa reciente. No incluye datos privados de Casas.
        </p>
      </header>

      <Card className="divide-y divide-neutral-100">
        {error && <p className="text-sm text-red-600">No se pudo cargar el registro.</p>}
        {!error && rows.length === 0 && <p className="text-sm text-neutral-500">Sin actividad todavía.</p>}
        {rows.map((entry) => (
          <div key={entry.id} className="py-3 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{ACTION_LABELS[entry.action] ?? entry.action}</span>
              <span className="text-xs text-neutral-400">
                {new Date(entry.created_at).toLocaleString("es-ES")}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              {entry.actor_user_id ? actorMap.get(entry.actor_user_id) ?? entry.actor_user_id : "—"}
              {entry.target_type && ` · ${entry.target_type}`}
            </p>
          </div>
        ))}
      </Card>
    </div>
  );
}
