// Persistencia de la importación. Una ÚNICA llamada RPC (import_receipt_json,
// migraciones 0019/0020) crea cabecera + líneas dentro de una sola transacción de
// Postgres: si algo falla, no queda nada guardado. Este módulo no inserta en
// ninguna tabla directamente y, por diseño, no toca la despensa ni los
// movimientos de inventario (el ticket queda en pending_review).
import type { ReceiptImportPayload } from "./adapter";

/** Subconjunto mínimo del cliente Supabase que necesita la importación (facilita los tests). */
export interface ReceiptImportClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
}

export type DuplicateReason = "provider_message_id" | "receipt_number" | "document_hash";

export type ReceiptImportResult =
  | { ok: true; receiptId: string }
  | { ok: false; code: "no_home" | "forbidden" | "db_error"; message: string }
  | {
      ok: false;
      code: "duplicate";
      message: string;
      receiptId: string;
      /** Estado del ticket ya existente (decide si se abre la revisión o el detalle). */
      receiptStatus: string;
      reason: DuplicateReason;
    };

const DUPLICATE_REASON_TEXT: Record<DuplicateReason, string> = {
  provider_message_id: "mismo identificador de correo",
  receipt_number: "mismo supermercado y número de ticket",
  document_hash: "mismo documento original",
};

function isDuplicateReason(value: unknown): value is DuplicateReason {
  return value === "provider_message_id" || value === "receipt_number" || value === "document_hash";
}

export async function importReceipt(
  client: ReceiptImportClient,
  homeId: string | null | undefined,
  payload: ReceiptImportPayload,
  /** Ruta del PDF ya subido a Storage ({homeId}/{uuid}.pdf); null = sin archivo. */
  imagePath: string | null = null
): Promise<ReceiptImportResult> {
  if (!homeId) {
    return { ok: false, code: "no_home", message: "No hay una casa activa seleccionada." };
  }

  const { data, error } = await client.rpc("import_receipt_json", {
    p_home_id: homeId,
    p_receipt: payload.receipt,
    p_lines: payload.lines,
    p_image_path: imagePath,
  });

  if (error) {
    // 42501 = insufficient_privilege: la función lo lanza si la casa no es del usuario.
    if (error.code === "42501" || error.message.includes("not_a_member")) {
      return { ok: false, code: "forbidden", message: "No tienes acceso a la casa seleccionada." };
    }
    return {
      ok: false,
      code: "db_error",
      message: "No se pudo importar el ticket. No se ha guardado nada.",
    };
  }

  const result = data as {
    status?: string;
    receipt_id?: string;
    receipt_status?: string;
    reason?: unknown;
  } | null;

  if (!result || typeof result.receipt_id !== "string") {
    return { ok: false, code: "db_error", message: "No se pudo importar el ticket. No se ha guardado nada." };
  }

  if (result.status === "duplicate") {
    const reason = isDuplicateReason(result.reason) ? result.reason : "receipt_number";
    return {
      ok: false,
      code: "duplicate",
      message: `Este ticket parece haber sido importado anteriormente (${DUPLICATE_REASON_TEXT[reason]}).`,
      receiptId: result.receipt_id,
      receiptStatus: result.receipt_status ?? "",
      reason,
    };
  }

  return { ok: true, receiptId: result.receipt_id };
}
