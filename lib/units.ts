// Única capa de normalización de unidades. Las unidades estándar de compra de
// MD son exactamente tres -- "ud.", "gr." y "ml." -- y son las únicas que
// pasan a la lista de la compra. Las recetas pueden seguir usando unidades
// culinarias libres (cucharada, pellizco, al gusto...): esas se conservan tal
// cual, solo se normalizan las variantes de las tres estándar.
// Equivalente en SQL (backfill): supabase/migrations/0018_units_and_shopping_list.sql.

export const STANDARD_UNITS = ["ud.", "gr.", "ml."] as const;
export type StandardUnit = (typeof STANDARD_UNITS)[number];

// Sinónimos ya en minúsculas y sin punto final; la comparación es
// case-insensitive.
const UNIT_SYNONYMS: Record<string, StandardUnit> = {
  ud: "ud.",
  uds: "ud.",
  unidad: "ud.",
  unidades: "ud.",
  g: "gr.",
  gr: "gr.",
  grs: "gr.",
  gramo: "gr.",
  gramos: "gr.",
  ml: "ml.",
  mililitro: "ml.",
  mililitros: "ml.",
};

function unitKey(raw: string): string {
  return raw.trim().replace(/\.+$/, "").trim().toLowerCase();
}

/** "G" / "gramos" -> "gr."; cualquier unidad que no sea de las tres estándar -> null. */
export function normalizeStandardUnit(raw: string | null | undefined): StandardUnit | null {
  if (raw == null) return null;
  return UNIT_SYNONYMS[unitKey(raw)] ?? null;
}

/**
 * Forma final de una unidad, para guardar y para mostrar: las variantes de
 * ud./gr./ml. se convierten a la forma estándar; el resto (culinarias) se
 * devuelve recortada y sin tocar; vacío/ausente -> null.
 */
export function canonicalizeUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return normalizeStandardUnit(trimmed) ?? trimmed;
}

// Unidades mayores convertibles a la estándar (solo factor ×1000, sin
// ambigüedad): kg -> gr., l -> ml. Se aplican al preparar la lista de la
// compra y al comparar con la despensa; no se guardan así en la receta.
const BASE_CONVERSIONS: Record<string, { unit: StandardUnit; factor: number }> = {
  kg: { unit: "gr.", factor: 1000 },
  kgs: { unit: "gr.", factor: 1000 },
  kilo: { unit: "gr.", factor: 1000 },
  kilos: { unit: "gr.", factor: 1000 },
  kilogramo: { unit: "gr.", factor: 1000 },
  kilogramos: { unit: "gr.", factor: 1000 },
  l: { unit: "ml.", factor: 1000 },
  lt: { unit: "ml.", factor: 1000 },
  litro: { unit: "ml.", factor: 1000 },
  litros: { unit: "ml.", factor: 1000 },
};

/**
 * Lleva kg -> gr. y l -> ml. (multiplicando la cantidad ×1000); el resto de
 * unidades solo se canonicalizan. Devuelve la cantidad y unidad resultantes.
 */
export function toBaseUnit(
  cantidad: number | null,
  unidad: string | null | undefined
): { cantidad: number | null; unidad: string | null } {
  const conversion = unidad == null ? undefined : BASE_CONVERSIONS[unitKey(unidad)];
  if (!conversion) return { cantidad, unidad: canonicalizeUnit(unidad) };
  return {
    cantidad: cantidad == null ? null : Math.round(cantidad * conversion.factor * 1000) / 1000,
    unidad: conversion.unit,
  };
}

/** ¿Es una unidad de compra (ud./gr./ml.)? Es lo que decide si va a la lista de la compra. */
export function isPurchasableUnit(raw: string | null | undefined): boolean {
  return normalizeStandardUnit(raw) !== null;
}

/** Igualdad de unidades tolerante a variantes ("g" = "gr." = "GRAMOS"; "vaso" = "Vaso"). */
export function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalizeUnit(a);
  const cb = canonicalizeUnit(b);
  return ca !== null && cb !== null && ca.toLowerCase() === cb.toLowerCase();
}
