-- ============================================================================
-- Importación por JSON: asociar el PDF del ticket
-- ============================================================================
-- import_receipt_json() (0019) creaba el ticket sin imagen. Ahora acepta la
-- ruta del PDF ya subido al bucket privado `receipts` y la guarda en
-- receipts.image_path, de modo que las pantallas de revisión e historial ya
-- muestren «Ver PDF del ticket» (igual que un ticket subido a mano).
--
-- Seguridad: la ruta debe empezar por "{p_home_id}/" -- la misma convención y
-- carpeta que exigen las políticas de Storage --, así un ticket no puede
-- apuntar al archivo de otra casa.
--
-- Cambia la firma (un parámetro más), por lo que hay que eliminar la función
-- anterior: con create or replace quedarían dos sobrecargas.
-- ============================================================================

begin;

drop function if exists public.import_receipt_json(uuid, jsonb, jsonb);

create function public.import_receipt_json(
  p_home_id uuid,
  p_receipt jsonb,
  p_lines jsonb,
  p_image_path text default null
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
  v_image_path text := nullif(trim(p_image_path), '');
  v_existing public.receipts%rowtype;
  v_reason text;
  v_receipt_id uuid;
begin
  if v_user is null or p_home_id is null or p_home_id not in (select public.get_my_home_ids()) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if v_image_path is not null and left(v_image_path, length(p_home_id::text) + 1) <> p_home_id::text || '/' then
    raise exception 'invalid_image_path' using errcode = '42501';
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
      (p_receipt->>'total_amount')::numeric, v_image_path, 'pending_review',
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

grant execute on function public.import_receipt_json(uuid, jsonb, jsonb, text) to authenticated;

commit;
