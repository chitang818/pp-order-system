import { apiClient } from '../../core/api-client.js';

export const customers = {
    async list(options = {}) {
        try {
            const token = localStorage.getItem('token') || '';
            const params = new URLSearchParams(options).toString();
            // customers_list only takes token (no payload wrapper)
            const result = await apiClient.invoke('customers_list', { token }, {
                fallbackToHttp: true,
                httpPath: `/api/customers?${params}`,
                httpMethod: 'GET'
            });
            // Rust returns { success: true, data: [...] }
            return result.data || result;
        } catch (err) {
            console.error('[Customers] list failed:', err);
            throw err;
        }
    },

    async get(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('customers_get', {
                token, id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/customers/${id}`,
                httpMethod: 'GET'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Customers] get failed:', err);
            throw err;
        }
    },

    async create(data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('customers_create', {
                payload: { token, ...data }
            }, {
                fallbackToHttp: true,
                httpPath: '/api/customers',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Customers] create failed:', err);
            throw err;
        }
    },

    async update(id, data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('customers_update', {
                payload: { token, id: parseInt(id), ...data }
            }, {
                fallbackToHttp: true,
                httpPath: `/api/customers/${id}`,
                httpMethod: 'PUT'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Customers] update failed:', err);
            throw err;
        }
    },

    async remove(id) {
        try {
            const token = localStorage.getItem('token') || '';
            return await apiClient.invoke('customers_delete', {
                token, id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/customers/${id}`,
                httpMethod: 'DELETE'
            });
        } catch (err) {
            console.error('[Customers] remove failed:', err);
            throw err;
        }
    },

    async clear() {
        try {
            const token = localStorage.getItem('token') || '';
            return await apiClient.invoke('customers_clear', { token }, {
                fallbackToHttp: true,
                httpPath: '/api/customers/clear',
                httpMethod: 'POST'
            });
        } catch (err) {
            console.error('[Customers] clear failed:', err);
            throw err;
        }
    }
};
