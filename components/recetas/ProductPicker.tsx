"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface SimilarProduct {
  id: string;
  canonical_name: string;
  similarity: number;
}

// Buscador de producto normalizado para un ingrediente de receta. Reutiliza
// find_similar_canonical_products (la misma RPC que ya usa /admin/products
// para detectar duplicados) -- no se crea ningún buscador ni catálogo
// nuevo. "Vincular" solo fija producto_id; nombreMostrado es un campo
// aparte y no se toca al editarlo después, para que "Tomate maduro"
// vinculado a TOMATE (sección 6 del encargo) siga funcionando.
export function ProductPicker({
  productoId,
  linkedName,
  onLink,
  onUnlink,
}: {
  productoId: string | null;
  /** Nombre canónico del producto vinculado, para mostrarlo sin volver a buscar. */
  linkedName: string | null;
  onLink: (productoId: string, canonicalName: string) => void;
  onUnlink: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SimilarProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase.rpc("find_similar_canonical_products", {
        p_name: query.trim(),
        p_limit: 6,
      });
      setResults((data ?? []) as SimilarProduct[]);
      setLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (productoId && linkedName) {
    return (
      <div className="flex items-center justify-between gap-2 text-[15px]">
        <span className="text-[var(--color-text)]">
          Vinculado a: <span className="font-semibold">{linkedName}</span>
        </span>
        <button
          type="button"
          onClick={onUnlink}
          className="text-[var(--color-primary-text)] font-medium shrink-0"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar producto normalizado (ej. tom...)"
        className="ui-field__input"
      />
      {query.trim().length >= 2 && (
        <div className="ui-card ui-card--overlay absolute left-0 right-0 top-full mt-1 z-10 p-1 max-h-56 overflow-y-auto">
          {loading && <p className="text-[15px] text-[var(--color-muted)] px-3 py-2">Buscando…</p>}
          {!loading && results.length === 0 && (
            <p className="text-[15px] text-[var(--color-muted)] px-3 py-2">Sin coincidencias.</p>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onLink(r.id, r.canonical_name);
                  setQuery("");
                  setResults([]);
                }}
                className="w-full text-left px-3 py-2 rounded-md text-[15px] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
              >
                {r.canonical_name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
