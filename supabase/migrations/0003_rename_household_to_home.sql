-- ============================================================================
-- Household -> Home ("Casa"): la Casa pasa a ser la entidad dueña de toda la
-- información doméstica. Renombra households/household_members a homes/
-- home_members, añade profiles.default_home_id (Casa principal del usuario)
-- y homes.created_by, y prepara el modelo para que un usuario pueda
-- pertenecer a varias Casas (selector en cabecera, alta de Casas nuevas).
--
-- Los renombrados de tabla/columna son seguros: las políticas RLS,
-- constraints e índices que referencian esas columnas se actualizan solos
-- (Postgres los enlaza por atributo, no por texto). Lo único que hay que
-- reescribir a mano son las funciones (su cuerpo es texto plano) y, por
-- limpieza, los nombres de política/índice que contenían "household".
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Renombrado de tablas y columnas
-- ----------------------------------------------------------------------------
alter table public.households rename to homes;
alter table public.household_members rename to home_members;
alter table public.home_members rename column household_id to home_id;
alter table public.receipts rename column household_id to home_id;
alter table public.inventory_events rename column household_id to home_id;

alter index if exists public.household_members_user_id_idx rename to home_members_user_id_idx;
alter index if exists public.household_members_household_id_idx rename to home_members_home_id_idx;
alter index if exists public.receipts_household_id_idx rename to receipts_home_id_idx;
alter index if exists public.inventory_events_household_id_idx rename to inventory_events_home_id_idx;

-- ----------------------------------------------------------------------------
-- 2. homes.created_by (quién creó la Casa)
-- ----------------------------------------------------------------------------
alter table public.homes
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.homes h
set created_by = hm.user_id
from public.home_members hm
where hm.home_id = h.id
  and hm.role = 'owner'
  and h.created_by is null;

-- ----------------------------------------------------------------------------
-- 3. home_members.role: dejar preparado el rol "guest" (sin uso todavía)
-- ----------------------------------------------------------------------------
alter table public.home_members drop constraint if exists household_members_role_check;
alter table public.home_members
  add constraint home_members_role_check check (role in ('owner', 'member', 'guest'));

-- ----------------------------------------------------------------------------
-- 4. profiles.default_home_id: Casa principal del usuario
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists default_home_id uuid references public.homes(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 5. Backfill defensivo: cualquier usuario de auth.users sin Casa todavía
-- (no debería ocurrir -- el trigger de alta siempre crea una -- pero cubre
-- el caso de un fallo de trigger o un usuario importado manualmente).
-- ----------------------------------------------------------------------------
do $$
declare
  u record;
  new_home_id uuid;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data ->> 'display_name' as display_name
    from auth.users au
    where not exists (
      select 1 from public.home_members hm where hm.user_id = au.id
    )
  loop
    insert into public.profiles (id, email, display_name)
    values (u.id, u.email, u.display_name)
    on conflict (id) do nothing;

    insert into public.homes (name, created_by)
    values ('Mi casa', u.id)
    returning id into new_home_id;

    insert into public.home_members (home_id, user_id, role)
    values (new_home_id, u.id, 'owner');

    update public.profiles set default_home_id = new_home_id where id = u.id;
  end loop;
end $$;

-- Backfill: default_home_id para usuarios que ya tenían Casa pero ningún
-- default fijado (su Casa como owner más antigua; si no es owner de
-- ninguna, la membresía más antigua).
update public.profiles p
set default_home_id = first_home.home_id
from (
  select distinct on (user_id) user_id, home_id
  from public.home_members
  order by user_id, (role = 'owner') desc, created_at asc
) first_home
where first_home.user_id = p.id
  and p.default_home_id is null;

-- ----------------------------------------------------------------------------
-- 6. Validación: default_home_id sólo puede apuntar a una Casa del usuario
-- ----------------------------------------------------------------------------
create or replace function public.validate_profile_default_home()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.default_home_id is not null and not exists (
    select 1 from public.home_members
    where user_id = new.id and home_id = new.default_home_id
  ) then
    raise exception 'default_home_id debe ser una Casa a la que pertenece el usuario';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_validate_default_home on public.profiles;
create trigger profiles_validate_default_home
  before insert or update on public.profiles
  for each row execute procedure public.validate_profile_default_home();

-- ----------------------------------------------------------------------------
-- 7. get_my_home_ids(): sustituye a get_my_household_ids() (0002). Se usa
-- desde las políticas RLS para evitar recursión y, ahora, de forma
-- consistente en todas las tablas domésticas.
-- ----------------------------------------------------------------------------
drop policy if exists "household_members_select_own" on public.home_members;
drop function if exists public.get_my_household_ids();

create function public.get_my_home_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select home_id from public.home_members where user_id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- 8. handle_new_user(): alta automática de "Mi casa" al registrarse
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_home_id uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name');

  insert into public.homes (name, created_by)
  values ('Mi casa', new.id)
  returning id into new_home_id;

  insert into public.home_members (home_id, user_id, role)
  values (new_home_id, new.id, 'owner');

  update public.profiles set default_home_id = new_home_id where id = new.id;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. create_home(): único camino para crear una Casa adicional desde la app.
-- SECURITY DEFINER para no tener que abrir políticas INSERT directas en
-- homes/home_members (que obligarían a validar en RLS que nadie se
-- autoañada a una Casa ajena) -- mismo patrón que handle_new_user().
-- ----------------------------------------------------------------------------
create or replace function public.create_home(p_name text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_home_id uuid;
  clean_name text := trim(p_name);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if clean_name = '' then
    raise exception 'El nombre de la Casa no puede estar vacío';
  end if;

  insert into public.homes (name, created_by)
  values (clean_name, auth.uid())
  returning id into new_home_id;

  insert into public.home_members (home_id, user_id, role)
  values (new_home_id, auth.uid(), 'owner');

  return new_home_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Limpieza: vista sin uso (sustituida por get_my_home_ids())
-- ----------------------------------------------------------------------------
drop view if exists public.my_household_ids;

-- ============================================================================
-- 11. Row Level Security: políticas renombradas/reescritas
-- ============================================================================

-- homes: visible/editable solo si el usuario es miembro
drop policy if exists "households_select_member" on public.homes;
drop policy if exists "households_update_member" on public.homes;
create policy "homes_select_member" on public.homes
  for select using (id in (select public.get_my_home_ids()));
create policy "homes_update_member" on public.homes
  for update using (id in (select public.get_my_home_ids()));

-- home_members: el usuario ve las membresías de sus propias Casas
create policy "home_members_select_own" on public.home_members
  for select using (
    user_id = auth.uid()
    or home_id in (select public.get_my_home_ids())
  );

-- receipts: CRUD solo sobre Casas del usuario
drop policy if exists "receipts_select_member" on public.receipts;
drop policy if exists "receipts_insert_member" on public.receipts;
drop policy if exists "receipts_update_member" on public.receipts;
drop policy if exists "receipts_delete_member" on public.receipts;
create policy "receipts_select_member" on public.receipts
  for select using (home_id in (select public.get_my_home_ids()));
create policy "receipts_insert_member" on public.receipts
  for insert with check (home_id in (select public.get_my_home_ids()));
create policy "receipts_update_member" on public.receipts
  for update using (home_id in (select public.get_my_home_ids()));
create policy "receipts_delete_member" on public.receipts
  for delete using (home_id in (select public.get_my_home_ids()));

-- receipt_items: acceso a través del receipt padre
drop policy if exists "receipt_items_select_member" on public.receipt_items;
drop policy if exists "receipt_items_insert_member" on public.receipt_items;
drop policy if exists "receipt_items_update_member" on public.receipt_items;
drop policy if exists "receipt_items_delete_member" on public.receipt_items;
create policy "receipt_items_select_member" on public.receipt_items
  for select using (
    receipt_id in (select id from public.receipts where home_id in (select public.get_my_home_ids()))
  );
create policy "receipt_items_insert_member" on public.receipt_items
  for insert with check (
    receipt_id in (select id from public.receipts where home_id in (select public.get_my_home_ids()))
  );
create policy "receipt_items_update_member" on public.receipt_items
  for update using (
    receipt_id in (select id from public.receipts where home_id in (select public.get_my_home_ids()))
  );
create policy "receipt_items_delete_member" on public.receipt_items
  for delete using (
    receipt_id in (select id from public.receipts where home_id in (select public.get_my_home_ids()))
  );

-- inventory_events: acceso por Casa
drop policy if exists "inventory_events_select_member" on public.inventory_events;
drop policy if exists "inventory_events_insert_member" on public.inventory_events;
create policy "inventory_events_select_member" on public.inventory_events
  for select using (home_id in (select public.get_my_home_ids()));
create policy "inventory_events_insert_member" on public.inventory_events
  for insert with check (home_id in (select public.get_my_home_ids()));

-- Storage: los objetos se guardan bajo la ruta {home_id}/{filename}.
-- Solo miembros de esa Casa pueden leer/escribir sus propios tickets.
drop policy if exists "receipts_storage_select_member" on storage.objects;
drop policy if exists "receipts_storage_insert_member" on storage.objects;
drop policy if exists "receipts_storage_delete_member" on storage.objects;
create policy "receipts_storage_select_member"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (select public.get_my_home_ids())
  );
create policy "receipts_storage_insert_member"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (select public.get_my_home_ids())
  );
create policy "receipts_storage_delete_member"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (select public.get_my_home_ids())
  );

commit;
