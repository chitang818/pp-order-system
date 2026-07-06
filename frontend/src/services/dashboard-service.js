/**
 * 仪表盘服务
 * 提供仪表盘相关的数据获取功能
 * 
 * 已迁移到纯 Rust 后端：所有 API 调用都通过 Tauri Commands
 */

import { apiClient } from '../core/api-client.js';

// 缓存配置（优化：不同数据类型使用不同的缓存时长）
const CACHE_DURATION = {
  stats: 5 * 60 * 1000, // 统计数据：5分钟
  trends: 10 * 60 * 1000, // 趋势数据：10分钟（变化较慢）
  distribution: 10 * 60 * 1000, // 分布数据：10分钟
  ranking: 10 * 60 * 1000, // 排行数据：10分钟
  comparison: 15 * 60 * 1000, // 对比数据：15分钟（变化最慢）
  realtime: 1 * 60 * 1000, // 实时数据：1分钟（提醒等）
  default: 5 * 60 * 1000 // 默认：5分钟
};
const CACHE_KEY_PREFIX = 'dashboard_cache_';

export class DashboardService {
  constructor(options = {}) {
    // 内存缓存
    this.memoryCache = new Map();

    // 保留 apiService 引用以保持向后兼容（但不再使用其 json 方法）
    this.apiService = options.apiService || null;
  }

  /**
   * 获取缓存键
   */
  _getCacheKey(endpoint) {
    return `${CACHE_KEY_PREFIX}${endpoint}`;
  }

  /**
   * 获取缓存时长（根据数据类型）
   */
  _getCacheDuration(key) {
    // 从key中提取数据类型
    if (key.includes('stats')) return CACHE_DURATION.stats;
    if (key.includes('trends')) return CACHE_DURATION.trends;
    if (key.includes('distribution')) return CACHE_DURATION.distribution;
    if (key.includes('ranking')) return CACHE_DURATION.ranking;
    if (key.includes('comparison')) return CACHE_DURATION.comparison;
    if (key.includes('realtime') || key.includes('activities') || key.includes('reminders')) {
      return CACHE_DURATION.realtime;
    }
    return CACHE_DURATION.default;
  }

  /**
   * 从缓存获取数据（优化：根据数据类型使用不同的缓存时长）
   */
  _getFromCache(key) {
    try {
      const cacheDuration = this._getCacheDuration(key);
      
      // 先检查内存缓存
      const memoryCache = this.memoryCache.get(key);
      if (memoryCache && Date.now() - memoryCache.timestamp < cacheDuration) {
        return memoryCache.data;
      }

      // 检查 localStorage
      const cached = localStorage.getItem(key);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < cacheDuration) {
          // 更新内存缓存
          this.memoryCache.set(key, { data, timestamp });
          return data;
        } else {
          // 缓存过期，清除
          localStorage.removeItem(key);
          this.memoryCache.delete(key);
        }
      }
    } catch (error) {
      console.warn('[DashboardService] 读取缓存失败:', error);
    }
    return null;
  }

  /**
   * 保存数据到缓存
   */
  _saveToCache(key, data) {
    try {
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      // 保存到内存缓存
      this.memoryCache.set(key, cacheData);
      // 保存到 localStorage
      localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('[DashboardService] 保存缓存失败:', error);
    }
  }

  /**
   * 清除所有仪表盘相关的缓存
   */
  clearCache() {
    console.log('[DashboardService] 正在清理仪表盘缓存...');
    this.memoryCache.clear();
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`[DashboardService] 已清理 ${keysToRemove.length} 条缓存记录`);
    return keysToRemove.length;
  }

  /**
   * 带重试的 Tauri Command 调用
   */
  async _invokeWithRetry(command, payload = {}, retries = 2) {
    console.log(`[DashboardService] 调用指令: ${command}`, payload);
    for (let i = 0; i <= retries; i++) {
      try {
        const fallbackOptions = this._getHttpFallbackOptions(command, payload);
        const response = await apiClient.invoke(command, payload, fallbackOptions);
        console.log(`[DashboardService] 指令 ${command} 响应成功:`, response);
        return response;
      } catch (error) {
        console.error(`[DashboardService] 指令 ${command} 调用失败 (第 ${i + 1} 次):`, error);
        if (i === retries) {
          throw error;
        }
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  /**
   * 浏览器开发模式下的 HTTP fallback 映射
   * - Tauri 模式会优先走 invoke，不会用到这些配置
   * - Web 模式必须提供这些配置，否则会报“不在 Tauri 环境且未启用 HTTP fallback”
   */
  _getHttpFallbackOptions(command, payload = {}) {
    // 统一默认：允许 HTTP fallback
    const base = { fallbackToHttp: true, httpMethod: 'GET', httpPath: '' };

    // 仪表盘
    if (command === 'dashboard_stats') {
      return { ...base, httpPath: '/api/dashboard/stats' };
    }
    if (command === 'dashboard_trends') {
      const days = payload?.days ?? 30;
      return { ...base, httpPath: `/api/dashboard/trends?days=${encodeURIComponent(days)}` };
    }
    if (command === 'dashboard_status_distribution') {
      return { ...base, httpPath: '/api/dashboard/status-distribution' };
    }
    if (command === 'dashboard_customer_ranking') {
      const limit = payload?.limit ?? 10;
      return { ...base, httpPath: `/api/dashboard/customer-ranking?limit=${encodeURIComponent(limit)}` };
    }
    if (command === 'dashboard_monthly_comparison') {
      const months = payload?.months ?? 6;
      return { ...base, httpPath: `/api/dashboard/monthly-comparison?months=${encodeURIComponent(months)}` };
    }
    if (command === 'dashboard_yearly_comparison') {
      const years = payload?.years ?? 5;
      return { ...base, httpPath: `/api/dashboard/yearly-comparison?years=${encodeURIComponent(years)}` };
    }
    if (command === 'dashboard_recent_activities') {
      return { ...base, httpPath: '/api/dashboard/recent-activities' };
    }
    if (command === 'dashboard_destination_distribution') {
      return { ...base, httpPath: '/api/dashboard/destination-distribution' };
    }
    if (command === 'dashboard_product_quantity_ranking') {
      const limit = payload?.limit ?? 10;
      return { ...base, httpPath: `/api/dashboard/product-quantity-ranking?limit=${encodeURIComponent(limit)}` };
    }
    if (command === 'dashboard_box_type_stats') {
      const limit = payload?.limit ?? 10;
      return { ...base, httpPath: `/api/dashboard/box-type-stats?limit=${encodeURIComponent(limit)}` };
    }
    if (command === 'dashboard_batch') {
      // 后端 HTTP 接口：GET /api/dashboard/batch?include=...&trendsDays=...&rankingLimit=...
      // 注意：此处把 snake_case 参数转换为后端期望的 camelCase query
      const include = Array.isArray(payload?.include) ? payload.include : [];
      const qs = new URLSearchParams();
      if (include.length > 0) qs.set('include', include.join(','));
      if (payload?.trends_days != null) qs.set('trendsDays', String(payload.trends_days));
      if (payload?.ranking_limit != null) qs.set('rankingLimit', String(payload.ranking_limit));
      if (payload?.comparison_months != null) qs.set('comparisonMonths', String(payload.comparison_months));
      if (payload?.yearly_comparison_years != null) qs.set('yearlyComparisonYears', String(payload.yearly_comparison_years));
      if (payload?.product_ranking_limit != null) qs.set('productRankingLimit', String(payload.product_ranking_limit));
      if (payload?.box_type_stats_limit != null) qs.set('boxTypeStatsLimit', String(payload.box_type_stats_limit));
      const suffix = qs.toString();
      return { ...base, httpPath: suffix ? `/api/dashboard/batch?${suffix}` : '/api/dashboard/batch' };
    }

    // 提醒（发货/收款）
    if (command === 'reminders_get_shipment_settings') {
      return { ...base, httpPath: '/api/reminders/shipment-reminder-settings' };
    }
    if (command === 'reminders_save_shipment_settings') {
      // 后端 POST body 期望：{ advanceDays }
      // Tauri 侧参数名为 payload 时，invoke 体为 { payload: { advance_days } }
      const inner = payload?.payload ?? payload;
      const advanceDays = inner?.advance_days ?? inner?.advanceDays ?? 5;
      return {
        fallbackToHttp: true,
        httpPath: '/api/reminders/shipment-reminder-settings',
        httpMethod: 'POST',
        body: { advanceDays }
      };
    }
    if (command === 'reminders_get_shipment_list') {
      const inner = payload?.payload ?? payload;
      const advanceDays = inner?.advance_days ?? inner?.advanceDays ?? 5;
      const limit = inner?.limit ?? 5;
      return {
        ...base,
        httpPath: `/api/reminders/shipment-reminders?advanceDays=${encodeURIComponent(advanceDays)}&limit=${encodeURIComponent(limit)}`
      };
    }
    if (command === 'reminders_get_payment_list') {
      const inner = payload?.payload ?? payload;
      const limit = inner?.limit ?? 5;
      return { ...base, httpPath: `/api/reminders/payment-reminders?limit=${encodeURIComponent(limit)}` };
    }

    // 未识别命令：不启用 fallback（避免误打到不存在的 HTTP 路由）
    return {};
  }

  /**
   * 批量获取仪表盘数据（优化性能）
   * @param {Array<string>} include - 要包含的数据类型 ['stats', 'trends', ...]
   * @param {Object} options - 选项
   * @param {boolean} options.useCache - 是否使用缓存
   * @param {number} options.trendsDays - 趋势数据天数
   * @param {number} options.rankingLimit - 排行数据限制
   * @returns {Promise<Object>} 批量数据
   */
  async getBatchData(include = [], options = {}) {
    const {
      useCache = true,
      trendsDays = 30,
      rankingLimit = 10,
      comparisonMonths = 6,
      yearlyComparisonYears = 5,
      productRankingLimit = 5,
      boxTypeStatsLimit = 5
    } = options;

    if (!useCache) {
      this.clearCache();
    }

    const cacheKey = this._getCacheKey(`batch_${include.join(',')}_${JSON.stringify(options)}`);
    console.log(`[DashboardService] getBatchData 开始, include:`, include, "useCache:", useCache, "cacheKey:", cacheKey);

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) {
        console.log(`[DashboardService] getBatchData 缓存命中:`, cached);
        // 增加数据结构校验，防止损坏的缓存导致崩溃
        if (cached && typeof cached === 'object') {
          // 检查缓存数据是否包含请求的所有字段
          const missingFields = include.filter(field => {
            // 将 camelCase 字段名映射到缓存中的键名
            const keyMap = {
              'yearlyComparison': 'yearlyComparison',
              'destinationDistribution': 'destinationDistribution',
              'productRanking': 'productRanking',
              'boxTypeStats': 'boxTypeStats'
            };
            const cacheKey = keyMap[field] || field;
            return cached[cacheKey] === undefined;
          });
          
          if (missingFields.length === 0) {
            return cached;
          }
          console.warn(`[DashboardService] 缓存数据不完整，缺少字段:`, missingFields, '将重新获取');
        } else {
          console.warn(`[DashboardService] 缓存数据格式异常，将重新获取`);
        }
      }
      console.log(`[DashboardService] getBatchData 缓存未命中或不完整`);
    }

    try {
      // Rust 后端不需要 token，参数使用 snake_case
      const response = await this._invokeWithRetry('dashboard_batch', {
        include: include.length > 0 ? include : [],
        trends_days: trendsDays,
        ranking_limit: rankingLimit,
        comparison_months: comparisonMonths,
        yearly_comparison_years: yearlyComparisonYears,
        product_ranking_limit: productRankingLimit,
        box_type_stats_limit: boxTypeStatsLimit
      }, 0); // Disable retry for batch data, fail fast to fallback

      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 批量获取数据失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) {
          console.warn(`[DashboardService] 批量获取数据失败，降级使用过期缓存`);
          return cached;
        }
      }
      throw error;
    }
  }

  /**
   * 获取统计数据
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<Object>} 统计数据
   */
  async getStats(useCache = true) {
    const cacheKey = this._getCacheKey('stats');

    // 优先消费 main.js 启动时并行预取的 stats（零 IPC 开销）
    if (useCache && window.__prefetchedStats) {
      const prefetched = window.__prefetchedStats;
      window.__prefetchedStats = null;
      this._saveToCache(cacheKey, prefetched);
      return prefetched;
    }

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const response = await this._invokeWithRetry('dashboard_stats', {});
      // 保存到缓存
      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取统计数据失败:', error);
      // 如果请求失败，尝试返回缓存数据
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) {
          console.warn('[DashboardService] 使用缓存数据');
          return cached;
        }
      }
      throw error;
    }
  }

  /**
   * 获取趋势数据
   * @param {number} days - 天数（7/30/90）
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<Object>} 趋势数据
   */
  async getTrends(days = 30, useCache = true) {
    const cacheKey = this._getCacheKey(`trends_${days}`);

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const response = await this._invokeWithRetry('dashboard_trends', { days });
      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取趋势数据失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取订单状态分布
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<Object>} 状态分布数据
   */
  async getStatusDistribution(useCache = true) {
    const cacheKey = this._getCacheKey('status_distribution');

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('dashboard_status_distribution', {});
      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取状态分布失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取客户交易排行
   * @param {number} limit - 返回数量（默认10）
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<Array>} 客户排行数据
   */
  async getCustomerRanking(limit = 10, useCache = true) {
    const cacheKey = this._getCacheKey(`customer_ranking_${limit}`);

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('dashboard_customer_ranking', { limit });
      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取客户排行失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取月度对比数据
   * @param {number} months - 月数（默认6）
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<Object>} 月度对比数据
   */
  async getMonthlyComparison(months = 6, useCache = true) {
    const cacheKey = this._getCacheKey(`monthly_comparison_${months}`);

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('dashboard_monthly_comparison', { months });
      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取月度对比失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取年度对比数据
   * @param {number} years - 年数（默认5）
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<Object>} 年度对比数据
   */
  async getYearlyComparison(years = 5, useCache = true) {
    const cacheKey = this._getCacheKey(`yearly_comparison_${years}`);

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('dashboard_yearly_comparison', { years });
      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取年度对比失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取最近操作记录
   * @param {boolean} useCache - 是否使用缓存（默认false，因为需要实时数据）
   * @returns {Promise<Object>} 最近操作数据
   */
  async getRecentActivities(useCache = false) {
    const cacheKey = this._getCacheKey('recent_activities');

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('dashboard_recent_activities', {});
      // 最近操作缓存时间较短（1分钟）
      if (useCache) {
        this._saveToCache(cacheKey, response);
      }
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取最近操作失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取发货提醒列表
   * @param {number} advanceDays - 提前天数（默认5）
   * @param {number} limit - 返回数量（默认5）
   * @param {boolean} useCache - 是否使用缓存（默认false，提醒需要实时数据）
   * @returns {Promise<Object>} 发货提醒数据
   */
  async getShipmentReminders(advanceDays = 5, limit = 5, useCache = false) {
    const cacheKey = this._getCacheKey(`shipment_reminders_${advanceDays}_${limit}`);

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('reminders_get_shipment_list', {
        payload: { advance_days: advanceDays, limit }
      });
      // 提醒数据缓存时间较短（30秒）
      if (useCache) {
        this._saveToCache(cacheKey, response);
      }
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取发货提醒失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取收款提醒列表
   * @param {number} limit - 返回数量（默认5）
   * @param {boolean} useCache - 是否使用缓存（默认false，提醒需要实时数据）
   * @returns {Promise<Object>} 收款提醒数据
   */
  async getPaymentReminders(limit = 5, useCache = false) {
    const cacheKey = this._getCacheKey(`payment_reminders_${limit}`);

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('reminders_get_payment_list', {
        payload: { limit }
      });
      // 提醒数据缓存时间较短（30秒）
      if (useCache) {
        this._saveToCache(cacheKey, response);
      }
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取收款提醒失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取发货提醒设置
   * @returns {Promise<Object>} 设置数据
   */
  async getShipmentReminderSettings() {
    try {
      const response = await this._invokeWithRetry('reminders_get_shipment_settings', {});
      // Tauri/Rust 序列化为 snake_case 的 advance_days；Node HTTP 多为 advanceDays，需同时兼容
      const advanceDays = response?.advanceDays ?? response?.advance_days;
      const n = Number(advanceDays);
      return { advanceDays: Number.isFinite(n) && n >= 0 ? n : 5 };
    } catch (error) {
      console.error('[DashboardService] 获取发货提醒设置失败:', error);
      // 返回默认值
      return { advanceDays: 5 };
    }
  }

  /**
   * 保存发货提醒设置
   * @param {number} advanceDays - 提前天数
   * @returns {Promise<Object>} 保存结果
   */
  async saveShipmentReminderSettings(advanceDays) {
    try {
      const response = await this._invokeWithRetry('reminders_save_shipment_settings', {
        payload: { advance_days: advanceDays }
      });
      return response;
    } catch (error) {
      console.error('[DashboardService] 保存发货提醒设置失败:', error);
      throw error;
    }
  }

  /**
   * 获取目的港城市分布
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<Array>} 目的港分布数据
   */
  async getDestinationDistribution(useCache = true) {
    const cacheKey = this._getCacheKey('destination_distribution');

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('dashboard_destination_distribution', {});
      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取目的港分布失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取产品数量排名
   * @param {number} limit - 返回数量（默认10）
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<Array>} 产品数量排名数据
   */
  async getProductQuantityRanking(limit = 10, useCache = true) {
    const cacheKey = this._getCacheKey(`product_quantity_ranking_${limit}`);

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('dashboard_product_quantity_ranking', { limit });
      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取产品数量排名失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      throw error;
    }
  }

  /**
   * 获取箱型统计
   * @param {number} limit - 返回数量限制（默认10）
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<Array>} 箱型统计数据
   */
  async getBoxTypeStats(limit = 10, useCache = true) {
    const cacheKey = this._getCacheKey(`box_type_stats_${limit}`);

    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await this._invokeWithRetry('dashboard_box_type_stats', { limit });
      this._saveToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[DashboardService] 获取箱型统计失败:', error);
      if (useCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
      }
      // 返回空数组，避免页面报错
      return [];
    }
  }

  /**
   * 清除所有缓存
   */
  clearCache() {
    try {
      this.memoryCache.clear();
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_KEY_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('[DashboardService] 清除缓存失败:', error);
    }
  }
}
