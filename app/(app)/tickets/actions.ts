"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndHome } from "@/lib/home";
import { toImportPayload } from "@/lib/receipt-import/adapter";
import { importReceipt, type ReceiptImportClient } from "@/lib/receipt-import/persist";
import { checkReceiptPdf, sha256Hex } from "@/lib/receipt-import/pdf";
import { parseReceiptImportJson } from "@/lib/receipt-import/validate";

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

export type ImportJsonState = {
  error?: string;
  /** Problemas concretos del fichero (uno por línea de la lista en pantalla). */
  issues?: string[];
  /** Si el ticket ya existía: enlace para abrirlo. */
  duplicate?: { href: string };
} | null;

/**
 * Importa un ticket desde un JSON (receipt_interpretation_v1) + el PDF del
 * ticket, que es obligatorio. Valida de nuevo en el servidor (no se confía en
 * el cliente), resuelve la casa SIEMPRE desde la sesión (getCurrentUserAndHome),
 * sube el PDF al bucket privado y delega la escritura atómica en el RPC
 * import_receipt_json, que lo asocia al ticket (receipts.image_path). Si el
 * ticket no llega a crearse (duplicado, error), el PDF recién subido se borra.
 * El ticket queda en pending_review: no toca la despensa.
 */
export async function importReceiptJson(
  _prevState: ImportJsonState,
  formData: FormData
): Promise<ImportJsonState> {
  const text = formData.get("json");
  if (typeof text !== "string" || text.trim() === "") {
    return { error: "Selecciona un archivo JSON." };
  }

  const parsed = parseReceiptImportJson(text);
  if (!parsed.ok) {
    return {
      error: parsed.issues[0]?.message ?? "El formato del ticket no es compatible.",
      issues: parsed.issues.map((issue) => issue.message),
    };
  }

  const pdf = formData.get("pdf");
  if (!(pdf instanceof File) || pdf.size === 0) {
    return { error: "Adjunta el PDF del ticket antes de importar." };
  }
  const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
  const pdfError = checkReceiptPdf({ name: pdf.name, type: pdf.type, size: pdf.size }, pdfBytes.subarray(0, 5));
  if (pdfError) return { error: pdfError };

  const { supabase, homeId } = await getCurrentUserAndHome();

  // El PDF se sube antes de crear el ticket (así el ticket nunca apunta a un
  // archivo inexistente) y se borra si el ticket no llega a crearse.
  const pdfPath = `${homeId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(pdfPath, pdfBytes, { contentType: "application/pdf" });
  if (uploadError) {
    return { error: "No se pudo subir el PDF. No se ha guardado nada." };
  }

  const removePdf = () => supabase.storage.from("receipts").remove([pdfPath]);

  let result;
  try {
    result = await importReceipt(
      supabase as unknown as ReceiptImportClient,
      homeId,
      toImportPayload(parsed.data, { documentHash: await sha256Hex(pdfBytes) }),
      pdfPath
    );
  } catch {
    await removePdf();
    return { error: "No se pudo importar el ticket. No se ha guardado nada." };
  }

  if (!result.ok) {
    await removePdf();
    if (result.code === "duplicate") {
      return {
        error: result.message,
        duplicate: {
          href:
            result.receiptStatus === "reviewed"
              ? `/historial/${result.receiptId}`
              : `/tickets/${result.receiptId}/review`,
        },
      };
    }
    return { error: result.message };
  }

  revalidatePath("/historial");
  redirect(`/tickets/${result.receiptId}/review`);
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
