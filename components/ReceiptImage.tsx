"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";

export function ReceiptImage({ src, isPdf }: { src: string; isPdf: boolean }) {
  const [failed, setFailed] = useState(false);

  if (isPdf) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-2xl bg-white border border-neutral-100 p-4 text-sm font-medium text-teal-700"
      >
        <Icon name="documentos" size={22} />
        Ver PDF del ticket
      </a>
    );
  }

  if (failed) {
    return (
      <div className="h-40 w-full flex flex-col items-center justify-center gap-2 rounded-2xl bg-white border border-neutral-100 text-neutral-400">
        <Icon name="vacio" size={28} />
        <span className="text-xs">No se pudo cargar la imagen del ticket</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Ticket"
      className="max-h-56 w-full object-contain rounded-2xl bg-white border border-neutral-100"
      onError={() => setFailed(true)}
    />
  );
}
