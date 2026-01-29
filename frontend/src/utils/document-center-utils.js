/**
 * 单据中心公共工具函数
 * 提供通用的工具方法供各个页面使用
 */

/**
 * 格式化日期
 * @param {string|Date} date - 日期字符串或Date对象
 * @param {string} format - 格式类型：'date' | 'datetime' | 'time'
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, format = 'datetime') {
  if (!date) return '-';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '-';
    
    const options = {
      date: {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      },
      datetime: {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      },
      time: {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }
    };
    
    return dateObj.toLocaleString('zh-CN', options[format] || options.datetime);
  } catch (e) {
    console.warn('[DocumentCenterUtils] 日期格式化失败:', e);
    return String(date);
  }
}

/**
 * 转义HTML，防止XSS攻击
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的HTML字符串
 */
export function escapeHtml(text) {
  if (text == null) return '';
  
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * 转义正则表达式特殊字符
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的字符串
 */
export function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @param {boolean} immediate - 是否立即执行
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay = 300, immediate = false) {
  let timeoutId;
  
  return function(...args) {
    const context = this;
    
    const later = () => {
      timeoutId = null;
      if (!immediate) func.apply(context, args);
    };
    
    const callNow = immediate && !timeoutId;
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(later, delay);
    
    if (callNow) func.apply(context, args);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, delay = 300) {
  let lastCall = 0;
  let timeoutId;
  
  return function(...args) {
    const context = this;
    const now = Date.now();
    const elapsed = now - lastCall;
    
    if (elapsed >= delay) {
      lastCall = now;
      func.apply(context, args);
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func.apply(context, args);
      }, delay - elapsed);
    }
  };
}

/**
 * 深拷贝对象
 * @param {*} obj - 要拷贝的对象
 * @returns {*} 拷贝后的对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = deepClone(obj[key]);
    });
    return cloned;
  }
}

/**
 * 生成唯一ID
 * @param {string} prefix - ID前缀
 * @returns {string} 唯一ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的文件大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 高亮搜索关键词
 * @param {string} text - 原始文本
 * @param {string} searchTerm - 搜索关键词
 * @param {string} className - 高亮样式类名
 * @returns {string} 高亮后的HTML字符串
 */
export function highlightSearchTerm(text, searchTerm, className = 'highlight') {
  if (!searchTerm || !text) return escapeHtml(text);
  
  const escapedText = escapeHtml(text);
  const escapedTerm = escapeRegex(searchTerm);
  const regex = new RegExp(`(${escapedTerm})`, 'gi');
  
  return escapedText.replace(regex, `<mark class="${className}">$1</mark>`);
}

/**
 * 批量操作DOM元素
 * @param {HTMLElement} container - 容器元素
 * @param {Function} operation - 操作函数
 * @param {Array} items - 要操作的项目数组
 */
export function batchDOMOperation(container, operation, items) {
  const fragment = document.createDocumentFragment();
  
  items.forEach(item => {
    const element = operation(item);
    if (element) {
      fragment.appendChild(element);
    }
  });
  
  container.appendChild(fragment);
}

/**
 * 等待DOM元素出现
 * @param {string} selector - CSS选择器
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<HTMLElement>} DOM元素
 */
export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`元素 ${selector} 在 ${timeout}ms 内未找到`));
    }, timeout);
  });
}

/**
 * 检查是否为移动设备
 * @returns {boolean} 是否为移动设备
 */
export function isMobile() {
  return window.innerWidth <= 768;
}

/**
 * 检查是否为平板设备
 * @returns {boolean} 是否为平板设备
 */
export function isTablet() {
  return window.innerWidth > 768 && window.innerWidth <= 1024;
}

/**
 * 检查是否为桌面设备
 * @returns {boolean} 是否为桌面设备
 */
export function isDesktop() {
  return window.innerWidth > 1024;
}

/**
 * 导出所有工具函数
 */
export const DocumentCenterUtils = {
  formatDate,
  escapeHtml,
  escapeRegex,
  debounce,
  throttle,
  deepClone,
  generateId,
  formatFileSize,
  highlightSearchTerm,
  batchDOMOperation,
  waitForElement,
  isMobile,
  isTablet,
  isDesktop
};

