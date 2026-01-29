/**
 * 日志工具
 * 支持开发/生产模式切换
 * 生产环境自动禁用详细日志
 */

class Logger {
  constructor() {
    // 检测是否为开发环境
    this.isDevelopment = this.detectDevelopment();
    // 从localStorage读取日志级别设置
    this.logLevel = this.getLogLevel();
  }

  /**
   * 检测是否为开发环境
   */
  detectDevelopment() {
    // 检查hostname（localhost或127.0.0.1）
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
        return true;
      }
    }
    // 检查是否有开发模式标记
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      return true;
    }
    return false;
  }

  /**
   * 获取日志级别
   */
  getLogLevel() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const level = window.localStorage.getItem('documentCenterLogLevel');
      if (level) {
        return level;
      }
    }
    return this.isDevelopment ? 'debug' : 'warn';
  }

  /**
   * 设置日志级别
   */
  setLogLevel(level) {
    this.logLevel = level;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('documentCenterLogLevel', level);
    }
  }

  /**
   * 检查是否应该输出日志
   */
  shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Debug日志
   */
  debug(...args) {
    if (this.shouldLog('debug')) {
      console.log('[DocumentCenter:DEBUG]', ...args);
    }
  }

  /**
   * Info日志
   */
  info(...args) {
    if (this.shouldLog('info')) {
      console.info('[DocumentCenter:INFO]', ...args);
    }
  }

  /**
   * Warning日志
   */
  warn(...args) {
    if (this.shouldLog('warn')) {
      console.warn('[DocumentCenter:WARN]', ...args);
    }
  }

  /**
   * Error日志
   */
  error(...args) {
    if (this.shouldLog('error')) {
      console.error('[DocumentCenter:ERROR]', ...args);
    }
  }

  /**
   * 性能计时
   */
  time(label) {
    if (this.shouldLog('debug')) {
      console.time(`[DocumentCenter] ${label}`);
    }
  }

  /**
   * 性能计时结束
   */
  timeEnd(label) {
    if (this.shouldLog('debug')) {
      console.timeEnd(`[DocumentCenter] ${label}`);
    }
  }
}

// 导出单例
export const logger = new Logger();

// 在开发环境中，可以通过控制台设置日志级别
if (typeof window !== 'undefined') {
  window.documentCenterLogger = logger;
  window.setDocumentCenterLogLevel = (level) => {
    logger.setLogLevel(level);
    console.log(`[DocumentCenter] 日志级别已设置为: ${level}`);
  };
}

