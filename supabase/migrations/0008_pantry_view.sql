-- ============================================================================
-- Despensa: sólo productos ya validados por el intérprete, con su nombre
-- interpretado
-- ============================================================================
-- Hasta ahora /despensa agrupaba receipt_items.raw_name tal cual (texto
-- crudo del ticket, sin pasar por el intérprete). A partir de ahora:
--   - una línea de ticket sólo aparece en la despensa si existe un
--     product_alias ACTIVO para (retailer del ticket, raw_name normalizado)
--     -- es decir, si delegate/admin ya aprobaron esa interpretación;
--   - se muestra con el canonical_name interpretado, no con el texto crudo.
--
-- Ambas funciones son SECURITY INVOKER (el valor por defecto; se deja
-- explícito para que quede claro): se ejecutan con los privilegios de quien
-- llama, así que las RLS de receipts/receipt_items (acceso sólo a Casas
-- propias, vía get_my_home_ids()) se siguen aplicando exactamente igual que
-- si la consulta la hiciera el cliente directamente. Pasar un p_home_id
-- ajeno simplemente no devuelve filas -- no hace falta comprobarlo a mano.
-- ============================================================================

begin;

-- get_home_pantry(): una fila por producto canónico ya interpretado, con los
-- datos de su compra más reciente (misma simplificación que ya existía:
-- "última compra gana", sin sumar cantidades -- no hay stock real todavía,
-- eso es lo que inventory_events reservará para V0.2+).
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
   and lower(trim(pa.retailer)) = lower(trim(coalesce(r.store_name, '')))
   and pa.normalized_raw_name = public.normalize_product_text(ri.raw_name)
  join public.retailer_products rp on rp.id = pa.retailer_product_id
  join public.canonical_products cp on cp.id = rp.canonical_product_id
  where r.home_id = p_home_id
  order by cp.id, r.purchase_date desc nulls last, ri.created_at desc;
$$;

-- count_home_pending_interpretation(): cuántas líneas de ticket de esta Casa
-- todavía no tienen un alias aprobado -- para poder avisar en /despensa de
-- que hay compras "en cola" sin mostrarlas como si fueran erróneas.
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
        and lower(trim(pa.retailer)) = lower(trim(coalesce(r.store_name, '')))
        and pa.normalized_raw_name = public.normalize_product_text(ri.raw_name)
    );
$$;

commit;
