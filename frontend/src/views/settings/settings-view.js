/**
 * 设置视图主控制器
 * 管理所有设置子页面的切换和初始化
 */
import { timerManager } from '../../utils/timer-manager.js';
import { CompanySettingsView } from './company-settings-view.js';
import { DatabaseSettingsView } from './database-settings-view.js';
import { DiagnosticsView } from './diagnostics-view.js';
import { ExportSettingsView } from './export-settings-view.js';

export class SettingsView {
  constructor(apiService) {
    this.apiService = apiService || window.ApiService;
    this.companyView = new CompanySettingsView(this.apiService);
    this.databaseView = new DatabaseSettingsView(this.apiService);
    this.diagnosticsView = new DiagnosticsView();
    this.exportView = new ExportSettingsView(this.apiService);
    // 防止重复初始化
    this._lastRenderedTab = null;
    this._isRendering = false;
  }

  /**
   * 渲染设置页面
   * @param {string} tab - 当前标签页（company, database, products, users, logs, diagnostics）
   */
  async render(tab) {
    // 防止重复渲染：如果正在渲染相同的标签页，则跳过
    if (this._isRendering && this._lastRenderedTab === tab) {
      console.log('[设置视图] 正在渲染相同标签页，跳过重复调用:', tab);
      return;
    }

    // 权限检查：只有管理员可以访问用户管理
    if (tab === 'users') {
      const user = window.AuthManager?.getUser();
      if (user && user.role !== 'admin') {
        console.warn('[设置视图] 非管理员尝试访问用户管理页面，重定向至公司设置');
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast('您没有权限访问用户管理', 'warning');
        }
        tab = 'company';
      }
    }

    // 如果已经渲染过相同的标签页，且不在渲染中，允许重新渲染（可能是视图被重新加载）
    this._isRendering = true;
    this._lastRenderedTab = tab;
    // 子页切换
    try {
      const subnav = document.getElementById('settingsSubnav');
      const validTabs = ['company', 'database', 'export', 'products', 'users', 'logs', 'diagnostics'];
      const current = validTabs.includes(tab) ? tab : 'company';

      const map = {
        company: document.getElementById('settingsCompanyPage'),
        database: document.getElementById('settingsDbPage'),
        export: document.getElementById('settingsExportPage'),
        products: document.getElementById('settingsProductsPage'),
        users: document.getElementById('settingsUsersPage'),
        logs: document.getElementById('settingsLogsPage'),
        diagnostics: document.getElementById('settingsDiagnosticsPage')
      };

      Object.entries(map).forEach(([k, el]) => {
        if (el) el.style.display = (k === current) ? 'block' : 'none';
      });

      if (subnav) {
        subnav.querySelectorAll('a[data-tab]').forEach(a => {
          a.classList.toggle('active', a.getAttribute('data-tab') === current);
        });
      }

      // 同步设置页顶部标题为当前子菜单名称
      const settingsPanelTitle = document.querySelector('#view-settings .panel-title');
      if (settingsPanelTitle) {
        const titleMap = {
          company: '公司设置',
          database: '数据库设置',
          export: '导出设置',
          products: '产品库管理',
          users: '用户管理',
          logs: '操作日志',
          diagnostics: '帮助与支持'
        };
        settingsPanelTitle.textContent = titleMap[current] || '系统设置';
      }

      // 根据当前标签页初始化对应的视图
      // 使用微任务队列，确保DOM已更新，但不阻塞渲染
      Promise.resolve().then(async () => {
        try {
          switch (current) {
            case 'company':
              // 确保DOM元素已准备好 (Original logic preserved)
              const checkAndRenderCompany = async () => {
                try {
                  const nameCN = document.getElementById("sysCompanyNameCN");
                  if (nameCN) {
                    await this.companyView.render();
                  } else {
                    let retries = 0;
                    const maxRetries = 5;
                    const retryCheck = async () => {
                      try {
                        const nameCN = document.getElementById("sysCompanyNameCN");
                        if (nameCN) {
                          await this.companyView.render();
                        } else if (retries < maxRetries) {
                          retries++;
                          timerManager.setTimeout(retryCheck, 20);
                        } else {
                          console.error('[设置视图] 公司设置页面元素未找到，渲染失败');
                        }
                      } catch (error) {
                        console.error('[设置视图] 公司设置页面渲染失败:', error);
                      }
                    };
                    timerManager.setTimeout(retryCheck, 20);
                  }
                } catch (error) {
                  console.error('[设置视图] 公司设置页面渲染失败:', error);
                }
              };
              await checkAndRenderCompany();
              break;
            case 'database':
              try {
                await this.databaseView.render();
              } catch (error) {
                console.error('[设置视图] 数据库设置页面渲染失败:', error);
              }
              break;
            case 'export':
              try {
                await this.exportView.render();
              } catch (error) {
                console.error('[设置视图] 导出设置页面渲染失败:', error);
              }
              break;
            case 'diagnostics':
              try {
                await this.diagnosticsView.render();
              } catch (error) {
                console.error('[设置视图] 诊断页面渲染失败:', error);
              }
              break;
            case 'users':
              try {
                await this.initUsersManagement();
              } catch (error) {
                console.error('[设置视图] 用户管理初始化失败:', error);
              }
              break;
            case 'logs':
              try {
                await this.initLogsManagement();
              } catch (error) {
                console.error('[设置视图] 操作日志初始化失败:', error);
              }
              break;
            // products 暂时保持原样
          }
        } catch (error) {
          console.error('[设置视图] 初始化子视图失败:', error);
        }
      }).catch(error => {
        console.error('[设置视图] Promise 链中未处理的错误:', error);
        this._isRendering = false;
      });
    } catch (e) {
      console.error('[设置视图] 渲染失败:', e);
      this._isRendering = false;
    } finally {
      // 确保在渲染完成后重置标志
      Promise.resolve().then(() => {
        this._isRendering = false;
      });
    }
  }

  /**
   * 初始化用户管理
   */
  async initUsersManagement() {
    console.log('[用户管理] 开始初始化');

    const usersPage = document.getElementById('settingsUsersPage');
    if (!usersPage) {
      if (window.isSPA) {
        return;
      }
      console.warn('[用户管理] 用户管理页面元素不存在，延迟重试');
      timerManager.setTimeout(async () => {
        const retryPage = document.getElementById('settingsUsersPage');
        if (retryPage) {
          console.log('[用户管理] 重试成功，开始初始化');
          await this.initUsersManagement();
        } else {
          console.warn('[用户管理] 重试失败，用户管理页面元素仍未找到');
        }
      }, 300);
      return;
    }

    try {
      // 动态导入用户管理模块
      const { init } = await import('../../pages/user/user-management-page.js');
      if (typeof init === 'function') {
        init();
        console.log('[用户管理] 初始化完成');
      }
    } catch (error) {
      console.error('[用户管理] 加载用户管理模块失败:', error);
    }
  }

  /**
   * 初始化操作日志管理
   */
  async initLogsManagement() {
    console.log('[操作日志] 开始初始化');

    const logsPage = document.getElementById('settingsLogsPage');
    if (!logsPage) {
      console.warn('[操作日志] 操作日志页面元素不存在');
      return;
    }

    try {
      // 动态导入操作日志模块
      // 注意：log-management-page.js 已经设置了自动初始化和 MutationObserver
      // 导入它就会触发其内部逻辑，它会自动处理可见性并加载数据
      await import('../../pages/system/log-management-page.js');
      console.log('[操作日志] 模块加载完成');
    } catch (error) {
      console.error('[操作日志] 加载操作日志模块失败:', error);
    }
  }
}
