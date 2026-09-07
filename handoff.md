# ThriftShop Handoff — September 2026

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
