// Tipos mínimos alineados con supabase/migrations/0001_init.sql
// (no generados automáticamente todavía; en V0.2 se recomienda `supabase gen types typescript`)

export type ReceiptStatus = "uploaded" | "processing" | "reviewed" | "error";

export type InventoryEventType =
  | "purchase"
  | "correction"
  | "consumed"
  | "adjustment";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Household {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
}

export interface Receipt {
  id: string;
  household_id: string;
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

export interface InventoryEvent {
  id: string;
  household_id: string;
  product_id: string;
  event_type: InventoryEventType;
  quantity: number;
  event_date: string;
  source: string | null;
  receipt_item_id: string | null;
  created_at: string;
}
