-- Migration 003: Authentication & user-scoped data
-- Adds: users, sessions, password_resets tables; links expenses to users.
-- Idempotent: safe to re-run.

-- Users table — admins and attendants
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    pin_hash TEXT,                  -- bcrypt hash of 4-6 digit PIN (nullable; admins may not have one)
    password_hash TEXT,             -- bcrypt hash of password (nullable; attendants may have only a PIN)
    role TEXT NOT NULL DEFAULT 'attendant' CHECK (role IN ('admin', 'attendant')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- Sessions table — 64-char hex tokens stored in HttpOnly cookies
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,            -- 64-char hex token (32 random bytes)
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Password resets — tokens for forgot-password flow
CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);

-- Link expenses to users. Existing expenses get user_id = NULL (preserved as pre-auth data).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);

-- Apply updated_at triggers to new tables
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
