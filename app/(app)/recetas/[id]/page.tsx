import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { DeleteRecetaButton } from "@/components/recetas/DeleteRecetaButton";
import { RecipePhotoGallery } from "@/components/recetas/RecipePhotoGallery";
import { getCurrentUserAndHome } from "@/lib/home";
import { canonicalizeUnit } from "@/lib/units";
import type { Receta, RecetaFoto, RecetaIngrediente, RecetaPaso } from "@/lib/types/database";
import { deleteReceta } from "../actions";

// Ficha de la receta: pantalla orientada a cocinar, no a normalización. No
// compara contra la despensa (eso es "normalización" ↔ "disponibilidad", dos
// conceptos distintos -- ver lib/recipes.ts) ni muestra si un ingrediente
// tiene o no producto_id: eso solo importa en el flujo interactivo de
// "Quiero cocinar esto" (app/(app)/recetas/[id]/cocinar/), donde si acaso
// tiene consecuencias reales (lista de la compra).
export default async function RecetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getCurrentUserAndHome();

  const { data: recetaData } = await supabase.from("recetas").select("*").eq("id", id).maybeSingle();
  if (!recetaData) notFound();
  const receta = recetaData as Receta;

  const [{ data: ingredientesData }, { data: pasosData }, { data: fotosData }] = await Promise.all([
    supabase.from("receta_ingredientes").select("*").eq("receta_id", id).order("orden", { ascending: true }),
    supabase.from("receta_pasos").select("*").eq("receta_id", id).order("numero", { ascending: true }),
    supabase.from("receta_fotos").select("*").eq("receta_id", id).order("orden", { ascending: true }),
  ]);

  const ingredientes = (ingredientesData ?? []) as RecetaIngrediente[];
  const pasos = (pasosData ?? []) as RecetaPaso[];

  const fotoRows = (fotosData ?? []) as RecetaFoto[];
  const { data: signedFotos } =
    fotoRows.length > 0
      ? await supabase.storage.from("recetas").createSignedUrls(
          fotoRows.map((f) => f.storage_path),
          60 * 60
        )
      : { data: [] as { path?: string; signedUrl: string }[] };
  const urlByPath = new Map((signedFotos ?? []).map((s) => [s.path, s.signedUrl]));
  // Solo las que realmente obtuvieron signed URL -- una fila sin URL (fallo
  // puntual de Storage) no debe romper la ficha, simplemente no se muestra.
  const fotos = fotoRows.map((f) => ({ url: urlByPath.get(f.storage_path) ?? "" })).filter((f) => f.url);

  const isAuthor = receta.autor_id === user.id;
  const tiempoTotal = (receta.tiempo_preparacion_min ?? 0) + (receta.tiempo_coccion_min ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display uppercase">{receta.titulo}</h1>
        <p className="text-[15px] text-[var(--color-muted)] mt-1">
          {receta.raciones} ración{receta.raciones === 1 ? "" : "es"}
          {tiempoTotal > 0 ? ` · ${tiempoTotal} min` : ""}
        </p>
      </header>

      <RecipePhotoGallery fotos={fotos} />

      {receta.descripcion && (
        <Card>
          <p className="text-[15px]">{receta.descripcion}</p>
        </Card>
      )}

      <div>
        <h2 className="font-medium mb-2">Ingredientes</h2>
        <Card className="flex flex-col divide-y divide-[var(--color-border)]">
          {ingredientes.map((ing) => (
            <div key={ing.id} className="py-2 text-[15px]">
              {ing.nombre_mostrado}
              {ing.cantidad != null && (
                <span className="text-[var(--color-muted)]">
                  {" "}
                  — {ing.cantidad}
                  {ing.unidad ? ` ${canonicalizeUnit(ing.unidad)}` : ""}
                </span>
              )}
              {ing.opcional && <span className="text-[var(--color-muted)]"> (opcional)</span>}
            </div>
          ))}
        </Card>
      </div>

      <div>
        <h2 className="font-medium mb-2">Pasos de preparación</h2>
        <Card className="flex flex-col gap-3">
          {pasos.map((paso) => (
            <div key={paso.id} className="flex gap-2">
              <span className="font-semibold text-[var(--color-muted)]">{paso.numero}.</span>
              <p className="text-[15px]">{paso.texto}</p>
            </div>
          ))}
        </Card>
      </div>

      <Link
        href={`/recetas/${receta.id}/cocinar`}
        className="w-full rounded-xl bg-[var(--color-primary)] text-white py-3.5 font-medium text-center active:scale-[0.98] transition-transform"
      >
        Quiero cocinar esto
      </Link>

      {isAuthor && (
        <div className="flex gap-2">
          <Link href={`/recetas/${receta.id}/editar`} className="ui-button ui-button--secondary flex-1">
            Editar
          </Link>
          <DeleteRecetaButton action={deleteReceta.bind(null, receta.id)} />
        </div>
      )}
    </div>
  );
}
