/**
 * 新版本数据绑定器（Data Binder V2）
 * 使用新的模板解析器绑定数据到模板
 */

import { TemplateParser } from '../parser/template-parser.js';
import { VariableResolver } from '../resolver/variable-resolver.js';
import { LoopProcessor } from './loop-processor.js';
import { ConditionProcessor } from './condition-processor.js';
import { globalCache } from '../utils/cache.js';

export class DataBinderV2 {
  /**
   * 绑定数据到模板
   * @param {string} template - 模板字符串
   * @param {Object} data - 数据对象 { order, customer, company }
   * @param {Object} options - 选项
   * @param {boolean} options.useCache - 是否使用缓存（默认true）
   * @returns {string} 绑定后的HTML字符串
   */
  static bind(template, data, options = {}) {
    const { useCache = true } = options;
    
    // 1. 解析模板（使用缓存）
    let ast;
    if (useCache) {
      ast = globalCache.get(template);
      if (!ast) {
        ast = TemplateParser.parse(template);
        globalCache.set(template, ast);
      }
    } else {
      ast = TemplateParser.parse(template);
    }
    
    // 2. 绑定数据
    const html = this.processNode(ast, data, {});
    
    return html;
  }

  /**
   * 处理AST节点
   * @param {Object} node - AST节点
   * @param {Object} data - 数据对象
   * @param {Object} context - 上下文对象
   * @returns {string} 处理后的HTML
   */
  static processNode(node, data, context) {
    if (!node) {
      return '';
    }

    switch (node.type) {
      case 'TEMPLATE':
      case 'CONTENT':
        return this.processChildren(node.children, data, context);
      
      case 'TEXT':
        return node.content || '';
      
      case 'VARIABLE':
        return this.processVariable(node, data, context);
      
      case 'LOOP':
        return LoopProcessor.process(node, data, context, this.processChildren.bind(this));
      
      case 'CONDITION':
        return ConditionProcessor.process(node, data, context, this.processChildren.bind(this));
      
      default:
        console.warn(`未知的节点类型: ${node.type}`);
        return '';
    }
  }

  /**
   * 处理变量节点
   * @param {Object} node - 变量AST节点
   * @param {Object} data - 数据对象
   * @param {Object} context - 上下文对象
   * @returns {string} 变量值
   */
  static processVariable(node, data, context) {
    try {
      // 1. 解析变量（从 {{variable}} 中提取变量名）
      const variableString = node.raw.replace(/[{}]/g, '').trim();
      const resolved = VariableResolver.resolve(variableString, { 
        data, 
        context 
      });
      
      // 2. 获取变量值
      const value = VariableResolver.getValue(resolved, data, context);
      
      // 调试日志：检查关键变量
      if (resolved.namespace === 'item' && (resolved.fieldPath === 'model' || resolved.fieldPath === 'quantity' || resolved.fieldPath === 'unitPrice')) {
        console.log(`[DataBinderV2] 处理变量 ${resolved.namespace}.${resolved.fieldPath}:`, {
          hasContextItem: !!context.item,
          contextItemKeys: context.item ? Object.keys(context.item) : [],
          value: value,
          valueType: typeof value
        });
      }
      if (resolved.namespace === 'calc' && resolved.fieldPath === 'itemAmount') {
        console.log(`[DataBinderV2] 处理变量 calc.itemAmount:`, {
          hasContextMeta: !!context.meta,
          metaIndex0: context.meta?.index0,
          value: value,
          valueType: typeof value,
          isArray: Array.isArray(value)
        });
      }
      
      // 3. 转换为字符串（null/undefined 转为空字符串）
      // 特殊处理：如果是数字，确保格式化（特别是金额）
      if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
        // 如果是金额类字段，保留2位小数
        if (resolved.namespace === 'calc' && 
            (resolved.fieldPath === 'itemAmount' || resolved.fieldPath === 'totalAmount')) {
          return value.toFixed(2);
        }
        // 如果是单价，也保留2位小数
        if (resolved.namespace === 'item' && resolved.fieldPath === 'unitPrice') {
          return value.toFixed(2);
        }
      }
      
      // 处理对象类型：如果是对象或数组，尝试转换为字符串
      if (value != null) {
        if (typeof value === 'object') {
          // 如果是数组，返回空字符串（不应该显示数组）
          if (Array.isArray(value)) {
            console.warn(`[DataBinderV2] 变量 ${resolved.namespace}.${resolved.fieldPath} 是数组，无法转换为字符串`);
            return '';
          }
          // 如果是对象，尝试获取其字符串表示
          // 优先尝试 JSON.stringify，但如果对象太大或循环引用，返回空字符串
          try {
            const str = JSON.stringify(value);
            // 如果字符串太长（超过100字符），可能不是我们想要的
            if (str.length > 100) {
              console.warn(`[DataBinderV2] 变量 ${resolved.namespace}.${resolved.fieldPath} 是复杂对象，无法直接显示`);
              return '';
            }
            return str;
          } catch (e) {
            console.warn(`[DataBinderV2] 变量 ${resolved.namespace}.${resolved.fieldPath} 对象序列化失败:`, e);
            return '';
          }
        }
        return String(value);
      }
      
      return '';
    } catch (error) {
      console.warn(`变量处理失败: ${node.raw}`, error);
      return '';
    }
  }

  /**
   * 处理子节点
   * @param {Array} children - 子节点数组
   * @param {Object} data - 数据对象
   * @param {Object} context - 上下文对象
   * @returns {string} 处理后的HTML
   */
  static processChildren(children, data, context) {
    if (!children || !Array.isArray(children)) {
      return '';
    }

    return children.map(child => 
      this.processNode(child, data, context)
    ).join('');
  }

  /**
   * 验证模板
   * @param {string} template - 模板字符串
   * @returns {Object} 验证结果 { valid, errors, warnings }
   */
  static validate(template) {
    return TemplateParser.validate(template);
  }
}

