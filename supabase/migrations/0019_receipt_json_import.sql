-- ============================================================================
-- Importación manual de tickets por JSON (receipt_interpretation_v1)
-- ============================================================================
-- Un ticket importado NO trae imagen y debe quedar "pendiente de revisión"
-- hasta que el usuario lo confirme. Esta migración:
--   1. receipts.image_path pasa a ser opcional (un JSON no tiene imagen);
--   2. añade el estado 'pending_review' (equivale a PENDIENTE_REVISION);
--   3. receipts: identificadores para detectar duplicados (nº de ticket,
--      proveedor + id de mensaje, hash del documento) + import_data (jsonb con
--      los datos secundarios: impuestos, descuentos, avisos, dirección...);
--   4. receipt_items: campos de la interpretación (producto interpretado,
--      categoría, marca, nombre comercial, uds por pack, cantidad de
--      inventario, confianza, revisión, notas, nº de línea, si es de inventario);
--   5. la despensa (get_home_pantry / count_home_pending_interpretation) SOLO
--      cuenta tickets 'reviewed' y líneas de inventario -- así un ticket
--      importado no toca la despensa hasta confirmarse. Para los datos
--      existentes es equivalente: hasta ahora las líneas solo se creaban al
--      guardar la revisión, que deja el ticket en 'reviewed';
--   6. import_receipt_json(): crea cabecera + líneas en UNA transacción
--      (todo o nada), SECURITY INVOKER (aplica la RLS del usuario), comprueba
--      pertenencia a la casa y detecta duplicados. No crea movimientos de
--      inventario ni conocimiento del intérprete.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1 y 2. image_path opcional + estado pending_review
-- ----------------------------------------------------------------------------
alter table public.receipts alter column image_path drop not null;

do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.receipts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.receipts drop constraint %I', v_constraint);
  end loop;
end $$;

alter table public.receipts
  add constraint receipts_status_check
  check (status in ('uploaded', 'processing', 'pending_review', 'reviewed', 'error'));

-- ----------------------------------------------------------------------------
-- 3. receipts: identificadores de origen + datos secundarios
-- ----------------------------------------------------------------------------
alter table public.receipts
  add column if not exists receipt_number text,
  add column if not exists source_provider text,
  add column if not exists source_message_id text,
  add column if not exists source_document_hash text,
  add column if not exists import_data jsonb;

-- Red de seguridad frente a dobles importaciones simultáneas (la función
-- también comprueba antes de insertar, para poder avisar con un mensaje claro).
create unique index if not exists receipts_home_source_message_key
  on public.receipts (home_id, coalesce(source_provider, ''), source_message_id)
  where source_message_id is not null;

create unique index if not exists receipts_home_store_number_key
  on public.receipts (home_id, store_name, receipt_number)
  where receipt_number is not null and store_name is not null;

create unique index if not exists receipts_home_document_hash_key
  on public.receipts (home_id, source_document_hash)
  where source_document_hash is not null;

-- ----------------------------------------------------------------------------
-- 4. receipt_items: campos de la interpretación
--    raw_name sigue siendo el texto del ticket; product_name es el producto
--    interpretado (en minúsculas). Las líneas manuales los dejan a null.
-- ----------------------------------------------------------------------------
alter table public.receipt_items
  add column if not exists line_number integer,
  add column if not exists product_name text,
  add column if not exists category public.product_category,
  add column if not exists brand text,
  add column if not exists commercial_name text,
  add column if not exists units_per_pack numeric(10, 3)
    check (units_per_pack is null or units_per_pack >= 0),
  add column if not exists inventory_quantity numeric(10, 3)
    check (inventory_quantity is null or inventory_quantity >= 0),
  add column if not exists confidence numeric(4, 3)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add column if not exists review_required boolean not null default false,
  add column if not exists notes text,
  add column if not exists is_inventory_item boolean not null default true;

-- ----------------------------------------------------------------------------
-- 5. Despensa: solo tickets confirmados y líneas de inventario
--    get_home_pantry: misma definición que 0013 (con package_quantity, categoría
--    como enum y unidad con fallback a default_unit) más el filtro; hay que
--    hacer drop porque create or replace no puede cambiar el tipo de retorno.
--    count_home_pending_interpretation: misma que 0010 más el filtro.
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
    rp.package_quantity,
    coalesce(ri.unit, rp.package_unit, cp.default_unit) as unit,
    r.purchase_date,
    ri.raw_name
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
    and r.status = 'reviewed'
    and ri.is_inventory_item
    and not exists (
      select 1 from public.product_aliases pa
      where pa.active
        and pa.deleted_at is null
        and public.normalize_product_text(pa.retailer) = public.normalize_product_text(coalesce(r.store_name, ''))
        and pa.normalized_raw_name = public.normalize_product_text(ri.raw_name)
    );
$$;

-- ----------------------------------------------------------------------------
-- 6. import_receipt_json(): importación atómica
--    p_receipt: cabecera + import_data; p_lines: array de líneas (ver
--    lib/receipt-import/adapter.ts). El estado se fija AQUÍ a 'pending_review'
--    (el payload no lo decide) y la casa llega aparte, nunca dentro del JSON.
--    Devuelve {status:'created', receipt_id} o
--    {status:'duplicate', receipt_id, receipt_status, reason}.
--    Cualquier error revierte la función entera (cabecera y líneas).
-- ----------------------------------------------------------------------------
create or replace function public.import_receipt_json(
  p_home_id uuid,
  p_receipt jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_store text := public.normalize_supermarket_name(p_receipt->>'store_name');
  v_number text := nullif(trim(p_receipt->>'receipt_number'), '');
  v_provider text := nullif(trim(p_receipt->>'source_provider'), '');
  v_message text := nullif(trim(p_receipt->>'source_message_id'), '');
  v_hash text := nullif(trim(p_receipt->>'source_document_hash'), '');
  v_existing public.receipts%rowtype;
  v_reason text;
  v_receipt_id uuid;
begin
  if v_user is null or p_home_id is null or p_home_id not in (select public.get_my_home_ids()) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if v_store is null or v_store = '' then
    raise exception 'Falta el supermercado';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'El ticket no contiene productos';
  end if;

  -- Duplicados: id de mensaje, hash del documento, o supermercado + nº de ticket.
  if v_message is not null then
    select * into v_existing from public.receipts
    where home_id = p_home_id
      and coalesce(source_provider, '') = coalesce(v_provider, '')
      and source_message_id = v_message
    limit 1;
    if found then v_reason := 'provider_message_id'; end if;
  end if;

  if v_reason is null and v_hash is not null then
    select * into v_existing from public.receipts
    where home_id = p_home_id and source_document_hash = v_hash
    limit 1;
    if found then v_reason := 'document_hash'; end if;
  end if;

  if v_reason is null and v_number is not null then
    select * into v_existing from public.receipts
    where home_id = p_home_id and store_name = v_store and receipt_number = v_number
    limit 1;
    if found then v_reason := 'receipt_number'; end if;
  end if;

  if v_reason is not null then
    return jsonb_build_object(
      'status', 'duplicate',
      'receipt_id', v_existing.id,
      'receipt_status', v_existing.status,
      'reason', v_reason
    );
  end if;

  begin
    insert into public.receipts (
      home_id, user_id, store_name, purchase_date, total_amount, image_path, status,
      receipt_number, source_provider, source_message_id, source_document_hash, import_data
    ) values (
      p_home_id, v_user, v_store, (p_receipt->>'purchase_date')::date,
      (p_receipt->>'total_amount')::numeric, null, 'pending_review',
      v_number, v_provider, v_message, v_hash, p_receipt->'import_data'
    ) returning id into v_receipt_id;

    insert into public.receipt_items (
      receipt_id, raw_name, quantity, unit, unit_price, total_price,
      line_number, product_name, category, brand, commercial_name, units_per_pack,
      inventory_quantity, confidence, review_required, notes, is_inventory_item
    )
    select
      v_receipt_id,
      l->>'raw_name',
      (l->>'quantity')::numeric,
      l->>'unit',
      (l->>'unit_price')::numeric,
      (l->>'total_price')::numeric,
      (l->>'line_number')::integer,
      lower(l->>'product_name'),
      public.normalize_product_category(l->>'category'),
      nullif(l->>'brand', ''),
      nullif(l->>'commercial_name', ''),
      (l->>'units_per_pack')::numeric,
      (l->>'inventory_quantity')::numeric,
      (l->>'confidence')::numeric,
      coalesce((l->>'review_required')::boolean, false),
      nullif(l->>'notes', ''),
      coalesce((l->>'is_inventory_item')::boolean, true)
    from jsonb_array_elements(p_lines) as l;
  exception when unique_violation then
    -- Otra importación idéntica se coló entre la comprobación y el insert: el
    -- bloque se ha revertido; se devuelve el ticket que ganó la carrera.
    select * into v_existing from public.receipts
    where home_id = p_home_id
      and (
        (v_message is not null and coalesce(source_provider, '') = coalesce(v_provider, '') and source_message_id = v_message)
        or (v_hash is not null and source_document_hash = v_hash)
        or (v_number is not null and store_name = v_store and receipt_number = v_number)
      )
    limit 1;
    if not found then
      raise;
    end if;
    return jsonb_build_object(
      'status', 'duplicate',
      'receipt_id', v_existing.id,
      'receipt_status', v_existing.status,
      'reason', 'receipt_number'
    );
  end;

  return jsonb_build_object('status', 'created', 'receipt_id', v_receipt_id);
end;
$$;

grant execute on function public.import_receipt_json(uuid, jsonb, jsonb) to authenticated;

commit;
