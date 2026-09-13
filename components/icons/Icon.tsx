import type { CSSProperties, SVGProps } from "react";

/**
 * Biblioteca de iconos propia de Despensa Digital / Mayordomo Digital.
 * Arquitectura (un único componente + diccionario tipado en vez de un
 * fichero por icono) y reglas de trazo adaptadas de la biblioteca
 * "Trazo de Ingeniero" de RealMargin — ver components/icons/README.md
 * para el detalle de qué se reutilizó, qué se adaptó y qué es nuevo.
 *
 * Reglas: viewBox 0 0 24 24, área útil 20x20, trazo principal 1.5,
 * trazo auxiliar 0.75, linecap/linejoin "round", color principal
 * currentColor, acento puntual en var(--color-primary).
 */
const ICON_SVGS = {
  home: '<path d="M4 11L12 4l8 7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 20v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  despensa: '<path d="M8 3h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9 3v2.5L7 8v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8l-2-2.5V3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="7" y1="13" x2="17" y2="13" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" stroke-linecap="round"/>',
  documentos: '<path d="M6 3h9l4 4v14H6V3z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="8" y1="9" x2="16" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="8" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="8" y1="15" x2="15" y2="15" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="8" y1="18" x2="18" y2="18" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" stroke-linecap="round"/>',
  usuario: '<circle cx="12" cy="6" r="3.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 22v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="4" r="2" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" fill="none"/>',
  contactos: '<circle cx="8" cy="5" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 12v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="17" cy="7" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M13 14v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="14" stroke="currentColor" stroke-width="0.75" stroke-linecap="round"/>',
  ajustes: '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="10" y="3" width="4" height="3" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="10" y="18" width="4" height="3" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="3" y="10" width="3" height="4" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="18" y="10" width="3" height="4" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 8v1" stroke="var(--color-primary, #0f766e)" stroke-width="0.75" stroke-linecap="round"/>',
  editar: '<line x1="4" y1="18" x2="14" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M14 8l2-2 4 4-2 2" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="14" y1="8" x2="18" y2="12" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" stroke-linecap="round"/>',
  eliminar: '<line x1="5" y1="7" x2="19" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="10" x2="10" y2="17" stroke="currentColor" stroke-width="0.75" stroke-linecap="round"/><line x1="14" y1="10" x2="14" y2="17" stroke="currentColor" stroke-width="0.75" stroke-linecap="round"/>',
  anadir: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="12" y1="7.5" x2="12" y2="16.5" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" stroke-linecap="round"/><line x1="7.5" y1="12" x2="16.5" y2="12" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" stroke-linecap="round"/>',
  guardar: '<path d="M5 3h11l3 3v15H5V3z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="5" y1="21" x2="19" y2="21" stroke="currentColor" stroke-width="0.75" stroke-linecap="round"/>',
  confirmar: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 12l3 3 5-5" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  cerrar: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="8" y1="8" x2="16" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="8" x2="8" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  volver: '<path d="M14 6l-6 6 6 6" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  menu: '<line x1="4" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="17" x2="14" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="18" cy="17" r="1" fill="var(--color-primary, #0f766e)"/>',
  buscar: '<circle cx="9" cy="9" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="13" y1="13" x2="19" y2="19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="19" y1="19" x2="21" y2="21" stroke="currentColor" stroke-width="0.75" stroke-linecap="round"/>',
  notificaciones: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="18" cy="6" r="2.5" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" fill="none"/><line x1="16" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="0.75" stroke-linecap="round"/>',
  mensajes: '<path d="M3 8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-4l-4 4v-4H7a4 4 0 0 1-4-4V8z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="11" r="0.9" fill="var(--color-primary, #0f766e)"/><circle cx="12" cy="11" r="0.9" fill="currentColor"/><circle cx="15" cy="11" r="0.9" fill="currentColor"/>',
  tareas: '<rect x="4" y="4" width="16" height="16" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M7.5 12l2 2 3-4" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="13.5" y1="8" x2="17" y2="8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="13.5" y1="16" x2="17" y2="16" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>',
  telefono: '<path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 20h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="18" cy="6" r="1.5" stroke="var(--color-primary, #0f766e)" stroke-width="1" fill="none"/>',
  calendario: '<rect x="4" y="5" width="16" height="15" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="8" y1="3" x2="8" y2="6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="3" x2="16" y2="6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="15.5" cy="14.5" r="1.4" fill="var(--color-primary, #0f766e)"/>',
  reloj: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="12" y1="12" x2="12" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="12" x2="15.5" y2="13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="4" r="0.9" fill="var(--color-primary, #0f766e)"/>',
  camara: '<path d="M4 8a2 2 0 0 1 2-2h2l1.2-1.6a1 1 0 0 1 .8-.4h4a1 1 0 0 1 .8.4L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="17" cy="9.5" r="0.75" fill="var(--color-primary, #0f766e)"/>',
  microfono: '<rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M6 11a6 6 0 0 0 12 0" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="21" x2="15" y2="21" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" stroke-linecap="round"/>',
  compartir: '<rect x="4" y="4" width="14" height="14" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M18 10l4 4-4 4" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="12" x2="18" y2="12" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" stroke-linecap="round"/>',
  ubicacion: '<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="9" r="2.5" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" fill="none"/>',
  ayuda: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9 9a3 3 0 0 1 3-3 2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1-2.5 2.5h-1" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/>',
  advertencia: '<path d="M12 3L2 20h20L12 3z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="10" x2="12" y2="15" stroke="var(--color-primary, #0f766e)" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="18" r="0.75" fill="var(--color-primary, #0f766e)"/>',
  vacio: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="0.75" stroke-dasharray="2 2" fill="none"/><line x1="6" y1="18" x2="8" y2="16" stroke="currentColor" stroke-width="0.75" stroke-linecap="round"/>',
} as const;

export const ICON_LABELS = {
  home: "Inicio",
  despensa: "Despensa",
  documentos: "Documentos",
  usuario: "Usuario",
  contactos: "Contactos",
  ajustes: "Ajustes",
  editar: "Editar",
  eliminar: "Eliminar",
  anadir: "Añadir",
  guardar: "Guardar",
  confirmar: "Confirmar",
  cerrar: "Cerrar",
  volver: "Volver",
  menu: "Menú",
  buscar: "Buscar",
  notificaciones: "Notificaciones",
  mensajes: "Mensajes",
  tareas: "Tareas",
  telefono: "Teléfono",
  calendario: "Calendario",
  reloj: "Reloj",
  camara: "Cámara",
  microfono: "Micrófono",
  compartir: "Compartir",
  ubicacion: "Ubicación",
  ayuda: "Ayuda",
  advertencia: "Advertencia",
  vacio: "Vacío",
} as const satisfies Record<keyof typeof ICON_SVGS, string>;

export type IconName = keyof typeof ICON_SVGS;

export const ICON_NAMES = Object.keys(ICON_SVGS) as IconName[];

export interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, "name" | "children" | "dangerouslySetInnerHTML"> {
  name: IconName;
  size?: number | string;
  title?: string;
}

export function Icon({ name, size = 24, title, style, ...props }: IconProps) {
  const accessibilityProps = title
    ? { role: "img", "aria-label": title }
    : { "aria-hidden": true as const };
  const mergedStyle: CSSProperties = { flexShrink: 0, ...style };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      focusable="false"
      style={mergedStyle}
      {...accessibilityProps}
      {...props}
      dangerouslySetInnerHTML={{ __html: ICON_SVGS[name] }}
    />
  );
}

export default Icon;
