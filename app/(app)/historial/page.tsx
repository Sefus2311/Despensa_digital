import Link from "next/link";
import { Card } from "@/components/Card";
import { Badge } from "@/components/ui/Badge";
import { StoreFilterSelect } from "@/components/StoreFilterSelect";
import { getCurrentUserAndHome } from "@/lib/home";
import { formatCurrency } from "@/lib/format";
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
} from "@/lib/spending";

interface SpendingSummaryRow {
  month_total: number;
  year_total: number;
  earliest_purchase_date: string | null;
}

const ARROW_BASE = "w-11 h-11 flex items-center justify-center text-lg leading-none rounded-md";
const ARROW_ENABLED = `${ARROW_BASE} text-[var(--color-primary)] hover:bg-neutral-50`;
const ARROW_DISABLED = `${ARROW_BASE} text-neutral-300`;

function SpendingStat({
  label,
  value,
  prevHref,
  nextHref,
}: {
  label: string;
  value: string;
  prevHref: string | null;
  nextHref: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-between w-full">
        {prevHref ? (
          <Link href={prevHref} aria-label="Periodo anterior" className={ARROW_ENABLED}>
            ‹
          </Link>
        ) : (
          <span aria-hidden="true" className={ARROW_DISABLED}>
            ‹
          </span>
        )}
        <span className="text-[15px] text-[var(--color-muted)] text-center flex-1 px-1">{label}</span>
        {nextHref ? (
          <Link href={nextHref} aria-label="Periodo siguiente" className={ARROW_ENABLED}>
            ›
          </Link>
        ) : (
          <span aria-hidden="true" className={ARROW_DISABLED}>
            ›
          </span>
        )}
      </div>
      <span className="text-xl font-semibold">{value}</span>
    </div>
  );
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ lugar?: string; mes?: string; anio?: string }>;
}) {
  const { supabase, homeId } = await getCurrentUserAndHome();
  const params = await searchParams;
  const today = new Date();

  const lugarParam = params.lugar ?? "";
  const storeKeyFilter = resolveStoreFilterParam(lugarParam);

  const selectedMonth = parseMonthParam(params.mes, today);
  const selectedYear = parseYearParam(params.anio, today);
  const mesParam = formatMonthParam(selectedMonth);
  const anioParam = formatYearParam(selectedYear);

  const monthBoundaries = getMonthBoundaries(selectedMonth);
  const yearBoundaries = getYearBoundaries(selectedYear);

  let receiptsQuery = supabase
    .from("receipts")
    .select("id, store_name, purchase_date, total_amount, status")
    .eq("home_id", homeId);
  if (storeKeyFilter !== null) {
    receiptsQuery = receiptsQuery.eq("store_key", storeKeyFilter);
  }

  const [{ data: summaryData }, { data: storeRows }, { data: receipts }] = await Promise.all([
    supabase
      .rpc("get_home_spending_summary", {
        p_home_id: homeId,
        p_store_key: storeKeyFilter,
        p_month_start: monthBoundaries.start,
        p_month_end: monthBoundaries.end,
        p_year_start: yearBoundaries.start,
        p_year_end: yearBoundaries.end,
      })
      .single(),
    // Proyección mínima (2 columnas) para construir las opciones del filtro,
    // no el historial completo -- volumen proporcional al nº de tickets de la
    // Casa, no a todo su contenido (líneas, imágenes...).
    supabase.from("receipts").select("store_key, store_name").eq("home_id", homeId).eq("status", "reviewed"),
    receiptsQuery
      .order("purchase_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const summary = (summaryData as SpendingSummaryRow | null) ?? {
    month_total: 0,
    year_total: 0,
    earliest_purchase_date: null,
  };
  const storeOptions = buildStoreFilterOptions(storeRows ?? []);
  const selectedStoreLabel =
    storeKeyFilter !== null ? storeOptions.find((o) => o.value === lugarParam)?.label ?? null : null;

  const monthLabel =
    (isSameMonth(selectedMonth, today) ? "Este mes" : formatMonthLabel(selectedMonth)) +
    (selectedStoreLabel ? ` en ${selectedStoreLabel}` : "");
  const yearLabel =
    (isSameYear(selectedYear, today) ? "Este año" : formatYearParam(selectedYear)) +
    (selectedStoreLabel ? ` en ${selectedStoreLabel}` : "");

  function buildHref(overrides: { mes?: string; anio?: string }) {
    const sp = new URLSearchParams();
    sp.set("mes", overrides.mes ?? mesParam);
    sp.set("anio", overrides.anio ?? anioParam);
    if (lugarParam) sp.set("lugar", lugarParam);
    return `/historial?${sp.toString()}`;
  }

  const monthPrevHref = canGoToPreviousMonth(selectedMonth, summary.earliest_purchase_date)
    ? buildHref({ mes: formatMonthParam(shiftMonth(selectedMonth, -1)) })
    : null;
  const monthNextHref = canGoToNextMonth(selectedMonth, today)
    ? buildHref({ mes: formatMonthParam(shiftMonth(selectedMonth, 1)) })
    : null;
  const yearPrevHref = canGoToPreviousYear(selectedYear, summary.earliest_purchase_date)
    ? buildHref({ anio: formatYearParam(shiftYear(selectedYear, -1)) })
    : null;
  const yearNextHref = canGoToNextYear(selectedYear, today)
    ? buildHref({ anio: formatYearParam(shiftYear(selectedYear, 1)) })
    : null;

  const receiptIds = (receipts ?? []).map((r) => r.id);
  const { data: itemCounts } = receiptIds.length
    ? await supabase.from("receipt_items").select("receipt_id").in("receipt_id", receiptIds)
    : { data: [] as { receipt_id: string }[] };

  const countByReceipt = new Map<string, number>();
  for (const row of itemCounts ?? []) {
    countByReceipt.set(row.receipt_id, (countByReceipt.get(row.receipt_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Historial</h1>
      </header>

      <Card className="grid grid-cols-2 gap-4">
        <SpendingStat
          label={monthLabel}
          value={formatCurrency(summary.month_total)}
          prevHref={monthPrevHref}
          nextHref={monthNextHref}
        />
        <SpendingStat
          label={yearLabel}
          value={formatCurrency(summary.year_total)}
          prevHref={yearPrevHref}
          nextHref={yearNextHref}
        />
      </Card>

      <StoreFilterSelect options={storeOptions} defaultValue={lugarParam} mesParam={mesParam} anioParam={anioParam} />

      {!receipts || receipts.length === 0 ? (
        <Card>
          <p className="text-[15px] text-[var(--color-muted)]">
            {storeKeyFilter !== null
              ? "No hay compras registradas en este lugar."
              : 'Todavía no has guardado ningún ticket. Pulsa "Escanear" para añadir el primero.'}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {receipts.map((r) => (
            <li key={r.id}>
              <Link
                href={
                  r.status === "reviewed"
                    ? `/historial/${r.id}`
                    : `/tickets/${r.id}/review`
                }
              >
                <Card>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {r.store_name || "Ticket sin nombre"}
                    </span>
                    {r.status !== "reviewed" && <Badge tone="warning">Pendiente</Badge>}
                  </div>
                  <div className="text-[15px] text-[var(--color-muted)] mt-1 flex justify-between">
                    <span>
                      {r.purchase_date
                        ? new Date(r.purchase_date).toLocaleDateString("es-ES")
                        : "Sin fecha"}
                    </span>
                    <span>{r.total_amount != null ? formatCurrency(r.total_amount) : "—"}</span>
                  </div>
                  <div className="text-[15px] text-[var(--color-muted)] mt-1">
                    {countByReceipt.get(r.id) ?? 0} productos
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
