/**
 * 计算函数库
 * 提供可复用的计算逻辑，支持默认计算和自定义扩展
 * 
 * 设计原则：
 * 1. 默认计算函数：所有模板自动可用，无需配置
 * 2. 扩展计算函数：可通过模板配置调用
 * 3. 动态注册：支持运行时添加新的计算函数
 */

import { logger } from './logger.js';

export class CalculationFunctions {
  /**
   * 默认计算函数库
   * 这些函数会在所有模板中自动执行，用户可以直接在模板中使用对应的变量
   */
  static defaultCalculations = {
    /**
     * 计算单个产品的净重和毛重（用于装箱单）
     * @param {Object} item - 产品项
     * @param {Object} order - 订单对象（可选，用于获取产品类型）
     * @returns {Object} { netWeight, grossWeight, netWeightDisplay, grossWeightDisplay }
     */
    calculateItemWeights: (item, order) => {
      const qty = Number(item.quantity || 0);
      const actualWeight = item.actualWeight ? Number(item.actualWeight) : null;
      
      let netWeight = null;
      let netWeightDisplay = '';
      
      // 计算NET WEIGHT：只使用实际重量 × 数量，实际重量为空时不计算
      if (actualWeight !== null && !isNaN(actualWeight) && actualWeight > 0) {
        netWeight = Math.round(actualWeight * qty);
        netWeightDisplay = `${netWeight} KGS`;
      }
      
      // 计算皮重：根据件数单位、产品类型和包皮布选择计算
      let tareWeight = 0;
      const packages = Number(item.packages || 0);
      
      // 获取产品类型（优先从订单获取，其次从产品项获取）
      const productType = (order && order.productType) || item.productType || 1;
      
      // 获取包皮布字段（可能存储在 item.wrappingCloth 或 item.extras.wrappingCloth 中）
      const wrappingCloth = item.wrappingCloth || (item.extras && item.extras.wrappingCloth) || '';
      
      // C类品（productType === 3）且包皮布为"不要"且件数单位为"件"时，使用0.045系数
      if (productType === 3 && wrappingCloth === '不要' && item.unit === '件') {
        tareWeight = 0.045 * packages;
      } else if (item.unit === '件') {
        tareWeight = 0.25 * packages;
      } else if (item.unit === '托盘') {
        tareWeight = 15 * packages;
      } else if (item.unit === '捆包') {
        tareWeight = 10 * packages;
      }
      
      // 计算GROSS WEIGHT：只有NET WEIGHT存在时才计算GROSS WEIGHT
      let grossWeight = null;
      let grossWeightDisplay = '';
      if (netWeight !== null) {
        grossWeight = Math.round(netWeight + tareWeight);
        grossWeightDisplay = `${grossWeight} KGS`;
      }
      
      return {
        netWeight,
        grossWeight,
        netWeightDisplay,
        grossWeightDisplay
      };
    },
    
    /**
     * 获取包装单位显示文本
     * @param {Object} item - 产品项
     * @returns {string} 包装单位显示文本（如：PALLET, PALLETS, BALE, BALES等）
     */
    getPackageUnitDisplay: (item) => {
      const packages = Number(item.packages || 0);
      const unit = item.unit || '';
      
      if (unit === '托盘') {
        return packages === 1 ? 'PALLET' : 'PALLETS';
      } else if (unit === '捆包') {
        return packages === 1 ? 'SACK' : 'SACKS';
      } else if (unit === '件') {
        return packages === 1 ? 'BALE' : 'BALES';
      }
      return 'PACKAGES';
    },
    
    /**
     * 计算产品金额
     * @param {Object} item - 产品项
     * @returns {number} 金额
     */
    calculateItemAmount: (item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || item.price || 0);
      return quantity * unitPrice;
    },
    
    /**
     * 格式化数字（保留2位小数）
     * @param {number} num - 数字
     * @returns {string}
     */
    formatNumber: (num) => {
      if (num === null || num === undefined || isNaN(num)) {
        return '0.00';
      }
      return Number(num).toFixed(2);
    },
    
    /**
     * 获取单位复数形式
     * @param {number} count - 数量
     * @param {string} singular - 单数形式
     * @returns {string}
     */
    getPluralUnit: (count, singular) => {
      return count === 1 ? singular : (singular + 'S');
    }
  };
  
  /**
   * 扩展计算函数库
   * 用于添加新的计算逻辑，可以通过模板配置调用
   * 这些函数不会自动执行，需要通过模板的 calculations 配置来使用
   */
  static extendedCalculations = {
    // 示例：计算体积（如果订单中有volume字段）
    calculateVolume: (item) => {
      return Number(item.volume || 0);
    },
    
    // 示例：计算折扣金额
    calculateDiscount: (item) => {
      const amount = CalculationFunctions.defaultCalculations.calculateItemAmount(item);
      const discount = Number(item.discount || 0);
      return amount * (discount / 100);
    },
    
    // 示例：计算税费
    calculateTax: (item) => {
      const amount = CalculationFunctions.defaultCalculations.calculateItemAmount(item);
      const taxRate = Number(item.taxRate || 0);
      return amount * (taxRate / 100);
    },
    
    /**
     * 获取 Invoice 模板的包装单位（用于统计行）
     * 根据所有产品的单位统一转换
     * @param {Array} items - 产品项数组
     * @returns {string} 包装单位显示文本（如：PALLET, PALLETS, BALE, BALES等）
     */
    getPackageUnitForInvoice: (items) => {
      if (!items || items.length === 0) {
        return 'PACKAGES';
      }
      
      // 检查所有产品的件数单位是否一致
      const units = items.map(it => it.unit || '').filter(unit => unit);
      const uniqueUnits = [...new Set(units)];
      
      if (uniqueUnits.length === 1 && uniqueUnits[0]) {
        const unit = uniqueUnits[0];
        const totalPackages = items.reduce((sum, it) => sum + Number(it.packages || 0), 0);
        
        if (unit === '托盘') {
          return totalPackages === 1 ? 'PALLET' : 'PALLETS';
        } else if (unit === '捆包') {
          return totalPackages === 1 ? 'SACK' : 'SACKS';
        } else if (unit === '件') {
          return totalPackages === 1 ? 'BALE' : 'BALES';
        }
      }
      
      return 'PACKAGES';
    },
    
    /**
     * 获取总值栏标题文本（Trade Term + 目的港城市）
     * @param {Object} order - 订单对象
     * @returns {string} 标题文本
     */
    getAmountHeaderText: (order) => {
      if (!order) return '';
      
      const ex = order.extras || {};
      const tradeTerm = ex.tradeTerm || order.tradeTerm || '';
      const shipTo = order.shipTo || '';
      
      // 从目的港中提取城市名（取逗号前的部分，如果没有逗号则使用整个字符串）
      const destinationCity = shipTo ? (shipTo.includes(',') ? shipTo.split(',')[0].trim() : shipTo.trim()) : '';
      
      // 组合显示：Trade Term + 城市名，如果Trade Term存在则显示"Trade Term 城市名"，否则只显示城市名
      if (tradeTerm && destinationCity) {
        return `${tradeTerm} ${destinationCity}`;
      } else if (tradeTerm) {
        return tradeTerm;
      } else if (destinationCity) {
        return destinationCity;
      }
      
      return '';
    },
    
    /**
     * 格式化箱型文本（用于销售确认书）
     * @param {Object} order - 订单对象
     * @returns {string} 格式化后的箱型文本
     */
    formatBoxType: (order) => {
      if (!order || !order.extras) return '';
      const boxType = order.extras.boxType;
      if (!boxType || boxType === '其他') return '';
      return `SHIPMENT BY ${boxType.replace('GP', '')}'FCL`;
    },
    
    /**
     * 格式化发货日期（用于销售确认书）
     * @param {Object} order - 订单对象
     * @returns {string} 格式化后的日期文本（YYYY-MM-DD格式）
     */
    formatShipDate: (order) => {
      if (!order) return '';
      
      // 优先使用订单的shipmentDate字段，然后是extras.deliveryDate，最后是invoiceDate
      const raw = (order.shipmentDate) ? String(order.shipmentDate) : 
                  ((order.extras && order.extras.deliveryDate) ? String(order.extras.deliveryDate) : 
                  (order.invoiceDate ? String(order.invoiceDate) : ''));
      
      if (!raw) return '';
      
      // 期望格式：YYYY-MM-DD（例如：2025-09-27）
      try {
        // 先处理可能包含汉字的日期格式，如 "2025年09月25号"
        let processedDate = raw;
        // 移除所有汉字
        processedDate = processedDate.replace(/[年月日号]/g, '');
        
        // 处理纯数字格式 YYYYMMDD（例如：20250925）
        const numericDateMatch = processedDate.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (numericDateMatch) {
          const [, year, month, day] = numericDateMatch;
          // 验证日期有效性
          const validDate = new Date(`${year}-${month}-${day}`);
          if (!isNaN(validDate.getTime())) {
            return `${year}-${month}-${day}`;
          }
        }
        
        // 尝试正常解析日期
        const dt = new Date(processedDate);
        if (!isNaN(dt.getTime())) {
          const m = String(dt.getMonth()+1).padStart(2, '0');
          const d = String(dt.getDate()).padStart(2, '0');
          const y = dt.getFullYear();
          return `${y}-${m}-${d}`;
        }
      } catch(_) {}
      
      // 如果无法解析，尝试格式化纯数字日期
      const lastResortMatch = raw.replace(/[年月日号]/g, '').match(/^(\d{4})(\d{2})(\d{2})$/);
      if (lastResortMatch) {
        const [, year, month, day] = lastResortMatch;
        return `${year}-${month}-${day}`;
      }
      
      // 原样返回但移除汉字
      return raw.replace(/[年月日号]/g, '');
    },
    
    /**
     * 格式化目的港文本（Trade Term + 目的港）
     * @param {Object} order - 订单对象
     * @returns {string} 格式化后的目的港文本
     */
    formatDestination: (order) => {
      if (!order) return '';
      
      const ex = order.extras || {};
      const terms = ex.terms || ex.priceTerms || ex.incoterms || '';
      const incoterm = terms ? terms.trim().split(/\s+/)[0].toUpperCase() : '';
      const to = order.shipTo || ex.destination || '';
      
      if (incoterm && to) {
        return `${incoterm} ${to}`;
      }
      return to || incoterm || '';
    }
  };
  
  /**
   * 获取所有可用的计算函数
   * @returns {Object} 所有计算函数的集合
   */
  static getAllFunctions() {
    return {
      ...this.defaultCalculations,
      ...this.extendedCalculations
    };
  }
  
  /**
   * 注册新的计算函数（运行时扩展）
   * 用于在运行时动态添加新的计算逻辑
   * 
   * @param {string} name - 函数名称
   * @param {Function} func - 计算函数
   * @param {boolean} isDefault - 是否为默认计算（自动执行）
   */
  static registerFunction(name, func, isDefault = false) {
    if (isDefault) {
      this.defaultCalculations[name] = func;
    } else {
      this.extendedCalculations[name] = func;
    }
    logger.debug(`注册计算函数: ${name}`, { isDefault });
  }
  
  /**
   * 检查函数是否存在
   * @param {string} name - 函数名称
   * @returns {boolean}
   */
  static hasFunction(name) {
    return name in this.defaultCalculations || name in this.extendedCalculations;
  }
  
  /**
   * 获取函数
   * @param {string} name - 函数名称
   * @returns {Function|null}
   */
  static getFunction(name) {
    if (name in this.defaultCalculations) {
      return this.defaultCalculations[name];
    }
    if (name in this.extendedCalculations) {
      return this.extendedCalculations[name];
    }
    return null;
  }
  
  /**
   * 执行计算函数
   * @param {string} name - 函数名称
   * @param {...any} args - 函数参数
   * @returns {any} 计算结果
   */
  static executeFunction(name, ...args) {
    const func = this.getFunction(name);
    if (!func) {
      logger.warn(`函数不存在: ${name}`);
      return null;
    }
    try {
      return func(...args);
    } catch (error) {
      logger.error(`执行函数失败: ${name}`, error);
      return null;
    }
  }
}

