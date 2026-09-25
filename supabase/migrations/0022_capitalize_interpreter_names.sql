-- ============================================================================
-- Primera letra en mayúscula también en el catálogo global del intérprete
-- ============================================================================
-- 0021 corrigió receipt_items.product_name (la tabla del ticket), pero
-- "Mi despensa" (que muestra canonical_products.canonical_name) y la lista de
-- propuestas pendientes del intérprete (interpreter_proposals.
-- proposed_canonical_name, pantallas /admin/interpreter?estado=validar y
-- /admin/interpreter/conflicts) seguían mostrando el nombre interpretado tal
-- cual se guardó -- en minúsculas, porque hasta ahora la app enviaba
-- p_proposed_canonical_name ya en minúsculas (app/(app)/tickets/[id]/actions.ts,
-- ya corregido). Faltaba: 1) corregir los datos ya guardados, y 2) blindarlo
-- con un trigger, igual que receipt_items, para que ninguna vía (aprobar una
-- propuesta, editarla, crear un producto canónico a mano en /admin/products)
-- pueda dejarlo en otra capitalización.
--
-- Repite la creación de capitalize_first_letter() (idéntica a la de 0021) para
-- que esta migración no dependa de haber aplicado 0021 antes.
--
-- No toca receipt_items.raw_name/product_aliases.raw_name (texto literal del
-- ticket) ni retailer_products.commercial_name (nombre comercial del envase,
-- no el "producto interpretado").
-- ============================================================================

begin;

create or replace function public.capitalize_first_letter(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_text is null or p_text = '' then p_text
    else
      translate(
        upper(left(lower(p_text), 1)),
        'áéíóúàèìòùâêîôûäëïöüñç',
        'ÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÑÇ'
      ) || substring(lower(p_text) from 2)
  end;
$$;

-- ----------------------------------------------------------------------------
-- canonical_products.canonical_name -- el nombre que ve el usuario en
-- "Mi despensa", en las recetas y en el diccionario aprobado del intérprete.
-- ----------------------------------------------------------------------------
update public.canonical_products
  set canonical_name = public.capitalize_first_letter(canonical_name)
  where canonical_name <> public.capitalize_first_letter(canonical_name);

create or replace function public.enforce_canonical_name_capitalized()
returns trigger
language plpgsql
as $$
begin
  new.canonical_name := public.capitalize_first_letter(new.canonical_name);
  return new;
end;
$$;

drop trigger if exists canonical_products_name_capitalize on public.canonical_products;
create trigger canonical_products_name_capitalize
  before insert or update of canonical_name on public.canonical_products
  for each row execute function public.enforce_canonical_name_capitalized();

-- ----------------------------------------------------------------------------
-- interpreter_proposals.proposed_canonical_name -- lo que se ve en las
-- tarjetas de "Validar" y en "Conflictos". Solo se corrigen las propuestas
-- todavía pendientes/en conflicto (las aprobadas/rechazadas quedan como
-- registro histórico de lo que se propuso/decidió en su momento).
-- ----------------------------------------------------------------------------
update public.interpreter_proposals
  set proposed_canonical_name = public.capitalize_first_letter(proposed_canonical_name)
  where status in ('pending', 'conflict')
    and proposed_canonical_name <> public.capitalize_first_letter(proposed_canonical_name);

create or replace function public.enforce_proposed_canonical_name_capitalized()
returns trigger
language plpgsql
as $$
begin
  new.proposed_canonical_name := public.capitalize_first_letter(new.proposed_canonical_name);
  return new;
end;
$$;

drop trigger if exists interpreter_proposals_name_capitalize on public.interpreter_proposals;
create trigger interpreter_proposals_name_capitalize
  before insert or update of proposed_canonical_name on public.interpreter_proposals
  for each row execute function public.enforce_proposed_canonical_name_capitalized();

commit;
