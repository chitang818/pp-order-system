/**
 * 状态管理器
 * 负责管理应用状态，提供状态订阅机制
 * ES6 模块化版本
 * 
 * @module core/state-manager
 * @example
 * ```javascript
 * import { StateManager } from './core/state-manager.js';
 * 
 * const stateManager = new StateManager({ orders: [] });
 * 
 * // 订阅状态变化
 * const unsubscribe = stateManager.subscribe('orders', (newOrders, oldOrders) => {
 *   console.log('订单列表已更新', newOrders);
 * });
 * 
 * // 更新状态
 * stateManager.setState('orders', [{ id: 1, name: '订单1' }]);
 * 
 * // 取消订阅
 * unsubscribe();
 * ```
 */

/**
 * 状态管理器类
 * 提供状态管理、订阅/取消订阅、状态通知等功能
 * 
 * @class StateManager
 * @example
 * ```javascript
 * const stateManager = new StateManager({
 *   orders: [],
 *   customers: []
 * });
 * ```
 */
export class StateManager {
  /**
   * 创建状态管理器实例
   * @param {Object} [initialState={}] - 初始状态对象
   * @example
   * ```javascript
   * const stateManager = new StateManager({
   *   orders: [],
   *   customers: []
   * });
   * ```
   */
  constructor(initialState = {}) {
    /**
     * 应用状态
     * @type {Object}
     * @private
     */
    this._state = { ...initialState };
    
    /**
     * 订阅者列表
     * Map<key, Set<callback>>
     * @type {Map<string, Set<Function>>}
     * @private
     */
    this._subscribers = new Map();
    
    /**
     * 全量订阅者列表（监听所有状态变化）
     * Set<callback>
     * @type {Set<Function>}
     * @private
     */
    this._globalSubscribers = new Set();
  }
  
  /**
   * 获取状态
   * 
   * @param {string} [key] - 状态键名，不传则返回整个状态的副本
   * @returns {*} 状态值或整个状态对象（副本）
   * @example
   * ```javascript
   * // 获取整个状态
   * const state = stateManager.getState();
   * 
   * // 获取特定键的状态
   * const orders = stateManager.getState('orders');
   * ```
   */
  getState(key) {
    if (key === undefined) {
      return { ...this._state };
    }
    return this._state[key];
  }
  
  /**
   * 设置状态
   * 支持单个键值对更新或批量更新
   * 
   * @param {string|Object} keyOrState - 状态键名或状态对象
   * @param {*} [value] - 状态值（当第一个参数是键名时）
   * @returns {boolean} 是否成功设置（状态是否发生变化）
   * @example
   * ```javascript
   * // 单个键值对更新
   * stateManager.setState('orders', [{ id: 1 }]);
   * 
   * // 批量更新
   * stateManager.setState({
   *   orders: [{ id: 1 }],
   *   customers: [{ id: 2 }]
   * });
   * ```
   */
  setState(keyOrState, value) {
    let changed = false;
    const oldState = { ...this._state };
    
    if (typeof keyOrState === 'string') {
      // 单个键值对更新
      const key = keyOrState;
      if (this._state[key] !== value) {
        this._state[key] = value;
        changed = true;
        this._notify(key, value, oldState[key]);
      }
    } else if (typeof keyOrState === 'object' && keyOrState !== null) {
      // 批量更新
      const updates = keyOrState;
      const changedKeys = [];
      
      Object.keys(updates).forEach(key => {
        if (this._state[key] !== updates[key]) {
          const oldValue = this._state[key];
          this._state[key] = updates[key];
          changed = true;
          changedKeys.push({ key, newValue: updates[key], oldValue });
        }
      });
      
      if (changed) {
        changedKeys.forEach(({ key, newValue, oldValue }) => {
          this._notify(key, newValue, oldValue);
        });
      }
    }
    
    // 通知全局订阅者
    if (changed) {
      this._notifyGlobal(oldState, this._state);
    }
    
    return changed;
  }
  
  /**
   * 订阅状态变化
   * 支持订阅特定键的状态变化或全局状态变化
   * 
   * @param {string|Function} keyOrCallback - 状态键名或全局回调函数
   * @param {Function} [callback] - 回调函数（当第一个参数是键名时）
   * @returns {Function} 取消订阅函数
   * @example
   * ```javascript
   * // 订阅特定键
   * const unsubscribe = stateManager.subscribe('orders', (newOrders, oldOrders, key, state) => {
   *   console.log('订单列表已更新', newOrders);
   * });
   * 
   * // 全局订阅
   * const unsubscribeGlobal = stateManager.subscribe((newState, oldState) => {
   *   console.log('状态已更新', newState);
   * });
   * 
   * // 取消订阅
   * unsubscribe();
   * ```
   */
  subscribe(keyOrCallback, callback) {
    if (typeof keyOrCallback === 'function') {
      // 全局订阅
      const callbackFn = keyOrCallback;
      this._globalSubscribers.add(callbackFn);
      
      return () => {
        this._globalSubscribers.delete(callbackFn);
      };
    } else {
      // 单个键订阅
      const key = keyOrCallback;
      if (typeof callback !== 'function') {
        console.warn('[StateManager] subscribe: callback 必须是函数');
        return () => {};
      }
      
      if (!this._subscribers.has(key)) {
        this._subscribers.set(key, new Set());
      }
      
      this._subscribers.get(key).add(callback);
      
      return () => {
        const subscribers = this._subscribers.get(key);
        if (subscribers) {
          subscribers.delete(callback);
          if (subscribers.size === 0) {
            this._subscribers.delete(key);
          }
        }
      };
    }
  }
  
  /**
   * 取消订阅
   * @param {string} key - 状态键名
   * @param {Function} callback - 回调函数
   */
  unsubscribe(key, callback) {
    if (typeof key === 'function') {
      // 取消全局订阅
      this._globalSubscribers.delete(key);
    } else {
      const subscribers = this._subscribers.get(key);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this._subscribers.delete(key);
        }
      }
    }
  }
  
  /**
   * 通知订阅者
   * @param {string} key - 状态键名
   * @param {*} newValue - 新值
   * @param {*} oldValue - 旧值
   * @private
   */
  _notify(key, newValue, oldValue) {
    const subscribers = this._subscribers.get(key);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(newValue, oldValue, key, this._state);
        } catch (error) {
          console.error(`[StateManager] 订阅回调执行失败 (${key}):`, error);
        }
      });
    }
  }
  
  /**
   * 通知全局订阅者
   * @param {Object} oldState - 旧状态
   * @param {Object} newState - 新状态
   * @private
   */
  _notifyGlobal(oldState, newState) {
    this._globalSubscribers.forEach(callback => {
      try {
        callback(newState, oldState);
      } catch (error) {
        console.error('[StateManager] 全局订阅回调执行失败:', error);
      }
    });
  }
  
  /**
   * 重置状态
   * @param {Object} [newState] - 新状态，不传则重置为初始状态
   */
  reset(newState) {
    const oldState = { ...this._state };
    
    if (newState !== undefined) {
      this._state = { ...newState };
    } else {
      // 重置为初始状态
      this._state = {};
    }
    
    // 通知所有订阅者
    Object.keys(oldState).forEach(key => {
      this._notify(key, this._state[key], oldState[key]);
    });
    
    Object.keys(this._state).forEach(key => {
      if (!(key in oldState)) {
        this._notify(key, this._state[key], undefined);
      }
    });
    
    this._notifyGlobal(oldState, this._state);
  }
  
  /**
   * 清空所有订阅
   */
  clearSubscribers() {
    this._subscribers.clear();
    this._globalSubscribers.clear();
  }
  
  /**
   * 检查状态是否存在
   * @param {string} key - 状态键名
   * @returns {boolean} 是否存在
   */
  has(key) {
    return key in this._state;
  }
  
  /**
   * 删除状态
   * @param {string} key - 状态键名
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    if (key in this._state) {
      const oldValue = this._state[key];
      delete this._state[key];
      this._notify(key, undefined, oldValue);
      return true;
    }
    return false;
  }
}

/**
 * 创建默认状态管理器实例
 * @param {Object} initialState - 初始状态
 * @returns {StateManager} 状态管理器实例
 */
export function createStateManager(initialState = {}) {
  return new StateManager(initialState);
}

