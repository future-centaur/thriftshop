# AliBeka Thriftshop — Context for Claude Code

AliBeka is a Vercel-deployed + Neon PostgreSQL + React (Vite) thriftshop management app. Two environments share the same API code: the Vercel deployment (`api/index.ts`) and a local dev server (`api/local-server.ts`). The Vite frontend runs on port 5180 and proxies to the local API on 3002.

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion, Lucide icons
- **API:** Hono (Vercel adapter for prod, `@hono/node-server` for local dev)
- **Database:** Neon PostgreSQL via `@neondatabase/serverless`
- **Auth:** bcryptjs (password/PIN hashing), HttpOnly session cookies
- **File storage:** AWS S3/R2 for item photos
- **Dev runner:** `tsx` for TypeScript execution

## Running locally

```bash
npm run dev          # starts both API (port 3002) and Vite frontend (port 5180)
npm run dev:api      # API only
npm run dev:frontend # Vite only
npm run typecheck    # tsc --noEmit
npm run migrate      # runs pending SQL migrations
```

## Key files

| File | Purpose |
|---|---|
| `src/App.tsx` | Main React UI — all tabs, modals, state |
| `src/api.ts` | Frontend fetch client with typed API methods |
| `api/index.ts` | Hono app routes (Vercel deployment) |
| `api/local-server.ts` | Hono app routes (local dev — same logic, different CORS/port setup) |
| `backend/business.ts` | Core business logic (auth, CRUD, reports) |
| `backend/infrastructure/auth.ts` | Session token generation, validation, password/PIN hashing |
| `backend/infrastructure/database.ts` | Neon DB wrapper (add, get, list, update, delete) |
| `backend/infrastructure/migrations.ts` | Auto-applies `migrations/*.sql` files on startup |
| `migrations/001_initial_schema.sql` | Items, bales, sales, categories, qualities, price rules |
| `migrations/003_auth.sql` | `users`, `sessions`, `password_resets` tables |
| `.env.local` | Local env vars — `DATABASE_URL`, `AWS_*`, `R2_*` |

## Auth architecture

Sessions are stored in the `sessions` table with a 64-char hex token (HttpOnly cookie, 30-day expiry). The `sessions` table has only `id, user_id, expires_at, created_at` — **no `active` flag**. User deactivation is checked by looking up the user record separately.

`validateSession` in `auth.ts` loads the session row, checks expiry, then joins the `users` table to verify the user is still active before returning the `SessionUser`. Both `api/index.ts` and `api/local-server.ts` use this same `validateSession`.

## Known patterns

- `database.list` with filter `{ id: token }` — WHERE `"id" = $1` (the `id` column name passes through `quoteIdent` unchanged; no camelCase conversion for `id`)
- `database.list` converts `photo_key → photoKey`, `base_price → basePrice`, etc. via `toApiRecord` on read
- `database.update` strips camelCase aliases before building the SET clause so they don't get written as invalid columns
- Admin-only routes (`/bales`, `/categories`, `/qualities`, `/rules`, `/expense-categories`, `/users`, `/reports`, `/expenses`) are listed in `ADMIN_ONLY_PATHS` — these sets contain paths **with** the `/api` prefix (Hono's `c.req.path` returns the full URL path)
- PUBLIC_PATHS: `'/_healthcheck', '/bootstrap', '/auth/session', '/auth/login', '/auth/forgot-password', '/auth/reset-password', '/auth/register-first-admin'` (no `/api` prefix)
- The `business.ts` file exports a named `R` type (lowercase) used internally for `{ [key: string]: unknown }` record shapes

## Adding a new migration

1. Create `migrations/XXX_descriptive_name.sql`
2. Use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for idempotency
3. Run `npm run migrate` to apply it
4. The migration runner tracks applied files in `meta` table via `migration:<filename.sql>` keys
