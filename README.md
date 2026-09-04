# AliBeka Thrift & Accessories

AliBeka is a Kenyan thrift-shop POS and inventory workflow designed around the physical movement of mitumba stock:

**Bale → Sort & classify → Price → Stock → Sell → Review**

Each physical piece is a first-class inventory record.

The application runs as a standard web app on Vercel with Neon PostgreSQL for data and Cloudflare R2 for object storage. AppDeploy is no longer required.

## Architecture

```
GitHub (future-centaur/thriftshop)
       │
       ▼
    Vercel
 ┌─────────────┐
 │ React/Vite  │
 │   + Hono    │
 └──────┬──────┘
        │
   ┌────┴────┐
   ▼         ▼
 Neon     Cloudflare R2
 (data)   (item photos)
```

* **Frontend** — React 19 + Vite 6
* **API** — Hono 4 on Vercel serverless functions
* **Database** — Neon serverless PostgreSQL
* **Object storage** — Cloudflare R2 (S3-compatible)
* **Photo delivery** — R2 signed URLs (1 hour TTL)
* **API client** — Native `fetch` wrapper (`src/api.ts`)

## Structure

- `api/` — Hono entry point (Vercel function)
- `backend/` — Business logic + infrastructure adapters
  - `backend/business.ts` — domain operations (bales, items, sales, etc.)
  - `backend/infrastructure/database.ts` — Neon adapter
  - `backend/infrastructure/storage.ts` — R2 adapter
- `src/` — React/Vite application
- `migrations/` — SQL migrations for Neon
- `tests/` — Acceptance tests

## Development

```bash
npm install
npm run build
```

The Vite dev server (`npm run dev`) works for the frontend alone. To exercise the API end-to-end, configure the environment variables described below and run the Vercel dev server:

```bash
vercel dev
```

## Environment Variables

Configure these in `.env.local` for local development and in the Vercel project dashboard for production.

| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name (e.g. `alibeka-photos`) |

A template is provided in `.env.example`.

## Database setup

1. Create a Neon project.
2. Copy the connection string into `DATABASE_URL`.
3. Run the SQL migrations in order against your Neon database:
   - `migrations/001_initial_schema.sql`
   - `migrations/002_seed_data.sql`

These create the schema, the seed categories/qualities/price rules, and the `seeded` meta flag.

## Object storage setup

1. Create a Cloudflare R2 bucket (e.g. `alibeka-photos`).
2. Generate an API token with object read/write permissions.
3. Copy the credentials into the `R2_*` environment variables.

## Deployment

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Configure the environment variables above in Vercel project settings.
4. Run the migrations against your production Neon database.
5. Deploy.

A `vercel.json` is included to route `/api/*` to the Hono handler and everything else to the Vite-built `dist/`.

## Core workflow

1. Receive a bale
2. Quickly count pieces by category when needed
3. Complete piece details later: category, size, quality, description, and photo
4. Apply pricing rules
5. View and manage stock
6. Sell through POS with quick negotiated-price adjustments
7. Review sales and inventory

## Acceptance tests

The five application acceptance tests under `tests/` should pass against the migrated stack:

1. Quick-record a bale and create draft pieces
2. Complete a draft piece and attach a photo
3. Replace or remove an item photo
4. Adjust a negotiated POS price quickly
5. Complete a sale

## Migration history

This project was previously hosted on AppDeploy. As of the current version, all AppDeploy runtime dependencies (`@appdeploy/sdk`, `@appdeploy/client`) have been removed. The application is now deployable to any standard Vercel-compatible host with a PostgreSQL database and an S3-compatible object store.
