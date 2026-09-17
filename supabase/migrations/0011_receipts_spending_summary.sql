-- ============================================================================
-- Historial: gasto del mes/año en curso + filtro por lugar de compra
-- ============================================================================
-- Añade una clave normalizada de comercio a `receipts` (reutilizando
-- normalize_product_text(), ya usada para lo mismo en 0006/0008/0009) y una
-- función de agregación para no tener que descargar todas las compras al
-- servidor solo para sumarlas.
--
-- store_key resuelve la duplicación trivial por may/min/acentos/espacios
-- ("Mercadona" vs "MERCADONA "), pero NO variaciones de fondo del nombre
-- ("MERCADONA SA" vs "Mercadona S.A." vs "MERCADONA 1234") -- eso requeriría
-- un concepto real de comercio canónico (candidato natural: fusionarlo con el
-- `retailer` del intérprete, ver docs/INTERPRETER_ARCHITECTURE.md) y queda
-- deliberadamente fuera de esta migración.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. receipts.store_key: columna generada, mismo patrón que normalized_name /
-- normalized_raw_name / normalized_commercial_name (0006). store_name nulo
-- normaliza a '' -- esa es la clave que agrupa "Sin identificar".
-- ----------------------------------------------------------------------------
alter table public.receipts
  add column if not exists store_key text
    generated always as (public.normalize_product_text(store_name)) stored;

create index if not exists receipts_home_id_store_key_idx
  on public.receipts (home_id, store_key);

-- ----------------------------------------------------------------------------
-- 2. get_home_spending_summary(): suma total_amount de los tickets revisados
-- de una Casa dentro de dos rangos de fecha (mes/año en curso, calculados en
-- TypeScript -- ver lib/spending.ts -- para no depender de la zona horaria
-- del servidor de BD), opcionalmente filtrando por store_key.
--
-- security invoker (mismo patrón que get_home_pantry en 0008/0009): se
-- ejecuta con los privilegios de quien llama, así que la RLS de `receipts`
-- (CRUD sólo sobre Casas propias, ver 0003) se sigue aplicando exactamente
-- igual que si la consulta la hiciera el cliente directamente -- pasar un
-- p_home_id ajeno simplemente no devuelve filas.
-- ----------------------------------------------------------------------------
create or replace function public.get_home_spending_summary(
  p_home_id uuid,
  p_store_key text default null,
  p_month_start date default null,
  p_month_end date default null,
  p_year_start date default null,
  p_year_end date default null
)
returns table (month_total numeric, year_total numeric)
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
    ), 0)::numeric(12, 2) as year_total
  from public.receipts
  where home_id = p_home_id
    and status = 'reviewed'
    and (p_store_key is null or store_key = p_store_key);
$$;

commit;
