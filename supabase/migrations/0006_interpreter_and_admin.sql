-- ============================================================================
-- Intérprete global de productos + funciones reales de administración
-- ============================================================================
-- Construye sobre 0005_system_roles.sql. Introduce el modelo de datos del
-- intérprete (canonical_products / retailer_products / product_aliases /
-- interpreter_proposals) y las funciones SECURITY DEFINER que sostienen el
-- panel de administración: listar/buscar usuarios, cambiar roles (ya
-- existían), moderar propuestas (aprobar/editar+aprobar/rechazar), resolver
-- conflictos, editar conocimiento global y ver métricas.
--
-- Principio que se mantiene de 0005: system_role es ortogonal a home_id.
-- Ninguna función de este fichero concede acceso a home_members, receipts,
-- receipt_items ni inventory_events -- siguen protegidos exclusivamente por
-- get_my_home_ids(). Un admin que llame a admin_list_users() o
-- admin_get_metrics() no obtiene ni un byte de datos de ninguna Casa.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Extensiones y normalización de texto
-- ----------------------------------------------------------------------------
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- unaccent() es STABLE (depende del diccionario de búsqueda de texto activo),
-- por lo que no puede usarse tal cual en una columna generada ni en un índice
-- funcional. Fijar explícitamente el diccionario 'unaccent' la hace
-- determinista y permite envolverla en una función IMMUTABLE (patrón estándar
-- de Postgres/Supabase para este caso).
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$
  select unaccent('unaccent', $1);
$$;

-- Normalización compartida por todo el intérprete: minúsculas, sin acentos,
-- espacios colapsados y recortados. Se usa tanto en columnas generadas
-- (para poder indexar y hacer UNIQUE) como en las funciones de matching de
-- abajo. El nombre "bonito" (canonical_name, raw_name...) se conserva
-- siempre tal cual para mostrarlo al usuario; sólo se normaliza para
-- comparar/deduplicar.
create or replace function public.normalize_product_text(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(regexp_replace(lower(public.immutable_unaccent(coalesce(p_text, ''))), '\s+', ' ', 'g'));
$$;

-- ----------------------------------------------------------------------------
-- 1. Modelo de datos del intérprete
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'proposal_status') then
    create type public.proposal_status as enum ('pending', 'approved', 'rejected', 'conflict');
  end if;
end $$;

-- canonical_products: producto genérico ("Yogur griego natural").
create table if not exists public.canonical_products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text generated always as (public.normalize_product_text(canonical_name)) stored,
  category text,
  default_unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists canonical_products_normalized_name_key
  on public.canonical_products (normalized_name);
create index if not exists canonical_products_normalized_name_trgm_idx
  on public.canonical_products using gin (normalized_name gin_trgm_ops);

-- retailer_products: producto comercial concreto de una tienda
-- ("Yogur griego natural Hacendado 6x125g" en Mercadona).
create table if not exists public.retailer_products (
  id uuid primary key default gen_random_uuid(),
  canonical_product_id uuid not null references public.canonical_products(id) on delete cascade,
  retailer text not null,
  brand text,
  commercial_name text not null default '',
  normalized_commercial_name text generated always as (public.normalize_product_text(commercial_name)) stored,
  package_quantity numeric(10, 3),
  package_unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists retailer_products_dedup_key
  on public.retailer_products (canonical_product_id, retailer, normalized_commercial_name);
create index if not exists retailer_products_canonical_product_id_idx
  on public.retailer_products (canonical_product_id);
create index if not exists retailer_products_retailer_idx on public.retailer_products (retailer);

-- product_aliases: conocimiento aprobado y global. A lo sumo un alias activo
-- por (retailer, normalized_raw_name) -- ver índice único abajo.
create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  raw_name text not null,
  normalized_raw_name text generated always as (public.normalize_product_text(raw_name)) stored,
  retailer_product_id uuid not null references public.retailer_products(id) on delete cascade,
  confidence_score numeric(4, 3) check (confidence_score is null or confidence_score between 0 and 1),
  times_seen integer not null default 1,
  times_confirmed integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_aliases_retailer_raw_key
  on public.product_aliases (retailer, normalized_raw_name);
create index if not exists product_aliases_retailer_product_id_idx
  on public.product_aliases (retailer_product_id);

-- interpreter_proposals: conocimiento pendiente de revisión (IA, usuarios o
-- correcciones). Los usuarios normales SOLO escriben aquí (nunca en
-- product_aliases directamente); delegate/admin moderan.
create table if not exists public.interpreter_proposals (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  raw_name text not null,
  normalized_raw_name text generated always as (public.normalize_product_text(raw_name)) stored,
  proposed_canonical_name text not null,
  proposed_brand text,
  proposed_category text,
  proposed_quantity numeric(10, 3),
  proposed_unit text,
  proposed_retailer_product_id uuid references public.retailer_products(id) on delete set null,
  ai_confidence numeric(4, 3) check (ai_confidence is null or ai_confidence between 0 and 1),
  user_confirmations integer not null default 0,
  user_conflicts integer not null default 0,
  submitted_by uuid references auth.users(id) on delete set null,
  status public.proposal_status not null default 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interpreter_proposals_key_status_idx
  on public.interpreter_proposals (retailer, normalized_raw_name, status);
create index if not exists interpreter_proposals_status_idx on public.interpreter_proposals (status);
create index if not exists interpreter_proposals_created_at_idx on public.interpreter_proposals (created_at);
create index if not exists interpreter_proposals_submitted_by_idx on public.interpreter_proposals (submitted_by);

-- ----------------------------------------------------------------------------
-- 2. RLS: lectura amplia (autenticado) para conocimiento aprobado,
-- escritura siempre a través de las funciones SECURITY DEFINER de la
-- sección 3 -- ningún INSERT/UPDATE/DELETE directo desde el cliente, mismo
-- patrón que homes/home_invitations.
-- ----------------------------------------------------------------------------
alter table public.canonical_products enable row level security;
alter table public.retailer_products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.interpreter_proposals enable row level security;

create policy "canonical_products_select_authenticated" on public.canonical_products
  for select using (auth.role() = 'authenticated');
create policy "retailer_products_select_authenticated" on public.retailer_products
  for select using (auth.role() = 'authenticated');
create policy "product_aliases_select_authenticated" on public.product_aliases
  for select using (auth.role() = 'authenticated');

-- interpreter_proposals: delegate/admin ven todas (para moderar); un user
-- normal sólo ve las que él mismo ha propuesto.
create policy "interpreter_proposals_select_moderator_or_own" on public.interpreter_proposals
  for select using (
    public.get_my_system_role() in ('admin', 'delegate')
    or submitted_by = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 3. Funciones de administración de usuarios (listado + métricas)
-- ----------------------------------------------------------------------------
-- admin_list_users(): único camino para listar/buscar usuarios -- evita abrir
-- una política RLS de "profiles_select_admin" de alcance amplio; el propio
-- backend SQL exige system_role = 'admin'.
create or replace function public.admin_list_users(
  p_search text default null,
  p_role public.system_role default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  display_name text,
  system_role public.system_role,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  if public.get_my_system_role() is distinct from 'admin' then
    raise exception 'Solo un administrador puede listar usuarios';
  end if;

  return query
  select p.id, p.email, p.display_name, p.system_role, p.created_at,
         au.email_confirmed_at, au.banned_until
  from public.profiles p
  join auth.users au on au.id = p.id
  where (p_search is null or trim(p_search) = ''
         or p.email ilike '%' || trim(p_search) || '%'
         or coalesce(p.display_name, '') ilike '%' || trim(p_search) || '%')
    and (p_role is null or p.system_role = p_role)
  order by p.created_at desc
  limit greatest(least(coalesce(p_limit, 50), 200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- admin_get_metrics(): métricas operativas básicas para el dashboard /admin.
-- Deliberadamente no toca home_members/receipts/etc.
create or replace function public.admin_get_metrics()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if public.get_my_system_role() is distinct from 'admin' then
    raise exception 'Solo un administrador puede consultar métricas';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_users_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'delegates', (select count(*) from public.profiles where system_role = 'delegate'),
    'admins', (select count(*) from public.profiles where system_role = 'admin'),
    'pending_proposals', (select count(*) from public.interpreter_proposals where status = 'pending'),
    'open_conflicts', (
      select count(*) from (
        select distinct retailer, normalized_raw_name
        from public.interpreter_proposals
        where status = 'conflict'
      ) c
    ),
    'approved_aliases', (select count(*) from public.product_aliases where active),
    'canonical_products', (select count(*) from public.canonical_products),
    'retailer_products', (select count(*) from public.retailer_products),
    'proposals_approved_pct', (
      select case when count(*) filter (where status in ('approved', 'rejected')) = 0 then null
        else round(100.0 * count(*) filter (where status = 'approved')
                    / count(*) filter (where status in ('approved', 'rejected')), 1)
      end
      from public.interpreter_proposals
    ),
    'proposals_rejected_pct', (
      select case when count(*) filter (where status in ('approved', 'rejected')) = 0 then null
        else round(100.0 * count(*) filter (where status = 'rejected')
                    / count(*) filter (where status in ('approved', 'rejected')), 1)
      end
      from public.interpreter_proposals
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Intérprete: proponer (cualquier usuario autenticado)
-- ----------------------------------------------------------------------------
-- submit_interpreter_proposal(): único camino de escritura para un `user`.
-- Aplica una regla simple de coincidencia/conflicto sobre la clave
-- (retailer, normalized_raw_name):
--   1. si ya hay un alias APROBADO para esa clave y coincide -> sólo
--      confirma (incrementa contadores), no crea una propuesta nueva;
--   2. si ya hay un alias aprobado pero NO coincide -> nueva propuesta en
--      conflicto con el conocimiento existente;
--   3. si ya hay una propuesta pendiente/conflictiva igual -> la confirma;
--   4. si ya hay una propuesta pendiente distinta -> ambas pasan a
--      'conflict';
--   5. si no hay nada para esa clave -> propuesta 'pending' nueva.
-- Es una heurística deliberadamente simple (ver docs/INTERPRETER_ARCHITECTURE.md);
-- la resolución real la hace siempre una persona (delegate/admin).
create or replace function public.submit_interpreter_proposal(
  p_retailer text,
  p_raw_name text,
  p_proposed_canonical_name text,
  p_proposed_brand text default null,
  p_proposed_category text default null,
  p_proposed_quantity numeric default null,
  p_proposed_unit text default null,
  p_ai_confidence numeric default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_retailer text := trim(coalesce(p_retailer, ''));
  v_raw_name text := trim(coalesce(p_raw_name, ''));
  v_normalized_raw text;
  v_normalized_proposed text;
  v_alias public.product_aliases%rowtype;
  v_alias_canonical_norm text;
  v_match_id uuid;
  v_has_other boolean;
  v_result_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if v_retailer = '' or v_raw_name = '' or trim(coalesce(p_proposed_canonical_name, '')) = '' then
    raise exception 'Faltan datos obligatorios de la propuesta (retailer, raw_name, proposed_canonical_name)';
  end if;

  v_normalized_raw := public.normalize_product_text(v_raw_name);
  v_normalized_proposed := public.normalize_product_text(p_proposed_canonical_name);

  select * into v_alias
  from public.product_aliases
  where retailer = v_retailer and normalized_raw_name = v_normalized_raw and active
  limit 1;

  if v_alias.id is not null then
    select public.normalize_product_text(cp.canonical_name) into v_alias_canonical_norm
    from public.retailer_products rp
    join public.canonical_products cp on cp.id = rp.canonical_product_id
    where rp.id = v_alias.retailer_product_id;

    if v_alias_canonical_norm = v_normalized_proposed then
      update public.product_aliases
      set times_seen = times_seen + 1, times_confirmed = times_confirmed + 1, updated_at = now()
      where id = v_alias.id;
      return null;
    else
      insert into public.interpreter_proposals (
        retailer, raw_name, proposed_canonical_name, proposed_brand, proposed_category,
        proposed_quantity, proposed_unit, ai_confidence, submitted_by, status, user_conflicts
      ) values (
        v_retailer, v_raw_name, p_proposed_canonical_name, p_proposed_brand, p_proposed_category,
        p_proposed_quantity, p_proposed_unit, p_ai_confidence, auth.uid(), 'conflict', 1
      ) returning id into v_result_id;
      return v_result_id;
    end if;
  end if;

  select id into v_match_id
  from public.interpreter_proposals
  where retailer = v_retailer
    and normalized_raw_name = v_normalized_raw
    and status in ('pending', 'conflict')
    and public.normalize_product_text(proposed_canonical_name) = v_normalized_proposed
  limit 1;

  if v_match_id is not null then
    update public.interpreter_proposals
    set user_confirmations = user_confirmations + 1, updated_at = now()
    where id = v_match_id;
    return v_match_id;
  end if;

  select exists (
    select 1 from public.interpreter_proposals
    where retailer = v_retailer and normalized_raw_name = v_normalized_raw and status in ('pending', 'conflict')
  ) into v_has_other;

  if v_has_other then
    update public.interpreter_proposals
    set status = 'conflict', user_conflicts = user_conflicts + 1, updated_at = now()
    where retailer = v_retailer and normalized_raw_name = v_normalized_raw and status = 'pending';

    insert into public.interpreter_proposals (
      retailer, raw_name, proposed_canonical_name, proposed_brand, proposed_category,
      proposed_quantity, proposed_unit, ai_confidence, submitted_by, status, user_conflicts
    ) values (
      v_retailer, v_raw_name, p_proposed_canonical_name, p_proposed_brand, p_proposed_category,
      p_proposed_quantity, p_proposed_unit, p_ai_confidence, auth.uid(), 'conflict', 1
    ) returning id into v_result_id;
    return v_result_id;
  end if;

  insert into public.interpreter_proposals (
    retailer, raw_name, proposed_canonical_name, proposed_brand, proposed_category,
    proposed_quantity, proposed_unit, ai_confidence, submitted_by, status, user_confirmations
  ) values (
    v_retailer, v_raw_name, p_proposed_canonical_name, p_proposed_brand, p_proposed_category,
    p_proposed_quantity, p_proposed_unit, p_ai_confidence, auth.uid(), 'pending', 1
  ) returning id into v_result_id;

  return v_result_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Intérprete: moderación (delegate/admin)
-- ----------------------------------------------------------------------------
-- approve_interpreter_proposal(): aprueba (o edita+aprueba, si se pasa algún
-- p_override_*) una propuesta. Transaccional (una función = una transacción
-- implícita: si algo falla, Postgres revierte todo, sin estados parciales).
-- También sirve para resolver conflictos: cualquier otra propuesta
-- pendiente/conflictiva que comparta (retailer, normalized_raw_name) queda
-- automáticamente rechazada como duplicada.
create or replace function public.approve_interpreter_proposal(
  p_proposal_id uuid,
  p_override_canonical_name text default null,
  p_override_brand text default null,
  p_override_category text default null,
  p_override_quantity numeric default null,
  p_override_unit text default null,
  p_retailer_product_id uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.system_role;
  v_proposal public.interpreter_proposals%rowtype;
  v_canonical_id uuid;
  v_retailer_product_id uuid;
  v_alias_id uuid;
  v_final_canonical_name text;
  v_final_brand text;
  v_final_category text;
  v_final_quantity numeric;
  v_final_unit text;
  v_edited boolean;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado para moderar el intérprete';
  end if;

  select * into v_proposal from public.interpreter_proposals where id = p_proposal_id;
  if v_proposal.id is null then
    raise exception 'Propuesta no encontrada';
  end if;
  if v_proposal.status not in ('pending', 'conflict') then
    raise exception 'La propuesta ya ha sido revisada';
  end if;

  v_final_canonical_name := coalesce(p_override_canonical_name, v_proposal.proposed_canonical_name);
  v_final_brand := coalesce(p_override_brand, v_proposal.proposed_brand);
  v_final_category := coalesce(p_override_category, v_proposal.proposed_category);
  v_final_quantity := coalesce(p_override_quantity, v_proposal.proposed_quantity);
  v_final_unit := coalesce(p_override_unit, v_proposal.proposed_unit);
  v_edited := p_override_canonical_name is not null or p_override_brand is not null
    or p_override_category is not null or p_override_quantity is not null or p_override_unit is not null;

  if p_retailer_product_id is not null then
    select id into v_retailer_product_id from public.retailer_products where id = p_retailer_product_id;
    if v_retailer_product_id is null then
      raise exception 'El producto de tienda indicado no existe';
    end if;
  else
    if trim(coalesce(v_final_canonical_name, '')) = '' then
      raise exception 'Falta el nombre canónico del producto';
    end if;

    insert into public.canonical_products (canonical_name, category, default_unit)
    values (trim(v_final_canonical_name), v_final_category, v_final_unit)
    on conflict (normalized_name) do update
      set category = coalesce(public.canonical_products.category, excluded.category),
          default_unit = coalesce(public.canonical_products.default_unit, excluded.default_unit),
          updated_at = now()
    returning id into v_canonical_id;

    insert into public.retailer_products (
      canonical_product_id, retailer, brand, commercial_name, package_quantity, package_unit
    )
    values (
      v_canonical_id, v_proposal.retailer, v_final_brand,
      coalesce(nullif(trim(v_final_canonical_name), ''), v_proposal.raw_name),
      v_final_quantity, v_final_unit
    )
    on conflict (canonical_product_id, retailer, normalized_commercial_name) do update
      set brand = coalesce(excluded.brand, public.retailer_products.brand),
          package_quantity = coalesce(excluded.package_quantity, public.retailer_products.package_quantity),
          package_unit = coalesce(excluded.package_unit, public.retailer_products.package_unit),
          updated_at = now()
    returning id into v_retailer_product_id;
  end if;

  insert into public.product_aliases (
    retailer, raw_name, retailer_product_id, confidence_score, times_seen, times_confirmed
  )
  values (
    v_proposal.retailer, v_proposal.raw_name, v_retailer_product_id,
    v_proposal.ai_confidence, greatest(v_proposal.user_confirmations, 1), greatest(v_proposal.user_confirmations, 1)
  )
  on conflict (retailer, normalized_raw_name) do update
    set retailer_product_id = excluded.retailer_product_id,
        confidence_score = coalesce(excluded.confidence_score, public.product_aliases.confidence_score),
        times_seen = public.product_aliases.times_seen + 1,
        times_confirmed = public.product_aliases.times_confirmed + 1,
        active = true,
        updated_at = now()
  returning id into v_alias_id;

  update public.interpreter_proposals
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      proposed_canonical_name = v_final_canonical_name,
      proposed_brand = v_final_brand,
      proposed_category = v_final_category,
      proposed_quantity = v_final_quantity,
      proposed_unit = v_final_unit,
      proposed_retailer_product_id = v_retailer_product_id,
      updated_at = now()
  where id = p_proposal_id;

  -- Resuelve el conflicto: cualquier otra propuesta de la misma clave queda
  -- rechazada como duplicada, ya que esta aprobación fija la interpretación.
  update public.interpreter_proposals
  set status = 'rejected',
      rejection_reason = 'conflicto_resuelto',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id <> p_proposal_id
    and retailer = v_proposal.retailer
    and normalized_raw_name = v_proposal.normalized_raw_name
    and status in ('pending', 'conflict');

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    case when v_edited then 'interpreter_proposal_edited_and_approved' else 'interpreter_proposal_approved' end,
    'interpreter_proposal',
    p_proposal_id,
    jsonb_build_object(
      'retailer', v_proposal.retailer,
      'raw_name', v_proposal.raw_name,
      'canonical_name', v_final_canonical_name,
      'retailer_product_id', v_retailer_product_id,
      'product_alias_id', v_alias_id
    )
  );

  return v_alias_id;
end;
$$;

-- reject_interpreter_proposal(): rechazo simple, sin tocar conocimiento global.
create or replace function public.reject_interpreter_proposal(
  p_proposal_id uuid,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.system_role;
  v_proposal public.interpreter_proposals%rowtype;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado para moderar el intérprete';
  end if;

  select * into v_proposal from public.interpreter_proposals where id = p_proposal_id;
  if v_proposal.id is null then
    raise exception 'Propuesta no encontrada';
  end if;
  if v_proposal.status not in ('pending', 'conflict') then
    raise exception 'La propuesta ya ha sido revisada';
  end if;

  update public.interpreter_proposals
  set status = 'rejected',
      rejection_reason = p_rejection_reason,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_proposal_id;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'interpreter_proposal_rejected', 'interpreter_proposal', p_proposal_id,
    jsonb_build_object('rejection_reason', p_rejection_reason, 'retailer', v_proposal.retailer, 'raw_name', v_proposal.raw_name)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Intérprete: edición de conocimiento ya aprobado (delegate/admin)
-- ----------------------------------------------------------------------------
create or replace function public.update_canonical_product(
  p_id uuid,
  p_canonical_name text,
  p_category text default null,
  p_default_unit text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.system_role;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  if trim(coalesce(p_canonical_name, '')) = '' then
    raise exception 'El nombre no puede estar vacío';
  end if;

  update public.canonical_products
  set canonical_name = trim(p_canonical_name), category = p_category, default_unit = p_default_unit, updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Producto canónico no encontrado';
  end if;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'canonical_product_edited', 'canonical_product', p_id,
    jsonb_build_object('canonical_name', p_canonical_name, 'category', p_category, 'default_unit', p_default_unit));
end;
$$;

create or replace function public.update_retailer_product(
  p_id uuid,
  p_brand text default null,
  p_commercial_name text default null,
  p_package_quantity numeric default null,
  p_package_unit text default null,
  p_canonical_product_id uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.system_role;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  update public.retailer_products
  set brand = coalesce(p_brand, brand),
      commercial_name = coalesce(nullif(trim(p_commercial_name), ''), commercial_name),
      package_quantity = coalesce(p_package_quantity, package_quantity),
      package_unit = coalesce(p_package_unit, package_unit),
      canonical_product_id = coalesce(p_canonical_product_id, canonical_product_id),
      updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Producto de tienda no encontrado';
  end if;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'retailer_product_edited', 'retailer_product', p_id,
    jsonb_build_object('brand', p_brand, 'commercial_name', p_commercial_name, 'canonical_product_id', p_canonical_product_id));
end;
$$;

-- update_product_alias(): corregir a qué retailer_product apunta un alias, o
-- desactivarlo. Deliberadamente no hay delete_* -- "preferir editar,
-- desactivar o fusionar frente a borrar datos históricos" (sección 14).
create or replace function public.update_product_alias(
  p_id uuid,
  p_retailer_product_id uuid default null,
  p_active boolean default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.system_role;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  update public.product_aliases
  set retailer_product_id = coalesce(p_retailer_product_id, retailer_product_id),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Alias no encontrado';
  end if;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'product_alias_edited', 'product_alias', p_id,
    jsonb_build_object('retailer_product_id', p_retailer_product_id, 'active', p_active));
end;
$$;

-- find_similar_canonical_products(): ayuda a evitar duplicados por variantes
-- ortográficas ("Yogur" vs "Yogurt") que la normalización exacta no atrapa.
-- Lectura, sin comprobación de rol -- útil también para cualquier usuario
-- que en el futuro cree una propuesta y quiera evitar duplicar conocimiento.
create or replace function public.find_similar_canonical_products(
  p_name text,
  p_limit integer default 5
)
returns table (id uuid, canonical_name text, category text, similarity real)
language sql
security definer
set search_path = public
stable
as $$
  select cp.id, cp.canonical_name, cp.category,
         similarity(cp.normalized_name, public.normalize_product_text(p_name)) as similarity
  from public.canonical_products cp
  where cp.normalized_name % public.normalize_product_text(p_name)
  order by similarity desc
  limit greatest(least(coalesce(p_limit, 5), 20), 1);
$$;

commit;
