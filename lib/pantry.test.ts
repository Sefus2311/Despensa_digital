import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPantryItemEdit,
  computeStockQuantity,
  formatCategoryBrandLine,
  parsePantryItemInput,
  type PantryItemInput,
} from "./pantry";
import type { HomePantryItem } from "./types/database";

const ITEM: HomePantryItem = {
  canonical_product_id: "prod-1",
  canonical_name: "Yogur griego",
  category: "ALIMENTACIÓN",
  brand: "Hacendado",
  quantity: 2,
  package_quantity: 6,
  unit: "ud.",
  purchase_date: "2026-09-01",
  raw_name: "YOG GRIE NAT H 6U",
  catalog_name: "Yogur griego",
  catalog_category: "ALIMENTACIÓN",
  catalog_brand: "Hacendado",
  purchase_quantity: 2,
  purchase_package_quantity: 6,
  purchase_unit: "ud.",
  receipt_id: "receipt-1",
  store_name: "MERCADONA",
  stock_adjusted: false,
};

// Sin cambios respecto a la compra original: 2 packs de 6 = 12 ud.
const UNCHANGED: PantryItemInput = {
  name: "Yogur griego",
  category: "ALIMENTACIÓN",
  brand: "Hacendado",
  stock: 12,
  unit: "ud.",
};

describe("parsePantryItemInput", () => {
  const raw = { name: " yogur NATURAL ", category: "BEBIDAS", brand: " Danone ", stock: "1.5", unit: "unidades" };

  it("normaliza nombre, marca, cantidad y unidad", () => {
    expect(parsePantryItemInput(raw)).toEqual({
      value: { name: "Yogur natural", category: "BEBIDAS", brand: "Danone", stock: 1.5, unit: "ud." },
    });
  });

  it("acepta cantidad 0: un artículo agotado sigue existiendo", () => {
    expect(parsePantryItemInput({ ...raw, stock: "0" })).toMatchObject({ value: { stock: 0 } });
  });

  it("rechaza nombre vacío, categoría inventada y cantidades no válidas", () => {
    expect(parsePantryItemInput({ ...raw, name: "  " })).toHaveProperty("error");
    expect(parsePantryItemInput({ ...raw, category: "COCHES" })).toHaveProperty("error");
    for (const stock of ["", "-1", "abc", "10000000"]) {
      expect(parsePantryItemInput({ ...raw, stock })).toHaveProperty("error");
    }
  });
});

describe("buildPantryItemEdit", () => {
  it("sin cambios no guarda ninguna corrección", () => {
    expect(buildPantryItemEdit(ITEM, UNCHANGED)).toEqual({
      display_name: null,
      category: null,
      brand: null,
      stock_quantity: null,
      stock_unit: null,
      stock_receipt_id: null,
    });
  });

  it("renombrar no congela la cantidad, que sigue saliendo de la compra", () => {
    const edit = buildPantryItemEdit(ITEM, { ...UNCHANGED, name: "Yogur griego natural" });
    expect(edit.display_name).toBe("Yogur griego natural");
    expect(edit.stock_quantity).toBeNull();
    expect(edit.stock_receipt_id).toBeNull();
  });

  it("cantidad 0: se guarda ligada al ticket de origen", () => {
    const edit = buildPantryItemEdit(ITEM, { ...UNCHANGED, stock: 0 });
    expect(edit.stock_quantity).toBe(0);
    expect(edit.stock_unit).toBe("ud.");
    expect(edit.stock_receipt_id).toBe("receipt-1");
  });

  it("volver a la cantidad de la compra deshace la corrección", () => {
    const adjusted = { ...ITEM, quantity: 3, package_quantity: null, stock_adjusted: true };
    expect(buildPantryItemEdit(adjusted, UNCHANGED).stock_quantity).toBeNull();
  });

  it("una variante de la misma unidad no cuenta como corrección", () => {
    const item = { ...ITEM, purchase_unit: "uds" };
    expect(buildPantryItemEdit(item, UNCHANGED).stock_quantity).toBeNull();
  });

  it("quitar la marca se distingue de heredarla", () => {
    expect(buildPantryItemEdit(ITEM, { ...UNCHANGED, brand: "" }).brand).toBe("");
  });

  it("nunca incluye campos de la compra original", () => {
    const keys = Object.keys(buildPantryItemEdit(ITEM, { ...UNCHANGED, stock: 0 }));
    expect(keys).not.toContain("purchase_date");
    expect(keys).not.toContain("raw_name");
    expect(keys).not.toContain("store_name");
  });
});

// El SQL no se ejecuta en vitest: mismas comprobaciones estáticas que persist.test.ts.
describe("contrato de la migración 0025", () => {
  const sql = readFileSync(
    path.resolve(__dirname, "../supabase/migrations/0025_pantry_item_edits.sql"),
    "utf-8"
  );

  it("no da permiso de borrado sobre las correcciones y retira el de los tickets", () => {
    expect(sql).not.toMatch(/create policy[^;]*pantry_item_edits[^;]*for delete/i);
    expect(sql).toMatch(/drop policy if exists "receipts_delete_member" on public\.receipts/);
  });

  it("la edición no escribe en las tablas de la compra ni del catálogo", () => {
    expect(sql).not.toMatch(/(update|insert into|delete from)\s+public\.receipt/i);
    const pantry = sql.slice(sql.indexOf("create function public.get_home_pantry"), sql.indexOf("-- 4. merge"));
    expect(pantry).not.toMatch(/\b(update|insert into|delete from)\s+public\./i);
  });

  it("la despensa sigue contando solo tickets confirmados, con RLS del usuario", () => {
    const pantry = sql.slice(sql.indexOf("create function public.get_home_pantry"), sql.indexOf("-- 4. merge"));
    expect(pantry).toMatch(/r\.status = 'reviewed'/);
    expect(pantry).toMatch(/security invoker/);
  });

  it("UNIFICAR reapunta las correcciones antes de borrar el producto de origen", () => {
    const merge = sql.slice(sql.indexOf("create or replace function public.merge_canonical_products"));
    expect(merge.indexOf("update public.pantry_item_edits")).toBeGreaterThan(-1);
    expect(merge.indexOf("update public.pantry_item_edits")).toBeLessThan(
      merge.indexOf("delete from public.canonical_products")
    );
  });
});

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
