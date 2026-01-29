import { apiClient } from '../../core/api-client.js';

export const orders = {
    async list(options = {}) {
        try {
            const token = localStorage.getItem('token') || '';
            
            // 构建查询参数：只包含有效值（过滤 null/undefined/空字符串）
            const queryParams = new URLSearchParams();
            if (options.page != null && options.page !== '') {
                queryParams.set('page', String(options.page));
            }
            if (options.pageSize != null && options.pageSize !== '') {
                queryParams.set('pageSize', String(options.pageSize));
            }
            // 支持 productModel 和 search 两种参数名
            const productModelValue = options.productModel || options.search || '';
            if (productModelValue.trim() !== '') {
                queryParams.set('productModel', productModelValue.trim());
            }
            if (options.status && options.status.trim() !== '') {
                queryParams.set('status', options.status.trim());
            }
            const params = queryParams.toString();
            
            // orders_list 需要 payload 包装
            const result = await apiClient.invoke('orders_list', {
                payload: {
                    token,
                    page: options.page || null,
                    pageSize: options.pageSize || null,
                    productModel: options.productModel || options.search || null,
                    status: options.status || null
                }
            }, {
                fallbackToHttp: true,
                httpPath: params ? `/api/orders?${params}` : '/api/orders',
                httpMethod: 'GET'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Orders] list failed:', err);
            throw err;
        }
    },

    async get(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('orders_get', {
                token,
                id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/orders/${id}`,
                httpMethod: 'GET'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Orders] get failed:', err);
            throw err;
        }
    },

    async create(data) {
        try {
            const token = localStorage.getItem('token') || '';
            const payload = { token, ...data };
            console.log('[Orders.create] Sending payload to Rust:', JSON.stringify(payload, null, 2));
            console.log('[Orders.create] totalUSD in payload:', payload.totalUSD);
            const result = await apiClient.invoke('orders_create', {
                payload
            }, {
                fallbackToHttp: true,
                httpPath: '/api/orders',
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Orders] create failed:', err);
            throw err;
        }
    },

    async update(id, data) {
        try {
            const token = localStorage.getItem('token') || '';
            const payload = { token, id: parseInt(id), ...data };
            console.log('[Orders.update] Sending payload to Rust:', JSON.stringify(payload, null, 2));
            console.log('[Orders.update] totalUSD in payload:', payload.totalUSD);
            const result = await apiClient.invoke('orders_update', {
                payload
            }, {
                fallbackToHttp: true,
                httpPath: `/api/orders/${id}`,
                httpMethod: 'PUT'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Orders] update failed:', err);
            throw err;
        }
    },

    async remove(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('orders_delete', {
                token,
                id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/orders/${id}`,
                httpMethod: 'DELETE'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Orders] remove failed:', err);
            throw err;
        }
    },

    async nextContractNo() {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('orders_next_contract_no', { token }, {
                fallbackToHttp: true,
                httpPath: '/api/orders/next-contract-no',
                httpMethod: 'GET'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Orders] nextContractNo failed:', err);
            throw err;
        }
    },

    async listDeleted(options = {}) {
        try {
            const token = localStorage.getItem('token') || '';
            const params = new URLSearchParams(options).toString();
            const result = await apiClient.invoke('orders_list_deleted', {
                token,
                page: options.page || null,
                pageSize: options.pageSize || null
            }, {
                fallbackToHttp: true,
                httpPath: `/api/orders/deleted?${params}`,
                httpMethod: 'GET'
            });
            // Rust returns { total, page, pageSize, totalPages, data } or [...]
            return result.data ? result : result;
        } catch (err) {
            console.error('[Orders] listDeleted failed:', err);
            throw err;
        }
    },

    async restore(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('orders_restore', {
                token,
                id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/orders/${id}/restore`,
                httpMethod: 'POST'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Orders] restore failed:', err);
            throw err;
        }
    },

    async permanentlyDelete(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('orders_delete_permanent', {
                token,
                id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/orders/${id}/permanent`,
                httpMethod: 'DELETE'
            });
            return result.data || result;
        } catch (err) {
            console.error('[Orders] permanentlyDelete failed:', err);
            throw err;
        }
    }
};
