import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { toImportPayload } from "./adapter";
import { validImportJson } from "./fixtures";
import { importReceipt, type ReceiptImportClient } from "./persist";
import { validateReceiptImport } from "./validate";

const HOME = "11111111-1111-1111-1111-111111111111";

function payload() {
  const result = validateReceiptImport(validImportJson());
  if (!result.ok) throw new Error("fixture inválido");
  return toImportPayload(result.data);
}

/** Cliente falso: solo expone rpc(); cualquier otro acceso (from, storage...) lanzaría. */
function fakeClient(response: { data: unknown; error: { code?: string; message: string } | null }) {
  const rpc = vi.fn(async () => response);
  const client = new Proxy({ rpc } as unknown as ReceiptImportClient, {
    get(target, prop) {
      if (prop === "rpc") return rpc;
      throw new Error(`Acceso no permitido al cliente: ${String(prop)}`);
    },
  });
  return { client, rpc };
}

describe("importReceipt", () => {
  it("crea el ticket con una única llamada RPC y devuelve su id", async () => {
    const { client, rpc } = fakeClient({ data: { status: "created", receipt_id: "r-1" }, error: null });
    const result = await importReceipt(client, HOME, payload());

    expect(result).toEqual({ ok: true, receiptId: "r-1" });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("import_receipt_json");
    expect(args.p_home_id).toBe(HOME);
    expect(args.p_image_path).toBeNull();
  });

  it("asocia el PDF: pasa la ruta subida al RPC", async () => {
    const { client, rpc } = fakeClient({ data: { status: "created", receipt_id: "r-3" }, error: null });
    await importReceipt(client, HOME, payload(), `${HOME}/abc.pdf`);
    const [, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(args.p_image_path).toBe(`${HOME}/abc.pdf`);
  });

  it("10. detecta un ticket duplicado y devuelve el ticket existente", async () => {
    const { client } = fakeClient({
      data: { status: "duplicate", receipt_id: "r-viejo", receipt_status: "pending_review", reason: "provider_message_id" },
      error: null,
    });
    const result = await importReceipt(client, HOME, payload());

    expect(result.ok).toBe(false);
    if (result.ok || result.code !== "duplicate") throw new Error("se esperaba duplicate");
    expect(result.receiptId).toBe("r-viejo");
    expect(result.receiptStatus).toBe("pending_review");
    expect(result.message).toMatch(/parece haber sido importado anteriormente/);
    expect(result.message).toMatch(/identificador de correo/);
  });

  it("los tres criterios de duplicado tienen mensaje propio", async () => {
    for (const [reason, texto] of [
      ["provider_message_id", /identificador de correo/],
      ["receipt_number", /supermercado y número de ticket/],
      ["document_hash", /documento original/],
    ] as const) {
      const { client } = fakeClient({
        data: { status: "duplicate", receipt_id: "r", receipt_status: "reviewed", reason },
        error: null,
      });
      const result = await importReceipt(client, HOME, payload());
      if (result.ok) throw new Error("se esperaba error");
      expect(result.message).toMatch(texto);
    }
  });

  it("13. usuario sin acceso a la casa: 'No tienes acceso a la casa seleccionada'", async () => {
    const { client } = fakeClient({ data: null, error: { code: "42501", message: "not_a_member" } });
    const result = await importReceipt(client, HOME, payload());
    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: "No tienes acceso a la casa seleccionada.",
    });
  });

  it("sin casa activa: cancela sin llamar a la base de datos", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    const result = await importReceipt(client, null, payload());
    expect(result).toMatchObject({ ok: false, code: "no_home" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("14. si falla la inserción de una línea, la operación entera se cancela sin escrituras sueltas", async () => {
    // La atomicidad la garantiza import_receipt_json (una sola función = una transacción de
    // Postgres). Aquí se comprueba el contrato del cliente: un único RPC, ninguna escritura
    // aparte (el Proxy lanzaría al usar .from()), y el error se comunica sin guardar nada.
    const { client, rpc } = fakeClient({
      data: null,
      error: { code: "22P02", message: 'invalid input syntax for type numeric: "x"' },
    });
    const result = await importReceipt(client, HOME, payload());

    expect(result).toEqual({
      ok: false,
      code: "db_error",
      message: "No se pudo importar el ticket. No se ha guardado nada.",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("15. importar no modifica la despensa: solo llama a import_receipt_json en estado pending_review", async () => {
    const { client, rpc } = fakeClient({ data: { status: "created", receipt_id: "r-2" }, error: null });
    await importReceipt(client, HOME, payload());

    expect(rpc.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual(["import_receipt_json"]);
    const [, args] = rpc.mock.calls[0] as unknown as [string, { p_receipt: { status: string } }];
    expect(args.p_receipt.status).toBe("pending_review");
  });
});

// La lógica de import_receipt_json y de la despensa vive en SQL, que estos tests no ejecutan
// (no hay base de datos en vitest). Estas comprobaciones estáticas sobre la migración evitan
// que una edición futura rompa las garantías sin que salte ninguna alarma.
describe("contrato de las migraciones 0019/0020", () => {
  const migrations = path.resolve(__dirname, "../../supabase/migrations");
  // La despensa vive en 0019; import_receipt_json vigente (con PDF) en 0020.
  const sql = readFileSync(path.join(migrations, "0019_receipt_json_import.sql"), "utf-8");
  const sql20 = readFileSync(path.join(migrations, "0020_receipt_import_pdf.sql"), "utf-8");
  const importFn = sql20.slice(sql20.indexOf("create function public.import_receipt_json"));

  it("la importación fija el estado pending_review en SQL y no toca inventario ni intérprete", () => {
    expect(importFn).toMatch(/'pending_review'/);
    expect(importFn).not.toMatch(/inventory_events/);
    expect(importFn).not.toMatch(/submit_interpreter_proposal|product_aliases|canonical_products/);
  });

  it("es SECURITY INVOKER y comprueba la pertenencia a la casa", () => {
    expect(importFn).toMatch(/security invoker/);
    expect(importFn).toMatch(/get_my_home_ids\(\)/);
    expect(importFn).toMatch(/errcode = '42501'/);
  });

  it("el PDF solo puede colgar de la carpeta de la propia casa", () => {
    expect(importFn).toMatch(/p_image_path text default null/);
    expect(importFn).toMatch(/left\(v_image_path, length\(p_home_id::text\) \+ 1\) <> p_home_id::text \|\| '\/'/);
    expect(importFn).toMatch(/invalid_image_path/);
    expect(sql20).toMatch(/drop function if exists public\.import_receipt_json\(uuid, jsonb, jsonb\)/);
  });

  it("detecta duplicados por mensaje, hash y supermercado + nº de ticket", () => {
    expect(importFn).toMatch(/'provider_message_id'/);
    expect(importFn).toMatch(/'document_hash'/);
    expect(importFn).toMatch(/'receipt_number'/);
  });

  it("la despensa solo cuenta tickets confirmados", () => {
    const pantry = sql.slice(
      sql.indexOf("create function public.get_home_pantry"),
      sql.indexOf("-- 6. import_receipt_json")
    );
    expect(pantry.match(/r\.status = 'reviewed'/g)?.length).toBe(2);
  });
});
