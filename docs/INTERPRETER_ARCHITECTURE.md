# Arquitectura del intérprete global de productos

Implementado en `supabase/migrations/0006_interpreter_and_admin.sql`. Este
documento describe el modelo de datos, el flujo de propuestas/aprobación, la
detección de conflictos, la seguridad y la auditoría. La UI de moderación
vive bajo `app/(app)/admin/interpreter*` y `app/(app)/admin/products`.

No incluye todavía: lectura OCR, motor de IA real, ni fusión de productos
(ver "Pendiente" al final).

## Por qué existe

Un mismo producto aparece en los tickets con textos distintos según la
tienda y el formato de impresión ("YOG GRIE NAT H 6U", "YOGUR GRIEGO NAT.
HACENDADO 6X125G"...). El intérprete traduce ese texto crudo a un producto
canónico reconocible, de forma reutilizable entre todos los usuarios de la
plataforma (no por Casa).

## Modelo de datos

```
interpreter_proposals  --(aprobar)-->  product_aliases  --(N:1)-->  retailer_products  --(N:1)-->  canonical_products
```

- **`canonical_products`** — el producto genérico ("Yogur griego natural").
  `normalized_name` es una columna generada (minúsculas, sin acentos,
  espacios colapsados) con índice único: no puede haber dos canónicos que
  normalicen igual.
- **`retailer_products`** — el producto comercial concreto de una tienda
  ("Yogur griego natural Hacendado 6×125 g" en Mercadona), enlazado a un
  `canonical_products`. Único por `(canonical_product_id, retailer,
  normalized_commercial_name)`.
- **`product_aliases`** — conocimiento **aprobado y global**: para un
  `(retailer, normalized_raw_name)` dado, a qué `retailer_products`
  corresponde. Único por `(retailer, normalized_raw_name)` — como mucho un
  alias activo por texto de ticket y tienda. Lleva `confidence_score`,
  `times_seen`, `times_confirmed` y un flag `active` (desactivar en vez de
  borrar, ver más abajo).
- **`interpreter_proposals`** — conocimiento **pendiente de revisión**:
  propuestas generadas por IA, por usuarios al revisar su ticket, o
  correcciones. Estados: `pending`, `conflict`, `approved`, `rejected`.

Todas estas tablas son **globales**, no llevan `home_id` y no tienen
relación alguna con `home_members`/RLS de Casas.

## Normalización de texto

`public.normalize_product_text(text)` (minúsculas + `unaccent` + espacios
colapsados/recortados) es la base de toda comparación y deduplicación.
`unaccent()` no es `IMMUTABLE` por defecto (depende del diccionario de
búsqueda activo), así que se envuelve en `immutable_unaccent()`, que fija
explícitamente el diccionario `'unaccent'` — el patrón estándar de
Postgres/Supabase para poder usarla en columnas generadas (`normalized_name`,
`normalized_raw_name`, `normalized_commercial_name`) e índices.

El nombre "bonito" (`canonical_name`, `raw_name`...) se conserva siempre tal
cual para mostrarlo al usuario; sólo la versión normalizada se usa para
comparar/deduplicar.

## Flujo de propuestas (`submit_interpreter_proposal`)

Cualquier usuario autenticado puede llamar a
`submit_interpreter_proposal(retailer, raw_name, proposed_canonical_name, ...)`.
Es el único camino de escritura para un `user` normal.

**Conectado al flujo real de tickets**: `saveReceiptReview`
(`app/(app)/tickets/[id]/actions.ts`) llama a esta función una vez por cada
línea guardada, usando `store_name` como `retailer`. V0.1 no tiene OCR/IA
todavía — el texto que el usuario teclea a mano es a la vez el "texto crudo
del ticket" y su propia interpretación, así que se envían ambos iguales
(`raw_name = proposed_canonical_name = texto tecleado`), junto con la
cantidad/unidad que ya introduce en el formulario. Es una llamada
best-effort (`Promise.allSettled`, sin `store_name` no se llama): si falla,
no impide guardar el ticket, porque el intérprete es auxiliar. A medida que
distintos usuarios tecleen el mismo texto para el mismo supermercado, el
propio matching de abajo empieza a generar confirmaciones/conflictos reales.

La función aplica una heurística simple sobre la clave
`(retailer, normalized_raw_name)`:

1. **Ya hay un alias aprobado para esa clave y coincide** → se trata como una
   confirmación: incrementa `times_seen`/`times_confirmed` del alias, no crea
   ninguna propuesta nueva.
2. **Ya hay un alias aprobado pero NO coincide** → crea una propuesta nueva
   con `status = 'conflict'` (contradice conocimiento ya aprobado).
3. **Ya hay una propuesta pendiente/en conflicto igual (mismo nombre
   canónico normalizado)** → la confirma (`user_confirmations += 1`).
4. **Ya hay una propuesta pendiente distinta** → ambas pasan a `conflict`
   (`user_conflicts += 1`) y se crea la nueva.
5. **No hay nada para esa clave** → propuesta `pending` nueva.

Es deliberadamente una heurística simple, no un motor de resolución de
conflictos completo — la decisión final siempre la toma una persona
(`delegate`/`admin`), nunca se autoaprueba nada automáticamente.

## Moderación

### Aprobar / editar y aprobar (`approve_interpreter_proposal`)

Una única función cubre ambos casos: sin parámetros de override, aprueba la
propuesta tal cual; con alguno de `p_override_*`, la corrige antes de
aprobar. Pasos (todos en una función ⇒ una transacción; si algo falla,
Postgres revierte todo, sin estados parciales):

1. Si se indica `p_retailer_product_id`, reutiliza ese producto de tienda
   existente (evita duplicados cuando el moderador ya sabe a qué producto
   corresponde). Si no, crea o reutiliza (`ON CONFLICT ... DO UPDATE`) el
   `canonical_products` y el `retailer_products` correspondientes.
2. Crea o actualiza (upsert) el `product_alias` de esa clave, apuntando al
   `retailer_products` resuelto, e incrementa sus contadores.
3. Marca la propuesta como `approved`, con `reviewed_by`/`reviewed_at`.
4. **Resuelve conflictos de paso**: cualquier otra propuesta
   `pending`/`conflict` que comparta la misma clave `(retailer,
   normalized_raw_name)` se marca `rejected` con `rejection_reason =
   'conflicto_resuelto'` — por eso `/admin/interpreter/conflicts` no
   necesita una función distinta, sólo reutiliza esta.
5. Registra un evento en `admin_audit_log`.

### Rechazar (`reject_interpreter_proposal`)

Marca `status = 'rejected'`, guarda `rejection_reason` (texto libre; la UI
ofrece un select con motivos sugeridos: interpretación incorrecta,
duplicado, ticket inválido, información insuficiente, otro),
`reviewed_by`/`reviewed_at`, y registra auditoría. No toca conocimiento
global.

### Editar conocimiento ya aprobado

- `update_canonical_product(id, canonical_name, category, default_unit)`
- `update_retailer_product(id, brand, commercial_name, package_quantity, package_unit, canonical_product_id)`
- `update_product_alias(id, retailer_product_id, active)` — para corregir a
  qué producto apunta un alias, o para **desactivarlo** en vez de borrarlo.

Las tres exigen `delegate` o `admin` y registran auditoría. **No existe
ninguna función de borrado** sobre `canonical_products`, `retailer_products`
o `product_aliases`: la sección 14 de la tarea que originó este documento
pide explícitamente preferir editar/desactivar/fusionar frente a borrar
conocimiento histórico.

### Detección de duplicados

`find_similar_canonical_products(name, limit)` usa `pg_trgm` (similitud de
trigramas) sobre `normalized_name` para encontrar productos canónicos
parecidos aunque la normalización exacta no los una (p. ej. "Yogur" vs
"Yogurt"). Se usa en `/admin/products` como herramienta de apoyo manual, no
bloquea la creación de productos.

## Conflictos

`/admin/interpreter/conflicts` agrupa las propuestas con `status = 'conflict'`
por `(retailer, normalized_raw_name)` y muestra todas las interpretaciones
candidatas una junto a otra. Aprobar cualquiera de ellas resuelve el grupo
entero (ver punto 4 de la aprobación arriba) — no hay una función de
"resolución de conflicto" separada, es la misma `approve_interpreter_proposal`.

## Seguridad

- Lectura de `canonical_products`/`retailer_products`/`product_aliases`:
  abierta a cualquier usuario autenticado (es conocimiento compartido,
  necesario para interpretar tickets).
- Lectura de `interpreter_proposals`: `delegate`/`admin` ven todas; un
  usuario normal sólo ve las suyas (`submitted_by = auth.uid()`).
- Escritura: **nunca** hay una política RLS de `INSERT`/`UPDATE`/`DELETE`
  sobre estas cuatro tablas. Todo pasa por las funciones `SECURITY DEFINER`
  descritas arriba, cada una comprobando el rol de quien llama en el propio
  SQL (nunca confiando en el frontend). El listado/búsqueda de usuarios
  (`admin_list_users`) y las métricas (`admin_get_metrics`) exigen `admin`
  igual que el resto de operaciones administrativas.
- Ninguna de estas funciones toca `home_members`, `receipts`,
  `receipt_items` ni `inventory_events`. Un admin que modera el intérprete o
  gestiona usuarios sigue sin poder leer la despensa o los tickets de una
  Casa de la que no sea miembro.

## Auditoría

`admin_audit_log` registra (entre otros) `role_change`,
`interpreter_proposal_approved`/`_edited_and_approved`/`_rejected`,
`canonical_product_edited`, `retailer_product_edited`, `product_alias_edited`.
Sólo un `admin` puede leerlo (`/admin/audit`); no incluye ningún dato de
Casas privadas.

## IA (futuro)

Los campos `ai_confidence` (en `interpreter_proposals`) y
`confidence_score` (en `product_aliases`) ya existen para que una futura
integración de IA los rellene. La IA **nunca escribirá directamente**
`product_aliases`/`retailer_products`/`canonical_products`: sólo podrá crear
filas en `interpreter_proposals` a través de
`submit_interpreter_proposal` (o una función equivalente), exactamente igual
que un usuario. La aprobación siempre la hace una persona.

## Datos de ejemplo (seed)

`supabase/migrations/0007_interpreter_seed_data.sql` siembra un pequeño
diccionario de arranque (5 productos canónicos/de tienda/alias ya
aprobados, 3 propuestas pendientes y un conflicto de dos interpretaciones
para el mismo texto) para que `/admin/interpreter`,
`/admin/interpreter/pending` y `/admin/interpreter/conflicts` tengan algo
real que mostrar y moderar desde el primer despliegue, sin depender de que
antes se hayan guardado tickets reales. Es idempotente (comprueba si el
canónico de ejemplo "Yogur griego natural" ya existe antes de insertar) y
usa nombres de supermercados/marcas de forma genérica, no datos reales de
ningún usuario.

## Pendiente / fuera de alcance de esta fase

- Lectura OCR real del ticket.
- Motor de IA que rellene `ai_confidence`/proponga automáticamente (hoy
  `saveReceiptReview` envía el texto tecleado a mano como propuesta, sin
  ninguna inteligencia añadida — ver más arriba).
- Fusión de productos canónicos o de tienda duplicados (se dejó preparado
  `find_similar_canonical_products` para localizarlos, pero fusionar
  arrastra reasignar `product_aliases`/`interpreter_proposals` existentes,
  con riesgo de mezclar historial — deliberadamente no implementado).
- Permisos granulares de `delegate` por supermercado/categoría
  (`delegate_scope`): no hay infraestructura para ello todavía; si se
  necesita, iría como una tabla adicional (`delegate_id`, `scope_type`,
  `scope_value`) consultada desde las funciones de moderación.
