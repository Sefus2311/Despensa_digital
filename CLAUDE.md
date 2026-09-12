# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Despensa Digital" (smart-pantry-mvp) — a Next.js App Router MVP where users photograph/upload grocery
receipts, manually review the extracted line items, and track what's in their household pantry. V0.1:
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
```

There is no test suite configured yet.

Database schema changes go in `supabase/migrations/*.sql`, applied via the Supabase CLI or dashboard
(no local Supabase CLI config is checked in — check with the user how migrations are applied to their project).

## Architecture

### Stack
Next.js 16 (App Router, Server Components + Server Actions), React 19, Tailwind CSS 4, Supabase
(Postgres + Auth + Storage) via `@supabase/ssr`.

### Route groups
- `app/(auth)/` — `/login`, `/register`, `/recuperar` (password reset). Public.
- `app/(app)/` — `/inicio`, `/despensa`, `/historial`, `/perfil`, `/tickets/*`. Private, wrapped in
  a shared layout (`app/(app)/layout.tsx`) with a bottom tab bar (`components/BottomNav.tsx`).
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

### Household model
Every user belongs to exactly one household (auto-created by a DB trigger on signup — see
`handle_new_user()` in `supabase/migrations/0001_init.sql`). `lib/household.ts` exports
`getCurrentUserAndHousehold()`, the single entry point every private page/action uses to get the
current `supabase` client, `user`, and `householdId`. This is intentionally centralized so
multi-household support can be added later without touching every screen — always use this helper
rather than querying `household_members` directly.

### Data model (see `supabase/migrations/0001_init.sql` and `lib/types/database.ts`)
`profiles` / `households` / `household_members` (roles: owner/member) → `receipts` (status:
uploaded/processing/reviewed/error) → `receipt_items` (raw, user-entered/parsed line items, optionally
linked to a `products` catalog row) → `inventory_events` (purchase/correction/consumed/adjustment;
minimally used in V0.1, prepared for real stock tracking in V0.2+).

All tables have Row Level Security scoped to household membership (via a `household_id in (select ...
from household_members where user_id = auth.uid())` pattern). `products` is a shared read/insert
catalog for any authenticated user, not scoped to a household. There's also a private Storage bucket
`receipts`, with objects stored under `{household_id}/{filename}` and RLS policies mirroring table
access. When adding new tables that hold user data, add equivalent RLS policies in the same migration
style.

`lib/types/database.ts` types are hand-written to match the migration, not generated — keep them in
sync manually, or regenerate with `supabase gen types typescript` (noted in the file as a V0.2 TODO).

### Receipt flow
1. `/tickets/new` → `uploadReceipt` action (`app/(app)/tickets/actions.ts`): validates file
   type/size, uploads to Storage under `{householdId}/{uuid}.{ext}`, inserts a `receipts` row
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

### Conventions
- Server Actions return a `{ error?: string } | null` state shape and are driven by forms using
  React's `useActionState`; follow this pattern for new mutations rather than route handlers.
- Path alias `@/*` maps to the repo root (see `tsconfig.json`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
