/**
 * 主入口文件 - 优化启动速度版本
 * 关键模块同步加载，非关键模块懒加载
 */

// ==================== 关键模块（同步加载，启动必需） ====================
// 1. 基础工具类（需要最先加载）
import { backendManager } from '../utils/backend-manager.js';
import '../utils/event-bus.js';
import { initAuth } from '../utils/auth.js';
import '../utils/notification.js';
import '../components/modal-dialog.js';
import '../utils/validation.js';
import '../utils/storage.js';
import '../utils/formatter.js';
import '../utils/error-handler.js';
import { showEnvBanner, showEnvBadge } from '../utils/env-banner.js';

// 2. API 层（依赖工具类，启动必需）
import '../api/cache.js';
import '../api/api.js';

// 3. 配置和布局（启动必需）
import '../config/navigation.js';
import '../components/layout.js';

// ==================== 非关键模块（懒加载，按需加载） ====================
// 工具类模块 - 延迟加载，不阻塞启动
const lazyLoadUtils = async () => {
  // 使用 requestIdleCallback 或 setTimeout 延迟加载非关键工具和预加载核心资源
  const loadWhenIdle = () => {
    // 1. 加载非关键工具库
    Promise.all([
      import('../utils/settings-ui.js').catch(() => null),
      import('../utils/template-config.js').catch(() => null)
    ]).catch(() => {
      // 静默处理加载错误
    });

    // 2. 预加载核心业务模块 (Preload Critical Modules)
    // 2. 预加载核心业务模块 (Preload Critical Modules)
    // 注意：移除手动 import 预加载，因为在生产环境中这些文件已被打包且路径改变
    // 使用 import(/* @vite-ignore */ path) 会导致浏览器请求错误的原始路径(如 ../pages/...)
    // 而实际上这些文件已被打包在 assets/js/ 目录中。
    // 现代浏览器和 Vite 的 chunk 分割会自动处理按需加载。
    /*
    const criticalModules = [
      '../pages/order/order-new-page.js',
      '../pages/customer/customer-new-page.js',
      '../pages/product/product-list-page.js',
      '../views/orders/orders-list-view.js',
      '../views/customers/customers-list-view.js'
    ];

    criticalModules.forEach(path => {
      import(// @vite-ignore // path).catch(err => {
        // 预加载失败不影响主流程，仅记录调试信息
        console.debug(`[Preload] Module load failed: ${path}`, err);
      });
    });
    */

    // 3. 预加载核心视图模板 (Warm up Browser Cache for Views)
    // ViewLoader 使用 fetch，这里提前 fetch 可以利用浏览器缓存
    // 优化：只预加载首页，其他视图按需加载
    const criticalViews = [
      './views/home.html'
    ];

    // 延迟预加载其他视图（不阻塞启动）
    const secondaryViews = [
      './views/orders/list.html',
      './views/customers.html'
    ];

    // 立即预加载关键视图（首页）
    criticalViews.forEach(url => {
      fetch(url, { priority: 'low' }).then(res => {
        if (res.ok) console.debug(`[Preload] View cached: ${url}`);
      }).catch(() => { });
    });
    
    // 延迟预加载次要视图（不阻塞启动）
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        secondaryViews.forEach(url => {
          fetch(url, { priority: 'low' }).then(res => {
            if (res.ok) console.debug(`[Preload] Secondary view cached: ${url}`);
          }).catch(() => { });
        });
      }, { timeout: 2000 });
    } else {
      setTimeout(() => {
        secondaryViews.forEach(url => {
          fetch(url, { priority: 'low' }).then(res => {
            if (res.ok) console.debug(`[Preload] Secondary view cached: ${url}`);
          }).catch(() => { });
        });
      }, 2000);
    }
  };

  // 优先使用 requestIdleCallback，否则使用 setTimeout
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(loadWhenIdle, { timeout: 3000 });
  } else {
    setTimeout(loadWhenIdle, 1000);
  }
};

// ==================== 主应用逻辑（延迟加载） ====================
// SPA 页面逻辑 - 延迟加载，在 DOM 准备好后加载
const loadSPA = async () => {
  try {
    await import('../pages/spa.js');
    console.log('[Vite] SPA 模块加载完成');
  } catch (error) {
    console.error('[Vite] SPA 模块加载失败:', error);
  }
};

// ==================== 全局错误处理 ====================
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global] 未捕获的 Promise 异常:', event.reason);
  // 忽略一些常见的非致命错误
  if (event.reason && event.reason.name === 'AbortError') return;
  if (window.NotificationSystem) {
    window.NotificationSystem.toast('发生未知错误，请查看控制台', 'error');
  }
});

window.addEventListener('error', (event) => {
  console.error('[Global] 未捕获的脚本错误:', event.error || event.message);
  // 过滤资源加载错误（如图片 404），通常不需要弹窗
  if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK')) {
    return;
  }
  if (window.NotificationSystem) {
    window.NotificationSystem.toast('发生脚本错误，请查看控制台', 'error');
  }
});

// ==================== 启动流程 ====================

// 核心启动函数：协调后端检查、认证和UI加载
const initApp = async () => {
  try {
    console.log('[App] 开始启动流程...');

    // 0. 显示环境提示（开发模式）
    showEnvBanner();
    showEnvBadge();

    // 1. 确保 DOM 就绪 (通常已经在 DOMContentLoaded 中调用，但作为保险)
    if (document.readyState === 'loading') {
      console.log('[App] 等待 DOM 就绪...');
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    // --- 数据库初始化逻辑（全局前置，优先于其他操作） ---
    // 无论在哪个页面，只要检测到是 Tauri 环境，就必须确保数据库连接已建立
    const { isRealTauriEnvironment, getTauriInvoke } = await import('../utils/tauri-env.js');
    if (isRealTauriEnvironment()) {
      const invoke = getTauriInvoke();
      if (invoke) {
        console.log('[App] 正在建立数据库连接...');
        try {
          await invoke('db_init_connection');
          console.log('[App] 数据库连接已就绪');
        } catch (dbErr) {
          console.error('[App] 数据库连接失败:', dbErr);
          // 数据库连接失败不应阻塞应用加载，登录页会显示具体的连接状态和路径
        }
      }
    }

    // 2. 初始化认证 (检查登录状态，可能触发跳转)
    // 注意：initAuth 现在是手动调用，不会自动运行
    console.log('[App] 初始化认证系统...');
    initAuth();

    // 3. 加载主应用 SPA 逻辑 (必须在认证处理后)
    console.log('[App] 加载 SPA 模块...');
    await loadSPA();

    // 4. 启动非关键模块懒加载 (不阻塞)
    lazyLoadUtils();

    // 5. 后台静默启动导出服务（不阻塞 UI，用户无感知）
    // 延迟启动，让 UI 先完全渲染
    setTimeout(() => {
      console.log('[App] 后台静默启动导出服务...');
      backendManager.ensureBackend({ silent: true }).then(() => {
        console.log('[App] 导出服务已在后台就绪');
      }).catch(err => {
        // 导出服务启动失败不影响主流程，只在用户真正使用导出功能时才提示
        console.warn('[App] 导出服务后台启动失败，将在使用时重试:', err.message);
      });
    }, 2000); // 延迟 2 秒，确保 UI 已完全加载

    console.log('[App] 启动流程完成');

  } catch (err) {
    console.error('[App] 启动失败:', err);
    // 如果是后端启动彻底失败，可能需要并在 UI 上提示用户
    if (window.NotificationSystem) {
      window.NotificationSystem.toast('应用启动异常，请查看日志', 'error');
    }
  }
};

// 执行启动
// 如果已经在 DOMContentLoaded 之后 (module script 可能执行得晚)，直接运行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
