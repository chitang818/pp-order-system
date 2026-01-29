/**
 * 单据中心统一错误处理类
 * 提供统一的错误处理和上报机制
 */

export class DocumentCenterErrorHandler {
  /**
   * 处理错误
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文（如函数名、模块名）
   * @param {Object} options - 额外选项
   * @param {boolean} options.silent - 是否静默处理（不显示提示）
   * @param {string} options.customMessage - 自定义错误消息
   */
  static handle(error, context, options = {}) {
    const { silent = false, customMessage } = options;
    
    console.error(`[${context}] 错误:`, error);
    
    // 根据错误类型显示不同的提示
    let message = customMessage;
    
    if (!message) {
      if (error.name === 'NetworkError' || error.message?.includes('fetch')) {
        message = '网络错误，请检查网络连接';
      } else if (error.name === 'ValidationError' || error.message?.includes('验证')) {
        message = error.message || '数据验证失败';
      } else if (error.message) {
        message = error.message;
      } else {
        message = '操作失败，请稍后重试';
      }
    }
    
    // 显示用户友好的错误提示
    if (!silent && window.NotificationSystem) {
      const errorType = this.getErrorType(error);
      window.NotificationSystem.toast(message, errorType);
    }
    
    // 上报错误到监控系统
    this.reportError(error, context);
    
    return {
      success: false,
      error: error.message || '未知错误',
      context
    };
  }
  
  /**
   * 获取错误类型（用于通知系统）
   * @param {Error} error - 错误对象
   * @returns {string} 'error' | 'warning' | 'info'
   */
  static getErrorType(error) {
    if (error.name === 'ValidationError') {
      return 'warning';
    }
    if (error.name === 'NetworkError') {
      return 'error';
    }
    return 'error';
  }
  
  /**
   * 上报错误到监控系统
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   */
  static reportError(error, context) {
    // 发送错误到监控系统
    if (window.errorReporter) {
      window.errorReporter.report({
        error: error.message || '未知错误',
        stack: error.stack,
        context,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      });
    } else {
      // 开发环境下输出详细错误信息
      if (process.env.NODE_ENV === 'development') {
        console.group(`[错误上报] ${context}`);
        console.error('错误信息:', error.message);
        console.error('错误堆栈:', error.stack);
        console.error('错误上下文:', context);
        console.groupEnd();
      }
    }
  }
  
  /**
   * 安全执行异步操作
   * @param {Function} operation - 异步操作函数
   * @param {string} context - 上下文
   * @param {Object} options - 选项
   * @returns {Promise<*>} 操作结果，失败时返回null
   */
  static async safeAsync(operation, context, options = {}) {
    try {
      const result = await operation();
      return { success: true, data: result };
    } catch (error) {
      return this.handle(error, context, options);
    }
  }
  
  /**
   * 安全执行同步操作
   * @param {Function} operation - 同步操作函数
   * @param {string} context - 上下文
   * @param {Object} options - 选项
   * @returns {*} 操作结果，失败时返回null
   */
  static safeSync(operation, context, options = {}) {
    try {
      const result = operation();
      return { success: true, data: result };
    } catch (error) {
      return this.handle(error, context, options);
    }
  }
}

