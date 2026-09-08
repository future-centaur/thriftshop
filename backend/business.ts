import { database } from './infrastructure/database';
import { objectStorage } from './infrastructure/storage';
import {
    generateToken,
    generatePin,
    hashPassword,
    hashPin,
    verifyPassword,
    verifyPin,
} from './infrastructure/auth';

type R = Record<string, unknown>;

const tables = {
    items: 'items',
    bales: 'bales',
    rules: 'price_rules',
    sales: 'sales',
    saleItems: 'sale_items',
    meta: 'meta',
    categories: 'categories',
    qualities: 'qualities',
    expenses: 'expenses',
    expenseCategories: 'expense_categories',
    users: 'users',
    sessions: 'sessions',
    passwordResets: 'password_resets',
};

const SESSION_DURATION_DAYS = 30;
const PASSWORD_RESET_HOURS = 1;

// Helper: compute session expiry timestamp
function sessionExpiry(): string {
    return new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Helper: strip secret fields from a user record before returning to the client
function publicUser(u: R) {
    if (!u) return u;
    const { pinHash, passwordHash, ...rest } = u as Record<string, unknown>;
    return rest;
}

type SessionUserPublic = {
    id: string;
    name: string;
    email: string;
    role: string;
    hasPin: boolean;
    hasPassword: boolean;
};

function toSessionUser(u: R): SessionUserPublic {
    return {
        id: String(u.id),
        name: String(u.name),
        email: String(u.email),
        role: String(u.role),
        hasPin: !!u.pinHash,
        hasPassword: !!u.passwordHash,
    };
}

const seedCategories = ['Dresses', 'Pallazos', 'Sweatpants', 'Tops', 'Shirts', 'Trousers', 'Skirts'];
const seedRules: Array<[string, string, number]> = [
    ['Dresses', '1st', 1000], ['Dresses', '2nd', 700], ['Dresses', '3rd', 450],
    ['Pallazos', '1st', 900], ['Pallazos', '2nd', 650], ['Pallazos', '3rd', 400],
    ['Sweatpants', '1st', 1000], ['Sweatpants', '2nd', 700], ['Sweatpants', '3rd', 450],
];

async function list(table: string, limit = 500) {
    const result = await database.list<R>(table, { limit });
    return result.items;
}

const photoKey = (id: string) => `inventory/${id}/primary`;

async function addPhotoUrls(items: R[]) {
    const keyed = items.map((item) => ({ item, key: String(item.photoKey || '') })).filter((x) => x.key);
    const urls = new Map<string, string>();
    for (let i = 0; i < keyed.length; i += 100) {
        const batch = keyed.slice(i, i + 100);
        const result = await objectStorage.url(batch.map((x) => x.key));
        result.forEach((x) => {
            if (x.url) urls.set(x.path, x.url);
        });
    }
    return items.map((item) => {
        const key = String(item.photoKey || '');
        if (key && urls.has(key)) return { ...item, photoUrl: urls.get(key) };
        if (!key && String(item.photo || '').startsWith('http')) return { ...item, photoUrl: String(item.photo) };
        return { ...item, photoUrl: '' };
    });
}

async function ensureSeed() {
    const meta = await list(tables.meta, 10);
    if (!meta.length) {
        await database.add(tables.meta, [{ key: 'seeded', value: 'true' }]);
        await database.add(tables.rules, seedRules.map(([category, quality, basePrice]) => ({ category, quality, base_price: basePrice })));
        await database.add(tables.categories, seedCategories.map((name) => ({ name, active: true })));
        await database.add(tables.qualities, ['1st', '2nd', '3rd'].map((name) => ({ name, active: true })));
        return;
    }
    const cats = await list(tables.categories);
    if (!cats.length) await database.add(tables.categories, seedCategories.map((name) => ({ name, active: true })));
    const qs = await list(tables.qualities);
    if (!qs.length) await database.add(tables.qualities, ['1st', '2nd', '3rd'].map((name) => ({ name, active: true })));
}

export async function bootstrap() {
    await ensureSeed();
    const [rawItems, bales, rules, sales, cats, qs, expenses, expenseCats, users] = await Promise.all([
        list(tables.items),
        list(tables.bales),
        list(tables.rules),
        list(tables.sales),
        list(tables.categories),
        list(tables.qualities),
        list(tables.expenses),
        list(tables.expenseCategories),
        list(tables.users),
    ]);
    const items = await addPhotoUrls(rawItems);
    const categories = cats.filter((c) => c.active !== false).map((c) => String(c.name)).sort();
    const qualities = qs.filter((q) => q.active !== false).map((q) => String(q.name));
    return {
        isSetup: users.length > 0,
        users: users.filter((u) => u.active !== false && u.active !== 'false').map(publicUser),
        items,
        bales,
        rules: rules.filter((r) => qualities.includes(String(r.quality)) && String(r.quality) !== 'Camera'),
        sales,
        categories,
        qualities,
        qualityRecords: qs.filter((q) => q.active !== false).map((q) => ({ id: String(q.id), name: String(q.name) })),
        expenses,
        expenseCategories: expenseCats
            .filter((c) => c.active !== false)
            .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    };
}

// === Bale operations ===
export async function createBale(body: R) {
    const purchaseDate = String(body.purchaseDate || '').trim();
    const purchasePrice = Number(body.purchasePrice);
    const supplier = String(body.supplier || '').trim();
    const quick = Boolean(body.quick);
    let itemCount = Number(body.itemCount);
    const categoryCounts = (body.categoryCounts && typeof body.categoryCounts === 'object' ? body.categoryCounts : {}) as Record<string, unknown>;

    if (!purchaseDate) return { error: 'Purchase date is required', status: 400 };
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return { error: 'Enter a valid purchase price', status: 400 };
    if (!supplier) return { error: 'Supplier is required', status: 400 };

    if (quick) {
        const entries = Object.entries(categoryCounts)
            .map(([category, count]) => [category, Number(count)] as const)
            .filter(([, count]) => Number.isInteger(count) && count > 0);
        itemCount = entries.reduce((sum, [, count]) => sum + count, 0);
        if (itemCount < 1) return { error: 'Enter at least one item in a category', status: 400 };
        const validCategories = (await list(tables.categories)).filter((c) => c.active !== false).map((c) => String(c.name));
        if (entries.some(([category]) => !validCategories.includes(category))) return { error: 'One or more categories are invalid', status: 400 };
    } else if (!Number.isInteger(itemCount) || itemCount < 1) {
        return { error: 'Enter a valid item count', status: 400 };
    }

    const baleNumber = 'BAL-' + Date.now().toString().slice(-6);
    const [id] = await database.add(tables.bales, [{
        baleNumber,
        purchaseDate,
        purchasePrice,
        itemCount,
        supplier,
    }]);
    if (!id) return { error: 'Could not create bale', status: 500 };

    if (quick) {
        for (const [category, count] of Object.entries(categoryCounts)) {
            const take = Number(count);
            if (!Number.isInteger(take) || take < 1) continue;
            let left = take;
            let offset = 0;
            while (left > 0) {
                const batch = Math.min(left, 500);
                const records = Array.from({ length: batch }, (_, i) => ({
                    baleId: String(id),
                    name: `${category} piece ${offset + i + 1}`,
                    category,
                    size: '',
                    quality: '',
                    basePrice: 0,
                    status: 'DRAFT',
                    photo: '',
                }));
                const ids = await database.add(tables.items, records);
                if (ids.some((x) => !x)) return { error: 'Bale recorded but some category drafts could not be created', status: 500 };
                left -= batch;
                offset += batch;
            }
        }
    }

    return { data: { id, quick, itemsCreated: quick ? itemCount : 0, categoryCounts: quick ? categoryCounts : {} }, status: 201 };
}

// === Category operations ===
export async function createCategory(body: R) {
    const name = String((body as R)?.name || '').trim();
    if (!name) return { error: 'Category name is required', status: 400 };
    const existing = await list(tables.categories);
    if (existing.some((c) => String(c.name).toLowerCase() === name.toLowerCase() && c.active !== false)) {
        return { error: 'Category already exists', status: 409 };
    }
    const [id] = await database.add(tables.categories, [{ name, active: true }]);
    return id ? { data: { id, name }, status: 201 } : { error: 'Could not create category', status: 500 };
}

export async function updateCategory(params: { name: string }, body: R) {
    const oldName = decodeURIComponent(params.name);
    const records = await list(tables.categories);
    const old = records.find((c) => String(c.name) === oldName);
    if (!old) return { error: 'Category not found', status: 404 };

    const patch = (body || {}) as R;
    const name = String(patch.name ?? old.name).trim();
    if (!name) return { error: 'Category name is required', status: 400 };
    if (records.some((c) => String(c.name).toLowerCase() === name.toLowerCase() && String(c.name) !== oldName && c.active !== false)) {
        return { error: 'Category already exists', status: 409 };
    }
    const ok = await database.update(tables.categories, [{ id: String(old.id), record: { ...old, name, active: old.active } }]);
    if (!ok[0]) return { error: 'Could not update category', status: 500 };
    if (oldName !== name) {
        const [items, rules] = await Promise.all([list(tables.items), list(tables.rules)]);
        const ai = items.filter((i) => i.category === oldName);
        const ar = rules.filter((r) => r.category === oldName);
        if (ai.length) await database.update(tables.items, ai.map((i) => ({ id: String(i.id), record: { ...i, category: name } })));
        if (ar.length) await database.update(tables.rules, ar.map((r) => ({ id: String(r.id), record: { ...r, category: name } })));
    }
    return { data: { name } };
}

// === Quality operations ===
export async function createQuality(body: R) {
    const name = String((body as R)?.name || '').trim();
    if (!name) return { error: 'Quality name is required', status: 400 };
    const existing = await list(tables.qualities);
    if (existing.some((q) => String(q.name).toLowerCase() === name.toLowerCase() && q.active !== false)) {
        return { error: 'Quality already exists', status: 409 };
    }
    const [id] = await database.add(tables.qualities, [{ name, active: true }]);
    return id ? { data: { id, name }, status: 201 } : { error: 'Could not create quality', status: 500 };
}

export async function deleteQuality(params: { id: string }) {
    const [q] = await database.get<R>(tables.qualities, [params.id]);
    if (!q) return { error: 'Quality not found', status: 404 };
    const name = String(q.name);
    const [items, rules] = await Promise.all([list(tables.items), list(tables.rules)]);
    if (items.some((i) => String(i.quality) === name)) {
        return { error: 'This quality is used by inventory and cannot be deleted', status: 409 };
    }
    const related = rules.filter((r) => String(r.quality) === name);
    if (related.length) await database.delete(tables.rules, related.map((r) => String(r.id)));
    const ok = await database.delete(tables.qualities, [params.id]);
    return ok[0] ? { data: { deleted: true } } : { error: 'Could not delete quality', status: 500 };
}

// === Item operations ===
export async function createItem(body: R) {
    if (!body.baleId || !body.category || !body.quality || !body.size) {
        return { error: 'Missing item fields', status: 400 };
    }
    const [bale] = await database.get<R>(tables.bales, [String(body.baleId)]);
    if (!bale) return { error: 'Bale not found', status: 404 };
    const [id] = await database.add(tables.items, [{
        baleId: String(body.baleId),
        name: String(body.name || ''),
        category: String(body.category),
        size: String(body.size),
        quality: String(body.quality),
        basePrice: Number(body.basePrice || 0),
        status: 'AVAILABLE',
        photo: '',
    }]);
    if (!id) return { error: 'Could not create item', status: 500 };
    // Increment the parent bale's item count to keep it in sync
    const newCount = Number(bale.itemCount || 0) + 1;
    await database.update(tables.bales, [{ id: String(bale.id), record: { ...bale, itemCount: newCount } }]);
    return { data: { id }, status: 201 };
}

export async function deleteItem(params: { id: string }) {
    const [old] = await database.get<R>(tables.items, [params.id]);
    if (!old) return { error: 'Item not found', status: 404 };
    const ok = await database.delete(tables.items, [params.id]);
    if (!ok[0]) return { error: 'Could not delete item', status: 500 };
    if (old.baleId) {
        const [bale] = await database.get<R>(tables.bales, [String(old.baleId)]);
        if (bale) {
            const newCount = Math.max(0, Number(bale.itemCount || 0) - 1);
            await database.update(tables.bales, [{ id: String(bale.id), record: { ...bale, itemCount: newCount } }]);
        }
    }
    return { data: { deleted: true } };
}

export async function uploadItemPhoto(params: { id: string }, body: R) {
    try {
        const [item] = await database.get<R>(tables.items, [params.id]);
        if (!item) return { error: 'Item not found', status: 404 };
        const content = String(body.content || '');
        const contentType = String(body.contentType || '');
        if (!content || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
            return { error: 'Use a JPG, PNG or WebP image', status: 400 };
        }
        if (content.length > 2500000) {
            return { error: 'Photo is too large after compression', status: 413 };
        }
        const path = photoKey(params.id);
        const result = await objectStorage.write([{ path, content, contentType }]);
        if (!result[0]) return { error: 'Could not store photo', status: 500 };
        const ok = await database.update(tables.items, [{
            id: params.id,
            record: { ...item, photoKey: path, photo: '' },
        }]);
        if (!ok[0]) return { error: 'Photo stored but item could not be updated', status: 500 };
        const [{ url }] = await objectStorage.url([path]);
        return { data: { photoKey: path, photoUrl: url || '' }, status: 201 };
    } catch (e) {
        console.error('uploadItemPhoto failed', e);
        return { error: 'Could not upload photo', status: 500 };
    }
}

export async function deleteItemPhoto(params: { id: string }) {
    try {
        const [item] = await database.get<R>(tables.items, [params.id]);
        if (!item) return { error: 'Item not found', status: 404 };
        const path = String(item.photoKey || '');
        if (path) {
            const deleted = await objectStorage.delete([path]);
            if (!deleted[0]) return { error: 'Could not delete photo', status: 500 };
        }
        const ok = await database.update(tables.items, [{
            id: params.id,
            record: { ...item, photoKey: '', photo: '' },
        }]);
        return ok[0] ? { data: { deleted: true } } : { error: 'Could not update item', status: 500 };
    } catch (e) {
        console.error('deleteItemPhoto failed', e);
        return { error: 'Could not remove photo', status: 500 };
    }
}

export async function updateItem(params: { id: string }, body: R) {
    const [old] = await database.get<R>(tables.items, [params.id]);
    if (!old) return { error: 'Item not found', status: 404 };
    const record = { ...old, ...(body as R) };
    if (record.status === 'SOLD' && old.status !== 'SOLD') {
        return { error: 'Sold status can only be set by a sale', status: 400 };
    }
    if (record.status === 'AVAILABLE' && (!String(record.category || '') || !String(record.quality || '') || !String(record.size || ''))) {
        return { error: 'Complete category, size and quality before making the piece available', status: 400 };
    }
    const ok = await database.update(tables.items, [{ id: params.id, record }]);
    return ok[0] ? { data: record } : { error: 'Could not update item', status: 500 };
}

// === Rule operations ===
export async function saveRule(body: R) {
    const category = String(body.category || '').trim();
    const quality = String(body.quality || '').trim();
    const basePrice = Number(body.basePrice);
    if (!category || !quality || quality === 'Camera' || !Number.isFinite(basePrice) || basePrice < 0) {
        return { error: 'Enter a valid category, quality and base price', status: 400 };
    }
    const existing = await list(tables.rules);
    const match = existing.find((r) => r.category === category && r.quality === quality);
    if (match) {
        const ok = await database.update(tables.rules, [{ id: String(match.id), record: { ...match, category, quality, basePrice } }]);
        return ok[0] ? { data: { id: match.id, updated: true } } : { error: 'Could not update rule', status: 500 };
    }
    const [id] = await database.add(tables.rules, [{ category, quality, basePrice }]);
    return id ? { data: { id }, status: 201 } : { error: 'Could not create rule', status: 500 };
}

// === Sale operations ===

/** Compute average COGS for an item from its bale. Returns 0 for items with no bale. */
async function getItemCogs(itemId: string): Promise<number> {
    const [item] = await database.get<R>(tables.items, [itemId]);
    if (!item || !item.baleId) return 0;
    const [bale] = await database.get<R>(tables.bales, [String(item.baleId)]);
    if (!bale) return 0;
    const count = Number(bale.itemCount || 0);
    if (count <= 0) {
        console.warn(`[getItemCogs] Bale ${bale.id} has zero itemCount; COGS set to 0`);
        return 0;
    }
    return Number(bale.purchasePrice || 0) / count;
}
export async function createSale(body: R) {
    const saleItems = Array.isArray(body.items) ? body.items as R[] : [];
    if (!saleItems.length || !['Cash', 'M-Pesa'].includes(String(body.paymentMethod))) {
        return { error: 'Invalid sale', status: 400 };
    }
    const ids = saleItems.map((i) => String(i.itemId));
    const records = await database.get<R>(tables.items, ids);
    if (records.some((x) => !x || x.status !== 'AVAILABLE')) {
        return { error: 'One or more items are no longer available', status: 409 };
    }
    const total = saleItems.reduce((a, i) => a + Number(i.actualSalePrice || 0), 0);

    // Insert into sales table
    const [saleId] = await database.add(tables.sales, [{
        total,
        paymentMethod: String(body.paymentMethod),
        createdAt: new Date().toISOString(),
    }]);
    if (!saleId) return { error: 'Could not create sale', status: 500 };

    // Compute COGS per item and insert sale_items
    const saleItemRecords = await Promise.all(saleItems.map(async (i) => ({
        saleId: String(saleId),
        itemId: String(i.itemId),
        basePrice: Number(i.basePrice || 0),
        actualPrice: Number(i.actualSalePrice || 0),
        cogs: await getItemCogs(String(i.itemId)),
    })));
    const saleItemIds = await database.add(tables.saleItems, saleItemRecords);
    if (saleItemIds.some((x) => !x)) {
        return { error: 'Sale created but sale items could not be recorded', status: 500 };
    }

    const updated = await database.update(tables.items, records.map((item) => ({
        id: String(item!.id),
        record: { ...item, status: 'SOLD' },
    })));
    if (updated.some((x) => !x)) {
        return { error: 'Sale created but inventory update needs review', status: 500 };
    }
    return { data: { id: saleId, total }, status: 201 };
}

// === Refund operations ===
export async function createRefund(body: R) {
    const saleId = String(body.saleId || '');
    const reason = String(body.reason || '').trim();
    if (!saleId) return { error: 'Sale ID is required', status: 400 };
    if (!['Wrong item', 'Customer changed mind', 'Defective', 'Other'].includes(reason)) {
        return { error: 'A valid reason is required', status: 400 };
    }

    const [sale] = await database.get<R>(tables.sales, [saleId]);
    if (!sale) return { error: 'Sale not found', status: 404 };
    if (sale.isRefund) return { error: 'This sale has already been refunded', status: 409 };

    // Fetch all sale_items for this sale
    const { items: saleItems } = await database.list<R>(tables.saleItems, {
        filter: { saleId },
    });

    // Refund total = negative of original
    const refundTotal = -Math.abs(Number(sale.total));

    const [refundId] = await database.add(tables.sales, [{
        total: refundTotal,
        paymentMethod: String(sale.paymentMethod),
        createdAt: new Date().toISOString(),
        isRefund: true,
        reason,
        originalSaleId: saleId,
    }]);
    if (!refundId) return { error: 'Could not create refund', status: 500 };

    // Restore each item to AVAILABLE
    const itemIds = saleItems.map((si) => String(si.itemId));
    const itemRecords = await database.get<R>(tables.items, itemIds);
    await database.update(tables.items, itemRecords
        .filter(Boolean)
        .map((item) => ({ id: String(item!.id), record: { ...item, status: 'AVAILABLE' } })));

    return { data: { id: refundId, total: refundTotal }, status: 201 };
}

// === Expense operations ===
export async function createExpense(body: R, userId?: string) {
    const description = String(body.description || '').trim();
    const category = String(body.category || '').trim();
    const amount = Number(body.amount);
    const expenseDate = String(body.expenseDate || '').trim();

    if (!description) return { error: 'Description is required', status: 400 };
    if (!category) return { error: 'Category is required', status: 400 };
    if (!Number.isFinite(amount) || amount < 0) {
        return { error: 'Enter a valid amount', status: 400 };
    }
    if (!expenseDate) return { error: 'Date is required', status: 400 };

    // Validate category exists in the expense_categories list
    const { items: cats } = await database.list<R>(tables.expenseCategories, { filter: { active: true } });
    if (!cats.some((c) => String(c.name).toLowerCase() === category.toLowerCase())) {
        return { error: `"${category}" is not in your expense categories. Add it first.`, status: 400 };
    }

    const record: R = { description, category, amount, expenseDate };
    if (userId) record.userId = userId;

    const [id] = await database.add(tables.expenses, [record]);
    return id
        ? { data: { id }, status: 201 }
        : { error: 'Could not create expense', status: 500 };
}

export async function deleteExpense(params: { id: string }) {
    const [existing] = await database.get<R>(tables.expenses, [params.id]);
    if (!existing) return { error: 'Expense not found', status: 404 };
    const ok = await database.delete(tables.expenses, [params.id]);
    return ok[0] ? { data: { deleted: true } } : { error: 'Could not delete expense', status: 500 };
}

// === Expense category operations ===
export async function createExpenseCategory(body: R) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'Category name is required', status: 400 };
    if (name.length > 60) return { error: 'Name is too long (max 60 chars)', status: 400 };
    const { items: existing } = await database.list<R>(tables.expenseCategories, {});
    if (existing.some((c) => String(c.name).toLowerCase() === name.toLowerCase())) {
        return { error: 'This category already exists', status: 409 };
    }
    const [id] = await database.add(tables.expenseCategories, [{ name, active: true }]);
    return id ? { data: { id, name }, status: 201 } : { error: 'Could not create category', status: 500 };
}

export async function deleteExpenseCategory(params: { id: string }) {
    const [existing] = await database.get<R>(tables.expenseCategories, [params.id]);
    if (!existing) return { error: 'Category not found', status: 404 };
    // Soft-delete: mark inactive rather than removing, so existing expenses keep their label
    await database.update(tables.expenseCategories, [{
        id: params.id,
        record: { ...existing, active: false },
    }]);
    return { data: { deleted: true } };
}

// === Reports ===
export async function getPeriodReport(query: { from?: string; to?: string }) {
    const from = query.from || new Date().toISOString().slice(0, 10);
    const to = query.to || new Date().toISOString().slice(0, 10);

    // Fetch all sales in range
    const { items: allSales } = await database.list<R>(tables.sales, { limit: 5000 });
    const periodSales = allSales.filter((s) => {
        const d = String(s.createdAt || '').slice(0, 10);
        return d >= from && d <= to;
    });

    const refundSales = periodSales.filter((s) => s.isRefund);
    const regularSales = periodSales.filter((s) => !s.isRefund);

    const totalRevenue = regularSales.reduce((a, s) => a + Number(s.total || 0), 0);
    const totalRefunds = Math.abs(refundSales.reduce((a, s) => a + Number(s.total || 0), 0));
    const netRevenue = totalRevenue - totalRefunds;

    // Fetch sale_items for all regular sales in period to compute gross profit
    const regularSaleIds = regularSales.map((s) => String(s.id));
    const { items: allSaleItems } = await database.list<R>(tables.saleItems, { limit: 10000 });
    const periodSaleItems = allSaleItems.filter((si) => regularSaleIds.includes(String(si.saleId)));
    const grossProfit = periodSaleItems.reduce(
        (a, si) => a + (Number(si.actualPrice || 0) - Number(si.cogs || 0)),
        0
    );

    // Expenses in range
    const { items: allExpenses } = await database.list<R>(tables.expenses, { limit: 5000 });
    const periodExpenses = allExpenses.filter((e) => {
        const d = String(e.expenseDate || '').slice(0, 10);
        return d >= from && d <= to;
    });
    const totalExpenses = periodExpenses.reduce((a, e) => a + Number(e.amount || 0), 0);

    const netProfit = grossProfit - totalExpenses;

    // Bales received in range
    const { items: allBales } = await database.list<R>(tables.bales, { limit: 1000 });
    const baleCount = allBales.filter((b) => {
        const d = String(b.purchaseDate || '').slice(0, 10);
        return d >= from && d <= to;
    }).length;

    // Items sold (from regular sales)
    const itemCount = periodSaleItems.length;

    // Top categories by revenue
    const { items: allItems } = await database.list<R>(tables.items, { limit: 10000 });
    const itemMap = new Map(allItems.map((i) => [String(i.id), i]));
    const categoryRevenue = new Map<string, { count: number; revenue: number }>();
    for (const si of periodSaleItems) {
        const item = itemMap.get(String(si.itemId));
        if (!item) continue;
        const cat = String(item.category || 'Unknown');
        const entry = categoryRevenue.get(cat) || { count: 0, revenue: 0 };
        entry.count++;
        entry.revenue += Number(si.actualPrice || 0);
        categoryRevenue.set(cat, entry);
    }
    const topCategories = [...categoryRevenue.entries()]
        .map(([category, v]) => ({ category, count: v.count, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue);

    return {
        data: {
            from, to,
            totalRevenue: Math.round(totalRevenue),
            totalRefunds: Math.round(totalRefunds),
            netRevenue: Math.round(netRevenue),
            totalExpenses: Math.round(totalExpenses),
            grossProfit: Math.round(grossProfit),
            netProfit: Math.round(netProfit),
            itemCount,
            baleCount,
            topCategories,
        },
    };
}

// === Auth: session management ===

export async function createSession(userId: string): Promise<string> {
    const token = generateToken();
    await database.add(tables.sessions, [{
        id: token,
        userId,
        expiresAt: sessionExpiry(),
    }]);
    return token;
}

export async function deleteSession(sessionId: string): Promise<void> {
    await database.delete(tables.sessions, [sessionId]);
}

// === Auth: login ===

type AuthSuccess = { user: SessionUserPublic; token: string };

export async function login(body: R): Promise<{ data?: AuthSuccess; error?: string; status?: number }> {
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const pin = String(body.pin || '');

    if (!email) return { error: 'Email is required', status: 400 };
    if (!password && !pin) return { error: 'Password or PIN is required', status: 400 };

    const { items: users } = await database.list<R>(tables.users, {
        filter: { email, active: true },
        limit: 1,
    });
    const user = users[0];
    if (!user) return { error: 'Invalid email or password', status: 401 };

    // Verify password or PIN
    const passwordHash = String(user.passwordHash || '');
    const pinHash = String(user.pinHash || '');
    const hasPassword = !!passwordHash;
    const hasPin = !!pinHash;

    if (password) {
        if (!hasPassword) return { error: 'This account does not have a password set', status: 401 };
        const valid = await verifyPassword(password, passwordHash);
        if (!valid) return { error: 'Invalid email or password', status: 401 };
    } else {
        if (!hasPin) return { error: 'This account does not have a PIN set', status: 401 };
        const valid = await verifyPin(pin, pinHash);
        if (!valid) return { error: 'Invalid PIN', status: 401 };
    }

    const token = await createSession(String(user.id));
    return {
        data: {
            user: toSessionUser(user),
            token,
        },
    };
}

// === Auth: register first admin (first-run wizard) ===

export async function registerFirstAdmin(body: R): Promise<{ data?: AuthSuccess; error?: string; status?: number }> {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const confirm = String(body.confirmPassword || '');

    if (!name) return { error: 'Name is required', status: 400 };
    if (!email || !email.includes('@')) return { error: 'A valid email is required', status: 400 };
    if (!password || password.length < 8) return { error: 'Password must be at least 8 characters', status: 400 };
    if (password !== confirm) return { error: 'Passwords do not match', status: 400 };

    // Check no users exist
    const { items: existing } = await database.list<R>(tables.users, { limit: 1 });
    if (existing.length > 0) {
        return { error: 'A first admin already exists', status: 403 };
    }

    const passwordHash = await hashPassword(password);
    const [id] = await database.add(tables.users, [{
        name,
        email,
        passwordHash,
        role: 'admin',
        active: true,
    }]);
    if (!id) return { error: 'Could not create admin account', status: 500 };

    const token = await createSession(String(id));
    return {
        data: {
            user: { id: String(id), name, email, role: 'admin', hasPin: false, hasPassword: true },
            token,
        },
    };
}

// === Auth: get current session ===

export async function getSession(token?: string): Promise<{ user: R | null; isSetup: boolean }> {
    if (!token) return { user: null, isSetup: false };
    const { items: sessions } = await database.list<R>(tables.sessions, {
        filter: { id: token },
        limit: 1,
    });
    const session = sessions[0];
    if (!session) return { user: null, isSetup: false };

    // Check expiry
    if (new Date(String(session.expiresAt)) < new Date()) {
        await database.delete(tables.sessions, [String(session.id)]);
        return { user: null, isSetup: false };
    }

    const { items: users } = await database.list<R>(tables.users, {
        filter: { id: String(session.userId), active: true },
        limit: 1,
    });
    const user = users[0];
    if (!user) return { user: null, isSetup: false };

    return {
        user: toSessionUser(user),
        isSetup: true,
    };
}

// === Auth: change PIN ===

export async function changePin(userId: string, newPin: string): Promise<{ error?: string; status?: number }> {
    if (!/^\d{4,6}$/.test(newPin)) {
        return { error: 'PIN must be 4 to 6 digits', status: 400 };
    }
    const pinHash = await hashPin(newPin);
    await database.update(tables.users, [{
        id: userId,
        record: { pinHash },
    }]);
    return {};
}

// === Auth: change password ===

export async function changePassword(
    userId: string,
    currentPw: string,
    newPw: string
): Promise<{ error?: string; status?: number }> {
    if (!newPw || newPw.length < 8) {
        return { error: 'New password must be at least 8 characters', status: 400 };
    }
    const { items: users } = await database.list<R>(tables.users, {
        filter: { id: userId },
        limit: 1,
    });
    const user = users[0];
    if (!user) return { error: 'User not found', status: 404 };

    const passwordHash = String(user.passwordHash || '');
    if (passwordHash) {
        const valid = await verifyPassword(currentPw, passwordHash);
        if (!valid) return { error: 'Current password is incorrect', status: 401 };
    }

    const hash = await hashPassword(newPw);
    await database.update(tables.users, [{ id: userId, record: { passwordHash: hash } }]);
    return {};
}

// === Auth: update own name / email ===

export async function updateProfile(
    userId: string,
    body: R
): Promise<{ data?: { user: SessionUserPublic }; error?: string; status?: number }> {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').toLowerCase().trim();

    if (!name) return { error: 'Name is required', status: 400 };
    if (!email || !email.includes('@')) return { error: 'A valid email is required', status: 400 };

    const { items: current } = await database.list<R>(tables.users, {
        filter: { id: userId },
        limit: 1,
    });
    const user = current[0];
    if (!user) return { error: 'User not found', status: 404 };

    if (email !== String(user.email)) {
        const { items: existing } = await database.list<R>(tables.users, {
            filter: { email },
            limit: 1,
        });
        if (existing.length > 0 && String(existing[0].id) !== userId) {
            return { error: 'An account with this email already exists', status: 409 };
        }
    }

    await database.update(tables.users, [{
        id: userId,
        record: { name, email },
    }]);

    return {
        data: {
            user: {
                id: userId,
                name,
                email,
                role: String(user.role),
                hasPin: !!user.pinHash,
                hasPassword: !!user.passwordHash,
            },
        },
    };
}

// === Auth: request password reset ===

export async function requestPasswordReset(email: string): Promise<{ error?: string; status?: number }> {
    const { items: users } = await database.list<R>(tables.users, {
        filter: { email: email.toLowerCase(), active: true },
        limit: 1,
    });
    const user = users[0];
    if (!user) {
        // Don't reveal whether the email exists
        return {};
    }

    // Generate a random token
    const token = generateToken().replace(/[^a-zA-Z0-9]/g, '').slice(0, 48);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_HOURS * 60 * 60 * 1000).toISOString();

    await database.add(tables.passwordResets, [{
        userId: String(user.id),
        token,
        expiresAt,
        used: false,
    }]);

    // In dev, log the link to console. In production, send an email.
    const resetUrl = `http://localhost:5180/reset-password?token=${token}`;
    console.log(`[password-reset] Reset link for ${email}: ${resetUrl}`);
    return {};
}

// === Auth: reset password with token ===

export async function resetPassword(token: string, newPassword: string): Promise<{ error?: string; status?: number }> {
    if (!newPassword || newPassword.length < 8) {
        return { error: 'Password must be at least 8 characters', status: 400 };
    }
    const { items: resets } = await database.list<R>(tables.passwordResets, {
        filter: { token },
        limit: 1,
    });
    const reset = resets[0];
    if (!reset) return { error: 'Invalid or expired reset token', status: 400 };
    if (reset.used) return { error: 'This reset link has already been used', status: 400 };
    if (new Date(String(reset.expiresAt)) < new Date()) {
        return { error: 'This reset link has expired', status: 400 };
    }

    const hash = await hashPassword(newPassword);
    await database.update(tables.users, [{
        id: String(reset.userId),
        record: { passwordHash: hash },
    }]);
    await database.update(tables.passwordResets, [{
        id: String(reset.id),
        record: { used: true },
    }]);
    return {};
}

// === User management ===

export async function listUsers(): Promise<{ data: R[] }> {
    const { items } = await database.list<R>(tables.users, { limit: 100 });
    return { data: items.map(publicUser) };
}

export async function createUser(
    body: R,
    actingUser: { id: string; role: string }
): Promise<{ data?: { user: R; pin: string }; error?: string; status?: number }> {
    if (actingUser.role !== 'admin') return { error: 'Admin access required', status: 403 };
    const name = String(body.name || '').trim();
    const email = String(body.email || '').toLowerCase().trim();
    if (!name) return { error: 'Name is required', status: 400 };
    if (!email || !email.includes('@')) return { error: 'A valid email is required', status: 400 };

    // Check email not taken
    const { items: existing } = await database.list<R>(tables.users, {
        filter: { email },
        limit: 1,
    });
    if (existing.length > 0) return { error: 'An account with this email already exists', status: 409 };

    // Admins can create other admins or attendants; defaults to attendant
    const requestedRole = body.role as string | undefined;
    const role = (requestedRole === 'admin' || requestedRole === 'attendant')
        ? requestedRole
        : 'attendant';

    // Generate default PIN for the new user
    const pin = generatePin();
    const pinHash = await hashPin(pin);

    const [id] = await database.add(tables.users, [{
        name,
        email,
        pinHash,
        role,
        active: true,
    }]);
    if (!id) return { error: 'Could not create user', status: 500 };

    return {
        data: {
            user: { id, name, email, role },
            pin, // Returned only once, at creation time
        },
    };
}

export async function deactivateUser(
    userId: string,
    actingUser: { id: string; role: string }
): Promise<{ error?: string; status?: number }> {
    if (actingUser.role !== 'admin') return { error: 'Admin access required', status: 403 };
    if (actingUser.id === userId) return { error: 'You cannot deactivate your own account', status: 400 };

    const { items: users } = await database.list<R>(tables.users, {
        filter: { id: userId },
        limit: 1,
    });
    const user = users[0];
    if (!user) return { error: 'User not found', status: 404 };

    await database.update(tables.users, [{
        id: userId,
        record: { active: false },
    }]);

    const { items: sessions } = await database.list<R>(tables.sessions, {
        filter: { user_id: userId },
        limit: 100,
    });
    if (sessions.length) {
        await database.delete(tables.sessions, sessions.map((s) => String(s.id)));
    }
    return {};
}
