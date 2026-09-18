# Arquitectura de Recetas (Fase 1)

Implementado en `supabase/migrations/0015_recetas.sql`. UI en `app/(app)/recetas/*` y
`app/(app)/lista-compra/*`. Lógica de comparación receta↔despensa en `lib/recipes.ts`.

## Por qué existe

Flujo objetivo: receta → comprobar ingredientes contra la despensa de la Casa activa → detectar
faltantes → añadir a la lista de la compra → consultar pasos y cocinar. Antes de esta fase no existía
ningún sistema de lista de la compra en la app (verificado explícitamente antes de implementar nada) ni
ningún sistema de relaciones/amigos entre usuarios.

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
usuario no elige ningún resultado, el ingrediente queda con `producto_id = null`, marcado en la UI con
`--color-warning`.

### Ingrediente sin producto normalizado — decisión explícita

No existe ninguna vía para que un usuario normal cree un `canonical_products` nuevo al vuelo (habría
abierto una puerta de creación de catálogo global sin moderación). En su lugar:

1. La receta se guarda igual, con ese ingrediente marcado visualmente y `producto_id = null`.
2. Ese ingrediente se trata siempre como **faltante** al comprobar disponibilidad (no hay nada contra qué
   comparar).
3. Solo cuando el usuario pulsa "Quiero cocinar esto" → "Añadir a la lista de la compra" se añade a
   `shopping_list_items` (con `canonical_product_id = null`, `display_name` = el texto del ingrediente) —
   nunca al guardar la receta, para no llenar la lista de una Casa con cosas que quizá no se cocinen
   nunca.
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
despensa, productos próximos a caducar, menús semanales, coste estimado, comparación entre
supermercados, escalado real de raciones (el modelo no lo impide: `raciones` se guarda siempre, pero no
hay UI para recalcular cantidades todavía), ratings/comentarios/seguidores, decremento automático de
despensa al cocinar, categorías/orden de pasillo en la lista de la compra.
