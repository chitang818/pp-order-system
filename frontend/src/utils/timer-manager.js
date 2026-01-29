/**
 * 定时器管理工具
 * 用于统一管理 setTimeout/setInterval，防止内存泄漏
 * ES6 模块化版本
 */

export class TimerManager {
  constructor() {
    /**
     * 存储所有活跃的定时器
     * Set<timerId>
     */
    this.timers = new Set();
    
    /**
     * 存储定时器信息（用于调试）
     * Map<timerId, {type, callback, delay, createdAt}>
     */
    this.timerInfo = new Map();

    /**
     * 保存原生定时器函数的引用，避免递归调用
     */
    this._nativeSetTimeout = window.setTimeout.bind(window);
    this._nativeSetInterval = window.setInterval.bind(window);
    this._nativeClearTimeout = window.clearTimeout.bind(window);
    this._nativeClearInterval = window.clearInterval.bind(window);
  }

  /**
   * 创建延迟执行的定时器
   * @param {Function} callback - 回调函数
   * @param {number} delay - 延迟时间（毫秒）
   * @returns {number} 定时器 ID
   */
  setTimeout(callback, delay = 0) {
    if (typeof callback !== 'function') {
      console.warn('[TimerManager] 无效的回调函数');
      return -1;
    }

    // 使用原生 setTimeout，避免递归调用
    const timerId = this._nativeSetTimeout(() => {
      callback();
      // 执行完成后从集合中移除
      this.timers.delete(timerId);
      this.timerInfo.delete(timerId);
    }, delay);

    // 记录定时器
    this.timers.add(timerId);
    this.timerInfo.set(timerId, {
      type: 'setTimeout',
      callback: callback.toString().slice(0, 50) + '...', // 只保存函数签名用于调试
      delay,
      createdAt: new Date().toISOString()
    });

    return timerId;
  }

  /**
   * 创建间隔执行的定时器
   * @param {Function} callback - 回调函数
   * @param {number} delay - 间隔时间（毫秒）
   * @returns {number} 定时器 ID
   */
  setInterval(callback, delay = 0) {
    if (typeof callback !== 'function') {
      console.warn('[TimerManager] 无效的回调函数');
      return -1;
    }

    // 使用原生 setInterval，避免递归调用
    const timerId = this._nativeSetInterval(callback, delay);

    // 记录定时器
    this.timers.add(timerId);
    this.timerInfo.set(timerId, {
      type: 'setInterval',
      callback: callback.toString().slice(0, 50) + '...',
      delay,
      createdAt: new Date().toISOString()
    });

    return timerId;
  }

  /**
   * 清除指定的定时器
   * @param {number} timerId - 定时器 ID
   * @returns {boolean} 是否成功清除
   */
  clearTimeout(timerId) {
    if (this.timers.has(timerId)) {
      // 使用原生 clearTimeout，避免递归调用
      this._nativeClearTimeout(timerId);
      this.timers.delete(timerId);
      this.timerInfo.delete(timerId);
      return true;
    }
    return false;
  }

  /**
   * 清除指定的间隔定时器
   * @param {number} timerId - 定时器 ID
   * @returns {boolean} 是否成功清除
   */
  clearInterval(timerId) {
    if (this.timers.has(timerId)) {
      // 使用原生 clearInterval，避免递归调用
      this._nativeClearInterval(timerId);
      this.timers.delete(timerId);
      this.timerInfo.delete(timerId);
      return true;
    }
    return false;
  }

  /**
   * 清除所有定时器
   * @returns {number} 清除的定时器数量
   */
  clearAll() {
    let count = 0;
    this.timers.forEach(timerId => {
      // 使用原生清除函数，尝试作为 setTimeout 和 setInterval 清除
      this._nativeClearTimeout(timerId);
      this._nativeClearInterval(timerId);
      count++;
    });
    this.timers.clear();
    this.timerInfo.clear();
    return count;
  }

  /**
   * 获取活跃定时器数量
   * @returns {number} 定时器数量
   */
  getTimerCount() {
    return this.timers.size;
  }

  /**
   * 获取定时器统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const stats = {
      total: this.timers.size,
      timeouts: 0,
      intervals: 0,
      details: []
    };

    this.timerInfo.forEach((info, timerId) => {
      if (info.type === 'setTimeout') {
        stats.timeouts++;
      } else if (info.type === 'setInterval') {
        stats.intervals++;
      }
      stats.details.push({ timerId, ...info });
    });

    return stats;
  }

  /**
   * 检查指定定时器是否存在
   * @param {number} timerId - 定时器 ID
   * @returns {boolean} 是否存在
   */
  has(timerId) {
    return this.timers.has(timerId);
  }
}

/**
 * 创建全局定时器管理器实例
 */
export const timerManager = new TimerManager();

/**
 * 便捷函数：创建延迟定时器
 * @param {Function} callback - 回调函数
 * @param {number} delay - 延迟时间（毫秒）
 */
export function setTimeout(callback, delay) {
  return timerManager.setTimeout(callback, delay);
}

/**
 * 便捷函数：创建间隔定时器
 * @param {Function} callback - 回调函数
 * @param {number} delay - 间隔时间（毫秒）
 */
export function setInterval(callback, delay) {
  return timerManager.setInterval(callback, delay);
}

/**
 * 便捷函数：清除延迟定时器
 * @param {number} timerId - 定时器 ID
 */
export function clearTimeout(timerId) {
  return timerManager.clearTimeout(timerId);
}

/**
 * 便捷函数：清除间隔定时器
 * @param {number} timerId - 定时器 ID
 */
export function clearInterval(timerId) {
  return timerManager.clearInterval(timerId);
}

