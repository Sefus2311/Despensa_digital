-- ============================================================================
-- Fotografías de receta (hasta 3 por receta, la primera es la principal)
-- ============================================================================
-- receta_fotos: una fila por fotografía, ordenada por `orden` -- la principal
-- es siempre la de `orden` más bajo (sin columna `is_principal`: al borrar la
-- principal, la siguiente pasa a serlo automáticamente sin renumerar nada,
-- sección 3 del encargo). No hay reordenación (drag&drop) todavía, así que no
-- hace falta una restricción unique(receta_id, orden); un `order by orden,
-- created_at` basta para desempatar.
--
-- Mismo patrón de RLS que receta_ingredientes/receta_pasos (0015): el select
-- hereda la visibilidad de `recetas` vía exists(), la escritura es solo para
-- el autor de la receta.
--
-- Storage: bucket privado nuevo "recetas" (no se reutiliza "receipts" --
-- las rutas de receipts están ancladas a home_id, y una receta es del
-- autor, no de una Casa). Ruta: {autor_id}/{receta_id}/{uuid}.{ext}. El
-- INSERT/DELETE solo comprueba que el usuario escribe en su propia carpeta
-- (autor_id = auth.uid()) -- deliberadamente SIN comprobar que ya existe la
-- fila en `recetas`, porque las fotos de una receta nueva se suben a
-- Storage antes de guardar la receta (el id de receta se genera en el
-- cliente y se reutiliza como id real al crearla, ver
-- app/(app)/recetas/actions.ts). El SELECT sí exige que la receta exista y
-- sea visible (propia, o pública y activa), igual que el resto del módulo.
-- ============================================================================

begin;

create table public.receta_fotos (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete cascade,
  storage_path text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index receta_fotos_receta_id_idx on public.receta_fotos (receta_id, orden, created_at);

alter table public.receta_fotos enable row level security;

create policy "receta_fotos_select_via_receta" on public.receta_fotos
  for select using (exists (select 1 from public.recetas r where r.id = receta_fotos.receta_id));
create policy "receta_fotos_insert_own" on public.receta_fotos
  for insert with check (receta_id in (select id from public.recetas where autor_id = auth.uid()));
create policy "receta_fotos_delete_own" on public.receta_fotos
  for delete using (receta_id in (select id from public.recetas where autor_id = auth.uid()));

-- Red de seguridad: máximo 3 fotos por receta, aunque el cliente falle en
-- comprobarlo (la app también lo valida antes de subir, para dar un
-- mensaje claro en vez de este error).
create or replace function public.enforce_receta_fotos_max()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.receta_fotos where receta_id = new.receta_id;
  if v_count >= 3 then
    raise exception 'Esta receta ya tiene el máximo de 3 fotografías';
  end if;
  return new;
end;
$$;

create trigger receta_fotos_max_check
  before insert on public.receta_fotos
  for each row execute function public.enforce_receta_fotos_max();

-- ----------------------------------------------------------------------------
-- Storage: bucket privado "recetas"
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('recetas', 'recetas', false)
on conflict (id) do nothing;

create policy "recetas_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'recetas'
    and exists (
      select 1 from public.recetas r
      where r.id::text = (storage.foldername(name))[2]
        and (
          r.autor_id = auth.uid()
          or (r.estado = 'activa' and r.visibilidad = 'publica' and auth.role() = 'authenticated')
        )
    )
  );

create policy "recetas_storage_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'recetas'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  );

create policy "recetas_storage_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'recetas'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  );

commit;
