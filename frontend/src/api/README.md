# API网关使用指南

## 📖 简介

API网关（APIGateway）是前端统一的API调用入口，提供以下功能：

✅ **自动环境检测** - 智能识别Tauri/浏览器环境  
✅ **智能路由选择** - 自动选择Tauri Command或HTTP API  
✅ **请求重试机制** - 网络故障自动重试  
✅ **响应缓存** - 自动缓存GET请求，提升性能  
✅ **拦截器支持** - 请求/响应/错误拦截器  
✅ **统一错误处理** - 标准化错误格式  

---

## 🚀 快速开始

### 1. 基本使用

```javascript
import { apiGateway } from './api/gateway.js';

// GET请求
const orders = await apiGateway.get('/api/orders');

// POST请求
const newOrder = await apiGateway.post('/api/orders', {
  customerId: 1,
  items: [/* ... */]
});

// PUT请求
const updated = await apiGateway.put('/api/orders/123', {
  status: '已发货'
});

// DELETE请求
await apiGateway.delete('/api/orders/123');
```

### 2. 带查询参数

```javascript
// 方式1：作为第二个参数
const filtered = await apiGateway.get('/api/orders', {
  status: '已创建',
  page: 1,
  pageSize: 20
});

// 方式2：构建URL
const url = '/api/orders?status=已创建&page=1';
const orders = await apiGateway.get(url);
```

### 3. 禁用缓存

```javascript
// 强制刷新，不使用缓存
const orders = await apiGateway.get('/api/orders', null, {
  noCache: true
});
```

---

## 🔧 高级功能

### 1. 请求拦截器

```javascript
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
  console.log(`[API] ${request.method} ${request.endpoint}`);
  return request;
});
```

### 2. 响应拦截器

```javascript
// 统一处理响应
apiGateway.addResponseInterceptor(async (response, context) => {
  if (!response.success) {
    console.warn('请求失败:', response.error);
  }
  return response;
});

// 性能监控
apiGateway.addResponseInterceptor(async (response, context) => {
  const duration = Date.now() - context.startTime;
  if (duration > 1000) {
    console.warn(`慢请求: ${context.endpoint} - ${duration}ms`);
  }
  return response;
});
```

### 3. 错误处理器

```javascript
// 401未授权处理
apiGateway.addErrorHandler(async (error, context) => {
  if (error.message?.includes('401')) {
    window.location.href = '/login.html';
  }
  return error;
});

// 网络错误处理
apiGateway.addErrorHandler(async (error, context) => {
  if (error.message?.includes('ECONNREFUSED')) {
    alert('无法连接到服务器');
  }
  return error;
});
```

### 4. 缓存管理

```javascript
// 清空所有缓存
apiGateway.clearCache();

// 清空特定模式的缓存
apiGateway.clearCache('/api/orders');

// 清空正则匹配的缓存
apiGateway.clearCache('/api/orders/\\d+');
```

---

## 📊 最佳实践

### 1. 封装API模块

```javascript
// api/orders.js
import { apiGateway } from './gateway.js';

export class OrderAPI {
  async getAll(filters) {
    return await apiGateway.get('/api/orders', filters);
  }
  
  async getById(id) {
    return await apiGateway.get(`/api/orders/${id}`);
  }
  
  async create(data) {
    const response = await apiGateway.post('/api/orders', data);
    // 创建后清除列表缓存
    apiGateway.clearCache('/api/orders');
    return response;
  }
  
  async update(id, data) {
    const response = await apiGateway.put(`/api/orders/${id}`, data);
    // 更新后清除相关缓存
    apiGateway.clearCache('/api/orders');
    apiGateway.clearCache(`/api/orders/${id}`);
    return response;
  }
}

export const orderAPI = new OrderAPI();
```

### 2. 并行请求

```javascript
// 同时获取多个资源
const [orders, customers, products] = await Promise.all([
  apiGateway.get('/api/orders'),
  apiGateway.get('/api/customers'),
  apiGateway.get('/api/products')
]);
```

### 3. 数据预加载

```javascript
// 页面加载时预先获取常用数据
async function preloadCommonData() {
  await Promise.all([
    apiGateway.get('/api/customers'),
    apiGateway.get('/api/products'),
    apiGateway.get('/api/company')
  ]);
  console.log('常用数据已预加载并缓存');
}

window.addEventListener('load', preloadCommonData);
```

---

## 🎯 Tauri集成

### 工作原理

1. **自动检测**：检测 `window.__TAURI__` 是否存在
2. **命令映射**：根据端点和方法匹配Tauri Command
3. **自动降级**：Tauri Command失败时自动降级到HTTP API

### 命令映射

| HTTP请求 | Tauri Command |
|---------|---------------|
| `GET /api/orders` | `get_orders` |
| `GET /api/orders/123` | `get_order` |
| `POST /api/orders` | `create_order` |
| `PUT /api/orders/123` | `update_order` |
| `DELETE /api/orders/123` | `delete_order` |

### 添加新命令

```javascript
// 在gateway.js中添加映射
this.commandMap = {
  'GET /api/new-endpoint': 'new_command',
  // ...
};
```

---

## ⚙️ 配置选项

### 重试配置

```javascript
apiGateway.retryConfig = {
  maxRetries: 3,           // 最大重试次数
  retryDelay: 1000,        // 初始重试延迟(ms)
  retryableErrors: [       // 可重试的错误类型
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND'
  ]
};
```

### 缓存配置

```javascript
apiGateway.cacheConfig = {
  enabled: true,           // 是否启用缓存
  ttl: 5 * 60 * 1000,     // 缓存有效期(ms)
  maxSize: 100             // 最大缓存条目数
};
```

### 基础URL

```javascript
apiGateway.baseURL = 'http://127.0.0.1:3000';
```

---

## 🔍 调试

### 查看请求日志

```javascript
// 默认已启用控制台日志
// 查看请求: [APIGateway] POST /api/orders - 150ms
// 查看缓存: [APIGateway] 缓存命中: /api/orders
```

### 性能监控

```javascript
// 所有请求都会记录执行时间
// [APIGateway] GET /api/orders - 85ms
```

### 缓存调试

```javascript
// 查看当前缓存
console.log('缓存大小:', apiGateway.cache.size);
console.log('缓存内容:', Array.from(apiGateway.cache.keys()));
```

---

## ❓ 常见问题

### Q1: 为什么有些请求不走Tauri Command？

**A**: 只有在以下情况才会使用Tauri Command：
1. 运行在Tauri环境中
2. 该端点在 `commandMap` 中有映射
3. Tauri Command执行成功

否则会自动降级到HTTP API。

### Q2: 如何禁用自动降级？

**A**: 在options中设置 `fallbackToHTTP: false`

```javascript
await apiGateway.get('/api/orders', null, {
  fallbackToHTTP: false
});
```

### Q3: 缓存何时会被清除？

**A**: 以下情况缓存会被清除：
1. 手动调用 `clearCache()`
2. 缓存超过TTL时间
3. 缓存达到最大数量限制

### Q4: 如何处理文件上传？

**A**: 使用FormData，网关会自动处理

```javascript
const formData = new FormData();
formData.append('file', file);

await apiGateway.post('/api/upload', formData, {
  headers: {
    'Content-Type': 'multipart/form-data'
  }
});
```

---

## 📚 参考资料

- [gateway.js](./gateway.js) - 源代码
- [gateway-examples.js](./gateway-examples.js) - 使用示例
- [深度分析版优化文档](../../../docs/优化方案/项目优化建议-深度分析版.md) - 架构说明

---

**最后更新：2026-01-18**
