/**
 * 输入验证工具
 * 提供统一的输入验证功能，防止无效数据和注入攻击
 * ES6 模块化版本
 */

/**
 * 验证器集合
 */
export const validators = {
  /**
   * 验证合同号
   * 规则：字母、数字、连字符、下划线、括号、点号，长度不超过 100
   * 支持格式：SC2025-062 或 SC2025-220(NO.28888)
   * @param {string} value - 合同号
   * @returns {boolean} 是否有效
   */
  contractNo(value) {
    if (!value || typeof value !== 'string') return false;
    if (value.length > 100) return false;
    // 允许的字符：字母、数字、连字符、下划线、括号、点号、中文
    // 支持格式：SC2025-062 或 SC2025-220(NO.28888)
    return /^[a-zA-Z0-9_\-().\u4e00-\u9fa5]+$/.test(value.trim());
  },

  /**
   * 验证日期
   * @param {string|Date} value - 日期值
   * @returns {boolean} 是否有效
   */
  date(value) {
    if (!value) return false;
    const date = new Date(value);
    if (isNaN(date.getTime())) return false;
    // 检查是否为有效日期范围
    const minDate = new Date('1900-01-01');
    const maxDate = new Date('2100-12-31');
    return date >= minDate && date <= maxDate;
  },

  /**
   * 验证日期字符串格式 (YYYY-MM-DD)
   * @param {string} value - 日期字符串
   * @returns {boolean} 是否有效
   */
  dateString(value) {
    if (!value || typeof value !== 'string') return false;
    // 匹配 YYYY-MM-DD 格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value)) return false;
    // 验证日期有效性
    return validators.date(value);
  },

  /**
   * 验证客户名称
   * @param {string} value - 客户名称
   * @returns {boolean} 是否有效
   */
  customerName(value) {
    if (!value || typeof value !== 'string') return false;
    if (value.length > 200) return false;
    // 防止注入攻击：不允许 HTML 标签
    return !/[<>]/.test(value);
  },

  /**
   * 验证地址
   * @param {string} value - 地址
   * @returns {boolean} 是否有效
   */
  address(value) {
    if (!value || typeof value !== 'string') return false;
    if (value.length > 500) return false;
    // 防止注入攻击
    return !/[<>]/.test(value);
  },

  /**
   * 验证电话号码
   * @param {string} value - 电话号码
   * @returns {boolean} 是否有效
   */
  phone(value) {
    if (!value || typeof value !== 'string') return false;
    if (value.length > 50) return false;
    // 允许数字、空格、连字符、括号、加号
    return /^[0-9\s\-+()]+$/.test(value.trim());
  },

  /**
   * 验证金额
   * @param {number|string} value - 金额
   * @returns {boolean} 是否有效
   */
  money(value) {
    if (value === null || value === undefined) return false;
    const num = Number(value);
    if (isNaN(num)) return false;
    // 金额应该大于等于 0，小于等于 999999999
    return num >= 0 && num <= 999999999;
  },

  /**
   * 验证数量（整数）
   * @param {number|string} value - 数量
   * @returns {boolean} 是否有效
   */
  quantity(value) {
    if (value === null || value === undefined) return false;
    const num = Number(value);
    if (isNaN(num)) return false;
    // 数量应该大于 0，且为整数
    return num > 0 && Number.isInteger(num) && num <= 999999;
  },

  /**
   * 验证非空字符串
   * @param {string} value - 字符串值
   * @returns {boolean} 是否有效
   */
  required(value) {
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return value !== null && value !== undefined && value !== '';
  },

  /**
   * 验证邮箱（可选）
   * @param {string} value - 邮箱地址
   * @returns {boolean} 是否有效
   */
  email(value) {
    if (!value || typeof value !== 'string') return false;
    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value.trim());
  }
};

/**
 * 验证输入值
 * @param {any} value - 要验证的值
 * @param {string|string[]|Function} validator - 验证器名称、验证器名称数组或自定义验证函数
 * @returns {{valid: boolean, error?: string}} 验证结果
 */
export function validate(value, validator) {
  // 如果是数组，依次验证
  if (Array.isArray(validator)) {
    for (const v of validator) {
      const result = validate(value, v);
      if (!result.valid) {
        return result;
      }
    }
    return { valid: true };
  }

  // 如果是自定义函数
  if (typeof validator === 'function') {
    const valid = validator(value);
    return {
      valid,
      error: valid ? undefined : '验证失败'
    };
  }

  // 如果是字符串，查找对应的验证器
  if (typeof validator === 'string') {
    const validatorFn = validators[validator];
    if (!validatorFn) {
      console.warn(`[Validation] 未知的验证器: ${validator}`);
      return { valid: true }; // 未知验证器默认通过
    }

    const valid = validatorFn(value);
    return {
      valid,
      error: valid ? undefined : getErrorMessage(validator, value)
    };
  }

  return { valid: true };
}

/**
 * 获取错误消息
 * @param {string} validatorName - 验证器名称
 * @param {any} value - 验证的值
 * @returns {string} 错误消息
 */
function getErrorMessage(validatorName, value) {
  const messages = {
    contractNo: '合同号格式无效，只能包含字母、数字、连字符和下划线，长度不超过100',
    date: '日期格式无效',
    dateString: '日期格式无效，应为 YYYY-MM-DD 格式',
    customerName: '客户名称无效，长度不超过200，不能包含特殊字符',
    address: '地址无效，长度不超过500，不能包含特殊字符',
    phone: '电话号码格式无效',
    money: '金额无效，应为大于等于0的数字',
    quantity: '数量无效，应为大于0的整数',
    required: '此项为必填项',
    email: '邮箱格式无效'
  };

  return messages[validatorName] || '验证失败';
}

/**
 * 验证并返回清理后的值
 * @param {any} value - 原始值
 * @param {string|string[]|Function} validator - 验证器
 * @returns {{valid: boolean, value?: any, error?: string}} 验证结果和清理后的值
 */
export function validateAndClean(value, validator) {
  const result = validate(value, validator);
  
  if (!result.valid) {
    return result;
  }

  // 如果是字符串，清理空白字符
  if (typeof value === 'string') {
    return {
      valid: true,
      value: value.trim()
    };
  }

  return {
    valid: true,
    value
  };
}

/**
 * 批量验证对象
 * @param {Object} data - 要验证的数据对象
 * @param {Object} rules - 验证规则 {field: validator}
 * @returns {{valid: boolean, errors?: Object}} 验证结果
 */
export function validateObject(data, rules) {
  const errors = {};
  let isValid = true;

  for (const [field, validator] of Object.entries(rules)) {
    const result = validate(data[field], validator);
    if (!result.valid) {
      errors[field] = result.error;
      isValid = false;
    }
  }

  return {
    valid: isValid,
    errors: isValid ? undefined : errors
  };
}

/**
 * 创建输入验证装饰器（用于 DOM 输入元素）
 * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} element - 输入元素
 * @param {string|string[]|Function} validator - 验证器
 * @param {Function} onError - 错误回调函数
 * @returns {Function} 清理函数
 */
export function bindValidation(element, validator, onError) {
  if (!element) {
    console.warn('[Validation] 无效的元素');
    return () => {};
  }

  const validateInput = () => {
    const value = element.value;
    const result = validate(value, validator);

    if (!result.valid) {
      // 添加错误样式
      element.classList.add('validation-error');
      if (onError) {
        onError(result.error);
      }
      return false;
    } else {
      // 移除错误样式
      element.classList.remove('validation-error');
      return true;
    }
  };

  // 绑定验证事件
  element.addEventListener('blur', validateInput);
  element.addEventListener('input', () => {
    // 输入时移除错误样式
    element.classList.remove('validation-error');
  });

  // 返回清理函数
  return () => {
    element.removeEventListener('blur', validateInput);
    element.classList.remove('validation-error');
  };
}
