/**
 * 过滤器注册表（Filter Registry）
 * 管理和注册所有可用的过滤器
 */

export class FilterRegistry {
  static filters = new Map();

  /**
   * 注册过滤器
   * @param {string} name - 过滤器名称
   * @param {Function} filter - 过滤器函数
   */
  static register(name, filter) {
    if (typeof filter !== 'function') {
      throw new TypeError('过滤器必须是函数');
    }
    this.filters.set(name, filter);
  }

  /**
   * 获取过滤器
   * @param {string} name - 过滤器名称
   * @returns {Function|null} 过滤器函数
   */
  static get(name) {
    return this.filters.get(name) || null;
  }

  /**
   * 检查过滤器是否存在
   * @param {string} name - 过滤器名称
   * @returns {boolean}
   */
  static has(name) {
    return this.filters.has(name);
  }

  /**
   * 应用过滤器
   * @param {any} value - 要过滤的值
   * @param {string} name - 过滤器名称
   * @param {Array} params - 过滤器参数
   * @returns {any} 过滤后的值
   */
  static apply(value, name, params = []) {
    const filter = this.get(name);
    if (!filter) {
      throw new Error(`过滤器未找到: ${name}`);
    }
    return filter(value, ...params);
  }

  /**
   * 注册内置过滤器
   */
  static registerBuiltinFilters() {
    // format: 格式化数字
    this.register('format', (value, decimals = 2) => {
      const num = Number(value);
      if (isNaN(num)) return value;
      return num.toFixed(parseInt(decimals));
    });

    // currency: 货币格式
    this.register('currency', (value, currency = 'USD') => {
      const num = Number(value);
      if (isNaN(num)) return value;
      return `${currency}${num.toFixed(2)}`;
    });

    // date: 日期格式
    this.register('date', (value, format = 'YYYY-MM-DD') => {
      if (!value) return '';
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day);
    });

    // upper: 转大写
    this.register('upper', (value) => {
      return String(value).toUpperCase();
    });

    // lower: 转小写
    this.register('lower', (value) => {
      return String(value).toLowerCase();
    });

    // default: 默认值
    this.register('default', (value, defaultValue = '') => {
      return value != null && value !== '' ? value : defaultValue;
    });

    // number: 转换为数字
    this.register('number', (value) => {
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    });

    // string: 转换为字符串
    this.register('string', (value) => {
      return String(value || '');
    });

    // trim: 去除首尾空格
    this.register('trim', (value) => {
      return String(value || '').trim();
    });
  }
}

// 自动注册内置过滤器
FilterRegistry.registerBuiltinFilters();

