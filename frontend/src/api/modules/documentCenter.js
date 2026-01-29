import { apiClient } from '../../core/api-client.js';

export const documentCenter = {
    async listTemplates(type = null) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('document_templates_list', {
                token,
                template_type: type || null
            }, {
                fallbackToHttp: true,
                httpPath: type ? `/api/document-center/templates?type=${encodeURIComponent(type)}` : '/api/document-center/templates',
                httpMethod: 'GET'
            });
            // Rust returns { success: true, data: [...] }
            return result.data || result;
        } catch (err) {
            console.error('[DocumentCenter] listTemplates failed:', err);
            throw err;
        }
    },

    async getTemplate(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('document_templates_get', {
                token,
                id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/document-center/templates/${id}`,
                httpMethod: 'GET'
            });
            // Rust returns { success: true, data: {...} }
            return result.data || result;
        } catch (err) {
            console.error('[DocumentCenter] getTemplate failed:', err);
            throw err;
        }
    },

    async createTemplate(data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('document_templates_create', {
                payload: {
                    token,
                    name: data.name,
                    type: data.type,
                    config: data.config,
                    isDefault: data.isDefault || false
                }
            }, {
                fallbackToHttp: true,
                httpPath: '/api/document-center/templates',
                httpMethod: 'POST'
            });
            // Rust returns { success: true, data: {...} }
            return result.data || result;
        } catch (err) {
            console.error('[DocumentCenter] createTemplate failed:', err);
            throw err;
        }
    },

    async updateTemplate(id, data) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('document_templates_update', {
                payload: {
                    token,
                    id: parseInt(id),
                    name: data.name,
                    type: data.type,
                    config: data.config,
                    isDefault: data.isDefault || false
                }
            }, {
                fallbackToHttp: true,
                httpPath: `/api/document-center/templates/${id}`,
                httpMethod: 'PUT'
            });
            // Rust returns { success: true, data: {...} }
            return result.data || result;
        } catch (err) {
            console.error('[DocumentCenter] updateTemplate failed:', err);
            throw err;
        }
    },

    async deleteTemplate(id) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('document_templates_delete', {
                token,
                id: parseInt(id)
            }, {
                fallbackToHttp: true,
                httpPath: `/api/document-center/templates/${id}`,
                httpMethod: 'DELETE'
            });
            return result.data || result;
        } catch (err) {
            console.error('[DocumentCenter] deleteTemplate failed:', err);
            throw err;
        }
    },

    async deleteAllTemplates() {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('document_templates_delete_all', {
                token
            }, {
                fallbackToHttp: true,
                httpPath: '/api/document-center/templates',
                httpMethod: 'DELETE'
            });
            return result.data || result;
        } catch (err) {
            console.error('[DocumentCenter] deleteAllTemplates failed:', err);
            throw err;
        }
    },

    async getDefaultTemplate(type) {
        try {
            const token = localStorage.getItem('token') || '';
            const result = await apiClient.invoke('document_templates_get_default', {
                token,
                template_type: type
            }, {
                fallbackToHttp: true,
                httpPath: `/api/document-center/templates/default/${encodeURIComponent(type)}`,
                httpMethod: 'GET'
            });
            // Rust returns { success: true, data: {...} }
            return result.data || result;
        } catch (err) {
            console.error('[DocumentCenter] getDefaultTemplate failed:', err);
            throw err;
        }
    }
};
