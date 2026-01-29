/**
 * 公司配置服务
 * 封装公司配置相关的业务逻辑
 */

const db = require('../db');
const { promisify } = require('util');

// 将回调函数转换为 Promise
const getCompanyAsync = promisify(db.getCompany);
const setCompanyAsync = promisify(db.setCompany);

class CompanyService {
  /**
   * 获取公司配置
   * @returns {Promise<Object>}
   */
  static async getCompany() {
    try {
      const company = await getCompanyAsync();
      return company || {};
    } catch (error) {
      console.error('[CompanyService] 获取公司配置失败:', error);
      throw new Error('获取公司配置失败: ' + error.message);
    }
  }

  /**
   * 设置公司配置
   * @param {Object} companyData - 公司配置数据
   * @returns {Promise<Object>}
   */
  static async setCompany(companyData) {
    try {
      // 业务逻辑验证
      if (!companyData) {
        const error = new Error('公司配置数据不能为空');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 调用数据库层设置公司配置
      const company = await setCompanyAsync(companyData);

      return company;
    } catch (error) {
      console.error('[CompanyService] 设置公司配置失败:', error);
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error('设置公司配置失败: ' + error.message);
    }
  }
}

module.exports = CompanyService;
