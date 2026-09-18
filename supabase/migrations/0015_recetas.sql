-- ============================================================================
-- Recetas — Fase 1
-- ============================================================================
-- Módulo de recetas: receta → comprobar ingredientes contra la despensa de
-- la Casa activa → detectar faltantes → añadir a la lista de la compra →
-- consultar pasos y cocinar. Ver docs/RECIPES_ARCHITECTURE.md para el
-- detalle de las decisiones (por qué `recetas` no lleva home_id, por qué
-- `amigos` no aporta visibilidad todavía, integración con la lista de la
-- compra).
--
-- No existía ningún sistema de "lista de la compra" en la app (verificado
-- antes de escribir esta migración) -- shopping_list_items es nueva, no una
-- reutilización.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Trigger genérico updated_at (no existía; recetas/shopping_list_items
-- se escriben directo por RLS desde la app, no vía RPC, así que conviene
-- no depender de que cada UPDATE se acuerde de fijarlo a mano).
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Enums.
-- ----------------------------------------------------------------------------
create type public.receta_visibilidad as enum ('privada', 'amigos', 'publica');
create type public.receta_estado as enum ('borrador', 'activa');

-- ----------------------------------------------------------------------------
-- 2. recetas. Sin home_id a propósito: una receta es del autor, no de una
-- Casa -- así puede compartirse más adelante (amigos/pública) sin arrastrar
-- la Casa en la que se creó. La comprobación de stock se hace en tiempo de
-- consulta contra la Casa activa de quien la mira, nunca contra una Casa
-- fija guardada en la receta.
-- ----------------------------------------------------------------------------
create table public.recetas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  raciones integer not null default 4 check (raciones > 0),
  tiempo_preparacion_min integer check (tiempo_preparacion_min is null or tiempo_preparacion_min >= 0),
  tiempo_coccion_min integer check (tiempo_coccion_min is null or tiempo_coccion_min >= 0),
  autor_id uuid not null references auth.users(id) on delete cascade,
  visibilidad public.receta_visibilidad not null default 'privada',
  estado public.receta_estado not null default 'borrador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recetas_autor_id_idx on public.recetas (autor_id);
-- Para el listado público ("recetas que puedo consultar"): activa + pública.
create index recetas_publicas_idx on public.recetas (visibilidad, estado) where visibilidad = 'publica';

create trigger recetas_set_updated_at
  before update on public.recetas
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. receta_ingredientes. producto_id es NULLABLE a propósito: si el
-- ingrediente no coincide con ningún canonical_products existente, la
-- receta se guarda igual (nombre_mostrado es lo único obligatorio), y ese
-- ingrediente queda sin vincular hasta que un admin cree el producto
-- canónico (ver create_canonical_product_admin más abajo y la sección
-- nueva en /admin/products). Nunca se crea un catálogo de ingredientes
-- aparte: la única referencia de producto real es canonical_products, la
-- misma que usan despensa/intérprete/tickets.
-- ----------------------------------------------------------------------------
create table public.receta_ingredientes (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete cascade,
  producto_id uuid references public.canonical_products(id) on delete set null,
  nombre_mostrado text not null,
  cantidad numeric(10, 3) check (cantidad is null or cantidad >= 0),
  unidad text,
  opcional boolean not null default false,
  control_stock boolean not null default true,
  orden integer not null default 0,
  notas text
);

create index receta_ingredientes_receta_id_idx on public.receta_ingredientes (receta_id, orden);
create index receta_ingredientes_producto_id_idx on public.receta_ingredientes (producto_id);

-- ----------------------------------------------------------------------------
-- 4. receta_pasos.
-- ----------------------------------------------------------------------------
create table public.receta_pasos (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete cascade,
  numero integer not null check (numero > 0),
  texto text not null,
  unique (receta_id, numero)
);

create index receta_pasos_receta_id_idx on public.receta_pasos (receta_id, numero);

-- ----------------------------------------------------------------------------
-- 5. shopping_list_items (nueva: no existía ningún sistema de lista de la
-- compra en la app). Home-scoped como receipts/inventory_events.
-- canonical_product_id NULLABLE por el mismo motivo que en
-- receta_ingredientes: un faltante sin producto vinculado se añade igual,
-- solo con display_name. display_name se guarda siempre (copia del nombre
-- canónico o el texto libre), para no depender de un join solo para pintar
-- la lista.
-- ----------------------------------------------------------------------------
create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  canonical_product_id uuid references public.canonical_products(id) on delete set null,
  display_name text not null,
  quantity numeric(10, 3) check (quantity is null or quantity >= 0),
  unit text,
  is_checked boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'receta')),
  source_receta_id uuid references public.recetas(id) on delete set null,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_list_items_home_id_idx on public.shopping_list_items (home_id, is_checked);

-- Evita duplicados (sección 17): una sola línea sin marcar por producto, o
-- por nombre cuando no hay producto vinculado.
create unique index shopping_list_items_home_product_unchecked_key
  on public.shopping_list_items (home_id, canonical_product_id)
  where not is_checked and canonical_product_id is not null;
create unique index shopping_list_items_home_name_unchecked_key
  on public.shopping_list_items (home_id, lower(trim(display_name)))
  where not is_checked and canonical_product_id is null;

create trigger shopping_list_items_set_updated_at
  before update on public.shopping_list_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. RLS.
-- ----------------------------------------------------------------------------
alter table public.recetas enable row level security;
alter table public.receta_ingredientes enable row level security;
alter table public.receta_pasos enable row level security;
alter table public.shopping_list_items enable row level security;

-- recetas: visible para el autor siempre; para cualquier otro usuario
-- autenticado solo si está activa Y marcada pública. "amigos" NO añade
-- visibilidad todavía (no existe sistema de relaciones entre usuarios) --
-- se comporta como privada hasta que se implemente esa resolución de
-- permisos (ver docs/RECIPES_ARCHITECTURE.md). Nunca se vuelve pública por
-- accidente: hace falta visibilidad='publica' Y estado='activa' a la vez.
create policy "recetas_select_own_or_public_active" on public.recetas
  for select using (
    autor_id = auth.uid()
    or (estado = 'activa' and visibilidad = 'publica' and auth.role() = 'authenticated')
  );
create policy "recetas_insert_own" on public.recetas
  for insert with check (autor_id = auth.uid());
create policy "recetas_update_own" on public.recetas
  for update using (autor_id = auth.uid());
create policy "recetas_delete_own" on public.recetas
  for delete using (autor_id = auth.uid());

-- receta_ingredientes/receta_pasos: el select no necesita repetir la lógica
-- de visibilidad -- el exists() ya hereda la RLS de recetas (arriba), así
-- que una fila de ingredientes/pasos es visible exactamente cuando su
-- receta lo es. Escritura solo para el autor de la receta.
create policy "receta_ingredientes_select_via_receta" on public.receta_ingredientes
  for select using (exists (select 1 from public.recetas r where r.id = receta_ingredientes.receta_id));
create policy "receta_ingredientes_insert_own" on public.receta_ingredientes
  for insert with check (receta_id in (select id from public.recetas where autor_id = auth.uid()));
create policy "receta_ingredientes_update_own" on public.receta_ingredientes
  for update using (receta_id in (select id from public.recetas where autor_id = auth.uid()));
create policy "receta_ingredientes_delete_own" on public.receta_ingredientes
  for delete using (receta_id in (select id from public.recetas where autor_id = auth.uid()));

create policy "receta_pasos_select_via_receta" on public.receta_pasos
  for select using (exists (select 1 from public.recetas r where r.id = receta_pasos.receta_id));
create policy "receta_pasos_insert_own" on public.receta_pasos
  for insert with check (receta_id in (select id from public.recetas where autor_id = auth.uid()));
create policy "receta_pasos_update_own" on public.receta_pasos
  for update using (receta_id in (select id from public.recetas where autor_id = auth.uid()));
create policy "receta_pasos_delete_own" on public.receta_pasos
  for delete using (receta_id in (select id from public.recetas where autor_id = auth.uid()));

-- shopping_list_items: mismo patrón que receipts -- solo miembros de la
-- Casa, nunca el usuario "global".
create policy "shopping_list_items_select_member" on public.shopping_list_items
  for select using (home_id in (select public.get_my_home_ids()));
create policy "shopping_list_items_insert_member" on public.shopping_list_items
  for insert with check (home_id in (select public.get_my_home_ids()));
create policy "shopping_list_items_update_member" on public.shopping_list_items
  for update using (home_id in (select public.get_my_home_ids()));
create policy "shopping_list_items_delete_member" on public.shopping_list_items
  for delete using (home_id in (select public.get_my_home_ids()));

-- ----------------------------------------------------------------------------
-- 7. add_to_shopping_list(): security invoker -- no necesita privilegios
-- elevados, la RLS de arriba ya exige pertenencia a la Casa. Fusiona con la
-- línea existente sin marcar (mismo producto, o mismo nombre si no hay
-- producto) en vez de duplicar; si las unidades no coinciden, no inventa
-- una conversión -- deja la línea existente tal cual (robusto antes que
-- preciso, mismo criterio que en despensa).
-- ----------------------------------------------------------------------------
create or replace function public.add_to_shopping_list(
  p_home_id uuid,
  p_display_name text,
  p_canonical_product_id uuid default null,
  p_quantity numeric default null,
  p_unit text default null,
  p_source text default 'manual',
  p_source_receta_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing public.shopping_list_items%rowtype;
  v_id uuid;
begin
  if trim(coalesce(p_display_name, '')) = '' then
    raise exception 'Falta el nombre del producto para la lista de la compra';
  end if;

  if p_canonical_product_id is not null then
    select * into v_existing
    from public.shopping_list_items
    where home_id = p_home_id
      and canonical_product_id = p_canonical_product_id
      and not is_checked
    limit 1;
  else
    select * into v_existing
    from public.shopping_list_items
    where home_id = p_home_id
      and canonical_product_id is null
      and lower(trim(display_name)) = lower(trim(p_display_name))
      and not is_checked
    limit 1;
  end if;

  if v_existing.id is not null then
    if v_existing.unit is null or p_unit is null or v_existing.unit = p_unit then
      update public.shopping_list_items
      set quantity = case
            when v_existing.quantity is null and p_quantity is null then null
            else coalesce(v_existing.quantity, 0) + coalesce(p_quantity, 0)
          end,
          unit = coalesce(v_existing.unit, p_unit)
      where id = v_existing.id;
    end if;
    return v_existing.id;
  end if;

  insert into public.shopping_list_items (
    home_id, canonical_product_id, display_name, quantity, unit, source, source_receta_id, added_by
  ) values (
    p_home_id, p_canonical_product_id, trim(p_display_name), p_quantity, p_unit,
    coalesce(p_source, 'manual'), p_source_receta_id, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. create_canonical_product_admin(): única vía nueva de creación directa
-- de canonical_products (antes solo se creaban vía approve_interpreter_proposal).
-- Exige delegate/admin, mismo patrón de comprobación que el resto del
-- intérprete. Resuelve el aviso de "ingrediente de receta sin producto
-- normalizado" desde /admin/products.
-- ----------------------------------------------------------------------------
create or replace function public.create_canonical_product_admin(
  p_canonical_name text,
  p_category text default null,
  p_default_unit text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.system_role;
  v_id uuid;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  if trim(coalesce(p_canonical_name, '')) = '' then
    raise exception 'El nombre no puede estar vacío';
  end if;

  insert into public.canonical_products (canonical_name, category, default_unit, updated_by)
  values (trim(p_canonical_name), public.normalize_product_category(p_category), p_default_unit, auth.uid())
  on conflict (normalized_name) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.canonical_products
    where normalized_name = public.normalize_product_text(p_canonical_name);
  end if;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'canonical_product_created', 'canonical_product', v_id,
    jsonb_build_object('canonical_name', p_canonical_name));

  return v_id;
end;
$$;

commit;
