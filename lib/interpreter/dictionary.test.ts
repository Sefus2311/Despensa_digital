import { describe, expect, it } from "vitest";
import {
  buildDictionaryCsv,
  canMergeSelection,
  collectMergeCandidates,
  describeMerge,
  nextSortDirection,
  parseDictionarySearchParams,
} from "./dictionary";
import type { DictionaryEntry } from "@/lib/types/database";

function entry(overrides: Partial<DictionaryEntry>): DictionaryEntry {
  return {
    alias_id: "alias-1",
    raw_name: "LECHE ENT DESNAT",
    canonical_product_id: "prod-leche",
    canonical_name: "LECHE ENTERA",
    category: "ALIMENTACIÓN",
    retailer: "MERCADONA",
    retailer_product_id: "rp-1",
    brand: "HACENDADO",
    times_confirmed: 14,
    confidence_score: 0.95,
    active: true,
    is_duplicate: false,
    estado: "ok",
    ...overrides,
  };
}

describe("parseDictionarySearchParams", () => {
  it("valores por defecto cuando no llega nada", () => {
    expect(parseDictionarySearchParams({})).toEqual({
      search: "",
      retailer: "",
      category: "",
      estado: "todos",
      sort: "canonical_name",
      sortDir: "asc",
      page: 1,
    });
  });

  it("acepta los valores válidos tal cual", () => {
    expect(
      parseDictionarySearchParams({
        q: " mercadona ",
        retailer: "MERCADONA",
        category: "ALIMENTACIÓN",
        estado: "revisar",
        sort: "times_confirmed",
        dir: "desc",
        page: "3",
      })
    ).toEqual({
      search: "mercadona",
      retailer: "MERCADONA",
      category: "ALIMENTACIÓN",
      estado: "revisar",
      sort: "times_confirmed",
      sortDir: "desc",
      page: 3,
    });
  });

  it("descarta estado/orden/página no válidos en vez de romper", () => {
    expect(
      parseDictionarySearchParams({ estado: "borrar-todo", sort: "id; drop table", page: "-5" })
    ).toMatchObject({ estado: "todos", sort: "canonical_name", page: 1 });
  });
});

describe("nextSortDirection", () => {
  it("pulsar la misma columna alterna asc/desc", () => {
    expect(nextSortDirection("canonical_name", "asc", "canonical_name")).toBe("desc");
    expect(nextSortDirection("canonical_name", "desc", "canonical_name")).toBe("asc");
  });

  it("pulsar otra columna siempre empieza en ascendente", () => {
    expect(nextSortDirection("canonical_name", "desc", "retailer")).toBe("asc");
  });
});

describe("buildDictionaryCsv", () => {
  it("cabecera + una fila por entrada, separadas por ;", () => {
    const csv = buildDictionaryCsv([entry({})]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe("Texto detectado;Nombre normalizado;Supermercado;Categoría;Marca;Usos;Estado");
    expect(row).toBe("LECHE ENT DESNAT;LECHE ENTERA;MERCADONA;ALIMENTACIÓN;HACENDADO;14;OK");
  });

  it("REVISAR cuando estado es revisar", () => {
    const csv = buildDictionaryCsv([entry({ estado: "revisar" })]);
    expect(csv).toContain(";REVISAR");
  });

  it("marca ausente -> celda vacía, no 'null'", () => {
    const csv = buildDictionaryCsv([entry({ brand: null })]);
    expect(csv.split("\r\n")[1]).toBe("LECHE ENT DESNAT;LECHE ENTERA;MERCADONA;ALIMENTACIÓN;;14;OK");
  });

  it("escapa comillas y el propio separador dentro de un valor", () => {
    const csv = buildDictionaryCsv([entry({ raw_name: 'Pan; "integral"' })]);
    expect(csv.split("\r\n")[1].startsWith('"Pan; ""integral"""')).toBe(true);
  });

  it("sin filas, solo la cabecera", () => {
    expect(buildDictionaryCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("collectMergeCandidates / canMergeSelection", () => {
  it("deduplica por producto canónico: dos alias del mismo producto cuentan una vez", () => {
    const rows = [
      entry({ alias_id: "a1", canonical_product_id: "p1", canonical_name: "TOMATE CHERRY" }),
      entry({ alias_id: "a2", canonical_product_id: "p1", canonical_name: "TOMATE CHERRY" }),
    ];
    expect(collectMergeCandidates(rows)).toEqual([{ canonicalProductId: "p1", canonicalName: "TOMATE CHERRY" }]);
    expect(canMergeSelection(rows)).toBe(false);
  });

  it("dos productos canónicos distintos: se puede unificar", () => {
    const rows = [
      entry({ alias_id: "a1", canonical_product_id: "p1", canonical_name: "TOMATE CHERRY" }),
      entry({ alias_id: "a2", canonical_product_id: "p2", canonical_name: "TOMATES CHERRY" }),
      entry({ alias_id: "a3", canonical_product_id: "p3", canonical_name: "TOMATE CHERRYS" }),
    ];
    expect(collectMergeCandidates(rows)).toHaveLength(3);
    expect(canMergeSelection(rows)).toBe(true);
  });

  it("una sola fila seleccionada nunca se puede unificar", () => {
    expect(canMergeSelection([entry({})])).toBe(false);
  });
});

describe("describeMerge", () => {
  it("cuenta productos canónicos, no filas", () => {
    const candidates = [
      { canonicalProductId: "p1", canonicalName: "TOMATE CHERRY" },
      { canonicalProductId: "p2", canonicalName: "TOMATES CHERRY" },
      { canonicalProductId: "p3", canonicalName: "TOMATE CHERRYS" },
    ];
    expect(describeMerge(candidates, "TOMATE CHERRY")).toBe("3 productos se unificarán como TOMATE CHERRY");
  });

  it("singular con un solo producto", () => {
    expect(describeMerge([{ canonicalProductId: "p1", canonicalName: "X" }], "X")).toBe(
      "1 producto se unificará como X"
    );
  });
});
