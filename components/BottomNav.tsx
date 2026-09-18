"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons/Icon";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/inicio", label: "Inicio", icon: "home" },
  { href: "/despensa", label: "Despensa", icon: "despensa" },
  { href: "/historial", label: "Historial", icon: "documentos" },
  { href: "/perfil", label: "Perfil", icon: "usuario" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Botón flotante: acción primaria "Escanear ticket" */}
      <Link
        href="/tickets/new"
        aria-label="Escanear ticket"
        className="fixed z-20 bottom-20 right-4 sm:right-1/2 sm:translate-x-[9.5rem] flex items-center gap-2 rounded-full bg-[var(--color-primary)] text-white px-5 py-4 shadow-lg active:scale-95 transition-transform"
      >
        <Icon name="camara" size={20} />
        <span className="font-medium">Escanear</span>
      </Link>

      <nav
        className="fixed bottom-0 inset-x-0 z-10 bg-[var(--color-footer)] border-t border-[var(--color-border)] pb-[env(safe-area-inset-bottom)]"
        aria-label="Navegación principal"
      >
        <ul className="flex justify-around">
          {TABS.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-1 py-3 text-[15px] font-medium ${
                    active ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
                  }`}
                >
                  <Icon name={tab.icon} size={22} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
