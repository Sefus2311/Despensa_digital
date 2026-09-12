-- ============================================================================
-- Migración inicial V0.1 — smart-pantry-mvp
-- Households, perfiles, tickets, productos, líneas de ticket, eventos de
-- inventario, y Row Level Security.
-- ============================================================================

-- Extensión para gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- households
-- ----------------------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- household_members
-- ----------------------------------------------------------------------------
create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create index if not exists household_members_user_id_idx on public.household_members(user_id);
create index if not exists household_members_household_id_idx on public.household_members(household_id);

-- ----------------------------------------------------------------------------
-- products (catálogo compartido, no ligado a household)
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  brand text,
  category text,
  default_unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- receipts
-- ----------------------------------------------------------------------------
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text,
  purchase_date date,
  total_amount numeric(10, 2),
  image_path text not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'reviewed', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receipts_household_id_idx on public.receipts(household_id);

-- ----------------------------------------------------------------------------
-- receipt_items
-- ----------------------------------------------------------------------------
create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  raw_name text not null,
  product_id uuid references public.products(id) on delete set null,
  quantity numeric(10, 3) not null default 1,
  unit text,
  unit_price numeric(10, 2),
  total_price numeric(10, 2),
  created_at timestamptz not null default now()
);

create index if not exists receipt_items_receipt_id_idx on public.receipt_items(receipt_id);
create index if not exists receipt_items_product_id_idx on public.receipt_items(product_id);

-- ----------------------------------------------------------------------------
-- inventory_events (mínimamente usada en V0.1, preparada para V0.2+)
-- ----------------------------------------------------------------------------
create table if not exists public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  event_type text not null check (event_type in ('purchase', 'correction', 'consumed', 'adjustment')),
  quantity numeric(10, 3) not null,
  event_date date not null default current_date,
  source text,
  receipt_item_id uuid references public.receipt_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_events_household_id_idx on public.inventory_events(household_id);
create index if not exists inventory_events_product_id_idx on public.inventory_events(product_id);

-- ============================================================================
-- Trigger: crear profile + household + household_member al registrarse
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name');

  insert into public.households (name)
  values (coalesce(new.raw_user_meta_data ->> 'display_name', new.email) || ' - Hogar')
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.inventory_events enable row level security;
-- products: catálogo de lectura compartida, sin datos privados -> RLS activada
-- pero con lectura abierta a cualquier usuario autenticado.
alter table public.products enable row level security;

-- Helper: households a los que pertenece el usuario autenticado
create or replace view public.my_household_ids as
  select household_id from public.household_members where user_id = auth.uid();

-- profiles: cada usuario ve y edita solo su propio perfil
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- households: visible solo si el usuario es miembro
create policy "households_select_member" on public.households
  for select using (id in (select household_id from public.household_members where user_id = auth.uid()));
create policy "households_update_member" on public.households
  for update using (id in (select household_id from public.household_members where user_id = auth.uid()));

-- household_members: el usuario ve las membresías de sus propios households
create policy "household_members_select_own" on public.household_members
  for select using (
    user_id = auth.uid()
    or household_id in (select household_id from public.household_members where user_id = auth.uid())
  );

-- receipts: CRUD solo sobre households del usuario
create policy "receipts_select_member" on public.receipts
  for select using (household_id in (select household_id from public.household_members where user_id = auth.uid()));
create policy "receipts_insert_member" on public.receipts
  for insert with check (household_id in (select household_id from public.household_members where user_id = auth.uid()));
create policy "receipts_update_member" on public.receipts
  for update using (household_id in (select household_id from public.household_members where user_id = auth.uid()));
create policy "receipts_delete_member" on public.receipts
  for delete using (household_id in (select household_id from public.household_members where user_id = auth.uid()));

-- receipt_items: acceso a través del receipt padre
create policy "receipt_items_select_member" on public.receipt_items
  for select using (
    receipt_id in (
      select id from public.receipts
      where household_id in (select household_id from public.household_members where user_id = auth.uid())
    )
  );
create policy "receipt_items_insert_member" on public.receipt_items
  for insert with check (
    receipt_id in (
      select id from public.receipts
      where household_id in (select household_id from public.household_members where user_id = auth.uid())
    )
  );
create policy "receipt_items_update_member" on public.receipt_items
  for update using (
    receipt_id in (
      select id from public.receipts
      where household_id in (select household_id from public.household_members where user_id = auth.uid())
    )
  );
create policy "receipt_items_delete_member" on public.receipt_items
  for delete using (
    receipt_id in (
      select id from public.receipts
      where household_id in (select household_id from public.household_members where user_id = auth.uid())
    )
  );

-- inventory_events: acceso por household
create policy "inventory_events_select_member" on public.inventory_events
  for select using (household_id in (select household_id from public.household_members where user_id = auth.uid()));
create policy "inventory_events_insert_member" on public.inventory_events
  for insert with check (household_id in (select household_id from public.household_members where user_id = auth.uid()));

-- products: catálogo compartido, lectura para cualquier usuario autenticado,
-- inserción también permitida (para poder ir creando productos nuevos al
-- introducir líneas de ticket manualmente).
create policy "products_select_authenticated" on public.products
  for select using (auth.role() = 'authenticated');
create policy "products_insert_authenticated" on public.products
  for insert with check (auth.role() = 'authenticated');

-- ============================================================================
-- Storage: bucket privado "receipts"
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Los objetos se guardan bajo la ruta {household_id}/{filename}.
-- Solo miembros de ese household pueden leer/escribir sus propios tickets.
create policy "receipts_storage_select_member"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

create policy "receipts_storage_insert_member"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

create policy "receipts_storage_delete_member"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );
