import { apiClient } from '../../core/api-client.js';

export const diagnostics = {
    async getInfo() {
        try {
            return await apiClient.invoke('app_info');
        } catch (err) {
            // 过渡期：如果不在 Tauri 环境，返回默认值
            return { name: 'Web Mode', version: '1.0.0' };
        }
    },

    async getPaths() {
        try {
            return await apiClient.invoke('app_paths');
        } catch (err) {
            // 过渡期：如果不在 Tauri 环境，返回默认值
            return { app_data_dir: 'N/A', logs_dir: 'N/A', db_path: 'N/A' };
        }
    },

    async checkHealth() {
        try {
            return await apiClient.invoke('app_health', {}, {
                fallbackToHttp: true,
                httpPath: '/api/health',
                httpMethod: 'GET'
            });
        } catch (err) {
            console.error('[Diagnostics] checkHealth failed:', err);
            throw err;
        }
    },

    async exportLogs() {
        try {
            return await apiClient.invoke('app_diagnostics_export');
        } catch (err) {
            throw new Error('Web Mode does not support log export');
        }
    }
};
