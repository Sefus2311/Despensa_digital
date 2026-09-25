"use client";

import { useState } from "react";

export interface RecipePhoto {
  url: string;
}

/**
 * Galería de fotos SOLO para la ficha de lectura de la receta
 * (app/(app)/recetas/[id]/page.tsx). No se reutiliza en ningún paso
 * operativo (Quiero cocinar esto, TENGO/COMPRAR, Preparación, lista de la
 * compra) -- deliberadamente: las fotos son de la ficha, no del flujo de
 * ejecución (sección 5 del encargo que la introdujo). Sin fotos, el llamador
 * simplemente no renderiza este componente -- no hay hueco vacío que dejar.
 */
export function RecipePhotoGallery({ fotos }: { fotos: RecipePhoto[] }) {
  const [activo, setActivo] = useState(0);
  if (fotos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={fotos[activo].url}
        alt="Foto de la receta"
        className="w-full aspect-[4/3] object-cover rounded-2xl border border-[var(--color-border)]"
      />
      {fotos.length > 1 && (
        <div className="flex gap-2">
          {fotos.map((foto, index) => (
            <button
              key={foto.url}
              type="button"
              onClick={() => setActivo(index)}
              aria-label={`Ver foto ${index + 1}`}
              aria-current={index === activo}
              className={`flex-1 aspect-square rounded-lg overflow-hidden border-2 ${
                index === activo ? "border-[var(--color-primary)]" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
