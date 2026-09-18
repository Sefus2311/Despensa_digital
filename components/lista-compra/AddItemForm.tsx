"use client";

import { useActionState, useState } from "react";
import { ProductPicker } from "@/components/recetas/ProductPicker";
import { addManualItem, type ListaCompraState } from "@/app/(app)/lista-compra/actions";

export function AddItemForm() {
  const [state, formAction, pending] = useActionState<ListaCompraState, FormData>(addManualItem, null);
  const [productoId, setProductoId] = useState<string | null>(null);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [nombreMostrado, setNombreMostrado] = useState("");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      onSubmit={() => {
        setProductoId(null);
        setLinkedName(null);
        setNombreMostrado("");
      }}
    >
      <ProductPicker
        productoId={productoId}
        linkedName={linkedName}
        onLink={(id, canonicalName) => {
          setProductoId(id);
          setLinkedName(canonicalName);
          if (!nombreMostrado) setNombreMostrado(canonicalName);
        }}
        onUnlink={() => {
          setProductoId(null);
          setLinkedName(null);
        }}
      />
      <input type="hidden" name="producto_id" value={productoId ?? ""} />
      <input
        name="nombre_mostrado"
        value={nombreMostrado}
        onChange={(e) => setNombreMostrado(e.target.value)}
        placeholder="Producto a añadir"
        required
        className="ui-field__input"
      />
      <div className="flex gap-2">
        <input name="cantidad" type="number" step="0.01" min={0} placeholder="Cantidad" className="ui-field__input flex-1" />
        <input name="unidad" placeholder="Unidad" className="ui-field__input flex-1" />
      </div>
      {state?.error && (
        <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="ui-button ui-button--primary">
        {pending ? "Añadiendo..." : "+ Añadir a la lista"}
      </button>
    </form>
  );
}
