/**
 * 全局布局组件 - 统一的顶部导航栏和左侧功能模块
 * ES6 模块化版本
 */

import { NAVIGATION_CONFIG } from '../config/navigation.js';
import { initUserInfo, initEventListeners } from '../utils/auth.js';
import { updateNavigation } from '../utils/navigation-utils.js';

const config = NAVIGATION_CONFIG;

/**
 * HTML转义函数，防止XSS攻击
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 生成顶部导航栏 HTML
 * @param {Object} options - 配置选项
 * @param {string} options.pageTitle - 页面标题（可选，默认使用应用名称）
 * @param {Array} options.customActions - 自定义操作按钮（可选）
 * @returns {string} HTML字符串
 */
export function generateTopbar(options = {}) {
  const pageTitle = options.pageTitle || config.appName;
  const customActions = options.customActions || '';

  // 格式化标题：如果是应用名称，则拆分为更优雅的格式
  let formattedTitle = escapeHtml(pageTitle);
  if (pageTitle === config.appName || pageTitle === 'PP外贸订单管理系统') {
    formattedTitle = '<span class="brand-name">PP外贸</span><span class="brand-separator">·</span><span class="brand-subtitle">订单管理系统</span>';
  }

  return `
    <div class="topbar">
      <div class="brand">
        <button class="hamburger-menu" id="hamburgerMenu" aria-label="菜单">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="brand-logo">PP</div>
        <span class="title">${formattedTitle}</span>
      </div>
      <div class="actions">
        <!-- 用户信息显示 -->
        <div class="user-info" id="userInfo" style="display: none;">
          <div class="user-avatar-wrapper" id="userAvatarWrapper">
            <img src="" alt="用户头像" class="user-avatar" id="userAvatar" style="display: none;">
            <div class="user-avatar-default" id="userAvatarDefault">
              <span id="userAvatarText">U</span>
            </div>
            <div class="user-dropdown" id="userDropdown">
              <div class="dropdown-header">
                <div class="dropdown-avatar">
                  <img src="" alt="" class="dropdown-avatar-img" id="dropdownAvatar" style="display: none;">
                  <div class="dropdown-avatar-default" id="dropdownAvatarDefault">
                    <span id="dropdownAvatarText">U</span>
                  </div>
                </div>
                <div class="dropdown-user-info">
                  <div class="dropdown-username" id="dropdownUsername">用户</div>
                  <div class="dropdown-role" id="dropdownRole">普通用户</div>
                </div>
              </div>
              <div class="dropdown-divider"></div>
              <a href="#" class="dropdown-item" id="btnPersonalSettings">
                <span class="dropdown-icon">👤</span>
                <span>个人设置</span>
              </a>
              <a href="#" class="dropdown-item" id="btnChangePassword">
                <span class="dropdown-icon">🔑</span>
                <span>修改密码</span>
              </a>
              <div class="dropdown-divider"></div>
              <a href="#" class="dropdown-item logout" id="btnLogout">
                <span class="dropdown-icon">🚪</span>
                <span>退出登录</span>
              </a>
            </div>
          </div>
          <span class="user-name" id="userName">用户</span>
        </div>
        ${customActions}
      </div>
    </div>
  `;
}

// DOM元素缓存（优化性能）
const sidebarCache = {
  sidebar: null,
  nav: null,
  lastUpdate: 0
};

/**
 * 生成左侧功能模块 HTML（优化版：使用DocumentFragment）
 * @param {Object} options - 配置选项
 * @param {string} options.currentRoute - 当前路由（用于高亮）
 * @param {string} options.currentTab - 当前子菜单项（用于高亮）
 * @param {boolean} options.isSPA - 是否为SPA模式（影响链接格式）
 * @returns {string} HTML字符串
 */
export function generateSidebar(options = {}) {
  const currentRoute = options.currentRoute || '';
  const currentTab = options.currentTab || '';
  const isSPA = options.isSPA !== false; // 默认为true

  const linkPrefix = isSPA ? '' : 'index.html';

  // 使用数组拼接替代字符串拼接（性能更好）
  const htmlParts = [
    '<aside class="sidebar">',
    '<div class="group-title">功能模块</div>',
    '<nav class="nav" id="nav">'
  ];

  // 生成主导航菜单
  config.mainMenu.forEach(item => {
    const isActive = currentRoute === item.route;
    const activeClass = isActive ? 'active' : '';
    // 有子菜单的项，默认跳转到第一个子菜单项，或主路由
    const href = `${linkPrefix}#/${item.route}`;

    // 构建ID属性（优化：减少条件判断）
    const idMap = {
      'orders': 'navOrders',
      'document-center': 'navDocumentCenter',
      'analytics': 'navAnalytics',
      'partners': 'navPartners',
      'products': 'navProducts',
      'settings': 'navSettings'
    };
    const navId = item.hasSubmenu ? (idMap[item.route] ? `id="${idMap[item.route]}"` : '') : '';

    htmlParts.push(
      `<a href="${escapeHtml(href)}" data-route="${escapeHtml(item.route)}" class="${activeClass}" ${navId}>`,
      `${item.icon ? escapeHtml(item.icon) + ' ' : ''}${escapeHtml(item.label)}${item.hasSubmenu ? '<span class="caret" aria-hidden="true"></span>' : ''}`,
      '</a>'
    );

    // 如果是订单管理且有子菜单
    if (item.hasSubmenu && item.route === 'orders') {
      const shouldOpen = currentRoute === 'orders';
      htmlParts.push(`<div class="nav-submenu ${shouldOpen ? 'open' : ''}" id="ordersSubnav">`);

      config.ordersSubmenu.forEach(subItem => {
        const isSubActive = shouldOpen && currentTab === subItem.tab;
        const subActiveClass = isSubActive ? 'active' : '';
        htmlParts.push(
          `<a href="${escapeHtml(linkPrefix)}#/orders/${escapeHtml(subItem.tab)}" data-tab="${escapeHtml(subItem.tab)}" class="${subActiveClass}">`,
          `${subItem.icon ? escapeHtml(subItem.icon) + ' ' : ''}${escapeHtml(subItem.label)}`,
          '</a>'
        );
      });

      htmlParts.push('</div>');
    }

    // 处理所有子菜单（统一处理，减少重复代码）
    const submenuConfigs = [
      { route: 'document-center', subnavId: 'documentCenterSubnav', items: config.documentCenterSubmenu },
      { route: 'analytics', subnavId: 'analyticsSubnav', items: config.analyticsSubmenu },
      { route: 'partners', subnavId: 'partnersSubnav', items: config.partnersSubmenu },
      { route: 'products', subnavId: 'productsSubnav', items: config.productsSubmenu },
      { route: 'settings', subnavId: 'settingsSubnav', items: config.settingsSubmenu }
    ];

    submenuConfigs.forEach(submenuConfig => {
      if (item.hasSubmenu && item.route === submenuConfig.route) {
        const shouldOpen = currentRoute === submenuConfig.route;
        htmlParts.push(`<div class="nav-submenu ${shouldOpen ? 'open' : ''}" id="${submenuConfig.subnavId}">`);

        submenuConfig.items.forEach(subItem => {
          const isSubActive = shouldOpen && currentTab === subItem.tab;
          const subActiveClass = isSubActive ? 'active' : '';
          htmlParts.push(
            `<a href="${escapeHtml(linkPrefix)}#/${escapeHtml(submenuConfig.route)}/${escapeHtml(subItem.tab)}" data-tab="${escapeHtml(subItem.tab)}" class="${subActiveClass}">`,
            `${subItem.icon ? escapeHtml(subItem.icon) + ' ' : ''}${escapeHtml(subItem.label)}`,
            '</a>'
          );
        });

        htmlParts.push('</div>');
      }
    });
  });

  htmlParts.push('</nav>', '</aside>');

  // 使用数组join替代字符串拼接（性能更好）
  return htmlParts.join('');
}

/**
 * 更新侧边栏的路由高亮状态（优化版：使用缓存和批量操作）
 * @param {string} currentRoute - 当前路由
 * @param {string} currentTab - 当前子菜单项
 */
export function updateSidebarRoute(currentRoute, currentTab) {
  // 使用 requestAnimationFrame 优化更新时机
  requestAnimationFrame(() => {
    _updateSidebarRouteSync(currentRoute, currentTab);
  });
}

/**
 * 同步更新侧边栏（内部方法）
 */
function _updateSidebarRouteSync(currentRoute, currentTab) {
  // 使用缓存获取nav元素
  const now = Date.now();
  if (!sidebarCache.nav || (now - sidebarCache.lastUpdate) > 5000) {
    sidebarCache.nav = document.getElementById('nav');
    sidebarCache.lastUpdate = now;
  }

  const nav = sidebarCache.nav;
  if (!nav) return;

  // 更新主导航菜单的高亮状态（优化：批量操作）
  const navLinks = nav.querySelectorAll('a[data-route]');
  navLinks.forEach(link => {
    const route = link.getAttribute('data-route');
    const isActive = route === currentRoute;
    const hasActive = link.classList.contains('active');

    // 只更新需要改变的元素
    if (isActive !== hasActive) {
      link.classList.toggle('active', isActive);
    }
  });

  // 批量更新所有子菜单（优化：减少重复代码和DOM查询）
  const submenuUpdates = [
    { route: 'orders', subnavId: 'ordersSubnav', navId: 'navOrders', requireSub: false },
    { route: 'products', subnavId: 'productsSubnav', navId: 'navProducts', requireSub: false },
    { route: 'partners', subnavId: 'partnersSubnav', navId: 'navPartners', requireSub: false },
    { route: 'document-center', subnavId: 'documentCenterSubnav', navId: 'navDocumentCenter', requireSub: true },
    { route: 'analytics', subnavId: 'analyticsSubnav', navId: 'navAnalytics', requireSub: false },
    { route: 'settings', subnavId: 'settingsSubnav', navId: 'navSettings', requireSub: false }
  ];

  submenuUpdates.forEach(update => {
    const subnav = document.getElementById(update.subnavId);
    const navItem = document.getElementById(update.navId);

    if (!subnav || !navItem) return;

    // 判断是否应该展开（单据中心需要子路由）
    const shouldOpen = update.requireSub
      ? (currentRoute === update.route && currentTab !== '')
      : (currentRoute === update.route);

    const isOpen = subnav.classList.contains('open');
    const isExpanded = navItem.classList.contains('expanded');
    const hasActive = navItem.classList.contains('active');

    // 只更新需要改变的状态（优化：减少DOM操作）
    if (shouldOpen !== isOpen) {
      subnav.classList.toggle('open', shouldOpen);
    }
    if (shouldOpen !== isExpanded) {
      navItem.classList.toggle('expanded', shouldOpen);
    }

    if (shouldOpen) {
      // 展开时，确保主菜单项有active类
      if (!hasActive) {
        navItem.classList.add('active');
      }

      // 更新子菜单项高亮（优化：只更新需要改变的元素）
      const subLinks = subnav.querySelectorAll('a[data-tab]');
      subLinks.forEach(link => {
        const tab = link.getAttribute('data-tab');
        const isActive = tab === currentTab;
        const linkHasActive = link.classList.contains('active');

        if (isActive !== linkHasActive) {
          link.classList.toggle('active', isActive);
        }
      });
    } else {
      // 收起时，移除active类（特殊情况：document-center保持主菜单高亮）
      if (update.route === 'document-center' && currentRoute === 'document-center') {
        // 保持主菜单项高亮
        if (!hasActive) {
          navItem.classList.add('active');
        }
      } else {
        // 移除active类
        if (hasActive) {
          navItem.classList.remove('active');
        }
      }
    }
  });
}

/**
 * 更新顶部导航栏标题（不重新创建整个导航栏）
 * @param {string} pageTitle - 页面标题
 */
function updateTopbarTitle(pageTitle) {
  const titleElement = document.querySelector('.topbar .brand .title');
  if (titleElement && pageTitle) {
    // 如果是应用名称，则格式化为优雅的格式
    if (pageTitle === config.appName || pageTitle === 'PP外贸订单管理系统') {
      titleElement.innerHTML = '<span class="brand-name">PP外贸</span><span class="brand-separator">·</span><span class="brand-subtitle">订单管理系统</span>';
    } else {
      titleElement.textContent = pageTitle;
    }
  }
}

// 事件监听器缓存（防止重复绑定）
const eventListenersCache = new WeakMap();

/**
 * 初始化订单管理子菜单交互（优化版：使用事件委托和防重复绑定）
 */
function initOrdersSubmenu() {
  const navOrders = document.getElementById('navOrders');
  const ordersSubnav = document.getElementById('ordersSubnav');

  if (navOrders && ordersSubnav) {
    // 检查是否已绑定事件（防止重复绑定）
    if (eventListenersCache.has(navOrders)) {
      return;
    }

    // 标记已绑定
    eventListenersCache.set(navOrders, true);

    navOrders.addEventListener('click', function (e) {
      e.preventDefault();
      const raw = (location.hash.replace('#/', '') || '').trim();
      const base = raw.split('/')[0] || '';
      const seg = raw.split('/')[1] || '';
      const isOpen = ordersSubnav.classList.contains('open');

      if (base === 'orders') {
        // 已在订单管理视图：点击一次收起，再次点击展开
        ordersSubnav.classList.toggle('open', !isOpen);
        navOrders.classList.toggle('expanded', !isOpen);
        // 当展开时如果没有子路由，默认跳转到 list
        if (!isOpen && !seg) {
          const isSPA = !location.href.includes('index.html');
          const prefix = isSPA ? '' : 'index.html';
          window.location.href = `${prefix}#/orders/list`;
        } else if (!isOpen && seg) {
          // 如果展开时已有子路由，确保对应的子菜单项被选中
          updateNavigation('orders', seg);
        }
      } else {
        // 非订单管理视图：跳到 orders 并展开子菜单，同时选中订单列表
        const isSPA = !location.href.includes('index.html');
        const prefix = isSPA ? '' : 'index.html';
        window.location.href = `${prefix}#/orders/list`;
        // 立即更新导航状态，确保订单列表被选中
        setTimeout(() => {
          updateNavigation('orders', 'list');
        }, 50);
      }
    });
  }
}

/**
 * 初始化产品库管理子菜单交互（优化版：防重复绑定）
 */
function initProductsSubmenu() {
  const navProducts = document.getElementById('navProducts');
  const productsSubnav = document.getElementById('productsSubnav');

  if (navProducts && productsSubnav) {
    // 检查是否已绑定事件（防止重复绑定）
    if (eventListenersCache.has(navProducts)) {
      return;
    }

    // 标记已绑定
    eventListenersCache.set(navProducts, true);

    navProducts.addEventListener('click', function (e) {
      e.preventDefault();
      const raw = (location.hash.replace('#/', '') || '').trim();
      const base = raw.split('/')[0] || '';
      const seg = raw.split('/')[1] || '';
      const isOpen = productsSubnav.classList.contains('open');

      if (base === 'products') {
        // 已在产品库管理视图：点击一次收起，再次点击展开
        productsSubnav.classList.toggle('open', !isOpen);
        navProducts.classList.toggle('expanded', !isOpen);
        // 当展开时如果没有子路由，默认跳转到 list
        if (!isOpen && !seg) {
          const isSPA = !location.href.includes('index.html');
          const prefix = isSPA ? '' : 'index.html';
          window.location.href = `${prefix}#/products/list`;
        } else if (!isOpen && seg) {
          // 如果展开时已有子路由，确保对应的子菜单项被选中
          updateNavigation('products', seg);
        }
      } else {
        // 非产品库管理视图：跳到 products 并展开子菜单，同时选中产品列表
        const isSPA = !location.href.includes('index.html');
        const prefix = isSPA ? '' : 'index.html';
        window.location.href = `${prefix}#/products/list`;
        // 立即更新导航状态，确保产品列表被选中
        setTimeout(() => {
          updateNavigation('products', 'list');
        }, 50);
      }
    });
  }
}

/**
 * 初始化系统设置子菜单交互（优化版：防重复绑定）
 */
function initSettingsSubmenu() {
  const navSettings = document.getElementById('navSettings');
  const settingsSubnav = document.getElementById('settingsSubnav');

  if (navSettings && settingsSubnav) {
    // 检查是否已绑定事件（防止重复绑定）
    if (eventListenersCache.has(navSettings)) {
      return;
    }

    // 标记已绑定
    eventListenersCache.set(navSettings, true);

    navSettings.addEventListener('click', function (e) {
      e.preventDefault();
      const isOpen = settingsSubnav.classList.contains('open');
      settingsSubnav.classList.toggle('open', !isOpen);
      navSettings.classList.toggle('expanded', !isOpen);

      // 如果展开且不在设置页面，跳转到公司设置
      if (!isOpen) {
        const isSPA = !location.href.includes('index.html');
        const prefix = isSPA ? '' : 'index.html';
        window.location.href = `${prefix}#/settings/company`;
      }
    });
  }
}

/**
 * 初始化合作方管理子菜单交互（优化版：防重复绑定）
 */
function initPartnersSubmenu() {
  const navPartners = document.getElementById('navPartners');
  const partnersSubnav = document.getElementById('partnersSubnav');

  if (navPartners && partnersSubnav) {
    // 检查是否已绑定事件（防止重复绑定）
    if (eventListenersCache.has(navPartners)) {
      return;
    }

    // 标记已绑定
    eventListenersCache.set(navPartners, true);

    navPartners.addEventListener('click', function (e) {
      e.preventDefault();
      const raw = (location.hash.replace('#/', '') || '').trim();
      const base = raw.split('/')[0] || '';
      const seg = raw.split('/')[1] || '';
      const isOpen = partnersSubnav.classList.contains('open');

      if (base === 'partners') {
        // 已在合作方管理视图：点击一次收起，再次点击展开
        partnersSubnav.classList.toggle('open', !isOpen);
        navPartners.classList.toggle('expanded', !isOpen);
        // 当展开时如果没有子路由，默认跳转到 customers
        if (!isOpen && !seg) {
          const isSPA = !location.href.includes('index.html');
          const prefix = isSPA ? '' : 'index.html';
          window.location.href = `${prefix}#/partners/customers`;
        } else if (!isOpen && seg) {
          // 如果展开时已有子路由，确保对应的子菜单项被选中
          updateNavigation('partners', seg);
        }
      } else {
        // 非合作方管理视图：跳到 partners 并展开子菜单，同时选中客户管理
        const isSPA = !location.href.includes('index.html');
        const prefix = isSPA ? '' : 'index.html';
        window.location.href = `${prefix}#/partners/customers`;
        // 立即更新导航状态，确保客户管理被选中
        setTimeout(() => {
          updateNavigation('partners', 'customers');
        }, 50);
      }
    });
  }
}

/**
 * 初始化用户下拉菜单交互
 */
function initUserDropdown() {
  const userInfo = document.getElementById('userInfo');
  const userAvatarWrapper = document.getElementById('userAvatarWrapper');
  const userName = document.getElementById('userName');
  const userDropdown = document.getElementById('userDropdown');

  if (!userInfo || !userDropdown) {
    return;
  }

  // 处理用户信息区域的点击事件（包括头像和用户名）
  function toggleDropdown(e) {
    e.stopPropagation();
    const isVisible = userDropdown.style.visibility === 'visible' && userDropdown.style.opacity === '1';

    if (isVisible) {
      // 关闭下拉菜单
      userDropdown.style.opacity = '0';
      userDropdown.style.visibility = 'hidden';
    } else {
      // 显示下拉菜单
      userDropdown.style.opacity = '1';
      userDropdown.style.visibility = 'visible';
    }
  }

  // 为头像区域添加点击事件
  if (userAvatarWrapper) {
    userAvatarWrapper.addEventListener('click', toggleDropdown);
  }

  // 为用户名文本添加点击事件
  if (userName) {
    userName.addEventListener('click', toggleDropdown);
    // 添加鼠标指针样式，提示可点击
    userName.style.cursor = 'pointer';
  }

  // 为整个用户信息区域添加点击事件（作为备用）
  userInfo.addEventListener('click', function (e) {
    // 如果点击的是用户信息区域本身（不是子元素），也触发下拉菜单
    if (e.target === userInfo || e.target === userName) {
      toggleDropdown(e);
    }
  });

  // 点击其他地方关闭下拉菜单
  document.addEventListener('click', function (e) {
    // 如果点击的不是用户信息区域或其子元素，关闭下拉菜单
    if (userInfo && !userInfo.contains(e.target)) {
      userDropdown.style.opacity = '0';
      userDropdown.style.visibility = 'hidden';
    }
  });

  // 阻止下拉菜单内部的点击事件冒泡
  if (userDropdown) {
    userDropdown.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }
}

/**
 * 初始化布局组件
 * @param {Object} options - 配置选项
 * @param {string} options.pageTitle - 页面标题
 * @param {string} options.currentRoute - 当前路由
 * @param {string} options.currentTab - 当前子菜单项
 * @param {boolean} options.isSPA - 是否为SPA模式
 * @param {string} options.topbarSelector - topbar容器选择器（默认：.topbar-container 或 .topbar的父元素）
 * @param {string} options.sidebarSelector - sidebar容器选择器（默认：.sidebar-container 或 .sidebar的父元素）
 * @param {Array} options.customActions - 自定义操作按钮HTML
 */
export function initLayout(options = {}) {
  const pageTitle = options.pageTitle || config.appName;
  const currentRoute = options.currentRoute || '';
  const currentTab = options.currentTab || '';
  const isSPA = options.isSPA !== false;

  // 查找或创建容器
  const appShell = document.querySelector('.app-shell');
  if (!appShell) {
    console.error('找不到 .app-shell 容器');
    return;
  }

  // 处理topbar
  let existingTopbar = document.querySelector('.topbar');

  if (!existingTopbar) {
    // 如果topbar不存在，创建它
    const topbarHTML = generateTopbar({
      pageTitle: pageTitle,
      customActions: options.customActions || ''
    });
    // 在app-shell开头插入topbar（在toast-container之后或开头）
    const toastContainer = appShell.querySelector('.toast-container');
    if (toastContainer) {
      toastContainer.insertAdjacentHTML('afterend', topbarHTML);
    } else {
      appShell.insertAdjacentHTML('afterbegin', topbarHTML);
    }
  } else if (options.preserveTopbar) {
    // 如果topbar已存在且需要保留，只更新标题
    updateTopbarTitle(pageTitle);
  } else {
    // 如果需要替换，则替换整个topbar
    existingTopbar.outerHTML = generateTopbar({
      pageTitle: pageTitle,
      customActions: options.customActions || ''
    });
  }

  // 处理sidebar
  let contentDiv = document.querySelector('.content');

  if (!contentDiv) {
    // 创建content容器
    contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    // 查找main标签，如果存在则在其父级创建content，否则在app-shell末尾添加
    const existingMain = appShell.querySelector('main');
    if (existingMain && existingMain.parentNode === appShell) {
      // 创建content并移动main到content内
      const wrapper = document.createElement('div');
      wrapper.className = 'content';
      appShell.insertBefore(wrapper, existingMain);
      wrapper.appendChild(existingMain);
      contentDiv = wrapper;
    } else {
      appShell.appendChild(contentDiv);
    }
  }

  // 检查是否已有遮罩层
  let existingOverlay = document.querySelector('.sidebar-overlay');
  if (!existingOverlay) {
    const overlayHTML = '<div class="sidebar-overlay" id="sidebarOverlay"></div>';
    appShell.insertAdjacentHTML('afterbegin', overlayHTML);
  }

  const existingSidebar = contentDiv.querySelector('.sidebar');

  if (!existingSidebar) {
    // 如果sidebar不存在，创建它
    const sidebarHTML = generateSidebar({
      currentRoute: currentRoute,
      currentTab: currentTab,
      isSPA: isSPA
    }).replace(/<div class="sidebar-overlay"[^>]*><\/div>\s*/, '');
    contentDiv.insertAdjacentHTML('afterbegin', sidebarHTML);
  } else if (options.preserveSidebar) {
    // 如果sidebar已存在且需要保留，只更新路由高亮状态
    updateSidebarRoute(currentRoute, currentTab);
  } else {
    // 如果需要替换，则替换整个sidebar
    const sidebarHTML = generateSidebar({
      currentRoute: currentRoute,
      currentTab: currentTab,
      isSPA: isSPA
    }).replace(/<div class="sidebar-overlay"[^>]*><\/div>\s*/, '');
    existingSidebar.outerHTML = sidebarHTML;
  }

  // 初始化子菜单交互（优化：使用 requestAnimationFrame 延迟执行）
  requestAnimationFrame(() => {
    initOrdersSubmenu();
    initProductsSubmenu();
    initPartnersSubmenu();
    initSettingsSubmenu();
  });

  // 初始化用户信息显示（优化：延迟执行，不阻塞渲染）
  requestAnimationFrame(() => {
    if (typeof initUserInfo === 'function') {
      initUserInfo();
    }

    // 初始化用户下拉菜单交互
    initUserDropdown();

    // 初始化汉堡菜单和侧边栏交互
    initHamburgerMenu();

    // 初始化事件监听（如果 AuthManager 可用）
    if (typeof initEventListeners === 'function') {
      initEventListeners();
    }
  });
}

/**
 * 初始化汉堡菜单和侧边栏交互
 */
function initHamburgerMenu() {
  const hamburgerMenu = document.getElementById('hamburgerMenu');
  const sidebar = document.querySelector('.sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (!hamburgerMenu || !sidebar) {
    return;
  }

  // 切换侧边栏显示/隐藏
  function toggleSidebar() {
    if (sidebar) {
      sidebar.classList.toggle('mobile-open');
      if (hamburgerMenu) {
        hamburgerMenu.classList.toggle('active');
      }
      if (sidebarOverlay) {
        sidebarOverlay.classList.toggle('active');
      }
    }
  }

  // 关闭侧边栏
  function closeSidebar() {
    if (sidebar) {
      sidebar.classList.remove('mobile-open');
      if (hamburgerMenu) {
        hamburgerMenu.classList.remove('active');
      }
      if (sidebarOverlay) {
        sidebarOverlay.classList.remove('active');
      }
    }
  }

  // 汉堡菜单点击事件
  if (hamburgerMenu) {
    hamburgerMenu.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleSidebar();
    });
  }

  // 遮罩层点击事件
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', function () {
      closeSidebar();
    });
  }

  // 点击侧边栏外部区域关闭
  document.addEventListener('click', function (e) {
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      const isClickInsideSidebar = sidebar.contains(e.target);
      const isClickOnHamburger = hamburgerMenu && hamburgerMenu.contains(e.target);

      if (!isClickInsideSidebar && !isClickOnHamburger) {
        closeSidebar();
      }
    }
  });

  // 窗口大小改变时，如果宽度大于768px，自动关闭移动端菜单
  window.addEventListener('resize', function () {
    if (window.innerWidth > 768 && sidebar && sidebar.classList.contains('mobile-open')) {
      closeSidebar();
    }
  });

  // 点击菜单项后，在移动端自动关闭侧边栏
  const navLinks = document.querySelectorAll('.nav a');
  navLinks.forEach(link => {
    link.addEventListener('click', function () {
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          closeSidebar();
        }, 100);
      }
    });
  });
}

// 导出 LayoutComponent 对象
export const LayoutComponent = {
  init: initLayout,
  generateTopbar: generateTopbar,
  generateSidebar: generateSidebar
};

// 导出到全局作用域（保持向后兼容）
if (typeof window !== 'undefined') {
  window.LayoutComponent = LayoutComponent;
  // 确保 NavigationConfig 也在全局可用（以防其他代码直接访问）
  if (!window.NavigationConfig) {
    window.NavigationConfig = NAVIGATION_CONFIG;
  }
}

