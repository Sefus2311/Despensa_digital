"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/Card";
import { ProductPicker } from "@/components/recetas/ProductPicker";
import type { RecetaEstado, RecetaVisibilidad } from "@/lib/types/database";
import type { RecetaFormState } from "@/app/(app)/recetas/actions";

export interface IngredientDraft {
  productoId: string | null;
  linkedName: string | null;
  nombreMostrado: string;
  cantidad: number | null;
  unidad: string | null;
  opcional: boolean;
  controlStock: boolean;
}

export interface StepDraft {
  texto: string;
}

export interface RecipeFormValues {
  titulo: string;
  descripcion: string;
  raciones: number;
  tiempoPreparacionMin: number | null;
  tiempoCoccionMin: number | null;
  visibilidad: RecetaVisibilidad;
  estado: RecetaEstado;
  ingredientes: IngredientDraft[];
  pasos: StepDraft[];
}

function emptyIngredient(): IngredientDraft {
  return {
    productoId: null,
    linkedName: null,
    nombreMostrado: "",
    cantidad: null,
    unidad: null,
    opcional: false,
    controlStock: true,
  };
}

export function RecipeForm({
  action,
  initialValues,
  submitLabel,
}: {
  action: (prevState: RecetaFormState, formData: FormData) => Promise<RecetaFormState>;
  initialValues?: RecipeFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<RecetaFormState, FormData>(action, null);

  const [titulo, setTitulo] = useState(initialValues?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(initialValues?.descripcion ?? "");
  const [raciones, setRaciones] = useState(initialValues?.raciones ?? 4);
  const [tiempoPreparacionMin, setTiempoPreparacionMin] = useState<number | null>(
    initialValues?.tiempoPreparacionMin ?? null
  );
  const [tiempoCoccionMin, setTiempoCoccionMin] = useState<number | null>(
    initialValues?.tiempoCoccionMin ?? null
  );
  const [visibilidad, setVisibilidad] = useState<RecetaVisibilidad>(initialValues?.visibilidad ?? "privada");
  const [estado, setEstado] = useState<RecetaEstado>(initialValues?.estado ?? "borrador");
  const [ingredientes, setIngredientes] = useState<IngredientDraft[]>(
    initialValues?.ingredientes.length ? initialValues.ingredientes : [emptyIngredient()]
  );
  const [pasos, setPasos] = useState<StepDraft[]>(
    initialValues?.pasos.length ? initialValues.pasos : [{ texto: "" }]
  );

  function updateIngrediente(index: number, patch: Partial<IngredientDraft>) {
    setIngredientes((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function moveIngrediente(index: number, dir: -1 | 1) {
    setIngredientes((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function removeIngrediente(index: number) {
    setIngredientes((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePaso(index: number, texto: string) {
    setPasos((prev) => prev.map((p, i) => (i === index ? { texto } : p)));
  }
  function movePaso(index: number, dir: -1 | 1) {
    setPasos((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function removePaso(index: number) {
    setPasos((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3">
        <div className="ui-field">
          <label className="ui-field__label" htmlFor="titulo">
            Título <span className="ui-field__required">*</span>
          </label>
          <input
            id="titulo"
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="ui-field__input"
            placeholder="Ej. Tortilla de patatas"
          />
        </div>
        <div className="ui-field">
          <label className="ui-field__label" htmlFor="descripcion">
            Descripción
          </label>
          <textarea
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="ui-field__input ui-field__textarea"
            placeholder="Opcional"
          />
        </div>
        <div className="flex gap-2">
          <div className="ui-field flex-1">
            <label className="ui-field__label" htmlFor="raciones">
              Raciones
            </label>
            <input
              id="raciones"
              type="number"
              min={1}
              value={raciones}
              onChange={(e) => setRaciones(Number(e.target.value) || 1)}
              className="ui-field__input"
            />
          </div>
          <div className="ui-field flex-1">
            <label className="ui-field__label" htmlFor="tiempo_preparacion">
              Preparación (min)
            </label>
            <input
              id="tiempo_preparacion"
              type="number"
              min={0}
              value={tiempoPreparacionMin ?? ""}
              onChange={(e) => setTiempoPreparacionMin(e.target.value ? Number(e.target.value) : null)}
              className="ui-field__input"
            />
          </div>
          <div className="ui-field flex-1">
            <label className="ui-field__label" htmlFor="tiempo_coccion">
              Cocción (min)
            </label>
            <input
              id="tiempo_coccion"
              type="number"
              min={0}
              value={tiempoCoccionMin ?? ""}
              onChange={(e) => setTiempoCoccionMin(e.target.value ? Number(e.target.value) : null)}
              className="ui-field__input"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="ui-field flex-1">
            <label className="ui-field__label" htmlFor="visibilidad">
              Visibilidad
            </label>
            <select
              id="visibilidad"
              value={visibilidad}
              onChange={(e) => setVisibilidad(e.target.value as RecetaVisibilidad)}
              className="ui-field__input"
            >
              <option value="privada">Privada</option>
              <option value="amigos">Amigos</option>
              <option value="publica">Pública</option>
            </select>
            {visibilidad === "amigos" && (
              <p className="ui-field__help">
                MD todavía no tiene un sistema de amigos: por ahora esta receta solo la verás tú, igual
                que si fuera privada.
              </p>
            )}
          </div>
          <div className="ui-field flex-1">
            <label className="ui-field__label" htmlFor="estado">
              Estado
            </label>
            <select
              id="estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value as RecetaEstado)}
              className="ui-field__input"
            >
              <option value="borrador">Borrador</option>
              <option value="activa">Activa</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Ingredientes</h2>
        {ingredientes.map((ing, index) => (
          <Card key={index} className="flex flex-col gap-2">
            <ProductPicker
              productoId={ing.productoId}
              linkedName={ing.linkedName}
              onLink={(productoId, canonicalName) =>
                updateIngrediente(index, {
                  productoId,
                  linkedName: canonicalName,
                  nombreMostrado: ing.nombreMostrado || canonicalName,
                })
              }
              onUnlink={() => updateIngrediente(index, { productoId: null, linkedName: null })}
            />
            {!ing.productoId && (
              <p className="text-[15px] text-[var(--color-warning)]">
                Sin producto normalizado — la receta se guardará igual, pero no se podrá comprobar contra
                la despensa hasta que se vincule.
              </p>
            )}
            <input
              value={ing.nombreMostrado}
              onChange={(e) => updateIngrediente(index, { nombreMostrado: e.target.value })}
              placeholder="Nombre a mostrar (ej. Tomate maduro)"
              required
              className="ui-field__input font-medium"
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min={0}
                value={ing.cantidad ?? ""}
                onChange={(e) =>
                  updateIngrediente(index, { cantidad: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="Cantidad"
                className="ui-field__input flex-1"
              />
              <input
                value={ing.unidad ?? ""}
                onChange={(e) => updateIngrediente(index, { unidad: e.target.value || null })}
                placeholder="Unidad (ud., gr., ml., cucharada, al gusto...)"
                className="ui-field__input flex-1"
              />
            </div>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={ing.opcional}
                  onChange={(e) => updateIngrediente(index, { opcional: e.target.checked })}
                  className="w-5 h-5 accent-[var(--color-primary)]"
                />
                Opcional
              </label>
              <label className="flex items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={ing.controlStock}
                  onChange={(e) => updateIngrediente(index, { controlStock: e.target.checked })}
                  className="w-5 h-5 accent-[var(--color-primary)]"
                />
                Controlar cantidad
              </label>
            </div>
            <div className="flex justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => moveIngrediente(index, -1)}
                  disabled={index === 0}
                  className="ui-button ui-button--secondary disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveIngrediente(index, 1)}
                  disabled={index === ingredientes.length - 1}
                  className="ui-button ui-button--secondary disabled:opacity-40"
                >
                  ↓
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeIngrediente(index)}
                className="text-[15px] text-[var(--color-danger-text)] font-medium"
              >
                Eliminar
              </button>
            </div>
          </Card>
        ))}
        <button
          type="button"
          onClick={() => setIngredientes((prev) => [...prev, emptyIngredient()])}
          className="w-full rounded-xl border border-dashed border-[var(--color-border)] py-3 text-[15px] font-medium text-[var(--color-primary-text)]"
        >
          + Añadir ingrediente
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Pasos de preparación</h2>
        {pasos.map((paso, index) => (
          <Card key={index} className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <span className="text-[15px] font-semibold text-[var(--color-muted)] pt-2">{index + 1}.</span>
              <textarea
                value={paso.texto}
                onChange={(e) => updatePaso(index, e.target.value)}
                placeholder="Describe este paso"
                required
                className="ui-field__input ui-field__textarea flex-1"
              />
            </div>
            <div className="flex justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => movePaso(index, -1)}
                  disabled={index === 0}
                  className="ui-button ui-button--secondary disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => movePaso(index, 1)}
                  disabled={index === pasos.length - 1}
                  className="ui-button ui-button--secondary disabled:opacity-40"
                >
                  ↓
                </button>
              </div>
              <button
                type="button"
                onClick={() => removePaso(index)}
                className="text-[15px] text-[var(--color-danger-text)] font-medium"
              >
                Eliminar
              </button>
            </div>
          </Card>
        ))}
        <button
          type="button"
          onClick={() => setPasos((prev) => [...prev, { texto: "" }])}
          className="w-full rounded-xl border border-dashed border-[var(--color-border)] py-3 text-[15px] font-medium text-[var(--color-primary-text)]"
        >
          + Añadir paso
        </button>
      </div>

      <input
        type="hidden"
        name="receta_json"
        value={JSON.stringify({
          titulo,
          descripcion,
          raciones,
          tiempoPreparacionMin,
          tiempoCoccionMin,
          visibilidad,
          estado,
          ingredientes,
          pasos,
        })}
      />

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
        {pending ? "Guardando..." : submitLabel}
      </button>
    </form>
  );
}
