import { describe, expect, it } from "vitest";
import {
  buildStoreFilterOptions,
  canGoToNextMonth,
  canGoToNextYear,
  canGoToPreviousMonth,
  canGoToPreviousYear,
  formatMonthLabel,
  formatMonthParam,
  formatYearParam,
  getMonthBoundaries,
  getYearBoundaries,
  isSameMonth,
  isSameYear,
  parseMonthParam,
  parseYearParam,
  resolveStoreFilterParam,
  shiftMonth,
  shiftYear,
  STORE_FILTER_UNIDENTIFIED,
} from "./spending";

// Usamos siempre el constructor Date(year, monthIndex, day) en vez de un
// string ISO, para no depender de la interpretación de zona horaria.

describe("getMonthBoundaries / getYearBoundaries", () => {
  it("calcula los límites del mes y año naturales para una fecha fija", () => {
    expect(getMonthBoundaries(new Date(2026, 8, 17))).toEqual({ start: "2026-09-01", end: "2026-10-01" });
    expect(getYearBoundaries(new Date(2026, 8, 17))).toEqual({ start: "2026-01-01", end: "2027-01-01" });
  });

  it("calcula correctamente el mes en diciembre (cambio de año)", () => {
    expect(getMonthBoundaries(new Date(2026, 11, 31))).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });

  it("calcula correctamente el mes en enero", () => {
    expect(getMonthBoundaries(new Date(2026, 0, 1))).toEqual({ start: "2026-01-01", end: "2026-02-01" });
  });
});

describe("shiftMonth / shiftYear", () => {
  it("retrocede/avanza meses cruzando el límite de año", () => {
    expect(shiftMonth(new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 1));
    expect(shiftMonth(new Date(2026, 11, 15), 1)).toEqual(new Date(2027, 0, 1));
  });

  it("retrocede/avanza años", () => {
    expect(shiftYear(new Date(2026, 5, 15), -1)).toEqual(new Date(2025, 0, 1));
    expect(shiftYear(new Date(2026, 5, 15), 1)).toEqual(new Date(2027, 0, 1));
  });
});

describe("parseMonthParam / formatMonthParam", () => {
  it("parsea un parámetro válido", () => {
    expect(parseMonthParam("2026-03", new Date(2026, 8, 1))).toEqual(new Date(2026, 2, 1));
  });

  it("usa el valor por defecto si el parámetro falta o es inválido", () => {
    const fallback = new Date(2026, 8, 17);
    expect(parseMonthParam(undefined, fallback)).toEqual(new Date(2026, 8, 1));
    expect(parseMonthParam("no-valido", fallback)).toEqual(new Date(2026, 8, 1));
  });

  it("formatMonthParam es el inverso de parseMonthParam", () => {
    expect(formatMonthParam(new Date(2026, 2, 1))).toBe("2026-03");
  });
});

describe("parseYearParam / formatYearParam", () => {
  it("parsea un parámetro válido", () => {
    expect(parseYearParam("2024", new Date(2026, 8, 1))).toEqual(new Date(2024, 0, 1));
  });

  it("usa el valor por defecto si el parámetro falta o es inválido", () => {
    const fallback = new Date(2026, 8, 17);
    expect(parseYearParam(undefined, fallback)).toEqual(new Date(2026, 0, 1));
    expect(parseYearParam("abcd", fallback)).toEqual(new Date(2026, 0, 1));
  });

  it("formatYearParam es el inverso de parseYearParam", () => {
    expect(formatYearParam(new Date(2024, 0, 1))).toBe("2024");
  });
});

describe("navegación de mes: no ir más atrás de donde hay datos ni al futuro", () => {
  it("sin ninguna compra nunca se puede retroceder", () => {
    expect(canGoToPreviousMonth(new Date(2026, 8, 1), null)).toBe(false);
  });

  it("se puede retroceder mientras el mes anterior no sea anterior al de la compra más antigua", () => {
    // Compra más antigua en julio de 2026; estando en septiembre, se puede ir a agosto.
    expect(canGoToPreviousMonth(new Date(2026, 8, 1), "2026-07-15")).toBe(true);
    // Estando ya en agosto, se puede ir a julio (el mes de la compra más antigua).
    expect(canGoToPreviousMonth(new Date(2026, 7, 1), "2026-07-15")).toBe(true);
    // Estando ya en julio (el mes más antiguo con datos), no se puede retroceder más.
    expect(canGoToPreviousMonth(new Date(2026, 6, 1), "2026-07-15")).toBe(false);
  });

  it("no se puede avanzar más allá del mes actual", () => {
    const today = new Date(2026, 8, 17);
    expect(canGoToNextMonth(new Date(2026, 8, 1), today)).toBe(false);
    expect(canGoToNextMonth(new Date(2026, 7, 1), today)).toBe(true);
  });
});

describe("navegación de año: mismo criterio que el mes", () => {
  it("sin ninguna compra nunca se puede retroceder", () => {
    expect(canGoToPreviousYear(new Date(2026, 0, 1), null)).toBe(false);
  });

  it("se puede retroceder hasta el año de la compra más antigua, no antes", () => {
    expect(canGoToPreviousYear(new Date(2026, 0, 1), "2024-05-01")).toBe(true);
    expect(canGoToPreviousYear(new Date(2024, 0, 1), "2024-05-01")).toBe(false);
  });

  it("no se puede avanzar más allá del año actual", () => {
    const today = new Date(2026, 8, 17);
    expect(canGoToNextYear(new Date(2026, 0, 1), today)).toBe(false);
    expect(canGoToNextYear(new Date(2025, 0, 1), today)).toBe(true);
  });
});

describe("formatMonthLabel / isSameMonth / isSameYear", () => {
  it("formatea el mes en español con mayúscula inicial", () => {
    expect(formatMonthLabel(new Date(2026, 8, 1))).toBe("Septiembre de 2026");
  });

  it("compara meses y años", () => {
    expect(isSameMonth(new Date(2026, 8, 1), new Date(2026, 8, 28))).toBe(true);
    expect(isSameMonth(new Date(2026, 8, 1), new Date(2026, 7, 28))).toBe(false);
    expect(isSameYear(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(true);
    expect(isSameYear(new Date(2026, 0, 1), new Date(2025, 11, 31))).toBe(false);
  });
});

describe("resolveStoreFilterParam", () => {
  it('"Todos" (vacío o sin valor) no filtra', () => {
    expect(resolveStoreFilterParam(undefined)).toBeNull();
    expect(resolveStoreFilterParam("")).toBeNull();
  });

  it('"Sin identificar" filtra por clave vacía', () => {
    expect(resolveStoreFilterParam(STORE_FILTER_UNIDENTIFIED)).toBe("");
  });

  it("un comercio concreto se pasa tal cual (ya viene normalizado)", () => {
    expect(resolveStoreFilterParam("mercadona")).toBe("mercadona");
  });
});

describe("buildStoreFilterOptions", () => {
  it('antepone "Todos" y deduplica por store_key', () => {
    const options = buildStoreFilterOptions([
      { store_key: "mercadona", store_name: "Mercadona" },
      { store_key: "mercadona", store_name: "MERCADONA " },
      { store_key: "lidl", store_name: "Lidl" },
    ]);
    expect(options).toEqual([
      { value: "", label: "Todos" },
      { value: "lidl", label: "Lidl" },
      { value: "mercadona", label: "Mercadona" },
    ]);
  });

  it('agrupa las compras sin comercio bajo "Sin identificar", al final', () => {
    const options = buildStoreFilterOptions([
      { store_key: "mercadona", store_name: "Mercadona" },
      { store_key: "", store_name: null },
    ]);
    expect(options).toEqual([
      { value: "", label: "Todos" },
      { value: "mercadona", label: "Mercadona" },
      { value: STORE_FILTER_UNIDENTIFIED, label: "Sin identificar" },
    ]);
  });

  it("sin compras devuelve sólo la opción Todos", () => {
    expect(buildStoreFilterOptions([])).toEqual([{ value: "", label: "Todos" }]);
  });
});
