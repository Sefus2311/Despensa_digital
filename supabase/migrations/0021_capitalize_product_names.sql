-- ============================================================================
-- Nombre de producto interpretado: primera letra en mayúscula
-- ============================================================================
-- Hasta ahora receipt_items.product_name se guardaba siempre en minúsculas
-- (app/(app)/tickets/[id]/actions.ts, lib/receipt-import/adapter.ts). A partir
-- de ahora se guarda con la primera letra en mayúscula y el resto en
-- minúsculas -- lib/format.ts:capitalizeFirstLetter es la única regla en TS.
-- Esta migración:
--   1. crea capitalize_first_letter() (mismo criterio que la función de TS);
--   2. corrige los product_name ya guardados;
--   3. añade un trigger BEFORE INSERT/UPDATE como red de seguridad.
--
-- Alcance deliberadamente acotado a receipt_items.product_name -- que es
-- donde estaba el error reportado (tabla del ticket) -- y NO toca
-- canonical_products.canonical_name: ese catálogo ya tiene nombres
-- gestionados a mano por delegate/admin (p. ej. "Leche entera Hacendado",
-- con una marca capitalizada en medio) y forzar minúsculas+mayúscula inicial
-- ahí degradaría nombres ya correctos. Tampoco toca product_aliases.raw_name
-- (debe conservarse exactamente como aparece en el ticket) ni
-- interpreter_proposals (conocimiento pendiente de revisión manual).
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

update public.receipt_items
  set product_name = public.capitalize_first_letter(product_name)
  where product_name is not null
    and product_name <> public.capitalize_first_letter(product_name);

create or replace function public.enforce_product_name_capitalized()
returns trigger
language plpgsql
as $$
begin
  new.product_name := public.capitalize_first_letter(new.product_name);
  return new;
end;
$$;

drop trigger if exists receipt_items_product_name_capitalize on public.receipt_items;
create trigger receipt_items_product_name_capitalize
  before insert or update of product_name on public.receipt_items
  for each row execute function public.enforce_product_name_capitalized();

commit;
