/**
 * 统一存储管理工具类
 * ES6 模块化版本
 * 提供标准化的本地存储操作，包括错误处理和数据序列化
 */

export class StorageManager {
  /**
   * 存储键名常量
   */
  static KEYS = {
    ORDER_DRAFT: 'order_draft',
    CUSTOMER_CACHE: 'customer_cache',
    PRODUCT_CACHE: 'product_cache',
    USER_PREFERENCES: 'user_preferences',
    EXPORT_SETTINGS: 'export_settings',
    COMPANY_INFO: 'company_info'
  };
  
  /**
   * 设置存储项
   * @param {string} key - 存储键
   * @param {any} value - 存储值
   * @param {Object} options - 选项
   * @returns {boolean} - 是否成功
   */
  static set(key, value, options = {}) {
    try {
      const { expiry = null, compress = false } = options;
      
      const data = {
        value,
        timestamp: Date.now(),
        expiry: expiry ? Date.now() + expiry : null
      };
      
      let serialized = JSON.stringify(data);
      
      // 简单压缩（移除空格）
      if (compress) {
        serialized = serialized.replace(/\s+/g, '');
      }
      
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.error(`存储失败 [${key}]:`, error);
      window.NotificationSystem?.toast(`存储失败: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * 获取存储项
   * @param {string} key - 存储键
   * @param {any} defaultValue - 默认值
   * @returns {any} - 存储值或默认值
   */
  static get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      
      const data = JSON.parse(item);
      
      // 检查是否过期
      if (data.expiry && Date.now() > data.expiry) {
        this.remove(key);
        return defaultValue;
      }
      
      return data.value;
    } catch (error) {
      console.error(`读取存储失败 [${key}]:`, error);
      return defaultValue;
    }
  }
  
  /**
   * 移除存储项
   * @param {string} key - 存储键
   * @returns {boolean} - 是否成功
   */
  static remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`移除存储失败 [${key}]:`, error);
      return false;
    }
  }
  
  /**
   * 清空所有存储
   * @param {string[]} excludeKeys - 排除的键名
   * @returns {boolean} - 是否成功
   */
  static clear(excludeKeys = []) {
    try {
      const keysToRemove = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !excludeKeys.includes(key)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      return true;
    } catch (error) {
      console.error('清空存储失败:', error);
      return false;
    }
  }
  
  /**
   * 获取存储使用情况
   * @returns {Object} - 存储统计信息
   */
  static getStorageInfo() {
    try {
      let totalSize = 0;
      const items = {};
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        const size = new Blob([value]).size;
        
        items[key] = {
          size,
          sizeFormatted: this.formatBytes(size)
        };
        totalSize += size;
      }
      
      return {
        totalSize,
        totalSizeFormatted: this.formatBytes(totalSize),
        itemCount: localStorage.length,
        items
      };
    } catch (error) {
      console.error('获取存储信息失败:', error);
      return null;
    }
  }
  
  /**
   * 格式化字节大小
   * @param {number} bytes - 字节数
   * @returns {string} - 格式化后的大小
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * 检查存储是否可用
   * @returns {boolean} - 是否可用
   */
  static isAvailable() {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 订单草稿相关方法
   */
  static OrderDraft = {
    save: (orderData) => {
      return StorageManager.set(StorageManager.KEYS.ORDER_DRAFT, orderData, {
        expiry: 24 * 60 * 60 * 1000 // 24小时过期
      });
    },
    
    load: () => {
      return StorageManager.get(StorageManager.KEYS.ORDER_DRAFT);
    },
    
    clear: () => {
      return StorageManager.remove(StorageManager.KEYS.ORDER_DRAFT);
    },
    
    exists: () => {
      return StorageManager.get(StorageManager.KEYS.ORDER_DRAFT) !== null;
    }
  };
  
  /**
   * 用户偏好设置相关方法
   */
  static UserPreferences = {
    save: (preferences) => {
      return StorageManager.set(StorageManager.KEYS.USER_PREFERENCES, preferences);
    },
    
    load: () => {
      return StorageManager.get(StorageManager.KEYS.USER_PREFERENCES, {
        theme: 'light',
        language: 'zh-CN',
        autoSave: true,
        exportFormat: 'pdf'
      });
    },
    
    update: (key, value) => {
      const current = StorageManager.UserPreferences.load();
      current[key] = value;
      return StorageManager.UserPreferences.save(current);
    }
  };
  
  /**
   * 缓存管理相关方法
   */
  static Cache = {
    setCustomers: (customers) => {
      return StorageManager.set(StorageManager.KEYS.CUSTOMER_CACHE, customers, {
        expiry: 30 * 60 * 1000 // 30分钟过期
      });
    },
    
    getCustomers: () => {
      return StorageManager.get(StorageManager.KEYS.CUSTOMER_CACHE, []);
    },
    
    setProducts: (products) => {
      return StorageManager.set(StorageManager.KEYS.PRODUCT_CACHE, products, {
        expiry: 30 * 60 * 1000 // 30分钟过期
      });
    },
    
    getProducts: () => {
      return StorageManager.get(StorageManager.KEYS.PRODUCT_CACHE, []);
    },
    
    clearAll: () => {
      StorageManager.remove(StorageManager.KEYS.CUSTOMER_CACHE);
      StorageManager.remove(StorageManager.KEYS.PRODUCT_CACHE);
    }
  };
}

// 默认导出类
export default StorageManager;

// 命名导出 StorageService（兼容旧代码）
export const StorageService = {
  // 兼容旧的方法名（set/get/remove）
  set: StorageManager.set,
  get: StorageManager.get,
  remove: StorageManager.remove,
  clear: StorageManager.clear,
  // 同时保留新方法名（save/load）
  save: StorageManager.set,
  load: StorageManager.get,
  // 添加更多兼容方法和属性
  keys: StorageManager.KEYS,
  OrderDraft: StorageManager.OrderDraft,
  Cache: StorageManager.Cache,
  UserPreferences: StorageManager.UserPreferences
};

// 导出到全局作用域（保持向后兼容）
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
  window.StorageService = StorageService;
}
