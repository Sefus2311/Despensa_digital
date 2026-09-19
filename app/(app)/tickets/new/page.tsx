"use client";

import { useActionState, useRef, useState } from "react";
import { ImportJsonButton } from "@/components/tickets/ImportJsonButton";
import { uploadReceipt, type UploadReceiptState } from "../actions";

export default function NewTicketPage() {
  const [state, formAction, pending] = useActionState<
    UploadReceiptState,
    FormData
  >(uploadReceipt, null);

  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      setFileName(null);
      return;
    }
    setFileName(file.name);
    if (file.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold font-display">Escanear ticket</h1>
        <p className="text-[15px] text-[var(--color-muted)] mt-1">
          Haz una foto o elige una imagen de tu ticket de compra.
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-4">
        <label
          htmlFor="file"
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-10 px-4 text-center active:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Vista previa del ticket"
              className="max-h-64 rounded-xl object-contain"
            />
          ) : (
            <>
              <span className="text-4xl" aria-hidden>
                🧾
              </span>
              <span className="font-medium text-[var(--color-primary-text)]">
                {fileName ?? "Toca para fotografiar o subir"}
              </span>
              <span className="text-[15px] text-[var(--color-muted)]">
                JPEG, PNG, WEBP o PDF · máx. 15 MB
              </span>
            </>
          )}
        </label>

        <input
          ref={inputRef}
          id="file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          required
          onChange={handleFileChange}
          className="sr-only"
        />

        {state?.error && (
          <p role="alert" className="text-[15px] text-[var(--color-danger-text)]">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-[var(--color-primary)] text-white py-3.5 font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {pending ? "Subiendo..." : "Guardar y revisar"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-[15px] text-[var(--color-muted)]" aria-hidden="true">
        <span className="flex-1 border-t border-[var(--color-border)]" />
        o
        <span className="flex-1 border-t border-[var(--color-border)]" />
      </div>

      <ImportJsonButton />
    </div>
  );
}
