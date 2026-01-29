/**
 * 导航工具模块
 * 负责更新导航菜单的高亮和展开状态
 */

// DOM元素缓存（优化性能）
const domCache = {
  nav: null,
  navLinks: null,
  submenus: {},
  lastUpdate: 0
};

// 缓存有效期（毫秒）
const CACHE_TTL = 5000;

/**
 * 获取并缓存导航元素
 */
function getNavElement() {
  const now = Date.now();
  if (!domCache.nav || (now - domCache.lastUpdate) > CACHE_TTL) {
    domCache.nav = document.getElementById('nav');
    domCache.lastUpdate = now;
  }
  return domCache.nav;
}

/**
 * 获取并缓存导航链接
 */
function getNavLinks() {
  const nav = getNavElement();
  if (!nav) return [];
  
  const now = Date.now();
  if (!domCache.navLinks || (now - domCache.lastUpdate) > CACHE_TTL) {
    domCache.navLinks = Array.from(nav.querySelectorAll('a[data-route]'));
    domCache.lastUpdate = now;
  }
  return domCache.navLinks;
}

/**
 * 获取子菜单元素（带缓存）
 */
function getSubmenu(subnavId, navId) {
  const now = Date.now();
  const cacheKey = `${subnavId}_${navId}`;
  
  if (!domCache.submenus[cacheKey] || (now - domCache.lastUpdate) > CACHE_TTL) {
    const subnav = document.getElementById(subnavId);
    const nav = document.getElementById(navId);
    domCache.submenus[cacheKey] = { subnav, nav };
    domCache.lastUpdate = now;
  }
  
  return domCache.submenus[cacheKey];
}

/**
 * 清除DOM缓存
 */
export function clearNavCache() {
  domCache.nav = null;
  domCache.navLinks = null;
  domCache.submenus = {};
  domCache.lastUpdate = 0;
}

/**
 * 更新导航高亮和子菜单展开状态（优化版）
 * @param {string} route - 当前路由
 * @param {string} sub - 子路由（可选）
 */
export function updateNavigation(route, sub) {
  // 使用 requestAnimationFrame 优化更新时机
  requestAnimationFrame(() => {
    _updateNavigationSync(route, sub);
  });
}

/**
 * 同步更新导航（内部方法）
 */
function _updateNavigationSync(route, sub) {
  // 确保导航菜单已加载
  const nav = getNavElement();
  if (!nav) {
    console.warn('[updateNavigation] 导航菜单未找到，延迟更新');
    // 延迟重试（最多3次）
    let retries = 0;
    const maxRetries = 3;
    const retry = () => {
      if (retries < maxRetries) {
        retries++;
        setTimeout(() => {
          const retryNav = getNavElement();
          if (retryNav) {
            _updateNavigationSync(route, sub);
          } else {
            retry();
          }
        }, 50);
      }
    };
    retry();
    return;
  }
  
  // 批量更新主菜单高亮（优化：减少DOM操作）
  const navLinks = getNavLinks();
  const activeRoute = route;
  
  // 使用 DocumentFragment 批量操作（如果需要）
  navLinks.forEach((a) => {
    const routeAttr = a.getAttribute('data-route');
    if (routeAttr === activeRoute) {
      if (!a.classList.contains('active')) {
        a.classList.add('active');
      }
    } else {
      if (a.classList.contains('active')) {
        a.classList.remove('active');
      }
    }
  });
  
  // 批量处理所有子菜单（优化：减少函数调用开销）
  const submenuConfigs = [
    { subnavId: 'ordersSubnav', navId: 'navOrders', routeMatch: route === 'orders', defaultSub: 'list' },
    { subnavId: 'documentCenterSubnav', navId: 'navDocumentCenter', routeMatch: route === 'document-center', defaultSub: 'generate' },
    { subnavId: 'productsSubnav', navId: 'navProducts', routeMatch: route === 'products', defaultSub: 'list' },
    { subnavId: 'analyticsSubnav', navId: 'navAnalytics', routeMatch: route === 'analytics', defaultSub: 'summary' },
    { subnavId: 'settingsSubnav', navId: 'navSettings', routeMatch: route === 'settings', defaultSub: 'company' }
  ];
  
  submenuConfigs.forEach(config => {
    updateSubmenu(config.subnavId, config.navId, config.routeMatch, sub || config.defaultSub);
  });
}

/**
 * 更新子菜单的展开状态和高亮（优化版：使用缓存和批量操作）
 * @param {string} subnavId - 子菜单容器ID
 * @param {string} navId - 主菜单项ID
 * @param {boolean} shouldOpen - 是否应该展开
 * @param {string} activeTab - 激活的子菜单项
 */
function updateSubmenu(subnavId, navId, shouldOpen, activeTab) {
  try {
    const { subnav, nav } = getSubmenu(subnavId, navId);
    if (!subnav || !nav) return;
    
    // 批量更新类名（优化：减少DOM操作）
    const isOpen = subnav.classList.contains('open');
    const isExpanded = nav.classList.contains('expanded');
    
    if (shouldOpen !== isOpen) {
      subnav.classList.toggle('open', shouldOpen);
    }
    if (shouldOpen !== isExpanded) {
      nav.classList.toggle('expanded', shouldOpen);
    }
    
    // 更新子菜单项高亮（优化：缓存查询结果）
    const subLinks = subnav.querySelectorAll('a[data-tab]');
    if (shouldOpen && subLinks.length > 0) {
      subLinks.forEach(a => {
        const tab = a.getAttribute('data-tab');
        const isActive = tab === activeTab;
        const hasActive = a.classList.contains('active');
        
        if (isActive !== hasActive) {
          a.classList.toggle('active', isActive);
        }
      });
    } else if (!shouldOpen && subLinks.length > 0) {
      // 批量移除active类（优化：只操作有active类的元素）
      subLinks.forEach(a => {
        if (a.classList.contains('active')) {
          a.classList.remove('active');
        }
      });
    }
  } catch (e) {
    // 静默处理错误，避免影响其他功能
    console.warn(`[updateSubmenu] 更新子菜单失败: ${subnavId}`, e);
  }
}

