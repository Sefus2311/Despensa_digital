"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons/Icon";

export function ReceiptImage({ src, isPdf }: { src: string; isPdf: boolean }) {
  const [failed, setFailed] = useState(false);

  if (isPdf) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 text-[15px] font-medium text-[var(--color-primary-text)]"
      >
        <Icon name="documentos" size={22} />
        Ver PDF del ticket
      </a>
    );
  }

  if (failed) {
    return (
      <Card
        elevation="none"
        className="h-40 w-full flex flex-col items-center justify-center gap-2 text-[var(--color-muted)]"
      >
        <Icon name="vacio" size={28} />
        <span className="text-[15px]">No se pudo cargar la imagen del ticket</span>
      </Card>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Ticket"
      className="max-h-56 w-full object-contain rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]"
      onError={() => setFailed(true)}
    />
  );
}
