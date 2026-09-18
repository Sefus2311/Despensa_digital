import { notFound } from "next/navigation";
import Link from "next/link";
import { canModerateInterpreter, isAdmin } from "@/lib/roles";

/**
 * Puerta de entrada a toda la sección /admin: exige como mínimo `delegate`.
 * Cada página hija vuelve a comprobar su propio rol mínimo (p. ej. /admin y
 * /admin/users exigen `admin`) -- esta capa sólo filtra el caso más común
 * (usuario normal) y monta la navegación. La protección real está siempre
 * en servidor, nunca en ocultar enlaces.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await canModerateInterpreter())) {
    notFound();
  }

  const admin = await isAdmin();

  const links = [
    ...(admin ? [{ href: "/admin", label: "Panel" }] : []),
    ...(admin ? [{ href: "/admin/users", label: "Usuarios" }] : []),
    { href: "/admin/interpreter", label: "Intérprete" },
    { href: "/admin/interpreter/pending", label: "Pendientes" },
    { href: "/admin/interpreter/conflicts", label: "Conflictos" },
    { href: "/admin/products", label: "Productos" },
    ...(admin ? [{ href: "/admin/audit", label: "Auditoría" }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 text-[15px]">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-muted)] whitespace-nowrap"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
