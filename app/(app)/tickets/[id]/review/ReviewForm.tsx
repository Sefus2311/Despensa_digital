"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/Card";
import { ReceiptImage } from "@/components/ReceiptImage";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/constants/product-categories";
import { capitalizeFirstLetter } from "@/lib/format";
import { STANDARD_UNITS } from "@/lib/units";
import { saveReceiptReview, type SaveReviewState } from "../actions";

interface ItemDraft {
  rawName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  // "" mientras el usuario no ha elegido -- el <select required> bloquea el
  // envío nativo hasta que valga una ProductCategory real (ver saveReceiptReview
  // para la validación de respaldo en el servidor).
  category: ProductCategory | "";
  brand: string | null;
  // Interpretación (ticket importado por JSON). `productName === null` = línea
  // escrita a mano: se edita solo con `rawName`, como siempre.
  productName: string | null;
  commercialName: string | null;
  unitsPerPack: number | null;
  inventoryQuantity: number | null;
  confidence: number | null;
  reviewRequired: boolean;
  notes: string | null;
  isInventoryItem: boolean;
}

function newItem(): ItemDraft {
  return {
    rawName: "",
    quantity: 1,
    unit: null,
    unitPrice: null,
    totalPrice: null,
    category: "",
    brand: null,
    productName: null,
    commercialName: null,
    unitsPerPack: null,
    inventoryQuantity: null,
    confidence: null,
    reviewRequired: false,
    notes: null,
    isInventoryItem: true,
  };
}

export function ReviewForm({
  receiptId,
  imageUrl,
  isPdf,
  isEditing,
  isPendingReview,
  initialStoreName,
  initialPurchaseDate,
  initialTotalAmount,
  initialItems,
}: {
  receiptId: string;
  imageUrl: string | null;
  isPdf: boolean;
  isEditing: boolean;
  /** Ticket importado por JSON, pendiente de revisar y confirmar. */
  isPendingReview: boolean;
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
    initialItems.length > 0 ? initialItems : [newItem()]
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
    setItems((prev) => [...prev, newItem()]);
  }

  // Evita el envío implícito del formulario al pulsar Intro/Aceptar en el
  // teclado numérico (Cantidad, Precio unidad, Importe...) -- sin esto, el
  // único botón de envío ("Guardar compra") se dispara igualmente y guarda
  // el ticket a medio rellenar en cuanto el usuario cierra el teclado.
  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  }

  return (
    <form action={formAction} onKeyDown={preventEnterSubmit} className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold font-display">
          {isEditing ? "Editar ticket" : isPendingReview ? "Revisar ticket importado" : "Revisar ticket"}
        </h1>
        <p className="text-[15px] text-[var(--color-muted)] mt-1">
          Comprueba los datos y ajusta los productos antes de guardar.
        </p>
      </header>

      {isPendingReview && (
        <Alert tone="warning">
          Ticket importado correctamente. Está pendiente de revisión: la despensa no se actualizará hasta que
          pulses «Confirmar compra».
        </Alert>
      )}

      {imageUrl && <ReceiptImage src={imageUrl} isPdf={isPdf} />}

      <Card className="flex flex-col gap-3">
        <div>
          <label htmlFor="store_name" className="ui-field__label">
            Supermercado
          </label>
          <input
            id="store_name"
            name="store_name"
            defaultValue={initialStoreName}
            placeholder="Mercadona, Carrefour..."
            className="ui-field__input mt-1"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="purchase_date" className="ui-field__label">
              Fecha
            </label>
            <input
              id="purchase_date"
              name="purchase_date"
              type="date"
              defaultValue={initialPurchaseDate}
              className="ui-field__input mt-1"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="total_amount" className="ui-field__label">
              Total (€)
            </label>
            <input
              id="total_amount"
              name="total_amount"
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={initialTotalAmount}
              className="ui-field__input mt-1"
            />
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Productos</h2>

        {items.map((item, index) => (
          <Card key={index} className="flex flex-col gap-2">
            {item.productName !== null ? (
              <>
                {(item.reviewRequired || item.confidence !== null) && (
                  <div className="flex flex-wrap gap-2">
                    {item.reviewRequired && <Badge tone="warning">Revisar</Badge>}
                    {item.confidence !== null && (
                      <Badge tone={item.confidence >= 0.8 ? "success" : "warning"}>
                        Confianza {Math.round(item.confidence * 100)}%
                      </Badge>
                    )}
                  </div>
                )}
                <input
                  aria-label="Producto"
                  value={item.productName}
                  onChange={(e) => updateItem(index, { productName: capitalizeFirstLetter(e.target.value) })}
                  placeholder="Producto interpretado"
                  className="ui-field__input font-medium"
                />
                <p className="text-[13px] text-[var(--color-muted)] font-mono break-words">
                  Ticket: {item.rawName}
                </p>
              </>
            ) : (
              <input
                aria-label="Nombre del producto"
                value={item.rawName}
                onChange={(e) => updateItem(index, { rawName: e.target.value })}
                placeholder="Ej. YOG GRIE NAT H 6U"
                className="ui-field__input font-medium"
              />
            )}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[15px] text-[var(--color-muted)]">Cantidad</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(index, { quantity: Number(e.target.value) })
                  }
                  className="ui-field__input"
                />
              </div>
              <div className="flex-1">
                <label className="text-[15px] text-[var(--color-muted)]">Unidad</label>
                {item.productName !== null ? (
                  <select
                    value={item.unit ?? ""}
                    onChange={(e) => updateItem(index, { unit: e.target.value || null })}
                    className="ui-field__input"
                  >
                    {item.unit && !(STANDARD_UNITS as readonly string[]).includes(item.unit) && (
                      <option value={item.unit}>{item.unit}</option>
                    )}
                    {STANDARD_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={item.unit ?? ""}
                    onChange={(e) =>
                      updateItem(index, { unit: e.target.value || null })
                    }
                    placeholder="uds, kg..."
                    className="ui-field__input"
                  />
                )}
              </div>
            </div>
            {item.productName !== null && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[15px] text-[var(--color-muted)]">Uds. por pack</label>
                  <p className="ui-field__input flex items-center text-[var(--color-muted)]">
                    {item.unitsPerPack ?? "—"}
                  </p>
                </div>
                <div className="flex-1">
                  <label className="text-[15px] text-[var(--color-muted)]">Cantidad a inventario</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    inputMode="decimal"
                    value={item.inventoryQuantity ?? ""}
                    onChange={(e) =>
                      updateItem(index, {
                        inventoryQuantity: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    disabled={!item.isInventoryItem}
                    className="ui-field__input"
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[15px] text-[var(--color-muted)]">Categoría</label>
                <select
                  required
                  value={item.category}
                  onChange={(e) =>
                    updateItem(index, { category: e.target.value as ProductCategory })
                  }
                  className="ui-field__input"
                >
                  <option value="" disabled>
                    Selecciona categoría
                  </option>
                  {PRODUCT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[15px] text-[var(--color-muted)]">Marca</label>
                <input
                  value={item.brand ?? ""}
                  onChange={(e) => updateItem(index, { brand: e.target.value || null })}
                  placeholder="Opcional, ej. Nestlé"
                  className="ui-field__input"
                />
              </div>
            </div>
            {item.productName !== null && (
              <div>
                <label className="text-[15px] text-[var(--color-muted)]">Nombre comercial</label>
                <input
                  value={item.commercialName ?? ""}
                  onChange={(e) => updateItem(index, { commercialName: e.target.value || null })}
                  placeholder="Opcional"
                  className="ui-field__input"
                />
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[15px] text-[var(--color-muted)]">
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
                  className="ui-field__input"
                />
              </div>
              <div className="flex-1">
                <label className="text-[15px] text-[var(--color-muted)]">Importe (€)</label>
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
                  className="ui-field__input"
                />
              </div>
            </div>
            {item.notes && (
              <p className="text-[15px] text-[var(--color-muted)]">{item.notes}</p>
            )}
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="self-end text-[15px] text-[var(--color-danger-text)] font-medium py-1"
            >
              Eliminar línea
            </button>
          </Card>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="w-full rounded-xl border border-dashed border-[var(--color-border)] py-3 text-[15px] font-medium text-[var(--color-primary-text)]"
        >
          + Añadir producto
        </button>
      </div>

      <input type="hidden" name="items_json" value={JSON.stringify(items)} />

      {state?.error && (
        <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[var(--color-primary)] text-white py-3.5 font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        {pending ? "Guardando..." : isPendingReview ? "Confirmar compra" : "Guardar compra"}
      </button>
    </form>
  );
}
