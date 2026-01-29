/**
 * 应用初始化类
 * 整合路由、状态管理、服务层和视图层
 * ES6 模块化版本
 * 
 * @module core/app
 * @example
 * ```javascript
 * import { createApp } from './core/app.js';
 * 
 * const app = createApp({
 *   apiService: window.ApiService
 * });
 * 
 * await app.init();
 * ```
 */

import { Router } from './router.js';
import { StateManager } from './state-manager.js';
import { OrderService } from '../services/order-service.js';
import { CustomerService } from '../services/customer-service.js';
import { OrdersListView } from '../views/orders/orders-list-view.js';
import { CustomersListView } from '../views/customers/customers-list-view.js';
import { escapeHtml, fmtMoney, fmtDateYMD, formatContact } from '../utils/format-utils.js';
import { eventManager } from '../utils/event-manager.js';
import { timerManager } from '../utils/timer-manager.js';
import { guard } from '../utils/route-guard.js';
import { initUserInfo } from '../utils/auth.js';

/**
 * 应用类
 * 负责初始化和管理整个 SPA 应用
 * 整合路由、状态管理、服务层和视图层
 * 
 * @class App
 * @example
 * ```javascript
 * const app = new App({
 *   router: new Router(),
 *   stateManager: new StateManager(),
 *   apiService: window.ApiService
 * });
 * 
 * await app.init();
 * ```
 */
export class App {
  /**
   * 创建应用实例
   * @param {Object} options - 配置选项
   * @param {Router} [options.router] - 路由管理器实例，默认创建新实例
   * @param {StateManager} [options.stateManager] - 状态管理器实例，默认创建新实例
   * @param {Object} [options.apiService] - API 服务实例，默认使用 window.ApiService
   */
  constructor(options = {}) {
    /**
     * 路由管理器
     * @type {Router|null}
     */
    this.router = options.router || null;

    /**
     * 状态管理器
     * @type {StateManager|null}
     */
    this.stateManager = options.stateManager || null;

    /**
     * API 服务
     * @type {Object|null}
     */
    this.apiService = options.apiService || (window.ApiService || null);

    /**
     * 服务层
     * @type {OrderService|null}
     */
    this.orderService = null;
    /**
     * @type {CustomerService|null}
     */
    this.customerService = null;

    /**
     * 视图层
     * @type {OrdersListView|null}
     */
    this.ordersListView = null;
    /**
     * @type {CustomersListView|null}
     */
    this.customersListView = null;

    /**
     * 初始化标志
     * @type {boolean}
     * @private
     */
    this._initialized = false;
  }

  /**
   * 初始化应用
   * 初始化状态管理器、服务层、视图层和路由管理器
   * 
   * @returns {Promise<void>}
   * @example
   * ```javascript
   * const app = new App();
   * await app.init();
   * ```
   */
  async init() {
    if (this._initialized) {
      console.log('[App] 应用已初始化，跳过');
      return;
    }

    console.log('[App] 开始初始化应用');

    // 0. 先检查登录状态，避免在认证检查期间显示主页面内容
    const container = document.getElementById('view-container');
    if (container) {
      container.innerHTML = '<div class="loading-view" style="padding: 40px; text-align: center; color: #6c757d;"><div class="loading-spinner" style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;"></div><div>正在验证登录状态...</div></div>';
    }

    // 检查登录状态（除了登录页面本身）
    const hash = location.hash.replace('#/', '') || 'home';
    const base = hash.split('/')[0] || 'home';
    if (base !== 'login') {
      const guardFn = guard;
      const isAuthenticated = await guardFn();
      if (!isAuthenticated) {
        console.warn('[App] 未登录，跳转到登录页');
        window.location.href = 'login.html';
        return;
      }
    }

    // 1. 初始化状态管理器
    if (!this.stateManager) {
      this.stateManager = new StateManager({
        orders: [],
        customers: []
      });
    }

    // 2. 初始化服务层
    this.orderService = new OrderService({
      stateManager: this.stateManager,
      apiService: this.apiService
    });

    this.customerService = new CustomerService({
      stateManager: this.stateManager,
      apiService: this.apiService
    });

    // 3. 初始化视图层
    this.ordersListView = new OrdersListView({
      orderService: this.orderService,
      customerService: this.customerService,
      stateManager: this.stateManager,
      fmtMoney,
      fmtDateYMD,
      escapeHtml,
      onOrderEdit: this._handleOrderEdit.bind(this),
      onOrderPreview: this._handleOrderPreview.bind(this),
      onOrderDocs: this._handleOrderDocs.bind(this),
      renderCustomerSelect: this._renderCustomerSelect.bind(this)
    });

    this.customersListView = new CustomersListView({
      customerService: this.customerService,
      stateManager: this.stateManager,
      fmtMoney,
      escapeHtml,
      onCustomerEdit: this._handleCustomerEdit.bind(this),
      onCustomerDelete: this._handleCustomerDelete.bind(this),
      renderCustomerSelect: this._renderCustomerSelect.bind(this)
    });

    // 4. 初始化路由管理器
    if (!this.router) {
      this.router = new Router({
        routes: ["home", "orders", "partners", "analytics", "products", "settings"]
      });
    }

    // 注册路由初始化回调
    this._registerRouteCallbacks();

    // 5. 绑定路由事件
    this._bindRouteEvents();

    // 6. 初始化导航
    this._initNavigation();

    this._initialized = true;
    console.log('[App] 应用初始化完成');

    // 7. 处理初始路由
    this._handleInitialRoute();

    // 8. 检查备份设置（桌面端专用）
    this._checkBackupSettings();
  }

  /**
   * 检查备份设置并提醒用户
   * @private
   */
  async _checkBackupSettings() {
    try {
      const { checkBackupSettingsAndRemind } = await import('../utils/backup-reminder.js');
      // 延迟检查，避免干扰主界面加载
      timerManager.setTimeout(() => {
        checkBackupSettingsAndRemind();
      }, 3000);
    } catch (e) {
      console.warn('[App] 加载备份提醒工具失败:', e);
    }
  }

  /**
   * 注册路由初始化回调
   */
  _registerRouteCallbacks() {
    // 首页路由（优化：延迟非关键操作）
    this.router.onRouteInit('home', async () => {
      console.log('[App] 初始化首页');
      // 检查是否在spa.js中定义了 renderHome 函数
      if (typeof window.renderHome === 'function') {
        try {
          // 立即执行关键渲染
          await window.renderHome();

          // 延迟执行非关键操作（不阻塞渲染）
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => {
              // 预加载常用页面
              if (this.router && this.router.viewLoader) {
                this.router.viewLoader.preloadViews(['orders/list', 'customers'], { priority: false });
              }
            }, { timeout: 2000 });
          }
        } catch (error) {
          console.error('[App] renderHome 调用失败:', error);
        }
      } else {
        console.warn('[App] renderHome 函数未找到，首页可能未正确加载');
      }
    });

    // 订单路由
    this.router.onRouteInit('orders', async () => {
      const currentRoute = this.router.getCurrentRoute();
      // 检查是否是订单编辑页面
      if (currentRoute.sub === 'edit') {
        console.log('[App] 初始化订单编辑页面');
        // 动态导入并初始化订单编辑页面
        try {
          const { initOrderNewPage } = await import('../pages/order/order-new-page.js');

          // 优化DOM检查：立即检查，如果失败则仅尝试一次短延时
          const checkAndInit = () => {
            const contractNoInput = document.getElementById('contractNo');
            if (contractNoInput) {
              console.log('[App] DOM 元素已加载，开始初始化订单编辑页面');
              initOrderNewPage();

              // 确保客户数据已加载
              if (this.customerService) {
                this.customerService.loadCustomers().catch(err => console.error(err));
              }
              this._renderCustomerSelect();

              // 绑定返回按钮
              const backLink = document.getElementById('backLink');
              if (backLink && !backLink.hasAttribute('data-bound')) {
                backLink.setAttribute('data-bound', 'true');
                eventManager.on(backLink, 'click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  location.hash = '#/orders/list';
                });
              }
            } else {
              console.warn('[App] 订单编辑页面 DOM 元素未找到，尝试直接初始化');
              initOrderNewPage();
            }
          };

          checkAndInit();
        } catch (error) {
          console.error('[App] 加载订单编辑页面失败:', error);
          window.NotificationSystem?.toast('加载订单编辑页面失败', 'error');
        }
      } else if (currentRoute.sub === 'list' || !currentRoute.sub) {
        // 订单列表页面（优化：分阶段初始化）
        console.log('[App] 初始化订单列表页面');

        // 第一阶段：立即初始化视图
        await this.ordersListView.init();

        // 第二阶段：延迟渲染（使用 requestIdleCallback）
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => {
            if (this.ordersListView._initialized) {
              this.ordersListView.render();
            }
          }, { timeout: 500 });
        } else {
          // 降级：使用 requestAnimationFrame
          requestAnimationFrame(() => {
            if (this.ordersListView._initialized) {
              this.ordersListView.render();
            }
          });
        }
      } else if (currentRoute.sub === 'deleted') {
        // 已删除订单列表页面
        console.log('[App] 初始化已删除订单列表页面');
        if (!this.deletedOrdersView) {
          const { DeletedOrdersView } = await import('../views/orders/deleted-orders-view.js');
          this.deletedOrdersView = new DeletedOrdersView({
            apiService: this.apiService,
            fmtMoney,
            fmtDateYMD,
            escapeHtml
          });
        }
        await this.deletedOrdersView.init();
      } else if (currentRoute.sub === 'config') {
        // 订单参数配置页面
        console.log('[App] 初始化订单参数配置页面');
        try {
          const { initOrderConfigPage } = await import('../pages/order/order-config-manager.js');
          await initOrderConfigPage();
        } catch (error) {
          console.error('[App] 加载订单参数配置页面失败:', error);
        }
      }
    });

    // 客户路由
    this.router.onRouteInit('customers', async () => {
      const currentRoute = this.router.getCurrentRoute();
      // 检查是否是客户编辑页面
      if (currentRoute.sub === 'edit') {
        console.log('[App] 初始化客户编辑页面');
        try {
          const { initCustomerNewPage } = await import('../pages/customer/customer-new-page.js');
          // 直接初始化，移除轮询
          initCustomerNewPage();

          const backLink = document.getElementById('backLink');
          if (backLink && !backLink.hasAttribute('data-bound')) {
            backLink.setAttribute('data-bound', 'true');
            eventManager.on(backLink, 'click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              location.hash = '#/customers';
            });
          }
        } catch (error) {
          console.error('[App] 加载客户编辑页面失败:', error);
        }
      } else {
        // 客户列表页面
        console.log('[App] 初始化客户列表页面');
        await this.customersListView.init();
      }
    });

    // 合作方管理路由
    this.router.onRouteInit('partners', async () => {
      const currentRoute = this.router.getCurrentRoute();
      console.log('[App] 初始化合作方管理页面，子路由:', currentRoute.sub);

      // 检查子路由
      if (currentRoute.sub === 'customers') {
        // 客户管理列表
        console.log('[App] 初始化客户列表页面');
        await this.customersListView.init();
      } else if (currentRoute.sub === 'forwarders') {
        // 货代管理列表
        console.log('[App] 初始化货代列表页面');
        try {
          // 动态导入货代列表页面模块
          const { initForwardersListPage } = await import('../pages/forwarder/forwarders-list-page.js');
          
          // 准备上下文对象 - 使用可变引用的 state 对象
          const state = this.stateManager?.getState() || {};
          if (!state.forwarders) {
            state.forwarders = [];
          }
          
          // 创建渲染函数，直接使用 state 引用（而非每次获取新的 state）
          const renderForwardersWithState = () => {
            const tbody = document.getElementById('forwardersTbody');
            if (!tbody) return;
            
            const forwarders = state.forwarders || [];
            if (forwarders.length === 0) {
              tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #6c757d;">暂无货代数据</td></tr>';
              return;
            }
            
            // 渲染货代数据
            tbody.innerHTML = forwarders.map((f, idx) => `
              <tr>
                <td>${this._escapeHtml(f.name || '')}</td>
                <td>${this._escapeHtml(f.contact || '')} ${f.tel ? '(' + this._escapeHtml(f.tel) + ')' : ''}</td>
                <td>${this._escapeHtml(f.address || '')}</td>
                <td>${this._escapeHtml(f.email || '')}</td>
                <td>
                  <button class="btn small primary" data-action="editForwarder" data-id="${f.id}" data-name="${this._escapeHtml(f.name || '')}">编辑</button>
                  <button class="btn small danger" data-action="delForwarder" data-id="${f.id}" data-name="${this._escapeHtml(f.name || '')}">删除</button>
                </td>
              </tr>
            `).join('');
            
            // 更新统计
            const totalEl = document.getElementById('totalForwardersCount');
            const activeEl = document.getElementById('activeForwardersCount');
            if (totalEl) totalEl.textContent = forwarders.length;
            if (activeEl) activeEl.textContent = forwarders.length;
          };
          
          const context = {
            state: state,
            ApiService: this.apiService,
            renderForwarders: renderForwardersWithState
          };
          
          // 初始化货代列表页面
          initForwardersListPage(context);
          
          // 绑定页面事件
          this._bindForwarderPageEvents();
        } catch (error) {
          console.error('[App] 加载货代列表页面失败:', error);
          window.NotificationSystem?.toast('加载货代列表页面失败', 'error');
        }
      } else {
        // 默认显示客户管理
        console.log('[App] 显示合作方管理首页（默认客户管理）');
        await this.customersListView.init();
      }
    });

    // 产品路由
    this.router.onRouteInit('products', async () => {
      const currentRoute = this.router.getCurrentRoute();
      console.log('[App] 初始化产品页面，子路由:', currentRoute.sub);

      if (currentRoute.sub === 'add') {
        try {
          const { initProductAddPage } = await import('../pages/product/product-new-page.js');
          initProductAddPage();
        } catch (error) {
          console.error('[App] 加载新增产品页面失败:', error);
        }
      } else {
        try {
          const { initProductsPage } = await import('../pages/product/product-list-page.js');
          initProductsPage();

          if (window.initProductsPageInternal) {
            window.initProductsPageInternal();
          } else {
            // 简单的延迟重试一次，而非无限轮询
            setTimeout(() => {
              if (window.initProductsPageInternal) window.initProductsPageInternal();
            }, 100);
          }
        } catch (error) {
          console.error('[App] 加载产品列表页面失败:', error);
        }
      }
    });

    // 单据中心路由
    this.router.onRouteInit('document-center', async () => {
      console.log('[App] 初始化单据中心页面');
      const currentRoute = this.router.getCurrentRoute();
      const subRoute = currentRoute.sub || 'generate';

      try {
        if (typeof window.renderDocumentCenter === 'function') {
          await window.renderDocumentCenter(subRoute);
        } else {
          console.warn('[App] renderDocumentCenter 函数未找到');
        }
      } catch (error) {
        console.error('[App] 加载单据中心页面失败:', error);
      }
    });

    // 统计路由
    this.router.onRouteInit('analytics', async () => {
      console.log('[App] 初始化统计页面');
      const currentRoute = this.router.getCurrentRoute();
      const subRoute = currentRoute.sub || 'summary';

      try {
        if (typeof window.renderAnalytics === 'function') {
          await window.renderAnalytics(subRoute);
        } else {
          console.warn('[App] renderAnalytics 函数未找到');
        }
      } catch (error) {
        console.error('[App] 初始化统计页面失败:', error);
      }
    });

    // 设置路由
    this.router.onRouteInit('settings', async () => {
      console.log('[App] 初始化设置页面');
      const currentRoute = this.router.getCurrentRoute();
      const tab = currentRoute.sub || 'company';

      try {
        if (typeof window.renderSettings === 'function') {
          await window.renderSettings(tab);

          // 如果是特定标签页，初始化对应功能
          if (tab === 'database' || tab === 'users') {
            if (typeof window.initDatabaseSettingsButtons === 'function') window.initDatabaseSettingsButtons();
            if (tab === 'users' && typeof window.initUsersManagement === 'function') window.initUsersManagement();
          }
        } else {
          console.warn('[App] renderSettings 函数未找到，尝试直接初始化设置页面');
          this._initSettingsPageDirectly(tab);
        }
      } catch (error) {
        console.error('[App] 初始化设置页面失败:', error);
      }
    });
  }

  /**
   * 直接初始化设置页面（降级方案）
   * @private
   */
  _initSettingsPageDirectly(tab) {
    try {
      // 切换设置子页面显示
      const subnav = document.getElementById('settingsSubnav');
      const map = {
        company: document.getElementById('settingsCompanyPage'),
        database: document.getElementById('settingsDbPage'),
        export: document.getElementById('settingsExportPage'),
        products: document.getElementById('settingsProductsPage'),
        users: document.getElementById('settingsUsersPage'),
        logs: document.getElementById('settingsLogsPage'),
        diagnostics: document.getElementById('settingsDiagnosticsPage')
      };
      const current = ['company', 'database', 'export', 'products', 'users', 'logs', 'diagnostics'].includes(tab) ? tab : 'company';
      Object.entries(map).forEach(([k, el]) => {
        if (el) el.style.display = (k === current) ? 'block' : 'none';
      });
      if (subnav) {
        subnav.querySelectorAll('a[data-tab]').forEach(a => {
          a.classList.toggle('active', a.getAttribute('data-tab') === current);
        });
      }

      // 初始化用户管理（使用微任务队列，不阻塞渲染）
      if (current === 'users') {
        Promise.resolve().then(async () => {
          try {
            const { init } = await import('../pages/user/user-management-page.js');
            if (typeof init === 'function') {
              init();
            }
          } catch (error) {
            console.error('[App] 加载用户管理模块失败:', error);
          }
        });
      }
    } catch (error) {
      console.error('[App] 直接初始化设置页面失败:', error);
    }
  }

  /**
   * 绑定路由事件
   */
  _bindRouteEvents() {
    // 设置路由守卫和用户信息初始化
    this.router.setGuard(guard);
    this.router.setUserInfoInit(initUserInfo);

    // 监听 hashchange 事件（使用新架构的路由处理）
    // 注意：如果 spa.js 中也有 hashchange 监听，可能会有冲突
    // 这里使用一个标记来避免重复处理
    if (!window.__routerInitialized) {
      window.__routerInitialized = true;
      // 使用防抖优化 hashchange 事件处理（避免快速切换路由时重复调用）
      let hashChangeTimer = null;
      eventManager.on(window, 'hashchange', () => {
        // 清除之前的定时器
        if (hashChangeTimer) {
          timerManager.clearTimeout(hashChangeTimer);
        }
        // 延迟处理，避免快速切换路由时重复调用
        hashChangeTimer = timerManager.setTimeout(() => {
          const hash = location.hash.replace('#/', '') || 'home';
          this.router.setActiveRoute(hash);
          hashChangeTimer = null;
        }, 10); // 10ms 防抖延迟
      });

      // 不在这里处理初始路由，由 _handleInitialRoute() 统一处理
      // 避免重复调用 setActiveRoute
    }
  }

  /**
   * 初始化导航
   */
  _initNavigation() {
    // 等待导航菜单元素加载完成后再绑定事件
    this._waitForNavigationAndBind();
  }

  /**
   * 等待导航菜单加载完成并绑定事件
   * @private
   */
  _waitForNavigationAndBind() {
    const checkNavigation = () => {
      const orderEditLink = document.querySelector('a[data-tab="edit"]');
      const ordersSubnav = document.getElementById('ordersSubnav');

      // 如果导航菜单元素已加载，立即绑定事件
      if (orderEditLink || ordersSubnav) {
        this._bindNavigationEvents();
        return true;
      }
      return false;
    };

    // 立即检查一次
    if (checkNavigation()) {
      return;
    }

    // 如果未找到，使用重试机制（最多重试10次，每次50ms）
    let retries = 0;
    const maxRetries = 10;
    const retryCheck = () => {
      if (checkNavigation()) {
        return;
      }
      if (retries < maxRetries) {
        retries++;
        timerManager.setTimeout(retryCheck, 50);
      } else {
        console.warn('[App] 导航菜单元素未找到，可能导航菜单尚未加载');
        // 即使未找到，也尝试绑定其他导航事件（如设置菜单）
        this._bindNavigationEvents();
      }
    };
    timerManager.setTimeout(retryCheck, 50);
  }

  /**
   * 绑定导航事件
   * @private
   */
  _bindNavigationEvents() {
    // 绑定导航点击事件（排除有子菜单的项，它们由 spa.js 处理）
    document.querySelectorAll("nav a[data-route]").forEach((link) => {
      // 跳过有子菜单的项（orders, document-center, analytics, products, settings）
      // 这些项由 spa.js 的 setupNavMenuHandlers 处理
      const route = link.getAttribute('data-route');
      const hasSubmenu = ['orders', 'document-center', 'analytics', 'partners', 'products', 'settings'].includes(route);

      if (!hasSubmenu) {
        eventManager.on(link, 'click', (e) => {
          e.preventDefault();
          if (route) {
            location.hash = `#/${route}`;
          }
        });
      }
    });

    // 处理设置菜单展开/收起
    const navSettings = document.getElementById('navSettings');
    if (navSettings) {
      eventManager.on(navSettings, 'click', (e) => {
        e.preventDefault();
        const raw = (location.hash.replace('#/', '') || '').trim();
        const base = raw.split('/')[0] || '';
        const seg = raw.split('/')[1] || '';
        const settingsSubnav = document.getElementById('settingsSubnav');

        if (base === 'settings') {
          const isOpen = settingsSubnav?.classList.contains('open');
          settingsSubnav?.classList.toggle('open', !isOpen);
          navSettings.classList.toggle('expanded', !isOpen);
          if (!isOpen && !seg) {
            location.hash = '#/settings/company';
          }
        } else {
          location.hash = '#/settings/company';
        }
      });
    }

    // 拦截订单编辑菜单项点击
    // 直接在链接上绑定事件，确保能正确捕获点击
    const orderEditLink = document.querySelector('a[data-tab="edit"]');
    if (orderEditLink) {
      console.log('[App] 找到订单编辑菜单项，绑定点击事件');
      // 移除可能存在的旧事件监听器，避免重复绑定
      eventManager.off(orderEditLink, 'click');
      eventManager.on(orderEditLink, 'click', async (e) => {
        console.log('[App] 订单编辑菜单项被点击，阻止默认行为');
        e.preventDefault();
        e.stopPropagation();

        // 显示合同号选择弹窗
        console.log('[App] 准备显示合同号选择对话框');
        const orderId = await this._showContractNoSelectDialog();
        console.log('[App] 合同号选择对话框返回:', orderId);

        if (orderId === 'CANCELLED') {
          console.log('[App] 用户取消了选择，跳转到订单列表');
          location.hash = '#/orders/list';
        } else if (orderId) {
          // 直接跳转，移除延迟，提升响应速度
          console.log('[App] 选择了订单，跳转到编辑页面:', orderId);
          location.hash = `#/orders/edit?id=${encodeURIComponent(orderId)}`;
        } else {
          // 直接跳转，移除延迟，提升响应速度
          console.log('[App] 未选择订单，跳转到新建订单页面');
          location.hash = '#/orders/edit';
        }
      });
    } else {
      // 如果直接链接未找到，使用事件委托
      const ordersSubnav = document.getElementById('ordersSubnav');
      if (ordersSubnav) {
        console.log('[App] 使用事件委托绑定订单编辑菜单项点击事件');
        // 移除可能存在的旧事件监听器，避免重复绑定
        eventManager.off(ordersSubnav, 'click');
        eventManager.on(ordersSubnav, 'click', async (e) => {
          const link = e.target.closest('a[data-tab="edit"]');
          if (link) {
            console.log('[App] 订单编辑菜单项被点击（事件委托），阻止默认行为');
            e.preventDefault();
            e.stopPropagation();

            // 显示合同号选择弹窗
            console.log('[App] 准备显示合同号选择对话框');
            const orderId = await this._showContractNoSelectDialog();
            console.log('[App] 合同号选择对话框返回:', orderId);

            if (orderId === 'CANCELLED') {
              console.log('[App] 用户取消了选择，跳转到订单列表');
              location.hash = '#/orders/list';
            } else if (orderId) {
              // 直接跳转，移除延迟，提升响应速度
              console.log('[App] 选择了订单，跳转到编辑页面:', orderId);
              location.hash = `#/orders/edit?id=${encodeURIComponent(orderId)}`;
            } else {
              // 直接跳转，移除延迟，提升响应速度
              console.log('[App] 未选择订单，跳转到新建订单页面');
              location.hash = '#/orders/edit';
            }
          }
        });
      } else {
        // 如果元素未找到，静默处理（不输出警告，因为可能导航菜单尚未加载）
        // 事件绑定会在导航菜单加载完成后通过 _waitForNavigationAndBind 重试
      }
    }
  }

  /**
   * 处理初始路由
   */
  _handleInitialRoute() {
    // 使用标记防止重复处理初始路由
    if (this._initialRouteHandled) return;
    this._initialRouteHandled = true;

    const hash = location.hash.replace('#/', '') || 'home';
    // 直接调用 setActiveRoute，避免触发 hashchange 事件
    // 使用微任务确保导航菜单已加载
    Promise.resolve().then(() => {
      this.router.setActiveRoute(hash);
    });
  }

  /**
   * 处理订单编辑
   */
  _handleOrderEdit(orderId) {
    if (!orderId) {
      window.NotificationSystem?.toast('订单ID不能为空', 'error');
      return;
    }
    // 直接跳转，不使用延迟，提升响应速度
    location.hash = `#/orders/edit?id=${encodeURIComponent(orderId)}`;
  }

  /**
   * 处理订单预览
   */
  _handleOrderPreview(orderId) {
    if (!orderId) {
      window.NotificationSystem?.toast('订单ID不能为空', 'error');
      return;
    }
    // 预览订单：跳转到订单编辑页面（只读模式或预览模式）
    // 可以通过添加 preview=1 参数来标识预览模式
    // 直接跳转，不使用延迟，提升响应速度
    location.hash = `#/orders/edit?id=${encodeURIComponent(orderId)}&preview=1`;
  }

  /**
   * 处理订单文档
   */
  _handleOrderDocs(orderId) {
    if (!orderId) {
      window.NotificationSystem?.toast('订单ID不能为空', 'error');
      return;
    }
    // 生成单据：跳转到单据中心
    // 直接跳转，不使用延迟，提升响应速度
    if (typeof window.goto === 'function') {
      window.goto(`/docs.html?id=${encodeURIComponent(orderId)}&hide=1`);
    } else {
      // 降级方案：直接跳转
      window.location.href = `/docs.html?id=${encodeURIComponent(orderId)}&hide=1`;
    }
  }

  /**
   * 处理客户编辑
   */
  _handleCustomerEdit(customerId) {
    location.hash = `#/partners/customers/edit?id=${customerId}`;
  }

  /**
   * 处理客户删除
   * @param {string|number} customerId - 客户ID
   * @param {string} customerName - 客户名称（可选，用于确认对话框）
   */
  async _handleCustomerDelete(customerId, customerName) {
    try {
      // 显示确认对话框（使用静态方法）
      const { ModalDialog } = await import('../components/modal-dialog.js');

      const confirmed = await ModalDialog.confirm(
        `确定要删除客户"${customerName || customerId}"吗？\n此操作不可撤销。`,
        {
          title: '确认删除客户',
          confirmText: '删除',
          cancelText: '取消',
          confirmButtonClass: 'danger',
          icon: '⚠️',
          preventDuplicate: true
        }
      );

      if (!confirmed) {
        console.log('[App] 用户取消了删除操作');
        return;
      }

      // 执行删除
      console.log('[App] 开始删除客户:', customerId);

      try {
        const result = await this.apiService.customers.remove(customerId);

        if (result && result.success) {
          // 显示成功提示
          window.NotificationSystem?.toast(
            `客户"${customerName || customerId}"已删除`,
            'success',
            2000
          );

          // 刷新客户列表
          await this.refreshCustomers();

          // 更新客户下拉框（订单编辑页面等）
          this._renderCustomerSelect();

          console.log('[App] 客户删除成功:', result);
        } else {
          throw new Error(result?.message || '删除失败');
        }
      } catch (error) {
        console.error('[App] 删除客户失败:', error);

        // 显示错误提示
        const errorMessage = error?.message || '未知错误';
        window.NotificationSystem?.toast(
          `删除客户失败: ${errorMessage}`,
          'error',
          3000
        );
      }
    } catch (error) {
      console.error('[App] 删除客户操作失败:', error);
      window.NotificationSystem?.toast(
        '删除客户操作失败: ' + (error?.message || '未知错误'),
        'error',
        3000
      );
    }
  }

  /**
   * 渲染客户选择下拉框
   */
  _renderCustomerSelect() {
    const customers = this.stateManager.getState('customers') || [];

    // 更新订单编辑页面的客户下拉
    const sel = document.getElementById("ordCustomerSelect");
    if (sel) {
      const options = [
        '<option value="">选择客户</option>',
        ...customers.map((c) =>
          `<option value="${escapeHtml(String(c.id || c.name))}">${escapeHtml(c.name)}${c.grade ? ` (${escapeHtml(c.grade)})` : ""}</option>`
        ),
      ];
      const current = sel.value;
      sel.innerHTML = options.join("");
      if (current && [...sel.options].some((o) => o.value === current)) {
        sel.value = current;
      }
    }

    // 更新订单列表筛选的客户下拉
    const fltCustomer = document.getElementById("fltCustomer");
    if (fltCustomer) {
      const options = [
        '<option value="">全部客户</option>',
        ...customers.map((c) =>
          `<option value="${escapeHtml(String(c.id || c.name))}">${escapeHtml(c.name)}</option>`
        ),
      ];
      const current = fltCustomer.value;
      fltCustomer.innerHTML = options.join("");
      if (current && [...fltCustomer.options].some((o) => o.value === current)) {
        fltCustomer.value = current;
      }
    }
  }

  /**
   * 显示合同号选择对话框
   * 此函数需要从外部注入，因为实现较复杂
   */
  async _showContractNoSelectDialog() {
    console.log('[App] _showContractNoSelectDialog 被调用');
    // 获取订单列表
    const orders = this.stateManager?.getState('orders') || [];
    console.log('[App] 当前订单列表数量:', orders.length);

    // 如果外部提供了此函数，使用外部函数
    if (this._contractNoDialogHandler) {
      console.log('[App] 使用外部提供的合同号选择对话框处理器');
      try {
        const result = await this._contractNoDialogHandler(orders);
        console.log('[App] 外部处理器返回:', result);
        return result;
      } catch (error) {
        console.error('[App] 外部处理器执行失败:', error);
        return null;
      }
    }

    // 如果外部函数未设置，尝试直接导入并使用
    console.log('[App] 外部处理器未设置，尝试直接导入合同号选择对话框');
    try {
      const { showContractNoSelectDialog } = await import('../components/dialogs/contract-select-dialog.js');
      console.log('[App] 合同号选择对话框模块加载成功');
      const result = await showContractNoSelectDialog(orders, this.apiService);
      console.log('[App] 合同号选择对话框返回:', result);
      return result;
    } catch (error) {
      console.error('[App] 加载合同号选择对话框失败:', error);
    }

    // 否则返回新建订单
    console.warn('[App] 合同号选择对话框处理器未设置，将创建新订单');
    return null;
  }

  /**
   * 设置合同号选择对话框处理器
   */
  setContractNoDialogHandler(handler) {
    this._contractNoDialogHandler = handler;
  }

  /**
   * 设置特殊视图渲染函数
   */
  setViewRenderers(renderers) {
    this._viewRenderers = renderers || {};
  }

  /**
   * 获取特殊视图渲染函数
   */
  getViewRenderer(viewName) {
    return this._viewRenderers[viewName] || null;
  }

  /**
   * 刷新订单列表
   */
  async refreshOrders() {
    if (this.orderService) {
      await this.orderService.loadOrders();
      if (this.ordersListView) {
        this.ordersListView.render();
      }
    }
  }

  /**
   * 刷新客户列表
   */
  async refreshCustomers() {
    if (this.customerService) {
      await this.customerService.loadCustomers();
      if (this.customersListView) {
        this.customersListView.render();
      }
    }
  }

  /**
   * HTML 转义辅助函数
   * @param {string} str - 需要转义的字符串
   * @returns {string} 转义后的字符串
   * @private
   */
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 绑定货代页面事件
   * @private
   */
  _bindForwarderPageEvents() {
    // 绑定新建货代按钮
    const btnNewForwarder = document.getElementById('btnNewForwarder');
    if (btnNewForwarder && !btnNewForwarder.hasAttribute('data-bound')) {
      btnNewForwarder.setAttribute('data-bound', 'true');
      btnNewForwarder.addEventListener('click', async () => {
        try {
          // 动态导入货代编辑对话框函数
          const { showForwarderEditDialog } = await import('../components/dialogs/forwarder-edit-dialog.js');
          const result = await showForwarderEditDialog(null);
          if (result && result.success) {
            // 保存成功后刷新列表
            location.reload();
          }
        } catch (error) {
          console.error('[App] 打开货代编辑对话框失败:', error);
          window.NotificationSystem?.toast('打开货代编辑对话框失败', 'error');
        }
      });
    }

    // 绑定货代表格事件委托
    const forwardersTbody = document.getElementById('forwardersTbody');
    if (forwardersTbody && !forwardersTbody.hasAttribute('data-events-bound')) {
      forwardersTbody.setAttribute('data-events-bound', 'true');
      forwardersTbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const name = btn.dataset.name || '';

        if (action === 'editForwarder') {
          try {
            // 先获取货代详情
            const forwarder = await window.ApiService?.forwarders?.get(id);
            // 动态导入货代编辑对话框函数
            const { showForwarderEditDialog } = await import('../components/dialogs/forwarder-edit-dialog.js');
            const result = await showForwarderEditDialog(forwarder);
            if (result && result.success) {
              location.reload();
            }
          } catch (error) {
            console.error('[App] 编辑货代失败:', error);
            window.NotificationSystem?.toast('编辑货代失败', 'error');
          }
        } else if (action === 'delForwarder') {
          const confirmed = await window.ModalDialog?.confirm(
            `确定要删除货代"${name}"吗？此操作不可恢复！`,
            { title: '确认删除', icon: '⚠️', confirmText: '确认删除', cancelText: '取消' }
          );
          if (confirmed) {
            try {
              await window.ApiService?.forwarders?.remove(id);
              window.NotificationSystem?.toast('货代删除成功', 'success');
              location.reload();
            } catch (error) {
              console.error('[App] 删除货代失败:', error);
              window.NotificationSystem?.toast('删除货代失败', 'error');
            }
          }
        }
      });
    }
  }
}

/**
 * 创建应用实例
 * @param {Object} options - 选项
 * @returns {App} 应用实例
 */
export function createApp(options = {}) {
  return new App(options);
}

