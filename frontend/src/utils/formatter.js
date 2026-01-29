/**
 * 数据格式化工具类
 * ES6 模块化版本
 * 提供统一的数据格式化方法，确保显示一致性
 */

export class FormatterUtils {
  /**
   * 格式化货币
   * @param {number|string} amount - 金额
   * @param {Object} options - 格式化选项
   * @returns {string} - 格式化后的货币字符串
   */
  static formatCurrency(amount, options = {}) {
    const {
      currency = 'CNY',
      locale = 'zh-CN',
      minimumFractionDigits = 2,
      maximumFractionDigits = 2,
      showSymbol = true
    } = options;
    
    if (amount === null || amount === undefined || amount === '') {
      return showSymbol ? '¥0.00' : '0.00';
    }
    
    const num = Number(amount);
    if (isNaN(num)) {
      return showSymbol ? '¥0.00' : '0.00';
    }
    
    try {
      const formatter = new Intl.NumberFormat(locale, {
        style: showSymbol ? 'currency' : 'decimal',
        currency: currency,
        minimumFractionDigits,
        maximumFractionDigits
      });
      
      return formatter.format(num);
    } catch (error) {
      // 降级处理
      const fixed = num.toFixed(maximumFractionDigits);
      return showSymbol ? `¥${fixed}` : fixed;
    }
  }
  
  /**
   * 格式化数字
   * @param {number|string} value - 数值
   * @param {Object} options - 格式化选项
   * @returns {string} - 格式化后的数字字符串
   */
  static formatNumber(value, options = {}) {
    const {
      locale = 'zh-CN',
      minimumFractionDigits = 0,
      maximumFractionDigits = 2,
      useGrouping = true
    } = options;
    
    if (value === null || value === undefined || value === '') {
      return '0';
    }
    
    const num = Number(value);
    if (isNaN(num)) {
      return '0';
    }
    
    try {
      const formatter = new Intl.NumberFormat(locale, {
        minimumFractionDigits,
        maximumFractionDigits,
        useGrouping
      });
      
      return formatter.format(num);
    } catch (error) {
      return num.toFixed(maximumFractionDigits);
    }
  }
  
  /**
   * 格式化日期
   * @param {Date|string|number} date - 日期
   * @param {Object} options - 格式化选项
   * @returns {string} - 格式化后的日期字符串
   */
  static formatDate(date, options = {}) {
    const {
      format = 'YYYY-MM-DD',
      locale = 'zh-CN',
      includeTime = false
    } = options;
    
    if (!date) return '';
    
    let dateObj;
    if (date instanceof Date) {
      dateObj = date;
    } else {
      dateObj = new Date(date);
    }
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    try {
      if (format === 'relative') {
        return this.formatRelativeTime(dateObj);
      }
      
      const formatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      };
      
      if (includeTime) {
        formatOptions.hour = '2-digit';
        formatOptions.minute = '2-digit';
        formatOptions.second = '2-digit';
      }
      
      return new Intl.DateTimeFormat(locale, formatOptions).format(dateObj);
    } catch (error) {
      // 降级处理
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      
      let result = `${year}-${month}-${day}`;
      
      if (includeTime) {
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const seconds = String(dateObj.getSeconds()).padStart(2, '0');
        result += ` ${hours}:${minutes}:${seconds}`;
      }
      
      return result;
    }
  }
  
  /**
   * 格式化相对时间
   * @param {Date} date - 日期对象
   * @returns {string} - 相对时间字符串
   */
  static formatRelativeTime(date) {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    
    return this.formatDate(date);
  }
  
  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @param {number} decimals - 小数位数
   * @returns {string} - 格式化后的文件大小
   */
  static formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  /**
   * 格式化百分比
   * @param {number} value - 数值(0-1 或 0-100)
   * @param {Object} options - 格式化选项
   * @returns {string} - 格式化后的百分比
   */
  static formatPercentage(value, options = {}) {
    const {
      decimals = 1,
      isDecimal = true // true: 0-1, false: 0-100
    } = options;
    
    if (value === null || value === undefined || isNaN(value)) {
      return '0%';
    }
    
    const percentage = isDecimal ? value * 100 : value;
    return `${percentage.toFixed(decimals)}%`;
  }
  
  /**
   * 格式化电话号码
   * @param {string} phone - 电话号码
   * @returns {string} - 格式化后的电话号码
   */
  static formatPhone(phone) {
    if (!phone) return '';
    
    // 移除所有非数字字符
    const cleaned = phone.replace(/\D/g, '');
    
    // 中国手机号格式化
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
    
    // 固定电话格式化
    if (cleaned.length >= 7) {
      if (cleaned.length === 7) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
      } else if (cleaned.length === 8) {
        return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
      } else if (cleaned.length >= 10) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
      }
    }
    
    return phone;
  }
  
  /**
   * 格式化地址
   * @param {string} address - 地址
   * @param {number} maxLength - 最大长度
   * @returns {string} - 格式化后的地址
   */
  static formatAddress(address, maxLength = 50) {
    if (!address) return '';
    
    const trimmed = address.trim();
    if (trimmed.length <= maxLength) {
      return trimmed;
    }
    
    return trimmed.slice(0, maxLength - 3) + '...';
  }
  
  /**
   * 格式化订单编号
   * @param {string|number} orderNumber - 订单编号
   * @param {string} prefix - 前缀
   * @returns {string} - 格式化后的订单编号
   */
  static formatOrderNumber(orderNumber, prefix = 'PP') {
    if (!orderNumber) return '';
    
    const str = String(orderNumber);
    if (str.startsWith(prefix)) {
      return str;
    }
    
    return `${prefix}${str.padStart(6, '0')}`;
  }
  
  /**
   * 格式化重量
   * @param {number|string} weight - 重量
   * @param {string} unit - 单位
   * @returns {string} - 格式化后的重量
   */
  static formatWeight(weight, unit = 'kg') {
    if (weight === null || weight === undefined || weight === '') {
      return '';
    }
    
    const num = Number(weight);
    if (isNaN(num)) {
      return '';
    }
    
    return `${this.formatNumber(num, { maximumFractionDigits: 3 })} ${unit}`;
  }
  
  /**
   * 截断文本
   * @param {string} text - 文本
   * @param {number} maxLength - 最大长度
   * @param {string} suffix - 后缀
   * @returns {string} - 截断后的文本
   */
  static truncateText(text, maxLength = 50, suffix = '...') {
    if (!text) return '';
    
    if (text.length <= maxLength) {
      return text;
    }
    
    return text.slice(0, maxLength - suffix.length) + suffix;
  }
  
  /**
   * 格式化状态
   * @param {string} status - 状态值
   * @param {Object} statusMap - 状态映射
   * @returns {string} - 格式化后的状态
   */
  static formatStatus(status, statusMap = {}) {
    const defaultMap = {
      'pending': '待处理',
      'processing': '处理中',
      'completed': '已完成',
      'cancelled': '已取消',
      'draft': '草稿',
      'active': '活跃',
      'inactive': '非活跃'
    };
    
    const map = { ...defaultMap, ...statusMap };
    return map[status] || status || '未知';
  }
}

// 默认导出类
export default FormatterUtils;

// 导出到全局作用域（保持向后兼容）
window.FormatterUtils = FormatterUtils;
