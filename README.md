# AliBeka Thrift & Accessories

AliBeka is a Kenyan thrift-shop POS and inventory workflow designed around the physical movement of mitumba stock:

**Bale → Sort & classify → Price → Stock → Sell → Review**

Each physical piece is a first-class inventory record. The application currently runs on AppDeploy, with database and object-storage adapters isolated so the infrastructure can later migrate to PostgreSQL and S3-compatible storage without rewriting the domain workflow.

## Structure

- `backend/` — API, realtime helpers, and infrastructure adapters
- `src/` — React/Vite application
- `tests/` — acceptance tests

## Development

```bash
npm install
npm run build
```

No production credentials belong in this repository.

## Core workflow

1. Receive a bale
2. Quickly count pieces by category when needed
3. Complete piece details later: category, size, quality, description, and photo
4. Apply pricing rules
5. View and manage stock
6. Sell through POS with quick negotiated-price adjustments
7. Review sales and inventory

## Architecture

The current AppDeploy database and object-storage integrations live behind interfaces in `backend/infrastructure/`. The intended production migration is to replace those adapters with PostgreSQL and S3-compatible storage such as Cloudflare R2, while keeping the application and business workflow stable.
