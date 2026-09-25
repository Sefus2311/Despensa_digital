import { notFound, redirect } from "next/navigation";
import { RecipeForm, type RecipeFormValues } from "@/components/recetas/RecipeForm";
import { createClient } from "@/lib/supabase/server";
import type { Receta, RecetaFoto, RecetaIngrediente, RecetaPaso } from "@/lib/types/database";
import { updateReceta } from "../../actions";

export default async function EditarRecetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: receta } = await supabase.from("recetas").select("*").eq("id", id).maybeSingle();
  if (!receta) notFound();
  if ((receta as Receta).autor_id !== user.id) {
    redirect(`/recetas/${id}`);
  }

  const [{ data: ingredientesData }, { data: pasosData }, { data: fotosData }] = await Promise.all([
    supabase
      .from("receta_ingredientes")
      .select("*, canonical_products(canonical_name)")
      .eq("receta_id", id)
      .order("orden", { ascending: true }),
    supabase.from("receta_pasos").select("*").eq("receta_id", id).order("numero", { ascending: true }),
    supabase.from("receta_fotos").select("*").eq("receta_id", id).order("orden", { ascending: true }),
  ]);

  const fotoRows = (fotosData ?? []) as RecetaFoto[];
  const { data: signedFotos } =
    fotoRows.length > 0
      ? await supabase.storage.from("recetas").createSignedUrls(
          fotoRows.map((f) => f.storage_path),
          60 * 60
        )
      : { data: [] as { path?: string; signedUrl: string }[] };
  const urlByPath = new Map((signedFotos ?? []).map((s) => [s.path, s.signedUrl]));
  const fotos = fotoRows.map((f) => ({ id: f.id, path: f.storage_path, url: urlByPath.get(f.storage_path) ?? "" }));

  const ingredientes = (
    (ingredientesData ?? []) as (RecetaIngrediente & { canonical_products: { canonical_name: string } | null })[]
  ).map((ing) => ({
    productoId: ing.producto_id,
    linkedName: ing.canonical_products?.canonical_name ?? null,
    nombreMostrado: ing.nombre_mostrado,
    cantidad: ing.cantidad,
    unidad: ing.unidad,
    opcional: ing.opcional,
    controlStock: ing.control_stock,
  }));

  const pasos = ((pasosData ?? []) as RecetaPaso[]).map((p) => ({ texto: p.texto }));

  const initialValues: RecipeFormValues = {
    titulo: (receta as Receta).titulo,
    descripcion: (receta as Receta).descripcion ?? "",
    raciones: (receta as Receta).raciones,
    tiempoPreparacionMin: (receta as Receta).tiempo_preparacion_min,
    tiempoCoccionMin: (receta as Receta).tiempo_coccion_min,
    visibilidad: (receta as Receta).visibilidad,
    estado: (receta as Receta).estado,
    ingredientes,
    pasos,
    fotos,
  };

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Editar receta</h1>
      </header>
      <RecipeForm
        action={updateReceta.bind(null, id)}
        recetaId={id}
        initialValues={initialValues}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
