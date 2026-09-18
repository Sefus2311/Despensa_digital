"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canModerateInterpreter } from "@/lib/roles";

export type ProductActionState = { error?: string; success?: string } | null;

export async function updateCanonicalProductAction(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  if (!(await canModerateInterpreter())) {
    return { error: "No autorizado." };
  }

  const id = String(formData.get("id") ?? "");
  const canonicalName = String(formData.get("canonical_name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const defaultUnit = String(formData.get("default_unit") ?? "").trim() || null;

  if (!id || !canonicalName) {
    return { error: "Faltan datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_canonical_product", {
    p_id: id,
    p_canonical_name: canonicalName,
    p_category: category,
    p_default_unit: defaultUnit,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/products");
  return { success: "Producto normalizado actualizado." };
}

// Única vía para crear un producto canónico desde cero (antes solo se
// creaban vía approve_interpreter_proposal) -- cierra el aviso de
// "ingrediente de receta sin producto normalizado".
export async function createCanonicalProductAction(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  if (!(await canModerateInterpreter())) {
    return { error: "No autorizado." };
  }

  const canonicalName = String(formData.get("canonical_name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const defaultUnit = String(formData.get("default_unit") ?? "").trim() || null;

  if (!canonicalName) {
    return { error: "Falta el nombre." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_canonical_product_admin", {
    p_canonical_name: canonicalName,
    p_category: category,
    p_default_unit: defaultUnit,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/products");
  return { success: "Producto canónico creado." };
}

export async function updateRetailerProductAction(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  if (!(await canModerateInterpreter())) {
    return { error: "No autorizado." };
  }

  const id = String(formData.get("id") ?? "");
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const commercialName = String(formData.get("commercial_name") ?? "").trim() || null;
  const packageQuantityRaw = String(formData.get("package_quantity") ?? "").trim();
  const packageQuantity = packageQuantityRaw ? Number(packageQuantityRaw) : null;
  const packageUnit = String(formData.get("package_unit") ?? "").trim() || null;

  if (!id) {
    return { error: "Producto no válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_retailer_product", {
    p_id: id,
    p_brand: brand,
    p_commercial_name: commercialName,
    p_package_quantity: packageQuantity,
    p_package_unit: packageUnit,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/products");
  return { success: "Producto de tienda actualizado." };
}
