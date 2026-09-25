# Arquitectura de Recetas (Fase 1)

Implementado en `supabase/migrations/0015_recetas.sql`. UI en `app/(app)/recetas/*` y
`app/(app)/lista-compra/*`. Lógica de comparación receta↔despensa en `lib/recipes.ts`.

## Por qué existe

Flujo objetivo: receta → "Quiero cocinar esto" → decidir ingrediente a ingrediente si ya se tiene o hay
que comprarlo → añadir a la lista de la compra → consultar pasos y cocinar. Antes de esta fase no existía
ningún sistema de lista de la compra en la app (verificado explícitamente antes de implementar nada) ni
ningún sistema de relaciones/amigos entre usuarios.

**"Normalización" y "disponibilidad en despensa" son conceptos distintos y no deben confundirse en la
UI:** normalización es identificar qué producto es un ingrediente (`producto_id`); disponibilidad es si
esa Casa lo tiene ahora mismo. Un ingrediente puede estar perfectamente normalizado sin que el usuario lo
tenga en casa. Por eso la ficha de una receta (`app/(app)/recetas/[id]/page.tsx`) es deliberadamente
"tonta": solo pinta `nombre_mostrado — cantidad unidad`, sin tocar `producto_id` ni la despensa — ver la
sección "Flujo de cocinar" más abajo para dónde sí importa cada cosa.

## Modelo de datos

- **`recetas`**: `titulo, descripcion, raciones, tiempo_preparacion_min, tiempo_coccion_min, autor_id,
  visibilidad, estado`. **No lleva `home_id`.** Una receta es del autor (`auth.users`), no de una Casa —
  a diferencia de `receipts`/`inventory_events`, que sí son domésticos. Esto es deliberado: una receta
  debe poder compartirse (pública, o con amigos en el futuro) sin arrastrar la Casa en la que se creó. La
  comprobación de stock (`classifyIngredient`/`summarizeAvailability` en `lib/recipes.ts`) se hace
  siempre **en tiempo de consulta**, contra la Casa activa de quien mira la receta
  (`getCurrentUserAndHome()`), nunca contra una Casa guardada en el esquema.
- **`receta_ingredientes`**: `producto_id` referencia `canonical_products` — el mismo catálogo normalizado
  que usan despensa/intérprete/tickets, nunca un catálogo de ingredientes aparte. `producto_id` es
  **nullable**: si el ingrediente no coincide con ningún producto existente, la receta se guarda igual
  (solo `nombre_mostrado` es obligatorio). `nombre_mostrado` permite una denominación natural
  ("Tomate maduro") aunque `producto_id` apunte al canónico ("TOMATE") — la comparación contra despensa
  usa siempre `producto_id`, nunca el texto de `nombre_mostrado`. `control_stock` decide si el ingrediente
  se compara por cantidad o solo por existencia (sal/aceite/pimienta = `false`).
- **`receta_pasos`**: pasos ordenados por `numero`, independientes de los ingredientes.
- **`shopping_list_items`** (nueva): home-scoped como `receipts`. `canonical_product_id` también
  nullable, por el mismo motivo que en `receta_ingredientes`. `display_name` se guarda siempre (copia del
  nombre canónico o texto libre), para no depender de un join solo para pintar la lista.

## Selección/vinculación de producto

`components/recetas/ProductPicker.tsx` reutiliza `find_similar_canonical_products` (ya existente, usada
también en `/admin/products` para detectar duplicados) — no hay ninguna RPC de búsqueda nueva. Si el
usuario no elige ningún resultado, el ingrediente queda con `producto_id = null` (marcado con
`--color-warning` solo en el propio formulario de edición de la receta, donde sí es información útil para
quien la escribe -- nunca en la ficha de lectura ni en "Quiero cocinar esto", ver más abajo).

### Ingrediente sin producto normalizado — decisión explícita

No existe ninguna vía para que un usuario normal cree un `canonical_products` nuevo al vuelo (habría
abierto una puerta de creación de catálogo global sin moderación). En su lugar:

1. La receta se guarda igual, con `producto_id = null` en ese ingrediente (marcado solo en el
   formulario de edición, nunca en la ficha de lectura -- ver arriba).
2. La falta de normalización no bloquea nada: en "Quiero cocinar esto" el ingrediente pide TENGO/COMPRAR
   igual que cualquier otro (ver "Flujo de cocinar" más abajo). Solo `classifyIngredient` (uso futuro,
   todavía no conectado a ningún flujo) lo trata como "faltante" por no haber nada contra qué comparar.
3. Solo si el usuario marca COMPRAR y confirma se añade a `shopping_list_items` (con
   `canonical_product_id = null`, `display_name` = el texto del ingrediente) — nunca al guardar la
   receta, para no llenar la lista de una Casa con cosas que quizá no se cocinen nunca. Sin
   `canonical_product_id`, la lista de la compra lo muestra como "Pendiente de identificar"
   (`components/lista-compra/ShoppingListRow.tsx`) -- lenguaje de usuario, nunca "sin producto
   normalizado" ni similar.
4. `/admin/products` muestra una sección de solo lectura "Ingredientes de recetas sin producto
   normalizado" (agrupados por nombre) con un mini-formulario que llama a la nueva RPC
   `create_canonical_product_admin` (delegate/admin únicamente) — es la única vía de creación directa de
   `canonical_products` que no pasa por `approve_interpreter_proposal`.

## Integración con la lista de la compra

`add_to_shopping_list()` (SQL, `security invoker` — no necesita privilegios elevados, la RLS de
`shopping_list_items` ya exige pertenencia a la Casa) evita duplicados: si ya hay una línea sin marcar
para el mismo producto (o el mismo nombre, cuando no hay producto vinculado), suma la cantidad en vez de
crear otra línea — pero solo si las unidades coinciden o falta alguna; si difieren, no inventa una
conversión y deja la línea existente igual (mismo criterio "robusto antes que preciso" que ya se aplicó
en `lib/pantry.ts` para el stock de despensa). Es la única vía de escritura usada tanto por
`addMissingToShoppingList` (desde una receta) como por el alta manual en `/lista-compra`.

## Flujo de "Quiero cocinar esto" (TENGO / COMPRAR)

`app/(app)/recetas/[id]/cocinar/page.tsx` + `components/recetas/CocinarPanel.tsx`. Al entrar, se
escalan las cantidades por raciones (`scaleIngredients`) y se convierten kg/l a gr./ml. (`toBaseUnits`),
y se separan los ingredientes en dos grupos con `decidableIngredients`/`isShoppableIngredient`
(`lib/recipes.ts`):

- **Decidibles** (unidad `ud.`/`gr.`/`ml.`): cada uno pide explícitamente **TENGO** o **COMPRAR**, sin
  preselección — el usuario decide, nunca se infiere de la despensa. Puede cambiar de opinión antes de
  confirmar. Al pulsar "Añadir a la lista de la compra", si queda alguno sin decidir, no se envía nada:
  se marcan en rojo con un mensaje sencillo ("Decide si ya lo tienes o necesitas comprarlo"), nunca un
  error técnico. `findUndecidedIngredients`/`selectIngredientsToBuy` (`lib/recipes.ts`) son las dos
  funciones puras que deciden esto, compartidas entre la validación del panel y lo que se envía al
  servidor.
- **No decidibles** (cucharada, al gusto, pellizco...): se listan aparte, solo informativos — nunca piden
  TENGO/COMPRAR ni pueden ir a la lista de la compra (regla de unidades sin cambios, ver
  `lib/units.ts`).

**TENGO** no escribe nada: solo excluye ese ingrediente de esta compra. No crea ni modifica
`inventory_events` ni la despensa — la sección "decremento automático de despensa al cocinar" de más
abajo sigue sin implementarse. **COMPRAR** manda el ingrediente (con su `producto_id`, cantidad y unidad
ya escalados/convertidos) a `addMissingToShoppingList`, que llama a `add_to_shopping_list` una vez por
ingrediente — la deduplicación de arriba se aplica igual, sin lógica nueva.

**Gancho para el futuro** (sección "arquitectura futura" del encargo que introdujo este flujo):
`classifyIngredient`/`summarizeAvailability` (comparación cantidad-necesaria-vs-despensa) siguen
existiendo y probadas en `lib/recipes.test.ts`, simplemente no las llama ya esta pantalla. El día que se
quiera preseleccionar TENGO/COMPRAR según la despensa, el punto de enganche es pasarle su resultado a
`CocinarPanel` como valor inicial de `decisions` — no hace falta rediseñar el flujo.

## Modelo de visibilidad

`privada` (solo el autor), `amigos`, `publica`. RLS en `recetas`:

```sql
for select using (
  autor_id = auth.uid()
  or (estado = 'activa' and visibilidad = 'publica' and auth.role() = 'authenticated')
);
```

**`amigos` no aporta ninguna visibilidad adicional todavía.** No existe ningún sistema de
relaciones/amigos entre usuarios en la app (confirmado explícitamente, cero referencias en todo el
repo) — hasta que exista, una receta marcada `amigos` se comporta exactamente como `privada`. Esto es
intencional y conservador: nunca se debe volver pública por accidente. Cuando se implemente un sistema de
amigos, el punto de enganche es únicamente esta política RLS de `recetas` (añadir una condición
`or (visibilidad = 'amigos' and autor_id in (select ... from <tabla_de_amistades> ...))`) — no haría falta
tocar ningún otro punto del modelo (ni `receta_ingredientes`, que heredan la visibilidad de `recetas` vía
`exists()`, ni la UI, que ya permite seleccionar `amigos` hoy).

`estado` (`borrador`/`activa`) es independiente de `visibilidad`: una receta en `borrador` nunca es
visible para nadie salvo el autor, aunque esté marcada `publica` (hace falta `estado = 'activa'` Y
`visibilidad = 'publica'` a la vez).

## Seguridad

- `recetas`/`receta_ingredientes`/`receta_pasos`: RLS directa (no RPC) — mismo patrón que `receipts`, es
  contenido del usuario, no conocimiento global moderado. `receta_ingredientes`/`receta_pasos` no tienen
  lógica de visibilidad propia: su política de `select` es `exists (select 1 from recetas where id =
  receta_id)`, que hereda automáticamente la RLS de `recetas`.
- `shopping_list_items`: RLS directa, `home_id in (select get_my_home_ids())` — igual que `receipts`.
  Nunca se comprueba contra "el usuario" de forma global, siempre contra la Casa activa.
- `create_canonical_product_admin`: `security definer`, exige `delegate`/`admin` (mismo patrón de
  comprobación que el resto del intérprete). Es la única función nueva con privilegios elevados; todo lo
  demás de este módulo respeta la RLS del usuario que hace la petición.

## Pendiente / fuera de alcance de esta fase

Recetas públicas compartidas más allá de la visibilidad básica, recetas de amigos reales (bloqueado por
la ausencia de un sistema de relaciones — ver arriba), búsqueda inteligente, recomendaciones según
despensa (más allá del "Puedes cocinarla"/"Te faltan N ingredientes" de `RecipeCard` en `/recetas`, que
sí compara contra despensa a nivel de tarjeta), productos próximos a caducar, menús semanales, coste
estimado, comparación entre supermercados, ratings/comentarios/seguidores, decremento automático de
despensa al cocinar (TENGO/COMPRAR no tocan inventario, ver "Flujo de cocinar" arriba), categorías/orden
de pasillo en la lista de la compra.
