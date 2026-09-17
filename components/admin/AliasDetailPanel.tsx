"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  deleteAliasAction,
  getAliasDetailAction,
  updateAliasFullAction,
  type AliasActionState,
} from "@/app/(app)/admin/interpreter/actions";
import type { AliasDetailData } from "@/lib/interpreter/types";
import type { InterpreterHistoryEntry } from "@/lib/types/database";

type PanelMode = "view" | "edit" | "delete";

const CHANGE_LABELS: Record<InterpreterHistoryEntry["change_type"], string> = {
  create: "Alta",
  update: "Edición",
  delete: "Eliminado",
  restore: "Restaurado",
};

const ENTRY_TYPE_LABELS: Record<InterpreterHistoryEntry["entry_type"], string> = {
  product_alias: "Alias",
  retailer_product: "Producto de tienda",
  canonical_product: "Producto normalizado",
};

const HISTORY_DIFF_IGNORE = new Set([
  "id",
  "created_at",
  "updated_at",
  "updated_by",
  "normalized_name",
  "normalized_raw_name",
  "normalized_commercial_name",
]);

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function diffHistoryEntry(entry: InterpreterHistoryEntry): string[] {
  if (!entry.previous_data || !entry.new_data) return [];
  const keys = new Set([...Object.keys(entry.previous_data), ...Object.keys(entry.new_data)]);
  const diffs: string[] = [];
  for (const key of keys) {
    if (HISTORY_DIFF_IGNORE.has(key)) continue;
    const before = entry.previous_data[key];
    const after = entry.new_data[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diffs.push(`${key}: ${formatValue(before)} → ${formatValue(after)}`);
    }
  }
  return diffs;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value || "—"}</dd>
    </div>
  );
}

export function AliasDetailPanel({
  aliasId,
  initialMode,
  onClose,
}: {
  aliasId: string;
  initialMode: PanelMode;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<PanelMode>(initialMode);
  const [detail, setDetail] = useState<AliasDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Carga inicial al montar: sólo actualiza estado dentro del callback de la
  // promesa (nunca de forma síncrona en el cuerpo del efecto).
  useEffect(() => {
    let cancelled = false;
    getAliasDetailAction(aliasId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
      } else {
        setDetail(result.data);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [aliasId]);

  // Recarga explícita tras guardar/restaurar, disparada desde un manejador de
  // evento (no desde un efecto), así que sí puede resetear el estado antes
  // de esperar la respuesta.
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getAliasDetailAction(aliasId);
    if (!result.ok) {
      setLoadError(result.error);
    } else {
      setDetail(result.data);
    }
    setLoading(false);
  }, [aliasId]);

  const title = mode === "view" ? "Detalle del registro" : mode === "edit" ? "Editar registro" : "Eliminar registro";

  return (
    <Modal open onClose={onClose} title={title}>
      {loading && <p className="text-sm text-neutral-500">Cargando…</p>}
      {loadError && (
        <p role="alert" className="ui-field__error">
          {loadError}
        </p>
      )}
      {!loading && !loadError && detail && (
        <>
          {mode === "view" && (
            <AliasViewSection
              detail={detail}
              onEdit={() => setMode("edit")}
              onDelete={() => setMode("delete")}
            />
          )}
          {mode === "edit" && (
            <AliasEditForm
              detail={detail}
              onSaved={async () => {
                await reload();
                setMode("view");
              }}
              onCancel={() => setMode("view")}
            />
          )}
          {mode === "delete" && (
            <AliasDeleteConfirm detail={detail} onDeleted={onClose} onCancel={() => setMode("view")} />
          )}
        </>
      )}
    </Modal>
  );
}

function AliasViewSection({
  detail,
  onEdit,
  onDelete,
}: {
  detail: AliasDetailData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { alias, retailer_product: rp, canonical_product: cp, history } = detail;
  const confidencePct = alias.confidence_score != null ? Math.round(alias.confidence_score * 100) : null;
  const quantityLabel =
    rp.package_quantity != null ? `${rp.package_quantity} ${rp.package_unit ?? ""}`.trim() : null;
  const estado = alias.deleted_at ? "Eliminado" : alias.active ? "Activo" : "Inactivo";

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        <Field label="Texto original del ticket" value={alias.raw_name} mono />
        <Field label="Texto normalizado" value={alias.normalized_raw_name} mono />
        <Field label="Producto normalizado" value={cp.canonical_name} />
        <Field label="Marca" value={rp.brand} />
        <Field label="Variante / nombre comercial" value={rp.commercial_name} />
        <Field label="Cantidad" value={quantityLabel} />
        <Field label="Unidad por defecto del producto" value={cp.default_unit} />
        <Field label="Supermercado" value={alias.retailer} />
        <Field label="Categoría" value={cp.category} />
        <Field label="Confianza" value={confidencePct != null ? `${confidencePct}%` : null} />
        <Field label="Veces vista / confirmada" value={`${alias.times_seen} / ${alias.times_confirmed}`} />
        <Field label="Estado" value={estado} />
        <Field label="Creado" value={formatDateTime(alias.created_at)} />
        <Field
          label="Última actualización"
          value={
            alias.updated_by_email
              ? `${formatDateTime(alias.updated_at)} · ${alias.updated_by_email}`
              : formatDateTime(alias.updated_at)
          }
        />
      </dl>

      {!alias.deleted_at && (
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className="ui-button ui-button--secondary">
            Editar
          </button>
          <button type="button" onClick={onDelete} className="ui-button ui-button--destructive">
            Eliminar
          </button>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-2">Historial</h3>
        {history.length === 0 && <p className="text-sm text-neutral-500">Sin cambios registrados.</p>}
        <ul className="flex flex-col gap-2">
          {history.map((h) => {
            const diffs = diffHistoryEntry(h);
            return (
              <li key={h.id} className="text-xs text-neutral-600 border-l-2 border-[var(--color-border)] pl-2">
                <p>
                  <span className="font-medium">{CHANGE_LABELS[h.change_type]}</span>
                  {" · "}
                  {ENTRY_TYPE_LABELS[h.entry_type]}
                  {" · "}
                  {formatDateTime(h.changed_at)}
                  {h.changed_by_email ? ` · ${h.changed_by_email}` : ""}
                </p>
                {diffs.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {diffs.map((d) => (
                      <li key={d} className="font-mono">
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function AliasEditForm({
  detail,
  onSaved,
  onCancel,
}: {
  detail: AliasDetailData;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState<AliasActionState, FormData>(
    updateAliasFullAction,
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) {
      onSaved();
    }
    wasPending.current = pending;
  }, [pending, state, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="alias_id" value={detail.alias.id} />
      <p className="ui-field__help">
        El producto normalizado, la marca, la categoría, la cantidad y la unidad son datos compartidos por
        cualquier otro alias que apunte al mismo producto: el cambio se aplicará a todos ellos.
      </p>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="canonical_name">
          Producto normalizado <span className="ui-field__required">*</span>
        </label>
        <input
          id="canonical_name"
          name="canonical_name"
          required
          defaultValue={detail.canonical_product.canonical_name}
          className="ui-field__input"
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="category">
          Categoría
        </label>
        <input
          id="category"
          name="category"
          defaultValue={detail.canonical_product.category ?? ""}
          className="ui-field__input"
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="default_unit">
          Unidad por defecto del producto
        </label>
        <input
          id="default_unit"
          name="default_unit"
          defaultValue={detail.canonical_product.default_unit ?? ""}
          className="ui-field__input"
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="brand">
          Marca
        </label>
        <input
          id="brand"
          name="brand"
          defaultValue={detail.retailer_product.brand ?? ""}
          className="ui-field__input"
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="commercial_name">
          Variante / nombre comercial
        </label>
        <input
          id="commercial_name"
          name="commercial_name"
          defaultValue={detail.retailer_product.commercial_name}
          className="ui-field__input"
        />
      </div>
      <div className="flex gap-2">
        <div className="ui-field flex-1">
          <label className="ui-field__label" htmlFor="package_quantity">
            Cantidad
          </label>
          <input
            id="package_quantity"
            name="package_quantity"
            type="number"
            step="0.001"
            min="0"
            defaultValue={detail.retailer_product.package_quantity ?? ""}
            className="ui-field__input"
          />
        </div>
        <div className="ui-field flex-1">
          <label className="ui-field__label" htmlFor="package_unit">
            Unidad
          </label>
          <input
            id="package_unit"
            name="package_unit"
            defaultValue={detail.retailer_product.package_unit ?? ""}
            className="ui-field__input"
          />
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="ui-field__error">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="ui-button ui-button--primary flex-1">
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <button type="button" onClick={onCancel} className="ui-button ui-button--secondary">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AliasDeleteConfirm({
  detail,
  onDeleted,
  onCancel,
}: {
  detail: AliasDetailData;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState<AliasActionState, FormData>(deleteAliasAction, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) {
      onDeleted();
    }
    wasPending.current = pending;
  }, [pending, state, onDeleted]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="alias_id" value={detail.alias.id} />
      <p className="text-sm">
        ¿Seguro que quieres eliminar este registro del Intérprete? Dejará de usarse para interpretar
        tickets nuevos, pero se conserva en la base de datos y puede restaurarse.
      </p>
      <p className="text-sm font-medium">
        {detail.alias.raw_name} → {detail.canonical_product.canonical_name}
      </p>
      {state?.error && (
        <p role="alert" className="ui-field__error">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="ui-button ui-button--destructive flex-1">
          {pending ? "Eliminando…" : "Eliminar"}
        </button>
        <button type="button" onClick={onCancel} className="ui-button ui-button--secondary">
          Cancelar
        </button>
      </div>
    </form>
  );
}
