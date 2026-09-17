// Validación pura (sin Supabase) del formulario de edición combinada de un
// alias del Intérprete -- separada de la Server Action para poder testearla
// sin base de datos (ver validation.test.ts).

export interface AliasEditInput {
  canonicalName: string;
  category: string | null;
  defaultUnit: string | null;
  brand: string | null;
  commercialName: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
}

export type AliasEditParseResult =
  | { ok: true; data: AliasEditInput }
  | { ok: false; error: string };

function trimmedOrNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function parseAliasEditInput(formData: FormData): AliasEditParseResult {
  const canonicalName = String(formData.get("canonical_name") ?? "").trim();
  if (!canonicalName) {
    return { ok: false, error: "El nombre del producto no puede estar vacío." };
  }

  const packageQuantityRaw = String(formData.get("package_quantity") ?? "").trim();
  let packageQuantity: number | null = null;
  if (packageQuantityRaw) {
    packageQuantity = Number(packageQuantityRaw);
    if (!Number.isFinite(packageQuantity) || packageQuantity < 0) {
      return { ok: false, error: "La cantidad debe ser un número válido." };
    }
  }

  return {
    ok: true,
    data: {
      canonicalName,
      category: trimmedOrNull(formData.get("category")),
      defaultUnit: trimmedOrNull(formData.get("default_unit")),
      brand: trimmedOrNull(formData.get("brand")),
      commercialName: trimmedOrNull(formData.get("commercial_name")),
      packageQuantity,
      packageUnit: trimmedOrNull(formData.get("package_unit")),
    },
  };
}
