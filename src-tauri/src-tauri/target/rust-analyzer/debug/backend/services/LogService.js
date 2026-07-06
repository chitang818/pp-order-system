/**
 * 日志服务
 * 统一管理操作日志记录
 */

const db = require('../db');
const { promisify } = require('util');

// 将回调函数转换为 Promise
const listOperationLogsAsync = promisify(db.listOperationLogs);
const deleteOperationLogAsync = promisify(db.deleteOperationLog);
const clearOperationLogsAsync = promisify(db.clearOperationLogs);
const cleanOldOperationLogsAsync = promisify(db.cleanOldOperationLogs);

class LogService {
  /**
   * 记录操作日志
   * 
   * @param {Object} req - Express 请求对象
   * @param {string} operation - 操作类型（如：创建订单、更新产品、删除客户）
   * @param {string} module - 模块名称（如：订单管理、产品库管理、客户管理、系统设置）
   * @param {string} target - 操作目标（如：订单号SC2025/001、产品ID、客户名称）
   * @param {string} details - 详细信息（如：创建订单成功，金额: 1000 USD）
   * @param {string} status - 操作状态（'success' 或 'failure'）
   * @param {string} errorMessage - 错误信息（仅在status为'failure'时有意义）
   * @returns {Promise<void>}
   */
  static async logOperation(req, operation, module, target = '', details = '', status = 'success', errorMessage = '') {
    try {
      const userId = req.user?.id || null;
      const username = req.user?.username || '未登录用户';
      const ipAddress = (req && (req.ip || req.connection?.remoteAddress)) || 'unknown';
      const userAgent = (req && typeof req.get === 'function' && req.get('User-Agent')) || 'unknown';

      db.createOperationLog({
        userId,
        username,
        operation,
        module,
        target,
        details,
        ipAddress,
        userAgent,
        status,
        errorMessage
      }, (err) => {
        if (err) {
          console.error('[操作日志] 记录失败:', err);
        }
      });
    } catch (error) {
      console.error('[操作日志] 记录异常:', error);
    }
  }

  /**
   * 获取操作日志列表（支持分页和筛选）
   * 
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认：1）
   * @param {number} options.pageSize - 每页数量（默认：50）
   * @param {string} options.module - 模块名称筛选
   * @param {number} options.userId - 用户ID筛选
   * @param {string} options.operation - 操作类型筛选
   * @param {string} options.startDate - 开始日期筛选
   * @param {string} options.endDate - 结束日期筛选
   * @returns {Promise<Object>} 返回 { total, page, pageSize, totalPages, data }
   */
  static async listOperationLogs(options = {}) {
    try {
      const {
        page = 1,
        pageSize = 50,
        module,
        userId,
        operation,
        startDate,
        endDate
      } = options;

      const queryOptions = {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        module,
        userId: userId ? parseInt(userId) : undefined,
        operation,
        startDate,
        endDate
      };

      const result = await listOperationLogsAsync(queryOptions);
      return result || { total: 0, page: 1, pageSize: 50, totalPages: 0, data: [] };
    } catch (error) {
      console.error('[LogService] 获取操作日志列表失败:', error);
      throw new Error('获取操作日志列表失败: ' + error.message);
    }
  }

  /**
   * 删除操作日志
   * 
   * @param {number|string} id - 日志ID
   * @returns {Promise<Object>} 返回 { changes }
   * @throws {Error} 日志不存在时抛出错误
   */
  static async deleteOperationLog(id) {
    try {
      const result = await deleteOperationLogAsync(parseInt(id));
      if (result.changes === 0) {
        const error = new Error('日志不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }
      return result;
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        throw error;
      }
      console.error('[LogService] 删除操作日志失败:', error);
      throw new Error('删除操作日志失败: ' + error.message);
    }
  }

  /**
   * 清空操作日志
   * 
   * @returns {Promise<Object>} 返回 { changes }
   */
  static async clearOperationLogs() {
    try {
      const result = await clearOperationLogsAsync();
      return result || { changes: 0 };
    } catch (error) {
      console.error('[LogService] 清空操作日志失败:', error);
      throw new Error('清空操作日志失败: ' + error.message);
    }
  }

  /**
   * 清理旧的操作日志（保留最近N天）
   * 
   * @param {number} days - 保留天数（默认：90）
   * @returns {Promise<Object>} 返回 { changes }
   */
  static async cleanOldOperationLogs(days = 90) {
    try {
      const result = await cleanOldOperationLogsAsync(parseInt(days));
      return result || { changes: 0 };
    } catch (error) {
      console.error('[LogService] 清理旧日志失败:', error);
      throw new Error('清理旧日志失败: ' + error.message);
    }
  }
}

module.exports = LogService;

