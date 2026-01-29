/**
 * Tauri IPC 客户端统一封装
 * 用于调用 Rust 端的 Tauri Commands
 * 
 * 根据方案A：逐步将 HTTP /api/* 请求迁移到 Tauri invoke
 * 
 * @module core/ipc-client
 * @example
 * ```javascript
 * import { call } from './core/ipc-client.js';
 * 
 * // 调用 Rust 命令
 * const health = await call('app_health');
 * const paths = await call('app_paths');
 * ```
 */

import { isRealTauriEnvironment, getTauriInvokeAsync } from '../utils/tauri-env.js';

/**
 * 检测是否在 Tauri 环境中
 * @returns {boolean}
 * @deprecated 使用 isRealTauriEnvironment 代替
 */
function isTauriEnv() {
  return isRealTauriEnvironment();
}

/**
 * 动态导入 Tauri API
 * @returns {Promise<{invoke: Function}|null>}
 */
async function getTauriApi() {
  const invoke = await getTauriInvokeAsync();
  
  if (invoke) {
    return { invoke };
  }
  
  return null;
}

/**
 * 统一错误处理
 * 将 Rust 端的错误转换为前端友好的错误对象
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
 * 调用 Tauri Command
 * 
 * @template T
 * @param {string} cmd - 命令名称（如 'app_health', 'db_get_path'）
 * @param {any} [payload] - 命令参数（可选）
 * @param {Object} [options] - 选项
 * @param {boolean} [options.fallbackToHttp=false] - 如果 invoke 失败，是否回退到 HTTP（过渡期使用）
 * @param {string} [options.httpPath] - HTTP 回退路径（如 '/api/storage'）
 * @param {string} [options.httpMethod='GET'] - HTTP 方法
 * @returns {Promise<T>} 命令返回结果
 * 
 * @example
 * ```javascript
 * // 基本调用
 * const health = await call('app_health');
 * 
 * // 带参数调用
 * const backup = await call('db_backup', { destPath: '/path/to/backup.sqlite' });
 * 
 * // 带 HTTP 回退（过渡期）
 * const users = await call('users_list', null, {
 *   fallbackToHttp: true,
 *   httpPath: '/api/users',
 *   httpMethod: 'GET'
 * });
 * ```
 */
export async function call(cmd, payload = null, options = {}) {
  const { fallbackToHttp = false, httpPath, httpMethod = 'GET' } = options;
  
  // 获取 Tauri API
  const tauriApi = await getTauriApi();
  
  // 如果不在 Tauri 环境，且允许回退到 HTTP
  if (!tauriApi && fallbackToHttp && httpPath) {
    console.warn(`[IPC Client] 不在 Tauri 环境，回退到 HTTP: ${httpPath}`);
    return fallbackToHttpCall(httpPath, payload, httpMethod);
  }
  
  // 如果不在 Tauri 环境，抛出错误
  if (!tauriApi) {
    throw new Error(`无法调用 Tauri 命令 '${cmd}'：不在 Tauri 环境中`);
  }
  
  try {
    // 调用 Rust 命令
    const result = await tauriApi.invoke(cmd, payload);
    return result;
  } catch (error) {
    // 如果调用失败，且允许回退到 HTTP
    if (fallbackToHttp && httpPath) {
      console.warn(`[IPC Client] Tauri 命令 '${cmd}' 调用失败，回退到 HTTP: ${httpPath}`, error);
      return fallbackToHttpCall(httpPath, payload, httpMethod);
    }
    
    // 否则，规范化错误并抛出
    throw normalizeError(error);
  }
}

/**
 * HTTP 回退调用（过渡期使用）
 * @private
 * @param {string} path - HTTP 路径
 * @param {any} payload - 请求体
 * @param {string} method - HTTP 方法
 * @returns {Promise<any>}
 */
async function fallbackToHttpCall(path, payload, method) {
  const API_BASE_URL = isTauriEnv() ? 'http://127.0.0.1:3000' : '';
  const url = path.startsWith('/') ? API_BASE_URL + path : path;
  
  const headers = {
    'Content-Type': 'application/json'
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
  
  const opts = {
    method,
    headers,
    credentials: 'include'
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
    throw new Error(errorMsg);
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
 * 批量调用多个命令（并行）
 * @param {Array<{cmd: string, payload?: any}>} commands - 命令数组
 * @returns {Promise<Array<any>>} 结果数组
 * 
 * @example
 * ```javascript
 * const [health, paths, info] = await callBatch([
 *   { cmd: 'app_health' },
 *   { cmd: 'app_paths' },
 *   { cmd: 'app_info' }
 * ]);
 * ```
 */
export async function callBatch(commands) {
  const promises = commands.map(({ cmd, payload }) => call(cmd, payload));
  return Promise.all(promises);
}

/**
 * 检查 Tauri 环境是否可用
 * @returns {Promise<boolean>}
 */
export async function isTauriAvailable() {
  const tauriApi = await getTauriApi();
  return tauriApi !== null;
}

// 导出工具函数
export { isTauriEnv, isRealTauriEnvironment };

// 默认导出 call 函数（最常用）
export default call;

