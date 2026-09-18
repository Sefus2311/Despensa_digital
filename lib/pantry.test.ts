import { describe, expect, it } from "vitest";
import { computeStockQuantity, formatCategoryBrandLine } from "./pantry";

describe("computeStockQuantity", () => {
  it("1 pack de 6 unidades = stock 6", () => {
    expect(computeStockQuantity(1, 6)).toBe(6);
  });

  it("2 packs de 4 unidades = stock 8", () => {
    expect(computeStockQuantity(2, 4)).toBe(8);
  });

  it("1 unidad suelta (sin pack) = stock 1", () => {
    expect(computeStockQuantity(1, null)).toBe(1);
  });

  it("no trata productos a peso/granel como packs: sin package_quantity, nunca multiplica", () => {
    // 1 kg de manzanas a granel: se compró "1" (kg), no hay concepto de pack.
    expect(computeStockQuantity(1, null)).toBe(1);
    // 3 kg comprados de una vez, tampoco hay pack que multiplicar.
    expect(computeStockQuantity(3, null)).toBe(3);
  });
});

describe("formatCategoryBrandLine", () => {
  it("categoría y nombre comercial, con separador, marca en mayúsculas", () => {
    expect(formatCategoryBrandLine("ALIMENTACIÓN", "Nestlé")).toBe("ALIMENTACIÓN · NESTLÉ");
  });

  it("sin nombre comercial: no aparece ningún separador", () => {
    expect(formatCategoryBrandLine("ALIMENTACIÓN", null)).toBe("ALIMENTACIÓN");
  });

  it("nombre comercial vacío se trata igual que ausente", () => {
    expect(formatCategoryBrandLine("MASCOTAS", "")).toBe("MASCOTAS");
    expect(formatCategoryBrandLine("MASCOTAS", "   ")).toBe("MASCOTAS");
  });
});
