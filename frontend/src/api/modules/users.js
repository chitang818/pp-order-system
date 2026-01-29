import { apiClient } from '../../core/api-client.js';

export const users = {
    async list() {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('users_list', { token }, {
                fallbackToHttp: true,
                httpPath: '/api/users',
                httpMethod: 'GET'
            });
            // Rust returns { success: true, data: [...] }
            return result.data || result;
        } catch (err) {
            console.error('[Users] list failed:', err);
            throw err;
        }
    },

    async create(data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('users_create', {
                payload: { token, ...data }
            }, {
                fallbackToHttp: true,
                httpPath: '/api/users',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Users] create failed:', err);
            throw err;
        }
    },

    async update(id, data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('users_update', {
                payload: { token, id: parseInt(id), ...data }
            }, {
                fallbackToHttp: true,
                httpPath: `/api/users/${id}`,
                httpMethod: 'PUT'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Users] update failed:', err);
            throw err;
        }
    },

    async resetPassword(id, newPassword) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('users_reset_password', {
                payload: { token, id: parseInt(id), newPassword }
            }, {
                fallbackToHttp: true,
                httpPath: `/api/users/${id}/reset-password`,
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Users] resetPassword failed:', err);
            throw err;
        }
    },

    async remove(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('users_delete', { token, id: parseInt(id) }, {
                fallbackToHttp: true,
                httpPath: `/api/users/${id}`,
                httpMethod: 'DELETE'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Users] remove failed:', err);
            throw err;
        }
    }
};
