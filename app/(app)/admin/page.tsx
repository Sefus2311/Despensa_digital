import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { getCurrentSystemRole, isAdmin } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { AdminMetrics } from "@/lib/types/database";

const SECTIONS = [
  { href: "/admin/users", label: "Usuarios", description: "Buscar y cambiar roles" },
  { href: "/admin/interpreter", label: "Intérprete", description: "Diccionario global aprobado" },
  { href: "/admin/interpreter/pending", label: "Pendientes", description: "Propuestas por revisar" },
  { href: "/admin/interpreter/conflicts", label: "Conflictos", description: "Interpretaciones incompatibles" },
  { href: "/admin/products", label: "Productos", description: "Canónicos y de tienda" },
  { href: "/admin/audit", label: "Auditoría", description: "Actividad administrativa" },
];

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-xl font-semibold">{value}</span>
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  );
}

export default async function AdminPage() {
  if (!(await isAdmin())) {
    notFound();
  }

  const role = await getCurrentSystemRole();
  const supabase = await createClient();
  const { data: metricsData } = await supabase.rpc("admin_get_metrics");
  const metrics = metricsData as AdminMetrics | null;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Administración</h1>
        <p className="text-sm text-neutral-500">Tu rol: {role}</p>
      </header>

      {metrics && (
        <Card className="grid grid-cols-2 gap-4">
          <Metric label="Usuarios totales" value={metrics.total_users} />
          <Metric label="Nuevos (30 días)" value={metrics.new_users_30d} />
          <Metric label="Delegados" value={metrics.delegates} />
          <Metric label="Administradores" value={metrics.admins} />
          <Metric label="Propuestas pendientes" value={metrics.pending_proposals} />
          <Metric label="Conflictos abiertos" value={metrics.open_conflicts} />
          <Metric label="Aliases aprobados" value={metrics.approved_aliases} />
          <Metric label="Productos canónicos" value={metrics.canonical_products} />
          <Metric label="Productos de tienda" value={metrics.retailer_products} />
          {metrics.proposals_approved_pct !== null && (
            <Metric label="% propuestas aprobadas" value={`${metrics.proposals_approved_pct}%`} />
          )}
          {metrics.proposals_rejected_pct !== null && (
            <Metric label="% propuestas rechazadas" value={`${metrics.proposals_rejected_pct}%`} />
          )}
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="flex flex-col active:scale-[0.99] transition-transform">
              <span className="font-medium">{section.label}</span>
              <span className="text-xs text-neutral-500">{section.description}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
