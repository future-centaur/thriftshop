// Auto-applies SQL migrations on startup.
// Loads .sql files from /migrations and executes them in order against Neon.
// Idempotent: re-running is safe (uses CREATE TABLE IF NOT EXISTS-style patterns).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Split SQL content into individual statements.
 * Respects dollar-quoted strings ($...$) so semicolons inside
 * CREATE FUNCTION bodies don't break the split.
 */
function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let i = 0;
    let inDollarQuote = false;
    let dollarTag = '';
    while (i < sql.length) {
        if (!inDollarQuote && sql[i] === '$') {
            // Try to read a dollar-quote tag: $name$ where name is empty or [A-Za-z0-9_]*
            const tagMatch = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
            if (tagMatch) {
                inDollarQuote = true;
                dollarTag = tagMatch[0];
                current += tagMatch[0];
                i += tagMatch[0].length;
                continue;
            }
        }
        if (inDollarQuote && sql.startsWith(dollarTag, i)) {
            current += dollarTag;
            i += dollarTag.length;
            inDollarQuote = false;
            dollarTag = '';
            continue;
        }
        if (!inDollarQuote && sql[i] === ';') {
            statements.push(current.trim());
            current = '';
            i++;
            continue;
        }
        // Inside a line comment (-- ... \n), copy through without splitting
        if (!inDollarQuote && sql[i] === '-' && sql[i + 1] === '-') {
            const lineEnd = sql.indexOf('\n', i);
            const stop = lineEnd === -1 ? sql.length : lineEnd;
            current += sql.slice(i, stop);
            i = stop;
            continue;
        }
        current += sql[i++];
    }
    const remaining = current.trim();
    if (remaining) statements.push(remaining);
    return statements;
}

export async function runMigrations(): Promise<void> {

    // Try multiple possible migration paths (dev vs vercel build)
    const candidates = [
        join(__dirname, '..', '..', 'migrations'),         // dev: api/ -> ../../migrations
        join(__dirname, '..', 'migrations'),              // dev: backend/ -> ../migrations
        join(process.cwd(), 'migrations'),                  // cwd/migrated
        join(process.cwd(), '..', 'migrations'),          // cwd/../migrations
    ];
    let migrationsDir: string | null = null;
    for (const c of candidates) {
        if (existsSync(c)) {
            migrationsDir = c;
            break;
        }
    }
    if (!migrationsDir) {
        console.warn('[migrations] No migrations directory found; skipping auto-migration.');
        return;
    }

    const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    if (!files.length) return;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set. Configure your Neon connection string in environment variables.');
    }

    // Dynamic import so we don't load Neon until we know we need it
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(connectionString) as unknown as (query: string) => Promise<unknown>;

    // Per-file idempotency: track which migrations have run in the meta table
    // so that individual new migrations can be applied even after the initial schema.
    // We track applied files by name rather than just checking for meta existence.
    const applied = new Set<string>();
    try {
        const rows = await sql('SELECT value FROM meta WHERE key LIKE \'migration:%\'') as { value: string }[];
        for (const row of rows) applied.add(row.value);
    } catch {
        // meta table doesn't exist yet — fall through to run migrations
    }

    for (const file of files) {
        if (applied.has(file)) {
            console.log(`[migrations] Already applied ${file}; skipping.`);
            continue;
        }
        const fullPath = join(migrationsDir, file);
        const content = readFileSync(fullPath, 'utf-8');
        // Neon's HTTP query API only runs one statement per call, so we split
        // the file on semicolons while respecting dollar-quoted blocks
        // (CREATE OR REPLACE FUNCTION bodies use $...$ delimiters).
        const statements = splitSqlStatements(content);
        for (const stmt of statements) {
            if (!stmt) continue;
            try {
                await sql(stmt);
            } catch (e) {
                console.error(`[migrations] Failed in ${file}:`, e);
                console.error(`[migrations] Statement was:\n${stmt.slice(0, 200)}`);
                throw e;
            }
        }
        // Record this migration as applied
        try {
            await sql(`INSERT INTO meta (key, value) VALUES ('migration:${file}', '${file}')`);
        } catch {
            // Ignore duplicate key errors — another process may have applied it concurrently
        }
        console.log(`[migrations] Applied ${file}`);
    }
}
