-- ============================================================================
-- Edición de artículos desde "Mi despensa"
-- ============================================================================
-- Distingue expresamente dos conceptos:
--   - REGISTRO DE COMPRA (receipts + receipt_items): evidencia histórica. Esta
--     edición nunca lo toca.
--   - ARTÍCULO DE DESPENSA: hasta ahora solo existía derivado (get_home_pantry).
--     Sus correcciones se guardan aparte, por Casa, en pantry_item_edits.
-- No se editan canonical_products/retailer_products porque son conocimiento
-- global moderado por delegate/admin: el cambio de un usuario afectaría a
-- todas las Casas y le daría un privilegio que no tiene.
--
-- Esta migración:
--   1. crea pantry_item_edits (una fila por Casa + producto; null = heredar);
--   2. RLS por pertenencia a la Casa, SIN política de DELETE;
--   3. get_home_pantry aplica las correcciones y devuelve también los datos
--      originales y la compra de origen (supermercado, ticket, fecha);
--   4. merge_canonical_products conserva las correcciones al UNIFICAR;
--   5. retira receipts_delete_member: un ticket no se puede borrar (la app
--      nunca lo ha hecho, así que no rompe ningún flujo).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. pantry_item_edits
--    La cantidad corregida vale solo mientras stock_receipt_id sea el ticket de
--    la última compra del producto: una compra posterior vuelve a mandar, igual
--    que hasta ahora ("la despensa muestra la última compra"). Se referencia el
--    ticket y no la línea porque saveReceiptReview reinserta las líneas (cambian
--    de id) cuando se corrige un ticket.
-- ----------------------------------------------------------------------------
create table if not exists public.pantry_item_edits (
  home_id uuid not null references public.homes(id) on delete cascade,
  canonical_product_id uuid not null references public.canonical_products(id) on delete cascade,
  display_name text check (display_name is null or trim(display_name) <> ''),
  category public.product_category,
  -- '' = marca quitada a propósito; null = heredar la del catálogo.
  brand text,
  stock_quantity numeric(10, 3) check (stock_quantity is null or stock_quantity >= 0),
  stock_unit text,
  stock_receipt_id uuid references public.receipts(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (home_id, canonical_product_id)
);

create index if not exists pantry_item_edits_canonical_product_id_idx
  on public.pantry_item_edits(canonical_product_id);

-- Misma regla de nombre que receipt_items.product_name (0021).
create or replace function public.enforce_pantry_item_name_capitalized()
returns trigger
language plpgsql
as $$
begin
  new.display_name := public.capitalize_first_letter(new.display_name);
  return new;
end;
$$;

drop trigger if exists pantry_item_edits_name_capitalize on public.pantry_item_edits;
create trigger pantry_item_edits_name_capitalize
  before insert or update of display_name on public.pantry_item_edits
  for each row execute function public.enforce_pantry_item_name_capitalized();

-- ----------------------------------------------------------------------------
-- 2. RLS: mismo criterio que receipts (pertenencia a la Casa). El rol de sistema
--    no interviene: un admin o delegate solo edita las Casas de las que es
--    miembro. Sin política de DELETE: no hay forma de borrar desde el cliente.
-- ----------------------------------------------------------------------------
alter table public.pantry_item_edits enable row level security;

create policy "pantry_item_edits_select_member" on public.pantry_item_edits
  for select using (home_id in (select public.get_my_home_ids()));
create policy "pantry_item_edits_insert_member" on public.pantry_item_edits
  for insert with check (
    home_id in (select public.get_my_home_ids()) and updated_by = auth.uid()
  );
create policy "pantry_item_edits_update_member" on public.pantry_item_edits
  for update using (home_id in (select public.get_my_home_ids()))
  with check (home_id in (select public.get_my_home_ids()) and updated_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. get_home_pantry: misma selección de la última compra que 0019 (filtros
--    incluidos), con las correcciones aplicadas encima. canonical_name/category/
--    brand/quantity/unit son ya los valores efectivos; con cantidad corregida,
--    package_quantity sale null porque stock_quantity ya son unidades finales
--    (así computeStockQuantity sigue valiendo sin cambios en quien lo consume).
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
  raw_name text,
  catalog_name text,
  catalog_category public.product_category,
  catalog_brand text,
  purchase_quantity numeric,
  purchase_package_quantity numeric,
  purchase_unit text,
  receipt_id uuid,
  store_name text,
  stock_adjusted boolean
)
language sql
security invoker
set search_path = public
stable
as $$
  with latest as (
    select distinct on (cp.id)
      cp.id as canonical_product_id,
      cp.canonical_name,
      cp.category,
      rp.brand,
      ri.quantity,
      rp.package_quantity,
      coalesce(ri.unit, rp.package_unit, cp.default_unit) as unit,
      r.purchase_date,
      ri.raw_name,
      r.id as receipt_id,
      r.store_name
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
      and r.status = 'reviewed'
      and ri.is_inventory_item
    order by cp.id, r.purchase_date desc nulls last, ri.created_at desc
  )
  select
    l.canonical_product_id,
    coalesce(e.display_name, l.canonical_name),
    coalesce(e.category, l.category),
    nullif(coalesce(e.brand, l.brand), ''),
    case when s.adjusted then e.stock_quantity else l.quantity end,
    case when s.adjusted then null else l.package_quantity end,
    case when s.adjusted then e.stock_unit else l.unit end,
    l.purchase_date,
    l.raw_name,
    l.canonical_name,
    l.category,
    l.brand,
    l.quantity,
    l.package_quantity,
    l.unit,
    l.receipt_id,
    l.store_name,
    s.adjusted
  from latest l
  left join public.pantry_item_edits e
    on e.home_id = p_home_id and e.canonical_product_id = l.canonical_product_id
  cross join lateral (
    select coalesce(e.stock_quantity is not null and e.stock_receipt_id = l.receipt_id, false) as adjusted
  ) s;
$$;

-- ----------------------------------------------------------------------------
-- 4. merge_canonical_products: misma función que 0024 más pantry_item_edits, que
--    pasa a ser la 4ª referencia real a canonical_products. Si la Casa ya tiene
--    corrección sobre el destino, gana esa (el índice primario no admite dos) y
--    la del origen se descarta.
-- ----------------------------------------------------------------------------
create or replace function public.merge_canonical_products(
  p_source_ids uuid[],
  p_target_id uuid,
  p_final_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id uuid;
  v_rp record;
  v_existing_rp_id uuid;
  v_target_before public.canonical_products%rowtype;
  v_target_after public.canonical_products%rowtype;
  v_sources_snapshot jsonb;
  v_source_ids uuid[];
begin
  if public.get_my_system_role() is distinct from 'admin' then
    raise exception 'Solo un administrador puede unificar productos del diccionario';
  end if;

  if p_target_id = any(coalesce(p_source_ids, '{}')) then
    raise exception 'El valor definitivo no puede estar también entre los productos a unificar';
  end if;

  -- Dedupe defensivo (por si el cliente envía el mismo id dos veces).
  select array_agg(distinct x) into v_source_ids from unnest(coalesce(p_source_ids, '{}')) as x;
  if v_source_ids is null or array_length(v_source_ids, 1) is null then
    raise exception 'Selecciona al menos un producto para unificar';
  end if;

  select * into v_target_before from public.canonical_products where id = p_target_id;
  if v_target_before.id is null then
    raise exception 'El producto de destino no existe';
  end if;

  -- Fotografía de lo que se va a fusionar, ANTES de tocar nada (para el historial/auditoría).
  select jsonb_agg(to_jsonb(cp)) into v_sources_snapshot
  from public.canonical_products cp where cp.id = any(v_source_ids);
  if v_sources_snapshot is null then
    raise exception 'Ninguno de los productos a unificar existe';
  end if;

  foreach v_source_id in array v_source_ids loop
    for v_rp in select * from public.retailer_products where canonical_product_id = v_source_id loop
      select id into v_existing_rp_id
      from public.retailer_products
      where canonical_product_id = p_target_id
        and retailer = v_rp.retailer
        and normalized_commercial_name = v_rp.normalized_commercial_name
      limit 1;

      if v_existing_rp_id is not null then
        update public.product_aliases
        set retailer_product_id = v_existing_rp_id, updated_at = now()
        where retailer_product_id = v_rp.id;

        delete from public.retailer_products where id = v_rp.id;
      else
        update public.retailer_products
        set canonical_product_id = p_target_id, updated_by = auth.uid(), updated_at = now()
        where id = v_rp.id;
      end if;
    end loop;

    update public.receta_ingredientes set producto_id = p_target_id where producto_id = v_source_id;
    update public.shopping_list_items set canonical_product_id = p_target_id where canonical_product_id = v_source_id;

    update public.pantry_item_edits e
    set canonical_product_id = p_target_id
    where e.canonical_product_id = v_source_id
      and not exists (
        select 1 from public.pantry_item_edits t
        where t.home_id = e.home_id and t.canonical_product_id = p_target_id
      );
    delete from public.pantry_item_edits where canonical_product_id = v_source_id;

    delete from public.canonical_products where id = v_source_id;
  end loop;

  if p_final_name is not null and trim(p_final_name) <> '' then
    update public.canonical_products
    set canonical_name = trim(p_final_name), updated_by = auth.uid(), updated_at = now()
    where id = p_target_id
    returning * into v_target_after;
  else
    select * into v_target_after from public.canonical_products where id = p_target_id;
  end if;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'canonical_products_merged', 'canonical_product', p_target_id,
    jsonb_build_object(
      'source_ids', to_jsonb(v_source_ids),
      'final_name', v_target_after.canonical_name,
      'sources_before', v_sources_snapshot
    )
  );

  perform public.log_interpreter_history(
    'canonical_product', p_target_id, 'update', to_jsonb(v_target_before), to_jsonb(v_target_after)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Un ticket no se puede borrar. receipt_items conserva su política de DELETE
--    porque saveReceiptReview la necesita para corregir un ticket (reemplaza
--    las líneas); esa acción rechaza quitar líneas de un ticket confirmado.
-- ----------------------------------------------------------------------------
drop policy if exists "receipts_delete_member" on public.receipts;

commit;
