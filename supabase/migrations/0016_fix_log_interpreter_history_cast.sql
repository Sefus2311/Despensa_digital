begin;

-- ----------------------------------------------------------------------------
-- Corrige approve_interpreter_proposal (0010, redefinida por 0013): las tres
-- llamadas a log_interpreter_history() le pasan el tipo de cambio como
-- `case when ... then 'update' else 'create' end`. Un `case` cuyas dos ramas
-- son literales de texto sin más contexto se resuelve como `text` (no como
-- literal "unknown", que sí castea implícito a cualquier tipo) -- y `text` no
-- tiene cast implícito al enum `interpreter_change_type`, así que Postgres no
-- encuentra ninguna sobrecarga de la función y aprobar una propuesta falla
-- con "function public.log_interpreter_history(unknown, uuid, text, unknown,
-- jsonb) does not exist". Las llamadas con un literal suelto (sin `case`,
-- p.ej. en update_canonical_product) no tienen este problema: un literal
-- aislado sigue siendo "unknown" y sí castea implícito al enum.
--
-- Fix: cast explícito del resultado del `case` a interpreter_change_type.
-- Redefine la función completa (create or replace) porque no hay forma de
-- parchear solo esas líneas; el resto del cuerpo es idéntico a 0013.
-- No destructivo: no toca datos existentes, solo corrige la función.
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
      (case when v_canonical_existed then 'update' else 'create' end)::public.interpreter_change_type,
      null, to_jsonb(v_canonical_row));
    perform public.log_interpreter_history('retailer_product', v_retailer_row.id,
      (case when v_retailer_existed then 'update' else 'create' end)::public.interpreter_change_type,
      null, to_jsonb(v_retailer_row));
  end if;

  perform public.log_interpreter_history('product_alias', v_alias_row.id,
    (case when v_alias_existed then 'update' else 'create' end)::public.interpreter_change_type,
    null, to_jsonb(v_alias_row));

  return v_alias_id;
end;
$$;

commit;
