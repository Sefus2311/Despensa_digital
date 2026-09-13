"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons/Icon";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// Cierra con Escape y con clic en el scrim; mueve el foco al diálogo al
// abrir. No implementa un focus-trap completo (recorrer todos los
// elementos tabulables) — deuda conocida, a resolver si algún uso real lo
// necesita.
export function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ui-modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className="ui-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="ui-modal__header">
          <h2 className="ui-modal__title">{title}</h2>
          <button type="button" className="ui-modal__close" onClick={onClose} aria-label="Cerrar">
            <Icon name="cerrar" size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="ui-modal__body">{children}</div>
      </div>
    </div>
  );
}
