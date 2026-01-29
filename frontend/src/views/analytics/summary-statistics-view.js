/**
 * 统计概览视图
 * 注意：基础统计信息（统计卡片、图表、排行榜）已在首页展示
 * 本页面专注于提供更详细的统计分析功能
 */
import { DashboardService } from '../../services/dashboard-service.js';

export class SummaryStatisticsView {
  constructor(options = {}) {
    this.stateManager = options.stateManager || null;
    this.apiService = options.apiService || (window.ApiService || null);
    this.dashboardService = null;
    this._isRendering = false;
    this._hasRendered = false;
    
    // 初始化 DashboardService（如果需要加载数据）
    if (this.apiService) {
      this.dashboardService = new DashboardService({ apiService: this.apiService });
    }

    // 绑定方法
    this.refresh = this.refresh.bind(this);
  }

  /**
   * 渲染统计概览
   */
  async render() {
    if (this._isRendering) {
      console.log('[统计概览] 正在渲染中，跳过重复调用');
      return;
    }

    this._isRendering = true;
    console.log('[统计概览] 开始渲染');

    try {
      // 显示加载状态
      this.showLoading();

      // 等待DOM就绪
      await this.waitForDOMReady();

      // 加载数据
      await this.loadData();

      // 渲染内容
      this.renderContent();

      // 绑定事件（只在第一次渲染时绑定）
      if (!this._hasRendered) {
        this.bindEvents();
      }

      this._hasRendered = true;
    } catch (error) {
      console.error('[统计概览] 渲染失败:', error);
      this.showError();
    } finally {
      this._isRendering = false;
    }
  }

  /**
   * 等待DOM就绪
   */
  async waitForDOMReady() {
    const container = document.getElementById('analyticsSummary');
    if (container) {
      return;
    }

    const maxRetries = 10;
    const retryInterval = 50;

    for (let i = 0; i < maxRetries; i++) {
      const container = document.getElementById('analyticsSummary');
      if (container) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }

    throw new Error('统计概览容器未找到');
  }

  /**
   * 显示加载状态
   */
  showLoading() {
    const loading = document.getElementById('analyticsLoading');
    const info = document.getElementById('analyticsInfo');
    const content = document.getElementById('analyticsContent');
    const error = document.getElementById('analyticsError');

    if (loading) loading.style.display = 'block';
    if (info) info.style.display = 'none';
    if (content) content.style.display = 'none';
    if (error) error.style.display = 'none';
  }

  /**
   * 显示错误状态
   */
  showError() {
    const loading = document.getElementById('analyticsLoading');
    const info = document.getElementById('analyticsInfo');
    const content = document.getElementById('analyticsContent');
    const error = document.getElementById('analyticsError');

    if (loading) loading.style.display = 'none';
    if (info) info.style.display = 'none';
    if (content) content.style.display = 'none';
    if (error) error.style.display = 'block';
  }

  /**
   * 加载数据（如果需要）
   * 注意：基础统计数据已在首页展示，这里可以根据需要加载其他数据
   */
  async loadData() {
    // 目前不需要加载数据，因为基础统计已在首页展示
    // 如果将来需要添加统计概览特有的数据，可以在这里加载
    console.log('[统计概览] 基础统计信息已在首页展示');
  }

  /**
   * 渲染内容
   */
  renderContent() {
    // 隐藏加载状态
    const loading = document.getElementById('analyticsLoading');
    if (loading) loading.style.display = 'none';

    // 显示提示信息和内容区域
    const info = document.getElementById('analyticsInfo');
    const content = document.getElementById('analyticsContent');

    if (info) {
      info.style.display = 'block';
    }
    if (content) {
      content.style.display = 'block';
    }

    // 如果需要渲染其他内容，可以在这里添加
    // 例如：更详细的统计分析、数据导出、自定义报表等
  }


  /**
   * 绑定事件
   */
  bindEvents() {
    // 刷新按钮
    const refreshBtn = document.getElementById('btnRefreshAnalytics');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refresh();
      });
    }
  }

  /**
   * 刷新数据
   */
  async refresh() {
    console.log('[统计概览] 刷新数据...');
    
    // 清除缓存
    if (this.dashboardService) {
      this.dashboardService.clearCache();
    }

    // 重新渲染
    await this.render();
  }

  /**
   * 清理资源
   */
  destroy() {
    this._isRendering = false;
    this._hasRendered = false;
  }
}

