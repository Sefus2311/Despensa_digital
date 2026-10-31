import { describe, expect, it } from "vitest";
import type { InterpreterProposal } from "@/lib/types/database";
import {
  compareWithReference,
  diffWords,
  pickConflictReference,
  type ConflictReference,
} from "./conflicts";

const APPROVED: ConflictReference = {
  kind: "approved",
  name: "Croissant de mantequilla (bolsa)",
  category: "ALIMENTACIÓN",
  brand: "Hacendado",
  packageQuantity: 6,
  packageUnit: "ud.",
  timesConfirmed: 3,
};

const PROPOSAL = {
  proposed_canonical_name: "Croissant de mantequilla",
  proposed_category: "ALIMENTACIÓN",
  proposed_brand: null,
} as Pick<InterpreterProposal, "proposed_canonical_name" | "proposed_category" | "proposed_brand">;

function field(key: string, proposal = PROPOSAL, reference = APPROVED) {
  return compareWithReference(reference, proposal).find((f) => f.key === key)!;
}

describe("diffWords", () => {
  it("resalta solo la palabra de más", () => {
    expect(diffWords("Croissant de mantequilla (bolsa)", "Croissant de mantequilla")).toEqual({
      a: [
        { text: "Croissant de mantequilla", changed: false },
        { text: "(bolsa)", changed: true },
      ],
      b: [{ text: "Croissant de mantequilla", changed: false }],
    });
  });

  it("resalta en cada lado la palabra que cambia, en medio del texto", () => {
    expect(diffWords("Yogur griego natural", "Yogur griego azucarado")).toEqual({
      a: [
        { text: "Yogur griego", changed: false },
        { text: "natural", changed: true },
      ],
      b: [
        { text: "Yogur griego", changed: false },
        { text: "azucarado", changed: true },
      ],
    });
  });

  it("textos sin nada en común: todo resaltado", () => {
    expect(diffWords("Leche", "Café")).toEqual({
      a: [{ text: "Leche", changed: true }],
      b: [{ text: "Café", changed: true }],
    });
  });

  it("no resalta mayúsculas ni acentos", () => {
    const diff = diffWords("Café solo", "CAFE solo");
    expect(diff.a).toEqual([{ text: "Café solo", changed: false }]);
    expect(diff.b).toEqual([{ text: "CAFE solo", changed: false }]);
  });

  it("conserva el orden y el texto completo", () => {
    const diff = diffWords("a b c d", "a x c y");
    expect(diff.a.map((s) => s.text).join(" ")).toBe("a b c d");
    expect(diff.b.map((s) => s.text).join(" ")).toBe("a x c y");
  });
});

describe("compareWithReference", () => {
  it("el nombre distinto es la causa del conflicto", () => {
    expect(field("name").differs).toBe(true);
    expect(field("name").reference.find((s) => s.changed)?.text).toBe("(bolsa)");
  });

  it("misma categoría: se muestra sin resaltar", () => {
    const category = field("category");
    expect(category.differs).toBe(false);
    expect(category.reference).toEqual([{ text: "ALIMENTACIÓN", changed: false }]);
  });

  it("propuesta sin marca: no contradice lo aprobado (igual que el SQL)", () => {
    const brand = field("brand");
    expect(brand.differs).toBe(false);
    expect(brand.reference).toEqual([{ text: "Hacendado", changed: false }]);
    expect(brand.proposed).toEqual([]);
  });

  it("propuesta sin categoría: tampoco contradice", () => {
    expect(field("category", { ...PROPOSAL, proposed_category: null }).differs).toBe(false);
  });

  it("marca o categoría distintas sí se resaltan", () => {
    expect(field("brand", { ...PROPOSAL, proposed_brand: "Danone" }).differs).toBe(true);
    expect(field("category", { ...PROPOSAL, proposed_category: "VARIOS" }).differs).toBe(true);
  });

  it("marca propuesta frente a lo aprobado sin marca: difiere", () => {
    const brand = field("brand", { ...PROPOSAL, proposed_brand: "Danone" }, { ...APPROVED, brand: null });
    expect(brand.differs).toBe(true);
    expect(brand.reference).toEqual([]);
    expect(brand.proposed).toEqual([{ text: "Danone", changed: true }]);
  });

  it("solo cambian mayúsculas o acentos: no hay diferencia", () => {
    const name = field("name", { ...PROPOSAL, proposed_canonical_name: "CROISSANT DE MANTEQUILLA (BOLSA)" });
    expect(name.differs).toBe(false);
  });
});

describe("pickConflictReference", () => {
  const candidate = (id: string, name: string) =>
    ({ id, proposed_canonical_name: name, proposed_category: null, proposed_brand: null }) as InterpreterProposal;
  const a = candidate("a", "Yogur griego");
  const b = candidate("b", "Yogur natural");

  it("lo aprobado tiene prioridad sobre las demás candidatas", () => {
    expect(pickConflictReference(a, [a, b], APPROVED)).toBe(APPROVED);
  });

  it("sin nada aprobado, compara con otra candidata del grupo", () => {
    expect(pickConflictReference(a, [a, b], null)).toMatchObject({ kind: "proposal", name: "Yogur natural" });
    expect(pickConflictReference(b, [a, b], null)).toMatchObject({ kind: "proposal", name: "Yogur griego" });
  });

  it("sin aprobado ni otra candidata no hay referencia", () => {
    expect(pickConflictReference(a, [a], null)).toBeNull();
  });
});
