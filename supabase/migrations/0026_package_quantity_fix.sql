-- ============================================================================
-- Corrección de package_quantity y de pesos en kg guardados como gr.
-- ============================================================================
-- saveReceiptReview enviaba la cantidad COMPRADA como p_proposed_quantity, y
-- approve_interpreter_proposal la guardaba como retailer_products.package_quantity.
-- Como la despensa calcula stock = cantidad × envase, una compra de 0,194 salía
-- 0,037636 y una de 2 unidades salía 4. El código ya envía units_per_pack.
--
-- Esta migración:
--   1. catálogo: vacía los 59 envases erróneos y corrige Aceitunas y Recambio.
--      Lista cerrada, revisada fila a fila por el usuario contra sus compras
--      (2026-10-31): un pack real no se distingue de un error solo por el valor;
--   2. propuestas sin revisar: quita la cantidad comprada que llevan, para que
--      aprobarlas después no reintroduzca el error;
--   3. get_home_pantry: solo multiplica envases expresados en unidades. "400 g"
--      es contenido, no 400 unidades;
--   4. receipt_items: pasa a gr./ml. los pesos en kg/litros guardados como gr./ml.,
--      SOLO si el texto del ticket lo demuestra. raw_name y precios no se tocan.
--      Es la única corrección sobre registros de compra, autorizada expresamente.
--
-- Todo lo cambiado queda en admin_audit_log (acción data_fix_0026) con su valor
-- anterior, para poder revisarlo o deshacerlo a mano. Una única transacción.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Catálogo. Cada fila exige también el valor esperado: si alguien la ha
--    corregido entretanto, no se pisa.
-- ----------------------------------------------------------------------------
do $$
declare
  v_expected constant integer := 59;
  v_count integer;
  v_before jsonb;
begin
  with wrong(canonical_name, retailer, package_quantity) as (
    values
      ('Sepia limpia troceada', 'LA SIRENA', 0.130),
      ('Anillas de calamar de pota argentina', 'LA SIRENA', 0.145),
      ('Calamar grande', 'ESCLAT', 0.194),
      ('Filete de ternera', 'AMETLLER ORIGEN', 0.206),
      ('Gamba langostinera extra', 'ESCLAT', 0.210),
      ('Cigala mediana nº 3', 'LA SIRENA', 0.215),
      ('Solomillo de vacuno', 'ALDI', 0.230),
      ('Pepino', 'ESCLAT', 0.231),
      ('Almeja rossellona', 'ESCLAT', 0.262),
      ('Pimiento dulce italiano', 'ALDI', 0.294),
      ('Raya pelada', 'ESCLAT', 0.304),
      ('Gambón austral crudo 20-30 piezas/kg', 'LA SIRENA', 0.310),
      ('Presa de cerdo ibérico', 'ALDI', 0.322),
      ('Carne de vacuno troceada', 'ALDI', 0.407),
      ('Almeja del pacífico', 'LA SIRENA', 0.455),
      ('Filete de pechuga de pollo', 'ESCLAT', 0.462),
      ('Pimiento dulce rojo', 'ALDI', 0.494),
      ('Media sandía pequeña', 'ESCLAT', 0.496),
      ('Sepia entera sin limpiar', 'ESCLAT', 0.500),
      ('Rodaja de rape blanco', 'LA SIRENA', 0.505),
      ('Filete de pechuga', 'LIDL', 0.519),
      ('Pechuga de pollo entera', 'LIDL', 0.538),
      ('Platano de canarias', 'ALDI', 0.594),
      ('Cabeza de rape', 'ESCLAT', 0.672),
      ('Platanos', 'LIDL', 0.730),
      ('Costilla adobada', 'ALDI', 0.830),
      ('Plátano canarias', 'MERCADONA', 0.846),
      ('Costilla de cerdo tex-mex', 'ALDI', 0.856),
      ('Uva blanca', 'AMETLLER ORIGEN', 1.055),
      ('Mandarina a granel', 'ALDI', 1.108),
      ('Fruta variada', 'MERCADONA', 2.000),
      ('Jamón cocido en lonchas finas', 'CONSUM', 2.000),
      ('Patata nueva', 'LIDL', 2.000),
      ('Ajos', 'ALDI', 2.000),
      ('Atún claro en aceite de oliva', 'MERCADONA', 2.000),
      ('Cava reserva', 'ESCLAT', 2.000),
      ('Crema facial antiarrugas con protección solar', 'MERCADONA', 2.000),
      ('Gelatina tropical', 'MERCADONA', 2.000),
      ('Hamburguesa de lomo', 'MERCADONA', 2.000),
      ('Harina de trigo', 'MERCADONA', 2.000),
      ('Jamón cocido duroc', 'LIDL', 2.000),
      ('Jamón cocido en lonchas finas', 'MERCADONA', 2.000),
      ('Jamón extrafino', 'MERCADONA', 2.000),
      ('Leche desnatada con calcio', 'LIDL', 2.000),
      ('Lejía con detergente', 'ALDI', 2.000),
      ('Lomos de salmón noruego', 'LA SIRENA', 2.000),
      ('Panecillo de semillas', 'MERCADONA', 2.000),
      ('Puré de fruta', 'CONSUM', 2.000),
      ('Puré de fruta en pouch', 'CONSUM', 2.000),
      ('Suavizante para ropa', 'ALDI', 2.000),
      ('Suprema de salmón', 'CONSUM', 2.000),
      ('Yogur de fresa y plátano', 'MERCADONA', 2.000),
      ('Aguacate', 'ALDI', 3.000),
      ('Bolsas de basura', 'ESCLAT', 3.000),
      ('Pan de viena', 'MERCADONA', 3.000),
      ('Preparado de fresa y plátano', 'MERCADONA', 3.000),
      ('Servilletas de papel', 'MERCADONA', 4.000),
      ('Refresco de cola zero', 'ESCLAT', 5.000),
      ('Leche entera', 'ALDI', 6.000)
  ),
  targets as (
    select rp.id, rp.package_quantity, rp.package_unit, cp.canonical_name, rp.retailer
    from public.retailer_products rp
    join public.canonical_products cp on cp.id = rp.canonical_product_id
    join wrong w
      on w.canonical_name = cp.canonical_name
     and w.retailer = rp.retailer
     and w.package_quantity = rp.package_quantity
  ),
  updated as (
    update public.retailer_products rp
    set package_quantity = null, updated_at = now()
    from targets t
    where rp.id = t.id
    returning rp.id
  )
  select (select count(*) from updated), (select jsonb_agg(to_jsonb(t)) from targets t)
  into v_count, v_before;

  -- Una base sin estos datos (entorno nuevo) no tiene nada que corregir; una
  -- coincidencia parcial significa que la lista ya no es la revisada: se aborta.
  if v_count not in (0, v_expected) then
    raise exception 'Se esperaban % envases erróneos y se han encontrado %: revisa los datos antes de aplicar', v_expected, v_count;
  end if;

  if v_count > 0 then
    insert into public.admin_audit_log (action, target_type, metadata)
    values ('data_fix_0026', 'retailer_product', jsonb_build_object('cleared', v_before));
  end if;
end $$;

update public.retailer_products rp
set package_quantity = 3, updated_at = now()
from public.canonical_products cp
where cp.id = rp.canonical_product_id
  and cp.canonical_name = 'Aceitunas rellenas de anchoa'
  and rp.retailer = 'MERCADONA'
  and rp.package_quantity = 2;

update public.retailer_products rp
set package_unit = 'ud.', updated_at = now()
from public.canonical_products cp
where cp.id = rp.canonical_product_id
  and cp.canonical_name = 'Recambio liquido insecticida'
  and rp.retailer = 'MERCADONA'
  and rp.package_quantity = 6
  and rp.package_unit = '6';

-- ----------------------------------------------------------------------------
-- 2. Propuestas sin revisar: su proposed_quantity es la cantidad de una línea de
--    ticket. Se conserva si la línea indica ese mismo tamaño de pack.
-- ----------------------------------------------------------------------------
with stale as (
  select p.id, p.proposed_quantity
  from public.interpreter_proposals p
  where p.status in ('pending', 'conflict')
    and p.proposed_quantity is not null
    and exists (
      select 1
      from public.receipt_items ri
      join public.receipts r on r.id = ri.receipt_id
      where public.normalize_product_text(coalesce(r.store_name, '')) = public.normalize_product_text(p.retailer)
        and public.normalize_product_text(ri.raw_name) = p.normalized_raw_name
        and ri.quantity = p.proposed_quantity
    )
    and not exists (
      select 1
      from public.receipt_items ri
      join public.receipts r on r.id = ri.receipt_id
      where public.normalize_product_text(coalesce(r.store_name, '')) = public.normalize_product_text(p.retailer)
        and public.normalize_product_text(ri.raw_name) = p.normalized_raw_name
        and ri.units_per_pack = p.proposed_quantity
    )
),
updated as (
  update public.interpreter_proposals p
  set proposed_quantity = null, updated_at = now()
  from stale s
  where p.id = s.id
  returning p.id
)
insert into public.admin_audit_log (action, target_type, metadata)
select 'data_fix_0026', 'interpreter_proposal', jsonb_build_object('cleared', jsonb_agg(to_jsonb(s)))
from stale s
where exists (select 1 from updated)
having count(*) > 0;

-- ----------------------------------------------------------------------------
-- 3. get_home_pantry: igual que 0025, salvo que el envase solo cuenta como
--    multiplicador si está expresado en unidades.
-- ----------------------------------------------------------------------------
create or replace function public.get_home_pantry(p_home_id uuid)
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
      case
        when lower(rtrim(trim(coalesce(rp.package_unit, '')), '.')) in ('ud', 'uds', 'unidad', 'unidades')
          then rp.package_quantity
      end as package_quantity,
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
-- 4. Líneas de ticket: misma regla que correctQuantityFromRawText (lib/units.ts).
--    Solo si el texto contiene esa misma cantidad seguida de kg (para gr.) o de
--    litros (para ml.), y si inventory_quantity no indica ya otra cosa.
-- ----------------------------------------------------------------------------
with proven as (
  select ri.id, ri.receipt_id, ri.raw_name, ri.quantity, ri.inventory_quantity, ri.unit
  from public.receipt_items ri
  where lower(trim(coalesce(ri.unit, ''))) in ('gr.', 'gr', 'g', 'ml.', 'ml')
    and (ri.inventory_quantity is null or ri.inventory_quantity = ri.quantity)
    and exists (
      select 1
      from regexp_matches(ri.raw_name, '(\d+(?:[.,]\d+)?)\s*(kgs?|lts?|l)\y', 'gi') as m
      where replace(m[1], ',', '.')::numeric = ri.quantity
        and (lower(m[2]) like 'k%') = (lower(trim(ri.unit)) like 'g%')
    )
),
updated as (
  update public.receipt_items ri
  set quantity = p.quantity * 1000,
      inventory_quantity = p.inventory_quantity * 1000
  from proven p
  where ri.id = p.id
  returning ri.id
)
insert into public.admin_audit_log (action, target_type, metadata)
select 'data_fix_0026', 'receipt_item', jsonb_build_object('kg_to_gr', jsonb_agg(to_jsonb(p)))
from proven p
where exists (select 1 from updated)
having count(*) > 0;

commit;
