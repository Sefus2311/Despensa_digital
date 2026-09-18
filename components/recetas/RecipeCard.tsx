import Link from "next/link";
import type { Receta } from "@/lib/types/database";
import type { AvailabilitySummary } from "@/lib/recipes";

export function RecipeCard({ receta, availability }: { receta: Receta; availability: AvailabilitySummary }) {
  const tiempoTotal = (receta.tiempo_preparacion_min ?? 0) + (receta.tiempo_coccion_min ?? 0);
  const missingCount = availability.missingRequired.length;

  return (
    <Link href={`/recetas/${receta.id}`} className="ui-card ui-card--raised flex flex-col gap-1">
      <p className="font-semibold uppercase">{receta.titulo}</p>
      <p className="text-[15px] text-[var(--color-muted)]">
        {tiempoTotal > 0 ? `${tiempoTotal} min · ` : ""}
        {receta.raciones} ración{receta.raciones === 1 ? "" : "es"}
      </p>
      <p
        className={`text-[15px] font-medium ${
          missingCount === 0 ? "text-[var(--color-primary-text)]" : "text-[var(--color-warning)]"
        }`}
      >
        {missingCount === 0
          ? "Puedes cocinarla"
          : `Te falta${missingCount === 1 ? "" : "n"} ${missingCount} ingrediente${missingCount === 1 ? "" : "s"}`}
      </p>
    </Link>
  );
}
