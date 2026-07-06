import { apiClient } from '../../core/api-client.js';

export const reminders = {
    async getShipmentSettings() {
        const result = await apiClient.invoke('reminders_get_shipment_settings', {}, {
            fallbackToHttp: true,
            httpPath: '/api/reminders/shipment-reminder-settings',
            httpMethod: 'GET'
        });
        return result.data || result;
    },
    async saveShipmentSettings(advanceDays) {
        const result = await apiClient.invoke('reminders_save_shipment_settings', { payload: { advance_days: parseInt(advanceDays) } }, {
            fallbackToHttp: true,
            httpPath: '/api/reminders/shipment-reminder-settings',
            httpMethod: 'POST',
            body: { advanceDays }
        });
        return result.data || result;
    },
    async getShipmentList(advanceDays, limit) {
        const result = await apiClient.invoke('reminders_get_shipment_list', { payload: { advance_days: parseInt(advanceDays || 5), limit: parseInt(limit || 5) } }, {
            fallbackToHttp: true,
            httpPath: `/api/reminders/shipment-reminders?advanceDays=${advanceDays}&limit=${limit}`,
            httpMethod: 'GET'
        });
        return result.data || result;
    },
    async getPaymentList(limit) {
        const result = await apiClient.invoke('reminders_get_payment_list', { payload: { limit: parseInt(limit || 5) } }, {
            fallbackToHttp: true,
            httpPath: `/api/reminders/payment-reminders?limit=${limit}`,
            httpMethod: 'GET'
        });
        return result.data || result;
    }
};
