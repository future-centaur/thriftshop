import { database } from './infrastructure/database';
import { objectStorage } from './infrastructure/storage';

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
};

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
    const [rawItems, bales, rules, sales, cats, qs] = await Promise.all([
        list(tables.items),
        list(tables.bales),
        list(tables.rules),
        list(tables.sales),
        list(tables.categories),
        list(tables.qualities),
    ]);
    const items = await addPhotoUrls(rawItems);
    const categories = cats.filter((c) => c.active !== false).map((c) => String(c.name)).sort();
    const qualities = qs.filter((q) => q.active !== false).map((q) => String(q.name));
    return {
        items,
        bales,
        rules: rules.filter((r) => qualities.includes(String(r.quality)) && String(r.quality) !== 'Camera'),
        sales,
        categories,
        qualities,
        qualityRecords: qs.filter((q) => q.active !== false).map((q) => ({ id: String(q.id), name: String(q.name) })),
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
    return id ? { data: { id }, status: 201 } : { error: 'Could not create item', status: 500 };
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

    // Insert relational sale_items
    const saleItemRecords = saleItems.map((i) => ({
        saleId: String(saleId),
        itemId: String(i.itemId),
        basePrice: Number(i.basePrice || 0),
        actualPrice: Number(i.actualSalePrice || 0),
    }));
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
