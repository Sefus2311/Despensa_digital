"use client";

import { useTransition } from "react";
import { removeItem, toggleChecked } from "@/app/(app)/lista-compra/actions";
import type { ShoppingListItem } from "@/lib/types/database";
import { canonicalizeUnit } from "@/lib/units";

export function ShoppingListRow({ item }: { item: ShoppingListItem }) {
  const [, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 py-2">
      <input
        type="checkbox"
        checked={item.is_checked}
        onChange={(e) => startTransition(() => toggleChecked(item.id, e.target.checked))}
        className="w-5 h-5 accent-[var(--color-primary)] shrink-0"
        aria-label={`Marcar ${item.display_name} como comprado`}
      />
      <span
        className={`text-[15px] flex-1 ${item.is_checked ? "line-through text-[var(--color-muted)]" : ""}`}
      >
        {item.quantity != null && `${item.quantity} `}
        {item.unit && `${canonicalizeUnit(item.unit)} `}
        {item.display_name}
        {item.source === "receta" && (
          <span className="text-[var(--color-muted)]"> · de una receta</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => startTransition(() => removeItem(item.id))}
        aria-label={`Eliminar ${item.display_name}`}
        className="text-[15px] text-[var(--color-danger-text)] font-medium shrink-0"
      >
        Eliminar
      </button>
    </div>
  );
}
