-- ============================================================================
-- Endurece el matching de "retailer" en la despensa: usar la misma
-- normalización completa (normalize_product_text: minúsculas + sin acentos +
-- espacios colapsados) que ya se usa para el texto del producto, en vez de
-- un simple lower(trim(...)) -- evita falsos negativos por dobles espacios,
-- acentos o variaciones menores entre cómo se escribió el supermercado al
-- guardar el ticket y cómo quedó en el alias aprobado.
-- ============================================================================

begin;

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
        and public.normalize_product_text(pa.retailer) = public.normalize_product_text(coalesce(r.store_name, ''))
        and pa.normalized_raw_name = public.normalize_product_text(ri.raw_name)
    );
$$;

commit;
