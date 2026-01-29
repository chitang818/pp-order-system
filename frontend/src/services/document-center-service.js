/**
 * 单据中心服务
 * 封装单据模板相关的API调用
 */

import { ApiService } from '../api/api.js';
import { FileExportService } from './file-export-service.js';
import { backendManager } from '../utils/backend-manager.js';

// 获取CSRF token的辅助函数
function getCsrfToken() {
  const match = document.cookie.match(new RegExp('(?:^|; )csrf_token=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

class DocumentCenterService {
  /**
   * 获取模板列表
   * @param {string} type - 模板类型筛选（可选）
   * @returns {Promise<Array>}
   */
  static async listTemplates(type = null) {
    try {
      const result = await ApiService.documentCenter.listTemplates(type);
      // ApiService.documentCenter.listTemplates 已经返回 data 或 result，这里直接返回
      return Array.isArray(result) ? result : (result.data || []);
    } catch (error) {
      console.error('[DocumentCenterService] 获取模板列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个模板
   * @param {number|string} id - 模板ID
   * @returns {Promise<Object>}
   */
  static async getTemplate(id) {
    try {
      const result = await ApiService.documentCenter.getTemplate(id);
      // ApiService.documentCenter.getTemplate 已经返回 data 或 result
      return result;
    } catch (error) {
      console.error('[DocumentCenterService] 获取模板失败:', error);
      throw error;
    }
  }

  /**
   * 创建模板
   * @param {Object} data - 模板数据
   * @returns {Promise<Object>}
   */
  static async createTemplate(data) {
    try {
      const result = await ApiService.documentCenter.createTemplate(data);
      // ApiService.documentCenter.createTemplate 已经返回 data 或 result
      return result;
    } catch (error) {
      console.error('[DocumentCenterService] 创建模板失败:', error);
      throw error;
    }
  }

  /**
   * 更新模板
   * @param {number|string} id - 模板ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>}
   */
  static async updateTemplate(id, data) {
    try {
      console.log('[DocumentCenterService] 更新模板请求:', {
        id,
        dataKeys: Object.keys(data),
        hasConfig: !!data.config,
        hasHtml: !!(data.config?.html || data.config?.canvas?.components)
      });

      const result = await ApiService.documentCenter.updateTemplate(id, data);

      console.log('[DocumentCenterService] ✅ 更新模板响应:', {
        success: result.success !== false,
        hasData: !!result,
        dataKeys: result ? Object.keys(result) : []
      });

      // ApiService.documentCenter.updateTemplate 已经返回 data 或 result
      return result;
    } catch (error) {
      console.error('[DocumentCenterService] ❌ 更新模板失败:', error);
      console.error('[DocumentCenterService] 错误详情:', {
        message: error.message,
        status: error.status,
        response: error.response
      });
      throw error;
    }
  }

  /**
   * 删除模板
   * @param {number|string} id - 模板ID
   * @returns {Promise<void>}
   */
  static async deleteTemplate(id) {
    try {
      await ApiService.documentCenter.deleteTemplate(id);
    } catch (error) {
      console.error('[DocumentCenterService] 删除模板失败:', error);
      throw error;
    }
  }

  /**
   * 删除所有模板
   * @returns {Promise<number>} 删除的模板数量
   */
  static async deleteAllTemplates() {
    try {
      const result = await ApiService.documentCenter.deleteAllTemplates();
      return result.deletedCount || result.data?.deletedCount || 0;
    } catch (error) {
      console.error('[DocumentCenterService] 删除所有模板失败:', error);
      throw error;
    }
  }

  /**
   * 获取默认模板
   * @param {string} type - 模板类型
   * @returns {Promise<Object|null>}
   */
  static async getDefaultTemplate(type) {
    try {
      const result = await ApiService.documentCenter.getDefaultTemplate(type);
      // ApiService.documentCenter.getDefaultTemplate 已经返回 data 或 result
      return result || null;
    } catch (error) {
      console.error('[DocumentCenterService] 获取默认模板失败:', error);
      // 404或"模板不存在"错误表示没有默认模板，返回null
      if (error.status === 404 || error.message?.includes('模板不存在') || error.message?.includes('未找到默认模板')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 生成单据HTML
   * @param {number|string} orderId - 订单ID
   * @param {number|string} templateId - 模板ID
   * @returns {Promise<string>} HTML字符串
   */
  static async generateDocument(orderId, templateId) {
    try {
      // 生成预览通常不需要启动后端（除非使用了旧的 HTTP 接口）
      // 这里使用的是 HTTP 接口，所以也需要启动后端
      // 或者，如果前端完全迁移了，这里可以用 Tauri invoke...
      // 目前看起来 generate 还在用 HTTP
      await backendManager.ensureBackendWithNotification();

      const response = await ApiService.json('/api/document-center/generate', {
        method: 'POST',
        body: JSON.stringify({ orderId, templateId })
      });
      return response.data.html;
    } catch (error) {
      console.error('[DocumentCenterService] 生成单据失败:', error);
      throw error;
    }
  }

  /**
   * 导出PDF
   * @param {string} html - HTML内容
   * @param {string} fileName - 文件名
   * @returns {Promise<void>}
   */
  static async exportPDF(html, fileName) {
    try {
      await backendManager.ensureBackendWithNotification();

      const response = await fetch('/api/document-center/export/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({ html, fileName })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `导出PDF失败: ${response.statusText}`);
      }

      const finalFileName = fileName || 'document.pdf';

      // 使用统一文件导出服务（支持 Tauri 文件对话框）
      await FileExportService.exportFromResponse(response, finalFileName, 'PDF文件');
    } catch (error) {
      console.error('[DocumentCenterService] 导出PDF失败:', error);
      throw error;
    }
  }

  /**
   * 导出Word
   * @param {string} html - HTML内容
   * @param {string} fileName - 文件名
   * @returns {Promise<void>}
   */
  static async exportWord(html, fileName) {
    try {
      await backendManager.ensureBackendWithNotification();

      const response = await fetch('/api/document-center/export/word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({ html, fileName })
      });

      if (!response.ok) {
        throw new Error(`导出Word失败: ${response.statusText}`);
      }

      const finalFileName = fileName || 'document.docx';

      // 使用统一文件导出服务（支持 Tauri 文件对话框）
      await FileExportService.exportFromResponse(response, finalFileName, 'Word文件');
    } catch (error) {
      console.error('[DocumentCenterService] 导出Word失败:', error);
      throw error;
    }
  }

  /**
   * 导出Excel
   * @param {number|string} orderId - 订单ID
   * @param {number|string} templateId - 模板ID（可选）
   * @param {string} fileName - 文件名
   * @returns {Promise<void>}
   */
  static async exportExcel(orderId, templateId, fileName) {
    try {
      await backendManager.ensureBackendWithNotification();

      const response = await fetch('/api/document-center/export/excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({ orderId, templateId, fileName })
      });

      if (!response.ok) {
        throw new Error(`导出Excel失败: ${response.statusText}`);
      }

      const finalFileName = fileName || 'document.xlsx';

      // 使用统一文件导出服务（支持 Tauri 文件对话框）
      await FileExportService.exportFromResponse(response, finalFileName, 'Excel文件');
    } catch (error) {
      console.error('[DocumentCenterService] 导出Excel失败:', error);
      throw error;
    }
  }
}

export default DocumentCenterService;

