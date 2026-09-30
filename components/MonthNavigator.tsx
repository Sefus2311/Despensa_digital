import Link from "next/link";

const ARROW_BASE = "w-11 h-11 flex items-center justify-center text-lg leading-none rounded-md";
const ARROW_ENABLED = `${ARROW_BASE} text-[var(--color-primary-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]`;
const ARROW_DISABLED = `${ARROW_BASE} text-[var(--color-muted)] opacity-50`;

/**
 * Fila "‹ ETIQUETA ›" de navegación por periodo, compartida entre Historial
 * (mes y año) y Control del gasto (solo mes). Cada página decide qué
 * enlaces son navegables con lib/spending.ts (canGoToPreviousMonth/
 * canGoToNextMonth/...) -- `null` deshabilita la flecha correspondiente.
 */
export function MonthNavigator({
  label,
  prevHref,
  nextHref,
}: {
  label: string;
  prevHref: string | null;
  nextHref: string | null;
}) {
  return (
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
  );
}
