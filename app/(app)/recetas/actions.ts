"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { canonicalizeUnit } from "@/lib/units";
import {
  RECETA_FOTO_SIGNATURE_BYTES,
  checkRecetaFoto,
  extensionForImageType,
} from "@/lib/receta-fotos";

const RECETA_FOTOS_BUCKET = "recetas";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Vigencia de la signed URL de una foto: igual criterio que getReceiptImageUrl. */
const FOTO_SIGNED_URL_SECONDS = 60 * 60;

export type RecetaFormState = { error?: string } | null;

interface IngredientInput {
  productoId: string | null;
  nombreMostrado: string;
  cantidad: number | null;
  unidad: string | null;
  opcional: boolean;
  controlStock: boolean;
}

interface StepInput {
  texto: string;
}

interface RecetaInput {
  titulo: string;
  descripcion: string;
  raciones: number;
  tiempoPreparacionMin: number | null;
  tiempoCoccionMin: number | null;
  visibilidad: string;
  estado: string;
  ingredientes: IngredientInput[];
  pasos: StepInput[];
  /**
   * Solo en creación: id generado en el cliente al abrir "Nueva receta"
   * (RecipeForm), reutilizado como id real de la receta -- así las fotos
   * pueden subirse a Storage bajo {autor_id}/{draftId}/... antes de que la
   * receta exista, y luego asociarse en un solo paso. En edición no se usa
   * (las fotos ya se guardan al vuelo con addRecetaFoto/removeRecetaFoto).
   */
  draftId?: string;
  /** Rutas de Storage de las fotos ya subidas durante el borrador, en orden. */
  fotos?: string[];
}

function parseReceta(formData: FormData): RecetaInput | null {
  try {
    return JSON.parse(String(formData.get("receta_json") ?? "")) as RecetaInput;
  } catch {
    return null;
  }
}

// Reemplaza por completo ingredientes/pasos de una receta (borrado +
// reinserción) -- mismo criterio ya usado en saveReceiptReview para las
// líneas de ticket: el volumen por receta es pequeño y simplifica mucho
// frente a un diff fino.
async function replaceIngredientesYPasos(
  supabase: SupabaseClient,
  recetaId: string,
  ingredientes: IngredientInput[],
  pasos: StepInput[]
) {
  await supabase.from("receta_ingredientes").delete().eq("receta_id", recetaId);
  await supabase.from("receta_pasos").delete().eq("receta_id", recetaId);

  if (ingredientes.length > 0) {
    const { error } = await supabase.from("receta_ingredientes").insert(
      ingredientes.map((ing, index) => ({
        receta_id: recetaId,
        producto_id: ing.productoId,
        nombre_mostrado: ing.nombreMostrado.trim(),
        cantidad: ing.cantidad,
        // ud./gr./ml. se guardan siempre en su forma estándar; las culinarias
        // (cucharada, al gusto...) se conservan tal cual.
        unidad: canonicalizeUnit(ing.unidad),
        opcional: ing.opcional,
        control_stock: ing.controlStock,
        orden: index,
      }))
    );
    if (error) return error.message;
  }

  if (pasos.length > 0) {
    const { error } = await supabase.from("receta_pasos").insert(
      pasos.map((paso, index) => ({
        receta_id: recetaId,
        numero: index + 1,
        texto: paso.texto.trim(),
      }))
    );
    if (error) return error.message;
  }

  return null;
}

function validate(input: RecetaInput | null): { error: string } | { ingredientes: IngredientInput[]; pasos: StepInput[] } {
  if (!input) return { error: "No se pudo leer la receta." };
  if (!input.titulo.trim()) return { error: "El título es obligatorio." };

  const ingredientes = input.ingredientes.filter((i) => i.nombreMostrado.trim());
  if (ingredientes.length === 0) return { error: "Añade al menos un ingrediente." };

  const pasos = input.pasos.filter((p) => p.texto.trim());
  return { ingredientes, pasos };
}

export async function createReceta(
  _prevState: RecetaFormState,
  formData: FormData
): Promise<RecetaFormState> {
  const input = parseReceta(formData);
  const validated = validate(input);
  if ("error" in validated) return validated;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Id generado en el cliente (ver RecetaInput.draftId): así las fotos ya
  // subidas a Storage durante el borrador (bajo este mismo id) encajan con
  // la receta real sin tener que moverlas ni renombrarlas.
  const recetaId = input!.draftId && UUID_RE.test(input!.draftId) ? input!.draftId : crypto.randomUUID();

  const { data: receta, error: recetaError } = await supabase
    .from("recetas")
    .insert({
      id: recetaId,
      titulo: input!.titulo.trim(),
      descripcion: input!.descripcion.trim() || null,
      raciones: input!.raciones,
      tiempo_preparacion_min: input!.tiempoPreparacionMin,
      tiempo_coccion_min: input!.tiempoCoccionMin,
      autor_id: user.id,
      visibilidad: input!.visibilidad,
      estado: input!.estado,
    })
    .select("id")
    .single();

  if (recetaError || !receta) {
    return { error: "No se pudo guardar la receta." };
  }

  const itemsError = await replaceIngredientesYPasos(supabase, receta.id, validated.ingredientes, validated.pasos);
  if (itemsError) return { error: "No se pudieron guardar los ingredientes o los pasos." };

  const fotos = input!.fotos ?? [];
  if (fotos.length > 0) {
    const { error: fotosError } = await supabase
      .from("receta_fotos")
      .insert(fotos.map((path, index) => ({ receta_id: receta.id, storage_path: path, orden: index })));
    if (fotosError) return { error: "No se pudieron asociar las fotos a la receta." };
  }

  revalidatePath("/recetas");
  redirect(`/recetas/${receta.id}`);
}

export async function updateReceta(
  recetaId: string,
  _prevState: RecetaFormState,
  formData: FormData
): Promise<RecetaFormState> {
  const input = parseReceta(formData);
  const validated = validate(input);
  if ("error" in validated) return validated;

  const supabase = await createClient();

  const { error: recetaError } = await supabase
    .from("recetas")
    .update({
      titulo: input!.titulo.trim(),
      descripcion: input!.descripcion.trim() || null,
      raciones: input!.raciones,
      tiempo_preparacion_min: input!.tiempoPreparacionMin,
      tiempo_coccion_min: input!.tiempoCoccionMin,
      visibilidad: input!.visibilidad,
      estado: input!.estado,
    })
    .eq("id", recetaId);

  if (recetaError) {
    return { error: "No se pudo actualizar la receta." };
  }

  const itemsError = await replaceIngredientesYPasos(supabase, recetaId, validated.ingredientes, validated.pasos);
  if (itemsError) return { error: "No se pudieron guardar los ingredientes o los pasos." };

  revalidatePath("/recetas");
  revalidatePath(`/recetas/${recetaId}`);
  redirect(`/recetas/${recetaId}`);
}

export async function deleteReceta(recetaId: string) {
  const supabase = await createClient();

  // Los archivos de Storage no se borran solos con la fila (no hay FK hacia
  // Storage): se leen las rutas ANTES de borrar y solo se limpian si la
  // receta realmente se ha borrado (evita vaciar Storage de una receta que
  // sigue viva porque el delete no tenía permiso -- RLS lo bloquea en
  // silencio, sin lanzar error, así que se comprueba por las filas devueltas).
  const { data: fotos } = await supabase.from("receta_fotos").select("storage_path").eq("receta_id", recetaId);

  const { data: deleted } = await supabase.from("recetas").delete().eq("id", recetaId).select("id");

  if (deleted && deleted.length > 0 && fotos && fotos.length > 0) {
    await supabase.storage.from(RECETA_FOTOS_BUCKET).remove(fotos.map((f) => f.storage_path));
  }

  revalidatePath("/recetas");
  redirect("/recetas");
}

// ----------------------------------------------------------------------------
// Fotos de receta (hasta 3, la primera -- orden más bajo -- es la principal).
// Dos modos, mismo componente cliente (RecipePhotosField):
//   - "borrador" (receta nueva, todavía sin guardar): sube el archivo a
//     Storage bajo {autor_id}/{draftId}/... pero NO inserta en receta_fotos
//     (la fila de recetas no existe todavía) -- createReceta asocia las
//     rutas en un solo paso al guardar (ver arriba).
//   - "edición" (receta ya guardada): sube y asocia en el mismo paso, y
//     elimina fila + archivo al instante.
// ----------------------------------------------------------------------------

export interface UploadedFoto {
  /** Solo en modo edición: ya existe fila en receta_fotos. */
  id?: string;
  path: string;
  url: string;
}

export type RecetaFotoResult = { error: string } | { foto: UploadedFoto };

async function readAndCheckFoto(
  formData: FormData,
  fotosActuales: number
): Promise<{ error: string } | { bytes: Uint8Array; type: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Selecciona una foto." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = bytes.subarray(0, RECETA_FOTO_SIGNATURE_BYTES);
  const problem = checkRecetaFoto({ name: file.name, type: file.type, size: file.size }, head, fotosActuales);
  if (problem) return { error: problem };

  return { bytes, type: file.type };
}

/** Modo borrador: sube a Storage bajo el id generado en el cliente para la receta nueva. Sin fila en receta_fotos todavía. */
export async function uploadDraftRecetaFoto(draftId: string, formData: FormData): Promise<RecetaFotoResult> {
  const fotosActuales = Number(formData.get("current_count") ?? 0);
  const read = await readAndCheckFoto(formData, fotosActuales);
  if ("error" in read) return read;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const path = `${user.id}/${draftId}/${crypto.randomUUID()}.${extensionForImageType(read.type)}`;
  const { error: uploadError } = await supabase.storage
    .from(RECETA_FOTOS_BUCKET)
    .upload(path, read.bytes, { contentType: read.type || "image/jpeg" });
  if (uploadError) return { error: "No se pudo subir la foto. Inténtalo de nuevo." };

  const { data: signed } = await supabase.storage.from(RECETA_FOTOS_BUCKET).createSignedUrl(path, FOTO_SIGNED_URL_SECONDS);
  return { foto: { path, url: signed?.signedUrl ?? "" } };
}

/** Modo borrador: quita un archivo subido antes de guardar la receta (nunca hubo fila que borrar). */
export async function removeDraftRecetaFoto(path: string) {
  const supabase = await createClient();
  await supabase.storage.from(RECETA_FOTOS_BUCKET).remove([path]);
}

/** Modo edición: sube y asocia la foto a una receta ya existente. */
export async function addRecetaFoto(recetaId: string, formData: FormData): Promise<RecetaFotoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: receta } = await supabase.from("recetas").select("autor_id").eq("id", recetaId).maybeSingle();
  if (!receta || receta.autor_id !== user.id) {
    return { error: "No tienes permiso para editar esta receta." };
  }

  const { count } = await supabase
    .from("receta_fotos")
    .select("id", { count: "exact", head: true })
    .eq("receta_id", recetaId);

  const read = await readAndCheckFoto(formData, count ?? 0);
  if ("error" in read) return read;

  const path = `${user.id}/${recetaId}/${crypto.randomUUID()}.${extensionForImageType(read.type)}`;
  const { error: uploadError } = await supabase.storage
    .from(RECETA_FOTOS_BUCKET)
    .upload(path, read.bytes, { contentType: read.type || "image/jpeg" });
  if (uploadError) return { error: "No se pudo subir la foto. Inténtalo de nuevo." };

  const { data: maxOrdenRow } = await supabase
    .from("receta_fotos")
    .select("orden")
    .eq("receta_id", recetaId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: fotoRow, error: insertError } = await supabase
    .from("receta_fotos")
    .insert({ receta_id: recetaId, storage_path: path, orden: (maxOrdenRow?.orden ?? -1) + 1 })
    .select("id")
    .single();

  if (insertError || !fotoRow) {
    await supabase.storage.from(RECETA_FOTOS_BUCKET).remove([path]);
    return { error: "No se pudo guardar la foto en la receta." };
  }

  const { data: signed } = await supabase.storage.from(RECETA_FOTOS_BUCKET).createSignedUrl(path, FOTO_SIGNED_URL_SECONDS);
  revalidatePath(`/recetas/${recetaId}`);
  return { foto: { id: fotoRow.id, path, url: signed?.signedUrl ?? "" } };
}

/**
 * Modo edición: elimina fila + archivo. Si `deletedRows` sale vacío, la RLS
 * ha bloqueado el borrado en silencio (no es el autor) -- se informa en vez
 * de reportar un éxito falso, y el archivo de Storage no se toca.
 */
export async function removeRecetaFoto(fotoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: foto } = await supabase
    .from("receta_fotos")
    .select("receta_id, storage_path")
    .eq("id", fotoId)
    .maybeSingle();
  if (!foto) return { error: "No se encontró la foto." };

  const { data: deletedRows, error: deleteError } = await supabase
    .from("receta_fotos")
    .delete()
    .eq("id", fotoId)
    .select("id");

  if (deleteError) return { error: "No se pudo eliminar la foto." };
  if (!deletedRows || deletedRows.length === 0) {
    return { error: "No tienes permiso para eliminar esta foto." };
  }

  await supabase.storage.from(RECETA_FOTOS_BUCKET).remove([foto.storage_path]);
  revalidatePath(`/recetas/${foto.receta_id}`);
  return {};
}
