"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/Card";
import { ReceiptImage } from "@/components/ReceiptImage";
import { saveReceiptReview, type SaveReviewState } from "../actions";

interface ItemDraft {
  rawName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

export function ReviewForm({
  receiptId,
  imageUrl,
  isPdf,
  isEditing,
  initialStoreName,
  initialPurchaseDate,
  initialTotalAmount,
  initialItems,
}: {
  receiptId: string;
  imageUrl: string | null;
  isPdf: boolean;
  isEditing: boolean;
  initialStoreName: string;
  initialPurchaseDate: string;
  initialTotalAmount: string;
  initialItems: ItemDraft[];
}) {
  const boundAction = saveReceiptReview.bind(null, receiptId);
  const [state, formAction, pending] = useActionState<
    SaveReviewState,
    FormData
  >(boundAction, null);

  const [items, setItems] = useState<ItemDraft[]>(
    initialItems.length > 0
      ? initialItems
      : [{ rawName: "", quantity: 1, unit: null, unitPrice: null, totalPrice: null }]
  );

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { rawName: "", quantity: 1, unit: null, unitPrice: null, totalPrice: null },
    ]);
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold font-display">
          {isEditing ? "Editar ticket" : "Revisar ticket"}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Comprueba los datos y ajusta los productos antes de guardar.
        </p>
      </header>

      {imageUrl && <ReceiptImage src={imageUrl} isPdf={isPdf} />}

      <Card className="flex flex-col gap-3">
        <div>
          <label htmlFor="store_name" className="text-sm font-medium">
            Supermercado
          </label>
          <input
            id="store_name"
            name="store_name"
            defaultValue={initialStoreName}
            placeholder="Mercadona, Carrefour..."
            className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="purchase_date" className="text-sm font-medium">
              Fecha
            </label>
            <input
              id="purchase_date"
              name="purchase_date"
              type="date"
              defaultValue={initialPurchaseDate}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="total_amount" className="text-sm font-medium">
              Total (€)
            </label>
            <input
              id="total_amount"
              name="total_amount"
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={initialTotalAmount}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
            />
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Productos</h2>

        {items.map((item, index) => (
          <Card key={index} className="flex flex-col gap-2">
            <input
              aria-label="Nombre del producto"
              value={item.rawName}
              onChange={(e) => updateItem(index, { rawName: e.target.value })}
              placeholder="Ej. YOG GRIE NAT H 6U"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium"
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[15px] text-neutral-500">Cantidad</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(index, { quantity: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-[15px] text-neutral-500">Unidad</label>
                <input
                  value={item.unit ?? ""}
                  onChange={(e) =>
                    updateItem(index, { unit: e.target.value || null })
                  }
                  placeholder="uds, kg..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[15px] text-neutral-500">
                  Precio unidad (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={item.unitPrice ?? ""}
                  onChange={(e) =>
                    updateItem(index, {
                      unitPrice: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-[15px] text-neutral-500">Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={item.totalPrice ?? ""}
                  onChange={(e) =>
                    updateItem(index, {
                      totalPrice: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="self-end text-sm text-red-600 font-medium py-1"
            >
              Eliminar línea
            </button>
          </Card>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="w-full rounded-xl border border-dashed border-neutral-300 py-3 text-sm font-medium text-teal-700"
        >
          + Añadir producto
        </button>
      </div>

      <input type="hidden" name="items_json" value={JSON.stringify(items)} />

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-teal-700 text-white py-3.5 font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Guardar compra"}
      </button>
    </form>
  );
}
