import Link from "next/link";
import { Card } from "@/components/Card";
import { getCurrentUserAndHome } from "@/lib/home";
import { PendingInvitations } from "@/components/PendingInvitations";

export default async function InicioPage() {
  const { supabase, user, homeId } = await getCurrentUserAndHome();

  // Mismo criterio que /despensa: sólo cuenta productos ya validados por el
  // intérprete (con alias aprobado), no cualquier línea de ticket.
  const { data: pantryData } = await supabase.rpc("get_home_pantry", { p_home_id: homeId });
  const productCount = pantryData?.length ?? 0;

  const { data: invitations } = await supabase
    .from("home_invitations")
    .select("id, home_name")
    .eq("invited_email", (user.email ?? "").toLowerCase())
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Inicio</h1>
      </header>

      <PendingInvitations
        invitations={(invitations ?? []).map((i) => ({ id: i.id, homeName: i.home_name }))}
      />

      <Card>
        <h2 className="font-medium mb-1">Próximamente necesitarás</h2>
        <p className="text-[15px] text-[var(--color-muted)]">
          Todavía necesitamos más compras para aprender tu consumo.
        </p>
      </Card>

      <Link href="/recetas">
        <Card>
          <h2 className="font-medium mb-1">¿Qué puedo cocinar?</h2>
          <p className="text-[15px] text-[var(--color-muted)]">
            Consulta tus recetas y comprueba qué puedes cocinar con tu despensa.
          </p>
        </Card>
      </Link>

      <Link href="/despensa">
        <Card>
          <h2 className="font-medium mb-1">Mi despensa</h2>
          <p className="text-[15px] text-[var(--color-muted)]">
            {productCount ?? 0} producto{productCount === 1 ? "" : "s"}{" "}
            registrado{productCount === 1 ? "" : "s"}.
          </p>
        </Card>
      </Link>
    </div>
  );
}
