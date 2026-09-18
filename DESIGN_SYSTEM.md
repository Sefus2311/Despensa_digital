# Despensa Digital / Mayordomo Digital — Design System

**Estado:** v1.0 — fuente de verdad del aspecto visual de la app.
**Implementación de referencia:** `styles/tokens.css`, `styles/components.css`, `app/globals.css`, `app/layout.tsx`.
**Relación con RealMargin:** este proyecto es un Supabase/producto independiente de RealMargin (ver `CLAUDE.md`),
pero su kit de componentes (`components/ui/*`) y buena parte de sus tokens nacieron adaptando el
`DESIGN_SYSTEM.md` de RealMargin. La tabla de la §6 dice, elemento a elemento, qué se copió tal cual, qué se
adaptó y qué es propio de esta app — para no tener que releer el otro repo cada vez que surja la duda.

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

## 2. Tokens de diseño (`styles/tokens.css`)

### Color

| Token | Valor (claro) | Valor (oscuro) | Uso |
|---|---|---|---|
| `--color-primary` | `#0f766e` | — | Acción primaria, foco, acento de marca |
| `--color-primary-hover` | `#115e59` | — | Hover/active de `--color-primary` |
| `--color-secondary` | `#64748b` | — | Acentos secundarios |
| `--color-background` | `#fafaf9` | `#0a0a0a` | Fondo de la app |
| `--color-surface` | `#ffffff` | `#171717` | Tarjetas, inputs, modales |
| `--color-text` | `#171717` | `#ededed` | Texto principal |
| `--color-muted` | `#737373` | `#a3a3a3` | Texto secundario/ayuda |
| `--color-border` | `#e5e7eb` | `#262626` | Bordes estructurales |
| `--color-focus` | `#0f766e` | — | Outline de foco (3px) |
| `--color-success` | `#15803d` | — | Confirmaciones |
| `--color-warning` | `#a16207` | — | Avisos de caducidad, riesgo |
| `--color-danger` | `#dc2626` | — | Errores, acciones destructivas |

Paleta **propia**, no la de marca de RealMargin (no hay naranja de marca aquí). El modo oscuro solo redefine
fondo/superficie/texto/borde vía `prefers-color-scheme: dark`; no hay toggle manual.

### Tipografía

| Token | Valor | Uso |
|---|---|---|
| `--font-ui` | `var(--font-inter), "Inter", "Segoe UI", Arial, sans-serif` | Cuerpo y todos los componentes (`components.css`) |
| `--font-display` | `var(--font-montserrat), "Montserrat", "Arial Black", "Segoe UI", sans-serif` | Solo contextos protagonistas: `<h1>` de página (clase `.font-display`) y `.ui-modal__title` |

`--font-montserrat`/`--font-inter` los inyecta `next/font/google` en `app/layout.tsx` sobre `<html>` (no sobre
`<body>`: si se declaran en `<body>`, `:root` —que es `<html>`— no puede resolverlas). Familias y criterio de
uso (Inter en todo, Montserrat solo en protagonistas) replican 1:1 el `DESIGN_SYSTEM.md` de RealMargin §3.

**Escala real** (todo `15px` cuando es texto funcional, por accesibilidad — ver §5):

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

**Deuda conocida:** varios textos secundarios sueltos (metadatos no críticos) siguen en Tailwind `text-sm`
(14px) en vez de un token — RealMargin admite 14px para metadato no crítico si el contraste está validado
(§16.5 de su documento), así que no se ha tocado, pero si alguno de esos textos pasa a ser información que el
usuario necesita para decidir, debe subir a 15px como el resto.

### Espaciado (base 4px), radios y elevación

| Espaciado | Radio | Elevación |
|---|---|---|
| `--spacing-xs` 4px · `--spacing-sm` 8px · `--spacing-md` 16px · `--spacing-lg` 24px · `--spacing-xl` 32px | `--radius-sm` 8px · `--radius-md` 12px · `--radius-lg` 16px · `--radius-pill` 999px | `--shadow-none: none` · `--shadow-raised: 0 8px 24px rgba(23,23,23,.12)` · `--shadow-overlay: 0 20px 50px rgba(23,23,23,.22)` |

La fórmula de sombra (difuminado/opacidad) es 1:1 con RealMargin, tintada con el propio `--color-text` en vez
de negro puro — igual que RealMargin tinta la suya con su propio `--rm-color-ink`.

**Decisión 2026-09-18 — sombra en todas las cajas:** a diferencia de RealMargin (que reserva `raised` para
tarjetas de login/registro y su tarjeta de métrica protagonista, y deja `shadow-none` en el resto de cajas de
producto), aquí se decidió que **toda `<Card>` lleve `elevation="raised"` por defecto**
(`components/ui/Card.tsx`), para que las cajas donde se presenta información (despensa, historial, revisión de
ticket, perfil...) tengan relieve en vez de ser bloques solo con borde. Es una decisión de identidad propia,
no una réplica de cómo lo hace RealMargin — documentado aquí para que no se lea como un descuido si en el
futuro se compara con el otro proyecto. Pasar `elevation="none"` explícitamente cuando la caja necesita un
borde con significado propio en vez de sombra (ver ejemplo real: `components/PendingInvitations.tsx`, que usa
`elevation="none"` para poder pintar el borde de color que resalta una invitación pendiente).

## 3. Componentes base (`components/ui/*` + `styles/components.css`)

Un único componente por patrón, sin variantes visuales fuera de las listadas: `Button` (primary/secondary/
destructive), `Input`/`Select`/`Textarea` (comparten `.ui-field`), `Checkbox`, `Badge` (neutral/success/
warning/danger/primary), `Card` (none/raised/overlay), `Modal`, `Dropdown`, `Alert` (info/warning/danger/
success), `Table`. Todos:

- consumen los tokens de §2, nunca valores sueltos;
- cumplen 44×44px de target táctil donde son interactivos;
- tienen foco visible: `outline: 3px solid var(--color-focus)` con offset;
- no dependen de `:hover` para ninguna función crítica (mobile first).

Antes de añadir un componente nuevo: mirar primero si `components/ui` ya tiene algo que sirva. Si hace falta
una variante nueva, añadirla a `styles/components.css` con los tokens existentes, no con valores sueltos.

## 4. Iconografía

Un único componente `Icon` (`components/icons/Icon.tsx`) con diccionario tipado de SVG. Reglas de
construcción, origen de cada icono (reutilizado/adaptado/nuevo respecto a la biblioteca `BlueprintIcon` de
RealMargin) y uso: ver `components/icons/README.md` — no se duplica aquí para no desincronizarse.

## 5. Accesibilidad

- Texto funcional mínimo: **15px** (ver deuda de §2 sobre los `text-sm` sueltos).
- Target táctil mínimo: 44×44px.
- Foco: outline de `--color-focus`, 3px, con offset — nunca solo cambio de color de fondo.
- Ningún estado depende solo del color (badges y alerts llevan siempre texto, no solo tinte).
- `prefers-reduced-motion` respetado en las animaciones existentes (spinner de `.ui-button`).

## 6. Relación con RealMargin — qué se copió y qué no

| Elemento | Decisión | Detalle |
|---|---|---|
| Escalas de espaciado/radio/elevación (estructura) | Adaptado 1:1 | Mismos tokens, mismos valores (ver §2) |
| Paleta de color | Propia | No reutiliza el naranja/tinta de marca de RealMargin |
| Familias tipográficas (Montserrat/Inter) y criterio de uso | Adaptado 1:1 | Decisión 2026-09-18; antes esta app usaba Arial/Helvetica de sistema |
| Tamaños de texto de los componentes (`.ui-*`) | Adaptado 1:1, incluido el mínimo de 15px | 3 valores se corrigieron para alcanzar la paridad: botón 700→800, badge 13→15px, help/error de formulario 14→15px |
| Fórmula de sombra (blur/opacidad, tintada con el color de texto propio) | Adaptado 1:1 | Ver §2 |
| Qué cajas llevan sombra | **Propio, distinto de RealMargin** | Aquí todas las `Card` por defecto; en RealMargin solo login/registro y la tarjeta protagonista |
| Iconografía | Misma arquitectura (`Icon` único / `BlueprintIcon`), glifos propios | Ver `components/icons/README.md` |
| Fotografía, PDF, Observatorio, lenguaje de cifras de margen | No aplica | Esta app no tiene esas piezas |

## 7. Deuda del Design System

1. Textos secundarios sueltos en `text-sm` (14px) sin token propio — ver §2.
2. No hay auditoría de contraste formal (colores de estado heredados de RealMargin antes de su propia
   validación AA de 2026-08-19); revisar si se reutilizan combinaciones nuevas de color+fondo.
3. El modo oscuro solo cubre color; no se ha revisado si la sombra (`--shadow-raised`/`--shadow-overlay`,
   tintada con `--color-text`) sigue leyéndose bien sobre `--color-surface` oscuro.
