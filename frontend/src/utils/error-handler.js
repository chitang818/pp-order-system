/**
 * 统一错误处理工具
 * ES6 模块化版本
 * 提供标准化的错误处理、日志记录和用户提示
 */

export class ErrorHandler {
  /**
   * 错误类型常量
   */
  static ERROR_TYPES = {
    NETWORK: 'network',
    VALIDATION: 'validation',
    STORAGE: 'storage',
    EXPORT: 'export',
    SYSTEM: 'system',
    USER: 'user'
  };

  /**
   * 错误级别常量
   */
  static ERROR_LEVELS = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
  };

  /**
   * 处理错误
   * @param {Error|string} error - 错误对象或错误消息
   * @param {Object} options - 处理选项
   */
  static handle(error, options = {}) {
    // 记录原始错误到全局，方便调试
    window.__LAST_ERROR__ = error;
    console.error('[ErrorHandler] 捕获到错误:', error);
    if (error && error.stack) console.error('[ErrorHandler] 错误堆栈:', error.stack);

    const {
      type = this.ERROR_TYPES.SYSTEM,
      level = this.ERROR_LEVELS.MEDIUM,
      showToUser = true,
      logToConsole = true,
      context = null,
      action = null
    } = options;

    const errorInfo = this.parseError(error, type, level, context);

    // 记录日志
    if (logToConsole) {
      this.logError(errorInfo);
    }

    // 显示给用户
    if (showToUser) {
      this.showErrorToUser(errorInfo, action);
    }

    // 发送错误报告（如果配置了）
    this.reportError(errorInfo);

    return errorInfo;
  }

  /**
   * 解析错误信息
   * @param {Error|string} error - 错误
   * @param {string} type - 错误类型
   * @param {string} level - 错误级别
   * @param {Object} context - 上下文信息
   * @returns {Object} - 解析后的错误信息
   */
  static parseError(error, type, level, context) {
    let message, stack, code;

    if (error instanceof Error) {
      message = error.message;
      stack = error.stack;
      code = error.code;
    } else {
      message = String(error);
      stack = new Error().stack;
    }

    return {
      message,
      stack,
      code,
      type,
      level,
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };
  }

  /**
   * 记录错误日志
   * @param {Object} errorInfo - 错误信息
   */
  static logError(errorInfo) {
    const { message, type, level, context, timestamp } = errorInfo;

    const logMessage = `[${timestamp}] [${type.toUpperCase()}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case this.ERROR_LEVELS.LOW:
        console.info(logMessage, context);
        break;
      case this.ERROR_LEVELS.MEDIUM:
        console.warn(logMessage, context);
        break;
      case this.ERROR_LEVELS.HIGH:
      case this.ERROR_LEVELS.CRITICAL:
        console.error(logMessage, context);
        break;
      default:
        console.log(logMessage, context);
    }
  }

  /**
   * 向用户显示错误
   * @param {Object} errorInfo - 错误信息
   * @param {string} action - 建议的操作
   */
  static showErrorToUser(errorInfo, action) {
    const { message, type, level } = errorInfo;

    const userMessage = this.getUserFriendlyMessage(message, type);
    const fullMessage = action ? `${userMessage}\n\n建议操作：${action}` : userMessage;

    // 检查是否是订单保存相关的错误，如果是则不显示
    if (userMessage.includes('系统出现异常，请刷新页面后重试') &&
      (message.includes('订单') || message.includes('order') || message.includes('save'))) {
      console.warn('订单保存相关的系统异常消息被阻止:', message);
      return;
    }

    const toastType = this.getToastType(level);

    if (window.NotificationSystem) {
      window.NotificationSystem.toast(fullMessage, toastType);
    } else {
      // 降级到原生 alert
      alert(fullMessage);
    }
  }

  /**
   * 获取用户友好的错误消息
   * @param {string} message - 原始错误消息
   * @param {string} type - 错误类型
   * @returns {string} - 用户友好的消息
   */
  static getUserFriendlyMessage(message, type) {
    // 网络错误
    if (type === this.ERROR_TYPES.NETWORK) {
      if (message.includes('fetch')) {
        return '网络连接失败，请检查网络设置后重试';
      }
      if (message.includes('timeout')) {
        return '请求超时，请稍后重试';
      }
      if (message.includes('404')) {
        return '请求的资源不存在';
      }
      if (message.includes('500')) {
        return '服务器内部错误，请联系管理员';
      }
      return '网络请求失败，请检查网络连接';
    }

    // 验证错误
    if (type === this.ERROR_TYPES.VALIDATION) {
      return message; // 验证错误通常已经是用户友好的
    }

    // 存储错误
    if (type === this.ERROR_TYPES.STORAGE) {
      if (message.includes('quota')) {
        return '存储空间不足，请清理浏览器数据后重试';
      }
      return '数据存储失败，请检查浏览器设置';
    }

    // 导出错误
    if (type === this.ERROR_TYPES.EXPORT) {
      return '文件导出失败，请检查浏览器支持或稍后重试';
    }

    // 用户操作错误
    if (type === this.ERROR_TYPES.USER) {
      return message;
    }

    // 系统错误
    return '系统出现异常，请刷新页面后重试';
  }

  /**
   * 获取 Toast 类型
   * @param {string} level - 错误级别
   * @returns {string} - Toast 类型
   */
  static getToastType(level) {
    switch (level) {
      case this.ERROR_LEVELS.LOW:
        return 'info';
      case this.ERROR_LEVELS.MEDIUM:
        return 'warning';
      case this.ERROR_LEVELS.HIGH:
      case this.ERROR_LEVELS.CRITICAL:
        return 'error';
      default:
        return 'warning';
    }
  }

  /**
   * 发送错误报告
   * @param {Object} errorInfo - 错误信息
   */
  static reportError(errorInfo) {
    // 这里可以实现错误报告功能，比如发送到服务器
    // 目前只是存储到本地
    try {
      const errors = JSON.parse(localStorage.getItem('error_logs') || '[]');
      errors.push(errorInfo);

      // 只保留最近100条错误
      if (errors.length > 100) {
        errors.splice(0, errors.length - 100);
      }

      localStorage.setItem('error_logs', JSON.stringify(errors));
    } catch (e) {
      console.warn('无法保存错误日志:', e);
    }
  }

  /**
   * 网络错误处理器
   * @param {Error} error - 网络错误
   * @param {Object} options - 选项
   */
  static handleNetworkError(error, options = {}) {
    return this.handle(error, {
      type: this.ERROR_TYPES.NETWORK,
      level: this.ERROR_LEVELS.HIGH,
      action: '请检查网络连接或稍后重试',
      ...options
    });
  }

  /**
   * 验证错误处理器
   * @param {string|Array} errors - 验证错误
   * @param {Object} options - 选项
   */
  static handleValidationError(errors, options = {}) {
    const message = Array.isArray(errors) ? errors.join('\n') : errors;

    return this.handle(message, {
      type: this.ERROR_TYPES.VALIDATION,
      level: this.ERROR_LEVELS.MEDIUM,
      action: '请检查输入信息并修正',
      ...options
    });
  }

  /**
   * 存储错误处理器
   * @param {Error} error - 存储错误
   * @param {Object} options - 选项
   */
  static handleStorageError(error, options = {}) {
    return this.handle(error, {
      type: this.ERROR_TYPES.STORAGE,
      level: this.ERROR_LEVELS.MEDIUM,
      action: '请检查浏览器存储设置',
      ...options
    });
  }

  /**
   * 导出错误处理器
   * @param {Error} error - 导出错误
   * @param {Object} options - 选项
   */
  static handleExportError(error, options = {}) {
    return this.handle(error, {
      type: this.ERROR_TYPES.EXPORT,
      level: this.ERROR_LEVELS.HIGH,
      action: '请检查浏览器支持或稍后重试',
      ...options
    });
  }

  /**
   * 获取错误日志
   * @param {number} limit - 限制数量
   * @returns {Array} - 错误日志列表
   */
  static getErrorLogs(limit = 50) {
    try {
      const errors = JSON.parse(localStorage.getItem('error_logs') || '[]');
      return errors.slice(-limit);
    } catch (e) {
      return [];
    }
  }

  /**
   * 清除错误日志
   */
  static clearErrorLogs() {
    try {
      localStorage.removeItem('error_logs');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 创建安全的异步函数包装器
   * @param {Function} fn - 异步函数
   * @param {Object} errorOptions - 错误处理选项
   * @returns {Function} - 包装后的函数
   */
  static wrapAsync(fn, errorOptions = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handle(error, errorOptions);
        throw error;
      }
    };
  }

  /**
   * 创建安全的同步函数包装器
   * @param {Function} fn - 同步函数
   * @param {Object} errorOptions - 错误处理选项
   * @returns {Function} - 包装后的函数
   */
  static wrapSync(fn, errorOptions = {}) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        this.handle(error, errorOptions);
        throw error;
      }
    };
  }
}

// 默认导出类
export default ErrorHandler;

// 导出到全局作用域（保持向后兼容）
window.ErrorHandler = ErrorHandler;

// 全局错误处理
window.addEventListener('error', (event) => {
  ErrorHandler.handle(event.error, {
    type: ErrorHandler.ERROR_TYPES.SYSTEM,
    level: ErrorHandler.ERROR_LEVELS.HIGH,
    context: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    }
  });
});

// 未处理的 Promise 拒绝
window.addEventListener('unhandledrejection', (event) => {
  // 检查是否应该忽略这个错误
  const reason = event.reason;
  const reasonStr = String(reason);

  // 常见的可以忽略的错误类型
  const shouldIgnoreError =
    // 订单保存相关错误
    reasonStr.includes('订单保存') ||
    reasonStr.includes('ApiService.orders') ||
    reasonStr.includes('btnSaveOrderNew') ||
    reasonStr.includes('order-new.html') ||
    reasonStr.includes('serializeOrderForm') ||
    // 网络连接错误（后端重启时的正常情况）
    reasonStr.includes('Failed to fetch') ||
    reasonStr.includes('NetworkError') ||
    reasonStr.includes('ERR_NETWORK') ||
    reasonStr.includes('后端服务暂时不可用') ||
    reasonStr.includes('Service temporarily unavailable') ||
    reasonStr.includes('ECONNREFUSED') ||
    // 用户取消操作
    reasonStr.includes('用户取消') ||
    reasonStr.includes('User cancelled') ||
    // 非关键性的UI错误
    reasonStr.includes('ResizeObserver') ||
    reasonStr.includes('Non-Error promise rejection') ||
    // 检查是否是临时错误（后端启动时）
    (reason && reason.isTemporary === true) ||
    // 检查调用栈
    (reason && reason.stack && (
      reason.stack.includes('btnSaveOrderNew') ||
      reason.stack.includes('order-new.html') ||
      reason.stack.includes('serializeOrderForm') ||
      reason.stack.includes('ApiService.orders') ||
      reason.stack.includes('addEventListener')
    )) ||
    // 检查Promise相关
    (event.promise && event.promise.toString && (
      event.promise.toString().includes('order') ||
      event.promise.toString().includes('save')
    ));

  if (shouldIgnoreError) {
    console.warn('已忽略的Promise拒绝:', reason);
    event.preventDefault(); // 阻止默认的unhandledrejection处理
    return;
  }

  // 只处理真正需要用户关注的系统级错误
  console.error('未处理的Promise拒绝:', reason);
  window.__LAST_ERROR__ = reason;

  if (reason && reason.stack) console.error('[Global Error] 异常堆栈:', reason.stack);

  ErrorHandler.handle(reason, {
    type: ErrorHandler.ERROR_TYPES.SYSTEM,
    level: ErrorHandler.ERROR_LEVELS.MEDIUM, // 降低错误级别
    context: {
      promise: event.promise
    },
    showToUser: false // 暂时不显示给用户，只记录日志
  });
});
