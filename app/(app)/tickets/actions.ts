"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndHome } from "@/lib/home";

export type UploadReceiptState = { error?: string } | null;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export async function uploadReceipt(
  _prevState: UploadReceiptState,
  formData: FormData
): Promise<UploadReceiptState> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona o fotografía un ticket." };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Formato no soportado. Usa JPEG, PNG, WEBP o PDF." };
  }

  if (file.size > MAX_SIZE_BYTES) {
    return { error: "La imagen es demasiado grande (máximo 15 MB)." };
  }

  const { supabase, user, homeId } = await getCurrentUserAndHome();

  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${homeId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return { error: "No se pudo subir la imagen. Inténtalo de nuevo." };
  }

  const { data: receipt, error: insertError } = await supabase
    .from("receipts")
    .insert({
      home_id: homeId,
      user_id: user.id,
      image_path: path,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (insertError || !receipt) {
    return { error: "No se pudo registrar el ticket." };
  }

  revalidatePath("/historial");
  redirect(`/tickets/${receipt.id}/review`);
}

/** Devuelve una signed URL temporal para mostrar la imagen del ticket. */
export async function getReceiptImageUrl(imagePath: string) {
  const supabase = await createClient();
  // 1 hora: la página puede quedarse abierta en una pestaña o reabrirse
  // desde el historial de navegación; 10 min caducaba antes de que el
  // usuario llegase a verla, mostrando la imagen rota.
  const { data } = await supabase.storage
    .from("receipts")
    .createSignedUrl(imagePath, 60 * 60);

  return data?.signedUrl ?? null;
}
