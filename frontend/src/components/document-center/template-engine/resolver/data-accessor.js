/**
 * 数据访问器（Data Accessor）
 * 根据命名空间和字段路径从数据对象中获取值
 */

export class DataAccessor {
  /**
   * 获取数据值
   * @param {string} namespace - 命名空间（如 'order', 'customer'）
   * @param {string|Array} fieldPath - 字段路径（如 'contractNo' 或 ['contract', 'no']）
   * @param {Object} data - 数据对象
   * @param {Object} context - 上下文对象（包含循环上下文等）
   * @returns {any} 数据值
   */
  static getValue(namespace, fieldPath, data, context = {}) {
    // 如果在循环上下文中，优先使用 item 和 meta
    if (context.item && namespace === 'item') {
      // 处理 item.extras 字段（可能是字符串需要解析）
      if (fieldPath && fieldPath.startsWith('extras.')) {
        const extrasField = fieldPath.substring(7); // 去掉 'extras.' 前缀
        let extras = context.item.extras;
        // 如果 extras 是字符串，尝试解析
        if (typeof extras === 'string') {
          try {
            extras = JSON.parse(extras);
          } catch (e) {
            extras = {};
          }
        }
        if (extras && typeof extras === 'object') {
          return this.getNestedValue(extras, extrasField);
        }
        return null;
      }
      return this.getNestedValue(context.item, fieldPath);
    }

    if (context.meta && namespace === 'meta') {
      return this.getNestedValue(context.meta, fieldPath);
    }

    // 在循环上下文中，如果变量没有命名空间（如 {{model}}、{{packing}} 等），
    // 且不在已知的命名空间中，应该从 item 中获取
    if (context.item) {
      const knownNamespaces = ['order', 'customer', 'company', 'item', 'meta', 'calc', 'sv'];
      if (!knownNamespaces.includes(namespace)) {
        // 这是一个无命名空间的变量，在循环上下文中应该从 item 中获取
        // 如果 fieldPath 为空，说明变量名就是 namespace（如 {{model}}）
        // 如果 fieldPath 不为空，说明是嵌套字段（如 {{some.field}}）
        const itemFieldPath = fieldPath ? `${namespace}.${fieldPath}` : namespace;
        const value = this.getNestedValue(context.item, itemFieldPath);
        // 即使值为空字符串或0，也应该返回（因为这些是有效值）
        // 只有 null 和 undefined 才继续查找
        if (value !== null && value !== undefined) {
          return value;
        }
        // 如果从 item 中获取不到，尝试从 item.extras 中获取（如 extras.size）
        if (fieldPath && context.item.extras) {
          let extras = context.item.extras;
          // 如果 extras 是字符串，尝试解析
          if (typeof extras === 'string') {
            try {
              extras = JSON.parse(extras);
            } catch (e) {
              extras = {};
            }
          }
          if (extras && typeof extras === 'object') {
            const extrasValue = this.getNestedValue(extras, fieldPath);
            if (extrasValue !== null && extrasValue !== undefined) {
              return extrasValue;
            }
          }
        }
      }
    }

    // 从数据对象获取
    const namespaceData = data[namespace];
    if (namespaceData == null) {
      return null;
    }

    let value = this.getNestedValue(namespaceData, fieldPath);
    
    // 特殊处理：在循环上下文中，如果 calc.* 是数组，根据索引获取对应元素
    if (namespace === 'calc' && Array.isArray(value)) {
      // 检查是否有循环上下文
      if (context.meta && context.meta.index0 != null) {
        const index0 = context.meta.index0;
        if (index0 >= 0 && index0 < value.length) {
          value = value[index0];
          // 如果是金额类字段，格式化保留2位小数
          if (fieldPath && (fieldPath.includes('Amount') || fieldPath.includes('amount') || fieldPath.includes('Price') || fieldPath.includes('price'))) {
            if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
              // 保留2位小数，但返回数字类型（不是字符串）
              value = Math.round(value * 100) / 100;
            }
          }
        } else {
          // 如果索引无效，返回 null（避免显示整个数组）
          console.warn(`[DataAccessor] calc.${fieldPath} 数组索引无效: index0=${index0}, arrayLength=${value.length}`);
          return null;
        }
      } else {
        // 如果不在循环上下文中，但 calc.* 是数组，返回 null（避免显示整个数组）
        // 但如果是 totalAmount 等非数组字段，不应该进入这里
        if (fieldPath === 'itemAmount' || fieldPath === 'itemAmounts') {
          console.warn(`[DataAccessor] calc.${fieldPath} 是数组，但不在循环上下文中 (context.meta=${!!context.meta}, context.meta.index0=${context.meta?.index0})`);
        }
        return null;
      }
    }
    
    return value;
  }

  /**
   * 获取嵌套值
   * @param {Object} obj - 对象
   * @param {string|Array} path - 路径
   * @returns {any} 值
   */
  static getNestedValue(obj, path) {
    if (obj == null) {
      return null;
    }

    // 如果路径是数组，直接使用
    if (Array.isArray(path)) {
      let value = obj;
      for (const key of path) {
        if (value == null) return null;
        value = value[key];
      }
      return value;
    }

    // 如果路径是字符串，按点号分割
    if (typeof path === 'string') {
      const keys = path.split('.');
      let value = obj;
      for (const key of keys) {
        if (value == null) return null;
        value = value[key];
      }
      return value;
    }

    return null;
  }

  /**
   * 获取循环源数据
   * @param {string} source - 数据源表达式（如 'order.items'）
   * @param {Object} data - 数据对象
   * @param {Object} context - 上下文对象
   * @returns {Array|null} 数据数组
   */
  static getSourceData(source, data, context = {}) {
    const parts = source.split('.');
    const namespace = parts[0];
    const fieldPath = parts.slice(1).join('.');

    const namespaceData = data[namespace];
    if (namespaceData == null) {
      return null;
    }

    const value = this.getNestedValue(namespaceData, fieldPath);
    
    // 确保返回的是数组
    if (Array.isArray(value)) {
      return value;
    }
    
    return null;
  }

  /**
   * 检查字段是否存在
   * @param {string} namespace - 命名空间
   * @param {string|Array} fieldPath - 字段路径
   * @param {Object} data - 数据对象
   * @param {Object} context - 上下文对象
   * @returns {boolean} 是否存在
   */
  static hasField(namespace, fieldPath, data, context = {}) {
    const value = this.getValue(namespace, fieldPath, data, context);
    return value !== null && value !== undefined;
  }
}

