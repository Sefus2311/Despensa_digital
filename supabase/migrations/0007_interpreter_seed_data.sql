-- ============================================================================
-- Datos de ejemplo para el intérprete global
-- ============================================================================
-- 0006 creó el modelo de datos y las funciones del intérprete, pero las
-- tablas quedaban vacías y nada las alimentaba todavía -- el panel de
-- moderación no tenía nada que mostrar. Esta migración:
--   1. siembra un puñado de productos/alias YA APROBADOS (para que
--      /admin/interpreter tenga diccionario real desde el primer momento);
--   2. siembra un puñado de propuestas de ejemplo, pendientes y en
--      conflicto (para que /admin/interpreter/pending y /conflicts se
--      puedan probar sin depender de crear tickets reales primero).
-- A partir de ahora, además, cada ticket que un usuario guarda
-- (saveReceiptReview, ver app/(app)/tickets/[id]/actions.ts) llama a
-- submit_interpreter_proposal por cada línea, así que el diccionario real
-- seguirá creciendo con uso normal de la app.
--
-- Son datos de ejemplo (nombres de supermercados/marcas usados de forma
-- genérica, igual que en el resto de la documentación del intérprete), no
-- ningún dato real de usuarios. La migración es idempotente: si ya se
-- aplicó una vez (se detecta comprobando si existe el canónico de ejemplo
-- "Yogur griego natural"), no vuelve a insertar nada.
-- ============================================================================

begin;

do $$
declare
  v_cp_yogur uuid;
  v_cp_leche uuid;
  v_cp_huevos uuid;
  v_cp_pan uuid;
  v_cp_aceite uuid;
  v_rp_yogur_hacendado uuid;
  v_rp_leche_hacendado uuid;
  v_rp_huevos_mercadona uuid;
  v_rp_pan_bimbo uuid;
  v_rp_aceite_carbonell uuid;
begin
  if exists (
    select 1 from public.canonical_products
    where normalized_name = public.normalize_product_text('Yogur griego natural')
  ) then
    raise notice 'Seed de ejemplo del intérprete ya aplicado, no se repite.';
    return;
  end if;

  -- ---- Productos canónicos -------------------------------------------------
  insert into public.canonical_products (canonical_name, category, default_unit)
  values ('Yogur griego natural', 'Lácteos', 'ud')
  returning id into v_cp_yogur;

  insert into public.canonical_products (canonical_name, category, default_unit)
  values ('Leche entera', 'Lácteos', 'l')
  returning id into v_cp_leche;

  insert into public.canonical_products (canonical_name, category, default_unit)
  values ('Huevos camperos L', 'Huevos', 'ud')
  returning id into v_cp_huevos;

  insert into public.canonical_products (canonical_name, category, default_unit)
  values ('Pan de molde integral', 'Panadería', 'ud')
  returning id into v_cp_pan;

  insert into public.canonical_products (canonical_name, category, default_unit)
  values ('Aceite de oliva virgen extra', 'Aceites', 'l')
  returning id into v_cp_aceite;

  -- ---- Productos de tienda --------------------------------------------------
  insert into public.retailer_products (canonical_product_id, retailer, brand, commercial_name, package_quantity, package_unit)
  values (v_cp_yogur, 'Mercadona', 'Hacendado', 'Yogur griego natural Hacendado 6x125g', 6, 'ud')
  returning id into v_rp_yogur_hacendado;

  insert into public.retailer_products (canonical_product_id, retailer, brand, commercial_name, package_quantity, package_unit)
  values (v_cp_leche, 'Mercadona', 'Hacendado', 'Leche entera Hacendado 1L', 1, 'l')
  returning id into v_rp_leche_hacendado;

  insert into public.retailer_products (canonical_product_id, retailer, brand, commercial_name, package_quantity, package_unit)
  values (v_cp_huevos, 'Mercadona', null, 'Huevos camperos L 12 unidades', 12, 'ud')
  returning id into v_rp_huevos_mercadona;

  insert into public.retailer_products (canonical_product_id, retailer, brand, commercial_name, package_quantity, package_unit)
  values (v_cp_pan, 'Carrefour', 'Bimbo', 'Pan de molde integral Bimbo', 1, 'ud')
  returning id into v_rp_pan_bimbo;

  insert into public.retailer_products (canonical_product_id, retailer, brand, commercial_name, package_quantity, package_unit)
  values (v_cp_aceite, 'Carrefour', 'Carbonell', 'Aceite de oliva virgen extra Carbonell 1L', 1, 'l')
  returning id into v_rp_aceite_carbonell;

  -- ---- Alias ya aprobados (diccionario real desde el arranque) -------------
  insert into public.product_aliases (retailer, raw_name, retailer_product_id, confidence_score, times_seen, times_confirmed)
  values
    ('Mercadona', 'YOG GRIE NAT H 6U', v_rp_yogur_hacendado, 0.97, 14, 12),
    ('Mercadona', 'LECHE ENT HACENDADO 1L', v_rp_leche_hacendado, 0.95, 22, 20),
    ('Mercadona', 'HUEVOS CAMP L 12U', v_rp_huevos_mercadona, 0.90, 8, 7),
    ('Carrefour', 'PAN MOLDE INTEGRAL BIMBO', v_rp_pan_bimbo, 0.92, 5, 5),
    ('Carrefour', 'AOVE CARBONELL 1L', v_rp_aceite_carbonell, 0.88, 6, 6);

  -- ---- Propuestas pendientes de ejemplo -------------------------------------
  insert into public.interpreter_proposals (
    retailer, raw_name, proposed_canonical_name, proposed_brand, proposed_category,
    proposed_quantity, proposed_unit, ai_confidence, status, user_confirmations
  ) values
    ('Mercadona', 'COCA COLA ZERO 1.5L', 'Coca-Cola Zero', 'Coca-Cola', 'Bebidas', 1.5, 'l', 0.91, 'pending', 2),
    ('Carrefour', 'DETERG LIQ 40D', 'Detergente líquido 40 dosis', null, 'Droguería', 40, 'dosis', 0.76, 'pending', 1),
    ('Mercadona', 'TOMATE FRITO 400G', 'Tomate frito', 'Hacendado', 'Conservas', 400, 'g', 0.83, 'pending', 1);

  -- ---- Conflicto de ejemplo: mismo texto, dos interpretaciones distintas ---
  insert into public.interpreter_proposals (
    retailer, raw_name, proposed_canonical_name, proposed_brand, proposed_category,
    proposed_quantity, proposed_unit, ai_confidence, status, user_confirmations, user_conflicts
  ) values
    ('Mercadona', 'YOGUR NATURAL PACK 8', 'Yogur natural Hacendado', 'Hacendado', 'Lácteos', 8, 'ud', 0.68, 'conflict', 1, 1),
    ('Mercadona', 'YOGUR NATURAL PACK 8', 'Yogur natural azucarado Hacendado', 'Hacendado', 'Lácteos', 8, 'ud', 0.61, 'conflict', 1, 1);
end $$;

commit;
