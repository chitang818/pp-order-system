/**
 * 统一 API 客户端
 * 根据最终架构方案：所有 API 调用都通过 Tauri Invoke，不再使用 HTTP
 * 
 * 注意：在迁移过程中，保留 HTTP fallback 作为过渡期支持
 * 最终目标：纯 Rust 后端，完全移除 HTTP fallback
 * 
 * @module core/api-client
 * @example
 * ```javascript
 * import { apiClient } from './core/api-client.js';
 * 
 * // 调用 Rust 命令
 * const result = await apiClient.invoke('orders_list', { page: 1 });
 * ```
 */

import { isRealTauriEnvironment, getTauriInvokeAsync } from '../utils/tauri-env.js';

/**
 * 检测是否在 Tauri 环境中
 * @returns {boolean}
 * @deprecated 使用 isRealTauriEnvironment 代替
 */
function detectTauri() {
  return isRealTauriEnvironment();
}

/**
 * 获取 Tauri Invoke API
 * @returns {Promise<Function|null>} invoke 函数或 null
 */
async function getTauriInvoke() {
  // 使用共享的环境检测和 invoke 获取逻辑
  const invoke = await getTauriInvokeAsync();
  
  if (invoke) {
    console.log('[API Client] Tauri API 加载成功');
  } else if (isRealTauriEnvironment()) {
    console.warn('[API Client] 在 Tauri 环境中但无法加载 Tauri API');
  }

  return invoke;
}

/**
 * HTTP Fallback 调用（过渡期使用，最终会移除）
 * @private
 * @param {string} endpoint - HTTP 端点路径
 * @param {any} payload - 请求体
 * @param {string} method - HTTP 方法
 * @returns {Promise<any>}
 */
async function httpFallback(endpoint, payload, method = 'POST') {
  const API_BASE_URL = 'http://127.0.0.1:3000';
  const url = endpoint.startsWith('/') ? API_BASE_URL + endpoint : endpoint;

  const headers = {
    'Content-Type': 'application/json',
  };

  // 添加 Authorization header（如果存在 token）
  try {
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (_) {
    // 忽略错误
  }

  // 添加 CSRF token（如果需要）
  try {
    const csrf = document.cookie.match(/csrf_token=([^;]+)/)?.[1];
    if (csrf && method !== 'GET' && method !== 'HEAD') {
      headers['x-csrf-token'] = csrf;
    }
  } catch (_) {
    // 忽略错误
  }

  const opts = {
    method,
    headers,
    credentials: 'include',
  };

  if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    opts.body = JSON.stringify(payload);
  }

  const response = await fetch(url, opts);
  const text = await response.text();

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errorObj = JSON.parse(text);
      errorMsg = errorObj.message || errorObj.error || errorMsg;
    } catch (_) {
      errorMsg = text || errorMsg;
    }
    const error = new Error(errorMsg);
    error.status = response.status;
    throw error;
  }

  if (!text || !text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`无法解析响应: ${text.slice(0, 100)}`);
  }
}

/**
 * 统一错误处理
 * 将错误转换为前端友好的错误对象
 * @param {any} error - 原始错误
 * @returns {Error} 规范化后的错误
 */
function normalizeError(error) {
  // 如果已经是 Error 对象，直接返回
  if (error instanceof Error) {
    return error;
  }

  // 如果是字符串，包装为 Error
  if (typeof error === 'string') {
    const err = new Error(error);
    err.code = 'UNKNOWN';
    return err;
  }

  // 如果是对象，尝试提取错误信息
  if (error && typeof error === 'object') {
    const message = error.message || error.error || String(error);
    const err = new Error(message);
    err.code = error.code || error.errorCode || 'UNKNOWN';
    err.details = error;
    return err;
  }

  // 其他情况
  const err = new Error(String(error));
  err.code = 'UNKNOWN';
  return err;
}

/**
 * 统一 API 客户端类
 * 
 * 根据最终架构方案：
 * - 所有 API 调用都通过 Tauri Invoke
 * - 不再使用 HTTP fetch（最终目标）
 * - 过渡期保留 HTTP fallback
 */
export class ApiClient {
  constructor() {
    this.isTauri = detectTauri();
    this._invokeCache = null;
  }

  /**
   * 检测是否在 Tauri 环境
   * @returns {boolean}
   */
  detectTauri() {
    return detectTauri();
  }

  /**
   * 获取 Tauri Invoke 函数
   * @private
   * @returns {Promise<Function|null>}
   */
  async _getInvoke() {
    // 如果已经成功获取过 invoke，直接返回缓存
    if (this._invokeCache) {
      return this._invokeCache;
    }

    // 尝试获取 invoke
    const invoke = await getTauriInvoke();

    // 只有成功获取到才缓存，失败的情况下次调用可以重试
    if (invoke) {
      this._invokeCache = invoke;
    }

    return invoke;
  }

  /**
   * 调用 Tauri Command
   * 
   * @param {string} command - 命令名称（如 'orders_list', 'auth_login'）
   * @param {any} payload - 命令参数
   * @param {Object} options - 选项（过渡期使用）
   * @param {boolean} options.fallbackToHttp - 是否允许 HTTP fallback（默认 false，最终会移除）
   * @param {string} options.httpPath - HTTP fallback 路径
   * @param {string} options.httpMethod - HTTP 方法（默认 'POST'）
   * @returns {Promise<any>} 命令返回结果
   * 
   * @example
   * ```javascript
   * // 基本调用
   * const orders = await apiClient.invoke('orders_list', { page: 1 });
   * 
   * // 带参数调用
   * const order = await apiClient.invoke('orders_get', { id: 1 });
   * 
   * // 过渡期：带 HTTP fallback（最终会移除）
   * const data = await apiClient.invoke('some_command', payload, {
   *   fallbackToHttp: true,
   *   httpPath: '/api/some-endpoint',
   *   httpMethod: 'POST'
   * });
   * ```
   */
  async invoke(command, payload = {}, options = {}) {
    // 获取 Tauri Invoke 函数
    const invoke = await this._getInvoke();

    // 浏览器开发模式：允许 HTTP fallback（过渡期支持 Web 开发与联调）
    if (!invoke) {
      if (options?.fallbackToHttp && options?.httpPath) {
        const method = (options.httpMethod || 'POST').toUpperCase();
        // HTTP 请求体优先使用 options.body（部分 HTTP 接口使用 camelCase 字段）
        // 其次才从 payload 推导（并兼容 { payload: {...} } 的包装形式）
        const httpPayloadFromOptions = options?.body;
        const httpPayloadFromPayload =
          payload &&
          typeof payload === 'object' &&
          'payload' in payload &&
          payload.payload &&
          typeof payload.payload === 'object'
            ? payload.payload
            : payload;
        const httpPayload =
          httpPayloadFromOptions !== undefined ? httpPayloadFromOptions : httpPayloadFromPayload;
        return await httpFallback(options.httpPath, httpPayload, method);
      }
      throw new Error(`无法调用命令 '${command}'：不在 Tauri 环境中，且未启用 HTTP fallback。`);
    }

    // 调用 Tauri Command
    const startTime = performance.now();
    try {
      // (Dev) Log Request
      if (this.isTauri) {
        console.groupCollapsed(
          `%c[Tauri] Invoke: ${command}`,
          'color: #3b82f6; font-weight: bold;'
        );
        console.log('%cPayload:', 'color: #9ca3af;', payload);
      }

      const result = await invoke(command, payload);

      // (Dev) Log Success Response
      if (this.isTauri) {
        const duration = (performance.now() - startTime).toFixed(2);
        console.log('%cResult:', 'color: #10b981;', result);
        console.log(`%cDuration: ${duration}ms`, 'color: #9ca3af; font-size: 0.8em;');
        console.groupEnd();
      }

      return result;
    } catch (error) {
      // (Dev) Log Error Response
      if (this.isTauri) {
        const duration = (performance.now() - startTime).toFixed(2);
        console.log('%cError:', 'color: #ef4444;', error);
        console.log(`%cDuration: ${duration}ms`, 'color: #9ca3af; font-size: 0.8em;');
        console.groupEnd();
      }

      // 直接规范化错误并抛出
      console.warn(`[API Client] Tauri 命令 '${command}' 原始错误对象:`, error);
      console.error(`[API Client] Tauri 命令 '${command}' 调用失败:`, error);
      throw normalizeError(error);
    }
  }

  /**
   * 批量调用多个命令（并行）
   * @param {Array<{command: string, payload?: any}>} commands - 命令数组
   * @returns {Promise<Array<any>>} 结果数组
   * 
   * @example
   * ```javascript
   * const [health, paths, info] = await apiClient.invokeBatch([
   *   { command: 'app_health' },
   *   { command: 'app_paths' },
   *   { command: 'app_info' }
   * ]);
   * ```
   */
  async invokeBatch(commands) {
    const promises = commands.map(({ command, payload }) =>
      this.invoke(command, payload || {})
    );
    return Promise.all(promises);
  }

  /**
   * 检查 Tauri 环境是否可用
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    const invoke = await this._getInvoke();
    return invoke !== null;
  }
}

/**
 * 全局单例 API 客户端
 * 所有模块都应该使用这个单例
 */
export const apiClient = new ApiClient();

/**
 * 便捷函数：直接调用命令
 * @param {string} command - 命令名称
 * @param {any} payload - 命令参数
 * @returns {Promise<any>}
 */
export async function invoke(command, payload = {}) {
  return apiClient.invoke(command, payload);
}

/**
 * 便捷函数：批量调用
 * @param {Array<{command: string, payload?: any}>} commands - 命令数组
 * @returns {Promise<Array<any>>}
 */
export async function invokeBatch(commands) {
  return apiClient.invokeBatch(commands);
}

// 默认导出单例
export default apiClient;
