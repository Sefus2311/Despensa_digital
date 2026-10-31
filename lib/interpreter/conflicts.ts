import type { ProductCategory } from "@/lib/constants/product-categories";
import type { InterpreterProposal } from "@/lib/types/database";

// Comparación de /admin/interpreter/conflicts. Los criterios replican los de
// submit_interpreter_proposal (0013): así lo que se resalta es exactamente lo
// que provocó el conflicto, no cualquier diferencia de formato.

/** Con qué se compara una propuesta: lo aprobado o, si no hay, otra propuesta. */
export interface ConflictReference {
  kind: "approved" | "proposal";
  name: string;
  category: ProductCategory | null;
  brand: string | null;
  /** Solo informativo: envase ≠ cantidad de la línea del ticket, no se comparan. */
  packageQuantity: number | null;
  packageUnit: string | null;
  timesConfirmed: number | null;
}

export interface DiffSegment {
  text: string;
  changed: boolean;
}

export interface ConflictField {
  key: "name" | "category" | "brand";
  label: string;
  differs: boolean;
  reference: DiffSegment[];
  proposed: DiffSegment[];
}

// Equivalente en TS de normalize_product_text (0006): sin mayúsculas, acentos
// ni espacios repetidos.
function normalizeForComparison(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mergeSegments(words: { text: string; changed: boolean }[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const word of words) {
    const last = merged[merged.length - 1];
    if (last && last.changed === word.changed) {
      last.text += ` ${word.text}`;
    } else {
      merged.push({ ...word });
    }
  }
  return merged;
}

/** Diff por palabras (subsecuencia común más larga), ignorando mayúsculas y acentos. */
export function diffWords(a: string, b: string): { a: DiffSegment[]; b: DiffSegment[] } {
  const wordsA = a.trim().split(/\s+/).filter(Boolean);
  const wordsB = b.trim().split(/\s+/).filter(Boolean);
  const keysA = wordsA.map(normalizeForComparison);
  const keysB = wordsB.map(normalizeForComparison);

  const lcs: number[][] = Array.from({ length: wordsA.length + 1 }, () =>
    new Array<number>(wordsB.length + 1).fill(0)
  );
  for (let i = wordsA.length - 1; i >= 0; i--) {
    for (let j = wordsB.length - 1; j >= 0; j--) {
      lcs[i][j] =
        keysA[i] === keysB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const outA: DiffSegment[] = [];
  const outB: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < wordsA.length || j < wordsB.length) {
    if (i < wordsA.length && j < wordsB.length && keysA[i] === keysB[j]) {
      outA.push({ text: wordsA[i++], changed: false });
      outB.push({ text: wordsB[j++], changed: false });
    } else if (j >= wordsB.length || (i < wordsA.length && lcs[i + 1][j] >= lcs[i][j + 1])) {
      outA.push({ text: wordsA[i++], changed: true });
    } else {
      outB.push({ text: wordsB[j++], changed: true });
    }
  }

  return { a: mergeSegments(outA), b: mergeSegments(outB) };
}

function buildField(
  key: ConflictField["key"],
  label: string,
  reference: string | null,
  proposed: string | null
): ConflictField {
  const referenceText = reference?.trim() ?? "";
  const proposedText = proposed?.trim() ?? "";
  // Una propuesta sin categoría o sin marca no contradice nada: el SQL solo
  // compara esos campos cuando la propuesta los trae.
  const differs =
    proposedText !== "" && normalizeForComparison(referenceText) !== normalizeForComparison(proposedText);

  if (!differs) {
    return {
      key,
      label,
      differs,
      reference: referenceText ? [{ text: referenceText, changed: false }] : [],
      proposed: proposedText ? [{ text: proposedText, changed: false }] : [],
    };
  }

  const diff = diffWords(referenceText, proposedText);
  return { key, label, differs, reference: diff.a, proposed: diff.b };
}

/** Nombre, categoría y marca de la propuesta frente a su referencia. */
export function compareWithReference(
  reference: ConflictReference,
  proposal: Pick<InterpreterProposal, "proposed_canonical_name" | "proposed_category" | "proposed_brand">
): ConflictField[] {
  return [
    buildField("name", "Producto", reference.name, proposal.proposed_canonical_name),
    buildField("category", "Categoría", reference.category, proposal.proposed_category),
    buildField("brand", "Marca", reference.brand, proposal.proposed_brand),
  ];
}

/**
 * Referencia de cada propuesta de un grupo: lo aprobado si existe; si no, la
 * primera otra candidata del grupo. Null si no queda con qué comparar (p. ej.
 * se aprobó y luego se desactivó el alias, o se rechazó la otra candidata).
 */
export function pickConflictReference(
  proposal: InterpreterProposal,
  group: InterpreterProposal[],
  approved: ConflictReference | null
): ConflictReference | null {
  if (approved) return approved;
  const other = group.find((p) => p.id !== proposal.id);
  if (!other) return null;
  return {
    kind: "proposal",
    name: other.proposed_canonical_name,
    category: other.proposed_category,
    brand: other.proposed_brand,
    packageQuantity: null,
    packageUnit: null,
    timesConfirmed: null,
  };
}
