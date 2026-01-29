/**
 * 变量解析器（Variable Resolver）
 * 解析变量名称，验证变量存在性，应用过滤器
 */

import { FilterRegistry } from './filter-registry.js';
import { DataAccessor } from './data-accessor.js';

export class VariableResolver {
  /**
   * 解析变量字符串
   * @param {string} variableString - 变量字符串，如 "order.contractNo|format:2"
   * @param {Object} context - 上下文对象 { data, context }
   * @returns {ResolvedVariable} 解析后的变量对象
   */
  static resolve(variableString, context) {
    // 1. 分离变量和过滤器
    const parts = variableString.split('|').map(p => p.trim());
    const varPart = parts[0];
    const filterParts = parts.slice(1);

    // 2. 解析变量名称
    // 特殊处理 @index 和 @index+1
    let namespace = '';
    let fieldPath = '';
    
    if (varPart === '@index' || varPart === '@index+1' || varPart.startsWith('@index')) {
      // @index 或 @index+1 等特殊变量
      namespace = varPart;
      fieldPath = '';
    } else {
      const varParts = varPart.split('.');
      namespace = varParts[0] || '';
      fieldPath = varParts.slice(1).join('.');
    }

    // 3. 解析过滤器
    const filters = filterParts.map(filterStr => this.parseFilter(filterStr));

    // 4. 对于特殊变量，直接跳过验证（不输出警告）
    // 处理 @index 和 @index+1 特殊变量
    if (namespace === '@index' || namespace === '@index+1' || namespace.startsWith('@index')) {
      return {
        namespace,
        fieldPath,
        filters,
        raw: variableString
      };
    }
    
    // 对于 {{else}} 指令，不应该作为变量处理（应该在 AST 构建时被识别为指令）
    // 如果这里遇到了，说明 AST 构建有问题，但为了避免验证错误，先跳过
    if (varPart === 'else' || namespace === 'else') {
      return {
        namespace: 'else',
        fieldPath: '',
        filters: [],
        raw: variableString
      };
    }
    
    // 对于循环上下文中的 item 变量，直接跳过验证（不输出警告）
    // item 变量在循环中动态存在，验证时可能还没有数据
    if (namespace === 'item') {
      // item 变量在循环上下文中，不验证也不警告
      return {
        namespace,
        fieldPath,
        filters,
        raw: variableString
      };
    }
    
    // 对于 order.extras.xxx 这类可选字段，不验证也不输出警告
    if (namespace === 'order' && fieldPath.startsWith('extras.')) {
      // extras 字段是可选的，不验证也不警告
      return {
        namespace,
        fieldPath,
        filters,
        raw: variableString
      };
    }
    
    // 5. 验证其他变量（如果提供了数据且数据不为空）
    // 注意：在模板验证阶段，传入的是空数据对象，不应该输出警告
    if (context.data && Object.keys(context.data).length > 0) {
      const isValid = this.validate(namespace, fieldPath, context.data, context.context);
      if (!isValid) {
        // 其他变量不存在时才输出警告
        // 不抛出错误，只记录警告，允许变量不存在时返回空值
        // 只在有实际数据时输出警告，避免验证阶段的噪音
        console.warn(`变量可能不存在: ${namespace}.${fieldPath}`);
      }
    }

    // 5. 返回解析结果
    return {
      namespace,
      fieldPath,
      filters,
      raw: variableString
    };
  }

  /**
   * 解析过滤器字符串
   * @param {string} filterString - 过滤器字符串，如 "format:2" 或 "upper"
   * @returns {Object} 过滤器对象 { name, params }
   */
  static parseFilter(filterString) {
    const parts = filterString.split(':');
    const name = parts[0].trim();
    const params = parts.slice(1).map(p => p.trim());
    return { name, params };
  }

  /**
   * 验证变量是否存在
   * @param {string} namespace - 命名空间
   * @param {string} fieldPath - 字段路径
   * @param {Object} data - 数据对象
   * @param {Object} context - 上下文对象
   * @returns {boolean} 变量是否存在
   */
  static validate(namespace, fieldPath, data, context = {}) {
    // 特殊命名空间不需要验证
    if (namespace === 'meta' || namespace === 'sv' || namespace === 'calc') {
      return true;
    }

    // 循环上下文中的 item 变量，应该从 context.item 中获取
    if (namespace === 'item' && context.item) {
      return DataAccessor.hasField('item', fieldPath, { item: context.item }, context);
    }

    // 对于 order.extras.xxx 这类可选字段，不进行严格验证（避免过多警告）
    // 这些字段可能不存在，但这是正常的
    if (namespace === 'order' && fieldPath.startsWith('extras.')) {
      // 对于 extras 字段，只检查 extras 对象是否存在，不检查具体字段
      // 因为 extras 中的字段都是可选的
      const orderData = data[namespace];
      if (orderData && orderData.extras) {
        return true; // extras 对象存在，认为字段可能有效
      }
      return false;
    }

    return DataAccessor.hasField(namespace, fieldPath, data, context);
  }

  /**
   * 获取变量值
   * @param {ResolvedVariable} resolved - 解析后的变量对象
   * @param {Object} data - 数据对象
   * @param {Object} context - 上下文对象
   * @returns {any} 变量值
   */
  static getValue(resolved, data, context = {}) {
    // 处理特殊变量 @index 和 @index+1
    if (resolved.namespace === '@index' || resolved.raw === '@index') {
      // @index 返回从0开始的索引
      return context.meta?.index0 ?? 0;
    }
    
    if (resolved.raw === '@index+1' || resolved.raw.includes('@index+1')) {
      // @index+1 返回从1开始的序号
      return context.meta?.index ?? 1;
    }
    
    // 1. 从数据对象获取值
    const value = DataAccessor.getValue(
      resolved.namespace,
      resolved.fieldPath,
      data,
      context
    );

    // 2. 应用过滤器
    let result = value;
    for (const filter of resolved.filters) {
      if (!FilterRegistry.has(filter.name)) {
        console.warn(`过滤器未找到: ${filter.name}`);
        continue;
      }
      result = FilterRegistry.apply(result, filter.name, filter.params);
    }
    
    // 3. 特殊处理：如果是数字类型的金额，确保格式化（如果没有过滤器）
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      // 如果是 calc.itemAmount 或 calc.totalAmount，且没有格式化过滤器，自动格式化
      if (resolved.namespace === 'calc' && 
          (resolved.fieldPath === 'itemAmount' || resolved.fieldPath === 'totalAmount') &&
          resolved.filters.length === 0) {
        // 保留2位小数
        result = Math.round(result * 100) / 100;
      }
    }

    return result;
  }

  /**
   * 应用过滤器
   * @param {any} value - 值
   * @param {Array<Object>} filters - 过滤器数组
   * @returns {any} 过滤后的值
   */
  static applyFilters(value, filters) {
    let result = value;
    for (const filter of filters) {
      if (!FilterRegistry.has(filter.name)) {
        console.warn(`过滤器未找到: ${filter.name}`);
        continue;
      }
      result = FilterRegistry.apply(result, filter.name, filter.params);
    }
    return result;
  }
}

