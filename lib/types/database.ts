// Tipos mínimos alineados con supabase/migrations/*.sql
// (no generados automáticamente todavía; en V0.2 se recomienda `supabase gen types typescript`)

export type ReceiptStatus = "uploaded" | "processing" | "reviewed" | "error";

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
  purchase_date: string | null;
  total_amount: number | null;
  image_path: string;
  status: ReceiptStatus;
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
  category: string | null;
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
  proposed_category: string | null;
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
