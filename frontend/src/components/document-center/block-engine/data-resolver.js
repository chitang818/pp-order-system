/**
 * 数据解析器
 * 负责解析数据绑定表达式
 */
export class DataResolver {
  /**
   * 解析绑定表达式
   * @param {string} expression - 绑定表达式
   * @param {Object} data - 数据对象
   * @param {Object} item - 当前循环项（可选）
   * @returns {*}
   */
  static resolve(expression, data, item = null) {
    if (!expression) return '';

    // 处理特殊变量
    if (expression === '@index' && item !== null) {
      return item._index !== undefined ? item._index + 1 : '';
    }
    if (expression === '@index+1' && item !== null) {
      return item._index !== undefined ? item._index + 1 : '';
    }

    // 处理循环项变量（不带前缀的直接从item取值）
    if (item !== null && !expression.includes('.')) {
      if (item.hasOwnProperty(expression)) {
        return item[expression];
      }
    }

    // 处理路径表达式
    const parts = expression.split('.');
    let value = data;

    for (const part of parts) {
      if (value === null || value === undefined) return '';
      value = value[part];
    }

    return value !== null && value !== undefined ? value : '';
  }

  /**
   * 格式化值
   * @param {*} value - 原始值
   * @param {Object} options - 格式化选项
   * @returns {string}
   */
  static format(value, options = {}) {
    if (value === null || value === undefined || value === '') return '';

    const { format, prefix = '', suffix = '', decimals = 2 } = options;

    let formatted = value;

    switch (format) {
      case 'currency':
        formatted = Number(value).toFixed(decimals);
        break;
      case 'currencyUSD':
        formatted = 'USD' + Number(value).toFixed(decimals);
        break;
      case 'integer':
        formatted = String(Math.round(Number(value)));
        break;
      case 'number':
        formatted = String(Number(value));
        break;
      default:
        formatted = String(value);
    }

    return prefix + formatted + suffix;
  }

  /**
   * 解析嵌套对象路径
   * @param {Object} obj - 对象
   * @param {string} path - 路径，如 "style.fontSize"
   * @returns {*}
   */
  static getNestedValue(obj, path) {
    if (!path) return undefined;
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  /**
   * 设置嵌套对象路径的值
   * @param {Object} obj - 对象
   * @param {string} path - 路径，如 "style.fontSize"
   * @param {*} value - 值
   */
  static setNestedValue(obj, path, value) {
    if (!path) return;
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((o, k) => {
      if (!o[k]) o[k] = {};
      return o[k];
    }, obj);
    target[last] = value;
  }
}

