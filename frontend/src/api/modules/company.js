import { apiClient } from '../../core/api-client.js';

export const company = {
    async get() {
        try {
            const token = localStorage.getItem('token') || '';
            const res = await apiClient.invoke('company_get', { token }, {
                fallbackToHttp: true,
                httpPath: '/api/company',
                httpMethod: 'GET'
            });
            if (res && res.data === null) return null;
            return res.data || res;
        } catch (err) {
            console.error('[Company] get failed:', err);
            throw err;
        }
    },

    async update(data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('company_update', { token, payload: data }, {
                fallbackToHttp: true,
                httpPath: '/api/company',
                httpMethod: 'PUT'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Company] update failed:', err);
            throw err;
        }
    },

    async reset() {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('company_reset', { token }, {
                fallbackToHttp: true,
                httpPath: '/api/company',
                httpMethod: 'DELETE'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Company] reset failed:', err);
            throw err;
        }
    }
};
