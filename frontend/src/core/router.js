/**
 * 路由管理器
 * 负责处理 SPA 应用的路由切换、视图加载和初始化
 * ES6 模块化版本
 * 
 * @module core/router
 * @example
 * ```javascript
 * import { Router } from './core/router.js';
 * 
 * const router = new Router({
 *   routes: ['home', 'orders', 'customers']
 * });
 * 
 * router.onRouteInit('orders', async () => {
 *   console.log('订单页面初始化');
 * });
 * 
 * await router.setActiveRoute('orders/list');
 * ```
 */

import { ViewLoader } from '../utils/view-loader.js';
import { guard } from '../utils/route-guard.js';
import { initUserInfo } from '../utils/auth.js';
import { timerManager } from '../utils/timer-manager.js';
import { eventManager } from '../utils/event-manager.js';
import { updateNavigation } from '../utils/navigation-utils.js';
import { updateSidebarRoute } from '../components/layout.js';

/**
 * 路由管理器类
 * 负责处理 SPA 应用的路由切换、视图加载和初始化
 * 
 * @class Router
 * @example
 * ```javascript
 * const router = new Router({
 *   routes: ['home', 'orders', 'customers'],
 *   viewLoader: new ViewLoader()
 * });
 * ```
 */
export class Router {
  /**
   * 创建路由管理器实例
   * @param {Object} options - 配置选项
   * @param {Array<string>} [options.routes] - 可用路由列表，默认 ['home', 'orders', 'customers', 'analytics', 'products', 'settings']
   * @param {ViewLoader} [options.viewLoader] - 视图加载器实例，默认创建新实例
   */
  constructor(options = {}) {
    /**
     * 可用路由列表
     * @type {Array<string>}
     */
    this.routes = options.routes || ["home", "orders", "document-center", "partners", "analytics", "products", "settings"];

    /**
     * 视图加载器
     * @type {ViewLoader}
     */
    this.viewLoader = options.viewLoader || new ViewLoader();

    /**
     * 防止重复初始化
     * @type {boolean}
     */
    this._isLoading = false;
    this._loadingViewPath = null;
    this._activeViewPath = null;

    /**
     * 当前路由信息
     * @type {Object}
     * @property {string} base - 基础路由名称
     * @property {string} sub - 子路由名称
     * @property {string} fullPath - 完整路径
     * @property {Object} query - 查询参数对象
     */
    this.currentRoute = {
      base: 'home',
      sub: '',
      fullPath: 'home',
      query: {}
    };

    /**
     * 路由初始化回调映射
     * @type {Object<string, Function>}
     */
    this.initCallbacks = {};

    /**
     * 路由守卫回调
     * @type {Function|null}
     */
    this.guardCallback = null;

    /**
     * 用户信息初始化回调
     * @type {Function|null}
     */
    this.userInfoCallback = null;

    /**
     * 路由解析结果缓存（提升性能）
     * @type {Map<string, Object>}
     */
    this._routeCache = new Map();

    /**
     * 认证状态缓存（减少重复检查）
     * @type {Object}
     */
    this._authCache = {
      isAuthenticated: null,
      timestamp: 0,
      ttl: 5000 // 5秒缓存
    };

    /**
     * DOM元素缓存（减少查询）
     * @type {Object}
     */
    this._domCache = {
      container: null,
      mainElement: null,
      lastUpdate: 0
    };

    // 初始化
    this._init();
  }

  /**
   * 初始化路由管理器
   * 注意：不自动绑定 hashchange 事件，由外部控制
   * 避免与旧的路由处理冲突
   */
  _init() {
    // 不在这里绑定 hashchange，由 App 类或外部控制
    // 这样可以避免与 spa.js 中的旧路由处理冲突
  }

  /**
   * 设置路由初始化回调
   * 当路由切换到指定路由时，会调用此回调函数
   * 
   * @param {string} route - 路由名称（如 'home', 'orders', 'customers'）
   * @param {Function} callback - 初始化回调函数，接收 (routeInfo, viewPath) 参数
   * @param {Object} callback.routeInfo - 路由信息对象
   * @param {string} callback.viewPath - 视图路径
   * @example
   * ```javascript
   * router.onRouteInit('orders', async (routeInfo, viewPath) => {
   *   console.log('订单页面初始化', routeInfo);
   *   await loadOrders();
   * });
   * ```
   */
  onRouteInit(route, callback) {
    if (typeof callback === 'function') {
      this.initCallbacks[route] = callback;
    }
  }

  /**
   * 设置路由守卫回调
   * 用于在路由切换前进行权限检查
   * 
   * @param {Function} callback - 守卫回调函数，返回 Promise<boolean>
   * @returns {Promise<boolean>} true 表示允许访问，false 表示拒绝访问
   * @example
   * ```javascript
   * router.setGuard(async () => {
   *   const isAuthenticated = await checkAuth();
   *   return isAuthenticated;
   * });
   * ```
   */
  setGuard(callback) {
    if (typeof callback === 'function') {
      this.guardCallback = callback;
    }
  }

  /**
   * 设置用户信息初始化回调
   * 在路由切换成功后调用，用于更新用户信息显示
   * 
   * @param {Function} callback - 用户信息初始化回调函数
   * @example
   * ```javascript
   * router.setUserInfoInit(() => {
   *   updateUserInfoDisplay();
   * });
   * ```
   */
  setUserInfoInit(callback) {
    if (typeof callback === 'function') {
      this.userInfoCallback = callback;
    }
  }

  /**
   * 解析路由路径
   * 将路由路径字符串解析为结构化对象（带缓存优化）
   * 
   * @param {string} path - 路由路径，如 'orders/list?id=123' 或 'customers/edit'
   * @returns {Object} 解析后的路由信息
   * @returns {string} returns.base - 基础路由名称
   * @returns {string} returns.sub - 子路由名称
   * @returns {string} returns.fullPath - 完整路径（不含查询参数）
   * @returns {Object} returns.query - 查询参数对象
   * @returns {string} returns.route - 规范化后的路由名称
   * @example
   * ```javascript
   * const routeInfo = router.parseRoute('orders/list?id=123&status=active');
   * // 返回: { base: 'orders', sub: 'list', fullPath: 'orders/list', query: { id: '123', status: 'active' }, route: 'orders' }
   * ```
   */
  parseRoute(path) {
    // 使用缓存提升性能（查询参数变化时重新解析）
    const cacheKey = path;
    if (this._routeCache.has(cacheKey)) {
      return this._routeCache.get(cacheKey);
    }

    const raw = (path || '').trim();
    const [routePath, queryString] = raw.split('?');
    const segs = routePath.split('/');
    const base = segs[0] || 'home';
    const sub = segs[1] || '';

    // 解析查询参数
    const query = {};
    if (queryString) {
      queryString.split('&').forEach(param => {
        const [key, value] = param.split('=');
        if (key) {
          query[decodeURIComponent(key)] = decodeURIComponent(value || '');
        }
      });
    }

    // 规范化路由名称：如果 base 在路由列表中，使用 base；否则使用 'home'
    // 特殊处理：确保 'document-center' 被正确识别
    let normalizedRoute = base;

    // 检查 base 是否在路由列表中
    const isInRoutes = this.routes.includes(base);

    // 特殊处理：document-center 和 settings 总是被识别，即使不在 routes 数组中
    if (!isInRoutes) {
      if (base === 'document-center' || base.startsWith('document-center')) {
        normalizedRoute = 'document-center';
      } else if (base === 'settings' || base.startsWith('settings')) {
        normalizedRoute = 'settings';
      } else {
        normalizedRoute = 'home';
      }
    }

    const routeInfo = {
      base,
      sub,
      fullPath: routePath,
      query,
      route: normalizedRoute
    };

    console.log('[Router] parseRoute 解析结果:', {
      path,
      base,
      sub,
      normalizedRoute,
      isInRoutes,
      routes: this.routes,
      routeInfo
    });

    // 缓存结果（限制缓存大小，避免内存泄漏）
    if (this._routeCache.size > 50) {
      const firstKey = this._routeCache.keys().next().value;
      this._routeCache.delete(firstKey);
    }
    this._routeCache.set(cacheKey, routeInfo);

    return routeInfo;
  }

  /**
   * 构建视图路径
   * 根据路由信息构建对应的视图文件路径（优化版本）
   * 
   * @param {Object} routeInfo - 路由信息对象
   * @param {string} routeInfo.route - 路由名称
   * @param {string} routeInfo.sub - 子路由名称
   * @returns {string} 视图路径，如 'orders/list', 'customers/edit'
   * @example
   * ```javascript
   * const viewPath = router.buildViewPath({ route: 'orders', sub: 'list' });
   * // 返回: 'orders/list'
   * ```
   */
  buildViewPath(routeInfo) {
    const { route, sub, base } = routeInfo;

    // 使用路由映射表，提升性能
    const routeMap = {
      'orders': {
        'list': 'orders/list',
        'edit': 'orders/edit',
        'deleted': 'orders/deleted',
        'config': 'orders/config',
        'default': 'orders/list',
        'defaultHash': '#/orders/list'
      },
      'partners': {
        'customers': 'partners/customers',
        'forwarders': 'partners/forwarders',
        'default': 'partners/customers',
        'defaultHash': '#/partners/customers'
      },
      'products': {
        'add': 'products/add',
        'list': 'products/list',
        'default': 'products/list',
        'defaultHash': '#/products/list'
      },
      'settings': {
        'default': 'settings/company',
        'defaultHash': '#/settings/company',
        'subRoutes': true // 支持所有子路由
      },
      'document-center': {
        'generate': 'document-center/generate',
        'templates': 'document-center/templates',
        'templates/edit': 'document-center/template-editor',
        'default': 'document-center/generate',
        'defaultHash': '#/document-center/generate',
        'subRoutes': true // 支持所有子路由
      },
      'analytics': {
        'summary': 'analytics',
        'export': 'analytics/export',
        'order-analysis': 'analytics/order-analysis',
        'default': 'analytics',
        'defaultHash': '#/analytics/summary'
      }
    };

    // 优先使用 base 作为路由键（因为 route 可能被规范化了）
    let routeKey = route;
    // 如果 route 是 'home' 但 base 是 'document-center'，说明路由被错误规范化了
    if (route === 'home' && base === 'document-center') {
      routeKey = 'document-center';
    }

    const routeConfig = routeMap[routeKey];
    if (!routeConfig) {
      // 如果路由不在映射表中，但 base 是 document-center，尝试直接构建路径
      if (base === 'document-center' && sub) {
        return `document-center/${sub}`;
      }
      return route; // 默认返回路由名称
    }

    // 处理有子路由的情况
    if (sub) {
      if (routeConfig[sub]) {
        return routeConfig[sub];
      }
      // 如果是 settings 或 document-center，支持所有子路由
      if ((route === 'settings' || route === 'document-center') && routeConfig.subRoutes) {
        return `${route}/${sub}`;
      }
      // 其他路由的子路由不存在，使用默认值
      if (routeConfig.default) {
        if (routeConfig.defaultHash) {
          history.replaceState(null, '', routeConfig.defaultHash);
        }
        return routeConfig.default;
      }
    }

    // 没有子路由，使用默认值
    if (routeConfig.default) {
      if (routeConfig.defaultHash) {
        history.replaceState(null, '', routeConfig.defaultHash);
      }
      return routeConfig.default;
    }

    return route;
  }

  /**
   * 设置活动路由
   * 切换当前路由，加载对应的视图并执行初始化逻辑
   * @param {string} path - 路由路径，如 'orders/list', 'customers/edit?id=123', 'document-center/generate'
   * @returns {Promise<void>}
   * @throws {Error} 如果视图容器未找到或视图加载失败
   * @example
   * ```javascript
   * await router.setActiveRoute('orders/list');
   * await router.setActiveRoute('customers/edit?id=123');
   * await router.setActiveRoute('document-center/generate');
   * ```
   */
  async setActiveRoute(path) {
    const routeInfo = this.parseRoute(path);
    const { route, base } = routeInfo;
    const viewPath = this.buildViewPath(routeInfo);

    // 防止重复初始化：如果当前路由和视图路径相同，且正在加载，则跳过
    if (this._isLoading && this._loadingViewPath === viewPath) {
      console.log('[Router] 路由正在加载中，跳过重复调用:', { path, viewPath });
      return;
    }

    // 如果当前路由和视图路径相同，且已经激活，则跳过
    // 同时检查视图是否真的存在且激活
    if (this.currentRoute &&
      this.currentRoute.route === routeInfo.route &&
      this.currentRoute.sub === routeInfo.sub &&
      this._activeViewPath === viewPath) {
      // 再次检查DOM中是否真的存在激活的视图
      const container = document.getElementById('view-container');
      if (container) {
        const activeView = container.querySelector(`[data-view].panel.view-active`);
        // 宽松检查：只要有激活的视图，且ID匹配（如果能获取到ID），就认为已激活
        // 或者如果路径完全匹配，也认为已激活
        if (activeView) {
          const activeViewId = activeView.id || '';
          const expectedViewId = this._getViewIdFromPath(viewPath);

          // 如果能匹配到ID，或者路径就是 home (通常 home 比较特殊)
          if (activeViewId === expectedViewId || (viewPath === 'home' && activeViewId === 'view-home')) {
            console.log('[Router] 路由已激活且视图存在，跳过重复调用:', { path, viewPath });
            return;
          }
        }
      }
    }

    console.log('[Router] setActiveRoute 调用:', { path, routeInfo, viewPath });

    // 标记为正在加载
    this._isLoading = true;
    this._loadingViewPath = viewPath;

    // 获取视图容器（提前获取，用于显示加载状态）
    let container = this._domCache.container;
    if (!container || !container.isConnected) {
      container = document.getElementById('view-container');
      if (!container) {
        console.error('[Router] 视图容器未找到: #view-container');
        this._isLoading = false;
        this._loadingViewPath = null;
        return;
      }
      this._domCache.container = container;
    }

    // 检查登录状态（除了登录页面本身，所有路由都需要认证）
    if (base !== 'login') {
      // 使用缓存的认证状态（减少重复检查）
      const now = Date.now();
      let isAuthenticated = this._authCache.isAuthenticated;

      // 如果缓存过期或不存在，重新检查
      if (isAuthenticated === null || (now - this._authCache.timestamp) > this._authCache.ttl) {
        // 只在需要重新验证时显示加载状态
        container.innerHTML = '<div class="loading-view" style="padding: 40px; text-align: center; color: #6c757d;"><div class="loading-spinner" style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;"></div><div>正在验证登录状态...</div></div>';

        const guardFn = this.guardCallback || guard;
        isAuthenticated = await guardFn();
        this._authCache.isAuthenticated = isAuthenticated;
        this._authCache.timestamp = now;
      }

      if (!isAuthenticated) {
        console.warn('[Router] 未登录，已重定向到登录页');
        this._isLoading = false;
        this._loadingViewPath = null;
        // 跳转到登录页
        window.location.href = 'login.html';
        return;
      }

      // 认证成功后，显示正在加载页面状态
      container.innerHTML = '<div class="loading-view" style="padding: 40px; text-align: center; color: #6c757d;"><div class="loading-spinner" style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;"></div><div>正在加载页面...</div></div>';

      // 刷新用户信息显示（使用微任务，不阻塞路由切换）
      const userInfoFn = this.userInfoCallback || initUserInfo;
      if (typeof userInfoFn === 'function') {
        Promise.resolve().then(() => {
          userInfoFn();
        });
      }
    }

    // 更新当前路由
    this.currentRoute = routeInfo;

    console.log('[Router] 路由解析结果:', { routeInfo, viewPath });

    // 动态加载视图
    try {
      // 监听视图加载完成事件
      const viewLoadedHandler = (event) => {
        const { viewPath: loadedPath } = event.detail;
        console.log(`[Router] 收到 viewLoaded 事件: ${loadedPath}, 期望: ${viewPath}`);

        // 确保加载的视图路径匹配当前路由
        if (loadedPath === viewPath) {
          console.log(`[Router] 视图路径匹配，开始初始化: ${viewPath}`);

          // 标记为已激活
          this._activeViewPath = viewPath;
          this._isLoading = false;
          this._loadingViewPath = null;

          // 立即执行初始化，提升响应速度
          this._activateView(container, viewPath);
          this._updateMainClasses(viewPath);
          // 更新导航菜单的选中状态（使用 routeInfo 的 base 和 sub）
          // 使用微任务确保导航菜单元素已存在，并添加重试机制
          this._updateNavigationWithRetry(routeInfo);
          // 使用微任务队列，确保DOM已完全更新，但不阻塞渲染
          // 优化：立即执行关键初始化，延迟非关键操作
          Promise.resolve().then(() => {
            this._initRouteLogic(routeInfo, viewPath);
          });

          // 延迟执行非关键操作（预加载等）
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => {
              this._postInitRouteLogic(routeInfo, viewPath);
            }, { timeout: 1500 });
          }
        }
      };

      // 绑定视图加载事件（一次性）
      container.addEventListener('viewLoaded', viewLoadedHandler, { once: true });

      // 使用 renderView 方法渲染视图到容器（这会自动加载HTML并注入到容器中）
      await this.viewLoader.renderView('view-container', viewPath);

    } catch (error) {
      console.error('[Router] 加载视图失败:', error);
      // 重置加载状态
      this._isLoading = false;
      this._loadingViewPath = null;
    }
  }

  /**
   * 激活视图（添加 view-active 类）
   * @param {HTMLElement} container - 视图容器
   * @param {string} viewPath - 视图路径
   */
  _activateView(container, viewPath) {
    // 优化：只在容器内查找，减少查询范围
    // 移除容器内所有视图的 view-active 类
    const allViews = container.querySelectorAll('[data-view].panel');
    if (allViews.length > 0) {
      allViews.forEach(view => view.classList.remove('view-active'));
    }

    // 为当前视图添加 view-active 类（使用优先级选择器）
    const selectors = [
      '[data-view].panel',
      '[data-view]',
      'section[data-view]',
      'section.panel[data-view]',
      'div[data-view].panel'
    ];

    let currentView = null;
    for (const selector of selectors) {
      currentView = container.querySelector(selector);
      if (currentView) break;
    }

    if (currentView) {
      currentView.classList.add('view-active');
      console.log(`[Router] 已为视图添加 view-active 类: ${viewPath}`);
    } else {
      console.warn(`[Router] 未找到当前视图元素 [data-view].panel: ${viewPath}`);
    }
  }

  /**
   * 更新主元素类名
   * @param {string} viewPath - 视图路径
   */
  _updateMainClasses(viewPath) {
    // 使用缓存的主元素，减少DOM查询
    let mainElement = this._domCache.mainElement;
    if (!mainElement || !mainElement.isConnected) {
      mainElement = document.querySelector('.main');
      if (!mainElement) return;
      this._domCache.mainElement = mainElement;
    }

    // 使用类名映射表，提升性能
    const classMap = {
      'orders/list': 'orders-list-active',
      'orders/edit': 'orders-edit-active',
      'orders/deleted': 'orders-deleted-active',
      'orders/config': 'orders-config-active',
      'home': 'home-active',
      'document-center': 'document-center-active',
      'analytics': 'analytics-active'
    };

    // 移除所有页面状态类（批量操作）
    const allClasses = ['orders-list-active', 'orders-edit-active', 'orders-deleted-active', 'orders-config-active', 'home-active', 'customers-active', 'document-center-active', 'analytics-active'];
    mainElement.classList.remove(...allClasses);

    // 根据视图路径添加相应的类
    const activeClass = classMap[viewPath] || (viewPath.startsWith('customers') ? 'customers-active' : null);
    if (activeClass) {
      mainElement.classList.add(activeClass);
    }
  }

  /**
   * 从视图路径获取视图ID（与 ViewLoader 保持一致）
   * @param {string} viewPath - 视图路径
   * @returns {string} 视图ID
   * @private
   */
  _getViewIdFromPath(viewPath) {
    const viewIdMap = {
      'home': 'view-home',
      'customers': 'view-customers',
      'customers/edit': 'view-customers-edit',
      'orders/list': 'view-orders-list',
      'orders/edit': 'view-orders-edit',
      'orders/deleted': 'view-orders-deleted',
      'orders/config': 'view-orders-config',
      'document-center/generate': 'view-document-center-generate',
      'document-center/templates': 'view-document-center-templates',
      'document-center/template-editor': 'template-editor-modal',
      'analytics': 'view-analytics',
      'analytics/export': 'view-analytics-export',
      'analytics/order-analysis': 'view-analytics-order-analysis',
      'products/list': 'productsListPage',
      'products/add': 'productAddPage',
      'settings/company': 'view-settings',
      'settings/database': 'view-settings',
      'settings/export': 'view-settings',
      'settings/products': 'view-settings',
      'settings/users': 'view-settings',
      'settings/logs': 'view-settings',
      'settings/diagnostics': 'view-settings'
    };
    return viewIdMap[viewPath] || '';
  }

  /**
   * 更新导航菜单状态（带重试机制）
   * @param {Object} routeInfo - 路由信息
   * @private
   */
  _updateNavigationWithRetry(routeInfo) {
    const { route, sub, base } = routeInfo;
    const updateFn = () => {
      try {
        const nav = document.getElementById('nav');
        if (!nav) {
          return false; // 导航菜单未准备好
        }
        // 优先使用 base，因为 route 可能被错误规范化
        // 如果 base 是 'document-center' 或 'settings'，使用 base；否则使用 route
        const navRoute = (base === 'document-center' || base === 'settings') ? base : route;
        const navSub = sub || '';

        console.log('[Router] _updateNavigationWithRetry 调用:', { route, base, navRoute, navSub });

        updateNavigation(navRoute, navSub);
        // 同时调用 layout.js 中的 updateSidebarRoute 确保侧边栏状态同步
        updateSidebarRoute(navRoute, navSub);
        console.log(`[Router] 导航状态已更新: ${navRoute}/${navSub}`);
        return true;
      } catch (error) {
        console.error('[Router] 更新导航状态失败:', error);
        return false;
      }
    };

    // 立即尝试更新
    if (updateFn()) {
      return;
    }

    // 如果失败，延迟重试（最多5次，每次100ms）
    let retries = 0;
    const maxRetries = 5;
    const retryInterval = setInterval(() => {
      if (updateFn() || retries >= maxRetries) {
        clearInterval(retryInterval);
        if (retries >= maxRetries) {
          console.warn('[Router] 导航状态更新失败，已达到最大重试次数');
        }
      }
      retries++;
    }, 100);
  }

  /**
   * 更新导航菜单状态
   * @param {Object} routeInfo - 路由信息
   * @private
   */
  _updateNavigationState(routeInfo) {
    const { route, sub, base } = routeInfo;
    try {
      // 优先使用 base，因为 route 可能被错误规范化
      // 如果 base 是 'document-center' 或 'settings'，使用 base；否则使用 route
      const navRoute = (base === 'document-center' || base === 'settings') ? base : route;
      const navSub = sub || '';

      console.log('[Router] _updateNavigationState 调用:', { route, base, navRoute, navSub });

      updateNavigation(navRoute, navSub);
      // 同时调用 layout.js 中的 updateSidebarRoute 确保侧边栏状态同步
      updateSidebarRoute(navRoute, navSub);
      console.log(`[Router] 导航状态已更新: ${navRoute}/${navSub}`);
    } catch (error) {
      console.error('[Router] 更新导航状态失败:', error);
    }
  }

  /**
   * 初始化路由逻辑（优化版：延迟非关键操作）
   * @param {Object} routeInfo - 路由信息
   * @param {string} viewPath - 视图路径
   */
  _initRouteLogic(routeInfo, viewPath) {
    const { route, sub, base } = routeInfo;

    // 优先使用 base 作为路由键，因为 route 可能被错误规范化
    // 如果 base 是 'document-center' 或 'settings'，使用 base；否则使用 route
    const routeKey = (base === 'document-center' || base === 'settings') ? base : route;

    console.log('[Router] _initRouteLogic 调用:', { route, base, routeKey, sub, viewPath });

    // 调用路由初始化回调（立即执行关键操作）
    if (this.initCallbacks[routeKey]) {
      console.log(`[Router] 找到路由初始化回调: ${routeKey}`);
      // 使用 Promise.resolve().then() 确保异步执行，不阻塞渲染
      Promise.resolve().then(async () => {
        try {
          await this.initCallbacks[routeKey](routeInfo, viewPath);
        } catch (error) {
          console.error(`[Router] 路由初始化回调执行失败 (${routeKey}):`, error);
        }
      });
    } else {
      console.warn(`[Router] 未找到路由初始化回调: ${routeKey}，可用回调:`, Object.keys(this.initCallbacks));
    }
  }

  /**
   * 路由初始化后的非关键操作（延迟执行）
   * @param {Object} routeInfo - 路由信息
   * @param {string} viewPath - 视图路径
   * @private
   */
  _postInitRouteLogic(routeInfo, viewPath) {
    // 预加载相关视图（不阻塞当前页面）
    if (this.viewLoader) {
      this.viewLoader.smartPreload(viewPath);
    }
  }

  /**
   * 清除认证缓存（当用户登录/登出时调用）
   */
  clearAuthCache() {
    this._authCache.isAuthenticated = null;
    this._authCache.timestamp = 0;
  }

  /**
   * 清除DOM缓存（当DOM结构发生变化时调用）
   */
  clearDomCache() {
    this._domCache.container = null;
    this._domCache.mainElement = null;
    this._domCache.lastUpdate = 0;
  }

  /**
   * 清除路由缓存（当路由配置发生变化时调用）
   */
  clearRouteCache() {
    this._routeCache.clear();
  }

  /**
   * 导航到指定路由
   * 通过修改 location.hash 触发路由切换
   * 
   * @param {string} path - 路由路径，如 'orders/list' 或 '/orders/list'
   * @example
   * ```javascript
   * router.navigate('orders/list');
   * router.navigate('/customers/edit?id=123');
   * ```
   */
  navigate(path) {
    if (!path) return;
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    window.location.hash = `#/${normalizedPath}`;
  }

  /**
   * 获取当前路由信息
   * 返回当前路由的副本，避免外部修改影响内部状态
   * 
   * @returns {Object} 当前路由信息的副本
   * @returns {string} returns.base - 基础路由名称
   * @returns {string} returns.sub - 子路由名称
   * @returns {string} returns.fullPath - 完整路径
   * @returns {Object} returns.query - 查询参数对象
   * @example
   * ```javascript
   * const current = router.getCurrentRoute();
   * console.log(current.base); // 'orders'
   * console.log(current.sub); // 'list'
   * ```
   */
  getCurrentRoute() {
    return { ...this.currentRoute };
  }

  /**
   * 获取当前路由路径
   * 返回当前路由的完整路径（不含查询参数）
   * 
   * @returns {string} 当前路由路径，如 'orders/list'
   * @example
   * ```javascript
   * const path = router.getCurrentPath();
   * console.log(path); // 'orders/list'
   * ```
   */
  getCurrentPath() {
    return this.currentRoute.fullPath;
  }
}


