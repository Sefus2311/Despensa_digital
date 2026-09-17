-- ============================================================================
-- Gestión del Intérprete: ver/editar/eliminar (soft delete) + trazabilidad
-- ============================================================================
-- Construye sobre 0006_interpreter_and_admin.sql. Añade:
--   - deleted_at/updated_by en product_aliases; updated_by en canonical_products
--     y retailer_products (created_at/updated_at ya existían desde 0006).
--   - interpreter_history: registro genérico (JSONB antes/después) de altas,
--     ediciones, bajas y restauraciones sobre las tres tablas del intérprete.
--   - delete_product_alias / restore_product_alias: soft delete real, sin
--     DELETE físico -- mismo principio que "no hay delete_*" de 0006 (sección 6).
--   - update_interpreter_alias_full: edita en una sola transacción el alias,
--     su retailer_product y su canonical_product (edición combinada).
--   - get_interpreter_alias_detail: lectura agregada (alias + productos +
--     historial + email de quién editó) para la ficha de detalle del panel.
--   - update_canonical_product / update_retailer_product / update_product_alias
--     / approve_interpreter_proposal / submit_interpreter_proposal quedan
--     reemplazadas (create or replace) para fijar updated_by, registrar en
--     interpreter_history y respetar los alias eliminados.
--   - get_home_pantry / count_home_pending_interpretation (0008/0009) se
--     reemplazan para excluir alias eliminados del matching de la despensa.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ----------------------------------------------------------------------------
alter table public.product_aliases
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.canonical_products
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.retailer_products
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 2. Índice único de product_aliases: parcial (sólo entre no eliminados), para
-- poder re-aprobar el mismo (retailer, raw_name) tras eliminar un alias.
-- ----------------------------------------------------------------------------
drop index if exists public.product_aliases_retailer_raw_key;
create unique index if not exists product_aliases_retailer_raw_key
  on public.product_aliases (retailer, normalized_raw_name)
  where deleted_at is null;

-- ----------------------------------------------------------------------------
-- 3. interpreter_history
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'interpreter_change_type') then
    create type public.interpreter_change_type as enum ('create', 'update', 'delete', 'restore');
  end if;
end $$;

create table if not exists public.interpreter_history (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('canonical_product', 'retailer_product', 'product_alias')),
  entry_id uuid not null,
  change_type public.interpreter_change_type not null,
  previous_data jsonb,
  new_data jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists interpreter_history_entry_idx
  on public.interpreter_history (entry_type, entry_id, changed_at desc);

alter table public.interpreter_history enable row level security;

create policy "interpreter_history_select_moderator" on public.interpreter_history
  for select using (public.get_my_system_role() in ('admin', 'delegate'));

-- Sin política de insert/update/delete: sólo se escribe desde
-- log_interpreter_history(), SECURITY DEFINER (sección 4).

-- ----------------------------------------------------------------------------
-- 4. log_interpreter_history(): único punto de escritura de interpreter_history.
-- ----------------------------------------------------------------------------
create or replace function public.log_interpreter_history(
  p_entry_type text,
  p_entry_id uuid,
  p_change_type public.interpreter_change_type,
  p_previous_data jsonb,
  p_new_data jsonb
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

  insert into public.interpreter_history (entry_type, entry_id, change_type, previous_data, new_data, changed_by)
  values (p_entry_type, p_entry_id, p_change_type, p_previous_data, p_new_data, auth.uid());
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. update_canonical_product / update_retailer_product / update_product_alias:
-- mismo cuerpo que 0006, con updated_by y registro en interpreter_history.
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

  update public.canonical_products
  set canonical_name = trim(p_canonical_name), category = p_category, default_unit = p_default_unit,
      updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_after;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'canonical_product_edited', 'canonical_product', p_id,
    jsonb_build_object('canonical_name', p_canonical_name, 'category', p_category, 'default_unit', p_default_unit));

  perform public.log_interpreter_history('canonical_product', p_id, 'update', to_jsonb(v_before), to_jsonb(v_after));
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
  v_before public.retailer_products%rowtype;
  v_after public.retailer_products%rowtype;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  select * into v_before from public.retailer_products where id = p_id;
  if v_before.id is null then
    raise exception 'Producto de tienda no encontrado';
  end if;

  update public.retailer_products
  set brand = coalesce(p_brand, brand),
      commercial_name = coalesce(nullif(trim(p_commercial_name), ''), commercial_name),
      package_quantity = coalesce(p_package_quantity, package_quantity),
      package_unit = coalesce(p_package_unit, package_unit),
      canonical_product_id = coalesce(p_canonical_product_id, canonical_product_id),
      updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_after;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'retailer_product_edited', 'retailer_product', p_id,
    jsonb_build_object('brand', p_brand, 'commercial_name', p_commercial_name, 'canonical_product_id', p_canonical_product_id));

  perform public.log_interpreter_history('retailer_product', p_id, 'update', to_jsonb(v_before), to_jsonb(v_after));
end;
$$;

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
  v_before public.product_aliases%rowtype;
  v_after public.product_aliases%rowtype;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  select * into v_before from public.product_aliases where id = p_id;
  if v_before.id is null then
    raise exception 'Alias no encontrado';
  end if;
  if v_before.deleted_at is not null then
    raise exception 'El alias está eliminado; restáuralo antes de editarlo';
  end if;

  update public.product_aliases
  set retailer_product_id = coalesce(p_retailer_product_id, retailer_product_id),
      active = coalesce(p_active, active),
      updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_after;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'product_alias_edited', 'product_alias', p_id,
    jsonb_build_object('retailer_product_id', p_retailer_product_id, 'active', p_active));

  perform public.log_interpreter_history('product_alias', p_id, 'update', to_jsonb(v_before), to_jsonb(v_after));
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Borrado seguro de product_aliases (soft delete, reversible)
-- ----------------------------------------------------------------------------
create or replace function public.delete_product_alias(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.system_role;
  v_before public.product_aliases%rowtype;
  v_after public.product_aliases%rowtype;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  select * into v_before from public.product_aliases where id = p_id;
  if v_before.id is null then
    raise exception 'Alias no encontrado';
  end if;
  if v_before.deleted_at is not null then
    raise exception 'El alias ya está eliminado';
  end if;

  update public.product_aliases
  set deleted_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_after;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'product_alias_deleted', 'product_alias', p_id,
    jsonb_build_object('retailer', v_before.retailer, 'raw_name', v_before.raw_name));

  perform public.log_interpreter_history('product_alias', p_id, 'delete', to_jsonb(v_before), to_jsonb(v_after));
end;
$$;

create or replace function public.restore_product_alias(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.system_role;
  v_before public.product_aliases%rowtype;
  v_after public.product_aliases%rowtype;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  select * into v_before from public.product_aliases where id = p_id;
  if v_before.id is null then
    raise exception 'Alias no encontrado';
  end if;
  if v_before.deleted_at is null then
    raise exception 'El alias no está eliminado';
  end if;

  update public.product_aliases
  set deleted_at = null, updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_after;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'product_alias_restored', 'product_alias', p_id,
    jsonb_build_object('retailer', v_before.retailer, 'raw_name', v_before.raw_name));

  perform public.log_interpreter_history('product_alias', p_id, 'restore', to_jsonb(v_before), to_jsonb(v_after));
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Edición combinada: alias + su retailer_product + su canonical_product en
-- una sola transacción (orquesta las funciones de la sección 5, no duplica su
-- lógica: si una de las dos llamadas internas falla, Postgres revierte ambas).
-- ----------------------------------------------------------------------------
create or replace function public.update_interpreter_alias_full(
  p_alias_id uuid,
  p_canonical_name text,
  p_category text default null,
  p_default_unit text default null,
  p_brand text default null,
  p_commercial_name text default null,
  p_package_quantity numeric default null,
  p_package_unit text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.system_role;
  v_alias public.product_aliases%rowtype;
  v_canonical_id uuid;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  select * into v_alias from public.product_aliases where id = p_alias_id;
  if v_alias.id is null then
    raise exception 'Alias no encontrado';
  end if;
  if v_alias.deleted_at is not null then
    raise exception 'El alias está eliminado; restáuralo antes de editarlo';
  end if;

  select canonical_product_id into v_canonical_id
  from public.retailer_products where id = v_alias.retailer_product_id;

  perform public.update_canonical_product(v_canonical_id, p_canonical_name, p_category, p_default_unit);
  perform public.update_retailer_product(
    v_alias.retailer_product_id, p_brand, p_commercial_name, p_package_quantity, p_package_unit
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Lectura agregada para la ficha de detalle (alias + productos + historial
-- + email de quién editó). Único punto que necesita bypass de RLS sobre
-- profiles (para resolver el email) -- no se abre ninguna política nueva
-- sobre esa tabla.
-- ----------------------------------------------------------------------------
create or replace function public.get_interpreter_alias_detail(p_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_role public.system_role;
  v_result jsonb;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  select jsonb_build_object(
    'alias', to_jsonb(pa) || jsonb_build_object('updated_by_email', pa_updater.email),
    'retailer_product', to_jsonb(rp) || jsonb_build_object('updated_by_email', rp_updater.email),
    'canonical_product', to_jsonb(cp) || jsonb_build_object('updated_by_email', cp_updater.email),
    'history', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.changed_at desc)
      from (
        select h.*, hu.email as changed_by_email
        from public.interpreter_history h
        left join public.profiles hu on hu.id = h.changed_by
        where h.entry_id in (pa.id, rp.id, cp.id)
        order by h.changed_at desc
        limit 20
      ) t
    ), '[]'::jsonb)
  )
  into v_result
  from public.product_aliases pa
  join public.retailer_products rp on rp.id = pa.retailer_product_id
  join public.canonical_products cp on cp.id = rp.canonical_product_id
  left join public.profiles pa_updater on pa_updater.id = pa.updated_by
  left join public.profiles rp_updater on rp_updater.id = rp.updated_by
  left join public.profiles cp_updater on cp_updater.id = cp.updated_by
  where pa.id = p_id;

  if v_result is null then
    raise exception 'Alias no encontrado';
  end if;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. submit_interpreter_proposal: mismo cuerpo que 0006, excluyendo alias
-- eliminados del matching "ya hay un alias aprobado para esta clave".
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
  where retailer = v_retailer and normalized_raw_name = v_normalized_raw and active and deleted_at is null
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
-- 10. approve_interpreter_proposal: mismo comportamiento que 0006, más
-- updated_by, registro en interpreter_history (create/update según si la fila
-- ya existía) y arbiter parcial (where deleted_at is null) en el upsert de
-- product_aliases para que conviva con el índice de la sección 2. Nota: para
-- canonical_products/retailer_products sólo se registra el estado "after" (no
-- el "before") en este flujo de aprobación -- el "before" completo sí se
-- captura en las ediciones manuales (sección 5), que es donde importa de cara
-- a poder deshacer un error humano.
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
  v_final_category text;
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

    v_touched_canonical_retailer := true;

    select exists(
      select 1 from public.canonical_products
      where normalized_name = public.normalize_product_text(v_final_canonical_name)
    ) into v_canonical_existed;

    insert into public.canonical_products (canonical_name, category, default_unit, updated_by)
    values (trim(v_final_canonical_name), v_final_category, v_final_unit, auth.uid())
    on conflict (normalized_name) do update
      set category = coalesce(public.canonical_products.category, excluded.category),
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
-- 11. Despensa (0008/0009): excluir alias eliminados del matching. Un alias
-- eliminado no debe interpretar ni tickets nuevos ni los ya guardados.
-- ----------------------------------------------------------------------------
create or replace function public.get_home_pantry(p_home_id uuid)
returns table (
  canonical_product_id uuid,
  canonical_name text,
  category text,
  brand text,
  quantity numeric,
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
    coalesce(ri.unit, rp.package_unit) as unit,
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

create or replace function public.count_home_pending_interpretation(p_home_id uuid)
returns integer
language sql
security invoker
set search_path = public
stable
as $$
  select count(*)::int
  from public.receipt_items ri
  join public.receipts r on r.id = ri.receipt_id
  where r.home_id = p_home_id
    and not exists (
      select 1 from public.product_aliases pa
      where pa.active
        and pa.deleted_at is null
        and public.normalize_product_text(pa.retailer) = public.normalize_product_text(coalesce(r.store_name, ''))
        and pa.normalized_raw_name = public.normalize_product_text(ri.raw_name)
    );
$$;

commit;
