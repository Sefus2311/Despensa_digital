// Tipos mínimos alineados con supabase/migrations/*.sql
// (no generados automáticamente todavía; en V0.2 se recomienda `supabase gen types typescript`)

import type { ProductCategory } from "@/lib/constants/product-categories";

// "pending_review" = PENDIENTE_REVISION: ticket importado por JSON, aún sin confirmar (0019).
export type ReceiptStatus = "uploaded" | "processing" | "pending_review" | "reviewed" | "error";

// Rol de sistema del usuario (ortogonal a la pertenencia a una Casa, ver
// home_members / getCurrentUserAndHome()). Controla capacidades globales de
// la plataforma (moderación del intérprete, administración), nunca el
// acceso a los datos domésticos de una Casa concreta.
export type SystemRole = "user" | "delegate" | "admin";

export type InventoryEventType =
  | "purchase"
  | "correction"
  | "consumed"
  | "adjustment";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  default_home_id: string | null;
  system_role: SystemRole;
  created_at: string;
  updated_at: string;
}

export interface Home {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HomeMember {
  id: string;
  home_id: string;
  user_id: string;
  role: "owner" | "member" | "guest";
  created_at: string;
}

export interface Receipt {
  id: string;
  home_id: string;
  user_id: string;
  store_name: string | null;
  /** Columna generada (normalize_product_text(store_name), 0011) -- "" si store_name es nulo. */
  store_key: string | null;
  purchase_date: string | null;
  total_amount: number | null;
  /** Null en tickets importados por JSON (no tienen imagen), desde 0019. */
  image_path: string | null;
  status: ReceiptStatus;
  receipt_number: string | null;
  source_provider: string | null;
  source_message_id: string | null;
  source_document_hash: string | null;
  /** Datos secundarios de la importación (impuestos, descuentos, avisos...). */
  import_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  canonical_name: string;
  brand: string | null;
  category: string | null;
  default_unit: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  raw_name: string;
  product_id: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  // Campos de la interpretación (0019); null en líneas escritas a mano.
  line_number: number | null;
  /** Producto interpretado, en minúsculas. raw_name sigue siendo el texto del ticket. */
  product_name: string | null;
  category: ProductCategory | null;
  brand: string | null;
  commercial_name: string | null;
  units_per_pack: number | null;
  inventory_quantity: number | null;
  confidence: number | null;
  review_required: boolean;
  notes: string | null;
  is_inventory_item: boolean;
  created_at: string;
}

export type HomeInvitationStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface HomeInvitation {
  id: string;
  home_id: string;
  home_name: string;
  invited_email: string;
  invited_by: string;
  status: HomeInvitationStatus;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
}

export interface InventoryEvent {
  id: string;
  home_id: string;
  product_id: string;
  event_type: InventoryEventType;
  quantity: number;
  event_date: string;
  source: string | null;
  receipt_item_id: string | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Intérprete global de productos (supabase/migrations/0006_interpreter_and_admin.sql)
// Conocimiento global de la plataforma, no ligado a ninguna Casa. Los `user`
// sólo escriben en interpreter_proposals (vía submit_interpreter_proposal);
// canonical_products/retailer_products/product_aliases sólo se escriben
// desde funciones SECURITY DEFINER que exigen delegate/admin.
// ----------------------------------------------------------------------------

export type ProposalStatus = "pending" | "approved" | "rejected" | "conflict";

export interface CanonicalProduct {
  id: string;
  canonical_name: string;
  normalized_name: string;
  /** NOT NULL DEFAULT 'VARIOS' desde 0013_product_categories.sql -- siempre válida, nunca null. */
  category: ProductCategory;
  default_unit: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface RetailerProduct {
  id: string;
  canonical_product_id: string;
  retailer: string;
  brand: string | null;
  commercial_name: string;
  normalized_commercial_name: string;
  package_quantity: number | null;
  package_unit: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ProductAlias {
  id: string;
  retailer: string;
  raw_name: string;
  normalized_raw_name: string;
  retailer_product_id: string;
  confidence_score: number | null;
  times_seen: number;
  times_confirmed: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
}

// interpreter_history (0010_interpreter_management.sql): rastro de
// altas/ediciones/bajas/restauraciones sobre las tres tablas de arriba.
export type InterpreterEntryType = "canonical_product" | "retailer_product" | "product_alias";
export type InterpreterChangeType = "create" | "update" | "delete" | "restore";

export interface InterpreterHistoryEntry {
  id: string;
  entry_type: InterpreterEntryType;
  entry_id: string;
  change_type: InterpreterChangeType;
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_by_email?: string | null;
  changed_at: string;
}

export interface InterpreterProposal {
  id: string;
  retailer: string;
  raw_name: string;
  normalized_raw_name: string;
  proposed_canonical_name: string;
  proposed_brand: string | null;
  /** null = todavía sin categoría propuesta (distinto de "VARIOS" explícito). */
  proposed_category: ProductCategory | null;
  proposed_quantity: number | null;
  proposed_unit: string | null;
  proposed_retailer_product_id: string | null;
  ai_confidence: number | null;
  user_confirmations: number;
  user_conflicts: number;
  submitted_by: string | null;
  status: ProposalStatus;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Recetas (supabase/migrations/0015_recetas.sql) — ver docs/RECIPES_ARCHITECTURE.md.
// `recetas` no lleva home_id: es del autor, no de una Casa; la comprobación
// de stock se hace en tiempo de consulta contra la Casa activa de quien
// mira la receta, no contra una Casa fija guardada en ella.
// ----------------------------------------------------------------------------

export type RecetaVisibilidad = "privada" | "amigos" | "publica";
export type RecetaEstado = "borrador" | "activa";

export interface Receta {
  id: string;
  titulo: string;
  descripcion: string | null;
  raciones: number;
  tiempo_preparacion_min: number | null;
  tiempo_coccion_min: number | null;
  autor_id: string;
  visibilidad: RecetaVisibilidad;
  estado: RecetaEstado;
  created_at: string;
  updated_at: string;
}

export interface RecetaIngrediente {
  id: string;
  receta_id: string;
  /** null = sin coincidencia en canonical_products todavía (ver nombre_mostrado). */
  producto_id: string | null;
  nombre_mostrado: string;
  cantidad: number | null;
  unidad: string | null;
  opcional: boolean;
  control_stock: boolean;
  orden: number;
  notas: string | null;
}

export interface RecetaPaso {
  id: string;
  receta_id: string;
  numero: number;
  texto: string;
}

// shopping_list_items (nueva: no existía ningún sistema de lista de la
// compra en la app antes de Recetas Fase 1).
export interface ShoppingListItem {
  id: string;
  home_id: string;
  canonical_product_id: string | null;
  display_name: string;
  quantity: number | null;
  unit: string | null;
  is_checked: boolean;
  source: "manual" | "receta";
  source_receta_id: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAuditLogEntry {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Fila devuelta por la RPC admin_list_users().
export interface AdminUserListItem {
  id: string;
  email: string;
  display_name: string | null;
  system_role: SystemRole;
  created_at: string;
  email_confirmed_at: string | null;
  banned_until: string | null;
}

// Objeto devuelto por la RPC admin_get_metrics().
export interface AdminMetrics {
  total_users: number;
  new_users_30d: number;
  delegates: number;
  admins: number;
  pending_proposals: number;
  open_conflicts: number;
  approved_aliases: number;
  canonical_products: number;
  retailer_products: number;
  proposals_approved_pct: number | null;
  proposals_rejected_pct: number | null;
}
