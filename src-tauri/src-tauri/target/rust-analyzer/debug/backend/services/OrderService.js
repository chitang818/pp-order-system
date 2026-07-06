/**
 * 订单服务
 * 封装订单相关的业务逻辑
 */

const db = require('../db');
const { promisify } = require('util');

// 将回调函数转换为 Promise
const listOrdersAsync = promisify(db.listOrders);
const listDeletedOrdersAsync = promisify(db.listDeletedOrders);
const getOrderAsync = promisify(db.getOrder);
const createOrderAsync = promisify(db.createOrder);
const updateOrderAsync = promisify(db.updateOrder);
const deleteOrderAsync = promisify(db.deleteOrder);
const restoreOrderAsync = promisify(db.restoreOrder);
const permanentlyDeleteOrderAsync = promisify(db.permanentlyDeleteOrder);
const cleanupExpiredDeletedOrdersAsync = promisify(db.cleanupExpiredDeletedOrders);

class OrderService {
  /**
   * 获取订单列表
   * @param {Object} options - 查询选项（可选）
   * @param {number} options.page - 页码
   * @param {number} options.pageSize - 每页数量
   * @returns {Promise<Array|Object>} 如果提供了分页参数，返回 { total, page, pageSize, totalPages, data }，否则返回数组
   */
  static async listOrders(options = {}) {
    try {
      const result = await listOrdersAsync(options);

      // 如果返回的是分页结果对象，直接返回
      if (result && typeof result === 'object' && 'total' in result) {
        return result;
      }

      // 否则返回数组（保持向后兼容）
      return result || [];
    } catch (error) {
      console.error('[OrderService] 获取订单列表失败:', error);
      throw new Error('获取订单列表失败: ' + error.message);
    }
  }

  /**
   * 获取单个订单
   * @param {number|string} id - 订单ID
   * @returns {Promise<Object>}
   * @throws {Error} 订单不存在时抛出错误
   */
  static async getOrder(id) {
    try {
      const order = await getOrderAsync(id);
      if (!order) {
        const error = new Error('订单不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }
      return order;
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        throw error;
      }
      console.error('[OrderService] 获取订单失败:', error);
      throw new Error('获取订单信息失败: ' + error.message);
    }
  }

  /**
   * 创建订单
   * @param {Object} orderData - 订单数据
   * @param {Object} req - Express 请求对象（用于日志记录）
   * @returns {Promise<Object>}
   */
  static async createOrder(orderData, req = null) {
    try {
      // 业务逻辑验证（输入验证已在中间件中完成）
      if (!orderData || !orderData.items || orderData.items.length === 0) {
        const error = new Error('订单必须包含至少一个订单项');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 检查合同编号是否重复（如果提供了合同编号）
      if (orderData.contractNo && orderData.contractNo.trim()) {
        const contractNo = orderData.contractNo.trim();
        const existingOrder = await new Promise((resolve, reject) => {
          db.db.get(
            'SELECT id, contractNo FROM orders WHERE contractNo = ? LIMIT 1',
            [contractNo],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        });

        if (existingOrder) {
          const error = new Error(`合同编号 "${contractNo}" 已存在，请使用其他编号`);
          error.code = 'VALIDATION_ERROR';
          error.duplicateContractNo = contractNo;
          throw error;
        }
      }

      // 计算总金额（如果未提供）
      if (orderData.totalUSD === undefined || orderData.totalUSD === null) {
        orderData.totalUSD = OrderService.calculateTotal(orderData.items);
      }

      // 调用数据库层创建订单
      const order = await createOrderAsync(orderData);

      // 返回创建的订单
      return order;
    } catch (error) {
      console.error('[OrderService] 创建订单失败:', error);
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error('创建订单失败: ' + error.message);
    }
  }

  /**
   * 更新订单
   * @param {number|string} id - 订单ID
   * @param {Object} orderData - 订单数据
   * @param {Object} req - Express 请求对象（用于日志记录）
   * @returns {Promise<Object>}
   */
  static async updateOrder(id, orderData, req = null) {
    try {
      console.log('[OrderService] 开始更新订单，ID:', id);
      console.log('[OrderService] 订单数据:', JSON.stringify({
        ...orderData,
        items: orderData.items ? `${orderData.items.length} items` : 'no items',
        extras: orderData.extras ? JSON.stringify(orderData.extras).substring(0, 100) : 'no extras'
      }, null, 2));

      // 检查订单是否存在
      const existingOrder = await getOrderAsync(id);
      if (!existingOrder) {
        const error = new Error('订单不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }

      // 业务逻辑验证
      // 注意：更新订单时允许空订单项（可能是清空订单项的情况）
      // 只有在创建订单时才要求必须有订单项

      // 计算总金额（如果items有变更）
      if (orderData.items && Array.isArray(orderData.items) && orderData.items.length > 0) {
        orderData.totalUSD = OrderService.calculateTotal(orderData.items);
        console.log('[OrderService] 计算总金额:', orderData.totalUSD);
      } else if (orderData.items && Array.isArray(orderData.items) && orderData.items.length === 0) {
        // 如果订单项被清空，总金额设为0
        orderData.totalUSD = 0;
        console.log('[OrderService] 订单项为空，总金额设为0');
      }

      // 调用数据库层更新订单
      console.log('[OrderService] 调用数据库层更新订单...');
      const order = await updateOrderAsync(id, orderData);
      console.log('[OrderService] 数据库层更新完成');

      if (!order) {
        const error = new Error('订单不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }

      console.log('[OrderService] 更新订单成功，ID:', order.id);
      return order;
    } catch (error) {
      console.error('[OrderService] 更新订单失败:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        id: id
      });
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error('更新订单失败: ' + error.message);
    }
  }

  /**
   * 删除订单
   * @param {number|string} id - 订单ID
   * @param {Object} req - Express 请求对象（用于日志记录）
   * @returns {Promise<Object>}
   */
  static async deleteOrder(id, req = null) {
    try {
      // 检查订单是否存在
      const existingOrder = await getOrderAsync(id);
      if (!existingOrder) {
        const error = new Error('订单不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }

      // 调用数据库层删除订单
      const result = await deleteOrderAsync(id);

      return {
        success: true,
        result,
        message: '订单已删除（可恢复）',
        deletedId: id
      };
    } catch (error) {
      console.error('[OrderService] 删除订单失败:', error);
      if (error.code === 'NOT_FOUND') {
        throw error;
      }
      throw new Error('删除订单失败: ' + error.message);
    }
  }

  /**
   * 恢复已删除的订单
   * @param {number|string} id - 订单ID
   * @param {Object} req - Express 请求对象（用于日志记录）
   * @returns {Promise<Object>}
   */
  static async restoreOrder(id, req = null) {
    try {
      // 调用数据库层恢复订单
      const result = await restoreOrderAsync(id);

      return {
        success: true,
        result,
        message: '订单恢复成功',
        restoredId: id
      };
    } catch (error) {
      console.error('[OrderService] 恢复订单失败:', error);
      throw new Error('恢复订单失败: ' + error.message);
    }
  }

  /**
   * 获取已删除的订单列表
   * @param {Object} options - 查询选项（可选）
   * @param {number} options.page - 页码
   * @param {number} options.pageSize - 每页数量
   * @returns {Promise<Array|Object>} 如果提供了分页参数，返回 { total, page, pageSize, totalPages, data }，否则返回数组
   */
  static async listDeletedOrders(options = {}) {
    try {
      const result = await listDeletedOrdersAsync(options);
      return result;
    } catch (error) {
      console.error('[OrderService] 获取已删除订单列表失败:', error);
      throw new Error('获取已删除订单列表失败: ' + error.message);
    }
  }

  /**
   * 彻底删除订单（物理删除）
   * @param {number|string} id - 订单ID
   * @returns {Promise<Object>}
   */
  static async permanentlyDeleteOrder(id) {
    try {
      const result = await permanentlyDeleteOrderAsync(id);
      return {
        success: true,
        result,
        message: '订单已彻底删除',
        deletedId: id
      };
    } catch (error) {
      console.error('[OrderService] 彻底删除订单失败:', error);
      throw new Error('彻底删除订单失败: ' + error.message);
    }
  }

  /**
   * 清理超过指定天数的已删除订单
   * @param {number} days - 保留天数，默认7天
   * @returns {Promise<Object>}
   */
  static async cleanupExpiredDeletedOrders(days = 7) {
    try {
      const result = await cleanupExpiredDeletedOrdersAsync(days);
      return {
        success: true,
        result,
        message: `清理完成，已删除 ${result.deletedCount || 0} 个过期订单`
      };
    } catch (error) {
      console.error('[OrderService] 清理过期已删除订单失败:', error);
      throw new Error('清理过期已删除订单失败: ' + error.message);
    }
  }

  /**
   * 计算订单总金额
   * @param {Array} items - 订单项数组
   * @returns {number}
   */
  static calculateTotal(items) {
    if (!items || !Array.isArray(items)) {
      return 0;
    }

    return items.reduce((total, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      return total + (quantity * unitPrice);
    }, 0);
  }

  /**
   * 获取下一个合同编号
   * 规则：
   * 1. 查找当前年份的所有合同编号（格式：SC{年份}-{序号} 或 SC{年份}-{序号}(NO.xxx)）
   * 2. 提取所有序号，找到最大序号（支持格式：SC2025-062 或 SC2025-147(NO.25453)）
   * 3. 最大序号+1作为新编号
   * 4. 如果当前年份没有订单，则从001开始
   * 5. 序号保持原格式（不强制三位数，如100, 101, 1001等）
   * @returns {Promise<Object>}
   */
  static async getNextContractNo() {
    return new Promise((resolve, reject) => {
      const currentYear = new Date().getFullYear();
      const yearPattern = `SC${currentYear}-%`;

      db.db.all(`
        SELECT contractNo 
        FROM orders 
        WHERE contractNo LIKE ?
        ORDER BY contractNo DESC
      `, [yearPattern], (err, rows) => {
        if (err) {
          console.error('[OrderService] 查询合同编号失败:', err);
          return reject(new Error('获取合同编号失败: ' + err.message));
        }

        let nextNumber = 1;
        let maxFormattedNumber = null; // 保存最大序号的原始格式

        // 在 JavaScript 中处理编号提取和排序
        if (rows && rows.length > 0) {
          // 提取所有有效的合同编号和序号
          const contractNos = rows
            .map(row => {
              if (!row.contractNo) return null;
              // 匹配格式：SC{年份}-{序号} 或 SC{年份}-{序号}(NO.xxx)
              // 支持格式：SC2025-062 或 SC2025-147(NO.25453) 或 SC2025-147(25453)
              // 使用非贪婪匹配，只提取序号部分，忽略后面的订单号
              const match = row.contractNo.match(/^SC\d{4}-(\d+)/);
              if (match) {
                return {
                  contractNo: row.contractNo,
                  number: parseInt(match[1], 10),
                  formatted: match[1] // 保存原始格式（如 "100", "001" 等）
                };
              }
              return null;
            })
            .filter(item => item !== null && item.number > 0);

          if (contractNos.length > 0) {
            // 按序号降序排列
            contractNos.sort((a, b) => b.number - a.number);
            const maxItem = contractNos[0];
            nextNumber = maxItem.number + 1;
            maxFormattedNumber = maxItem.formatted;

            console.log(`[OrderService] 当前年份 ${currentYear} 最大合同编号: ${maxItem.contractNo}, 序号: ${maxItem.number}, 下一个序号: ${nextNumber}`);
          } else {
            // 当前年份有订单但序号格式不匹配，从001开始
            nextNumber = 1;
            console.log(`[OrderService] 当前年份 ${currentYear} 没有有效合同编号，从001开始`);
          }
        } else {
          // 当前年份没有订单，从001开始
          console.log(`[OrderService] 当前年份 ${currentYear} 没有订单，从001开始`);
          nextNumber = 1;
        }

        // 格式化序号：
        // 1. 如果当前年份没有订单或没有有效编号，从001开始
        // 2. 如果找到了最大序号，下一个序号保持相同的位数格式
        //    例如：最大是100，下一个是101；最大是001，下一个是002；最大是1001，下一个是1002
        let formattedNumber;
        if (maxFormattedNumber !== null) {
          // 保持最大序号的格式（位数）
          const paddingLength = maxFormattedNumber.length;
          formattedNumber = String(nextNumber).padStart(paddingLength, '0');
        } else {
          // 新年份或没有有效编号，从001开始（三位数）
          formattedNumber = String(nextNumber).padStart(3, '0');
        }

        const nextContractNo = `SC${currentYear}-${formattedNumber}`;

        console.log(`[OrderService] 生成下一个合同编号: ${nextContractNo}`);

        resolve({
          success: true,
          data: {
            nextContractNo,
            currentYear,
            nextNumber: formattedNumber
          }
        });
      });
    });
  }
}

module.exports = OrderService;
