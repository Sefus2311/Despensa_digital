-- ============================================================================
-- Pesos en kg guardados con la etiqueta "gr."
-- ============================================================================
-- Los tickets traen el número en kg ("0,194 kg") y se guardaba como 0.194 gr. El
-- número es correcto; lo que está mal es la unidad. Decisión del usuario
-- (2026-10-31): cambiar la etiqueta a kg, sin tocar la cantidad. Sustituye al
-- enfoque de 0026, que multiplicaba por 1000 solo si el texto lo demostraba y no
-- alcanzaba a todas las líneas; las que 0026 ya pasó a gramos siguen siendo
-- correctas y no se tocan.
--
-- Misma regla que isKilogramsLabelledAsGrams (lib/units.ts): gr. con cantidad
-- entre 0 y 10, salvo que inventory_quantity indique que esa cantidad son
-- unidades ("1 queso" con inventario 350 gr.). raw_name y precios no se tocan.
-- Cada cambio queda en admin_audit_log (acción data_fix_0027) con su valor anterior.
-- ============================================================================

begin;

with mislabelled as (
  select ri.id, ri.receipt_id, ri.raw_name, ri.quantity, ri.inventory_quantity, ri.unit
  from public.receipt_items ri
  where lower(rtrim(trim(coalesce(ri.unit, '')), '.')) in ('g', 'gr', 'grs', 'gramo', 'gramos')
    and ri.quantity > 0
    and ri.quantity < 10
    and (
      ri.inventory_quantity is null
      or ri.inventory_quantity = ri.quantity
      or ri.inventory_quantity = ri.quantity * 1000
    )
),
updated as (
  update public.receipt_items ri
  set unit = 'kg',
      inventory_quantity = case when m.inventory_quantity is null then null else m.quantity end
  from mislabelled m
  where ri.id = m.id
  returning ri.id
)
insert into public.admin_audit_log (action, target_type, metadata)
select 'data_fix_0027', 'receipt_item', jsonb_build_object('gr_to_kg', jsonb_agg(to_jsonb(m)))
from mislabelled m
where exists (select 1 from updated)
having count(*) > 0;

-- Cantidades corregidas a mano sobre el mismo dato: el formulario ofrecía "gr."
-- como unidad precargada, así que arrastran la misma etiqueta.
with mislabelled as (
  select e.home_id, e.canonical_product_id, e.stock_quantity, e.stock_unit
  from public.pantry_item_edits e
  where lower(rtrim(trim(coalesce(e.stock_unit, '')), '.')) in ('g', 'gr', 'grs', 'gramo', 'gramos')
    and e.stock_quantity > 0
    and e.stock_quantity < 10
),
updated as (
  update public.pantry_item_edits e
  set stock_unit = 'kg', updated_at = now()
  from mislabelled m
  where e.home_id = m.home_id and e.canonical_product_id = m.canonical_product_id
  returning e.home_id
)
insert into public.admin_audit_log (action, target_type, metadata)
select 'data_fix_0027', 'pantry_item_edit', jsonb_build_object('gr_to_kg', jsonb_agg(to_jsonb(m)))
from mislabelled m
where exists (select 1 from updated)
having count(*) > 0;

commit;
