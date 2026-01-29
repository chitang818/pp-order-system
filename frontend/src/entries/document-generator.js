/**
 * 文档生成器页面入口（docs.html）
 * 
 * 功能说明：
 * - 这是一个独立的单页面应用，只有一个页面
 * - 提供基本的单据生成、预览和导出功能
 * - 与单据中心（document-center）功能相互独立
 * 
 * 注意：单据中心（document-center）包含三个二级页面：
 *   1. 单据生成（generate）
 *   2. 单据模版（templates）
 *   3. 模板编辑（template-editor）
 * 
 * ES6 模块化版本
 */

// API 层
// ✅ 已转换为 ES6 模块
import '../api/cache.js';
// ✅ 已转换为 ES6 模块
import '../api/api.js';

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

// 主脚本（使用异步 IIFE 包装，兼容旧版浏览器）
// ✅ 已转换为 ES6 模块（在通过守卫后再按需加载）
(async () => {
  const ok = await guard();
  if (ok) {
    await import('../pages/document-generator/docs.js');
    // 页面初始化脚本（预览窗口按钮事件绑定）
    await import('../pages/document-generator/docs-page-init.js');
    console.log('[Vite] 文档生成器页面入口加载完成');
  } else {
    console.warn('[Vite] 未登录，已重定向登录页');
  }
})();

