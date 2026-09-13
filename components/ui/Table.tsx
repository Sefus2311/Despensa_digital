import type { TableHTMLAttributes } from "react";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  caption?: string;
}

// Contenedor accesible (scroll horizontal, texto >=15px, caption). No
// resuelve ordenación/filtrado: eso es lógica de cada pantalla.
export function Table({ caption, className, children, ...props }: TableProps) {
  return (
    <div className="ui-table-wrap">
      <table className={["ui-table", className].filter(Boolean).join(" ")} {...props}>
        {caption && <caption className="ui-table__caption">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
