/**
 * 单据模板服务
 * 封装单据模板相关的业务逻辑
 */

const db = require('../db');
const { promisify } = require('util');

// 将回调函数转换为 Promise
const listTemplatesAsync = promisify(db.listTemplates);
const getTemplateAsync = promisify(db.getTemplate);
const createTemplateAsync = promisify(db.createTemplate);
const updateTemplateAsync = promisify(db.updateTemplate);
const deleteTemplateAsync = promisify(db.deleteTemplate);
const deleteAllTemplatesAsync = promisify(db.deleteAllTemplates);
const getDefaultTemplateAsync = promisify(db.getDefaultTemplate);

class DocumentTemplateService {
  /**
   * 获取模板列表
   * @param {string} type - 模板类型筛选（可选）
   * @returns {Promise<Array>}
   */
  static async listTemplates(type = null) {
    try {
      const templates = await listTemplatesAsync(type);
      return templates || [];
    } catch (error) {
      console.error('[DocumentTemplateService] 获取模板列表失败:', error);
      throw new Error('获取模板列表失败: ' + error.message);
    }
  }

  /**
   * 获取单个模板
   * @param {number|string} id - 模板ID
   * @returns {Promise<Object|null>}
   */
  static async getTemplate(id) {
    try {
      const template = await getTemplateAsync(id);
      return template;
    } catch (error) {
      console.error('[DocumentTemplateService] 获取模板失败:', error);
      throw new Error('获取模板失败: ' + error.message);
    }
  }

  /**
   * 创建模板
   * @param {Object} data - 模板数据
   * @param {string} data.name - 模板名称
   * @param {string} data.type - 模板类型
   * @param {Object} data.config - 模板配置JSON
   * @param {boolean} data.isDefault - 是否默认模板
   * @param {number} data.createdBy - 创建人ID
   * @returns {Promise<Object>}
   */
  static async createTemplate(data) {
    try {
      // 业务逻辑验证
      if (!data.name || !data.type || !data.config) {
        const error = new Error('模板名称、类型和配置不能为空');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 验证模板类型
      const validTypes = ['invoice', 'packing', 'sales', 'production', 'pickup', 'custom'];
      if (!validTypes.includes(data.type)) {
        const error = new Error('无效的模板类型');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 调用数据库层创建模板
      const template = await createTemplateAsync(data);
      return template;
    } catch (error) {
      console.error('[DocumentTemplateService] 创建模板失败:', error);
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error('创建模板失败: ' + error.message);
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
      console.log('[DocumentTemplateService] 更新模板请求:', {
        id,
        name: data.name,
        type: data.type,
        hasConfig: !!data.config,
        configKeys: data.config ? Object.keys(data.config) : [],
        hasHtml: !!(data.config?.html || data.config?.canvas?.components),
        htmlLength: (data.config?.html || data.config?.canvas?.components || '').length
      });
      
      // 业务逻辑验证
      if (!id) {
        const error = new Error('模板ID不能为空');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 验证模板类型（如果提供）
      if (data.type) {
        const validTypes = ['invoice', 'packing', 'sales', 'production', 'pickup', 'custom'];
        if (!validTypes.includes(data.type)) {
          const error = new Error('无效的模板类型');
          error.code = 'VALIDATION_ERROR';
          throw error;
        }
      }

      // 调用数据库层更新模板
      const template = await updateTemplateAsync(id, data);
      if (!template) {
        const error = new Error('模板不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }
      
      console.log('[DocumentTemplateService] ✅ 模板更新成功:', {
        id: template.id,
        name: template.name,
        hasConfig: !!template.config,
        hasHtml: !!(template.config?.html || template.config?.canvas?.components)
      });
      
      return template;
    } catch (error) {
      console.error('[DocumentTemplateService] ❌ 更新模板失败:', error);
      if (error.code === 'VALIDATION_ERROR' || error.code === 'NOT_FOUND') {
        throw error;
      }
      throw new Error('更新模板失败: ' + error.message);
    }
  }

  /**
   * 删除模板
   * @param {number|string} id - 模板ID
   * @returns {Promise<void>}
   */
  static async deleteTemplate(id) {
    try {
      if (!id) {
        const error = new Error('模板ID不能为空');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      await deleteTemplateAsync(id);
    } catch (error) {
      console.error('[DocumentTemplateService] 删除模板失败:', error);
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error('删除模板失败: ' + error.message);
    }
  }

  /**
   * 删除所有模板
   * @returns {Promise<number>} 删除的模板数量
   */
  static async deleteAllTemplates() {
    try {
      const deletedCount = await deleteAllTemplatesAsync();
      console.log(`[DocumentTemplateService] 已删除所有模板，共 ${deletedCount} 个`);
      return deletedCount;
    } catch (error) {
      console.error('[DocumentTemplateService] 删除所有模板失败:', error);
      throw new Error('删除所有模板失败: ' + error.message);
    }
  }

  /**
   * 获取默认模板
   * @param {string} type - 模板类型
   * @returns {Promise<Object|null>}
   */
  static async getDefaultTemplate(type) {
    try {
      if (!type) {
        const error = new Error('模板类型不能为空');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const template = await getDefaultTemplateAsync(type);
      return template;
    } catch (error) {
      console.error('[DocumentTemplateService] 获取默认模板失败:', error);
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error('获取默认模板失败: ' + error.message);
    }
  }
}

module.exports = DocumentTemplateService;

