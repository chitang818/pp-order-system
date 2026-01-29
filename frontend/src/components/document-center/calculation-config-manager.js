/**
 * 计算规则配置管理器
 * 负责解析和执行模板中配置的计算规则
 * 支持多种计算类型：sum、reduce、map、custom等
 */

import { CalculationFunctions } from './calculation-functions.js';

export class CalculationConfigManager {
  /**
   * 执行模板配置的计算规则
   * @param {Array} calculations - 计算规则数组
   * @param {Object} data - 数据对象 { order, customer, company }
   * @returns {Object} 计算结果对象，key为变量名，value为计算结果
   */
  static executeCalculations(calculations, data) {
    const results = {};
    
    if (!calculations || !Array.isArray(calculations) || calculations.length === 0) {
      return results;
    }

    const order = data?.order || {};
    const items = order.items || [];

    // 如果没有产品项，返回空结果
    if (!items || items.length === 0) {
      logger.warn('订单没有产品项，跳过计算');
      return results;
    }

    calculations.forEach((calc, index) => {
      try {
        // 验证计算配置
        const validation = this.validateCalculation(calc);
        if (!validation.valid) {
          logger.warn(`计算规则 #${index + 1} 验证失败`, validation.errors);
          return;
        }

        let result = null;
        
        // 根据计算类型执行不同的计算逻辑
        switch (calc.type) {
          case 'sum':
            result = this.executeSumCalculation(calc, items);
            break;
            
          case 'reduce':
            result = this.executeReduceCalculation(calc, items);
            break;
            
          case 'map':
            result = this.executeMapCalculation(calc, items);
            break;
            
          case 'custom':
            result = this.executeCustomCalculation(calc, items, order, data);
            break;
            
          case 'item':
            // 针对单个item的计算，会在processLoops中处理
            // 这里只记录配置
            result = calc;
            break;
            
          default:
            console.warn(`[CalculationConfigManager] 不支持的计算类型: ${calc.type}`);
            break;
        }

        // 使用target字段名、field字段名或索引作为key
        const key = calc.target || calc.field || calc.name || `calc${index}`;
        if (result !== null && result !== undefined) {
          results[key] = result;
          
          // 格式化数字结果（如果是数字且需要格式化）
          if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
            // 对于金额类计算，保留2位小数
            if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('price')) {
              results[key] = Number(result.toFixed(2));
            }
          }
        }
        
        // 如果field是"items"，也支持通过items作为key访问（向后兼容）
        if (calc.field === 'items' && calc.target) {
          results[calc.target] = result;
        }
      } catch (error) {
        logger.error(`计算执行失败 (规则 #${index + 1})`, {
          calc,
          error: error.message
        });
        // 不抛出错误，继续处理其他计算规则
      }
    });

    return results;
  }
  
  /**
   * 执行求和计算
   * @param {Object} calc - 计算配置
   * @param {Array} items - 产品项数组
   * @returns {number} 计算结果
   */
  static executeSumCalculation(calc, items) {
    const initial = parseFloat(calc.initial || 0);
    const formula = calc.formula || 'sum + 0';
    
    return items.reduce((sum, it) => {
      // 替换公式中的变量
      let evalFormula = formula
        .replace(/\bsum\b/g, String(sum))
        .replace(/\bit\.(\w+)\b/g, (match, field) => {
          const value = it[field] || 0;
          return String(value);
        })
        .replace(/\bitem\.(\w+)\b/g, (match, field) => {
          const value = it[field] || 0;
          return String(value);
        });
      
      // 安全执行计算（仅支持基本数学运算）
      try {
        // 移除可能的危险代码，只保留数学表达式
        evalFormula = evalFormula.replace(/[^0-9+\-*/().\s]/g, '');
        return eval(evalFormula) || sum;
      } catch (e) {
        console.warn(`[CalculationConfigManager] 计算公式执行失败: ${formula}`, e);
        return sum;
      }
    }, initial);
  }
  
  /**
   * 执行reduce计算（与sum类似，但更灵活）
   * @param {Object} calc - 计算配置
   * @param {Array} items - 产品项数组
   * @returns {number} 计算结果
   */
  static executeReduceCalculation(calc, items) {
    return this.executeSumCalculation(calc, items);
  }
  
  /**
   * 执行map计算（对每个item执行计算，返回数组）
   * @param {Object} calc - 计算配置
   * @param {Array} items - 产品项数组
   * @returns {Array} 计算结果数组
   */
  static executeMapCalculation(calc, items) {
    const formula = calc.formula || '0';
    
    return items.map((it, index) => {
      // 替换公式中的变量
      let evalFormula = formula
        .replace(/\bit\.(\w+)\b/g, (match, field) => {
          const value = it[field] || 0;
          return String(value);
        })
        .replace(/\bitem\.(\w+)\b/g, (match, field) => {
          const value = it[field] || 0;
          return String(value);
        })
        .replace(/\bindex\b/g, String(index));
      
      try {
        evalFormula = evalFormula.replace(/[^0-9+\-*/().\s]/g, '');
        return eval(evalFormula) || 0;
      } catch (e) {
        console.warn(`[CalculationConfigManager] map计算公式执行失败: ${formula}`, e);
        return 0;
      }
    });
  }
  
  /**
   * 执行自定义计算（调用计算函数库中的函数）
   * @param {Object} calc - 计算配置
   * @param {Array} items - 产品项数组
   * @param {Object} order - 订单对象
   * @param {Object} data - 完整数据对象
   * @returns {any} 计算结果
   */
  static executeCustomCalculation(calc, items, order, data) {
    const functionName = calc.function || calc.name;
    if (!functionName) {
      console.warn('[CalculationConfigManager] 自定义计算缺少function字段');
      return null;
    }
    
    // 检查函数是否存在
    if (!CalculationFunctions.hasFunction(functionName)) {
      console.warn(`[CalculationConfigManager] 计算函数不存在: ${functionName}`);
      return null;
    }
    
    // 根据scope决定计算范围
    const scope = calc.scope || 'item'; // 'item' | 'items' | 'order'
    
    if (scope === 'item') {
      // 对每个item执行计算，返回数组
      return items.map(item => {
        return CalculationFunctions.executeFunction(functionName, item);
      });
    } else if (scope === 'items') {
      // 对整个items数组执行计算
      return CalculationFunctions.executeFunction(functionName, items);
    } else if (scope === 'order') {
      // 对整个order执行计算
      return CalculationFunctions.executeFunction(functionName, order);
    } else {
      // 默认对整个数据对象执行计算
      return CalculationFunctions.executeFunction(functionName, data);
    }
  }
  
  /**
   * 验证计算配置的有效性
   * @param {Object} calc - 计算配置
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validateCalculation(calc) {
    const errors = [];
    
    if (!calc.type) {
      errors.push('缺少type字段');
    }
    
    if (!['sum', 'reduce', 'map', 'custom', 'item'].includes(calc.type)) {
      errors.push(`不支持的计算类型: ${calc.type}`);
    }
    
    if (calc.type === 'custom' && !calc.function && !calc.name) {
      errors.push('自定义计算缺少function或name字段');
    }
    
    if (calc.type === 'sum' && !calc.formula) {
      errors.push('sum类型计算缺少formula字段');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * 验证计算配置数组
   * @param {Array} calculations - 计算配置数组
   * @returns {Object} { valid: boolean, errors: Array<Object> }
   */
  static validateCalculations(calculations) {
    if (!Array.isArray(calculations)) {
      return {
        valid: false,
        errors: [{ index: -1, message: 'calculations必须是数组' }]
      };
    }
    
    const errors = [];
    calculations.forEach((calc, index) => {
      const validation = this.validateCalculation(calc);
      if (!validation.valid) {
        errors.push({
          index,
          calculation: calc,
          errors: validation.errors
        });
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

