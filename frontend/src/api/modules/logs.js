import { apiClient } from '../../core/api-client.js';

export const logs = {
    async list(options = {}) {
        const token = localStorage.getItem('token') || '';
        const payload = {
            token,
            page: parseInt(options.page || 1),
            pageSize: parseInt(options.pageSize || 50),
            module: options.module,
            userId: options.userId ? parseInt(options.userId) : undefined,
            operation: options.operation,
            startDate: options.startDate,
            endDate: options.endDate
        };

        const params = new URLSearchParams();
        if (options.page) params.append('page', options.page);
        if (options.pageSize) params.append('pageSize', options.pageSize);
        if (options.module) params.append('module', options.module);
        if (options.userId) params.append('userId', options.userId);
        if (options.operation) params.append('operation', options.operation);
        if (options.startDate) params.append('startDate', options.startDate);
        if (options.endDate) params.append('endDate', options.endDate);

        const result = await apiClient.invoke('logs_list', { payload }, {
            fallbackToHttp: true,
            httpPath: `/api/logs?${params.toString()}`,
            httpMethod: 'GET'
        });
        return result.data || result;
    },

    async delete(id) {
        const token = localStorage.getItem('token') || '';
        const result = await apiClient.invoke('logs_delete', {
            payload: { token, id: parseInt(id) }
        }, {
            fallbackToHttp: true,
            httpPath: `/api/logs/${id}`,
            httpMethod: 'DELETE'
        });
        return result.data || result;
    },

    async clear() {
        const token = localStorage.getItem('token') || '';
        const result = await apiClient.invoke('logs_clear', { token }, {
            fallbackToHttp: true,
            httpPath: '/api/logs',
            httpMethod: 'DELETE'
        });
        return result.data || result;
    },

    async clean(days = 90) {
        const token = localStorage.getItem('token') || '';
        const result = await apiClient.invoke('logs_clean', {
            payload: { token, days: parseInt(days) }
        }, {
            fallbackToHttp: true,
            httpPath: '/api/logs/clean',
            httpMethod: 'POST',
            body: { days }
        });
        return result.data || result;
    }
};
