import { apiClient } from '../../core/api-client.js';

export const orderConfigs = {
    async list(category) {
        try {
            const token = localStorage.getItem('token') || '';
            const query = category ? `?category=${encodeURIComponent(category)}` : '';
            const result = await apiClient.invoke('order_configs_list', {
                token,
                category: category ?? null
            }, {
                fallbackToHttp: true,
                httpPath: `/api/order-configs${query}`,
                httpMethod: 'GET'
            });
            return result.data || result;
        } catch (err) {
            console.error('[OrderConfigs] list failed:', err);
            throw err;
        }
    },

    async batch(categories = []) {
        try {
            const token = localStorage.getItem('token') || '';
            const categoriesParam = categories.length ? categories.join(',') : '';
            const query = categoriesParam ? `?categories=${encodeURIComponent(categoriesParam)}` : '';
            const result = await apiClient.invoke('order_configs_batch', { token, categories }, {
                fallbackToHttp: true,
                httpPath: `/api/order-configs/batch${query}`,
                httpMethod: 'GET'
            });
            return result.data || result;
        } catch (err) {
            console.error('[OrderConfigs] batch failed:', err);
            throw err;
        }
    },

    async create(data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('order_config_create', {
                payload: {
                    token,
                    ...data,
                    sortIndex: data.sortIndex ? parseInt(data.sortIndex) : undefined
                }
            }, {
                fallbackToHttp: true,
                httpPath: '/api/order-configs',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[OrderConfigs] create failed:', err);
            throw err;
        }
    },

    async update(payload) {
        try {
            const token = localStorage.getItem('token') || '';
            // Ensure sortIndex is handled correctly (checking for undefined/null specifically)
            const sortIndex = (payload.sortIndex !== undefined && payload.sortIndex !== null)
                ? parseInt(payload.sortIndex)
                : undefined;

            const result = await apiClient.invoke('order_config_update', {
                payload: {
                    token,
                    ...payload,
                    id: parseInt(payload.id),
                    sortIndex
                }
            }, {
                fallbackToHttp: true,
                httpPath: `/api/order-configs/${payload.id}`,
                httpMethod: 'PUT'
            });
            return result.data || result;
        } catch (err) {
            console.error('[OrderConfigs] update failed:', err);
            throw err;
        }
    },

    async remove(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('order_config_delete', { token, id: parseInt(id) }, {
                fallbackToHttp: true,
                httpPath: `/api/order-configs/${id}`,
                httpMethod: 'DELETE'
            });
            return result.data || result;
        } catch (err) {
            console.error('[OrderConfigs] remove failed:', err);
            throw err;
        }
    }
};
