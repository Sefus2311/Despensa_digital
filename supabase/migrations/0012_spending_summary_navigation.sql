-- ============================================================================
-- Historial: navegación de mes/año anteriores en el gasto
-- ============================================================================
-- Extiende get_home_spending_summary() (0011) para devolver también la fecha
-- de la compra más antigua (respetando el mismo filtro de home/comercio), que
-- la página usa para no dejar retroceder a un mes/año sin compras posibles.
-- No cambia el resto de su comportamiento ni su firma de parámetros.
-- ============================================================================

begin;

-- Postgres no permite que CREATE OR REPLACE cambie el tipo de retorno de una
-- función existente (aquí, añadir la columna earliest_purchase_date a un
-- RETURNS TABLE) -- hay que borrarla primero.
drop function if exists public.get_home_spending_summary(uuid, text, date, date, date, date);

create function public.get_home_spending_summary(
  p_home_id uuid,
  p_store_key text default null,
  p_month_start date default null,
  p_month_end date default null,
  p_year_start date default null,
  p_year_end date default null
)
returns table (month_total numeric, year_total numeric, earliest_purchase_date date)
language sql
security invoker
set search_path = public
stable
as $$
  select
    coalesce(sum(total_amount) filter (
      where p_month_start is not null and p_month_end is not null
        and purchase_date >= p_month_start and purchase_date < p_month_end
    ), 0)::numeric(12, 2) as month_total,
    coalesce(sum(total_amount) filter (
      where p_year_start is not null and p_year_end is not null
        and purchase_date >= p_year_start and purchase_date < p_year_end
    ), 0)::numeric(12, 2) as year_total,
    min(purchase_date) as earliest_purchase_date
  from public.receipts
  where home_id = p_home_id
    and status = 'reviewed'
    and (p_store_key is null or store_key = p_store_key);
$$;

commit;
