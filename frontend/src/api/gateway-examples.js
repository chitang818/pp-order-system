/**
 * API网关使用示例
 * 
 * 本文件展示如何使用APIGateway进行各种API调用
 */

import { apiGateway } from './gateway.js';

// ================================================================
// 1. 基础用法
// ================================================================

// GET请求
async function getOrders() {
  try {
    const response = await apiGateway.get('/api/orders');
    console.log('订单列表:', response.data);
    return response.data;
  } catch (error) {
    console.error('获取订单失败:', error);
  }
}

// POST请求
async function createOrder(orderData) {
  try {
    const response = await apiGateway.post('/api/orders', orderData);
    console.log('订单创建成功:', response.data);
    return response.data;
  } catch (error) {
    console.error('创建订单失败:', error);
  }
}

// PUT请求
async function updateOrder(orderId, updateData) {
  try {
    const response = await apiGateway.put(`/api/orders/${orderId}`, updateData);
    console.log('订单更新成功:', response.data);
    return response.data;
  } catch (error) {
    console.error('更新订单失败:', error);
  }
}

// DELETE请求
async function deleteOrder(orderId) {
  try {
    const response = await apiGateway.delete(`/api/orders/${orderId}`);
    console.log('订单删除成功');
    return response;
  } catch (error) {
    console.error('删除订单失败:', error);
  }
}

// ================================================================
// 2. 带查询参数的请求
// ================================================================

async function getOrdersWithFilters(filters) {
  const response = await apiGateway.get('/api/orders', filters);
  return response.data;
}

// 使用示例
getOrdersWithFilters({
  status: '已创建',
  page: 1,
  pageSize: 20
});

// ================================================================
// 3. 禁用缓存
// ================================================================

async function getOrdersNoCache() {
  const response = await apiGateway.get('/api/orders', null, {
    noCache: true
  });
  return response.data;
}

// ================================================================
// 4. 自定义请求头
// ================================================================

async function createOrderWithCustomHeaders(orderData) {
  const response = await apiGateway.post('/api/orders', orderData, {
    headers: {
      'X-Custom-Header': 'custom-value'
    }
  });
  return response.data;
}

// ================================================================
// 5. 直接调用（最灵活）
// ================================================================

async function customAPICall() {
  const response = await apiGateway.call(
    '/api/custom-endpoint',
    'POST',
    { key: 'value' },
    {
      noCache: true,
      headers: { 'X-Custom': 'header' },
      fallbackToHTTP: true
    }
  );
  return response;
}

// ================================================================
// 6. 缓存管理
// ================================================================

// 清空所有缓存
function clearAllCache() {
  apiGateway.clearCache();
}

// 清空特定模式的缓存
function clearOrdersCache() {
  apiGateway.clearCache('/api/orders');
}

// ================================================================
// 7. 添加请求拦截器
// ================================================================

// 添加认证token
apiGateway.addRequestInterceptor(async (request) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    request.options = request.options || {};
    request.options.headers = request.options.headers || {};
    request.options.headers['Authorization'] = `Bearer ${token}`;
  }
  return request;
});

// 添加请求日志
apiGateway.addRequestInterceptor(async (request) => {
  console.log(`[Request] ${request.method} ${request.endpoint}`, request.data);
  return request;
});

// ================================================================
// 8. 添加响应拦截器
// ================================================================

// 统一处理响应格式
apiGateway.addResponseInterceptor(async (response, context) => {
  if (response && response.success === false) {
    console.warn(`[Response] 请求失败: ${context.endpoint}`, response.error);
  }
  return response;
});

// 记录响应时间
apiGateway.addResponseInterceptor(async (response, context) => {
  const duration = Date.now() - context.startTime;
  if (duration > 1000) {
    console.warn(`[Performance] 慢请求: ${context.endpoint} - ${duration}ms`);
  }
  return response;
});

// ================================================================
// 9. 添加错误处理器
// ================================================================

// 401未授权处理
apiGateway.addErrorHandler(async (error, context) => {
  if (error.message?.includes('401') || error.code === 'UNAUTHORIZED') {
    console.warn('[Auth] 未授权，跳转到登录页');
    // 跳转到登录页
    window.location.href = '/login.html';
  }
  return error;
});

// 网络错误提示
apiGateway.addErrorHandler(async (error, context) => {
  if (error.message?.includes('ECONNREFUSED')) {
    console.error('[Network] 无法连接到服务器');
    // 显示用户友好的错误提示
    alert('无法连接到服务器，请检查网络连接');
  }
  return error;
});

// ================================================================
// 10. 实际应用示例：订单管理
// ================================================================

class OrderAPI {
  // 获取订单列表
  async getOrders(filters = {}) {
    return await apiGateway.get('/api/orders', filters);
  }
  
  // 获取单个订单
  async getOrder(orderId) {
    return await apiGateway.get(`/api/orders/${orderId}`);
  }
  
  // 创建订单
  async createOrder(orderData) {
    // 创建后清除订单列表缓存
    const response = await apiGateway.post('/api/orders', orderData);
    apiGateway.clearCache('/api/orders');
    return response;
  }
  
  // 更新订单
  async updateOrder(orderId, updateData) {
    const response = await apiGateway.put(`/api/orders/${orderId}`, updateData);
    // 清除相关缓存
    apiGateway.clearCache('/api/orders');
    apiGateway.clearCache(`/api/orders/${orderId}`);
    return response;
  }
  
  // 删除订单
  async deleteOrder(orderId) {
    const response = await apiGateway.delete(`/api/orders/${orderId}`);
    // 清除相关缓存
    apiGateway.clearCache('/api/orders');
    apiGateway.clearCache(`/api/orders/${orderId}`);
    return response;
  }
  
  // 批量操作
  async batchUpdate(orderIds, updateData) {
    const promises = orderIds.map(id => 
      this.updateOrder(id, updateData)
    );
    return await Promise.all(promises);
  }
}

// 创建单例
const orderAPI = new OrderAPI();

// ================================================================
// 11. 实际应用示例：用户认证
// ================================================================

class AuthAPI {
  async login(username, password) {
    const response = await apiGateway.post('/api/auth/login', {
      username,
      password
    }, {
      noCache: true // 登录请求不缓存
    });
    
    if (response.success && response.data.token) {
      // 保存token
      localStorage.setItem('auth_token', response.data.token);
      // 清除所有缓存（切换用户）
      apiGateway.clearCache();
    }
    
    return response;
  }
  
  async logout() {
    const response = await apiGateway.post('/api/auth/logout', null, {
      noCache: true
    });
    
    // 清除token和缓存
    localStorage.removeItem('auth_token');
    apiGateway.clearCache();
    
    return response;
  }
  
  async checkAuth() {
    return await apiGateway.get('/api/auth/check');
  }
}

const authAPI = new AuthAPI();

// ================================================================
// 12. 性能优化示例
// ================================================================

// 并行请求
async function loadDashboardData() {
  const [orders, customers, products] = await Promise.all([
    apiGateway.get('/api/orders'),
    apiGateway.get('/api/customers'),
    apiGateway.get('/api/products')
  ]);
  
  return { orders, customers, products };
}

// 预加载
async function preloadCommonData() {
  // 页面加载时预先获取常用数据
  await Promise.all([
    apiGateway.get('/api/customers'),
    apiGateway.get('/api/products'),
    apiGateway.get('/api/company')
  ]);
  
  console.log('[Preload] 常用数据已预加载并缓存');
}

// 页面加载时执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', preloadCommonData);
} else {
  preloadCommonData();
}

// ================================================================
// 导出API实例
// ================================================================

export { orderAPI, authAPI, preloadCommonData, loadDashboardData };
