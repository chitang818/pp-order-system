/**
 * 绑定工具函数
 * 提供事件绑定和元素绑定的通用工具
 * ES6 模块化版本
 */

/**
 * 检查元素是否已绑定
 * @param {HTMLElement} element - 目标元素
 * @param {string} attribute - 绑定标记属性名
 * @returns {boolean} 是否已绑定
 */
export function isBound(element, attribute = 'data-bound') {
  if (!element) return false;
  return element.hasAttribute(attribute);
}

/**
 * 标记元素为已绑定
 * @param {HTMLElement} element - 目标元素
 * @param {string} attribute - 绑定标记属性名
 */
export function markAsBound(element, attribute = 'data-bound') {
  if (!element) return;
  element.setAttribute(attribute, 'true');
}

/**
 * 安全绑定事件（防止重复绑定）
 * @param {HTMLElement} element - 目标元素
 * @param {string} event - 事件类型
 * @param {Function} handler - 事件处理函数
 * @param {Object} options - 选项
 * @param {string} options.boundAttribute - 绑定标记属性名，默认 'data-bound'
 * @param {Function} options.eventManager - 事件管理器（可选）
 * @returns {boolean} 是否成功绑定
 */
export function safeBindEvent(element, event, handler, options = {}) {
  if (!element) {
    console.warn('[binding-utils] 元素不存在，无法绑定事件');
    return false;
  }
  
  const boundAttribute = options.boundAttribute || 'data-bound';
  const eventManager = options.eventManager || null;
  
  // 检查是否已绑定
  if (isBound(element, boundAttribute)) {
    console.log('[binding-utils] 元素已绑定，跳过');
    return false;
  }
  
  // 标记为已绑定
  markAsBound(element, boundAttribute);
  
  // 使用事件管理器或原生方式绑定
  if (eventManager && typeof eventManager.on === 'function') {
    eventManager.on(element, event, handler);
  } else {
    element.addEventListener(event, handler);
  }
  
  return true;
}

/**
 * 批量绑定事件
 * @param {Array<Object>} bindings - 绑定配置数组
 * @param {HTMLElement} bindings[].element - 目标元素
 * @param {string} bindings[].event - 事件类型
 * @param {Function} bindings[].handler - 事件处理函数
 * @param {Object} options - 选项
 * @param {Function} options.eventManager - 事件管理器（可选）
 * @returns {number} 成功绑定的数量
 */
export function bindEvents(bindings, options = {}) {
  if (!Array.isArray(bindings)) {
    console.warn('[binding-utils] bindings 必须是数组');
    return 0;
  }
  
  const eventManager = options.eventManager || null;
  let successCount = 0;
  
  bindings.forEach(({ element, event, handler, boundAttribute }) => {
    if (safeBindEvent(element, event, handler, { 
      boundAttribute, 
      eventManager 
    })) {
      successCount++;
    }
  });
  
  return successCount;
}

/**
 * 获取元素（支持多种选择器）
 * @param {string|HTMLElement} selector - 选择器或元素
 * @returns {HTMLElement|null} 找到的元素
 */
export function getElement(selector) {
  if (!selector) return null;
  if (selector instanceof HTMLElement) return selector;
  if (typeof selector === 'string') {
    return document.querySelector(selector) || document.getElementById(selector);
  }
  return null;
}

/**
 * 获取多个元素
 * @param {string} selector - 选择器
 * @returns {NodeList|Array} 元素列表
 */
export function getElements(selector) {
  if (!selector) return [];
  return document.querySelectorAll(selector);
}

/**
 * 等待元素出现
 * @param {string} selector - 选择器
 * @param {Object} options - 选项
 * @param {number} options.timeout - 超时时间（毫秒），默认 5000
 * @param {number} options.interval - 检查间隔（毫秒），默认 100
 * @returns {Promise<HTMLElement>} 找到的元素
 */
export function waitForElement(selector, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 5000;
    const interval = options.interval || 100;
    const startTime = Date.now();
    
    const check = () => {
      const element = getElement(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error(`元素 ${selector} 在 ${timeout}ms 内未找到`));
        return;
      }
      
      setTimeout(check, interval);
    };
    
    check();
  });
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @param {Object} options - 选项
 * @param {Function} options.timerManager - 定时器管理器（可选）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay, options = {}) {
  let timeoutId = null;
  const timerManager = options.timerManager || null;
  
  const debounced = function(...args) {
    const clearFn = timerManager ? 
      (id) => timerManager.clearTimeout(id) :
      (id) => clearTimeout(id);
    
    const setFn = timerManager ?
      (fn, delay) => timerManager.setTimeout(fn, delay) :
      (fn, delay) => setTimeout(fn, delay);
    
    if (timeoutId !== null) {
      clearFn(timeoutId);
    }
    
    timeoutId = setFn(() => {
      func.apply(this, args);
      timeoutId = null;
    }, delay);
  };
  
  debounced.cancel = () => {
    if (timeoutId !== null) {
      const clearFn = timerManager ?
        (id) => timerManager.clearTimeout(id) :
        (id) => clearTimeout(id);
      clearFn(timeoutId);
      timeoutId = null;
    }
  };
  
  return debounced;
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @param {Object} options - 选项
 * @param {Function} options.timerManager - 定时器管理器（可选）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, delay, options = {}) {
  let lastCallTime = 0;
  let timeoutId = null;
  const timerManager = options.timerManager || null;
  
  const throttled = function(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    
    const clearFn = timerManager ?
      (id) => timerManager.clearTimeout(id) :
      (id) => clearTimeout(id);
    
    const setFn = timerManager ?
      (fn, delay) => timerManager.setTimeout(fn, delay) :
      (fn, delay) => setTimeout(fn, delay);
    
    if (timeSinceLastCall >= delay) {
      lastCallTime = now;
      func.apply(this, args);
    } else {
      if (timeoutId !== null) {
        clearFn(timeoutId);
      }
      timeoutId = setFn(() => {
        lastCallTime = Date.now();
        func.apply(this, args);
        timeoutId = null;
      }, delay - timeSinceLastCall);
    }
  };
  
  throttled.cancel = () => {
    if (timeoutId !== null) {
      const clearFn = timerManager ?
        (id) => timerManager.clearTimeout(id) :
        (id) => clearTimeout(id);
      clearFn(timeoutId);
      timeoutId = null;
    }
  };
  
  return throttled;
}

