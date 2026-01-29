/**
 * 设置页面模块
 * 从 spa.js 中拆分出的设置页面相关逻辑
 */

/**
 * 初始化设置页面
 * @param {Object} context - 上下文对象（包含 state, ApiService 等）
 * @param {string} tab - 当前标签页（company, database, products, users, logs）
 */
export function initSettingsPage(context, tab = 'company') {
  console.log('[设置页面] 初始化设置页面，标签:', tab);
  
  // 渲染设置页面
  if (context.renderSettings) {
    context.renderSettings(tab);
  }
  
  // 初始化数据库设置按钮
  if (tab === 'database') {
    initDatabaseSettingsButtons(context);
  }
  
  // 初始化用户管理
  if (tab === 'users') {
    initUsersManagement(context);
  }
}

/**
 * 初始化数据库设置按钮
 */
function initDatabaseSettingsButtons(context) {
  // 从 spa.js 中提取的数据库设置相关逻辑
  // 暂时保持引用原函数
  if (context.initDatabaseSettingsButtons) {
    context.initDatabaseSettingsButtons();
  }
}

/**
 * 初始化用户管理
 */
async function initUsersManagement(context) {
  console.log('[用户管理] 开始初始化');
  
  const usersPage = document.getElementById('settingsUsersPage');
  if (!usersPage) {
    if (window.isSPA) {
      return;
    }
    console.warn('[用户管理] 用户管理页面元素不存在');
    return;
  }
  
  try {
    const { init } = await import('./user-management-page.js');
    if (typeof init === 'function') {
      init();
      console.log('[用户管理] 初始化完成');
    }
  } catch (error) {
    console.error('[用户管理] 加载用户管理模块失败:', error);
  }
}

