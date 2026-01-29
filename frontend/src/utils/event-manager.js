/**
 * 事件监听器管理工具
 * 用于统一管理事件监听器，防止内存泄漏
 * ES6 模块化版本
 */

export class EventManager {
  constructor() {
    /**
     * 存储所有事件监听器
     * Map<element, Set<{event, handler, options}>>
     */
    this.listeners = new Map();
  }

  /**
   * 添加事件监听器
   * @param {HTMLElement} element - DOM 元素
   * @param {string} event - 事件类型
   * @param {Function} handler - 事件处理函数
   * @param {Object|boolean} options - 事件选项（可选，如 {capture, once, passive}）
   * @returns {boolean} 是否成功添加
   */
  on(element, event, handler, options = false) {
    if (!element || typeof handler !== 'function') {
      console.warn('[EventManager] 无效的参数:', { element, event, handler });
      return false;
    }

    // 初始化元素的监听器集合
    if (!this.listeners.has(element)) {
      this.listeners.set(element, new Set());
    }

    const handlers = this.listeners.get(element);
    
    // 检查是否已存在相同的监听器
    for (const listener of handlers) {
      if (listener.event === event && listener.handler === handler) {
        console.warn(`[EventManager] 监听器已存在: ${event} on`, element);
        return false;
      }
    }

    // 添加监听器
    const listener = { event, handler, options };
    handlers.add(listener);
    element.addEventListener(event, handler, options);

    return true;
  }

  /**
   * 移除事件监听器
   * @param {HTMLElement} element - DOM 元素
   * @param {string} event - 事件类型（可选，不提供则移除所有事件）
   * @param {Function} handler - 事件处理函数（可选，不提供则移除所有该事件的监听器）
   * @returns {boolean} 是否成功移除
   */
  off(element, event, handler) {
    if (!element) {
      console.warn('[EventManager] 无效的元素');
      return false;
    }

    const handlers = this.listeners.get(element);
    if (!handlers || handlers.size === 0) {
      return false;
    }

    let removed = false;

    // 如果没有指定事件和处理器，移除所有监听器
    if (!event && !handler) {
      handlers.forEach(({ event: evt, handler: hdl, options }) => {
        element.removeEventListener(evt, hdl, options);
        removed = true;
      });
      handlers.clear();
      this.listeners.delete(element);
      return removed;
    }

    // 移除匹配的监听器
    const toRemove = [];
    handlers.forEach((listener) => {
      const matchEvent = !event || listener.event === event;
      const matchHandler = !handler || listener.handler === handler;
      
      if (matchEvent && matchHandler) {
        element.removeEventListener(listener.event, listener.handler, listener.options);
        toRemove.push(listener);
        removed = true;
      }
    });

    // 从集合中移除
    toRemove.forEach(listener => handlers.delete(listener));

    // 如果元素没有监听器了，从 Map 中删除
    if (handlers.size === 0) {
      this.listeners.delete(element);
    }

    return removed;
  }

  /**
   * 清除指定元素的所有事件监听器
   * @param {HTMLElement} element - DOM 元素
   * @returns {boolean} 是否成功清除
   */
  clear(element) {
    return this.off(element);
  }

  /**
   * 清除所有事件监听器
   * @returns {number} 清除的监听器数量
   */
  clearAll() {
    let count = 0;
    this.listeners.forEach((handlers, element) => {
      handlers.forEach(({ event, handler, options }) => {
        element.removeEventListener(event, handler, options);
        count++;
      });
    });
    this.listeners.clear();
    return count;
  }

  /**
   * 获取指定元素的事件监听器数量
   * @param {HTMLElement} element - DOM 元素
   * @returns {number} 监听器数量
   */
  getListenerCount(element) {
    const handlers = this.listeners.get(element);
    return handlers ? handlers.size : 0;
  }

  /**
   * 获取所有元素的监听器统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    let totalListeners = 0;
    let totalElements = this.listeners.size;

    this.listeners.forEach((handlers) => {
      totalListeners += handlers.size;
    });

    return {
      totalElements,
      totalListeners,
      averageListenersPerElement: totalElements > 0 ? (totalListeners / totalElements).toFixed(2) : 0
    };
  }

  /**
   * 检查元素是否有指定事件的监听器
   * @param {HTMLElement} element - DOM 元素
   * @param {string} event - 事件类型
   * @returns {boolean} 是否存在
   */
  has(element, event) {
    const handlers = this.listeners.get(element);
    if (!handlers) return false;

    for (const listener of handlers) {
      if (listener.event === event) {
        return true;
      }
    }
    return false;
  }
}

/**
 * 创建全局事件管理器实例
 */
export const eventManager = new EventManager();

/**
 * 便捷函数：添加事件监听器
 * @param {HTMLElement} element - DOM 元素
 * @param {string} event - 事件类型
 * @param {Function} handler - 事件处理函数
 * @param {Object|boolean} options - 事件选项
 */
export function on(element, event, handler, options) {
  return eventManager.on(element, event, handler, options);
}

/**
 * 便捷函数：移除事件监听器
 * @param {HTMLElement} element - DOM 元素
 * @param {string} event - 事件类型
 * @param {Function} handler - 事件处理函数
 */
export function off(element, event, handler) {
  return eventManager.off(element, event, handler);
}

/**
 * 便捷函数：清除元素的所有监听器
 * @param {HTMLElement} element - DOM 元素
 */
export function clear(element) {
  return eventManager.clear(element);
}

