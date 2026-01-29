import { apiClient } from '../../core/api-client.js';

export const forwarders = {
    async list(options = {}) {
        try {
            const token = localStorage.getItem('token') || '';
            const page = options.page || 1;
            const pageSize = options.pageSize || 20;
            const params = new URLSearchParams(options).toString();
            const result = await apiClient.invoke('forwarders_list', { 
                token, 
                page: parseInt(page), 
                page_size: parseInt(pageSize) 
            }, {
                fallbackToHttp: true,
                httpPath: `/api/forwarders?${params}`,
                httpMethod: 'GET'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Forwarders] list failed:', err);
            throw err;
        }
    },

    async get(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('forwarders_get', {
                token, id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/forwarders/${id}`,
                httpMethod: 'GET'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Forwarders] get failed:', err);
            throw err;
        }
    },

    async create(data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('forwarders_create', {
                payload: { token, ...data }
            }, {
                fallbackToHttp: true,
                httpPath: '/api/forwarders',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Forwarders] create failed:', err);
            throw err;
        }
    },

    async update(id, data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('forwarders_update', {
                payload: { token, id: parseInt(id), ...data }
            }, {
                fallbackToHttp: true,
                httpPath: `/api/forwarders/${id}`,
                httpMethod: 'PUT'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Forwarders] update failed:', err);
            throw err;
        }
    },

    async remove(id) {
        try {
            const token = localStorage.getItem('token') || '';
            return await apiClient.invoke('forwarders_delete', {
                token, id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/forwarders/${id}`,
                httpMethod: 'DELETE'
            });
        } catch (err) {
            console.error('[Forwarders] remove failed:', err);
            throw err;
        }
    },

    async clear() {
        try {
            const token = localStorage.getItem('token') || '';
            return await apiClient.invoke('forwarders_clear', { token }, {
                fallbackToHttp: true,
                httpPath: '/api/forwarders/clear',
                httpMethod: 'POST'
            });
        } catch (err) {
            console.error('[Forwarders] clear failed:', err);
            throw err;
        }
    }
};
