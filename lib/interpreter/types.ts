import type {
  CanonicalProduct,
  InterpreterHistoryEntry,
  ProductAlias,
  RetailerProduct,
} from "@/lib/types/database";

// Forma del jsonb devuelto por get_interpreter_alias_detail() (0010_interpreter_management.sql).
export interface AliasDetailData {
  alias: ProductAlias & { updated_by_email: string | null };
  retailer_product: RetailerProduct & { updated_by_email: string | null };
  canonical_product: CanonicalProduct & { updated_by_email: string | null };
  history: (InterpreterHistoryEntry & { changed_by_email: string | null })[];
}
