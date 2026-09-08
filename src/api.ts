// Native fetch-based API client to replace @appdeploy/client.
// Returns { data: T } on success so TypeScript narrows correctly in try blocks.
// Throws on failure so catch() handles errors naturally.
// Uses credentials: 'include' so session cookies are sent with every request.

export interface ApiResponse<T = any> {
    data: T;
}

async function apiFetch<T = any>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.headers) Object.assign(headers, options.headers as Record<string, string>);
    let response: Response;
    try {
        response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include', // Send session cookies
        });
    } catch (e) {
        throw new Error(e instanceof Error ? e.message : 'Network error');
    }
    if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
            const body = await response.json() as { error?: string };
            if (body?.error) message = body.error;
        } catch { /* no JSON body */ }
        throw new Error(message);
    }
    const data = await response.json() as T;
    return { data };
}

export const api = {
    get<T = any>(url: string): Promise<ApiResponse<T>> {
        return apiFetch<T>(url, { method: 'GET' });
    },
    post<T = any>(url: string, body?: unknown): Promise<ApiResponse<T>> {
        return apiFetch<T>(url, { method: 'POST', body: body == null ? undefined : JSON.stringify(body) });
    },
    put<T = any>(url: string, body?: unknown): Promise<ApiResponse<T>> {
        return apiFetch<T>(url, { method: 'PUT', body: body == null ? undefined : JSON.stringify(body) });
    },
    delete<T = any>(url: string): Promise<ApiResponse<T>> {
        return apiFetch<T>(url, { method: 'DELETE' });
    },
    patch<T = any>(url: string, body?: unknown): Promise<ApiResponse<T>> {
        return apiFetch<T>(url, { method: 'PATCH', body: body == null ? undefined : JSON.stringify(body) });
    },
};

// ── Auth API ────────────────────────────────────────────────────────────────────

export type User = {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'attendant';
    hasPin?: boolean;
    hasPassword?: boolean;
};

export type SessionInfo = {
    user: User | null;
    isSetup: boolean;
};

export const authApi = {
    /** Fetch current session — returns user + isSetup, or { user: null } if not logged in */
    getSession(): Promise<ApiResponse<SessionInfo>> {
        return api.get<SessionInfo>('/api/auth/session');
    },

    /** Login with email + password or email + PIN */
    login(email: string, password?: string, pin?: string): Promise<ApiResponse<{ user: User }>> {
        return api.post<{ user: User }>('/api/auth/login', { email, password, pin });
    },

    /** Logout — clears session cookie */
    logout(): Promise<ApiResponse<{ ok: boolean }>> {
        return api.post<{ ok: boolean }>('/api/auth/logout');
    },

    /** Register the first admin (first-run wizard) */
    registerFirstAdmin(name: string, email: string, password: string): Promise<ApiResponse<{ user: User }>> {
        return api.post<{ user: User }>('/api/auth/register-first-admin', { name, email, password, confirmPassword: password });
    },

    /** Change own PIN */
    changePin(newPin: string): Promise<ApiResponse<{ ok: boolean }>> {
        return api.patch<{ ok: boolean }>('/api/auth/pin', { newPin });
    },

    /** Change own password */
    changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<{ ok: boolean }>> {
        return api.patch<{ ok: boolean }>('/api/auth/password', { currentPassword, newPassword });
    },

    /** Update own name and email */
    updateProfile(name: string, email: string): Promise<ApiResponse<{ user: User }>> {
        return api.patch<{ user: User }>('/api/auth/profile', { name, email });
    },

    /** Request a password reset email */
    requestPasswordReset(email: string): Promise<ApiResponse<{ ok: boolean }>> {
        return api.post<{ ok: boolean }>('/api/auth/forgot-password', { email });
    },

    /** Reset password using a token from the email link */
    resetPassword(token: string, password: string): Promise<ApiResponse<{ ok: boolean }>> {
        return api.post<{ ok: boolean }>('/api/auth/reset-password', { token, password });
    },

    /** List all users (admin only) */
    listUsers(): Promise<ApiResponse<User[]>> {
        return api.get<User[]>('/api/users');
    },

    /** Create a new attendant (admin only). Returns the user + their default PIN (shown only once) */
    createUser(name: string, email: string): Promise<ApiResponse<{ user: User; pin: string }>> {
        return api.post<{ user: User; pin: string }>('/api/users', { name, email });
    },

    /** Deactivate a user (admin only) */
    deactivateUser(userId: string): Promise<ApiResponse<{ ok: boolean }>> {
        return api.delete<{ ok: boolean }>(`/api/users/${userId}`);
    },
};
