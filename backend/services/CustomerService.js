/**
 * 客户服务
 * 封装客户相关的业务逻辑
 */

const db = require('../db');
const { promisify } = require('util');

// 将回调函数转换为 Promise
const listCustomersAsync = promisify(db.listCustomers);
const getCustomerAsync = promisify(db.getCustomer);
const createCustomerAsync = promisify(db.createCustomer);
const updateCustomerAsync = promisify(db.updateCustomer);
const deleteCustomerAsync = promisify(db.deleteCustomer);

class CustomerService {
  /**
   * 获取客户列表
   * @param {Object} options - 查询选项（可选）
   * @param {number} options.page - 页码
   * @param {number} options.pageSize - 每页数量
   * @returns {Promise<Array|Object>} 如果提供了分页参数，返回 { total, page, pageSize, totalPages, data }，否则返回数组
   */
  static async listCustomers(options = {}) {
    try {
      const result = await listCustomersAsync(options);
      
      // 如果返回的是分页结果对象，直接返回
      if (result && typeof result === 'object' && 'total' in result) {
        return result;
      }
      
      // 否则返回数组（保持向后兼容）
      return result || [];
    } catch (error) {
      console.error('[CustomerService] 获取客户列表失败:', error);
      throw new Error('获取客户列表失败: ' + error.message);
    }
  }

  /**
   * 获取单个客户
   * @param {number|string} id - 客户ID
   * @returns {Promise<Object>}
   * @throws {Error} 客户不存在时抛出错误
   */
  static async getCustomer(id) {
    try {
      const customer = await getCustomerAsync(id);
      if (!customer) {
        const error = new Error('客户不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }
      return customer;
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        throw error;
      }
      console.error('[CustomerService] 获取客户失败:', error);
      throw new Error('获取客户信息失败: ' + error.message);
    }
  }

  /**
   * 创建客户
   * @param {Object} customerData - 客户数据
   * @returns {Promise<Object>}
   */
  static async createCustomer(customerData) {
    try {
      // 业务逻辑验证（输入验证已在中间件中完成）
      if (!customerData || !customerData.name || customerData.name.trim() === '') {
        const error = new Error('客户名称不能为空');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 调用数据库层创建客户
      const customer = await createCustomerAsync(customerData);

      return customer;
    } catch (error) {
      console.error('[CustomerService] 创建客户失败:', error);
      // 处理重复名称错误
      if (error.code === 'SQLITE_CONSTRAINT' || error.message.includes('UNIQUE constraint')) {
        const duplicateError = new Error('该客户名称已存在，请使用其他名称');
        duplicateError.code = 'DUPLICATE_NAME';
        throw duplicateError;
      }
      if (error.code === 'VALIDATION_ERROR' || error.code === 'DUPLICATE_NAME') {
        throw error;
      }
      throw new Error('创建客户失败: ' + error.message);
    }
  }

  /**
   * 更新客户
   * @param {number|string} id - 客户ID
   * @param {Object} customerData - 客户数据
   * @returns {Promise<Object>}
   */
  static async updateCustomer(id, customerData) {
    try {
      // 检查客户是否存在
      const existingCustomer = await getCustomerAsync(id);
      if (!existingCustomer) {
        const error = new Error('客户不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }

      // 业务逻辑验证
      if (customerData.name && customerData.name.trim() === '') {
        const error = new Error('客户名称不能为空');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 调用数据库层更新客户
      const customer = await updateCustomerAsync(Number(id), customerData);

      if (!customer) {
        const error = new Error('客户不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }

      return customer;
    } catch (error) {
      console.error('[CustomerService] 更新客户失败:', error);
      // 处理重复名称错误
      if (error.code === 'SQLITE_CONSTRAINT' || error.message.includes('UNIQUE constraint')) {
        const duplicateError = new Error('该客户名称已存在，请使用其他名称');
        duplicateError.code = 'DUPLICATE_NAME';
        throw duplicateError;
      }
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR' || error.code === 'DUPLICATE_NAME') {
        throw error;
      }
      throw new Error('更新客户失败: ' + error.message);
    }
  }

  /**
   * 删除客户
   * @param {number|string} id - 客户ID
   * @returns {Promise<Object>}
   */
  static async deleteCustomer(id) {
    try {
      // 检查客户是否存在
      const existingCustomer = await getCustomerAsync(id);
      if (!existingCustomer) {
        const error = new Error('客户不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }

      // 调用数据库层删除客户
      await deleteCustomerAsync(Number(id));

      return {
        success: true,
        message: '客户删除成功',
        deletedId: id
      };
    } catch (error) {
      console.error('[CustomerService] 删除客户失败:', error);
      if (error.code === 'NOT_FOUND') {
        throw error;
      }
      throw new Error('删除客户失败: ' + error.message);
    }
  }
}

module.exports = CustomerService;
