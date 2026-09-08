import { Hono, Context, Next } from 'hono';
import { handle } from 'hono/vercel';
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

// Paths that don't require authentication
const PUBLIC_PATHS = new Set([
    '/_healthcheck',
    '/bootstrap',
    '/auth/login',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/register-first-admin',
]);

// Paths that require admin role (beyond basic auth)
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
    const getSessionId = () => getCookie(c, 'session_id');

    // Allow public paths through without auth
    if (PUBLIC_PATHS.has(path)) {
        return next();
    }

    // Allow paths that need auth but not admin
    if (path === '/expenses' || path.startsWith('/expenses')) {
        // Basic auth required, no admin check
        const token = getSessionId();
        if (!token) {
            throw new HTTPException(401, { message: 'Not authenticated. Please log in.' });
        }
        const result = await validateSession(database, token);
        if (!result) {
            throw new HTTPException(401, { message: 'Session expired or invalid. Please log in again.' });
        }
        c.set('user', result.user);
        c.set('sessionId', result.sessionId);
        return next();
    }

    // Admin-only paths (bales, categories, etc.) require admin role
    const isAdminOnly = ADMIN_ONLY_PATHS.has(path) ||
        path.startsWith('/users') ||
        path === '/reports/period';

    const token = getSessionId();
    if (!token) {
        throw new HTTPException(401, { message: 'Not authenticated. Please log in.' });
    }

    const result = await validateSession(database, token);
    if (!result) {
        throw new HTTPException(401, { message: 'Session expired or invalid. Please log in again.' });
    }

    c.set('user', result.user);
    c.set('sessionId', result.sessionId);

    if (isAdminOnly && result.user.role !== 'admin') {
        throw new HTTPException(403, { message: 'Admin access required.' });
    }

    await next();
}

// ── Hono app ────────────────────────────────────────────────────────────────

const app = new Hono<{ Variables: AuthVariables }>().basePath('/api');

// Global error handler for HTTPException
app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return c.json({ error: err.message }, { status: err.status });
    }
    console.error('[unhandled error]', err);
    return c.json({ error: 'Internal server error' }, { status: 500 });
});

// Apply auth middleware to all routes
app.use('*', authMiddleware);

// ── Public routes ────────────────────────────────────────────────────────────

app.get('/_healthcheck', (c) => c.json({ message: 'Success' }));

app.get('/bootstrap', async (c) => {
    // bootstrap() returns the full shop data; wrap in ApiResult shape
    return respond({ data: await bootstrap() } as ApiResult<Record<string, unknown>>);
});

// ── Auth routes ─────────────────────────────────────────────────────────────

// GET /api/auth/session  — returns current user or { user: null }
app.get('/auth/session', async (c) => {
    const token = getCookie(c, 'session_id');
    const result = await getSession(token);
    return respond({ data: result });
});

// POST /api/auth/login  — login with email+password or email+pin
app.post('/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await login(body);
    if (result.error) return respond(result);
    const { token } = result.data!;
    c.header('Set-Cookie',
        `session_id=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`);
    return respond(result);
});

// POST /api/auth/logout
app.post('/auth/logout', async (c) => {
    const { deleteSession } = await import('../backend/business');
    const sessionId = c.get('sessionId');
    if (sessionId) await deleteSession(String(sessionId));
    c.header('Set-Cookie', `session_id=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return respond({ data: { ok: true } });
});

// POST /api/auth/register-first-admin  — first-run wizard
app.post('/auth/register-first-admin', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await registerFirstAdmin(body);
    if (result.error) return respond(result);
    const { token } = result.data!;
    c.header('Set-Cookie',
        `session_id=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`);
    return respond(result);
});

// PATCH /api/auth/pin  — change own PIN
app.patch('/auth/pin', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    const result = await changePin(user.id, String(body.newPin || ''));
    if (result.error) return respond(result);
    return respond({ data: { ok: true } });
});

// PATCH /api/auth/password  — change own password
app.patch('/auth/password', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    const result = await changePassword(user.id, String(body.currentPassword || ''), String(body.newPassword || ''));
    if (result.error) return respond(result);
    return respond({ data: { ok: true } });
});

// PATCH /api/auth/profile  — change own name / email
app.patch('/auth/profile', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    return respond(await updateProfile(user.id, body));
});

// POST /api/auth/forgot-password
app.post('/auth/forgot-password', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    await requestPasswordReset(String(body.email || ''));
    // Always return 200 to prevent email enumeration
    return respond({ data: { ok: true } });
});

// POST /api/auth/reset-password  — reset via token from email
app.post('/auth/reset-password', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await resetPassword(String(body.token || ''), String(body.password || ''));
    if (result.error) return respond(result);
    return respond({ data: { ok: true } });
});

// ── Floor operations (attendant + admin) ───────────────────────────────────

// Sales — open to all authenticated users
app.post('/sales', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createSale(body));
});

app.post('/refunds', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createRefund(body));
});

// Items — open to all authenticated users (add items to existing bales)
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

// Expenses — open to all authenticated users (saves userId from session)
app.post('/expenses', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    return respond(await createExpense(body, user.id));
});

app.delete('/expenses/:id', async (c) => {
    const user = c.get('user') as SessionUser;
    const id = c.req.param('id');
    // Attendants can only delete their own expenses
    const [expense] = await database.get<{ userId?: string }>('expenses', [id]);
    if (expense && expense.userId && expense.userId !== user.id && user.role !== 'admin') {
        return error(403, 'You can only delete your own expenses');
    }
    return respond(await deleteExpense({ id }));
});

// ── Admin-only operations ───────────────────────────────────────────────────

// Bales — admin only (attendants add items to existing bales, not create them)
app.post('/bales', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createBale(body));
});

// Categories — admin only
app.post('/categories', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createCategory(body));
});

app.put('/categories/:name', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({}));
    return respond(await updateCategory({ name }, body));
});

// Qualities — admin only
app.post('/qualities', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createQuality(body));
});

app.delete('/qualities/:id', async (c) => {
    return respond(await deleteQuality({ id: c.req.param('id') }));
});

// Price rules — admin only
app.post('/rules', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await saveRule(body) as ApiResult<{ id: string; updated?: boolean }>);
});

// Expense categories — admin only
app.post('/expense-categories', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return respond(await createExpenseCategory(body));
});

app.delete('/expense-categories/:id', async (c) => {
    return respond(await deleteExpenseCategory({ id: c.req.param('id') }));
});

// Reports — admin only
app.get('/reports/period', async (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    return respond(await getPeriodReport({ from, to }));
});

// Users — admin only
app.get('/users', async (c) => {
    return respond(await listUsers());
});

app.post('/users', async (c) => {
    const user = c.get('user') as SessionUser;
    const body = await c.req.json().catch(() => ({}));
    const result = await createUser(body, user);
    if (result.error) return respond(result);
    return respond(result, result.status ?? 201);
});

app.delete('/users/:id', async (c) => {
    const user = c.get('user') as SessionUser;
    const result = await deactivateUser(c.req.param('id'), user);
    if (result.error) return respond(result);
    return respond({ data: { ok: true } });
});

// ── Export ─────────────────────────────────────────────────────────────────

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);

export default app;
