import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import {
    bootstrap,
    createBale,
    createCategory,
    updateCategory,
    createQuality,
    deleteQuality,
    createItem,
    uploadItemPhoto,
    deleteItemPhoto,
    updateItem,
    saveRule,
    createSale,
} from '../backend/business';

type ApiResult<T = unknown> = { data?: T; error?: string; status?: number };

function respond<T>(result: ApiResult<T>) {
    if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
            status: result.status ?? 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    return new Response(JSON.stringify(result.data ?? null), {
        status: result.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

const app = new Hono().basePath('/api');

app.get('/_healthcheck', (c) => c.json({ message: 'Success' }));
app.get('/bootstrap', async (c) => respond({ data: await bootstrap() }));

app.post('/bales', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createBale(body));
});

app.post('/categories', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createCategory(body));
});

app.put('/categories/:name', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({}));
    return respond(await updateCategory({ name }, body));
});

app.post('/qualities', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createQuality(body));
});

app.delete('/qualities/:id', async (c) => {
    return respond(await deleteQuality({ id: c.req.param('id') }));
});

app.post('/items', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createItem(body));
});

app.put('/items/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    return respond(await updateItem({ id }, body));
});

app.post('/items/:id/photo', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    return respond(await uploadItemPhoto({ id }, body));
});

app.delete('/items/:id/photo', async (c) => {
    return respond(await deleteItemPhoto({ id: c.req.param('id') }));
});

app.post('/rules', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond<{ id: string; updated?: boolean }>(await saveRule(body));
});

app.post('/sales', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createSale(body));
});

// Export the Vercel-compatible handler
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);

export default app;
