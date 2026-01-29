/**
 * 基础区块类
 * 所有区块组件的父类
 */
export class BaseBlock {
  constructor(config) {
    this.id = config.id;
    this.type = config.type;
    this.config = config.config || {};
  }

  /**
   * 渲染区块为HTML
   * @param {Object} data - 绑定数据
   * @returns {string} HTML字符串
   */
  render(data) {
    throw new Error('子类必须实现 render 方法');
  }

  /**
   * 获取区块默认配置
   * @returns {Object}
   */
  static getDefaultConfig() {
    return {};
  }

  /**
   * 获取区块属性定义（用于属性面板）
   * @returns {Array}
   */
  static getPropertyDefinitions() {
    return [];
  }

  /**
   * 解析数据绑定
   * @param {string} binding - 绑定表达式，如 "order.contractNo"
   * @param {Object} data - 数据对象
   * @param {Object} item - 当前循环项（可选，用于产品表格等循环场景）
   * @returns {string} 解析后的值
   */
  resolveBinding(binding, data, item = null) {
    if (!binding) return '';
    
    // 处理特殊变量
    if (binding === '@index' && item !== null) {
      return item._index !== undefined ? String(item._index + 1) : '';
    }
    
    // 处理循环项变量（不带前缀的直接从item取值）
    if (item !== null && !binding.includes('.')) {
      if (item.hasOwnProperty(binding)) {
        return item[binding] !== null && item[binding] !== undefined ? String(item[binding]) : '';
      }
    }
    
    // 处理路径表达式
    const parts = binding.split('.');
    let value = data;
    
    for (const part of parts) {
      if (value === null || value === undefined) return '';
      value = value[part];
    }
    
    return value !== null && value !== undefined ? String(value) : '';
  }

  /**
   * 格式化值
   * @param {*} value - 原始值
   * @param {string} format - 格式类型
   * @param {Object} options - 格式化选项
   * @returns {string}
   */
  formatValue(value, format, options = {}) {
    if (value === null || value === undefined || value === '') return '';
    
    const { prefix = '', suffix = '', decimals = 2 } = options;
    
    let formatted = value;
    
    switch (format) {
      case 'currency':
        formatted = Number(value).toFixed(decimals);
        break;
      case 'currencyUSD':
        formatted = 'USD' + Number(value).toFixed(decimals);
        break;
      case 'number':
        formatted = String(Number(value));
        break;
      case 'integer':
        formatted = String(Math.round(Number(value)));
        break;
      default:
        formatted = String(value);
    }
    
    return prefix + formatted + suffix;
  }

  /**
   * 获取样式字符串
   * @param {Object} styleConfig - 样式配置对象
   * @returns {string} CSS样式字符串
   */
  getStyleString(styleConfig) {
    if (!styleConfig || typeof styleConfig !== 'object') {
      return '';
    }
    
    const styles = [];
    
    if (styleConfig.fontSize) {
      // 统一使用pt单位
      const fontSize = typeof styleConfig.fontSize === 'number' 
        ? `${styleConfig.fontSize}pt` 
        : styleConfig.fontSize;
      styles.push(`font-size: ${fontSize}`);
    }
    
    if (styleConfig.fontWeight) {
      styles.push(`font-weight: ${styleConfig.fontWeight}`);
    }
    
    if (styleConfig.color) {
      styles.push(`color: ${styleConfig.color}`);
    }
    
    if (styleConfig.textAlign) {
      styles.push(`text-align: ${styleConfig.textAlign}`);
    }
    
    if (styleConfig.backgroundColor) {
      styles.push(`background-color: ${styleConfig.backgroundColor}`);
    }
    
    if (styleConfig.border) {
      styles.push(`border: ${styleConfig.border}`);
    }
    
    if (styleConfig.borderColor) {
      styles.push(`border-color: ${styleConfig.borderColor}`);
    }
    
    if (styleConfig.padding) {
      styles.push(`padding: ${styleConfig.padding}`);
    }
    
    if (styleConfig.margin) {
      styles.push(`margin: ${styleConfig.margin}`);
    }
    
    return styles.join('; ');
  }
}

