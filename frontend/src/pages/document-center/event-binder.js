/**
 * 事件绑定器模块
 * 使用配置驱动的方式统一管理事件绑定
 */

import { DocumentCenterErrorHandler } from '../../utils/document-center-error-handler.js';

/**
 * 事件绑定配置类型
 * @typedef {Object} EventConfig
 * @property {string} selector - CSS选择器或元素ID
 * @property {string} event - 事件类型（如 'click', 'change'）
 * @property {Function} handler - 事件处理函数
 * @property {boolean} [capture] - 是否使用捕获阶段
 * @property {boolean} [once] - 是否只执行一次
 * @property {boolean} [preventDefault] - 是否阻止默认行为
 * @property {boolean} [stopPropagation] - 是否阻止事件冒泡
 */

/**
 * 事件绑定器类
 */
export class EventBinder {
  constructor() {
    this.boundHandlers = new Map();
  }
  
  /**
   * 绑定单个事件
   * @param {EventConfig} config - 事件配置
   * @returns {boolean} 是否绑定成功
   */
  bind(config) {
    const { selector, event, handler, capture = false, once = false, preventDefault = false, stopPropagation = false } = config;
    
    try {
      const element = typeof selector === 'string' 
        ? (selector.startsWith('#') ? document.getElementById(selector.slice(1)) : document.querySelector(selector))
        : selector;
      
      if (!element) {
        console.warn(`[EventBinder] 元素未找到: ${selector}`);
        return false;
      }
      
      // 创建包装处理函数
      const wrappedHandler = (e) => {
        if (preventDefault) e.preventDefault();
        if (stopPropagation) e.stopPropagation();
        handler(e);
      };
      
      // 绑定事件
      element.addEventListener(event, wrappedHandler, { capture, once });
      
      // 保存绑定信息（用于解绑）
      const key = `${selector}_${event}`;
      if (!this.boundHandlers.has(key)) {
        this.boundHandlers.set(key, []);
      }
      this.boundHandlers.get(key).push({ element, event, handler: wrappedHandler, capture });
      
      return true;
    } catch (error) {
      DocumentCenterErrorHandler.handle(error, 'EventBinder.bind');
      return false;
    }
  }
  
  /**
   * 批量绑定事件
   * @param {Array<EventConfig>} configs - 事件配置数组
   * @returns {Object} 绑定结果 { success: number, failed: number }
   */
  bindBatch(configs) {
    let success = 0;
    let failed = 0;
    
    configs.forEach(config => {
      if (this.bind(config)) {
        success++;
      } else {
        failed++;
      }
    });
    
    return { success, failed };
  }
  
  /**
   * 使用事件委托绑定
   * @param {string|HTMLElement} container - 容器元素
   * @param {string} selector - 目标元素选择器
   * @param {string} event - 事件类型
   * @param {Function} handler - 事件处理函数
   * @param {Object} options - 选项
   * @returns {boolean} 是否绑定成功
   */
  delegate(container, selector, event, handler, options = {}) {
    const { capture = true, preventDefault = false, stopPropagation = false } = options;
    
    try {
      const containerEl = typeof container === 'string'
        ? document.querySelector(container)
        : container;
      
      if (!containerEl) {
        console.warn(`[EventBinder] 容器元素未找到: ${container}`);
        return false;
      }
      
      const wrappedHandler = (e) => {
        const target = e.target.closest(selector);
        if (!target) return;
        
        if (preventDefault) e.preventDefault();
        if (stopPropagation) e.stopPropagation();
        
        handler(e, target);
      };
      
      containerEl.addEventListener(event, wrappedHandler, { capture });
      
      // 保存绑定信息
      const key = `${container}_${event}_delegate_${selector}`;
      this.boundHandlers.set(key, [{ element: containerEl, event, handler: wrappedHandler, capture }]);
      
      return true;
    } catch (error) {
      DocumentCenterErrorHandler.handle(error, 'EventBinder.delegate');
      return false;
    }
  }
  
  /**
   * 解绑事件
   * @param {string} selector - 选择器或元素ID
   * @param {string} event - 事件类型
   */
  unbind(selector, event) {
    const key = `${selector}_${event}`;
    const handlers = this.boundHandlers.get(key);
    
    if (handlers) {
      handlers.forEach(({ element, handler, capture }) => {
        element.removeEventListener(event, handler, { capture });
      });
      this.boundHandlers.delete(key);
    }
  }
  
  /**
   * 解绑所有事件
   */
  unbindAll() {
    this.boundHandlers.forEach((handlers, key) => {
      handlers.forEach(({ element, event, handler, capture }) => {
        element.removeEventListener(event, handler, { capture });
      });
    });
    this.boundHandlers.clear();
  }
}

/**
 * 创建事件绑定配置（用于模板列表页面）
 * @param {Object} handlers - 处理函数对象
 * @returns {Array<EventConfig>} 事件配置数组
 */
export function createTemplateListEventConfig(handlers) {
  return [
    {
      selector: '#btnNewTemplate',
      event: 'click',
      handler: (e) => {
        e.preventDefault();
        e.stopPropagation();
        handlers.onNewTemplate?.();
      }
    },
    {
      selector: '#btnImportTemplate',
      event: 'click',
      handler: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handlers.onImportTemplate?.(e);
      }
    },
    {
      selector: '#btnDeleteAllTemplates',
      event: 'click',
      handler: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handlers.onDeleteAll?.();
      }
    }
  ];
}

/**
 * 创建筛选事件配置
 * @param {Object} handlers - 处理函数对象
 * @returns {Array<EventConfig>} 事件配置数组
 */
export function createFilterEventConfig(handlers) {
  return [
    {
      selector: '#templateSearch',
      event: 'input',
      handler: handlers.onSearch
    },
    {
      selector: '#templateCreatorFilter',
      event: 'input',
      handler: handlers.onSearch
    },
    {
      selector: '#templateTypeFilter',
      event: 'change',
      handler: handlers.onFilterChange
    },
    {
      selector: '#btnClearTemplateFilters',
      event: 'click',
      handler: handlers.onClearFilters
    }
  ];
}

