# ThriftShop Handoff — September 2026

## What was built this session

### Expenses feature (complete)
- **Backend**: `expenses` table, `expense_categories` table (soft-delete), full CRUD endpoints
- **Frontend**: Expenses tab with inline add/delete for categories (no browser dialogs), expense form
- **Migration**: `migrations/002_accounting.sql` — adds tables, cogs on sale_items, is_refund on sales
- **Profit math**: today's expenses deducted from today's gross profit on the Review tab

### Accounting backend (complete)
- `cogs` per sale item — tracked at sale time via `getItemCogs()`
- `createRefund` — writes negative-total sales row, restores items to `AVAILABLE`
- `getPeriodReport({from, to})` — full period P&L: net revenue, gross profit, total expenses, net profit, bales, items, top categories

## Remaining work

### 1. Wire Reports tab to `getPeriodReport`
**Priority: high** — the backend does the real accounting math; the frontend ignores it.

What needs to be built:
- `Report` component in `src/App.tsx` — does not exist yet
- `report` tab type exists in `Tab` but has no rendering block
- No nav item for "Report" tab
- Needs: date range picker, calls `GET /api/reports/period?from=&to=`, displays the full P&L

### 2. Refund UI
**Priority: medium** — endpoint exists (`POST /api/refunds`), no frontend flow.

What needs to be built:
- A way to trigger a refund from the Review or Stock tab
- Should prompt for reason, call `POST /api/refunds`

### 3. Expense detail on Review/Reports view
**Priority: low** — expense totals show but not the line items.

---

## Open concern: today-only profit is misleading on high-expense days

### The current calculation
```ts
const todayExpenses = expenses.filter((e) => e.expenseDate === today);
const grossProfit = todaySales.reduce((a, s) => a + s.total, 0);
const todayExpenseTotal = todayExpenses.reduce((a, e) => a + e.amount, 0);
const profit = grossProfit - todayExpenseTotal;
```

### Why this is a problem
A sale's profit depends on its COGS, which is spread across all items in a bale. Expenses (rent, transport, stock purchases) land on a single calendar day and are then subtracted from that day's sales only. This creates two distortions:

1. **Timing mismatch**: If you sell items received in last week's bale on a day when you also pay rent, the rent is attributed to today's sales — even though those sales are selling last week's inventory.

2. **Scale mismatch**: A single $500 rent payment on a $200 sales day makes it look like you're losing $300 — when in reality you're running a healthy margin across the month.

### The correct accounting approach (already done in backend)
Net profit should be calculated over a **period** (week/month/quarter):
```
Net Profit = (Revenue − Refunds) − COGS − Total Period Expenses
```
This is exactly what `getPeriodReport` does. The daily profit number on Review is an indicator, not the answer.

### Question that needs deliberation
Should the daily `profit` display be:
- **(A) Drop it from the Review tab entirely** — replace "profit" with a link/note pointing to the Reports tab for the real number. Cleaner, no false signal.
- **(B) Show it as "Gross Profit" (sales only, no expenses today)** — frame it honestly: this is revenue minus COGS, not net profit. Expense netting on a single day is misleading.
- **(C) Keep it as-is but add a warning badge** — "⚠️ includes today's expenses only; view Reports for full period" — so the user understands the limitation without losing the number.

**My recommendation: Option B** — rename to "Gross Profit", let the Reports tab handle net profit. A single day with a $500 expense and $200 in sales looks bad but means nothing in isolation. The period view is where the business actually lives.

---

## Committed state
Three commits on `main`:
1. `accounting-migration` — SQL schema + backend
2. `expense-categories-ui` — frontend Expenses tab
3. `migration-runner-script` — `backend/infrastructure/migrations.ts` + `scripts/run-migrations.ts`
