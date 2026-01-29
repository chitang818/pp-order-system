import { apiClient } from '../../core/api-client.js';

export const products = {
    async list(options = {}) {
        try {
            const token = localStorage.getItem('token') || '';
            const params = new URLSearchParams(options).toString();
            // products_list only takes token (no payload wrapper)
            const result = await apiClient.invoke('products_list', { token }, {
                fallbackToHttp: true,
                httpPath: `/api/products?${params}`,
                httpMethod: 'GET'
            });
            // Rust returns { success: true, data: [...] }
            return result.data || result;
        } catch (err) {
            console.error('[Products] list failed:', err);
            throw err;
        }
    },

    async create(data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('products_create', {
                payload: { token, ...data }
            }, {
                fallbackToHttp: true,
                httpPath: '/api/products',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Products] create failed:', err);
            throw err;
        }
    },

    async update(id, data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('products_update', {
                payload: { token, id: parseInt(id), ...data }
            }, {
                fallbackToHttp: true,
                httpPath: `/api/products/${id}`,
                httpMethod: 'PUT'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Products] update failed:', err);
            throw err;
        }
    },

    async remove(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('products_delete', {
                token, id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/products/${id}`,
                httpMethod: 'DELETE'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Products] remove failed:', err);
            throw err;
        }
    },

    async clear() {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('products_clear', { token }, {
                fallbackToHttp: true,
                httpPath: '/api/products/clear',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Products] clear failed:', err);
            throw err;
        }
    }
};
