-- ============================================================================
-- Renombra "CONSUMIBLES DEL HOGAR" -> "HOGAR"
-- ============================================================================
-- La pantalla "Mi despensa" (vista por categorías) pide exactamente 7
-- categorías, con "HOGAR" en vez de "CONSUMIBLES DEL HOGAR" (0013). Es un
-- cambio de etiqueta, no de significado: se renombra el valor del enum
-- (metadato, no toca filas) para que todo lo que ya usa product_category
-- (canonical_products.category, interpreter_proposals.proposed_category,
-- y los selects de ReviewForm/ProposalCard/AliasDetailPanel/CanonicalProductRow
-- que leen PRODUCT_CATEGORIES) quede consistente sin migración de datos.
-- ============================================================================

begin;

alter type public.product_category rename value 'CONSUMIBLES DEL HOGAR' to 'HOGAR';

-- normalize_product_category: la etiqueta cambia, pero se sigue
-- reconociendo el texto antiguo como sinónimo de la nueva por si queda
-- algún dato o entrada de usuario todavía sin normalizar con el nombre viejo.
create or replace function public.normalize_product_category(p_category text)
returns public.product_category
language sql
immutable
set search_path = public
as $$
  select case public.immutable_unaccent(upper(trim(coalesce(p_category, ''))))
    when 'ALIMENTACION' then 'ALIMENTACIÓN'::public.product_category
    when 'BEBIDAS' then 'BEBIDAS'::public.product_category
    when 'HIGIENE PERSONAL' then 'HIGIENE PERSONAL'::public.product_category
    when 'LIMPIEZA' then 'LIMPIEZA'::public.product_category
    when 'HOGAR' then 'HOGAR'::public.product_category
    when 'MASCOTAS' then 'MASCOTAS'::public.product_category
    when 'VARIOS' then 'VARIOS'::public.product_category
    -- Sinónimos reales observados en 0007_interpreter_seed_data.sql.
    when 'LACTEOS' then 'ALIMENTACIÓN'::public.product_category
    when 'HUEVOS' then 'ALIMENTACIÓN'::public.product_category
    when 'PANADERIA' then 'ALIMENTACIÓN'::public.product_category
    when 'ACEITES' then 'ALIMENTACIÓN'::public.product_category
    -- Nombre anterior de "HOGAR" (0013), reconocido por compatibilidad.
    when 'CONSUMIBLES DEL HOGAR' then 'HOGAR'::public.product_category
    else 'VARIOS'::public.product_category
  end;
$$;

commit;
