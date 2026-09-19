-- ============================================================================
-- Supermercados siempre en MAYÚSCULAS
-- ============================================================================
-- Regla: todo nombre de supermercado se almacena en MAYÚSCULAS. La app ya lo
-- normaliza antes de guardar (lib/supermarkets.ts -> normalizeSupermarketName);
-- esta migración:
--   1. crea normalize_supermarket_name() (mismo criterio que la función de TS);
--   2. normaliza los datos existentes (receipts.store_name y las columnas
--      `retailer` del intérprete);
--   3. añade triggers BEFORE INSERT/UPDATE como red de seguridad, para que
--      ningún camino (RPC, SQL directo, seeds futuros) pueda guardar otra
--      capitalización;
--   4. crea list_supermarkets(), la fuente del selector de SUPERMERCADO del
--      gestor del intérprete (nombres distintos ya en mayúsculas).
--
-- Nota sobre collation: en bases con collation "C" upper() no toca los
-- caracteres no ASCII, así que se aplica además translate() explícito para las
-- letras del español/catalán (á é í ó ú ü ñ ç y variantes con otras tildes).
-- Es idempotente y determinista con cualquier collation.
-- ============================================================================

begin;

create or replace function public.normalize_supermarket_name(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select translate(
    upper(trim(regexp_replace(p_name, '\s+', ' ', 'g'))),
    'áéíóúàèìòùâêîôûäëïöüñç',
    'ÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÑÇ'
  );
$$;

-- ----------------------------------------------------------------------------
-- Comprobación previa: normalizar puede hacer coincidir filas que hoy sólo
-- difieren en mayúsculas ("Mercadona" / "MERCADONA") y chocar con los índices
-- únicos. En vez de fusionar datos aprobados automáticamente, se aborta con un
-- mensaje claro para resolverlo a mano.
-- ----------------------------------------------------------------------------
do $$
declare
  v_alias_collisions int;
  v_retailer_collisions int;
begin
  select count(*) into v_alias_collisions from (
    select 1
    from public.product_aliases
    where deleted_at is null
    group by public.normalize_supermarket_name(retailer), normalized_raw_name
    having count(*) > 1
  ) t;

  select count(*) into v_retailer_collisions from (
    select 1
    from public.retailer_products
    group by canonical_product_id, public.normalize_supermarket_name(retailer), normalized_commercial_name
    having count(*) > 1
  ) t;

  if v_alias_collisions > 0 or v_retailer_collisions > 0 then
    raise exception
      'Migración 0017 abortada: al pasar el supermercado a mayúsculas habría % alias y % productos de tienda duplicados (mismo supermercado con distinta capitalización). Fusiona o elimina esos duplicados y vuelve a ejecutarla.',
      v_alias_collisions, v_retailer_collisions;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Normalizar datos existentes
-- ----------------------------------------------------------------------------
update public.receipts
  set store_name = public.normalize_supermarket_name(store_name)
  where store_name is not null
    and store_name is distinct from public.normalize_supermarket_name(store_name);

update public.retailer_products
  set retailer = public.normalize_supermarket_name(retailer)
  where retailer is distinct from public.normalize_supermarket_name(retailer);

update public.product_aliases
  set retailer = public.normalize_supermarket_name(retailer)
  where retailer is distinct from public.normalize_supermarket_name(retailer);

update public.interpreter_proposals
  set retailer = public.normalize_supermarket_name(retailer)
  where retailer is distinct from public.normalize_supermarket_name(retailer);

-- ----------------------------------------------------------------------------
-- Triggers de seguridad
-- ----------------------------------------------------------------------------
create or replace function public.enforce_receipt_store_name_uppercase()
returns trigger
language plpgsql
as $$
begin
  new.store_name := nullif(public.normalize_supermarket_name(new.store_name), '');
  return new;
end;
$$;

create or replace function public.enforce_retailer_uppercase()
returns trigger
language plpgsql
as $$
begin
  new.retailer := public.normalize_supermarket_name(new.retailer);
  return new;
end;
$$;

drop trigger if exists receipts_store_name_uppercase on public.receipts;
create trigger receipts_store_name_uppercase
  before insert or update of store_name on public.receipts
  for each row execute function public.enforce_receipt_store_name_uppercase();

drop trigger if exists retailer_products_retailer_uppercase on public.retailer_products;
create trigger retailer_products_retailer_uppercase
  before insert or update of retailer on public.retailer_products
  for each row execute function public.enforce_retailer_uppercase();

drop trigger if exists product_aliases_retailer_uppercase on public.product_aliases;
create trigger product_aliases_retailer_uppercase
  before insert or update of retailer on public.product_aliases
  for each row execute function public.enforce_retailer_uppercase();

drop trigger if exists interpreter_proposals_retailer_uppercase on public.interpreter_proposals;
create trigger interpreter_proposals_retailer_uppercase
  before insert or update of retailer on public.interpreter_proposals
  for each row execute function public.enforce_retailer_uppercase();

-- ----------------------------------------------------------------------------
-- list_supermarkets(): supermercados existentes, sin duplicados y ordenados.
-- SECURITY INVOKER: usa las políticas RLS de quien llama (el gestor del
-- intérprete sólo lo usan delegate/admin, que ya leen estas tres tablas).
-- ----------------------------------------------------------------------------
create or replace function public.list_supermarkets()
returns setof text
language sql
stable
as $$
  select distinct public.normalize_supermarket_name(retailer) as name
  from (
    select retailer from public.product_aliases
    union all
    select retailer from public.retailer_products
    union all
    select retailer from public.interpreter_proposals
  ) all_retailers
  where trim(retailer) <> ''
  order by 1;
$$;

grant execute on function public.list_supermarkets() to authenticated;

commit;
