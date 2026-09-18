"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons/Icon";

const LEFT_TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/inicio", label: "Inicio", icon: "home" },
  { href: "/despensa", label: "Despensa", icon: "despensa" },
];

const RIGHT_TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/historial", label: "Historial", icon: "documentos" },
  { href: "/perfil", label: "Perfil", icon: "usuario" },
];

function NavTab({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
}) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex flex-col items-center justify-center gap-1 py-3 text-[15px] font-medium ${
          active ? "text-[var(--color-primary-text)]" : "text-[var(--color-muted)]"
        }`}
      >
        <Icon name={icon} size={22} />
        {label}
      </Link>
    </li>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-10 bg-[var(--color-footer)] border-t border-[var(--color-border)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      <div className="relative">
        <ul className="flex">
          {LEFT_TABS.map((tab) => (
            <NavTab key={tab.href} {...tab} active={isActive(tab.href)} />
          ))}

          {/* Hueco central: deja sitio al botón flotante de "Escanear". */}
          <li className="w-[76px] shrink-0" aria-hidden="true" />

          {RIGHT_TABS.map((tab) => (
            <NavTab key={tab.href} {...tab} active={isActive(tab.href)} />
          ))}
        </ul>

        {/* Acción primaria "Escanear ticket": botón elevado sobre la barra,
            centrado entre Despensa e Historial (ver hueco de arriba). */}
        <Link
          href="/tickets/new"
          aria-label="Escanear ticket"
          className="absolute left-1/2 -top-[26px] -translate-x-1/2 flex items-center justify-center w-[60px] h-[60px] rounded-full bg-[var(--color-primary)] border-4 border-[var(--color-background)] shadow-lg active:scale-95 transition-transform"
        >
          <Icon name="camara" size={24} className="text-white" />
        </Link>
      </div>
    </nav>
  );
}
