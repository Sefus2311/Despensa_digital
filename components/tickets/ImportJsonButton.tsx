"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons/Icon";
import { importReceiptJson, type ImportJsonState } from "@/app/(app)/tickets/actions";
import { checkReceiptPdf } from "@/lib/receipt-import/pdf";
import { formatCents, toCents } from "@/lib/receipt-import/money";
import { parseReceiptImportJson } from "@/lib/receipt-import/validate";
import { normalizeSupermarketName } from "@/lib/supermarkets";

interface JsonSelection {
  text: string;
  fileName: string;
  summary: string;
}

// Importar un ticket digital, en dos pasos:
//  1. «Importar JSON»: se lee y valida el fichero en el navegador.
//  2. Se pide el PDF asociado (obligatorio); con ambos, «Importar ticket» envía
//     todo a la Server Action, que vuelve a validar, sube el PDF y crea el
//     ticket con el PDF asociado.
// No inserta nada en Supabase desde el cliente.
export function ImportJsonButton() {
  const [state, formAction, actionPending] = useActionState<ImportJsonState, FormData>(importReceiptJson, null);
  const [, startTransition] = useTransition();
  const [json, setJson] = useState<JsonSelection | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [clientIssues, setClientIssues] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const busy = actionPending || reading;

  function reset() {
    setJson(null);
    setPdf(null);
    setClientIssues([]);
  }

  async function handleJsonChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Permite volver a elegir el mismo fichero tras corregirlo.
    e.target.value = "";
    if (!file) return;

    reset();
    if (!file.name.toLowerCase().endsWith(".json")) {
      setClientIssues(["Selecciona un archivo con extensión .json."]);
      return;
    }

    setReading(true);
    try {
      const text = await file.text();
      const parsed = parseReceiptImportJson(text);
      if (!parsed.ok) {
        setClientIssues(parsed.issues.map((issue) => issue.message));
        return;
      }
      const { receipt, lines } = parsed.data;
      setJson({
        text,
        fileName: file.name,
        summary: `${normalizeSupermarketName(receipt.supermarket)} · ${lines.length} producto${lines.length === 1 ? "" : "s"} · ${formatCents(toCents(receipt.total))}`,
      });
    } catch {
      setClientIssues(["No se pudo leer el archivo."]);
    } finally {
      setReading(false);
    }
  }

  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setClientIssues([]);
    setPdf(null);
    setReading(true);
    try {
      const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      const problem = checkReceiptPdf({ name: file.name, type: file.type, size: file.size }, head);
      if (problem) {
        setClientIssues([problem]);
        return;
      }
      setPdf(file);
    } catch {
      setClientIssues(["No se pudo leer el PDF."]);
    } finally {
      setReading(false);
    }
  }

  function handleImport() {
    if (!json || !pdf) return;
    const formData = new FormData();
    formData.set("json", json.text);
    formData.set("pdf", pdf);
    startTransition(() => formAction(formData));
  }

  const issues = clientIssues.length > 0 ? clientIssues : (state?.issues ?? (state?.error ? [state.error] : []));

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleJsonChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handlePdfChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {!json ? (
        <Button
          type="button"
          variant="secondary"
          loading={busy}
          disabled={busy}
          onClick={() => jsonInputRef.current?.click()}
          className="w-full"
        >
          <span className="inline-flex items-center gap-2">
            <Icon name="documentos" size={18} />
            {reading ? "Leyendo..." : "Importar JSON"}
          </span>
        </Button>
      ) : (
        <Card className="flex flex-col gap-3">
          <div>
            <p className="font-medium text-[15px]">JSON válido: {json.summary}</p>
            <p className="text-[13px] text-[var(--color-muted)] break-words">{json.fileName}</p>
          </div>

          <div>
            <p className="text-[15px] font-medium">PDF del ticket (obligatorio)</p>
            <p className="text-[15px] text-[var(--color-muted)]">
              {pdf ? pdf.name : "Adjunta el PDF asociado para poder importar el ticket."}
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => pdfInputRef.current?.click()}
            className="w-full"
          >
            {pdf ? "Cambiar PDF" : "Adjuntar PDF"}
          </Button>

          <Button
            type="button"
            loading={actionPending}
            disabled={busy || !pdf}
            onClick={handleImport}
            className="w-full"
          >
            {actionPending ? "Importando..." : "Importar ticket"}
          </Button>

          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="text-[15px] text-[var(--color-muted)] font-medium py-1"
          >
            Cancelar
          </button>
        </Card>
      )}

      {issues.length > 0 && (
        <Alert tone="danger">
          {issues.length === 1 ? (
            <p>{issues[0]}</p>
          ) : (
            <ul className="list-disc pl-5">
              {issues.map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
          )}
          {clientIssues.length === 0 && state?.duplicate && (
            <p className="mt-2">
              <Link href={state.duplicate.href} className="font-medium underline">
                Abrir el ticket existente
              </Link>
            </p>
          )}
        </Alert>
      )}
    </div>
  );
}
