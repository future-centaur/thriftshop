# ThriftShop Handoff — September 2026

## Bug fix: white page on startup (September 7, 2026)

### Symptom
After `npm run dev`, Vite served the React app but the screen stayed white. The API server was running, but every request to `/api/*` returned `{"error":"Not authenticated. Please log in."}` — including the bootstrap call. With the bootstrap fetch failing, the `App` component never moved past its `loading` screen, so nothing rendered.

### Root cause
`api/local-server.ts`'s auth middleware compared `c.req.path` against a `PUBLIC_PATHS` set whose entries were *missing the `/api` prefix* AND missing `/auth/session` itself:

```ts
const PUBLIC_PATHS = new Set([
    '/_healthcheck',
    '/bootstrap',
    '/auth/login',
    ...
]);
```

Hono's `c.req.path` includes the base path, so the actual paths were `/api/_healthcheck`, `/api/bootstrap`, `/api/auth/session`, etc. None matched. Every request — even the unauthenticated bootstrap — was rejected with 401.

### Fix
Updated `PUBLIC_PATHS` to use the full `/api/...` paths, and added `/api/auth/session` (which was missing entirely):

```ts
const PUBLIC_PATHS = new Set([
    '/api/_healthcheck',
    '/api/bootstrap',
    '/api/auth/session',
    '/api/auth/login',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/register-first-admin',
]);
```

A restart of `npm run dev` is required for the change to take effect.

### Also fixed earlier in the same session
- Killed a leftover `alibeka` process holding port 5180/3002 (EADDRINUSE on dev startup). Cleared with `Get-NetTCPConnection` + `Stop-Process`.

## What was built this session

### Reports tab (complete)
- Backend `getPeriodReport` was already wired up; this session adds the UI
- New "Reports" nav item in sidebar (index 6) and mobile menu
- `Report` component with date range picker + Today/This Week/This Month/This Year presets
- Calls `GET /api/reports/period?from=&to=` and displays:
  - Net revenue, gross profit, **net profit (after expenses)** (styled as the anchor metric)
  - Total expenses, refunds, items sold, bales received
  - Top categories by revenue table
- `PeriodReport` type defined inline in `Report` component

### Refund UI (complete)
- `processRefund` helper: `POST /api/refunds` → `refresh()` → toast
- Refund modal: reason radio buttons (Wrong item / Customer changed mind / Defective / Other) → confirms → items restored to AVAILABLE
- Sale type extended with `isRefund`, `reason`, `originalSaleId`
- Review tab sale rows show "Refund" pill button (hidden for refund rows)
- Refund rows styled with red tint and "Refund" label suffix

### Daily profit label (complete)
- Review tab metric renamed from "Net take-home (after expenses)" → "Gross profit (before expenses)"
- Honest framing; nudges users to Reports tab for the real period net profit

### Expense feature (carried over, complete)
- **Backend**: `expenses` table, `expense_categories` table (soft-delete), full CRUD endpoints
- **Frontend**: Expenses tab with inline add/delete for categories (no browser dialogs), expense form
- **Migration**: `migrations/002_accounting.sql` — adds tables, cogs on sale_items, is_refund on sales
- **Profit math**: today's expenses deducted from today's gross profit on the Review tab

### Accounting backend (carried over, complete)
- `cogs` per sale item — tracked at sale time via `getItemCogs()`
- `createRefund` — writes negative-total sales row, restores items to `AVAILABLE`
- `getPeriodReport({from, to})` — full period P&L: net revenue, gross profit, total expenses, net profit, bales, items, top categories

## Committed state
Four commits on `main`:
1. `accounting-migration` — SQL schema + backend
2. `expense-categories-ui` — frontend Expenses tab
3. `migration-runner-script` — `backend/infrastructure/migrations.ts` + `scripts/run-migrations.ts`
4. `reports-and-refund-ui` — Reports tab + Refund UI + profit metric rename

## No remaining open items

All three items from the previous handoff are complete:
- [x] Wire Reports tab to `getPeriodReport` — done
- [x] Refund UI — done
- [x] Daily profit label rename — done (Gross profit / before expenses)
