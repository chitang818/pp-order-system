/**
 * 前端数据缓存机制
 * ES6 模块化版本
 */

'use strict';

// 缓存配置
const CACHE_CONFIG = {
  // 缓存过期时间（毫秒）
  CUSTOMERS_TTL: 5 * 60 * 1000,    // 客户数据：5分钟
  ORDERS_TTL: 2 * 60 * 1000,       // 订单数据：2分钟
  COMPANY_TTL: 10 * 60 * 1000,     // 公司信息：10分钟
  PRODUCTS_TTL: 3 * 60 * 1000,     // 产品数据：3分钟
  
  // 缓存键名前缀
  PREFIX: 'erp_cache_',
  
  // 最大缓存条目数
  MAX_ENTRIES: 100
};

// 内存缓存存储
const memoryCache = new Map();

/**
 * 缓存项结构：{ data, timestamp, ttl }
 */
class CacheItem {
  constructor(data, ttl) {
    this.data = data;
    this.timestamp = Date.now();
    this.ttl = ttl;
  }
  
  /**
   * 检查缓存项是否过期
   * @returns {boolean} - 是否过期
   */
  isExpired() {
    return Date.now() - this.timestamp > this.ttl;
  }
}

/**
 * 缓存管理器
 */
class CacheManager {
  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // 每分钟清理一次
  }
  
  /**
   * 生成缓存键
   * @param {string} type - 缓存类型
   * @param {string} params - 参数
   * @returns {string} - 缓存键
   */
  generateKey(type, params = '') {
    return `${CACHE_CONFIG.PREFIX}${type}_${params}`;
  }
  
  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {*} data - 缓存数据
   * @param {number} ttl - 过期时间（毫秒）
   */
  set(key, data, ttl) {
    // 检查缓存大小限制
    if (memoryCache.size >= CACHE_CONFIG.MAX_ENTRIES) {
      this.cleanup();
    }
    
    const item = new CacheItem(data, ttl);
    memoryCache.set(key, item);
    
    // 同时存储到localStorage作为持久化缓存（仅关键数据）
    if (key.includes('customers') || key.includes('company')) {
      try {
        localStorage.setItem(key, JSON.stringify({
          data: data,
          timestamp: item.timestamp,
          ttl: ttl
        }));
      } catch (e) {
        // localStorage空间不足时，忽略错误
      }
    }
  }
  
  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {*} - 缓存数据，如果不存在或已过期则返回 null
   */
  get(key) {
    // 首先从内存缓存获取
    let item = memoryCache.get(key);
    
    // 如果内存中没有，尝试从localStorage恢复
    if (!item) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          item = new CacheItem(parsed.data, parsed.ttl);
          item.timestamp = parsed.timestamp;
          
          // 恢复到内存缓存
          if (!item.isExpired()) {
            memoryCache.set(key, item);
          }
        }
      } catch (e) {
        // 解析失败，忽略
      }
    }
    
    if (!item || item.isExpired()) {
      this.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  /**
   * 删除缓存
   * @param {string} key - 缓存键
   */
  delete(key) {
    memoryCache.delete(key);
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
  
  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    const toDelete = [];
    
    for (const [key, item] of memoryCache.entries()) {
      if (item.isExpired()) {
        toDelete.push(key);
      }
    }
    
    toDelete.forEach(key => this.delete(key));
    
    // 清理localStorage中的过期项
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_CONFIG.PREFIX)) {
          try {
            const stored = JSON.parse(localStorage.getItem(key));
            if (stored && stored.timestamp && stored.ttl) {
              if (now - stored.timestamp > stored.ttl) {
                localStorage.removeItem(key);
              }
            }
          } catch (e) {
            localStorage.removeItem(key); // 删除损坏的缓存项
          }
        }
      });
    } catch (e) {}
  }
  
  /**
   * 清空所有缓存
   */
  clear() {
    memoryCache.clear();
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_CONFIG.PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {}
  }
  
  /**
   * 获取缓存统计信息
   * @returns {Object} - 统计信息
   */
  getStats() {
    return {
      memoryEntries: memoryCache.size,
      maxEntries: CACHE_CONFIG.MAX_ENTRIES
    };
  }
}

// 创建全局缓存管理器实例
const cacheManager = new CacheManager();

/**
 * 缓存装饰器函数
 * @param {Function} apiFunction - API 函数
 * @param {string} cacheKey - 缓存键
 * @param {number} ttl - 过期时间（毫秒）
 * @returns {Function} - 带缓存的函数
 */
function withCache(apiFunction, cacheKey, ttl) {
  return function(...args) {
    const key = cacheManager.generateKey(cacheKey, JSON.stringify(args));
    
    // 尝试从缓存获取
    const cached = cacheManager.get(key);
    if (cached !== null) {
      return Promise.resolve(cached);
    }
    
    // 缓存未命中，调用原始API
    return apiFunction.apply(this, args).then(result => {
      // 缓存结果
      if (result !== null && result !== undefined) {
        cacheManager.set(key, result, ttl);
      }
      return result;
    }).catch(error => {
      // API调用失败时，尝试返回过期的缓存数据作为降级方案
      const expiredKey = key + '_expired';
      const expiredCache = memoryCache.get(expiredKey);
      if (expiredCache) {
        console.warn('API调用失败，使用过期缓存数据:', error.message);
        return expiredCache.data;
      }
      throw error;
    });
  };
}

// CacheService 对象
export const CacheService = {
  manager: cacheManager,
  withCache: withCache,
  config: CACHE_CONFIG,
  
  // 便捷方法
  customers: {
    list: () => cacheManager.get(cacheManager.generateKey('customers', 'list')),
    set: (data) => cacheManager.set(cacheManager.generateKey('customers', 'list'), data, CACHE_CONFIG.CUSTOMERS_TTL),
    clear: () => cacheManager.delete(cacheManager.generateKey('customers', 'list'))
  },
  
  orders: {
    list: () => cacheManager.get(cacheManager.generateKey('orders', 'list')),
    set: (data) => cacheManager.set(cacheManager.generateKey('orders', 'list'), data, CACHE_CONFIG.ORDERS_TTL),
    clear: () => cacheManager.delete(cacheManager.generateKey('orders', 'list')),
    get: (id) => cacheManager.get(cacheManager.generateKey('orders', `get_${id}`)),
    setItem: (id, data) => cacheManager.set(cacheManager.generateKey('orders', `get_${id}`), data, CACHE_CONFIG.ORDERS_TTL)
  },
  
  company: {
    get: () => cacheManager.get(cacheManager.generateKey('company', 'info')),
    set: (data) => cacheManager.set(cacheManager.generateKey('company', 'info'), data, CACHE_CONFIG.COMPANY_TTL),
    clear: () => cacheManager.delete(cacheManager.generateKey('company', 'info'))
  },
  
  products: {
    search: (query) => cacheManager.get(cacheManager.generateKey('products', `search_${query}`)),
    setSearch: (query, data) => cacheManager.set(cacheManager.generateKey('products', `search_${query}`), data, CACHE_CONFIG.PRODUCTS_TTL),
    clearSearch: (query) => cacheManager.delete(cacheManager.generateKey('products', `search_${query}`))
  }
};

// 默认导出
export default CacheService;

// 导出到全局作用域（保持向后兼容）
window.CacheService = CacheService;

// 页面卸载时清理定时器
window.addEventListener('beforeunload', () => {
  if (cacheManager.cleanupInterval) {
    clearInterval(cacheManager.cleanupInterval);
  }
});
