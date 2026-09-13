"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface DropdownProps {
  label: string;
  children: ReactNode;
  /** 'left' (por defecto) abre el panel hacia la derecha del disparador,
   * anclando su borde izquierdo. 'right' lo abre hacia la izquierda,
   * anclando su borde derecho — para triggers pegados al borde derecho de
   * su contenedor. */
  align?: "left" | "right";
}

export function Dropdown({ label, children, align = "left" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="ui-dropdown" ref={rootRef}>
      <button
        type="button"
        className="ui-dropdown__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div
          className={`ui-dropdown__panel${align === "right" ? " ui-dropdown__panel--right" : ""}`}
          role="menu"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
