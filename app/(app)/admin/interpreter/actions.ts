"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canModerateInterpreter } from "@/lib/roles";

export type ProposalActionState = { error?: string; success?: string } | null;

function revalidateInterpreterPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/interpreter");
  revalidatePath("/admin/interpreter/pending");
  revalidatePath("/admin/interpreter/conflicts");
}

/**
 * Aprueba una propuesta tal cual, o editada si se incluyen los campos de
 * edición en el formulario (ver ProposalCard). También resuelve conflictos:
 * cualquier otra propuesta de la misma clave (retailer + raw_name
 * normalizado) queda rechazada como duplicada por la propia RPC.
 */
export async function approveProposalAction(
  _prevState: ProposalActionState,
  formData: FormData
): Promise<ProposalActionState> {
  if (!(await canModerateInterpreter())) {
    return { error: "No autorizado." };
  }

  const proposalId = String(formData.get("proposal_id") ?? "");
  if (!proposalId) {
    return { error: "Propuesta no válida." };
  }

  const canonicalName = String(formData.get("canonical_name") ?? "").trim() || null;
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = quantityRaw ? Number(quantityRaw) : null;
  const unit = String(formData.get("unit") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_interpreter_proposal", {
    p_proposal_id: proposalId,
    p_override_canonical_name: canonicalName,
    p_override_brand: brand,
    p_override_category: category,
    p_override_quantity: quantity,
    p_override_unit: unit,
  });

  if (error) {
    return { error: error.message };
  }

  revalidateInterpreterPaths();
  return { success: "Propuesta aprobada." };
}

export async function rejectProposalAction(
  _prevState: ProposalActionState,
  formData: FormData
): Promise<ProposalActionState> {
  if (!(await canModerateInterpreter())) {
    return { error: "No autorizado." };
  }

  const proposalId = String(formData.get("proposal_id") ?? "");
  if (!proposalId) {
    return { error: "Propuesta no válida." };
  }

  const rejectionReason = String(formData.get("rejection_reason") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_interpreter_proposal", {
    p_proposal_id: proposalId,
    p_rejection_reason: rejectionReason,
  });

  if (error) {
    return { error: error.message };
  }

  revalidateInterpreterPaths();
  return { success: "Propuesta rechazada." };
}

export type AliasActionState = { error?: string; success?: string } | null;

export async function updateAliasAction(
  _prevState: AliasActionState,
  formData: FormData
): Promise<AliasActionState> {
  if (!(await canModerateInterpreter())) {
    return { error: "No autorizado." };
  }

  const aliasId = String(formData.get("alias_id") ?? "");
  if (!aliasId) {
    return { error: "Alias no válido." };
  }

  const active = formData.get("active") === "on";

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_product_alias", {
    p_id: aliasId,
    p_active: active,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/interpreter");
  return { success: active ? "Alias activado." : "Alias desactivado." };
}
