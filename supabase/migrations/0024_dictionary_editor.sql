-- ============================================================================
-- Editor del Diccionario (solo admin)
-- ============================================================================
-- El "Diccionario" es el conocimiento YA APROBADO del intérprete --
-- product_aliases -> retailer_products -> canonical_products (0006/0010) --,
-- no la cola de propuestas pendientes (interpreter_proposals, eso sigue
-- siendo "el Intérprete", esta herramienta no lo toca). Añade:
--   1. admin_search_dictionary(): listado paginado, con búsqueda/orden/filtro
--      resueltos en SQL (no traer miles de filas al navegador para filtrarlas
--      en JS, sección 17 del encargo) y un flag `is_duplicate` calculado con
--      pg_trgm sobre canonical_products (ya tiene índice GIN desde 0006).
--   2. admin_dictionary_summary(): recuentos para la cabecera (total /
--      revisar / posibles duplicados), con la MISMA definición de "revisar"/
--      "duplicado" que el punto 1, para que el resumen y la lista filtrada
--      nunca se contradigan.
--   3. merge_canonical_products(): UNIFICAR. Único punto delicado del
--      encargo -- ver el razonamiento completo en el comentario de la
--      función. Solo canonical_products (no se fusionan supermercados: es
--      texto plano sin relaciones, un typo se corrige editando la celda).
-- Todas exigen 'admin' explícitamente (más estricto que el resto del módulo,
-- que admite 'delegate') -- el encargo lo pide así en el punto 1.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. admin_search_dictionary()
-- ----------------------------------------------------------------------------
create or replace function public.admin_search_dictionary(
  p_search text default null,
  p_retailer text default null,
  p_category text default null,
  -- 'todos' (o null) | 'revisar' | 'duplicados'
  p_estado text default null,
  -- raw_name | canonical_name | retailer | category | brand | times_confirmed
  p_sort text default 'canonical_name',
  p_sort_dir text default 'asc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  alias_id uuid,
  raw_name text,
  canonical_product_id uuid,
  canonical_name text,
  category public.product_category,
  retailer text,
  retailer_product_id uuid,
  brand text,
  times_confirmed integer,
  confidence_score numeric,
  active boolean,
  is_duplicate boolean,
  estado text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sort_column text;
  v_sort_dir text;
  v_sql text;
begin
  if public.get_my_system_role() is distinct from 'admin' then
    raise exception 'Solo un administrador puede acceder al Editor del Diccionario';
  end if;

  -- Whitelist explícita antes de construir el ORDER BY dinámico -- nunca se
  -- interpola un valor recibido del cliente como identificador SQL.
  v_sort_column := case p_sort
    when 'raw_name' then 'raw_name'
    when 'retailer' then 'retailer'
    when 'category' then 'category'
    when 'brand' then 'brand'
    when 'times_confirmed' then 'times_confirmed'
    else 'canonical_name'
  end;
  v_sort_dir := case when lower(coalesce(p_sort_dir, '')) = 'desc' then 'desc' else 'asc' end;

  -- El resto de parámetros (búsqueda/filtros/paginación) va por USING, nunca
  -- interpolado -- format() sólo construye el ORDER BY (columna/dirección
  -- ya validadas arriba contra la whitelist, no vienen del cliente tal cual).
  v_sql := format(
    $q$
    with dup as (
      select distinct a.id as canonical_product_id
      from public.canonical_products a
      join public.canonical_products b
        on a.id <> b.id and a.normalized_name %% b.normalized_name
    ),
    base as (
      select
        pa.id as alias_id, pa.raw_name, cp.id as canonical_product_id, cp.canonical_name,
        cp.category, pa.retailer, rp.id as retailer_product_id, rp.brand,
        pa.times_confirmed, pa.confidence_score, pa.active,
        (dup.canonical_product_id is not null) as is_duplicate,
        case when coalesce(pa.confidence_score, 0) < 0.8 then 'revisar' else 'ok' end as estado
      from public.product_aliases pa
      join public.retailer_products rp on rp.id = pa.retailer_product_id
      join public.canonical_products cp on cp.id = rp.canonical_product_id
      left join dup on dup.canonical_product_id = cp.id
      where pa.deleted_at is null
        and ($1::text is null or
             pa.raw_name ilike '%%' || $1 || '%%' or
             cp.canonical_name ilike '%%' || $1 || '%%' or
             pa.retailer ilike '%%' || $1 || '%%' or
             coalesce(rp.brand, '') ilike '%%' || $1 || '%%')
        and ($2::text is null or pa.retailer = $2)
        and ($3::text is null or cp.category::text = $3)
    )
    select * from base
    where $4::text is null or $4 = 'todos'
       or ($4 = 'revisar' and estado = 'revisar')
       or ($4 = 'duplicados' and is_duplicate)
    order by %I %s nulls last, alias_id
    limit $5 offset $6
    $q$,
    v_sort_column, v_sort_dir
  );

  return query execute v_sql using
    nullif(trim(coalesce(p_search, '')), ''),
    nullif(trim(coalesce(p_retailer, '')), ''),
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_estado, '')), ''),
    greatest(least(coalesce(p_limit, 50), 500), 1),
    greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.admin_search_dictionary(text, text, text, text, text, text, integer, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. admin_dictionary_summary(): mismos criterios de "revisar"/"duplicado"
-- que admin_search_dictionary, para que el resumen nunca desentone con la
-- lista filtrada.
-- ----------------------------------------------------------------------------
create or replace function public.admin_dictionary_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_revisar integer;
  v_duplicados integer;
begin
  if public.get_my_system_role() is distinct from 'admin' then
    raise exception 'Solo un administrador puede acceder al Editor del Diccionario';
  end if;

  select count(*) into v_total from public.product_aliases where deleted_at is null;

  select count(*) into v_revisar
  from public.product_aliases
  where deleted_at is null and coalesce(confidence_score, 0) < 0.8;

  select count(*) into v_duplicados
  from public.product_aliases pa
  join public.retailer_products rp on rp.id = pa.retailer_product_id
  where pa.deleted_at is null
    and exists (
      select 1 from public.canonical_products b
      where b.id <> rp.canonical_product_id
        and b.normalized_name % (
          select normalized_name from public.canonical_products where id = rp.canonical_product_id
        )
    );

  return jsonb_build_object('total', v_total, 'revisar', v_revisar, 'duplicados', v_duplicados);
end;
$$;

grant execute on function public.admin_dictionary_summary() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. merge_canonical_products(): UNIFICAR
-- ----------------------------------------------------------------------------
-- canonical_products tiene exactamente 3 referencias reales en todo el
-- esquema (comprobado con grep antes de escribir esto, no se asume nada):
--   retailer_products.canonical_product_id  (not null, on delete cascade)
--   receta_ingredientes.producto_id          (nullable, on delete set null)
--   shopping_list_items.canonical_product_id (nullable, on delete set null)
-- Unificar varios canonical_products en uno (`p_target_id`) significa, por
-- cada uno de los `p_source_ids`:
--   1. Por cada retailer_product suyo: si el destino YA tiene uno
--      equivalente (mismo retailer + nombre comercial normalizado -- el
--      índice único de retailer_products es justo esa combinación), sus
--      alias se reapuntan a ESE existente y el duplicado se descarta; si no,
--      el retailer_product simplemente se reapunta al destino tal cual (sus
--      alias le siguen automáticamente, no hace falta tocarlos).
--   2. receta_ingredientes / shopping_list_items que señalaban al origen se
--      reapuntan al destino.
--   3. Sólo entonces se borra la fila canonical_products de origen -- en ese
--      momento ya no tiene ninguna referencia, así que no puede quedar
--      huérfana ni romper ninguna clave foránea.
-- No hay soft delete para canonical_products (a diferencia de
-- product_aliases): en vez de añadir esa infraestructura nueva sólo para
-- este caso, la reversibilidad la da el propio historial -- interpreter_
-- history y admin_audit_log guardan el estado completo de cada producto
-- fusionado (jsonb) antes de borrarlo, así que la operación es auditable y
-- reconstruible a mano aunque no tenga un botón de "deshacer" en la UI.
-- Es una única función ⇒ una única transacción: cualquier error en
-- cualquier paso revierte TODO (ningún estado parcialmente unificado).
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

grant execute on function public.merge_canonical_products(uuid[], uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. update_product_alias_retailer(): faltaba una vía para corregir el
-- supermercado de un alias -- update_product_alias (0006/0010) sólo permite
-- cambiar `retailer_product_id`/`active`, nunca `retailer`. Mismo patrón que
-- el resto de "editar conocimiento ya aprobado" (delegate/admin, historial,
-- auditoría); reutiliza normalize_supermarket_name() (0017) para que un
-- SUPERMERCADO editado a mano quede igual de en-mayúsculas que el resto.
-- Sólo toca product_aliases.retailer (lo que se ve como SUPERMERCADO en el
-- Diccionario) -- no retailer_products.retailer, que puede estar compartido
-- por otros alias del mismo producto de tienda y no se debe tocar a ciegas
-- desde la edición de un único alias.
-- ----------------------------------------------------------------------------
create or replace function public.update_product_alias_retailer(p_id uuid, p_retailer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.system_role;
  v_before public.product_aliases%rowtype;
  v_after public.product_aliases%rowtype;
  v_retailer text;
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  v_retailer := public.normalize_supermarket_name(p_retailer);
  if v_retailer is null or v_retailer = '' then
    raise exception 'El supermercado no puede estar vacío';
  end if;

  select * into v_before from public.product_aliases where id = p_id;
  if v_before.id is null then
    raise exception 'Alias no encontrado';
  end if;
  if v_before.deleted_at is not null then
    raise exception 'El alias está eliminado; restáuralo antes de editarlo';
  end if;

  update public.product_aliases
  set retailer = v_retailer, updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_after;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'product_alias_edited', 'product_alias', p_id, jsonb_build_object('retailer', v_retailer));

  perform public.log_interpreter_history('product_alias', p_id, 'update', to_jsonb(v_before), to_jsonb(v_after));
end;
$$;

grant execute on function public.update_product_alias_retailer(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. update_dictionary_canonical_name() / update_dictionary_category():
-- ediciones de UNA sola celda para la tabla tipo Excel.
--
-- OJO: no se reutiliza update_canonical_product() para esto porque NO hace
-- una actualización parcial -- sobrescribe SIEMPRE canonical_name, category
-- y default_unit con lo que reciba (category=null cae a 'VARIOS' vía
-- normalize_product_category, default_unit=null lo borra). Iría bien si la
-- UI siempre reenviase los tres campos actuales, pero eso abre la puerta
-- justo al error que pide evitar la sección 4 ("no introducir fácilmente
-- errores de normalización") si dos ediciones seguidas se cruzan con datos
-- desactualizados. Estas dos funciones tocan un único campo cada una, sin
-- tocar el resto -- nada que resincronizar, nada que pisar por accidente.
-- ----------------------------------------------------------------------------
create or replace function public.update_dictionary_canonical_name(p_id uuid, p_canonical_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.system_role;
  v_before public.canonical_products%rowtype;
  v_after public.canonical_products%rowtype;
  v_name text := trim(coalesce(p_canonical_name, ''));
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;
  if v_name = '' then
    raise exception 'El nombre no puede estar vacío';
  end if;

  select * into v_before from public.canonical_products where id = p_id;
  if v_before.id is null then
    raise exception 'Producto canónico no encontrado';
  end if;

  update public.canonical_products
  set canonical_name = v_name, updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_after;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'canonical_product_edited', 'canonical_product', p_id, jsonb_build_object('canonical_name', v_name));

  perform public.log_interpreter_history('canonical_product', p_id, 'update', to_jsonb(v_before), to_jsonb(v_after));
end;
$$;

create or replace function public.update_dictionary_category(p_id uuid, p_category text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.system_role;
  v_before public.canonical_products%rowtype;
  v_after public.canonical_products%rowtype;
  v_category public.product_category := public.normalize_product_category(p_category);
begin
  v_role := public.get_my_system_role();
  if v_role is distinct from 'admin' and v_role is distinct from 'delegate' then
    raise exception 'No autorizado';
  end if;

  select * into v_before from public.canonical_products where id = p_id;
  if v_before.id is null then
    raise exception 'Producto canónico no encontrado';
  end if;

  update public.canonical_products
  set category = v_category, updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning * into v_after;

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'canonical_product_edited', 'canonical_product', p_id, jsonb_build_object('category', v_category));

  perform public.log_interpreter_history('canonical_product', p_id, 'update', to_jsonb(v_before), to_jsonb(v_after));
end;
$$;

grant execute on function public.update_dictionary_canonical_name(uuid, text) to authenticated;
grant execute on function public.update_dictionary_category(uuid, text) to authenticated;

commit;
