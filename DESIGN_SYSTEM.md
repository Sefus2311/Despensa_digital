# Despensa Digital / Mayordomo Digital — Design System

**Estado:** v1.1 — fuente de verdad del aspecto visual de la app. Sustituye la paleta verde-azulado (teal)
inicial por la paleta "verde de despensa" descrita más abajo (decisión 2026-09-18).
**Implementación de referencia:** `styles/tokens.css`, `styles/components.css`, `app/globals.css`, `app/layout.tsx`.
**Relación con RealMargin:** este proyecto es un Supabase/producto independiente de RealMargin (ver `CLAUDE.md`),
pero su kit de componentes (`components/ui/*`) y la estructura de sus tokens (espaciado/radios/tipografía)
nacieron adaptando el `DESIGN_SYSTEM.md` de RealMargin. La tabla de la §7 dice, elemento a elemento, qué sigue
viniendo de allí y qué es ya identidad propia — para no tener que releer el otro repo cada vez que surja la duda.

Este documento describe lo que el código ya hace, no un objetivo aspiracional. Si un componente nuevo necesita
algo que no está aquí, se decide, se implementa y **se añade a este documento en el mismo cambio**.

## 1. Qué es esta app (para las decisiones de diseño)

Despensa Digital es una PWA de uso doméstico: fotografiar/subir tickets, revisar manualmente las líneas y
llevar un registro de la despensa del hogar. No tiene componente de marketing/landing, no genera PDFs y no
tiene un panel de métricas de negocio — por eso este documento es más corto que el de RealMargin, que sí
cubre esas piezas.

Principios que ya se reflejan en los componentes existentes:

- **Manual primero, cómodo con el pulgar.** La revisión de tickets es 100% manual en v0.1; todos los
  controles cumplen el target táctil de 44×44 px.
- **Español de España** en toda la interfaz (textos y comentarios de código).
- **Un solo kit de componentes** (`components/ui/*`) consumido por toda la app — páginas y componentes de
  dominio (`components/admin/*`, `ReceiptImage`, `HomeSwitcher`...) no inventan estilos sueltos, usan estas
  clases y tokens.
- **Limpia, tecnológica, tranquila.** El color se usa para dar jerarquía y orientación, no como decoración —
  ver la regla explícita al final de la §2.

## 2. Paleta de colores

### Fondo principal

`#F8FAF7`

**Uso:** fondo general de las pantallas (`body`, `--color-background`). Sustituye al blanco puro como fondo
de página siempre que tenga sentido — las tarjetas e inputs siguen en blanco/off-white para diferenciarse del
fondo (ver "Tarjetas" e "Inputs" más abajo).

### Header / Footer

`#EEF2EA`

**Uso:** cabecera (`AppHeader`) y navegación inferior (`BottomNav`) — `--color-header`/`--color-footer`.
Ligeramente más oscuro que el fondo principal para crear una separación suave sin usar un contraste agresivo;
el borde entre header/footer y el contenido es un `1px solid var(--color-border)`, no una sombra pesada. Los
controles internos (el switcher de casa, el botón "Escanear") siguen sobre blanco/verde primario, nunca
directamente sobre el tono de header/footer.

### Texto principal

`#20251F`

**Uso:** títulos, labels, navegación y contenido importante (`--color-text`). Nunca `#000000` puro. El texto
secundario/placeholder usa `--color-muted` (`#6B7268`), una variación más clara del mismo tono (gris-verdoso,
no un gris neutro sin relación con el texto principal).

### Verde principal

`#5F7F3A`

**Uso:** botones principales/CTA, navegación activa, iconos destacados, enlaces principales y estados
positivos (`--color-primary`; `--color-success` reutiliza este mismo verde a propósito, para no tener dos
tonos de verde compitiendo en la misma pantalla). Ejemplos reales en la app: "Guardar compra", "Escanear",
"Ver PDF del ticket", "+ Añadir producto", la pestaña activa del bottom nav.

### Verde de acento

`#A8D94E`

**Uso:** con mucha moderación — pequeños indicadores, el tinte de fondo de un badge (`.ui-badge--primary`),
highlights puntuales. **Nunca como fondo dominante de un área grande.** Hoy el único consumidor es el fondo
tintado al 35% de `.ui-badge--primary`; cualquier uso nuevo debe ser igual de puntual.

### Terracota / peligro

`#B65A3F` (`--color-danger`)

**Uso:** "Eliminar", errores, advertencias y estados destructivos. Sustituye al rojo intenso que se usaba
antes (Tailwind `red-600`/`red-200` sueltos en varias pantallas) — no se usa un rojo más saturado salvo que la
accesibilidad o la criticidad lo exijan explícitamente, que hoy no es el caso.

**Nota de accesibilidad (2026-09-18):** el terracota original de referencia, `#D66A4A`, da 3.49:1 de contraste
sobre blanco — por debajo del 4.5:1 que exige AA para texto normal. Se usa una versión ~15% más oscura del
mismo matiz, `#B65A3F` (4.64:1), para que el texto/borde terracota (botón "Cerrar sesión", "Rechazar" en la
gestión del intérprete) cumpla AA. El tono sigue leyéndose como terracota, solo un poco más profundo.

---

**El color debe utilizarse como elemento de jerarquía y orientación, no como decoración. La interfaz debe
conservar un aspecto limpio, tranquilo y tecnológico.**

**Evitar grandes superficies saturadas de verde. Los fondos principales deben permanecer neutros y claros.**

Reglas derivadas de las dos anteriores, ya aplicadas en el código:

- El verde de acento (`#A8D94E`) no lleva nunca texto encima ni cubre cajas completas — solo tintes de fondo
  al 12–35% vía `color-mix()` (ver §3) o detalles puntuales.
- Ningún estado (positivo, de aviso o destructivo) depende solo del color: badges y alerts siempre llevan
  texto, no solo un tinte.
- El foco de teclado (`--color-focus` = `--color-primary`) es siempre un outline visible de 3px, nunca un
  simple cambio de fondo.

## 3. Tokens de diseño (`styles/tokens.css`)

### Color

| Token | Valor (claro) | Valor (oscuro) | Uso |
|---|---|---|---|
| `--color-background` | `#f8faf7` | `#0a0a0a` | Fondo general de la app |
| `--color-surface` | `#ffffff` | `#171717` | Tarjetas, inputs, modales |
| `--color-header` | `#eef2ea` | `#171717` | Cabecera |
| `--color-footer` | `= --color-header` | `= --color-header` | Navegación inferior |
| `--color-border` | `#dde3d8` | `#262626` | Bordes de tarjetas, inputs, header/footer |
| `--color-text` | `#20251f` | `#ededed` | Texto principal |
| `--color-muted` | `#6b7268` | `#a3a3a3` | Texto secundario/ayuda/placeholder |
| `--color-primary` | `#5f7f3a` | — | CTA, navegación activa, iconos, enlaces, éxito |
| `--color-primary-hover` | `#4c662e` | — | Hover de `--color-primary` |
| `--color-primary-active` | `#3e5326` | — | Active/pressed de `--color-primary` |
| `--color-primary-accent` | `#a8d94e` | — | Uso puntual: badges, highlights, indicadores |
| `--color-focus` | `= --color-primary` | — | Outline de foco (3px) |
| `--color-success` | `= --color-primary` | — | Confirmaciones (mismo verde, sin token propio) |
| `--color-warning` | `#a16207` | — | Avisos de caducidad, riesgo, badges/alerts/cards de "pendiente"/"conflicto" |
| `--color-danger` | `#b65a3f` | — | Errores, acciones destructivas (ver nota de contraste en §2) |

El modo oscuro solo redefine fondo/superficie/cabecera/texto/muted/borde vía `prefers-color-scheme: dark`; no
hay toggle manual ni se ha revisado su lectura con la paleta nueva (ver §7).

### Tipografía

| Token | Valor | Uso |
|---|---|---|
| `--font-ui` | `var(--font-inter), "Inter", "Segoe UI", Arial, sans-serif` | Cuerpo y todos los componentes (`components.css`) |
| `--font-display` | `var(--font-montserrat), "Montserrat", "Arial Black", "Segoe UI", sans-serif` | Solo contextos protagonistas: `<h1>` de página (clase `.font-display`) y `.ui-modal__title` |

`--font-montserrat`/`--font-inter` los inyecta `next/font/google` en `app/layout.tsx` sobre `<html>` (no sobre
`<body>`: si se declaran en `<body>`, `:root` —que es `<html>`— no puede resolverlas).

**Escala real** (todo `15px` cuando es texto funcional, por accesibilidad — ver §6):

| Contexto | Tamaño/peso | Dónde |
|---|---|---|
| `<h1>` de página | `24px` / `600` (Tailwind `text-2xl font-semibold`) + `.font-display` | Cabecera de cada pantalla |
| `.ui-modal__title` | `20px` / `700`, `var(--font-display)` | Modal |
| `.ui-button` | `15px` / `800` | Botón |
| `.ui-field__label` | `15px` / `600` | Label de campo |
| `.ui-field__input` | `16px` / `400` | Input/select/textarea |
| `.ui-field__help` / `.ui-field__error` | `15px` / `400`·`600` | Ayuda/error de campo |
| `.ui-checkbox__label` | `16px` / `400` | Checkbox |
| `.ui-badge` | `15px` / `700` | Badge de estado |
| `.ui-dropdown__trigger` | `15px` / `700` | Selector del switcher de casa |
| `.ui-alert` | `15px` / `400` | Alert |
| `.ui-table` / `.ui-table__caption` | `15px` / `400`·`700` | Tabla |

**Resuelto 2026-09-18:** ya no queda ningún `text-sm` (14px) suelto en la app. Se reclasificó cada caso:
- Texto secundario/metadato (fechas, descripciones, estados vacíos) → `text-[15px] text-[var(--color-muted)]`
  (de paso, se centralizaron ~35 usos sueltos de `text-neutral-400/500/600/700` al mismo token).
- Labels/inputs reales sin componentizar (`register`, `login`, `recuperar`, `ReviewForm`) → clases
  `.ui-field__label`/`.ui-field__input` del kit, en vez de tamaño suelto.
- El resto (botones inline, enlaces, contenido primario mal etiquetado como "secundario", p. ej.
  `item.raw_name` en el detalle de ticket) → `text-[15px]`, igual que el resto de texto funcional.

### Espaciado (base 4px) y radios

`--spacing-xs` 4px · `--spacing-sm` 8px · `--spacing-md` 16px · `--spacing-lg` 24px · `--spacing-xl` 32px
`--radius-sm` 8px · `--radius-md` 12px · `--radius-lg` 16px · `--radius-pill` 999px

### Sombras

| Token | Valor | Uso |
|---|---|---|
| `--shadow-none` | `none` | Cajas sin elevación explícita |
| `--shadow-raised` | `0 4px 12px rgba(32, 37, 31, 0.06)` | Elevación por defecto de toda `<Card>` |
| `--shadow-overlay` | `0 12px 32px rgba(32, 37, 31, 0.14)` | Modal, dropdown flotante |

Sombras suaves y discretas a propósito — tintadas con el propio `--color-text` (nunca negro puro), con blur y
opacidad bajos. **Decisión 2026-09-18:** se suaviza la fórmula respecto a la que se copiaba antes de
RealMargin (`0 8px 24px rgba(23,23,23,.12)` / `0 20px 50px rgba(23,23,23,.22)`, más marcada) para conseguir un
aspecto más "premium" y menos pesado, y se generaliza a **todas las `<Card>` de la app por defecto**
(`components/ui/Card.tsx`, `elevation="raised"`) — a diferencia de RealMargin, que reserva esa sombra solo
para tarjetas de login/registro y su tarjeta de métrica protagonista. Pasar `elevation="none"` explícitamente
cuando la caja necesita un borde con significado propio en vez de sombra (ver `components/PendingInvitations.tsx`,
que resalta una invitación pendiente con un borde de color en vez de con sombra).

## 4. Componentes visuales

### Tarjetas (`.ui-card`, `components/ui/Card.tsx`)

- Fondo `--color-surface` (blanco). Se evita deliberadamente cualquier variante "cálida" distinta del blanco
  para no complicar el token: si una tarjeta necesita destacar un estado (aviso, conflicto), se tiñe con la
  clase `.ui-card--warning-tint` (`color-mix()` sobre `--color-warning`, ver §3), nunca con Tailwind suelto ni
  con el verde de acento como fondo grande.
  - Borde `1px solid var(--color-border)` cuando `elevation="none"`; se sustituye por sombra cuando
    `elevation="raised"`/`"overlay"` (el borde pasa a transparente, ver §3).
  - La jerarquía viene de espaciado + tipografía + sombra suave + uso puntual del verde, nunca de bloques de
    color grandes dentro de la tarjeta.

### Bordes

`--color-border: #dde3d8` — tono neutro derivado de `--color-header` (`#eef2ea`), usado en tarjetas, inputs,
la línea inferior del header y la línea superior del footer. Contraste suficiente sobre `--color-surface`
blanco y sobre `--color-background` para que las cajas se distingan sin necesitar sombra.

### Botones (`.ui-button`, `components/ui/Button.tsx`)

| Variante | Fondo | Texto/borde | Hover | Active | Disabled |
|---|---|---|---|---|---|
| `primary` | `--color-primary` | blanco | `--color-primary-hover` | `--color-primary-active` | `opacity: .55` |
| `secondary` | transparente | `--color-primary` en hover, `--color-text` en reposo, subrayado | `color: --color-primary` | — | `opacity: .55` |
| `destructive` | `--color-surface` | `--color-danger` | fondo `--color-danger`, texto blanco | — | `opacity: .55` |

Foco visible en los tres: `outline: 3px solid var(--color-focus)`.

### Inputs (`.ui-field__input`, `Input`/`Select`/`Textarea`)

- Fondo `--color-surface` (blanco), borde `1px solid var(--color-border)`, texto `--color-text`.
- Placeholder en `--color-muted` (gris-verdoso derivado del texto, vía `::placeholder`).
- Focus: outline de 3px en `--color-primary` (a través de `--color-focus`) + borde del mismo color.
- Error (`--error`): borde `--color-danger`; el mensaje de error debajo también en `--color-danger`.
- Disabled: fondo `--color-border`, texto `--color-muted`.

### Badges y alerts (`.ui-badge`, `.ui-alert`)

Los cinco/cuatro tonos (`neutral/success/warning/danger/primary` y `info/warning/danger/success`) tiñen su
fondo con `color-mix(in srgb, <token semántico> 12%, white)` (35% para el borde de los alerts) en vez de hex
sueltos — así el fondo siempre sigue el color del token, incluida `--color-primary-accent` en el caso concreto
de `.ui-badge--primary` (ver §2, "verde de acento").

### Navegación activa (`BottomNav`, `AppHeader`)

- Pestaña activa del bottom nav: icono + texto en `--color-primary`. Inactiva: `--color-muted` (gris-verdoso,
  nunca negro).
- El botón flotante "Escanear" usa `--color-primary` como fondo sólido.
- Header y footer comparten `--color-header`/`--color-footer` (mismo valor), separados del contenido con un
  borde `--color-border`, no con una sombra.

## 5. Iconografía

Un único componente `Icon` (`components/icons/Icon.tsx`) con diccionario tipado de SVG. El acento de cada
glifo usa `var(--color-primary, #5f7f3a)` — mismo verde principal que el resto de la app, con el hex como
único fallback si la variable no estuviera definida (nunca ocurre en producción). Reglas de construcción,
origen de cada icono y uso: ver `components/icons/README.md` — no se duplica aquí para no desincronizarse.

## 6. Accesibilidad

- Texto funcional mínimo: **15px** (ver deuda de §3 sobre los `text-sm` sueltos).
- Target táctil mínimo: 44×44px.
- Foco: outline de `--color-focus`, 3px, con offset — nunca solo cambio de color de fondo.
- Ningún estado depende solo del color: badges y alerts llevan siempre texto, no solo tinte; las acciones
  destructivas llevan además la palabra "Eliminar"/similar, no solo el terracota.
- `--color-danger` (`#d66a4a`) se eligió deliberadamente menos saturado que un rojo puro; si en el futuro se
  detecta que el contraste texto/fondo no llega a AA en algún componente concreto, es deuda a corregir con
  prioridad (ver §7).
- `prefers-reduced-motion` respetado en las animaciones existentes (spinner de `.ui-button`).

## 7. Relación con RealMargin — qué se copió y qué no

| Elemento | Decisión | Detalle |
|---|---|---|
| Escalas de espaciado/radio (estructura) | Adaptado 1:1 | Mismos tokens, mismos valores |
| Paleta de color | **Propia** | Paleta "verde de despensa" (§2); ya no reutiliza ni el naranja de RealMargin ni el verde-azulado (teal) que usaba esta app antes de 2026-09-18 |
| Familias tipográficas (Montserrat/Inter) y criterio de uso | Adaptado 1:1 | Sin cambios en esta revisión |
| Tamaños de texto de los componentes (`.ui-*`) | Adaptado 1:1, incluido el mínimo de 15px | Sin cambios en esta revisión |
| Fórmula de sombra | **Propia, más suave** | Se partió de la fórmula de RealMargin (ver §3) pero se aligeró el blur/opacidad en esta revisión |
| Qué cajas llevan sombra | **Propio, distinto de RealMargin** | Aquí todas las `Card` por defecto; en RealMargin solo login/registro y la tarjeta protagonista |
| Iconografía | Misma arquitectura (`Icon` único / `BlueprintIcon`), glifos propios | Ver `components/icons/README.md` |
| Fotografía, PDF, Observatorio, lenguaje de cifras de margen | No aplica | Esta app no tiene esas piezas |

## 8. Deuda del Design System

1. ~~Textos secundarios sueltos en `text-sm` (14px) sin token propio~~ — **Resuelto 2026-09-18**, ver §3.
2. ~~`--color-secondary` sin consumidores~~ — **Resuelto 2026-09-18.** Se retiró de `tokens.css`: estaba
   declarado pero ningún componente ni página lo usaba.
3. ~~Badges/avisos ámbar sin token~~ — **Resuelto 2026-09-18.** Las etiquetas "Conflicto"
   (`ProposalCard`) y "Pendiente" (`historial`) pasaron a `<Badge tone="warning">`; el aviso de productos sin
   interpretar (`despensa`) pasó a `<Alert tone="warning">`; la tarjeta de grupo en conflicto
   (`admin/interpreter/conflicts`) usa la nueva clase `.ui-card--warning-tint` (mismo `color-mix()` que badges
   y alerts). Los cuatro consumen `--color-warning` en vez de los `amber-*` de Tailwind sueltos.
4. ~~Cajas informativas fuera del componente `Card` con Tailwind neutro literal~~ — **Resuelto 2026-09-18.**
   `ReceiptImage`: el estado vacío ("no se pudo cargar la imagen") pasó a usar el propio componente `Card`
   (`elevation="none"`) en vez de reinventar fondo/borde con Tailwind; el enlace "Ver PDF del ticket" y la
   `<img>` (no pueden ser un `Card`: uno es un enlace, la otra una imagen suelta) pasaron a
   `bg-[var(--color-surface)]`/`border-[var(--color-border)]`. Mismo token swap en el dropzone de
   `tickets/new`.
5. El modo oscuro solo cubre fondo/superficie/cabecera/texto/borde; no se ha comprobado si las sombras
   (tintadas con `--color-text` claro) siguen leyéndose bien sobre superficies oscuras, ni si merece una
   variante de header oscuro distinta de `--color-surface`.
6. ~~Contraste de `--color-danger` por debajo de AA para texto normal~~ — **Resuelto 2026-09-18.** El
   terracota de referencia (`#d66a4a`, 3.49:1 sobre blanco) se oscureció un 15% de brillo manteniendo el
   matiz → `#b65a3f`, 4.64:1 (ver nota de accesibilidad en §2). El resto de la paleta ya cumplía AA con
   margen: texto principal 14.9:1, `--color-muted` 4.7–5.0:1, `--color-primary` como texto 4.58:1 (justo por
   encima del mínimo — vigilar si se oscurece el fondo en el futuro).
