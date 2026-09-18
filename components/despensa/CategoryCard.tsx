import Image from "next/image";
import Link from "next/link";
import { CATEGORY_IMAGE, CATEGORY_SLUG, type ProductCategory } from "@/lib/constants/product-categories";

// Tarjeta grande de categoría para la vista principal de "Mi despensa".
// Reutiliza el look de .ui-card (fondo blanco, borde redondeado, sombra
// suave) aplicado directamente sobre el <Link>, para que toda la tarjeta
// -- imagen incluida -- sea el área táctil, no solo el texto.
export function CategoryCard({
  category,
  priority,
}: {
  category: ProductCategory;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/despensa?categoria=${CATEGORY_SLUG[category]}`}
      className="ui-card ui-card--raised flex flex-col overflow-hidden p-0"
    >
      <div className="relative w-full aspect-[4/3] bg-[var(--color-background)]">
        <Image
          src={CATEGORY_IMAGE[category]}
          alt=""
          fill
          priority={priority}
          className="object-cover"
          sizes="(max-width: 480px) 50vw, 220px"
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="font-semibold uppercase text-[15px] text-[var(--color-text)]">{category}</span>
        <span aria-hidden="true" className="text-[var(--color-primary-text)] text-lg leading-none">
          ›
        </span>
      </div>
    </Link>
  );
}
