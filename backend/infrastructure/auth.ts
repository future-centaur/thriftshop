import { Context, Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import type { Database } from './database.js';

const SESSION_COOKIE = 'session_id';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function sessionCookieOpts(c: Context) {
    return {
        httpOnly: true,
        sameSite: 'Strict' as const,
        path: '/',
        secure: c.req.url.startsWith('https://'),
    };
}

export function attachSessionCookie(c: Context, token: string): void {
    setCookie(c, SESSION_COOKIE, token, {
        ...sessionCookieOpts(c),
        maxAge: SESSION_MAX_AGE,
    });
}

export function clearSessionCookie(c: Context): void {
    deleteCookie(c, SESSION_COOKIE, sessionCookieOpts(c));
}

export type SessionUser = {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'attendant';
};

export type AuthVariables = {
    user: SessionUser;
    sessionId: string;
};

// Generate a cryptographically random 64-char hex token (32 bytes)
export function generateToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// Hash a password with bcrypt cost 12
export async function hashPassword(password: string): Promise<string> {
    const { hash } = await import('bcryptjs');
    return hash(password, 12);
}

// Verify a password against a bcrypt hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    const { compare } = await import('bcryptjs');
    return compare(password, hash);
}

// Hash a PIN with bcrypt cost 6 (short input, still salted)
export async function hashPin(pin: string): Promise<string> {
    const { hash } = await import('bcryptjs');
    return hash(pin, 6);
}

// Verify a PIN against a bcrypt hash
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
    const { compare } = await import('bcryptjs');
    return compare(pin, hash);
}

// Generate a random 4-digit PIN for new attendants
export function generatePin(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Look up a session token in the DB and return the user if valid and not expired.
// Returns null if no valid session found.
export async function validateSession(
    database: Database,
    token: string
): Promise<{ user: SessionUser; sessionId: string } | null> {
    // Session row only carries id, user_id, expires_at, created_at (see migration 003).
    // The user itself is joined separately so deactivating a user invalidates all their sessions.
    const { items } = await database.list<{
        id: string;
        user_id: string;
        expires_at: string;
    }>('sessions', { filter: { id: token }, limit: 1 });

    const session = items[0];
    if (!session) return null;

    // Check expiry
    if (new Date(session.expires_at) < new Date()) {
        // Clean up expired session
        await database.delete('sessions', [session.id]);
        return null;
    }

    // Look up the user and ensure they're still active
    const { items: users } = await database.list<{
        id: string;
        name: string;
        email: string;
        role: string;
        active: boolean;
    }>('users', { filter: { id: session.user_id }, limit: 1 });
    const user = users[0];
    if (!user || user.active === false) return null;

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role as 'admin' | 'attendant',
        },
        sessionId: session.id,
    };
}

// Auth middleware: validates the session cookie and attaches user/sessionId to context.
// Throws HTTPException 401 if not authenticated.
export async function requireAuth(
    c: Context<{ Variables: AuthVariables }>,
    database: Database,
    next: Next
): Promise<void> {
    const token = getCookie(c, 'session_id');

    if (!token) {
        throw new HTTPException(401, { message: 'Not authenticated. Please log in.' });
    }

    const result = await validateSession(database, token);
    if (!result) {
        throw new HTTPException(401, { message: 'Session expired or invalid. Please log in again.' });
    }

    c.set('user', result.user);
    c.set('sessionId', result.sessionId);
    await next();
}

// Admin-only guard: use after requireAuth. Throws HTTPException 403 if not admin.
export function requireAdmin(c: Context<{ Variables: AuthVariables }>): void {
    const user = c.get('user');
    if (user?.role !== 'admin') {
        throw new HTTPException(403, { message: 'Admin access required.' });
    }
}
