-- ============================================================================
-- Categorías cerradas de producto + stock real (packs) en "Mi despensa"
-- ============================================================================
-- Hasta ahora `category` era texto libre en canonical_products/interpreter_
-- proposals (sin enum ni CHECK), y get_home_pantry nunca multiplicaba
-- receipt_items.quantity por retailer_products.package_quantity, así que la
-- despensa mostraba la cantidad comprada (p.ej. "1 pack") en vez del stock
-- real (p.ej. "6 unidades").
--
-- Esta migración:
--   1. Crea el enum product_category con la lista oficial de 7 categorías.
--   2. normalize_product_category(text): único punto de validación —
--      siempre devuelve una categoría válida (VARIOS si no reconoce nada),
--      nunca null. Lo reutilizan todas las funciones que escriben category.
--   3. Convierte canonical_products.category al enum, con backfill de los
--      datos semilla existentes (0007) y NOT NULL DEFAULT 'VARIOS'.
--   4. Convierte interpreter_proposals.proposed_category al enum, pero se
--      queda nullable: null sigue significando "sin categoría propuesta
--      todavía", distinto de "VARIOS" explícito.
--   5. submit_interpreter_proposal: normaliza la categoría propuesta, y
--      además de comparar el nombre canónico también compara categoría/marca
--      resueltas contra lo ya aprobado -- si difieren, se trata como el
--      mismo tipo de conflicto que ya existe para desacuerdo de nombre.
--   6. approve_interpreter_proposal / update_canonical_product: normalizan
--      la categoría final antes de escribirla en canonical_products.
--   7. get_home_pantry: añade package_quantity a lo que devuelve (el stock
--      real = quantity × package_quantity se calcula en la app, en
--      lib/pantry.ts, para que sea una función pura testeable), y añade
--      canonical_products.default_unit como último fallback de unidad.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Enum de categorías oficiales.
-- ----------------------------------------------------------------------------
create type public.product_category as enum (
  'ALIMENTACIÓN',
  'BEBIDAS',
  'HIGIENE PERSONAL',
  'LIMPIEZA',
  'CONSUMIBLES DEL HOGAR',
  'MASCOTAS',
  'VARIOS'
);

-- ----------------------------------------------------------------------------
-- 2. normalize_product_category: tolerante a mayúsculas/acentos para no
-- perder los datos existentes (p.ej. "Lácteos" de 0007_interpreter_seed_data),
-- pero siempre devuelve una etiqueta válida del enum. Nunca null.
-- ----------------------------------------------------------------------------
create function public.normalize_product_category(p_category text)
returns public.product_category
language sql
immutable
set search_path = public
as $$
  select case public.immutable_unaccent(upper(trim(coalesce(p_category, ''))))
    when 'ALIMENTACION' then 'ALIMENTACIÓN'::public.product_category
    when 'BEBIDAS' then 'BEBIDAS'::public.product_category
    when 'HIGIENE PERSONAL' then 'HIGIENE PERSONAL'::public.product_category
    when 'LIMPIEZA' then 'LIMPIEZA'::public.product_category
    when 'CONSUMIBLES DEL HOGAR' then 'CONSUMIBLES DEL HOGAR'::public.product_category
    when 'MASCOTAS' then 'MASCOTAS'::public.product_category
    when 'VARIOS' then 'VARIOS'::public.product_category
    -- Sinónimos reales observados en 0007_interpreter_seed_data.sql.
    when 'LACTEOS' then 'ALIMENTACIÓN'::public.product_category
    when 'HUEVOS' then 'ALIMENTACIÓN'::public.product_category
    when 'PANADERIA' then 'ALIMENTACIÓN'::public.product_category
    when 'ACEITES' then 'ALIMENTACIÓN'::public.product_category
    else 'VARIOS'::public.product_category
  end;
$$;

-- ----------------------------------------------------------------------------
-- 3. canonical_products.category -> enum, NOT NULL DEFAULT 'VARIOS'. La
-- propia BD garantiza así que "la categoría debe aparecer siempre".
-- ----------------------------------------------------------------------------
alter table public.canonical_products
  alter column category type public.product_category
  using public.normalize_product_category(category);

alter table public.canonical_products
  alter column category set default 'VARIOS';

alter table public.canonical_products
  alter column category set not null;

-- ----------------------------------------------------------------------------
-- 4. interpreter_proposals.proposed_category -> enum, se queda nullable:
-- null = "sin categoría propuesta todavía" (distinto de VARIOS explícito).
-- ----------------------------------------------------------------------------
alter table public.interpreter_proposals
  alter column proposed_category type public.product_category
  using (
    case when proposed_category is null then null
    else public.normalize_product_category(proposed_category) end
  );

-- ----------------------------------------------------------------------------
-- 5. submit_interpreter_proposal: normaliza la categoría propuesta y detecta
-- también conflicto de categoría/marca contra un alias ya aprobado (antes
-- solo se comparaba el nombre canónico).
-- ----------------------------------------------------------------------------
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
  v_proposed_category public.product_category;
  v_alias public.product_aliases%rowtype;
  v_alias_canonical_norm text;
  v_alias_category public.product_category;
  v_alias_brand text;
  v_agrees boolean;
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
  v_proposed_category := case when p_proposed_category is null then null
    else public.normalize_product_category(p_proposed_category) end;

  select * into v_alias
  from public.product_aliases
  where retailer = v_retailer and normalized_raw_name = v_normalized_raw and active and deleted_at is null
  limit 1;

  if v_alias.id is not null then
    select public.normalize_product_text(cp.canonical_name), cp.category, rp.brand
    into v_alias_canonical_norm, v_alias_category, v_alias_brand
    from public.retailer_products rp
    join public.canonical_products cp on cp.id = rp.canonical_product_id
    where rp.id = v_alias.retailer_product_id;

    -- Coincide el nombre y, si se propone algo nuevo de categoría/marca,
    -- también coincide con lo ya aprobado -- comportamiento de siempre.
    v_agrees := v_alias_canonical_norm = v_normalized_proposed
      and (v_proposed_category is null or v_proposed_category = v_alias_category)
      and (p_proposed_brand is null or trim(p_proposed_brand) = ''
        or public.normalize_product_text(p_proposed_brand) = public.normalize_product_text(coalesce(v_alias_brand, '')));

    if v_agrees then
      update public.product_aliases
      set times_seen = times_seen + 1, times_confirmed = times_confirmed + 1, updated_at = now()
      where id = v_alias.id;
      return null;
    else
      insert into public.interpreter_proposals (
        retailer, raw_name, proposed_canonical_name, proposed_brand, proposed_category,
        proposed_quantity, proposed_unit, ai_confidence, submitted_by, status, user_conflicts
      ) values (
        v_retailer, v_raw_name, p_proposed_canonical_name, p_proposed_brand, v_proposed_category,
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
      v_retailer, v_raw_name, p_proposed_canonical_name, p_proposed_brand, v_proposed_category,
      p_proposed_quantity, p_proposed_unit, p_ai_confidence, auth.uid(), 'conflict', 1
    ) returning id into v_result_id;
    return v_result_id;
  end if;

  insert into public.interpreter_proposals (
    retailer, raw_name, proposed_canonical_name, proposed_brand, proposed_category,
    proposed_quantity, proposed_unit, ai_confidence, submitted_by, status, user_confirmations
  ) values (
    v_retailer, v_raw_name, p_proposed_canonical_name, p_proposed_brand, v_proposed_category,
    p_proposed_quantity, p_proposed_unit, p_ai_confidence, auth.uid(), 'pending', 1
  ) returning id into v_result_id;

  return v_result_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. approve_interpreter_proposal: la categoría final siempre se normaliza
-- antes de escribirla en canonical_products (sea la propuesta o el override
-- del moderador).
-- ----------------------------------------------------------------------------
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
  v_final_category public.product_category;
  v_final_quantity numeric;
  v_final_unit text;
  v_edited boolean;
  v_canonical_row public.canonical_products%rowtype;
  v_retailer_row public.retailer_products%rowtype;
  v_alias_row public.product_aliases%rowtype;
  v_canonical_existed boolean;
  v_retailer_existed boolean;
  v_alias_existed boolean;
  v_touched_canonical_retailer boolean := false;
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
  v_final_category := public.normalize_product_category(
    coalesce(p_override_category, v_proposal.proposed_category::text)
  );
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

    v_touched_canonical_retailer := true;

    select exists(
      select 1 from public.canonical_products
      where normalized_name = public.normalize_product_text(v_final_canonical_name)
    ) into v_canonical_existed;

    insert into public.canonical_products (canonical_name, category, default_unit, updated_by)
    values (trim(v_final_canonical_name), v_final_category, v_final_unit, auth.uid())
    on conflict (normalized_name) do update
      set category = coalesce(excluded.category, public.canonical_products.category),
          default_unit = coalesce(public.canonical_products.default_unit, excluded.default_unit),
          updated_by = auth.uid(),
          updated_at = now()
    returning * into v_canonical_row;

    v_canonical_id := v_canonical_row.id;

    select exists(
      select 1 from public.retailer_products
      where canonical_product_id = v_canonical_id
        and retailer = v_proposal.retailer
        and normalized_commercial_name = public.normalize_product_text(
          coalesce(nullif(trim(v_final_canonical_name), ''), v_proposal.raw_name)
        )
    ) into v_retailer_existed;

    insert into public.retailer_products (
      canonical_product_id, retailer, brand, commercial_name, package_quantity, package_unit, updated_by
    )
    values (
      v_canonical_id, v_proposal.retailer, v_final_brand,
      coalesce(nullif(trim(v_final_canonical_name), ''), v_proposal.raw_name),
      v_final_quantity, v_final_unit, auth.uid()
    )
    on conflict (canonical_product_id, retailer, normalized_commercial_name) do update
      set brand = coalesce(excluded.brand, public.retailer_products.brand),
          package_quantity = coalesce(excluded.package_quantity, public.retailer_products.package_quantity),
          package_unit = coalesce(excluded.package_unit, public.retailer_products.package_unit),
          updated_by = auth.uid(),
          updated_at = now()
    returning * into v_retailer_row;

    v_retailer_product_id := v_retailer_row.id;
  end if;

  select exists(
    select 1 from public.product_aliases
    where retailer = v_proposal.retailer
      and normalized_raw_name = v_proposal.normalized_raw_name
      and deleted_at is null
  ) into v_alias_existed;

  insert into public.product_aliases (
    retailer, raw_name, retailer_product_id, confidence_score, times_seen, times_confirmed, updated_by
  )
  values (
    v_proposal.retailer, v_proposal.raw_name, v_retailer_product_id,
    v_proposal.ai_confidence, greatest(v_proposal.user_confirmations, 1), greatest(v_proposal.user_confirmations, 1),
    auth.uid()
  )
  on conflict (retailer, normalized_raw_name) where deleted_at is null do update
    set retailer_product_id = excluded.retailer_product_id,
        confidence_score = coalesce(excluded.confidence_score, public.product_aliases.confidence_score),
        times_seen = public.product_aliases.times_seen + 1,
        times_confirmed = public.product_aliases.times_confirmed + 1,
        active = true,
        updated_by = auth.uid(),
        updated_at = now()
  returning * into v_alias_row;

  v_alias_id := v_alias_row.id;

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

  if v_touched_canonical_retailer then
    perform public.log_interpreter_history('canonical_product', v_canonical_row.id,
      case when v_canonical_existed then 'update' else 'create' end, null, to_jsonb(v_canonical_row));
    perform public.log_interpreter_history('retailer_product', v_retailer_row.id,
      case when v_retailer_existed then 'update' else 'create' end, null, to_jsonb(v_retailer_row));
  end if;

  perform public.log_interpreter_history('product_alias', v_alias_row.id,
    case when v_alias_existed then 'update' else 'create' end, null, to_jsonb(v_alias_row));

  return v_alias_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. update_canonical_product: normaliza la categoría antes de escribirla
-- (antes hacía `category = p_category` directo; ahora nunca puede quedar en
-- null porque la columna es NOT NULL).
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
  v_before public.canonical_products%rowtype;
  v_after public.canonical_products%rowtype;
  v_category public.product_category;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  if trim(coalesce(p_canonical_name, '')) = '' then
    raise exception 'El nombre no puede estar vacío';
  end if;

  select * into v_before from public.canonical_products where id = p_id;
  if v_before.id is null then
    raise exception 'Producto canónico no encontrado';
  end if;

  v_category := public.normalize_product_category(p_category);

  update public.canonical_products
  set canonical_name = trim(p_canonical_name), category = v_category, default_unit = p_default_unit,
      updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_after;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'canonical_product_edited', 'canonical_product', p_id,
    jsonb_build_object('canonical_name', p_canonical_name, 'category', v_category, 'default_unit', p_default_unit));

  perform public.log_interpreter_history('canonical_product', p_id, 'update', to_jsonb(v_before), to_jsonb(v_after));
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. get_home_pantry: añade package_quantity (el stock real se calcula en
-- la app -- lib/pantry.ts:computeStockQuantity -- para que sea testeable) y
-- un tercer fallback de unidad sobre canonical_products.default_unit.
-- ----------------------------------------------------------------------------
drop function if exists public.get_home_pantry(uuid);

create function public.get_home_pantry(p_home_id uuid)
returns table (
  canonical_product_id uuid,
  canonical_name text,
  category public.product_category,
  brand text,
  quantity numeric,
  package_quantity numeric,
  unit text,
  purchase_date date,
  raw_name text
)
language sql
security invoker
set search_path = public
stable
as $$
  select distinct on (cp.id)
    cp.id as canonical_product_id,
    cp.canonical_name,
    cp.category,
    rp.brand,
    ri.quantity,
    rp.package_quantity,
    coalesce(ri.unit, rp.package_unit, cp.default_unit) as unit,
    r.purchase_date,
    ri.raw_name
  from public.receipt_items ri
  join public.receipts r on r.id = ri.receipt_id
  join public.product_aliases pa
    on pa.active
   and pa.deleted_at is null
   and public.normalize_product_text(pa.retailer) = public.normalize_product_text(coalesce(r.store_name, ''))
   and pa.normalized_raw_name = public.normalize_product_text(ri.raw_name)
  join public.retailer_products rp on rp.id = pa.retailer_product_id
  join public.canonical_products cp on cp.id = rp.canonical_product_id
  where r.home_id = p_home_id
  order by cp.id, r.purchase_date desc nulls last, ri.created_at desc;
$$;

-- ----------------------------------------------------------------------------
-- 9. find_similar_canonical_products ("detectar posibles duplicados" en
-- /admin/products) seleccionaba cp.category directamente; ahora que la
-- columna es el enum en vez de text, hay que castearlo explícitamente para
-- que siga encajando con su returns table (category text) declarado.
-- ----------------------------------------------------------------------------
drop function if exists public.find_similar_canonical_products(text, integer);

create function public.find_similar_canonical_products(
  p_name text,
  p_limit integer default 5
)
returns table (id uuid, canonical_name text, category text, similarity real)
language sql
security definer
set search_path = public
stable
as $$
  select cp.id, cp.canonical_name, cp.category::text,
         similarity(cp.normalized_name, public.normalize_product_text(p_name)) as similarity
  from public.canonical_products cp
  where cp.normalized_name % public.normalize_product_text(p_name)
  order by similarity desc
  limit greatest(least(coalesce(p_limit, 5), 20), 1);
$$;

commit;
