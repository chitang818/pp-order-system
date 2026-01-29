import { apiClient } from '../../core/api-client.js';

export const auth = {
    async login(username, password) {
        try {
            // auth_login 需要 payload 包装
            const result = await apiClient.invoke('auth_login', { payload: { username, password } }, {
                fallbackToHttp: true,
                httpPath: '/api/auth/login',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Auth] login failed:', err);
            throw err;
        }
    },

    async logout() {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('auth_logout', { token }, {
                fallbackToHttp: true,
                httpPath: '/api/auth/logout',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Auth] logout failed:', err);
            throw err;
        }
    },

    async me() {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('auth_me', { token }, {
                fallbackToHttp: true,
                httpPath: '/api/auth/me',
                httpMethod: 'GET'
            });
            // Rust returns { success: true, data: {...} }
            return result.data || result;
        } catch (err) {
            console.error('[Auth] me failed:', err);
            throw err;
        }
    },

    async changePassword(oldPassword, newPassword) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('auth_change_password', {
                payload: { token, oldPassword, newPassword }
            }, {
                fallbackToHttp: true,
                httpPath: '/api/auth/change-password',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Auth] changePassword failed:', err);
            throw err;
        }
    }
};
