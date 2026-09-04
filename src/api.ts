// Native fetch-based API client to replace @appdeploy/client.
// Returns { data: T } on success so TypeScript narrows correctly in try blocks.
// Throws on failure so catch() handles errors naturally.

export interface ApiResponse<T = any> {
    data: T;
}

async function apiFetch<T = any>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.headers) Object.assign(headers, options.headers as Record<string, string>);
    let response: Response;
    try {
        response = await fetch(url, { ...options, headers });
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
