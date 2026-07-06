/**
 * 仪表盘服务
 * 提供仪表盘相关的统计数据
 */

const db = require('../db');
const { db: dbConnection } = require('../db/connection');
const { promisify } = require('util');

// 将回调函数转换为 Promise
const listOrdersAsync = promisify(db.listOrders);
const listCustomersAsync = promisify(db.listCustomers);
const dbAllAsync = promisify(dbConnection.all.bind(dbConnection));
const dbGetAsync = promisify(dbConnection.get.bind(dbConnection));

class DashboardService {
  /**
   * 规范化订单状态
   */
  static _normalizeStatus(status) {
    if (!status) return '已创建';
    const s = String(status).trim();
    if (['已创建', '已排产', '已发货', '已完成'].includes(s)) {
      return s;
    }
    // 兼容其他可能的表述
    if (s.includes('创建') || s.includes('新建')) return '已创建';
    if (s.includes('排产') || s.includes('生产')) return '已排产';
    if (s.includes('发货') || s.includes('运输')) return '已发货';
    if (s.includes('完成') || s.includes('结束')) return '已完成';
    return '已创建';
  }

  /**
   * 获取统计数据
   */
  static async getStats() {
    try {
      // 获取所有订单（不分页）
      const allOrders = await listOrdersAsync({});
      const orders = Array.isArray(allOrders) ? allOrders : (allOrders?.data || []);

      // 获取所有客户（不分页）
      const allCustomers = await listCustomersAsync({});
      const customers = Array.isArray(allCustomers) ? allCustomers : (allCustomers?.data || []);

      // 获取所有产品
      const products = await dbAllAsync('SELECT * FROM products', []);

      // 计算订单统计
      const totalOrders = orders.length;
      const pendingOrders = orders.filter(o => {
        const status = this._normalizeStatus(o.status);
        return status === '已创建' || status === '已排产';
      }).length;
      const shippedOrders = orders.filter(o => {
        const status = this._normalizeStatus(o.status);
        return status === '已发货';
      }).length;
      const completedOrders = orders.filter(o => {
        const status = this._normalizeStatus(o.status);
        return status === '已完成';
      }).length;
      const totalAmount = orders.reduce((sum, o) => sum + Number(o.totalUSD || 0), 0);

      // 计算本月数据（使用invoiceDate或createdAt）
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthStartStr = currentMonthStart.toISOString().split('T')[0];
      
      const monthlyNewOrders = orders.filter(o => {
        const dateStr = o.invoiceDate || o.createdAt || '';
        if (!dateStr) return false;
        // 提取日期部分（可能是 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm:ss'）
        const datePart = dateStr.split(' ')[0].split('T')[0];
        return datePart >= currentMonthStartStr;
      }).length;
      
      const monthlyAmount = orders
        .filter(o => {
          const dateStr = o.invoiceDate || o.createdAt || '';
          if (!dateStr) return false;
          const datePart = dateStr.split(' ')[0].split('T')[0];
          return datePart >= currentMonthStartStr;
        })
        .reduce((sum, o) => sum + Number(o.totalUSD || 0), 0);

      // 计算客户统计
      const totalCustomers = customers.length;
      const activeCustomers = customers.filter(c => Number(c.totalUSD || 0) > 0).length;
      const customerTotalAmount = customers.reduce((sum, c) => sum + Number(c.totalUSD || 0), 0);
      const monthlyNewCustomers = customers.filter(c => {
        // 假设客户创建时间在某个字段中，如果没有则使用id判断（简化处理）
        // 这里需要根据实际数据库结构调整
        return true; // 暂时返回true，后续可以根据实际字段调整
      }).length;

      // 计算产品统计
      const totalProducts = products.length;
      const monthlyNewProducts = 0; // 产品表可能没有创建时间字段，暂时为0

      // 计算单据统计（从操作日志中统计，暂时返回0）
      const monthlyDocuments = 0;

      return {
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          shipped: shippedOrders,
          completed: completedOrders,
          totalAmount: totalAmount,
          monthlyNew: monthlyNewOrders,
          monthlyAmount: monthlyAmount
        },
        customers: {
          total: totalCustomers,
          active: activeCustomers,
          totalAmount: customerTotalAmount,
          monthlyNew: monthlyNewCustomers
        },
        products: {
          total: totalProducts,
          monthlyNew: monthlyNewProducts
        },
        documents: {
          monthlyCount: monthlyDocuments
        }
      };
    } catch (error) {
      console.error('[DashboardService] 获取统计数据失败:', error);
      throw new Error('获取统计数据失败: ' + error.message);
    }
  }

  /**
   * 获取趋势数据
   * @param {number} days - 天数（7/30/90）
   */
  static async getTrends(days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // 查询指定日期范围内的订单
      // SQLite中日期可能是文本格式，使用strftime处理
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      const query = `
        SELECT 
          strftime('%Y-%m-%d', invoiceDate) as date,
          COUNT(*) as count,
          SUM(totalUSD) as amount
        FROM orders
        WHERE invoiceDate IS NOT NULL 
          AND invoiceDate != ''
          AND strftime('%Y-%m-%d', invoiceDate) >= ?
          AND strftime('%Y-%m-%d', invoiceDate) <= ?
        GROUP BY strftime('%Y-%m-%d', invoiceDate)
        ORDER BY strftime('%Y-%m-%d', invoiceDate) ASC
      `;

      const rows = await dbAllAsync(query, [startDateStr, endDateStr]);

      // 填充缺失的日期
      const orderCount = [];
      const orderAmount = [];
      const dateMap = {};

      rows.forEach(row => {
        const date = row.date;
        dateMap[date] = {
          count: row.count || 0,
          amount: Number(row.amount || 0)
        };
      });

      // 生成完整的日期序列
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const data = dateMap[dateStr] || { count: 0, amount: 0 };
        orderCount.push({
          date: dateStr,
          count: data.count
        });
        orderAmount.push({
          date: dateStr,
          amount: data.amount
        });
      }

      return {
        orderCount,
        orderAmount
      };
    } catch (error) {
      console.error('[DashboardService] 获取趋势数据失败:', error);
      throw new Error('获取趋势数据失败: ' + error.message);
    }
  }

  /**
   * 获取订单状态分布
   */
  static async getStatusDistribution() {
    try {
      const allOrders = await listOrdersAsync({});
      const orders = Array.isArray(allOrders) ? allOrders : (allOrders?.data || []);

      const distribution = {
        '已创建': 0,
        '已排产': 0,
        '已发货': 0,
        '已完成': 0
      };

      orders.forEach(order => {
        const status = this._normalizeStatus(order.status);
        if (distribution[status] !== undefined) {
          distribution[status]++;
        }
      });

      return distribution;
    } catch (error) {
      console.error('[DashboardService] 获取状态分布失败:', error);
      throw new Error('获取状态分布失败: ' + error.message);
    }
  }

  /**
   * 获取客户交易排行
   * @param {number} limit - 返回数量（默认10）
   */
  static async getCustomerRanking(limit = 10) {
    try {
      const allCustomers = await listCustomersAsync({});
      const customers = Array.isArray(allCustomers) ? allCustomers : (allCustomers?.data || []);

      // 按交易额排序
      const sorted = customers
        .filter(c => Number(c.totalUSD || 0) > 0)
        .sort((a, b) => Number(b.totalUSD || 0) - Number(a.totalUSD || 0))
        .slice(0, limit)
        .map(c => ({
          customerId: c.id,
          customerName: c.name || '-',
          totalAmount: Number(c.totalUSD || 0)
        }));

      return sorted;
    } catch (error) {
      console.error('[DashboardService] 获取客户排行失败:', error);
      throw new Error('获取客户排行失败: ' + error.message);
    }
  }

  /**
   * 获取月度对比数据
   * @param {number} months - 月数（默认6）
   */
  /**
   * 获取年度对比数据
   * @param {number} years - 年数（默认5年）
   * @returns {Promise<Object>} 年度对比数据
   */
  static async getYearlyComparison(years = 5) {
    try {
      const allOrders = await listOrdersAsync({});
      const orders = Array.isArray(allOrders) ? allOrders : (allOrders?.data || []);

      // 获取当前年份
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - years + 1;

      // 按年份分组统计
      const yearData = {};
      for (let year = startYear; year <= currentYear; year++) {
        yearData[year] = {
          orderCount: 0,
          orderAmount: 0
        };
      }

      // 统计每年的订单数量和金额
      orders.forEach(order => {
        if (!order.createdAt) return;
        
        const orderDate = new Date(order.createdAt);
        const orderYear = orderDate.getFullYear();
        
        if (orderYear >= startYear && orderYear <= currentYear) {
          if (!yearData[orderYear]) {
            yearData[orderYear] = {
              orderCount: 0,
              orderAmount: 0
            };
          }
          yearData[orderYear].orderCount++;
          yearData[orderYear].orderAmount += (order.totalUSD || 0);
        }
      });

      // 转换为数组格式
      const yearLabels = [];
      const orderCount = [];
      const orderAmount = [];

      for (let year = startYear; year <= currentYear; year++) {
        yearLabels.push(String(year));
        orderCount.push(yearData[year]?.orderCount || 0);
        orderAmount.push(yearData[year]?.orderAmount || 0);
      }

      return {
        years: yearLabels,
        orderCount,
        orderAmount
      };
    } catch (error) {
      console.error('[DashboardService] 获取年度对比失败:', error);
      throw error;
    }
  }

  static async getMonthlyComparison(months = 6) {
    try {
      const now = new Date();
      const monthsData = [];

      for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const monthStr = `${year}-${month}`;

        // 查询该月的订单
        const query = `
          SELECT 
            COUNT(*) as count,
            SUM(totalUSD) as amount
          FROM orders
          WHERE invoiceDate IS NOT NULL
            AND invoiceDate != ''
            AND strftime('%Y-%m', invoiceDate) = ?
        `;

        const row = await dbGetAsync(query, [monthStr]);

        monthsData.push({
          month: monthStr,
          count: row?.count || 0,
          amount: Number(row?.amount || 0)
        });
      }

      return {
        months: monthsData.map(m => m.month),
        orderCount: monthsData.map(m => m.count),
        orderAmount: monthsData.map(m => m.amount)
      };
    } catch (error) {
      console.error('[DashboardService] 获取月度对比失败:', error);
      throw new Error('获取月度对比失败: ' + error.message);
    }
  }

  /**
   * 获取最近操作记录
   */
  static async getRecentActivities() {
    try {
      // 从操作日志中获取最近5条订单操作（创建或更新）
      const recentOrderOperationsQuery = `
        SELECT 
          ol.id,
          ol.target as contractNo,
          ol.operation,
          ol.createdAt,
          ol.target
        FROM operation_logs ol
        WHERE ol.module = '订单管理' 
          AND ol.operation IN ('创建订单', '更新订单')
          AND ol.status = 'success'
          AND ol.target IS NOT NULL
          AND ol.target != ''
        ORDER BY ol.createdAt DESC
        LIMIT 5
      `;
      const recentOrderOperations = await dbAllAsync(recentOrderOperationsQuery, []);

      // 获取最近5个客户（客户表可能没有createdAt，使用id降序）
      const recentCustomersQuery = `
        SELECT 
          COALESCE(id, rowid) AS id,
          name
        FROM customers
        ORDER BY COALESCE(id, rowid) DESC
        LIMIT 5
      `;
      const recentCustomers = await dbAllAsync(recentCustomersQuery, []);

      // 获取最近单据（从操作日志中，暂时返回空数组）
      const recentDocuments = [];

      return {
        orders: recentOrderOperations.map(o => ({
          contractNo: o.contractNo || o.target || '-',
          operation: o.operation === '创建订单' ? '新建' : '编辑',
          createdAt: o.createdAt || ''
        })),
        customers: recentCustomers.map(c => ({
          id: c.id,
          name: c.name || '-',
          createdAt: '' // 客户表可能没有createdAt字段
        })),
        documents: recentDocuments
      };
    } catch (error) {
      console.error('[DashboardService] 获取最近操作失败:', error);
      throw new Error('获取最近操作失败: ' + error.message);
    }
  }

  /**
   * 获取目的港城市分布统计
   */
  static async getDestinationDistribution() {
    try {
      const query = `
        SELECT 
          o.shipTo as destination,
          COUNT(*) as orderCount,
          SUM(o.totalUSD) as totalAmount
        FROM orders o
        WHERE o.shipTo IS NOT NULL 
          AND o.shipTo != ''
          AND (o.deletedAt IS NULL OR o.deletedAt = '')
        GROUP BY o.shipTo
        ORDER BY orderCount DESC, totalAmount DESC
      `;
      
      const results = await dbAllAsync(query, []);
      
      // 处理目的港数据，提取城市名（如果有逗号，取逗号前的部分）
      const distribution = (results || []).map(item => {
        const destination = item.destination || '';
        // 提取城市名（取逗号前的部分，如果没有逗号则使用整个字符串）
        const city = destination.includes(',') 
          ? destination.split(',')[0].trim() 
          : destination.trim();
        
        return {
          destination: destination,
          city: city,
          orderCount: item.orderCount || 0,
          totalAmount: item.totalAmount || 0
        };
      });
      
      return distribution;
    } catch (error) {
      console.error('[DashboardService] 获取目的港分布失败:', error);
      throw error;
    }
  }

  /**
   * 获取产品数量排名（前10名）
   */
  static async getProductQuantityRanking(limit = 10) {
    try {
      // 如果amount为NULL或0，则使用unitPrice * quantity来计算
      const query = `
        SELECT 
          oi.model as productModel,
          SUM(oi.quantity) as totalQuantity,
          SUM(CASE 
            WHEN oi.amount IS NOT NULL AND oi.amount != 0 THEN oi.amount
            WHEN oi.unitPrice IS NOT NULL AND oi.quantity IS NOT NULL THEN oi.unitPrice * oi.quantity
            ELSE 0
          END) as totalAmount,
          COUNT(DISTINCT oi.orderId) as orderCount
        FROM order_items oi
        INNER JOIN orders o ON oi.orderId = COALESCE(o.id, o.rowid)
        WHERE oi.model IS NOT NULL 
          AND oi.model != ''
          AND oi.quantity IS NOT NULL
          AND oi.quantity > 0
          AND (o.deletedAt IS NULL OR o.deletedAt = '')
        GROUP BY oi.model
        ORDER BY totalQuantity DESC
        LIMIT ?
      `;
      
      const results = await dbAllAsync(query, [limit]);
      
      console.log('[DashboardService] 产品数量排名查询结果:', JSON.stringify(results, null, 2));
      
      const mappedResults = (results || []).map(item => {
        const totalAmount = Number(item.totalAmount || 0);
        console.log(`[DashboardService] 产品 ${item.productModel}: 数量=${item.totalQuantity}, 金额=${totalAmount}, 订单数=${item.orderCount}`);
        return {
          model: item.productModel || '',
          totalQuantity: Number(item.totalQuantity || 0),
          totalAmount: totalAmount,
          orderCount: Number(item.orderCount || 0)
        };
      });
      
      return mappedResults;
    } catch (error) {
      console.error('[DashboardService] 获取产品数量排名失败:', error);
      throw error;
    }
  }

  /**
   * 获取箱型统计（前N名）
   * @param {number} limit - 返回数量（默认10）
   */
  static async getBoxTypeStats(limit = 10) {
    try {
      // 直接从数据库查询订单的extras字段，然后在内存中处理
      // 因为extras是JSON字符串，SQLite的json_extract可能不可用
      const query = `
        SELECT 
          COALESCE(id, rowid) AS id,
          extras,
          deletedAt
        FROM orders
        WHERE deletedAt IS NULL OR deletedAt = ''
      `;
      
      const orderRows = await dbAllAsync(query, []);
      
      const boxTypeMap = new Map();
      
      console.log(`[DashboardService] 查询到 ${orderRows ? orderRows.length : 0} 条订单，开始统计箱型`);
      
      // 遍历所有订单，统计箱型
      let processedCount = 0;
      let boxTypeFoundCount = 0;
      
      for (const row of orderRows || []) {
        processedCount++;
        if (!row.extras) {
          continue;
        }
        
        let boxType;
        // extras在数据库中存储为JSON字符串
        if (typeof row.extras === 'string') {
          try {
            const extras = JSON.parse(row.extras);
            boxType = extras?.boxType;
          } catch (e) {
            // JSON解析失败，跳过这个订单
            continue;
          }
        } else if (typeof row.extras === 'object' && row.extras !== null) {
          boxType = row.extras.boxType;
        } else {
          continue;
        }
        
        // 过滤无效的boxType值
        if (!boxType || boxType === '' || boxType === 'null' || boxType === null || boxType === undefined) {
          continue;
        }
        
        boxTypeFoundCount++;
        
        // 初始化或更新统计
        if (!boxTypeMap.has(boxType)) {
          boxTypeMap.set(boxType, {
            boxType: String(boxType),
            orderCount: 0,
            totalQuantity: 0,
            totalAmount: 0
          });
        }
        
        const stats = boxTypeMap.get(boxType);
        stats.orderCount++;
        
        // 计算总数量和总金额（从order_items表查询）
        // 如果amount为NULL或0，则使用unitPrice * quantity来计算
        try {
          const itemsQuery = `
            SELECT 
              SUM(COALESCE(quantity, 0)) as totalQty, 
              SUM(CASE 
                WHEN amount IS NOT NULL AND amount != 0 THEN amount
                WHEN unitPrice IS NOT NULL AND quantity IS NOT NULL THEN unitPrice * quantity
                ELSE 0
              END) as totalAmt
            FROM order_items
            WHERE orderId = ?
          `;
          const itemRow = await dbGetAsync(itemsQuery, [row.id]);
          if (itemRow) {
            stats.totalQuantity += Number(itemRow.totalQty || 0);
            stats.totalAmount += Number(itemRow.totalAmt || 0);
          }
        } catch (itemError) {
          console.warn(`[DashboardService] 查询订单 ${row.id} 的数量和金额失败:`, itemError);
        }
      }
      
      // 转换为数组并排序
      const sorted = Array.from(boxTypeMap.values())
        .sort((a, b) => {
          // 先按订单数排序，再按数量排序
          if (b.orderCount !== a.orderCount) {
            return b.orderCount - a.orderCount;
          }
          return b.totalQuantity - a.totalQuantity;
        })
        .slice(0, limit);
      
      console.log(`[DashboardService] 箱型统计完成:`);
      console.log(`  - 处理订单数: ${processedCount}`);
      console.log(`  - 找到有箱型的订单数: ${boxTypeFoundCount}`);
      console.log(`  - 箱型种类数: ${boxTypeMap.size}`);
      console.log(`  - 返回前 ${sorted.length} 名:`, sorted.map(s => `${s.boxType}(${s.orderCount}个,${s.totalAmount}USD)`).join(', '));
      sorted.forEach(s => {
        console.log(`  - ${s.boxType}: 订单数=${s.orderCount}, 数量=${s.totalQuantity}, 金额=${s.totalAmount}`);
      });
      
      return sorted;
    } catch (error) {
      console.error('[DashboardService] 获取箱型统计失败:', error);
      throw error;
    }
  }
}

module.exports = DashboardService;

