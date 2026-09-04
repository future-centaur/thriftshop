import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless';

export interface Database {
    add(table: string, records: Array<Record<string, unknown>>): Promise<Array<string | null>>;
    get<T = Record<string, any>>(table: string, ids: string[]): Promise<Array<T | null>>;
    list<T = Record<string, any>>(table: string, options?: { filter?: Record<string, unknown>; nextToken?: string; limit?: number }): Promise<{ items: Array<Omit<T, 'id'> & { id: string }>; nextToken?: string }>;
    update(table: string, items: Array<{ id: string; record: Record<string, unknown> }>): Promise<boolean[]>;
    delete(table: string, ids: string[]): Promise<boolean[]>;
}

// Neon config: pool connections over HTTP for serverless
neonConfig.fetchConnectionCache = true;

function getClient(): NeonQueryFunction<false, false> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set. Configure your Neon connection string in environment variables.');
    }
    return neon(connectionString);
}

const PHOTO_KEYS = new Set(['photo_key', 'photoKey']);

// Convert incoming camelCase keys to snake_case to match DB columns.
function toDbRecord(record: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
        // Convert camelCase to snake_case (only for known keys)
        const dbKey = PHOTO_KEYS.has(key) ? 'photo_key' : key;
        out[dbKey] = value;
    }
    return out;
}

function toApiRecord<T = Record<string, any>>(row: T | null | undefined): T | null {
    if (!row) return null;
    const out: Record<string, unknown> = { ...row };
    if ('photo_key' in out) {
        out.photoKey = out.photo_key;
    }
    if ('purchase_price' in out) {
        out.purchasePrice = typeof out.purchase_price === 'string' ? Number(out.purchase_price) : out.purchase_price;
    }
    if ('base_price' in out) {
        out.basePrice = typeof out.base_price === 'string' ? Number(out.base_price) : out.base_price;
    }
    if ('actual_price' in out) {
        out.actualPrice = typeof out.actual_price === 'string' ? Number(out.actual_price) : out.actual_price;
    }
    if ('item_count' in out) {
        out.itemCount = typeof out.item_count === 'string' ? Number(out.item_count) : out.item_count;
    }
    if ('bale_id' in out) {
        out.baleId = out.bale_id;
    }
    if ('bale_number' in out) {
        out.baleNumber = out.bale_number;
    }
    if ('purchase_date' in out) {
        out.purchaseDate = out.purchase_date;
    }
    if ('payment_method' in out) {
        out.paymentMethod = out.payment_method;
    }
    if ('created_at' in out) {
        out.createdAt = typeof out.created_at === 'string' ? out.created_at : (out.created_at as Date)?.toISOString?.() ?? out.created_at;
    }
    if ('updated_at' in out) {
        out.updatedAt = typeof out.updated_at === 'string' ? out.updated_at : (out.updated_at as Date)?.toISOString?.() ?? out.updated_at;
    }
    return out as T;
}

function quoteIdent(ident: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) {
        throw new Error(`Invalid identifier: ${ident}`);
    }
    return `"${ident}"`;
}

const ALLOWED_TABLES = new Set([
    'items', 'bales', 'price_rules', 'sales', 'sale_items',
    'meta', 'categories', 'qualities', 'entity_subscriptions',
]);

function validateTable(table: string): void {
    if (!ALLOWED_TABLES.has(table)) {
        throw new Error(`Table not allowed: ${table}`);
    }
}

export const database: Database = {
    async add(table: string, records: Array<Record<string, unknown>>): Promise<Array<string | null>> {
        if (!records.length) return [];
        validateTable(table);
        const sql = getClient();
        const t = quoteIdent(table);
        const ids: Array<string | null> = [];
        for (const record of records) {
            const dbRecord = toDbRecord(record);
            const columns = Object.keys(dbRecord);
            if (!columns.length) {
                ids.push(null);
                continue;
            }
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
            const values = columns.map((c) => {
                const v = dbRecord[c];
                if (typeof v === 'undefined') return null;
                return v;
            });
            const colList = columns.map(quoteIdent).join(', ');
            const query = `INSERT INTO ${t} (${colList}) VALUES (${placeholders}) RETURNING id`;
            try {
                const result = await sql(query, values);
                const id = result[0]?.id ?? null;
                ids.push(id);
            } catch (e) {
                console.error(`database.add failed for table ${table}:`, e);
                ids.push(null);
            }
        }
        return ids;
    },

    async get<T = Record<string, any>>(table: string, ids: string[]): Promise<Array<T | null>> {
        if (!ids.length) return [];
        validateTable(table);
        const sql = getClient();
        const t = quoteIdent(table);
        const result = await sql(`SELECT * FROM ${t} WHERE id = ANY($1::uuid[])`, [ids]);
        const map = new Map<string, T>();
        for (const row of result as any[]) {
            map.set(String(row.id), toApiRecord<T>(row) as T);
        }
        return ids.map((id) => map.get(id) ?? null);
    },

    async list<T = Record<string, any>>(table: string, options?: { filter?: Record<string, unknown>; nextToken?: string; limit?: number }): Promise<{ items: Array<Omit<T, 'id'> & { id: string }>; nextToken?: string }> {
        validateTable(table);
        const sql = getClient();
        const t = quoteIdent(table);
        const limit = Math.min(options?.limit ?? 500, 1000);
        const offset = options?.nextToken ? Number(options.nextToken) : 0;

        const filter = options?.filter ?? {};
        const whereClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;
        for (const [key, value] of Object.entries(filter)) {
            const col = key === 'photoKey' ? 'photo_key' : key;
            if (col === 'basePrice') continue; // skip
            if (value && typeof value === 'object' && '$ne' in (value as Record<string, unknown>)) {
                whereClauses.push(`${quoteIdent(col)} <> $${paramIndex}`);
                values.push((value as Record<string, unknown>).$ne);
            } else {
                whereClauses.push(`${quoteIdent(col)} = $${paramIndex}`);
                values.push(value);
            }
            paramIndex++;
        }
        const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const query = `SELECT * FROM ${t} ${where} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        const result = await sql(query, [...values, limit, offset]);
        const items = (result as any[]).map((row) => toApiRecord(row)) as Array<Omit<T, 'id'> & { id: string }>;
        const nextToken = result.length === limit ? String(offset + limit) : undefined;
        return { items, nextToken };
    },

    async update(table: string, items: Array<{ id: string; record: Record<string, unknown> }>): Promise<boolean[]> {
        if (!items.length) return [];
        validateTable(table);
        const sql = getClient();
        const t = quoteIdent(table);
        const results: boolean[] = [];
        for (const { id, record } of items) {
            const dbRecord = toDbRecord(record);
            delete (dbRecord as Record<string, unknown>).id;
            delete (dbRecord as Record<string, unknown>).created_at;
            delete (dbRecord as Record<string, unknown>).updated_at;
            const columns = Object.keys(dbRecord);
            if (!columns.length) {
                results.push(false);
                continue;
            }
            const setClauses = columns.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(', ');
            const values = columns.map((c) => dbRecord[c] ?? null);
            const query = `UPDATE ${t} SET ${setClauses} WHERE id = $${columns.length + 1}`;
            try {
                const result = await sql(query, [...values, id]);
                results.push(Array.isArray(result) ? result.length > 0 : true);
            } catch (e) {
                console.error(`database.update failed for table ${table}:`, e);
                results.push(false);
            }
        }
        return results;
    },

    async delete(table: string, ids: string[]): Promise<boolean[]> {
        if (!ids.length) return [];
        validateTable(table);
        const sql = getClient();
        const t = quoteIdent(table);
        const result = await sql(`DELETE FROM ${t} WHERE id = ANY($1::uuid[])`, [ids]);
        return ids.map(() => true);
    },
};
