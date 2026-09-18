"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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
        unidad: ing.unidad,
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

  const { data: receta, error: recetaError } = await supabase
    .from("recetas")
    .insert({
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
  await supabase.from("recetas").delete().eq("id", recetaId);
  revalidatePath("/recetas");
  redirect("/recetas");
}
