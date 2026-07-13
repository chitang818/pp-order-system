/**
 * 订单服务
 * 负责订单相关的业务逻辑：数据加载、筛选、统计、删除等
 * ES6 模块化版本
 * 
 * @module services/order-service
 * @example
 * ```javascript
 * import { OrderService } from './services/order-service.js';
 * 
 * const orderService = new OrderService({
 *   stateManager: stateManager,
 *   apiService: window.ApiService
 * });
 * 
 * // 加载订单列表
 * const orders = await orderService.loadOrders();
 * 
 * // 筛选订单
 * const filtered = orderService.filterOrders({ status: 'active' });
 * ```
 */

/**
 * 订单服务类
 * 封装订单相关的业务逻辑操作
 * 
 * @class OrderService
 */
export class OrderService {
  /**
   * 创建订单服务实例
   * @param {Object} options - 配置选项
   * @param {StateManager} options.stateManager - 状态管理器实例（必需）
   * @param {Object} options.apiService - API 服务实例（必需）
   * @throws {Error} 如果 stateManager 或 apiService 未提供
   */
  constructor(options = {}) {
    /**
     * 状态管理器
     * @type {StateManager}
     */
    this.stateManager = options.stateManager || null;

    /**
     * API 服务
     * @type {Object}
     */
    this.apiService = options.apiService || (window.ApiService || null);

    if (!this.stateManager) {
      throw new Error('OrderService: stateManager is required');
    }
    if (!this.apiService) {
      throw new Error('OrderService: apiService is required');
    }
  }

  /**
   * 加载订单列表
   * 从 API 加载订单数据并更新状态管理器
   * 
   * @param {Object} [options={}] - 加载选项
   * @param {string} [options.productModel] - 产品型号筛选（可选）
   * @returns {Promise<Array<Object>>} 订单列表数组
   * @throws {Error} 如果 API 调用失败
   * @example
   * ```javascript
   * // 加载所有订单
   * const orders = await orderService.loadOrders();
   * 
   * // 按产品型号筛选
   * const orders = await orderService.loadOrders({ productModel: 'ABC-123' });
   * ```
   */
  async loadOrders(options = {}) {
    try {
      console.log('[OrderService] 开始加载订单列表', options);

      // 清除订单缓存，确保获取最新数据
      if (window.CacheService && window.CacheService.orders && typeof window.CacheService.orders.clear === 'function') {
        window.CacheService.orders.clear();
        console.log('[OrderService] 已清除订单缓存');
      }

      const apiOptions = {};
      if (options.productModel) {
        apiOptions.productModel = options.productModel.trim();
      }

      const result = await this.apiService.orders.list(apiOptions);

      // 处理分页结果对象或数组
      let orders = [];
      if (Array.isArray(result)) {
        orders = result;
      } else if (result && typeof result === 'object' && 'data' in result) {
        // 分页结果格式：{ total, page, pageSize, totalPages, data }
        orders = Array.isArray(result.data) ? result.data : [];
        console.log('[OrderService] 分页结果:', {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          dataCount: orders.length
        });
      } else {
        console.warn('[OrderService] API返回未知格式:', result);
        orders = [];
      }

      // DEBUG: 打印第一条订单的 totalUSD 值
      if (orders.length > 0) {
        console.log('[OrderService] 第一条订单 totalUSD:', orders[0].totalUSD, '订单对象:', orders[0]);
      }

      // 更新状态
      this.stateManager.setState('orders', orders);
      console.log('[OrderService] 订单列表加载成功:', orders.length, '条');
      return orders;
    } catch (error) {
      console.error('[OrderService] 加载订单列表失败:', error);
      this.stateManager.setState('orders', []);
      throw error;
    }
  }

  /**
   * 获取订单列表
   * 从状态管理器获取当前订单列表
   * 
   * @returns {Array<Object>} 订单列表数组
   * @example
   * ```javascript
   * const orders = orderService.getOrders();
   * console.log(`当前有 ${orders.length} 个订单`);
   * ```
   */
  getOrders() {
    return this.stateManager.getState('orders') || [];
  }

  /**
   * 规范化订单状态文本，去除乱码字符和 emoji 图标
   * 注意：图标应该通过 CSS 的 ::after 伪元素显示，而不是在文本中
   * @private
   * @param {string} status - 原始状态文本
   * @returns {string} 规范化后的状态文本（纯文本，不包含 emoji）
   */
  _normalizeStatus(status) {
    if (!status || typeof status !== 'string') {
      return '已创建';
    }

    // 去除首尾空白
    let trimmed = status.trim();

    // 移除所有 emoji 和特殊 Unicode 字符（保留中文字符）
    // 匹配中文字符（Unicode 范围：\u4e00-\u9fa5）
    // 同时移除所有非中文字符（包括 emoji、乱码等）
    const chineseOnly = trimmed.match(/[\u4e00-\u9fa5]+/g);
    if (chineseOnly && chineseOnly.length > 0) {
      trimmed = chineseOnly.join('');
    } else {
      // 如果没有中文字符，尝试直接匹配标准状态
      trimmed = trimmed.replace(/[^\u4e00-\u9fa5]/g, '');
    }

    // 检查是否匹配标准状态值
    if (trimmed.includes('已创建')) {
      return '已创建';
    }
    if (trimmed.includes('已排产')) {
      return '已排产';
    }
    if (trimmed.includes('已发货')) {
      return '已发货';
    }
    if (trimmed.includes('已完成')) {
      return '已完成';
    }

    // 如果提取的中文字符看起来像状态，返回它
    if (trimmed.length > 0 && trimmed.length <= 6) {
      return trimmed;
    }

    // 如果无法识别，返回默认值
    return '已创建';
  }

  /**
   * 筛选订单
   * 根据筛选条件过滤订单列表
   * 
   * @param {Object} [filters={}] - 筛选条件
   * @param {string} [filters.orderNo] - 订单号/合同号（模糊匹配）
   * @param {string} [filters.customer] - 客户ID或名称（模糊匹配）
   * @param {string} [filters.status] - 订单状态（精确匹配）
   * @param {string} [filters.date] - 日期（YYYY-MM-DD，精确匹配）
   * @param {string} [filters.destination] - 目的地（模糊匹配）
   * @param {string} [filters.productModel] - 产品型号（模糊匹配）
   * @param {string} [filters.productType] - 产品类型（1=A类品, 2=B类品, 3=C类品）
   * @returns {Array<Object>} 筛选后的订单列表
   * @example
   * ```javascript
   * // 按状态筛选
   * const activeOrders = orderService.filterOrders({ status: 'active' });
   * 
   * // 多条件筛选
   * const filtered = orderService.filterOrders({
   *   status: 'active',
   *   customer: '客户A',
   *   date: '2024-01-01'
   * });
   * 
   * // 按产品类型筛选
   * const typeAOrders = orderService.filterOrders({ productType: '1' });
   * ```
   */
  filterOrders(filters = {}) {
    const orders = this.getOrders();

    const {
      orderNo = '',
      invoiceNo = '',
      customer = '',
      status = '',
      date = '',
      destination = '',
      productModel = '',
      productType = ''
    } = filters;

    const fNo = orderNo.trim().toLowerCase();
    const fInvoiceNo = invoiceNo.trim().toLowerCase();
    const fCus = customer.trim();
    const fStatus = status.trim();
    const fDate = date.trim();
    const fDestination = destination.trim().toLowerCase();
    const fProductModel = productModel.trim().toLowerCase();
    const fProductType = productType.trim();

    // 记录筛选条件（仅在开发环境或条件不为空时）
    if (fNo || fInvoiceNo || fCus || fStatus || fDate || fDestination || fProductModel || fProductType) {
      console.log('[OrderService] 筛选订单条件:', {
        orderNo: fNo || '(空)',
        invoiceNo: fInvoiceNo || '(空)',
        customer: fCus || '(空)',
        status: fStatus || '(空)',
        date: fDate || '(空)',
        destination: fDestination || '(空)',
        productModel: fProductModel || '(空)',
        productType: fProductType || '(空)',
        totalOrders: orders.length
      });
    }

    const filtered = orders
      // 订单号筛选（支持合同号、发票号、提单号等多字段搜索）
      .filter((o) => {
        if (!fNo) return true;

        // 收集所有可能包含订单号的字段（包括空值处理）
        // 确保所有字段都被正确转换为字符串
        const searchFields = [
          o.contractNo,
          o.orderNo,
          o.invoiceNo,
          o.blNo
        ]
          .map(field => {
            // 处理 null、undefined、空字符串等情况
            if (field == null || field === '') {
              return null;
            }
            // 确保转换为字符串并去除首尾空白
            const str = String(field).trim();
            return str.length > 0 ? str : null;
          })
          .filter(field => field !== null);

        // 如果没有任何可搜索字段，且用户输入了筛选条件，则过滤掉此订单
        if (searchFields.length === 0) {
          return false;
        }

        // 规范化筛选条件
        const normalizedFilter = String(fNo)
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // 去除零宽字符
          .replace(/[\uFF01-\uFF5E]/g, (char) => {
            // 全角转半角
            const code = char.charCodeAt(0);
            if (code >= 0xFF01 && code <= 0xFF5E) {
              return String.fromCharCode(code - 0xFEE0);
            }
            return char;
          })
          .toLowerCase()
          .trim();

        // 对每个字段单独检查，确保能匹配到部分内容
        // 这样可以避免字段合并时可能出现的格式问题
        const matched = searchFields.some(field => {
          try {
            // 确保字段是字符串并转换为小写
            // 使用 normalize 处理可能的全角/半角字符问题
            const fieldStr = String(field).trim();
            // 规范化字符串：去除不可见字符，统一处理全角/半角
            const normalizedField = fieldStr
              .replace(/[\u200B-\u200D\uFEFF]/g, '') // 去除零宽字符
              .replace(/[\uFF01-\uFF5E]/g, (char) => {
                // 全角转半角
                const code = char.charCodeAt(0);
                if (code >= 0xFF01 && code <= 0xFF5E) {
                  return String.fromCharCode(code - 0xFEE0);
                }
                return char;
              })
              .toLowerCase();

            // 执行包含检查
            // 如果输入的是纯数字，根据位数使用不同的匹配策略
            let result = false;
            if (/^\d+$/.test(normalizedFilter)) {
              const digitCount = normalizedFilter.length;

              // 从合同号中提取订单号和客户订单号
              // 格式1: SC2025-210
              // 格式2: SC2025-210(NO.25642) 或 SC2025-210(25642)
              // 提取订单号：-后面的数字部分（直到遇到(或字符串结尾）
              const orderNoMatch = normalizedField.match(/-(\d+)(?:\(|$)/);
              // 提取客户订单号：优先匹配(NO.数字)，其次匹配(数字)
              let customerOrderNo = null;
              const customerOrderNoMatch1 = normalizedField.match(/\(NO\.\s*(\d+)\s*\)/i);
              if (customerOrderNoMatch1) {
                customerOrderNo = customerOrderNoMatch1[1];
              } else {
                const customerOrderNoMatch2 = normalizedField.match(/\((\d+)\)/);
                if (customerOrderNoMatch2) {
                  customerOrderNo = customerOrderNoMatch2[1];
                }
              }

              const orderNo = orderNoMatch ? orderNoMatch[1] : null;

              if (digitCount <= 3) {
                // 三位数及以下（如"2", "20", "202"）：匹配订单号和客户订单号
                // 检查输入是否包含在订单号或客户订单号中
                if (orderNo && orderNo.includes(normalizedFilter)) {
                  result = true;
                } else if (customerOrderNo && customerOrderNo.includes(normalizedFilter)) {
                  result = true;
                }

                // 调试：记录匹配细节
                if (fNo.length >= 2) {
                  console.log('[OrderService] 订单号筛选匹配详情（≤3位）:', {
                    filter: fNo,
                    normalizedFilter: normalizedFilter,
                    field: fieldStr,
                    normalizedField: normalizedField,
                    orderNo: orderNo,
                    customerOrderNo: customerOrderNo,
                    matched: result
                  });
                }
              } else if (digitCount >= 4 && digitCount <= 5) {
                // 四位数到五位数（如"2564", "25642"）：优先匹配客户订单号
                if (customerOrderNo && customerOrderNo.includes(normalizedFilter)) {
                  result = true;
                } else if (orderNo && orderNo.includes(normalizedFilter)) {
                  // 如果客户订单号未匹配，再检查订单号
                  result = true;
                }

                // 调试：记录匹配细节
                if (fNo.length >= 2) {
                  console.log('[OrderService] 订单号筛选匹配详情（4-5位）:', {
                    filter: fNo,
                    normalizedFilter: normalizedFilter,
                    field: fieldStr,
                    normalizedField: normalizedField,
                    orderNo: orderNo,
                    customerOrderNo: customerOrderNo,
                    matched: result
                  });
                }
              } else {
                // 六位数及以上：使用包含匹配
                result = normalizedField.includes(normalizedFilter);
              }
            } else {
              // 非纯数字输入：使用普通包含匹配
              result = normalizedField.includes(normalizedFilter);
            }

            // 调试信息：记录匹配过程（仅在匹配成功时输出，避免日志过多）
            // 详细的匹配信息已在各个分支中输出

            return result;
          } catch (e) {
            console.error('[OrderService] 订单号筛选异常:', e, { field, fNo });
            return false;
          }
        });

        // 调试信息：如果未匹配且筛选条件长度>=2，记录详细信息
        if (!matched && fNo.length >= 2) {
          const normalizedFields = searchFields.map(f => {
            const fieldStr = String(f).trim();
            return fieldStr
              .replace(/[\u200B-\u200D\uFEFF]/g, '')
              .replace(/[\uFF01-\uFF5E]/g, (char) => {
                const code = char.charCodeAt(0);
                if (code >= 0xFF01 && code <= 0xFF5E) {
                  return String.fromCharCode(code - 0xFEE0);
                }
                return char;
              })
              .toLowerCase();
          });
          const normalizedFilter = String(fNo)
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[\uFF01-\uFF5E]/g, (char) => {
              const code = char.charCodeAt(0);
              if (code >= 0xFF01 && code <= 0xFF5E) {
                return String.fromCharCode(code - 0xFEE0);
              }
              return char;
            })
            .toLowerCase()
            .trim();

          console.log('[OrderService] 订单号筛选不匹配:', {
            filter: fNo,
            normalizedFilter: normalizedFilter,
            contractNo: o.contractNo || '(空)',
            orderNo: o.orderNo || '(空)',
            invoiceNo: o.invoiceNo || '(空)',
            blNo: o.blNo || '(空)',
            searchFields: searchFields,
            normalizedFields: normalizedFields,
            matches: normalizedFields.map(nf => nf.includes(normalizedFilter))
          });
        }

        return matched;
      })
      // 发票号筛选（模糊匹配）
      .filter((o) => {
        if (!fInvoiceNo) return true;
        const invoiceNo = (o.invoiceNo || '').toLowerCase();
        return invoiceNo.includes(fInvoiceNo);
      })
      // 客户筛选（支持ID和名称的模糊匹配）
      .filter((o) => {
        if (!fCus) return true;
        const customerId = o.customerId ? String(o.customerId) : '';
        const customerName = o.customerName ? String(o.customerName).toLowerCase() : '';
        const fCusLower = fCus.toLowerCase();
        return customerId === fCus || customerName.includes(fCusLower);
      })
      // 状态筛选（规范化状态文本以处理乱码）
      .filter((o) => {
        if (!fStatus) return true;
        const normalizedOrderStatus = this._normalizeStatus(o.status || '');
        // 处理特殊的“待发货”复合状态
        if (fStatus === '待发货') {
          return normalizedOrderStatus === '已创建' || normalizedOrderStatus === '已排产';
        }
        const normalizedFilterStatus = this._normalizeStatus(fStatus);
        return normalizedOrderStatus === normalizedFilterStatus;
      })
      // 日期筛选（支持多种日期格式）
      .filter((o) => {
        if (!fDate) return true;

        const formatDate = (dateStr) => {
          if (!dateStr) return '';
          try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
          } catch (e) {
            return '';
          }
        };

        // 标准化筛选日期（支持 YYYY-MM-DD 和 YYYYMMDD 格式）
        let normalizedFilterDate = fDate;
        if (/^\d{8}$/.test(fDate)) {
          // 如果是 YYYYMMDD 格式，转换为 YYYY-MM-DD
          normalizedFilterDate = `${fDate.slice(0, 4)}-${fDate.slice(4, 6)}-${fDate.slice(6, 8)}`;
        }

        const orderDate = formatDate(o.invoiceDate || o.createdAt || o.updatedAt);
        const shipmentDate = formatDate(o.shipmentDate);

        // 如果筛选日期是本月第一天，则筛选本月所有订单（用于"本月新增订单"）
        const filterDate = new Date(normalizedFilterDate);
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const isCurrentMonthStart = filterDate.getTime() === currentMonthStart.getTime() &&
          filterDate.getFullYear() === now.getFullYear() &&
          filterDate.getMonth() === now.getMonth();

        if (isCurrentMonthStart) {
          // 筛选本月所有订单（订单日期 >= 本月第一天）
          return orderDate >= normalizedFilterDate || shipmentDate >= normalizedFilterDate;
        } else {
          // 精确匹配日期
          return orderDate === normalizedFilterDate || shipmentDate === normalizedFilterDate;
        }
      })
      // 目的地筛选
      .filter((o) => {
        if (!fDestination) return true;
        const dest = String(o.shipTo || '').toLowerCase();
        return dest.includes(fDestination);
      })
      // 产品型号筛选
      // 注意：订单列表数据通常不包含items详情，产品型号筛选主要由后端API完成
      // 如果订单有items数据（如从详情页获取），则在前端进行二次筛选
      .filter((o) => {
        if (!fProductModel) return true;
        const items = o.items || [];
        if (items.length > 0) {
          // 有items数据时，在前端进行筛选
          return items.some(item => {
            const model = (item.model || '').toString().trim();
            return model.toLowerCase().includes(fProductModel);
          });
        }
        // 如果没有items数据，假设后端API已经完成筛选，不在前端过滤
        return true;
      })
      // 产品类型筛选（A类品=1, B类品=2, C类品=3）
      .filter((o) => {
        if (!fProductType) return true;
        // 兼容 Rust IPC 驼峰字段与 Node HTTP 蛇形字段
        const orderProductType = o.productType ?? o.product_type ?? 1;
        // 将筛选条件转换为数字进行比较
        const filterProductType = parseInt(fProductType, 10);
        if (isNaN(filterProductType)) return true;
        return orderProductType === filterProductType;
      });

    // 记录筛选结果
    if (fNo || fInvoiceNo || fCus || fStatus || fDate || fDestination || fProductModel || fProductType) {
      console.log('[OrderService] 筛选结果:', {
        total: orders.length,
        filtered: filtered.length,
        ratio: orders.length > 0 ? ((filtered.length / orders.length * 100).toFixed(1) + '%') : '0%'
      });
    }

    return filtered;
  }

  /**
   * 获取订单统计信息
   * @returns {Object} 统计信息
   */
  getOrderStats() {
    const orders = this.getOrders();

    const totalCount = orders.length;

    // 待发货订单数（已创建 + 已排产）- 使用规范化状态
    const pendingCount = orders.filter(o => {
      const normalizedStatus = this._normalizeStatus(o.status || '');
      return normalizedStatus === '已创建' || normalizedStatus === '已排产';
    }).length;

    // 已发货订单数 - 使用规范化状态
    const shippedCount = orders.filter(o => {
      const normalizedStatus = this._normalizeStatus(o.status || '');
      return normalizedStatus === '已发货';
    }).length;

    // 已完成订单数 - 使用规范化状态
    const completedCount = orders.filter(o => {
      const normalizedStatus = this._normalizeStatus(o.status || '');
      return normalizedStatus === '已完成';
    }).length;

    // 总金额
    const totalUSD = orders.reduce((sum, o) => {
      return sum + Number(o.totalUSD || 0);
    }, 0);

    return {
      total: totalCount,
      pending: pendingCount,
      shipped: shippedCount,
      completed: completedCount,
      totalUSD: totalUSD
    };
  }

  /**
   * 删除订单
   * @param {number|string} orderId - 订单ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteOrder(orderId) {
    try {
      if (!orderId) {
        throw new Error('订单ID不能为空');
      }

      console.log('[OrderService] 删除订单:', orderId);

      const result = await this.apiService.orders.remove(orderId);

      if (result && result.success) {
        // 从状态中移除订单
        const orders = this.getOrders();
        const updatedOrders = orders.filter(o => o.id !== orderId);
        this.stateManager.setState('orders', updatedOrders);

        console.log('[OrderService] 订单删除成功:', orderId);
        return { success: true, orderId };
      } else {
        console.error('[OrderService] 订单删除失败:', result?.message || '未知错误');
        return { success: false, message: result?.message || '删除失败' };
      }
    } catch (error) {
      console.error('[OrderService] 删除订单异常:', error);
      throw error;
    }
  }

  /**
   * 批量删除订单
   * @param {Array<number|string>} orderIds - 订单ID数组
   * @returns {Promise<Object>} 删除结果
   */
  async deleteOrders(orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return { success: false, message: '订单ID列表不能为空' };
    }

    console.log('[OrderService] 批量删除订单:', orderIds.length, '个');

    let successCount = 0;
    let failCount = 0;
    const deletedIds = [];
    const failedIds = [];

    for (const orderId of orderIds) {
      try {
        const result = await this.deleteOrder(orderId);
        if (result.success) {
          successCount++;
          deletedIds.push(orderId);
        } else {
          failCount++;
          failedIds.push(orderId);
        }
      } catch (error) {
        failCount++;
        failedIds.push(orderId);
        console.error('[OrderService] 删除订单失败:', orderId, error);
      }
    }

    return {
      success: failCount === 0,
      successCount,
      failCount,
      deletedIds,
      failedIds
    };
  }

  /**
   * 根据索引获取订单
   * @param {number} index - 订单索引
   * @returns {Object|null} 订单对象
   */
  getOrderByIndex(index) {
    const orders = this.getOrders();
    if (index >= 0 && index < orders.length) {
      return orders[index];
    }
    return null;
  }

  /**
   * 根据ID获取订单
   * @param {number|string} orderId - 订单ID
   * @returns {Object|null} 订单对象
   */
  getOrderById(orderId) {
    const orders = this.getOrders();
    return orders.find(o => o.id === orderId) || null;
  }

  /**
   * 获取订单状态列表（用于筛选）
   * @returns {Array<string>} 状态列表
   */
  getOrderStatuses() {
    const orders = this.getOrders();
    const statuses = new Set();

    orders.forEach(o => {
      const status = o.status || '已创建';
      statuses.add(status);
    });

    return Array.from(statuses).sort();
  }

  /**
   * 根据订单获取其原始索引
   * @param {Object} order - 订单对象
   * @returns {number} 索引，未找到返回 -1
   */
  getOrderIndex(order) {
    const orders = this.getOrders();
    return orders.indexOf(order);
  }
}

/**
 * 创建订单服务实例
 * @param {Object} options - 选项
 * @param {StateManager} options.stateManager - 状态管理器
 * @param {Object} options.apiService - API服务
 * @returns {OrderService} 订单服务实例
 */
export function createOrderService(options) {
  return new OrderService(options);
}

