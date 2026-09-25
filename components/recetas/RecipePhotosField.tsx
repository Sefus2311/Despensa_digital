"use client";

import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons/Icon";
import {
  addRecetaFoto,
  removeDraftRecetaFoto,
  removeRecetaFoto,
  uploadDraftRecetaFoto,
  type UploadedFoto,
} from "@/app/(app)/recetas/actions";
import { RECETA_FOTOS_MAX } from "@/lib/receta-fotos";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Reduce la foto a un máximo de 1600px de lado antes de subirla -- así la
 * ficha de la receta carga rápido en móvil sin necesitar ninguna
 * infraestructura de compresión en el servidor (no existe ninguna todavía;
 * esto es puro Canvas del navegador, sin dependencias nuevas). Si algo falla
 * (navegador sin soporte, imagen corrupta...) se sube el archivo original tal
 * cual -- nunca bloquea la subida.
 */
async function resizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Sección "Fotos" de creación/edición de receta -- hasta 3, la primera es la
 * principal (sin drag&drop: si se borra, la siguiente pasa a serlo sola, ver
 * migración 0023). Dos modos según haya o no `recetaId`:
 *  - null (receta nueva, sin guardar todavía): sube a Storage bajo `draftId`
 *    sin crear fila en receta_fotos -- createReceta las asocia al guardar.
 *  - con id (receta ya existente): cada foto se sube/asocia o se borra al
 *    instante, independiente del resto del formulario.
 * Solo se usa en creación/edición -- deliberadamente NO en la ficha de
 * lectura ni en ningún paso operativo (Quiero cocinar esto, TENGO/COMPRAR,
 * lista de la compra): ver components/recetas/RecipePhotoGallery.tsx para
 * dónde sí se muestran las fotos.
 */
export function RecipePhotosField({
  recetaId,
  draftId,
  initialFotos,
  onDraftPathsChange,
}: {
  recetaId: string | null;
  draftId: string;
  initialFotos: UploadedFoto[];
  onDraftPathsChange?: (paths: string[]) => void;
}) {
  const [fotos, setFotos] = useState<UploadedFoto[]>(initialFotos);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const puedeAnadir = fotos.length < RECETA_FOTOS_MAX;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    startTransition(async () => {
      const resized = await resizeImage(file);
      const formData = new FormData();
      formData.set("file", resized);

      let result;
      if (recetaId) {
        result = await addRecetaFoto(recetaId, formData);
      } else {
        formData.set("current_count", String(fotos.length));
        result = await uploadDraftRecetaFoto(draftId, formData);
      }

      if ("error" in result) {
        setError(result.error);
        return;
      }
      setFotos((prev) => {
        const next = [...prev, result.foto];
        onDraftPathsChange?.(next.map((f) => f.path));
        return next;
      });
    });
  }

  function handleRemove(foto: UploadedFoto) {
    setError(null);
    startTransition(async () => {
      if (foto.id) {
        const result = await removeRecetaFoto(foto.id);
        if (result.error) {
          setError(result.error);
          return;
        }
      } else {
        await removeDraftRecetaFoto(foto.path);
      }
      setFotos((prev) => {
        const next = prev.filter((f) => f !== foto);
        onDraftPathsChange?.(next.map((f) => f.path));
        return next;
      });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="ui-field__label">
        Fotos ({fotos.length}/{RECETA_FOTOS_MAX})
      </p>
      <div className="flex gap-2">
        {fotos.map((foto, index) => (
          <div key={foto.path} className="relative flex-1 aspect-square min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={foto.url}
              alt={index === 0 ? "Foto principal de la receta" : `Foto ${index + 1} de la receta`}
              className="w-full h-full object-cover rounded-xl border border-[var(--color-border)]"
            />
            {index === 0 && (
              <span className="absolute bottom-1 left-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[11px] font-medium text-white">
                Principal
              </span>
            )}
            <button
              type="button"
              onClick={() => handleRemove(foto)}
              disabled={busy}
              aria-label="Eliminar esta foto"
              className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-danger-text)] disabled:opacity-60"
            >
              <Icon name="cerrar" size={14} />
            </button>
          </div>
        ))}

        {puedeAnadir && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex-1 aspect-square min-w-0 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--color-border)] text-[var(--color-primary-text)] disabled:opacity-60"
          >
            <Icon name="anadir" size={20} />
            <span className="text-[13px] font-medium">{busy ? "Subiendo..." : "Añadir"}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {error && (
        <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}
    </div>
  );
}
