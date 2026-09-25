# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Despensa Digital" (smart-pantry-mvp) — a Next.js App Router MVP where users photograph/upload grocery
receipts, manually review the extracted line items, and track what's in their home's pantry. V0.1:
receipt parsing is fully manual (user types in the data); the parser is designed to be swapped for a
real OCR/AI implementation later without touching the rest of the app.

Note: this is an INDEPENDENT Supabase project from "RealMargin" (see `.env.example`) — don't assume
shared credentials or schema with that other project.

The UI and code comments are in Spanish; keep new user-facing strings and comments in Spanish for consistency.

## Commands

```bash
npm run dev      # start dev server (Next.js, Turbopack)
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint
npm run test     # vitest — pure-logic unit tests under lib/*.test.ts
```

Database schema changes go in `supabase/migrations/*.sql`, applied via the Supabase CLI or dashboard
(no local Supabase CLI config is checked in — check with the user how migrations are applied to their project).

## Architecture

### Stack
Next.js 16 (App Router, Server Components + Server Actions), React 19, Tailwind CSS 4, Supabase
(Postgres + Auth + Storage) via `@supabase/ssr`.

### Route groups
- `app/(auth)/` — `/login`, `/register`, `/recuperar` (password reset). Public.
- `app/(app)/` — `/inicio`, `/despensa`, `/historial`, `/perfil`, `/tickets/*`, `/recetas/*`,
  `/lista-compra`. Private, wrapped in a shared layout (`app/(app)/layout.tsx`) with a header
  (`components/AppHeader.tsx`, home switcher) and a bottom tab bar (`components/BottomNav.tsx`).
  `/recetas` and `/lista-compra` each have their own card on `/inicio` ("¿Qué puedo cocinar?" and "Lista
  de la compra") plus links from within the recipe flow — neither is in `BottomNav` (no free slot after
  the floating camera button).
- Route names are in Spanish (e.g. `despensa` = pantry, `historial` = history, `perfil` = profile,
  `recuperar` = recover). Follow this convention for new routes.

### Auth & session
- `middleware.ts` → `lib/supabase/middleware.ts` (`updateSession`) runs on every request: refreshes
  the Supabase session cookie and redirects unauthenticated users to `/login` for any non-public path
  (public paths: `/login`, `/register`, `/auth`, `/_next`, `/favicon`). Update `PUBLIC_PATHS` there
  when adding new public routes.
- `lib/supabase/client.ts` — browser client, only for Client Components (`"use client"`).
- `lib/supabase/server.ts` — server client for Server Components / Server Actions / Route Handlers.
- Auth actions (`app/(auth)/actions.ts`): `login`, `register`, `logout`, `requestPasswordReset` — all
  Server Actions using `useActionState`-style `(prevState, formData)` signatures.

### Home model ("Casa")
The **Casa** (`home`), not the user, owns all domestic data. A user can belong to several homes
(`home_members`, roles owner/member/guest — only owner is actually used in V0.1) and has one principal
home (`profiles.default_home_id`), auto-created and auto-assigned by a DB trigger on signup (see
`handle_new_user()` in `supabase/migrations/0001_init.sql`, renamed/extended by `0003_rename_household_to_home.sql`).

`lib/home.ts` exports `getCurrentUserAndHome()`, the single entry point every private page/action uses
to get the current `supabase` client, `user`, `homeId`, `homeName`, and the full list of the user's
`homes` (for the switcher). It resolves the active home as: the `current_home_id` cookie (set when the
user switches homes via the header) → `profiles.default_home_id` → oldest membership as a fallback.
Wrapped in React's `cache()` so the layout (header) and the page share one query per request. Always
use this helper rather than querying `home_members` directly.

Changing/creating homes goes through `app/(app)/actions.ts`: `switchHome` (sets the cookie, after
checking membership — called directly as a function from a click handler, not via `<form action>`,
because it lives inside a self-closing dropdown menu and unmounting the form mid-submit could cancel
it) and `createHome` (calls the `create_home` SQL RPC, a `SECURITY DEFINER` function — the only way to
insert into `homes`/`home_members` from the app, so no direct INSERT RLS policies are needed on those
tables). The header (`components/AppHeader.tsx` + `components/HomeSwitcher.tsx`) is the only multi-home
UI in V0.1 — keep it that way; no member management or roles UI beyond inviting.

Inviting someone to a home (`home_invitations` table, `supabase/migrations/0004_home_invitations.sql`)
follows the same `SECURITY DEFINER` RPC pattern: `invite_to_home` (owner only, works even if the
invited email has no account yet), `respond_to_invitation` (accept/decline, matched by the invitee's
`profiles.email`), `cancel_invitation`. UI: `components/HomeInvitePanel.tsx` in `/perfil` (send/cancel)
and `components/PendingInvitations.tsx` on `/inicio` (accept/decline banner for the invitee).

### Data model (see `supabase/migrations/*.sql` and `lib/types/database.ts`)
`profiles` (has `default_home_id`) / `homes` / `home_members` (roles: owner/member/guest) → `receipts`
(status: uploaded/processing/reviewed/error) → `receipt_items` (raw, user-entered/parsed line items,
optionally linked to a `products` catalog row) → `inventory_events` (purchase/correction/consumed/
adjustment; minimally used in V0.1, prepared for real stock tracking in V0.2+).

All tables have Row Level Security scoped to home membership (via `home_id in (select public.
get_my_home_ids())`, a `SECURITY DEFINER` helper that avoids RLS recursion on `home_members` — see
`0002_fix_household_members_rls_recursion.sql` / `0003_rename_household_to_home.sql`). `products` is a
shared read/insert catalog for any authenticated user, not scoped to a home. There's also a private
Storage bucket `receipts`, with objects stored under `{home_id}/{filename}` and RLS policies mirroring
table access. When adding new tables that hold domestic data, scope them by `home_id` (not `user_id`;
keep `user_id`-style columns only for real attribution, e.g. `created_by`/`assigned_to`) and add
equivalent RLS policies in the same migration style. **Exception:** `recetas` (see Recipes flow below)
is scoped by `autor_id`, not `home_id` — a recipe belongs to its author, not a Casa, so it can be shared
(public/friends) independently of where it was created; only the pantry-comparison step reads the active
Casa, at query time, never a Casa stored on the recipe itself.

`lib/types/database.ts` types are hand-written to match the migration, not generated — keep them in
sync manually, or regenerate with `supabase gen types typescript` (noted in the file as a V0.2 TODO).

### Receipt flow
1. `/tickets/new` → `uploadReceipt` action (`app/(app)/tickets/actions.ts`): validates file
   type/size, uploads to Storage under `{homeId}/{uuid}.{ext}`, inserts a `receipts` row
   (`status: uploaded`), redirects to `/tickets/{id}/review`.
2. `/tickets/[id]/review` (`ReviewForm.tsx`) — user manually fills in store/date/total/line items.
   Currently backed by `lib/receipt-parser/index.ts`'s `MockReceiptParser`, which returns an empty
   structure for the user to fill in by hand. **To add real OCR/AI extraction**: implement the
   `ReceiptParser` interface (e.g. `AiReceiptParser`) and swap out `mockReceiptParser`/`receiptParser`
   at its single point of use — no other code should need to change.
3. `saveReceiptReview` action (`app/(app)/tickets/[id]/actions.ts`) saves the ticket header and
   **replaces all `receipt_items` for that receipt** (delete + reinsert) rather than diffing —
   intentional simplification for V0.1's small per-receipt item counts. Sets `status: reviewed`.
4. `/despensa` derives a naive "pantry view" by grouping `receipt_items` by normalized `raw_name`
   and keeping the most recent purchase — there's no real stock/quantity tracking yet; that's what
   `inventory_events` is reserved for in a later version.

### Importación de tickets por JSON (`receipt_interpretation_v1`)
Botón **Importar JSON** en `/tickets/new` (`components/tickets/ImportJsonButton.tsx`): lee el fichero en el
navegador, lo valida y envía el texto a `importReceiptJson` (`app/(app)/tickets/actions.ts`), que **vuelve a
validar en servidor** y llama al RPC `import_receipt_json` (`0019_receipt_json_import.sql`): cabecera +
líneas en una sola transacción, `SECURITY INVOKER` (RLS), comprobación de pertenencia a la casa y detección
de duplicados (id de mensaje, hash del documento, supermercado + nº de ticket). Código en
`lib/receipt-import/` (`validate.ts` contrato → `adapter.ts` modelo interno → `persist.ts` RPC). La casa sale
siempre de `getCurrentUserAndHome()`, nunca del JSON (un `home_id` en el fichero se rechaza), y el estado se
fuerza a `pending_review` (`lib/receipt-status.ts`). **Un ticket `pending_review` no alimenta la despensa**:
`get_home_pantry`/`count_home_pending_interpretation` solo cuentan tickets `reviewed` y líneas de inventario;
la despensa se actualiza al pulsar «Confirmar compra» (`saveReceiptReview`, que pone `reviewed`). El flujo pide
el PDF del ticket (obligatorio, en dos pasos: JSON y luego PDF): la Server Action lo valida (`lib/receipt-import/pdf.ts`),
lo sube a `{homeId}/{uuid}.pdf` del bucket `receipts` y `import_receipt_json` (0020, ruta obligatoriamente
dentro de la carpeta de la casa) lo guarda en `receipts.image_path`; si el ticket no llega a crearse, se
borra el PDF. Su SHA-256 se guarda como `source_document_hash` si el JSON no trae hash. `image_path` es
nullable (0019) por si algún día se importa sin PDF. Ejemplo: `docs/examples/`. El nombre de producto
interpretado (`receipt_items.product_name`) se guarda siempre con la primera letra en mayúscula y el
resto en minúsculas -- única regla en TS: `capitalizeFirstLetter` (`lib/format.ts`); en BD,
`0021_capitalize_product_names.sql` añade `capitalize_first_letter()` + un trigger como red de
seguridad. No se aplica a `canonical_products.canonical_name` (catálogo gestionado a mano por
delegate/admin) ni a `raw_name`/`interpreter_proposals` (deliberado, ver esa migración).
`0022_capitalize_interpreter_names.sql` amplía la misma regla a
`canonical_products.canonical_name` ("Mi despensa", diccionario aprobado) y a
`interpreter_proposals.proposed_canonical_name` (pantallas de validar/conflictos,
solo propuestas `pending`/`conflict`), cada una con su propio trigger.

### Recipes flow (Fase 1)
`recetas` / `receta_ingredientes` / `receta_pasos` / `shopping_list_items`
(`supabase/migrations/0015_recetas.sql`) — see `docs/RECIPES_ARCHITECTURE.md` for the full model. Key
points: `recetas` is scoped by `autor_id`, not `home_id` (see exception noted in Data model above);
`receta_ingredientes.producto_id` references the same `canonical_products` catalog used by
despensa/interpreter/receipts (nullable — an ingredient can be saved without a match; it's then always
treated as missing and surfaced to admins on `/admin/products`); availability comparison
(`lib/recipes.ts`: `classifyIngredient`/`summarizeAvailability`) always runs against the viewer's active
Casa via `getCurrentUserAndHome()`. `shopping_list_items` (new — no shopping-list feature existed
before this) is home-scoped like `receipts`; `add_to_shopping_list()` (SQL) is the single write path from
both the recipe flow and the manual `/lista-compra` page, and merges into an existing unchecked line
instead of duplicating. Visibility (`privada`/`amigos`/`publica`): `amigos` intentionally behaves like
`privada` until a friends/relationships system exists — there is none today.

### System roles (platform-level, separate from home membership)
`profiles.system_role` (`user` default / `delegate` / `admin`, see `supabase/migrations/0005_system_roles.sql`)
controls platform-wide capabilities (moderating the global product interpreter, managing users) — it is
**orthogonal to `home_members`** and grants no access to any home's private data by itself. Use
`lib/roles.ts` (`getCurrentSystemRole()`, `isAdmin()`, `isDelegate()`, `canModerateInterpreter()`,
`canManageUsers()`) instead of comparing role strings directly. `system_role` cannot be changed by the
owning user or via a plain client update — a DB trigger blocks it; changes go exclusively through the
`set_user_role`/`set_user_role_by_email` SQL RPCs, which verify the caller is an admin and log to
`admin_audit_log`. Admin routes live under `app/(app)/admin/*` (`/admin` dashboard, `/users`,
`/interpreter`, `/interpreter/pending`, `/interpreter/conflicts`, `/products`, `/audit`), gated in
`layout.tsx`/`page.tsx` via `lib/roles.ts` (never rely on hiding nav links alone) — every mutating RPC
repeats the same role check server-side, so a direct `supabase.rpc(...)` call can't bypass it either.
See `docs/ROLES_AND_PERMISSIONS.md` for the full model/permission matrix/first-admin bootstrap, and
`docs/INTERPRETER_ARCHITECTURE.md` for the global product interpreter (`canonical_products` /
`retailer_products` / `product_aliases` / `interpreter_proposals`, see
`supabase/migrations/0006_interpreter_and_admin.sql`) — proposal submission/matching, approval
(transactional, also resolves conflicts), rejection, and editing already-approved knowledge. See
`docs/RECIPES_ARCHITECTURE.md` for the recipes module (Recipes flow above).

### Supermercados y categorías (normalización)
- Los nombres de supermercado se guardan **siempre en MAYÚSCULAS**. Única regla en TS:
  `normalizeSupermarketName` / `normalizeOptionalSupermarketName` / `buildSupermarketOptions`
  (`lib/supermarkets.ts`) — úsalas antes de cualquier INSERT/UPDATE/RPC que reciba un supermercado
  (`receipts.store_name`, `retailer` del intérprete). En BD, `0017_supermarkets_uppercase.sql` añade
  `normalize_supermarket_name()` + triggers como red de seguridad y `list_supermarkets()` (fuente del
  selector SUPERMERCADO de `/admin/interpreter`).
- Las 7 categorías oficiales viven solo en `lib/constants/product-categories.ts` (`PRODUCT_CATEGORIES`);
  no las repitas en otros archivos.

### Conventions
- Server Actions return a `{ error?: string } | null` state shape and are driven by forms using
  React's `useActionState`; follow this pattern for new mutations rather than route handlers.
- Path alias `@/*` maps to the repo root (see `tsconfig.json`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
