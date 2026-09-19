import { describe, expect, it } from "vitest";
import { canonicalizeUnit, isPurchasableUnit, normalizeStandardUnit, sameUnit, toBaseUnit } from "./units";

describe("normalización de unidades", () => {
  it("G / g / gr / gramos -> gr.", () => {
    for (const raw of ["G", "g", "gr", "GR", "gr.", "gramo", "gramos", " Gramos "]) {
      expect(canonicalizeUnit(raw)).toBe("gr.");
    }
  });

  it("UD / unidad / unidades -> ud.", () => {
    for (const raw of ["UD", "ud", "ud.", "uds", "unidad", "Unidades"]) {
      expect(canonicalizeUnit(raw)).toBe("ud.");
    }
  });

  it("ML / mililitros -> ml.", () => {
    for (const raw of ["ML", "ml", "ml.", "mililitro", "mililitros"]) {
      expect(canonicalizeUnit(raw)).toBe("ml.");
    }
  });

  it("las unidades culinarias se conservan tal cual", () => {
    expect(canonicalizeUnit("cucharadas")).toBe("cucharadas");
    expect(canonicalizeUnit(" al gusto ")).toBe("al gusto");
    expect(normalizeStandardUnit("cucharada")).toBeNull();
  });

  it("vacío o ausente -> null", () => {
    expect(canonicalizeUnit("")).toBeNull();
    expect(canonicalizeUnit("  ")).toBeNull();
    expect(canonicalizeUnit(null)).toBeNull();
  });
});

describe("isPurchasableUnit", () => {
  it("solo ud., gr. y ml. (cualquier variante)", () => {
    expect(isPurchasableUnit("ud.")).toBe(true);
    expect(isPurchasableUnit("g")).toBe(true);
    expect(isPurchasableUnit("Mililitros")).toBe(true);
    expect(isPurchasableUnit("kg")).toBe(false);
    expect(isPurchasableUnit("cucharada")).toBe(false);
    expect(isPurchasableUnit(null)).toBe(false);
  });
});

describe("sameUnit", () => {
  it("tolera variantes de la misma unidad", () => {
    expect(sameUnit("g", "GR.")).toBe(true);
    expect(sameUnit("Vaso", "vaso")).toBe(true);
    expect(sameUnit("ml", "l")).toBe(false);
    expect(sameUnit(null, "g")).toBe(false);
  });
});

describe("toBaseUnit (kg -> gr., l -> ml.)", () => {
  it("1.5 kg -> 1500 gr.", () => {
    expect(toBaseUnit(1.5, "kg")).toEqual({ cantidad: 1500, unidad: "gr." });
    expect(toBaseUnit(2, "Kilos")).toEqual({ cantidad: 2000, unidad: "gr." });
  });

  it("0.25 l -> 250 ml.", () => {
    expect(toBaseUnit(0.25, "l")).toEqual({ cantidad: 250, unidad: "ml." });
    expect(toBaseUnit(1, "litros")).toEqual({ cantidad: 1000, unidad: "ml." });
  });

  it("sin cantidad conserva null; la unidad se convierte igualmente", () => {
    expect(toBaseUnit(null, "kg")).toEqual({ cantidad: null, unidad: "gr." });
  });

  it("las demás unidades solo se canonicalizan, sin tocar la cantidad", () => {
    expect(toBaseUnit(350, "g")).toEqual({ cantidad: 350, unidad: "gr." });
    expect(toBaseUnit(10, "cucharadas")).toEqual({ cantidad: 10, unidad: "cucharadas" });
    expect(toBaseUnit(1, null)).toEqual({ cantidad: 1, unidad: null });
  });

  it("idempotente: convertir dos veces no vuelve a multiplicar", () => {
    const once = toBaseUnit(1.5, "kg");
    expect(toBaseUnit(once.cantidad, once.unidad)).toEqual(once);
  });
});
