// Local development server for the Hono API.
// Runs the same api/index.ts routes on a plain Node HTTP server,
// so you don't need Vercel CLI to test the full stack locally.

import { Hono, Context, Next } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import type { AuthVariables, SessionUser } from '../backend/infrastructure/auth';
import {
    bootstrap,
    createBale,
    createCategory,
    updateCategory,
    createQuality,
    deleteQuality,
    createItem,
    deleteItem,
    uploadItemPhoto,
    deleteItemPhoto,
    updateItem,
    saveRule,
    createSale,
    createRefund,
    createExpense,
    deleteExpense,
    createExpenseCategory,
    deleteExpenseCategory,
    getPeriodReport,
    login,
    registerFirstAdmin,
    getSession,
    changePin,
    changePassword,
    updateProfile,
    requestPasswordReset,
    resetPassword,
    listUsers,
    createUser,
    deactivateUser,
} from '../backend/business';
import { validateSession } from '../backend/infrastructure/auth';
import { database } from '../backend/infrastructure/database';
import { runMigrations } from '../backend/infrastructure/migrations';

type ApiResult<T = unknown> = { data?: T; error?: string; status?: number };

// ── Response helper ────────────────────────────────────────────────────────────

function respond<T>(result: ApiResult<T>, forceStatus?: number): Response {
    const status = forceStatus ?? result.status ?? (result.error ? 500 : 200);
    return new Response(JSON.stringify(result.data ?? { error: result.error }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ── Error helper ─────────────────────────────────────────────────────────────

function error(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ── Auth middleware ──────────────────────────────────────────────────────────

const PUBLIC_PATHS = new Set([
    '/api/_healthcheck',
    '/api/bootstrap',
    '/api/auth/session',
    '/api/auth/login',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/register-first-admin',
]);

const ADMIN_ONLY_PATHS = new Set([
    '/bales',
    '/categories',
    '/qualities',
    '/rules',
    '/expense-categories',
    '/users',
    '/reports',
]);

async function authMiddleware(c: Context<{ Variables: AuthVariables }>, next: Next) {
    const path = c.req.path;
    const token = getCookie(c, 'session_id');

    if (PUBLIC_PATHS.has(path)) return next();

    if (path === '/expenses' || path.startsWith('/expenses')) {
        if (!token) throw new HTTPException(401, { message: 'Not authenticated. Please log in.' });
        const result = await validateSession(database, token);
        if (!result) throw new HTTPException(401, { message: 'Session expired or invalid. Please log in again.' });
        c.set('user', result.user);
        c.set('sessionId', result.sessionId);
        return next();
    }

    const isAdminOnly = ADMIN_ONLY_PATHS.has(path) ||
        path.startsWith('/users') ||
        path === '/reports/period';

    if (!token) throw new HTTPException(401, { message: 'Not authenticated. Please log in.' });

    const result = await validateSession(database, token);
    if (!result) throw new HTTPException(401, { message: 'Session expired or invalid. Please log in again.' });

    c.set('user', result.user);
    c.set('sessionId', result.sessionId);

    if (isAdminOnly && result.user.role !== 'admin') {
        throw new HTTPException(403, { message: 'Admin access required.' });
    }

    await next();
}

// ── Hono app ────────────────────────────────────────────────────────────────

const app = new Hono<{ Variables: AuthVariables }>().basePath('/api');

// Allow requests from Vite dev server (localhost:5180) in dev
app.use('*', cors({
    origin: ['http://localhost:5180', 'http://127.0.0.1:5180'],
    credentials: true,
}));

app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return c.json({ error: err.message }, { status: err.status });
    }
    console.error('[unhandled error]', err);
    return c.json({ error: 'Internal server error' }, { status: 500 });
});

app.use('*', authMiddleware);

// ── Public routes ────────────────────────────────────────────────────────────

app.get('/_healthcheck', (c) => c.json({ message: 'Success' }));

app.get('/bootstrap', async (c) => respond({ data: await bootstrap() }));

// ── Auth routes ─────────────────────────────────────────────────────────────

app.get('/auth/session', async (c) => {
    const token = getCookie(c, 'session_id');
    const result = await getSession(token);
    return respond({ data: result });
});

app.post('/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await login(body);
    if (result.error) return respond(result);
    const { token } = result.data!;
    c.header('Set-Cookie',
        `session_id=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`);
    return respond(result);
});

app.post('/auth/logout', async (c) => {
    const { deleteSession } = await import('../backend/business');
    const sessionId = c.get('sessionId') as string;
    if (sessionId) await deleteSession(sessionId);
    c.header('Set-Cookie', `session_id=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return respond({ data: { ok: true } });
});

app.post('/auth/register-first-admin', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await registerFirstAdmin(body);
    if (result.error) return respond(result);
    const { token } = result.data!;
    c.header('Set-Cookie',
        `session_id=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`);
    return respond(result);
});

app.patch('/auth/pin', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    return respond(await changePin(user.id, String(body.newPin || '')));
});

app.patch('/auth/password', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    return respond(await changePassword(user.id, String(body.currentPassword || ''), String(body.newPassword || '')));
});

app.patch('/auth/profile', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    return respond(await updateProfile(user.id, body));
});

app.post('/auth/forgot-password', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    await requestPasswordReset(String(body.email || ''));
    return respond({ data: { ok: true } });
});

app.post('/auth/reset-password', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await resetPassword(String(body.token || ''), String(body.password || ''));
    if (result.error) return respond(result);
    return respond({ data: { ok: true } });
});

// ── Floor operations (attendant + admin) ───────────────────────────────────

app.post('/sales', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createSale(body));
});

app.post('/refunds', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createRefund(body));
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

app.delete('/items/:id', async (c) => {
    const id = c.req.param('id');
    return respond(await deleteItem({ id }));
});

app.post('/items/:id/photo', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    return respond(await uploadItemPhoto({ id }, body));
});

app.delete('/items/:id/photo', async (c) => {
    const id = c.req.param('id');
    return respond(await deleteItemPhoto({ id }));
});

app.post('/expenses', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    return respond(await createExpense(body, user.id));
});

app.delete('/expenses/:id', async (c) => {
    const user = c.get('user') as SessionUser;
    const id = c.req.param('id');
    const [expense] = await database.get<{ userId?: string }>('expenses', [id]);
    if (expense && expense.userId && expense.userId !== user.id && user.role !== 'admin') {
        return error(403, 'You can only delete your own expenses');
    }
    return respond(await deleteExpense({ id }));
});

// ── Admin-only operations ───────────────────────────────────────────────────

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

app.post('/rules', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await saveRule(body) as ApiResult<{ id: string; updated?: boolean }>);
});

app.post('/expense-categories', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createExpenseCategory(body));
});

app.delete('/expense-categories/:id', async (c) => {
    return respond(await deleteExpenseCategory({ id: c.req.param('id') }));
});

app.get('/reports/period', async (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    return respond(await getPeriodReport({ from, to }));
});

app.get('/users', async (c) => {
    return respond(await listUsers());
});

app.post('/users', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    const result = await createUser(body, user);
    if (result.error) return respond(result);
    return respond(result, 201);
});

app.delete('/users/:id', async (c) => {
    const user = c.get('user') as SessionUser;
    const result = await deactivateUser(c.req.param('id'), user);
    if (result.error) return respond(result);
    return respond({ data: { ok: true } });
});

// ── Start server ────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3002);

(async () => {
    try {
        await runMigrations();
        serve({ fetch: app.fetch, port }, (info) => {
            console.log(`🚀 API server listening on http://localhost:${info.port}`);
        });
    } catch (e) {
        console.error('Failed to start API server:', e);
        process.exit(1);
    }
})();
