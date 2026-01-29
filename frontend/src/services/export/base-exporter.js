/**
 * 基础导出类
 * 提供导出的通用逻辑，各格式导出模块继承此类
 */
import { FontSizeManager } from '../../components/document-center/block-engine/font-size-manager.js';

export class BaseExporter {
  constructor(options = {}) {
    this.options = options;
  }
  
  /**
   * 导出方法（子类必须实现）
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @returns {Promise<Blob>} 导出的文件Blob
   */
  async export(template, data) {
    throw new Error('子类必须实现 export 方法');
  }
  
  /**
   * 解析模板配置
   * @param {Object} template - 模板配置
   * @returns {Object} 解析后的模板
   */
  parseTemplate(template) {
    return {
      ...template,
      blocks: template.blocks || [],
      pageSettings: template.pageSettings || { margin: { top: 15, bottom: 15, left: 15, right: 15 } },
      globalStyles: template.globalStyles || { fontSize: 11 }
    };
  }
  
  /**
   * 绑定数据到模板
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @returns {Object} 处理后的数据
   */
  bindData(template, data) {
    const order = data.order || {};
    const items = order.items || [];
    
    // 计算汇总值
    const calc = {
      totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      totalPackages: items.reduce((sum, item) => sum + Number(item.packages || 0), 0),
      totalAmount: items.reduce((sum, item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || item.price || 0);
        return sum + (qty * price);
      }, 0),
      totalNetWeight: items.reduce((sum, item) => sum + Number(item.netWeight || 0), 0),
      totalGrossWeight: items.reduce((sum, item) => sum + Number(item.grossWeight || 0), 0)
    };
    
    calc.totalAmountUSD = `USD${calc.totalAmount.toFixed(2)}`;
    calc.totalQuantityPCS = `${calc.totalQuantity}PCS`;
    
    return { ...data, calc };
  }
  
  /**
   * 遍历处理区块
   * @param {Array} blocks - 区块列表
   * @param {Object} data - 数据对象
   * @param {Function} handler - 区块处理函数
   */
  async processBlocks(blocks, data, handler) {
    for (const block of blocks) {
      await handler(block, data);
    }
  }
  
  /**
   * 获取目标格式的字号
   * @param {number} pt - 原始pt值
   * @param {string} format - 目标格式 'excel' | 'word' | 'pdf'
   * @returns {number}
   */
  getFontSize(pt, format = 'pdf') {
    switch (format) {
      case 'excel':
        return FontSizeManager.ptToExcel(pt);
      case 'word':
        return FontSizeManager.ptToWord(pt);
      default:
        return pt;
    }
  }
  
  /**
   * 解析数据绑定
   * @param {string} binding - 绑定表达式
   * @param {Object} data - 数据对象
   * @param {Object} item - 当前循环项（可选）
   * @returns {*}
   */
  resolveBinding(binding, data, item = null) {
    if (!binding) return '';
    
    // 处理特殊变量
    if (binding === '@index' && item !== null) {
      return item._index !== undefined ? item._index + 1 : '';
    }
    
    // 处理循环项变量
    if (item !== null && !binding.includes('.')) {
      if (item.hasOwnProperty(binding)) {
        return item[binding] !== null && item[binding] !== undefined ? item[binding] : '';
      }
    }
    
    // 处理路径表达式
    const parts = binding.split('.');
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
  formatValue(value, options = {}) {
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
}

