import { apiClient } from '../../core/api-client.js';
import { getHttpApiBase } from '../../utils/tauri-env.js';

// Function to assist with fallback JSON requests (mimicking request logic from api.js)
// But since apiClient already handles this, we can rely on it mostly.
// However, 'storage.get' has a specific fallback that calls json('/api/storage').
// We should check if we need to replicate 'json' function or if apiClient is enough.
// The original code uses 'json' helper which wraps fetch.
// We'll import a helper if needed or just use apiClient which supports http fallback.

// Re-implementing a simple json helper for the specific fallback cases that don't go through apiClient.invoke
async function json(url, opts) {
    const base = getHttpApiBase();
    let requestUrl = url;
    if (url.startsWith('/')) {
        requestUrl = base + url;
    }

    const method = ((opts && opts.method) || 'GET').toUpperCase();
    const headers = Object.assign({}, (opts && opts.headers) || {});

    try {
        const token = localStorage.getItem('token');
        if (token && !headers['Authorization']) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    } catch (err) { }

    const newOpts = Object.assign({}, opts, { headers });
    if (method !== 'GET' && method !== 'HEAD' && !newOpts.credentials) {
        newOpts.credentials = 'include';
    }

    const response = await fetch(requestUrl, newOpts);
    if (!response.ok) {
        let msg = 'Request failed';
        try {
            const errData = await response.json();
            msg = errData.message || msg;
        } catch (e) {
            msg = response.statusText || msg;
        }
        const error = new Error(msg);
        error.status = response.status;
        throw error;
    }
    if (response.status === 204) return null;
    return await response.json();
}

export const storage = {
    async get() {
        try {
            const stats = await apiClient.invoke('db_stats');
            return {
                success: true,
                dbPath: stats.dbPath,
                environment: 'Tauri (Rust)',
                ...stats
            };
        } catch (err) {
            console.warn('[Storage] get via Rust failed, falling back to HTTP:', err);
            return json('/api/storage');
        }
    },

    async set(data) {
        // Rust 暂不支持设置路径（通常由配置文件控制），仅 HTTP 支持
        return json('/api/storage', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data || {})
        });
    },

    async open() {
        try {
            await apiClient.invoke('storage_open_dir');
            return { success: true };
        } catch (err) {
            console.warn('[Storage] open via Rust failed, falling back to HTTP:', err);
            return json('/api/storage/open', { method: 'POST' });
        }
    },

    async getStats() {
        try {
            const result = await apiClient.invoke('db_stats', {}, {
                fallbackToHttp: true,
                httpPath: '/api/storage/stats',
                httpMethod: 'GET'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Storage] getStats failed:', err);
            throw err;
        }
    }
};
