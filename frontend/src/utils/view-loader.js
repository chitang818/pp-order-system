/**
 * 视图加载器 - 动态加载HTML片段
 * 支持按需加载视图，提升首屏性能
 */

export class ViewLoader {
  constructor() {
    this.cache = new Map(); // 缓存已加载的视图
    this._loadPromises = new Map(); // 正在加载的Promise缓存，避免重复请求
    this._containerCache = null; // 容器元素缓存
    this._preloadQueue = new Set(); // 预加载队列
    this._isPreloading = false; // 是否正在预加载
  }

  /**
   * 加载视图HTML片段（优化版：添加请求去重和错误重试）
   * @param {string} viewPath - 视图路径，如 'home', 'orders/list', 'orders/edit', 'settings/company'
   * @param {Object} options - 加载选项
   * @param {boolean} options.forceRefresh - 是否强制刷新缓存
   * @returns {Promise<string>} HTML字符串
   */
  async loadView(viewPath, options = {}) {
    const { forceRefresh = false } = options;

    // 检查缓存（除非强制刷新）
    if (!forceRefresh && this.cache.has(viewPath)) {
      return this.cache.get(viewPath);
    }

    // 检查是否正在加载（避免重复请求）
    if (this._loadPromises.has(viewPath)) {
      return await this._loadPromises.get(viewPath);
    }

    // 创建加载Promise（带重试机制）
    const loadPromise = (async () => {
      let retries = 0;
      const maxRetries = 2;

      while (retries <= maxRetries) {
        try {
          // 动态导入HTML片段
          // 支持二级路径：orders/list -> ./views/orders/list.html
          // 使用相对路径 ./ 以兼容 Electron 的 file:// 协议
          const url = `./views/${viewPath}.html`;

          // 使用 AbortController 设置超时（优化：避免长时间等待）
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

          const response = await fetch(url, {
            signal: controller.signal,
            cache: forceRefresh ? 'no-cache' : 'default'
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`Failed to load view: ${viewPath} (${response.status})`);
          }
          const html = await response.text();

          // 缓存结果
          this.cache.set(viewPath, html);
          // 移除加载Promise
          this._loadPromises.delete(viewPath);
          return html;
        } catch (error) {
          // 如果是超时或网络错误，且还有重试次数，则重试
          if (retries < maxRetries && (error.name === 'AbortError' || error.message.includes('fetch'))) {
            retries++;
            // 指数退避：第一次重试等待100ms，第二次等待200ms
            await new Promise(resolve => setTimeout(resolve, 100 * retries));
            continue;
          }

          // 移除加载Promise（即使失败也要移除）
          this._loadPromises.delete(viewPath);
          console.error(`Error loading view ${viewPath}:`, error);
          return `<div class="error-view" style="padding: 40px; text-align: center; color: #dc3545;">
            <div style="font-size: 18px; margin-bottom: 10px;">⚠️ 加载视图失败</div>
            <div style="font-size: 14px; color: #6c757d;">${viewPath}</div>
            <div style="font-size: 12px; color: #999; margin-top: 8px;">${error.message}</div>
          </div>`;
        }
      }
    })();

    // 缓存加载Promise
    this._loadPromises.set(viewPath, loadPromise);
    return await loadPromise;
  }

  /**
   * 渲染视图到容器
   * @param {string} containerId - 容器ID
   * @param {string} viewPath - 视图路径
   */
  async renderView(containerId, viewPath) {
    // 使用缓存减少DOM查询
    let container = this._containerCache;
    if (!container || !container.isConnected || container.id !== containerId) {
      container = document.getElementById(containerId);
      if (!container) {
        console.error(`Container not found: ${containerId}`);
        return;
      }
      this._containerCache = container;
    }

    console.log(`[ViewLoader] 开始加载视图: ${viewPath}`);

    // 检查当前视图是否已经存在且匹配（在设置loading之前检查）
    const existingView = container.querySelector(`[data-view].panel`);
    const existingViewId = existingView?.id || '';
    const expectedViewId = this._getViewIdFromPath(viewPath);

    console.log(`[ViewLoader] 视图检查: existingViewId=${existingViewId}, expectedViewId=${expectedViewId}`);

    // 如果视图已存在且匹配，且不是第一次加载，则跳过重新设置innerHTML
    // 这样可以避免DOM重新创建导致的抖动
    if (existingView && existingViewId && expectedViewId && existingViewId === expectedViewId) {
      console.log(`[ViewLoader] 视图已存在且匹配: ${viewPath}, 跳过重新加载HTML`);
      // 确保视图是激活状态
      existingView.classList.add('view-active');
      // 直接触发事件，不重新设置innerHTML
      container.dispatchEvent(new CustomEvent('viewLoaded', {
        detail: { viewPath, containerId }
      }));
      return;
    }

    // 显示加载状态（只在需要重新加载时显示）
    // 但不要立即设置innerHTML，先检查是否有其他视图需要隐藏
    const allViews = container.querySelectorAll(`[data-view].panel`);
    if (allViews.length > 0) {
      // 隐藏所有现有视图，而不是立即替换
      allViews.forEach(view => {
        view.classList.remove('view-active');
      });
    }

    // 缓存命中时跳过 loading spinner（直接注入 HTML，用户感知零延迟）
    const isCached = this.cache.has(viewPath);
    if (!isCached && (!existingView || existingViewId !== expectedViewId)) {
      container.innerHTML = '<div class="loading-view" style="padding: 40px; text-align: center; color: #6c757d;"><div class="loading-spinner" style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;"></div><div>加载中...</div></div>';
    }

    try {
      const html = await this.loadView(viewPath);
      console.log(`[ViewLoader] 视图HTML加载完成: ${viewPath}, 长度: ${html.length}`);

      // 再次检查视图是否已存在（可能在加载HTML期间视图已被创建）
      // 只有当 expectedViewId 不为空时才使用ID选择器
      const checkAgainView = expectedViewId
        ? container.querySelector(`[data-view].panel#${expectedViewId}`)
        : container.querySelector(`[data-view].panel`);
      if (checkAgainView && expectedViewId) {
        console.log(`[ViewLoader] 视图在加载期间已存在: ${viewPath}, 跳过重新设置innerHTML`);
        // 确保视图是激活状态
        checkAgainView.classList.add('view-active');
        // 直接触发事件，不重新设置innerHTML
        container.dispatchEvent(new CustomEvent('viewLoaded', {
          detail: { viewPath, containerId }
        }));
        return;
      }

      // 使用 DocumentFragment 优化DOM操作（减少重排）
      const fragment = document.createRange().createContextualFragment(html);
      container.innerHTML = '';
      container.appendChild(fragment);
      console.log(`[ViewLoader] HTML已注入到容器: ${containerId}`);

      // 智能预加载相关视图
      this.smartPreload(viewPath);

      // 只有在视图被重新加载时才清除初始化标记
      // 如果视图已存在且匹配，不应该清除标记（已在上面提前返回）
      // 清除视图相关的初始化标记，确保视图可以重新初始化
      // 这对于SPA中视图被重新加载时很重要
      const ordersTbody = container.querySelector('#ordersTbody');
      if (ordersTbody) {
        ordersTbody.removeAttribute('data-initialized');
        ordersTbody.removeAttribute('data-initializing');
        console.log(`[ViewLoader] 已清除订单列表初始化标记`);
      }
      const customersTbody = container.querySelector('#customersTbody');
      if (customersTbody) {
        customersTbody.removeAttribute('data-initialized');
        customersTbody.removeAttribute('data-initializing');
        console.log(`[ViewLoader] 已清除客户列表初始化标记`);
      }

      // 重置订单编辑页面的初始化标志（如果视图路径包含 orders/edit）
      if (viewPath.includes('orders/edit')) {
        // 注意：这里需要访问模块级别的变量，但我们无法直接访问
        // 所以这个重置会在路由检查时通过订单ID变化来触发
        console.log(`[ViewLoader] 订单编辑视图已重新加载`);
      }

      // 清除客户编辑页面的绑定标记（如果视图路径包含 customers/edit）
      if (viewPath.includes('customers/edit')) {
        const saveBtn = container.querySelector('#btnSaveCustomer');
        if (saveBtn) {
          saveBtn.removeAttribute('data-save-bound');
          console.log(`[ViewLoader] 已清除客户编辑页面保存按钮绑定标记`);
        }
      }

      // 直接触发事件，不再使用 requestAnimationFrame，提升响应速度
      // DOM已通过innerHTML更新，可以立即触发事件
      console.log(`[ViewLoader] 触发 viewLoaded 事件: ${viewPath}`);
      container.dispatchEvent(new CustomEvent('viewLoaded', {
        detail: { viewPath, containerId }
      }));
    } catch (error) {
      console.error(`[ViewLoader] 加载视图失败: ${viewPath}`, error);
      container.innerHTML = `<div class="error-view" style="padding: 40px; text-align: center; color: #dc3545;">
        <div style="font-size: 18px; margin-bottom: 10px;">❌ 加载失败</div>
        <div style="font-size: 14px; color: #6c757d;">${error.message}</div>
      </div>`;
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
    this._loadPromises.clear();
  }

  /**
   * 清除容器缓存
   */
  clearContainerCache() {
    this._containerCache = null;
  }

  /**
   * 从视图路径获取视图ID
   * @param {string} viewPath - 视图路径
   * @returns {string} 视图ID
   * @private
   */
  _getViewIdFromPath(viewPath) {
    // 视图路径到视图ID的映射
    const viewIdMap = {
      'home': 'view-home',
      'customers': 'view-customers',
      'partners/customers': 'view-customers',
      'partners/forwarders': 'view-forwarders',
      'customers/edit': 'view-customers-edit',
      'orders/list': 'view-orders-list',
      'orders/edit': 'view-orders-edit',
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
      'settings/diagnostics': 'view-settings',
      'document-center/generate': 'view-document-center-generate',
      'document-center/templates': 'view-document-center-templates',
      'document-center/template-editor': 'view-document-center-template-editor'
    };

    return viewIdMap[viewPath] || '';
  }

  /**
   * 预加载视图（优化版：智能预加载，不阻塞主流程）
   * @param {string[]} viewPaths - 要预加载的视图路径数组
   * @param {Object} options - 预加载选项
   * @param {boolean} options.priority - 是否高优先级（立即加载）
   * @param {number} options.delay - 延迟时间（毫秒）
   */
  async preloadViews(viewPaths, options = {}) {
    const { priority = false, delay = 0 } = options;

    // 过滤掉已缓存的视图
    const uncachedPaths = viewPaths.filter(path => !this.cache.has(path));
    if (uncachedPaths.length === 0) {
      return;
    }

    const preload = async () => {
      // 使用 requestIdleCallback 优化预加载时机（非高优先级）
      if (!priority && typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          uncachedPaths.forEach(path => {
            // 异步预加载，不阻塞
            this.loadView(path).catch(err => {
              console.debug(`[ViewLoader] 预加载视图失败: ${path}`, err);
            });
          });
        }, { timeout: 2000 });
      } else {
        // 高优先级或立即预加载
        const promises = uncachedPaths.map(path =>
          this.loadView(path).catch(err => {
            console.debug(`[ViewLoader] 预加载视图失败: ${path}`, err);
            return null;
          })
        );
        await Promise.allSettled(promises);
      }
    };

    if (delay > 0) {
      setTimeout(preload, delay);
    } else {
      await preload();
    }
  }

  /**
   * 智能预加载（根据用户行为预测）
   * @param {string} currentViewPath - 当前视图路径
   */
  smartPreload(currentViewPath) {
    // 预加载策略：根据当前页面预测用户可能访问的页面（键为 ViewLoader 的 viewPath，与路由 buildViewPath 一致）
    const partnersCustomers = ['customers/edit', 'orders/list', 'partners/forwarders'];
    const preloadMap = {
      'home': ['orders/list', 'partners/customers', 'document-center/generate'],
      'orders/list': ['orders/edit', 'orders/config', 'partners/customers'],
      'orders/edit': ['orders/list', 'partners/customers'],
      'partners/customers': partnersCustomers,
      'partners/forwarders': ['partners/customers', 'orders/list'],
      // 兼容旧视图路径（若仍有入口命中）
      'customers': partnersCustomers,
      'customers/edit': ['partners/customers', 'orders/list'],
      'products/list': ['products/add'],
      'products/add': ['products/list']
    };

    const pathsToPreload = preloadMap[currentViewPath] || [];
    if (pathsToPreload.length > 0) {
      const isHome = currentViewPath === 'home';
      if (isHome) {
        // 首页渲染后立即高优先级预加载高频视图
        this.preloadViews(pathsToPreload, { priority: true, delay: 0 });
      } else {
        setTimeout(() => {
          this.preloadViews(pathsToPreload, { priority: false, delay: 0 });
        }, 1000);
      }
    }
  }

  /**
   * 清除指定视图的缓存
   * @param {string} viewPath - 视图路径
   */
  clearViewCache(viewPath) {
    this.cache.delete(viewPath);
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计
   */
  getCacheStats() {
    return {
      cachedViews: Array.from(this.cache.keys()),
      cacheSize: this.cache.size,
      loadingViews: Array.from(this._loadPromises.keys())
    };
  }
}

