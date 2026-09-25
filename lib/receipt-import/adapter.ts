// Adaptación del contrato validado (ReceiptImportV1) al modelo interno de
// receipts / receipt_items. Aquí se aplican las reglas de datos de MD:
//  - el estado SIEMPRE es pending_review (el del fichero se ignora);
//  - el supermercado va en MAYÚSCULAS y el producto interpretado en minúsculas;
//  - raw_text se conserva exactamente como llega;
//  - la casa NO forma parte del payload: la aporta el servidor por separado.
import { capitalizeFirstLetter } from "@/lib/format";
import { normalizeSupermarketName } from "@/lib/supermarkets";
import { RECEIPT_STATUS_PENDING_REVIEW } from "@/lib/receipt-status";
import type { ReceiptImportV1 } from "./types";

export interface ReceiptImportHeaderPayload {
  status: typeof RECEIPT_STATUS_PENDING_REVIEW;
  store_name: string;
  purchase_date: string;
  total_amount: number;
  receipt_number: string | null;
  source_provider: string | null;
  source_message_id: string | null;
  source_document_hash: string | null;
  /** Datos secundarios (impuestos, descuentos, avisos, dirección, origen...) en un único jsonb. */
  import_data: Record<string, unknown>;
}

export interface ReceiptImportLinePayload {
  line_number: number;
  raw_name: string;
  product_name: string;
  category: string;
  brand: string | null;
  commercial_name: string | null;
  units_per_pack: number | null;
  quantity: number;
  inventory_quantity: number | null;
  unit: string;
  unit_price: number | null;
  total_price: number;
  is_inventory_item: boolean;
  confidence: number | null;
  review_required: boolean;
  notes: string | null;
}

export interface ReceiptImportPayload {
  receipt: ReceiptImportHeaderPayload;
  lines: ReceiptImportLinePayload[];
}

export interface ImportPayloadOptions {
  /** SHA-256 del PDF adjunto; se usa si el JSON no trae `original_document_hash`. */
  documentHash?: string | null;
}

export function toImportPayload(
  data: ReceiptImportV1,
  options: ImportPayloadOptions = {}
): ReceiptImportPayload {
  const { receipt, source } = data;

  return {
    receipt: {
      status: RECEIPT_STATUS_PENDING_REVIEW,
      store_name: normalizeSupermarketName(receipt.supermarket),
      purchase_date: receipt.purchase_date,
      total_amount: receipt.total,
      receipt_number: receipt.receipt_number,
      source_provider: source.provider,
      source_message_id: source.provider_message_id,
      source_document_hash: source.original_document_hash ?? options.documentHash ?? null,
      import_data: {
        schema: data.schema,
        schema_version: data.schema_version,
        source: {
          channel: source.channel,
          provider: source.provider,
          email_subject: source.email_subject,
          attachment_filename: source.attachment_filename,
        },
        store: {
          tax_id: receipt.tax_id,
          address: receipt.store_address,
          postal_code: receipt.store_postal_code,
          city: receipt.store_city,
          phone: receipt.store_phone,
        },
        purchase_time: receipt.purchase_time,
        operator: receipt.operator,
        currency: receipt.currency,
        subtotal: receipt.subtotal,
        tax_total: receipt.tax_total,
        total_origin: receipt.total_origin,
        payment_method: receipt.payment_method,
        taxes: receipt.taxes,
        discounts: data.discounts,
        warnings: data.warnings,
      },
    },
    lines: data.lines.map((line) => ({
      line_number: line.line_number,
      raw_name: line.raw_text,
      // Primera letra en mayúscula, resto en minúsculas (capitalizeFirstLetter).
      product_name: capitalizeFirstLetter(line.product_name),
      category: line.category,
      brand: line.brand,
      commercial_name: line.commercial_name,
      units_per_pack: line.units_per_pack,
      quantity: line.purchase_quantity,
      // Sin dato explícito, en un producto de inventario se asume lo comprado.
      inventory_quantity:
        line.inventory_quantity ?? (line.is_inventory_item ? line.purchase_quantity : null),
      unit: line.unit,
      unit_price: line.unit_price,
      total_price: line.total_price,
      is_inventory_item: line.is_inventory_item,
      confidence: line.confidence,
      review_required: line.review_required,
      notes: line.notes,
    })),
  };
}
