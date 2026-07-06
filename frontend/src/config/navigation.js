/**
 * 全局导航菜单配置
 * ES6 模块化版本
 */

// 导航菜单配置
export const NAVIGATION_CONFIG = {
  // 主导航菜单
  mainMenu: [
    { route: 'home', label: '首页', icon: '🏠' },
    { route: 'orders', label: '订单管理', icon: '📦', hasSubmenu: true },
    { route: 'document-center', label: '单据中心', icon: '📄', hasSubmenu: true }, // 新版单据中心
    { route: 'analytics', label: '交易统计', icon: '📊', hasSubmenu: true },
    { route: 'partners', label: '合作方管理', icon: '👥', hasSubmenu: true }, // 原客户管理改为合作方管理
    { route: 'products', label: '产品库管理', icon: '📦', hasSubmenu: true },
    { route: 'settings', label: '系统设置', icon: '⚙️', hasSubmenu: true }
  ],

  // 订单管理子菜单
  ordersSubmenu: [
    { tab: 'list', label: '订单列表', icon: '📋' },
    { tab: 'edit', label: '订单编辑', icon: '✏️' },
    { tab: 'deleted', label: '已删除订单', icon: '🗑️' },
    { tab: 'config', label: '订单参数配置', icon: '⚙️' }
  ],

  // 产品库管理子菜单（产品列表在上，新增产品在下）
  productsSubmenu: [
    { tab: 'list', label: '产品列表', icon: '📋' },
    { tab: 'add', label: '新增产品', icon: '➕' }
  ],

  // 合作方管理子菜单
  partnersSubmenu: [
    { tab: 'customers', label: '客户管理', icon: '👤' },
    { tab: 'forwarders', label: '货代管理', icon: '🚢' }
  ],

  // 单据中心子菜单（新版）
  documentCenterSubmenu: [
    { tab: 'generate', label: '单据生成', icon: '📝' },
    { tab: 'templates', label: '单据模板', icon: '🎨' },
    { tab: 'template-editor', label: '模板编辑', icon: '✏️' }
  ],

  // 交易统计子菜单
  analyticsSubmenu: [
    { tab: 'summary', label: '统计概览', icon: '📊' },
    { tab: 'export', label: '出口统计', icon: '📤' },
    { tab: 'order-analysis', label: '订单分析', icon: '📋' }
  ],

  // 系统设置子菜单
  settingsSubmenu: [
    { tab: 'company', label: '公司设置', icon: '🏢' },
    { tab: 'database', label: '数据库设置', icon: '💾' },
    { tab: 'export', label: '导出设置', icon: '🖨️' },
    { tab: 'users', label: '用户管理', icon: '👤' },
    { tab: 'logs', label: '操作日志', icon: '📝' },
    { tab: 'diagnostics', label: '帮助与支持', icon: '🤝' }
  ],

  // 软件名称
  appName: 'PP外贸订单管理系统'
};

// 导出到全局作用域（保持向后兼容）
if (typeof window !== 'undefined') {
  window.NavigationConfig = NAVIGATION_CONFIG;
}

