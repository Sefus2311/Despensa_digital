import { notFound } from "next/navigation";
import { DictionaryEditor } from "@/components/admin/dictionary/DictionaryEditor";
import { isAdmin } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { fetchDictionaryPage } from "./actions";

// Editor del Diccionario: exclusivamente admin (sección 1 del encargo, más
// estricto que el resto de /admin/interpreter*, que admite delegate). El
// gate real está en el propio SQL (admin_search_dictionary,
// merge_canonical_products...) -- este notFound() es solo para no exponer
// ni la ruta a quien no la necesita, igual que /admin/users o /admin/audit.
export default async function AdminDictionaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!(await isAdmin())) {
    notFound();
  }

  const params = await searchParams;
  const supabase = await createClient();

  const [data, { data: retailerRows }] = await Promise.all([
    fetchDictionaryPage(params),
    // Misma fuente que el selector SUPERMERCADO de /admin/interpreter (0017).
    supabase.rpc("list_supermarkets"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Editor del Diccionario</h1>
        <p className="text-[15px] text-[var(--color-muted)]">
          Conocimiento ya aprobado del intérprete (no la cola de propuestas pendientes de{" "}
          <span className="whitespace-nowrap">/admin/interpreter</span>).
        </p>
      </header>

      <DictionaryEditor initialData={data} retailers={(retailerRows ?? []) as string[]} initialParams={params} />
    </div>
  );
}
