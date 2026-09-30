"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Card } from "@/components/Card";
import { Modal } from "@/components/ui/Modal";
import { PRODUCT_CATEGORIES } from "@/lib/constants/product-categories";
import {
  collectMergeCandidates,
  describeMerge,
  nextSortDirection,
  parseDictionarySearchParams,
  type DictionaryEstadoFilter,
  type DictionarySortDir,
  type DictionarySortField,
} from "@/lib/interpreter/dictionary";
import type { DictionaryEntry, DictionarySummary } from "@/lib/types/database";
import {
  editBrand,
  editCanonicalName,
  editCategory,
  editRetailer,
  exportDictionaryCsv,
  fetchDictionaryPage,
  mergeDictionaryEntries,
  type DictionaryPageData,
} from "@/app/(app)/admin/dictionary/actions";
import { EditableCell } from "./EditableCell";

const SORT_COLUMNS: { field: DictionarySortField; label: string }[] = [
  { field: "raw_name", label: "Texto detectado" },
  { field: "canonical_name", label: "Nombre normalizado" },
  { field: "retailer", label: "Supermercado" },
  { field: "category", label: "Categoría" },
  { field: "brand", label: "Marca" },
  { field: "times_confirmed", label: "Usos" },
];

const ESTADO_TABS: { value: DictionaryEstadoFilter; label: string }[] = [
  { value: "todos", label: "TODOS" },
  { value: "revisar", label: "REVISAR" },
  { value: "duplicados", label: "POSIBLES DUPLICADOS" },
];

function downloadCsv(csv: string, filename: string) {
  // BOM (﻿) para que Excel detecte UTF-8 y no destroce las tildes.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DictionaryEditor({
  initialData,
  retailers,
  initialParams,
}: {
  initialData: DictionaryPageData;
  /** Supermercados existentes (list_supermarkets, ya deduplicados/en mayúsculas) para el selector de la celda. */
  retailers: string[];
  initialParams: Record<string, string | undefined>;
}) {
  const initial = useMemo(() => parseDictionarySearchParams(initialParams), [initialParams]);

  const [rows, setRows] = useState<DictionaryEntry[]>(initialData.rows);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [summary, setSummary] = useState<DictionarySummary | null>(initialData.summary);
  const [loadError, setLoadError] = useState<string | null>(initialData.error ?? null);

  const [search, setSearch] = useState(initial.search);
  const [retailerFilter, setRetailerFilter] = useState(initial.retailer);
  const [categoryFilter, setCategoryFilter] = useState(initial.category);
  const [estado, setEstado] = useState<DictionaryEstadoFilter>(initial.estado);
  const [sort, setSort] = useState<DictionarySortField>(initial.sort);
  const [sortDir, setSortDir] = useState<DictionarySortDir>(initial.sortDir);
  const [page, setPage] = useState(initial.page);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeFinalName, setMergeFinalName] = useState("");
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isFirstRender = useRef(true);

  function currentParams(overrides: Partial<Record<string, string>> = {}) {
    return {
      q: search,
      retailer: retailerFilter,
      category: categoryFilter,
      estado,
      sort,
      dir: sortDir,
      page: String(page),
      ...overrides,
    };
  }

  function reload(overrides: Partial<Record<string, string>> = {}) {
    startTransition(async () => {
      const data = await fetchDictionaryPage(currentParams(overrides));
      setRows(data.rows);
      setHasMore(data.hasMore);
      setSummary(data.summary);
      setLoadError(data.error ?? null);
      setSelected(new Set());
    });
  }

  // Búsqueda instantánea (con un pequeño debounce para no lanzar una consulta
  // por cada pulsación) -- cualquier otro cambio (filtro/orden/página)
  // recarga al instante, sin esperar.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => reload({ q: search, page: "1" }), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function updateFilter(patch: Partial<{ retailer: string; category: string; estado: DictionaryEstadoFilter }>) {
    if (patch.retailer !== undefined) setRetailerFilter(patch.retailer);
    if (patch.category !== undefined) setCategoryFilter(patch.category);
    if (patch.estado !== undefined) setEstado(patch.estado);
    setPage(1);
    reload({ ...patch, page: "1" });
  }

  function handleSort(field: DictionarySortField) {
    const dir = nextSortDirection(sort, sortDir, field);
    setSort(field);
    setSortDir(dir);
    setPage(1);
    reload({ sort: field, dir, page: "1" });
  }

  function goToPage(next: number) {
    setPage(next);
    reload({ page: String(next) });
  }

  function toggleRow(aliasId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(aliasId)) next.delete(aliasId);
      else next.add(aliasId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.alias_id))));
  }

  const selectedRows = rows.filter((r) => selected.has(r.alias_id));
  const mergeCandidates = useMemo(() => collectMergeCandidates(selectedRows), [selectedRows]);

  function openMergeDialog() {
    setMergeError(null);
    setMergeSuccess(null);
    setMergeTargetId(mergeCandidates[0]?.canonicalProductId ?? null);
    setMergeFinalName(mergeCandidates[0]?.canonicalName ?? "");
    setMergeOpen(true);
  }

  function confirmMerge() {
    if (!mergeTargetId) return;
    setMergeError(null);
    startTransition(async () => {
      const result = await mergeDictionaryEntries(selectedRows, mergeTargetId, mergeFinalName);
      if (result.error) {
        setMergeError(result.error);
        return;
      }
      setMergeSuccess(result.success ?? null);
      setMergeOpen(false);
      reload();
    });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportDictionaryCsv(currentParams());
      if ("error" in result) {
        setLoadError(result.error);
        return;
      }
      downloadCsv(result.csv, "diccionario-mayordomo-digital.csv");
    } finally {
      setExporting(false);
    }
  }

  function replaceRow(updated: DictionaryEntry) {
    setRows((prev) => prev.map((r) => (r.alias_id === updated.alias_id ? updated : r)));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-1">
        <p className="font-semibold font-display uppercase">Diccionario</p>
        {summary && (
          <p className="text-[15px] text-[var(--color-muted)]">
            {summary.total} entrada{summary.total === 1 ? "" : "s"} · {summary.duplicados} posible
            {summary.duplicados === 1 ? "" : "s"} duplicado{summary.duplicados === 1 ? "" : "s"} ·{" "}
            {summary.revisar} valor{summary.revisar === 1 ? "" : "es"} a revisar
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por texto, producto, supermercado o marca..."
          className="ui-field__input"
          aria-label="Buscar en el diccionario"
        />

        <div className="flex flex-wrap gap-2">
          {ESTADO_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => updateFilter({ estado: tab.value })}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap ${
                estado === tab.value
                  ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] text-[var(--color-muted)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={retailerFilter}
            onChange={(e) => updateFilter({ retailer: e.target.value })}
            className="ui-field__input flex-1 min-w-[160px]"
            aria-label="Filtrar por supermercado"
          >
            <option value="">TODOS LOS SUPERMERCADOS</option>
            {retailers.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => updateFilter({ category: e.target.value })}
            className="ui-field__input flex-1 min-w-[160px]"
            aria-label="Filtrar por categoría"
          >
            <option value="">TODAS LAS CATEGORÍAS</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 items-center justify-between">
          <button
            type="button"
            onClick={openMergeDialog}
            disabled={mergeCandidates.length < 2}
            className="rounded-xl bg-[var(--color-primary)] text-white py-2 px-4 text-[15px] font-medium disabled:opacity-40"
          >
            Unificar {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-xl border border-[var(--color-border)] py-2 px-4 text-[15px] font-medium disabled:opacity-60"
          >
            {exporting ? "Exportando..." : "Exportar CSV"}
          </button>
        </div>

        {mergeSuccess && <p className="text-[15px] text-[var(--color-success-text)]">{mergeSuccess}</p>}
        {loadError && (
          <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
            {loadError}
          </p>
        )}
      </Card>

      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAllVisible}
                  aria-label="Seleccionar todas las filas visibles"
                  className="w-5 h-5 accent-[var(--color-primary)]"
                />
              </th>
              {SORT_COLUMNS.map((col) => (
                <th key={col.field}>
                  <button
                    type="button"
                    onClick={() => handleSort(col.field)}
                    className="flex items-center gap-1 font-bold"
                  >
                    {col.label}
                    {sort === col.field && <span aria-hidden="true">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !pending && (
              <tr>
                <td colSpan={SORT_COLUMNS.length + 2} className="text-[15px] text-[var(--color-muted)]">
                  Sin resultados.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.alias_id}
                className={[
                  selected.has(row.alias_id)
                    ? "outline outline-2 -outline-offset-2 outline-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                    : row.is_duplicate
                      ? "bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)]"
                      : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(row.alias_id)}
                    onChange={() => toggleRow(row.alias_id)}
                    aria-label={`Seleccionar ${row.raw_name}`}
                    className="w-5 h-5 accent-[var(--color-primary)]"
                  />
                </td>
                <td className="font-mono text-[13px]">{row.raw_name}</td>
                <td>
                  <EditableCell
                    value={row.canonical_name}
                    onSave={async (value) => {
                      const result = await editCanonicalName(row.canonical_product_id, value);
                      if (!result.error) replaceRow({ ...row, canonical_name: value });
                      return result;
                    }}
                  />
                </td>
                <td>
                  <EditableCell
                    value={row.retailer}
                    options={retailers}
                    onSave={async (value) => {
                      const result = await editRetailer(row.alias_id, value);
                      if (!result.error) replaceRow({ ...row, retailer: value.toUpperCase() });
                      return result;
                    }}
                  />
                </td>
                <td>
                  <EditableCell
                    value={row.category}
                    options={[...PRODUCT_CATEGORIES]}
                    onSave={async (value) => {
                      const result = await editCategory(row.canonical_product_id, value);
                      if (!result.error) replaceRow({ ...row, category: value as DictionaryEntry["category"] });
                      return result;
                    }}
                  />
                </td>
                <td>
                  <EditableCell
                    value={row.brand ?? ""}
                    placeholder="Sin marca"
                    onSave={async (value) => {
                      const result = await editBrand(row.retailer_product_id, value);
                      if (!result.error) replaceRow({ ...row, brand: value });
                      return result;
                    }}
                  />
                </td>
                <td className="ui-table__num">{row.times_confirmed}</td>
                <td>
                  {row.estado === "revisar" ? (
                    <span className="text-[13px] font-semibold text-[var(--color-warning)]">REVISAR</span>
                  ) : (
                    <span className="text-[13px] font-semibold text-[var(--color-primary-text)]">OK</span>
                  )}
                  {row.is_duplicate && (
                    <span className="block text-[11px] text-[var(--color-warning)]">Posible duplicado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToPage(Math.max(1, page - 1))}
          disabled={page <= 1 || pending}
          className="rounded-xl border border-[var(--color-border)] py-2 px-4 text-[15px] font-medium disabled:opacity-40"
        >
          ‹ Anterior
        </button>
        <span className="text-[15px] text-[var(--color-muted)]">Página {page}</span>
        <button
          type="button"
          onClick={() => goToPage(page + 1)}
          disabled={!hasMore || pending}
          className="rounded-xl border border-[var(--color-border)] py-2 px-4 text-[15px] font-medium disabled:opacity-40"
        >
          Siguiente ›
        </button>
      </div>

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Unificar productos">
        <div className="flex flex-col gap-3">
          <p className="text-[15px]">¿Cuál debe ser el valor correcto?</p>
          <div className="flex flex-col gap-2">
            {mergeCandidates.map((c) => (
              <label key={c.canonicalProductId} className="flex items-center gap-2 text-[15px]">
                <input
                  type="radio"
                  name="merge-target"
                  checked={mergeTargetId === c.canonicalProductId}
                  onChange={() => {
                    setMergeTargetId(c.canonicalProductId);
                    setMergeFinalName(c.canonicalName);
                  }}
                  className="w-5 h-5 accent-[var(--color-primary)]"
                />
                {c.canonicalName}
              </label>
            ))}
          </div>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="merge-final-name">
              Valor definitivo
            </label>
            <input
              id="merge-final-name"
              value={mergeFinalName}
              onChange={(e) => setMergeFinalName(e.target.value)}
              className="ui-field__input"
            />
          </div>
          {mergeTargetId && (
            <p className="text-[15px] text-[var(--color-muted)]">
              {describeMerge(mergeCandidates, mergeFinalName || "—")}
            </p>
          )}
          {mergeError && (
            <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
              {mergeError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMergeOpen(false)}
              className="flex-1 rounded-xl border border-[var(--color-border)] py-2.5 font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmMerge}
              disabled={pending || !mergeFinalName.trim()}
              className="flex-1 rounded-xl bg-[var(--color-primary)] text-white py-2.5 font-medium disabled:opacity-60"
            >
              {pending ? "Unificando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
