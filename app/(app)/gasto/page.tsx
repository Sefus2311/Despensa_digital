import { Card } from "@/components/Card";
import { MonthNavigator } from "@/components/MonthNavigator";
import { getCurrentUserAndHome } from "@/lib/home";
import { formatCurrency } from "@/lib/format";
import {
  canGoToNextMonth,
  canGoToPreviousMonth,
  formatMonthLabel,
  formatMonthParam,
  getMonthBoundaries,
  parseMonthParam,
  shiftMonth,
  summarizeSpendingByStore,
} from "@/lib/spending";

// Control del gasto: gasto del mes seleccionado desglosado por centro de
// compra, para la Casa activa. Reutiliza el mismo cálculo de mes/navegación
// que Historial (lib/spending.ts) y el mismo criterio de gasto (tickets
// `reviewed` de la Casa) -- no hay una segunda fuente de datos ni un total
// guardado aparte: `summarizeSpendingByStore` calcula el total como la suma
// exacta del desglose, así que ambos números nunca pueden descuadrar entre sí.
export default async function GastoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { supabase, homeId } = await getCurrentUserAndHome();
  const params = await searchParams;
  const today = new Date();

  const selectedMonth = parseMonthParam(params.mes, today);
  const { start, end } = getMonthBoundaries(selectedMonth);

  const [{ data: monthRows }, { data: earliestRow }] = await Promise.all([
    supabase
      .from("receipts")
      .select("store_key, store_name, total_amount")
      .eq("home_id", homeId)
      .eq("status", "reviewed")
      .gte("purchase_date", start)
      .lt("purchase_date", end),
    // Proyección mínima (1 columna, 1 fila) solo para saber hasta qué mes se
    // puede retroceder -- mismo criterio que earliest_purchase_date de
    // get_home_spending_summary (Historial), sin duplicar esa función solo
    // para leer una fecha.
    supabase
      .from("receipts")
      .select("purchase_date")
      .eq("home_id", homeId)
      .eq("status", "reviewed")
      .not("purchase_date", "is", null)
      .order("purchase_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const summary = summarizeSpendingByStore(monthRows ?? []);
  const earliestPurchaseDate = earliestRow?.purchase_date ?? null;

  function buildHref(month: Date) {
    return `/gasto?mes=${formatMonthParam(month)}`;
  }

  const prevHref = canGoToPreviousMonth(selectedMonth, earliestPurchaseDate)
    ? buildHref(shiftMonth(selectedMonth, -1))
    : null;
  const nextHref = canGoToNextMonth(selectedMonth, today) ? buildHref(shiftMonth(selectedMonth, 1)) : null;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Control del gasto</h1>
      </header>

      <Card className="flex flex-col items-center gap-3">
        <MonthNavigator
          label={formatMonthLabel(selectedMonth).toUpperCase()}
          prevHref={prevHref}
          nextHref={nextHref}
        />
        <div className="text-center">
          <p className="text-[13px] font-medium text-[var(--color-muted)] uppercase tracking-wide">
            Gasto del mes
          </p>
          <p className="text-4xl font-semibold font-display mt-0.5">{formatCurrency(summary.total)}</p>
        </div>
      </Card>

      <div>
        <h2 className="font-medium mb-2">Por centro de compra</h2>
        {summary.byStore.length === 0 ? (
          <Card>
            <p className="text-[15px] text-[var(--color-muted)]">No hay compras registradas este mes.</p>
          </Card>
        ) : (
          <Card className="flex flex-col divide-y divide-[var(--color-border)]">
            {summary.byStore.map((store) => (
              <div key={store.storeKey} className="py-2.5 flex items-center justify-between gap-2">
                <span className="text-[15px] font-medium uppercase">{store.storeLabel}</span>
                <span className="text-[15px] font-medium">{formatCurrency(store.total)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
