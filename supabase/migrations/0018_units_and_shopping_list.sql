-- ============================================================================
-- Unidades estándar (ud./gr./ml.) + lista de la compra idempotente por receta
-- ============================================================================
-- 1. Normaliza las unidades ya guardadas en receta_ingredientes.unidad y
--    shopping_list_items.unit a la forma estándar "ud." / "gr." / "ml.".
--    Mismos sinónimos que lib/units.ts (case-insensitive, punto final
--    opcional). Las unidades culinarias (cucharada, pellizco, al gusto...) no
--    se tocan.
-- 2. add_to_shopping_list(): si la línea sin marcar ya procede de la MISMA
--    receta, se reemplaza su cantidad por la recién calculada en vez de
--    sumarla. Antes, pulsar dos veces "Añadir a la lista de la compra" (o
--    volver a entrar en "Quiero cocinar esto") duplicaba las cantidades
--    (300 -> 600 gr.). La suma se mantiene para fusionar recetas distintas o
--    líneas manuales con el mismo producto.
-- ============================================================================

begin;

create or replace function public.normalize_standard_unit(p_unit text)
returns text
language sql
immutable
parallel safe
as $$
  select case lower(trim(regexp_replace(trim(p_unit), '\.+$', '')))
    when 'ud' then 'ud.'
    when 'uds' then 'ud.'
    when 'unidad' then 'ud.'
    when 'unidades' then 'ud.'
    when 'g' then 'gr.'
    when 'gr' then 'gr.'
    when 'grs' then 'gr.'
    when 'gramo' then 'gr.'
    when 'gramos' then 'gr.'
    when 'ml' then 'ml.'
    when 'mililitro' then 'ml.'
    when 'mililitros' then 'ml.'
    else null
  end;
$$;

update public.receta_ingredientes
  set unidad = public.normalize_standard_unit(unidad)
  where unidad is not null
    and public.normalize_standard_unit(unidad) is not null
    and unidad <> public.normalize_standard_unit(unidad);

update public.shopping_list_items
  set unit = public.normalize_standard_unit(unit)
  where unit is not null
    and public.normalize_standard_unit(unit) is not null
    and unit <> public.normalize_standard_unit(unit);

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
  v_unit text := coalesce(public.normalize_standard_unit(p_unit), nullif(trim(p_unit), ''));
  v_units_compatible boolean;
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
    v_units_compatible :=
      v_existing.unit is null or v_unit is null or lower(v_existing.unit) = lower(v_unit);

    if v_units_compatible then
      if p_source_receta_id is not null
         and v_existing.source = 'receta'
         and v_existing.source_receta_id = p_source_receta_id then
        -- Misma receta otra vez: la cantidad nueva sustituye a la anterior.
        update public.shopping_list_items
        set quantity = p_quantity,
            unit = coalesce(v_existing.unit, v_unit)
        where id = v_existing.id;
      else
        update public.shopping_list_items
        set quantity = case
              when v_existing.quantity is null and p_quantity is null then null
              else coalesce(v_existing.quantity, 0) + coalesce(p_quantity, 0)
            end,
            unit = coalesce(v_existing.unit, v_unit)
        where id = v_existing.id;
      end if;
    end if;
    return v_existing.id;
  end if;

  insert into public.shopping_list_items (
    home_id, canonical_product_id, display_name, quantity, unit, source, source_receta_id, added_by
  ) values (
    p_home_id, p_canonical_product_id, trim(p_display_name), p_quantity, v_unit,
    coalesce(p_source, 'manual'), p_source_receta_id, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

commit;
