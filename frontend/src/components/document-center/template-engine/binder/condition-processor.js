/**
 * 条件处理器（Condition Processor）
 * 处理模板中的条件节点（{{#if ...}}）
 */

import { DataAccessor } from '../resolver/data-accessor.js';

export class ConditionProcessor {
  /**
   * 处理条件节点
   * @param {Object} node - 条件AST节点
   * @param {Object} data - 数据对象 { order, customer, company }
   * @param {Object} context - 上下文对象
   * @param {Function} processChildren - 处理子节点的函数
   * @returns {string} 处理后的HTML
   */
  static process(node, data, context = {}, processChildren) {
    // 1. 评估条件表达式
    const result = this.evaluateCondition(node.test, data, context);
    
    // 2. 根据条件结果处理对应的分支
    if (result) {
      // 条件为真，处理 then 分支
      return processChildren(node.then || node.children || [], data, context);
    } else if (node.else) {
      // 条件为假，处理 else 分支
      return processChildren(node.else, data, context);
    }
    
    // 没有 else 分支，返回空字符串
    return '';
  }

  /**
   * 评估条件表达式
   * @param {string} test - 条件表达式字符串
   * @param {Object} data - 数据对象
   * @param {Object} context - 上下文对象
   * @returns {boolean} 条件结果
   */
  static evaluateCondition(test, data, context = {}) {
    if (!test || typeof test !== 'string') {
      return false;
    }

    // 清理表达式
    const expression = test.trim();
    
    // 简单的条件表达式评估
    // 支持常见的条件格式：
    // - order.items.length > 0
    // - customer.name
    // - item.quantity > 100
    
    try {
      // 创建安全的评估上下文
      const evalContext = this.createEvalContext(data, context);
      
      // 使用 Function 构造函数安全评估表达式
      // 注意：这里只评估简单的表达式，不执行任意代码
      const result = this.safeEval(expression, evalContext);
      
      return Boolean(result);
    } catch (error) {
      console.warn(`条件表达式评估失败: ${expression}`, error);
      return false;
    }
  }

  /**
   * 创建评估上下文
   */
  static createEvalContext(data, context) {
    const ctx = {
      // 数据对象
      order: data.order || {},
      customer: data.customer || {},
      company: data.company || {},
      
      // 循环上下文（如果存在）
      item: context.item || {},
      meta: context.meta || {},
      
      // 辅助函数
      length: (obj) => {
        if (Array.isArray(obj)) return obj.length;
        if (obj && typeof obj === 'object') return Object.keys(obj).length;
        return 0;
      }
    };
    
    return ctx;
  }

  /**
   * 安全评估表达式
   * 只支持简单的属性访问和比较操作
   */
  static safeEval(expression, context) {
    // 简单的表达式解析
    // 支持格式：variable.property > value
    
    // 处理常见的比较操作符
    const operators = ['>', '<', '>=', '<=', '===', '==', '!==', '!='];
    
    for (const op of operators) {
      if (expression.includes(op)) {
        const parts = expression.split(op);
        if (parts.length === 2) {
          const left = this.getValue(parts[0].trim(), context);
          const right = this.getValue(parts[1].trim(), context);
          
          switch (op) {
            case '>': return left > right;
            case '<': return left < right;
            case '>=': return left >= right;
            case '<=': return left <= right;
            case '===': return left === right;
            case '==': return left == right;
            case '!==': return left !== right;
            case '!=': return left != right;
          }
        }
      }
    }
    
    // 如果没有操作符，直接获取值并转换为布尔值
    const value = this.getValue(expression, context);
    return Boolean(value);
  }

  /**
   * 从上下文中获取值
   */
  static getValue(path, context) {
    // 支持点号分隔的路径，如 order.items.length
    const parts = path.split('.');
    let value = context;
    
    for (const part of parts) {
      if (value == null) return null;
      
      // 如果是函数调用，如 length()
      if (part.endsWith('()')) {
        const funcName = part.slice(0, -2);
        if (typeof value[funcName] === 'function') {
          value = value[funcName]();
        } else {
          return null;
        }
      } else {
        value = value[part];
      }
    }
    
    return value;
  }
}

