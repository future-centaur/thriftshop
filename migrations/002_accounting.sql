-- Migration 002: Accounting overhaul
-- Adds COGS tracking, expenses, refund support, and fixes bale item counts.
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. Retroactively fix bale.itemCount to match actual item count
-- ============================================================
UPDATE bales
SET item_count = COALESCE(
    (SELECT COUNT(*) FROM items WHERE items.bale_id = bales.id),
    0
)
WHERE item_count IS DISTINCT FROM COALESCE(
    (SELECT COUNT(*) FROM items WHERE items.bale_id = bales.id),
    0
);

-- ============================================================
-- 2. COGS column on sale_items
-- ============================================================
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cogs NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- ============================================================
-- 3. Expenses table
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    expense_date TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3b. Expense categories (user-managed list)
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON expense_categories(active);

DROP TRIGGER IF EXISTS update_expense_categories_updated_at ON expense_categories;
CREATE TRIGGER update_expense_categories_updated_at BEFORE UPDATE ON expense_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed defaults so the user has something to start with
INSERT INTO expense_categories (name) VALUES
    ('Rent'), ('Transport'), ('Packaging'), ('Sundries'), ('Other')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 4. Refund support on sales
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_refund BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS original_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_refund ON sales(is_refund) WHERE is_refund = TRUE;
CREATE INDEX IF NOT EXISTS idx_sales_original ON sales(original_sale_id) WHERE original_sale_id IS NOT NULL;
