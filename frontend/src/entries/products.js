/**
 * 产品管理页面入口
 * ES6 模块化版本
 */

// 工具类
// ✅ 已转换为 ES6 模块
import '../utils/notification.js';
// ✅ 已转换为 ES6 模块
import '../utils/validation.js';
// ✅ 已转换为 ES6 模块
import '../utils/storage.js';
// ✅ 已转换为 ES6 模块
import '../utils/formatter.js';
// ✅ 已转换为 ES6 模块
import '../utils/error-handler.js';

// 路由守卫：未登录跳转登录页
import { guard } from '../utils/route-guard.js';

// 页面业务逻辑（使用异步 IIFE 包装，兼容旧版浏览器）
// ✅ 已转换为 ES6 模块（在通过守卫后再按需加载）
(async () => {
  const ok = await guard();
  if (ok) {
    await import('../pages/product/product-list-page.js');
    console.log('[Vite] 产品管理页面入口加载完成');
  } else {
    console.warn('[Vite] 未登录，已重定向登录页');
  }
})();

