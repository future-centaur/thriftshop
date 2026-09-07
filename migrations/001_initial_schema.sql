-- Migration 001: Initial Schema
-- AliBeka - AppDeploy → Vercel + Neon + R2 migration
-- Idempotent: safe to re-run.

-- Enable UUID generation (required for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- NOTE: This migration uses CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE
-- so it is safe to re-run on an existing database. Do NOT add DROP TABLE
-- statements here — they would destroy production data if the runner ever
-- replays this file.
-- If you need to add new tables, use CREATE TABLE IF NOT EXISTS.

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(active);

-- Qualities table (e.g., 1st, 2nd, 3rd)
CREATE TABLE IF NOT EXISTS qualities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualities_active ON qualities(active);

-- Bales table
CREATE TABLE IF NOT EXISTS bales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bale_number TEXT NOT NULL UNIQUE,
    purchase_date TEXT NOT NULL,
    purchase_price NUMERIC(12, 2) NOT NULL,
    item_count INTEGER NOT NULL,
    supplier TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bales_created ON bales(created_at DESC);

-- Items table
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bale_id UUID REFERENCES bales(id) ON DELETE SET NULL,
    name TEXT,
    category TEXT,
    size TEXT,
    quality TEXT,
    base_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'AVAILABLE', 'SOLD', 'REMOVED')),
    photo TEXT,
    photo_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_bale ON items(bale_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_quality ON items(quality);

-- Price rules table
CREATE TABLE IF NOT EXISTS price_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    quality TEXT NOT NULL,
    base_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (category, quality)
);

CREATE INDEX IF NOT EXISTS idx_price_rules_category ON price_rules(category);
CREATE INDEX IF NOT EXISTS idx_price_rules_quality ON price_rules(quality);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total NUMERIC(12, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'M-Pesa')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC);

-- Sale items table (relational, not JSON)
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    base_price NUMERIC(12, 2) NOT NULL,
    actual_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_item ON sale_items(item_id);

-- Meta table (for flags like 'seeded')
CREATE TABLE IF NOT EXISTS meta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The key column already has a UNIQUE constraint (which creates an implicit index),
-- so this duplicate unique index is redundant — but we keep it for safety on fresh dbs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_key ON meta(key);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers (DROP IF EXISTS + CREATE so re-runs are safe)
DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_qualities_updated_at ON qualities;
CREATE TRIGGER update_qualities_updated_at BEFORE UPDATE ON qualities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bales_updated_at ON bales;
CREATE TRIGGER update_bales_updated_at BEFORE UPDATE ON bales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_items_updated_at ON items;
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_price_rules_updated_at ON price_rules;
CREATE TRIGGER update_price_rules_updated_at BEFORE UPDATE ON price_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meta_updated_at ON meta;
CREATE TRIGGER update_meta_updated_at BEFORE UPDATE ON meta
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
