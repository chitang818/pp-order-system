/**
 * 订单编辑页面入口
 * ES6 模块化版本
 */

// API 层
// ✅ 已转换为 ES6 模块
import '../api/cache.js';
// ✅ 已转换为 ES6 模块
import '../api/api.js';

// 配置和组件
// 注意：navigation.js 必须在 layout.js 之前导入，因为 layout.js 依赖 NavigationConfig
// ✅ 已转换为 ES6 模块
import '../config/navigation.js';
// ✅ 已转换为 ES6 模块
import '../components/layout.js';

// 路由守卫：未登录跳转登录页
import { guard } from '../utils/route-guard.js';
// 确保 LayoutComponent 在全局可用后，触发布局初始化
// 由于 layout.js 是 IIFE，它会在导入时立即执行并设置 window.LayoutComponent
// 但为了确保 DOM 也准备好了，我们使用 Promise 来等待
if (typeof window !== 'undefined') {
  // 等待 DOM 和所有模块都加载完成
  const initLayoutComponent = () => {
    // 检查必要的依赖
    if (!window.NavigationConfig) {
      console.warn('[Order New] NavigationConfig 未加载，等待中...');
      setTimeout(initLayoutComponent, 100);
      return;
    }
    
    if (!window.LayoutComponent) {
      console.warn('[Order New] LayoutComponent 未加载，等待中...');
      setTimeout(initLayoutComponent, 100);
      return;
    }
    
    // 所有依赖都已加载，触发事件
    console.log('[Order New] LayoutComponent 已加载，触发布局初始化');
    window.dispatchEvent(new CustomEvent('layout-component-ready'));
  };
  
  // 在 DOM 加载完成后开始检查
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initLayoutComponent, 100);
    });
  } else {
    // DOM 已经加载完成，立即检查
    setTimeout(initLayoutComponent, 100);
  }
}

// 工具类
// ✅ 已转换为 ES6 模块
import '../utils/auth.js';
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

// 页面业务逻辑（使用异步 IIFE 包装，兼容旧版浏览器）
// ✅ 已转换为 ES6 模块（在通过守卫后再按需加载）
(async () => {
  const ok = await guard();
  if (ok) {
    await import('./pages/order/order-new-page.js');
    console.log('[Vite] 订单编辑页面入口加载完成');
  } else {
    console.warn('[Vite] 未登录，已重定向登录页');
  }
})();
