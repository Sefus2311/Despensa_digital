-- ============================================================================
-- Fix: recursión infinita en la política RLS de household_members
-- ============================================================================
-- household_members_select_own (0001_init.sql) consulta la propia tabla
-- household_members dentro de su propia política:
--
--   household_id in (select household_id from public.household_members
--                     where user_id = auth.uid())
--
-- Postgres vuelve a aplicar la política de household_members al evaluar esa
-- subconsulta, lo que dispara una recursión infinita (error 42P17:
-- "infinite recursion detected in policy for relation household_members").
-- Esto rompe getCurrentUserAndHousehold() (lib/household.ts) y, con ello,
-- todas las páginas/acciones privadas que dependen de él.
--
-- Solución estándar: mover la subconsulta a una función SECURITY DEFINER,
-- que evalúa la consulta interna sin volver a pasar por RLS y rompe el ciclo.
create or replace function public.get_my_household_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

drop policy if exists "household_members_select_own" on public.household_members;
create policy "household_members_select_own" on public.household_members
  for select using (
    user_id = auth.uid()
    or household_id in (select public.get_my_household_ids())
  );

-- ============================================================================
-- Fix: bucket de Storage "receipts" ausente
-- ============================================================================
-- El insert de 0001_init.sql no llegó a crear el bucket en este proyecto
-- (comprobado vía API: GET /storage/v1/bucket/receipts devolvía 404).
-- Re-insertamos de forma idempotente.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
