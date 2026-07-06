/**
 * API网关 - 统一前端API调用
 * 
 * 功能：
 * 1. 自动检测运行环境（Tauri/浏览器）
 * 2. 智能路由选择（Tauri Command/HTTP API）
 * 3. 统一错误处理
 * 4. 请求重试机制
 * 5. 缓存支持
 * 6. 请求/响应拦截器
 * 
 * 使用：
 * import { apiGateway } from './api/gateway.js';
 * const data = await apiGateway.call('/api/orders', 'GET');
 */

import { getHttpApiBase, isRealTauriEnvironment } from '../utils/tauri-env.js';

class APIGateway {
  constructor() {
    // 使用与 api-client.js 一致的环境检测方式，避免 polyfill 误判
    this.isTauri = isRealTauriEnvironment();
    
    // API版本
    this.apiVersion = 'v1';
    
    // 基础URL（浏览器 Vite 开发为 ''，桌面/打包为 Node 绝对地址）
    this.baseURL = getHttpApiBase();
    
    // 请求拦截器列表
    this.requestInterceptors = [];
    
    // 响应拦截器列表
    this.responseInterceptors = [];
    
    // 错误处理器列表
    this.errorHandlers = [];
    
    // 重试配置
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
    };
    
    // 缓存配置
    this.cache = new Map();
    this.cacheConfig = {
      enabled: true,
      ttl: 5 * 60 * 1000, // 5分钟
      maxSize: 100
    };
    
    // Tauri Command 映射表（命令名须与 src-tauri/src/commands/ 中 #[tauri::command] 名称一致）
    this.commandMap = {
      // 认证相关
      'POST /api/auth/login': 'auth_login',
      'POST /api/auth/logout': 'auth_logout',
      'GET /api/auth/check': 'auth_check',
      
      // 用户相关
      'GET /api/users': 'users_list',
      'POST /api/users': 'users_create',
      'PUT /api/users/:id': 'users_update',
      'DELETE /api/users/:id': 'users_delete',
      
      // 客户相关
      'GET /api/customers': 'customers_list',
      'POST /api/customers': 'customers_create',
      'PUT /api/customers/:id': 'customers_update',
      'DELETE /api/customers/:id': 'customers_delete',
      
      // 产品相关
      'GET /api/products': 'products_list',
      'POST /api/products': 'products_create',
      'PUT /api/products/:id': 'products_update',
      'DELETE /api/products/:id': 'products_delete',
      
      // 订单相关（查询）
      'GET /api/orders': 'orders_list',
      'GET /api/orders/:id': 'orders_get',
      
      // 公司配置
      'GET /api/company': 'company_get',
      'PUT /api/company': 'company_update',
      
      // 订单配置
      'GET /api/order-configs': 'order_configs_get',
      'PUT /api/order-configs': 'order_configs_update'
    };
    
    console.log(`[APIGateway] 初始化完成，运行环境: ${this.isTauri ? 'Tauri' : '浏览器'}`);
  }
  
  /**
   * 主调用方法
   * @param {string} endpoint - API端点
   * @param {string} method - HTTP方法
   * @param {object} data - 请求数据
   * @param {object} options - 额外选项
   */
  async call(endpoint, method = 'GET', data = null, options = {}) {
    const startTime = Date.now();
    
    try {
      // 应用请求拦截器
      let requestData = await this.applyRequestInterceptors({ endpoint, method, data, options });
      
      // 检查缓存
      if (method === 'GET' && this.cacheConfig.enabled && !options.noCache) {
        const cacheKey = this.getCacheKey(endpoint, data);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          console.log(`[APIGateway] 缓存命中: ${endpoint}`);
          return cached;
        }
      }
      
      // 选择调用方式
      let response;
      if (this.shouldUseTauriCommand(endpoint, method)) {
        response = await this.callTauriCommand(endpoint, method, data, options);
      } else {
        response = await this.callHTTPAPI(endpoint, method, data, options);
      }
      
      // 应用响应拦截器
      response = await this.applyResponseInterceptors(response, { endpoint, method, data });
      
      // 缓存结果
      if (method === 'GET' && this.cacheConfig.enabled && !options.noCache) {
        const cacheKey = this.getCacheKey(endpoint, data);
        this.saveToCache(cacheKey, response);
      }
      
      const duration = Date.now() - startTime;
      console.log(`[APIGateway] ${method} ${endpoint} - ${duration}ms`);
      
      return response;
      
    } catch (error) {
      // 应用错误处理器
      const handledError = await this.handleError(error, { endpoint, method, data, options });
      throw handledError;
    }
  }
  
  /**
   * 判断是否应该使用Tauri Command
   */
  shouldUseTauriCommand(endpoint, method) {
    // 只在Tauri环境中使用
    if (!this.isTauri) {
      return false;
    }
    
    // 检查命令映射表
    const key = `${method} ${endpoint}`;
    const keyPattern = `${method} ${this.getEndpointPattern(endpoint)}`;
    
    return this.commandMap[key] !== undefined || this.commandMap[keyPattern] !== undefined;
  }
  
  /**
   * 获取端点模式（用于路径参数匹配）
   */
  getEndpointPattern(endpoint) {
    // 将 /api/users/123 转换为 /api/users/:id
    return endpoint.replace(/\/\d+/g, '/:id');
  }
  
  /**
   * 调用Tauri Command
   */
  async callTauriCommand(endpoint, method, data, options) {
    const key = `${method} ${endpoint}`;
    const keyPattern = `${method} ${this.getEndpointPattern(endpoint)}`;
    
    const commandName = this.commandMap[key] || this.commandMap[keyPattern];
    
    if (!commandName) {
      throw new Error(`No Tauri command found for: ${key}`);
    }
    
    try {
      console.log(`[APIGateway] Tauri Command: ${commandName}`);
      
      // 提取路径参数
      const pathParams = this.extractPathParams(endpoint);
      
      // 构建命令参数
      const commandArgs = {
        ...pathParams,
        ...data
      };
      
      // 使用 @tauri-apps/api 调用 Tauri 命令（与 api-client.js 一致）
      const { invoke } = await import('@tauri-apps/api/core');
      const response = await invoke(commandName, commandArgs);
      
      return response;
      
    } catch (error) {
      console.error(`[APIGateway] Tauri Command 失败: ${commandName}`, error);
      
      // 降级到HTTP API
      if (options.fallbackToHTTP !== false) {
        console.warn(`[APIGateway] 降级到 HTTP API: ${endpoint}`);
        return await this.callHTTPAPI(endpoint, method, data, options);
      }
      
      throw error;
    }
  }
  
  /**
   * 提取路径参数
   */
  extractPathParams(endpoint) {
    const params = {};
    const matches = endpoint.match(/\/(\d+)/g);
    
    if (matches && matches.length > 0) {
      // 假设最后一个数字是ID
      params.id = parseInt(matches[matches.length - 1].substring(1));
    }
    
    return params;
  }
  
  /**
   * 调用HTTP API
   */
  async callHTTPAPI(endpoint, method, data, options) {
    const url = `${this.baseURL}${endpoint}`;
    
    const fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'include', // 包含cookies
      ...options.fetchOptions
    };
    
    // 添加请求体
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = JSON.stringify(data);
    }
    
    // 重试机制
    let lastError;
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);
        
        // 检查HTTP状态
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        // 解析响应
        const result = await response.json();
        return result;
        
      } catch (error) {
        lastError = error;
        
        // 判断是否应该重试
        const shouldRetry = this.shouldRetry(error, attempt);
        
        if (shouldRetry) {
          const delay = this.retryConfig.retryDelay * Math.pow(2, attempt);
          console.warn(`[APIGateway] 请求失败，${delay}ms后重试 (${attempt + 1}/${this.retryConfig.maxRetries})`, error.message);
          await this.sleep(delay);
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }
  
  /**
   * 判断是否应该重试
   */
  shouldRetry(error, attempt) {
    if (attempt >= this.retryConfig.maxRetries) {
      return false;
    }
    
    // 检查错误类型
    const isRetryableError = this.retryConfig.retryableErrors.some(code => 
      error.message?.includes(code) || error.code === code
    );
    
    return isRetryableError;
  }
  
  /**
   * 睡眠函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 缓存相关方法
   */
  getCacheKey(endpoint, data) {
    return `${endpoint}:${JSON.stringify(data || {})}`;
  }
  
  getFromCache(key) {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // 检查是否过期
    if (Date.now() > cached.expireAt) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  saveToCache(key, data) {
    // 检查缓存大小
    if (this.cache.size >= this.cacheConfig.maxSize) {
      // 删除最旧的条目
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      expireAt: Date.now() + this.cacheConfig.ttl
    });
  }
  
  clearCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      console.log('[APIGateway] 缓存已清空');
      return;
    }
    
    // 按模式清除
    const regex = new RegExp(pattern);
    const keysToDelete = [];
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`[APIGateway] 已清除 ${keysToDelete.length} 个缓存条目`);
  }
  
  /**
   * 拦截器相关方法
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
  }
  
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
  }
  
  addErrorHandler(handler) {
    this.errorHandlers.push(handler);
  }
  
  async applyRequestInterceptors(request) {
    let modifiedRequest = request;
    
    for (const interceptor of this.requestInterceptors) {
      modifiedRequest = await interceptor(modifiedRequest);
    }
    
    return modifiedRequest;
  }
  
  async applyResponseInterceptors(response, context) {
    let modifiedResponse = response;
    
    for (const interceptor of this.responseInterceptors) {
      modifiedResponse = await interceptor(modifiedResponse, context);
    }
    
    return modifiedResponse;
  }
  
  async handleError(error, context) {
    let handledError = error;
    
    for (const handler of this.errorHandlers) {
      handledError = await handler(handledError, context);
    }
    
    return handledError;
  }
  
  /**
   * 便捷方法
   */
  get(endpoint, data = null, options = {}) {
    return this.call(endpoint, 'GET', data, options);
  }
  
  post(endpoint, data = null, options = {}) {
    return this.call(endpoint, 'POST', data, options);
  }
  
  put(endpoint, data = null, options = {}) {
    return this.call(endpoint, 'PUT', data, options);
  }
  
  delete(endpoint, data = null, options = {}) {
    return this.call(endpoint, 'DELETE', data, options);
  }
  
  patch(endpoint, data = null, options = {}) {
    return this.call(endpoint, 'PATCH', data, options);
  }
}

// 创建单例
const apiGateway = new APIGateway();

// 默认拦截器：添加CSRF token
apiGateway.addRequestInterceptor(async (request) => {
  // 如果有CSRF token，自动添加到请求头
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('csrf-token='))
    ?.split('=')[1];
  
  if (csrfToken && request.method !== 'GET') {
    request.options = request.options || {};
    request.options.headers = request.options.headers || {};
    request.options.headers['X-CSRF-Token'] = csrfToken;
  }
  
  return request;
});

// 默认错误处理器：统一错误格式
apiGateway.addErrorHandler(async (error, context) => {
  console.error(`[APIGateway] 请求失败: ${context.method} ${context.endpoint}`, error);
  
  // 统一错误格式
  return {
    success: false,
    error: error.message || '请求失败',
    code: error.code || 'UNKNOWN_ERROR',
    context
  };
});

// 导出
export { apiGateway, APIGateway };
export default apiGateway;
