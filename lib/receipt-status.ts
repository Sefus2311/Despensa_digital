import type { ReceiptStatus } from "@/lib/types/database";

// Única fuente de los estados de ticket que la lógica de negocio compara por
// nombre. "pending_review" es el estado interno equivalente a
// PENDIENTE_REVISION: ticket importado (JSON) que el usuario aún no ha
// revisado ni confirmado -- nunca alimenta la despensa ni el gasto.
export const RECEIPT_STATUS_PENDING_REVIEW = "pending_review" satisfies ReceiptStatus;
export const RECEIPT_STATUS_REVIEWED = "reviewed" satisfies ReceiptStatus;

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  uploaded: "Subido",
  processing: "Procesando",
  pending_review: "Pendiente de revisión",
  reviewed: "Confirmado",
  error: "Error",
};
