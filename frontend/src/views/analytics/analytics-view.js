/**
 * 统计分析视图
 * 处理统计数据的显示
 */
import { fmtMoney } from '../../utils/format-utils.js';
import { ExportStatisticsView } from './export-statistics-view.js';
import { OrderAnalysisView } from './order-analysis-view.js';
import { SummaryStatisticsView } from './summary-statistics-view.js';

export class AnalyticsView {
  constructor(state, options = {}) {
    this.state = state;
    this.stateManager = options.stateManager || null;
    this.apiService = options.apiService || (window.ApiService || null);
    this.exportStatisticsView = null;
    this.orderAnalysisView = null;
    this.summaryStatisticsView = null;
  }

  /**
   * 渲染统计视图
   * @param {string} subRoute - 子路由（如 'summary', 'export', 'order-analysis'）
   */
  async render(subRoute = 'summary') {
    console.log('[统计视图] 渲染子路由:', subRoute);
    
    if (subRoute === 'export') {
      // 渲染出口统计页面
      await this.renderExportStatistics();
    } else if (subRoute === 'order-analysis') {
      // 渲染订单分析页面
      await this.renderOrderAnalysis();
    } else {
      // 渲染统计概览页面（默认）- 改为异步
      await this.renderSummary();
    }
  }

  /**
   * 渲染统计概览
   * 使用 SummaryStatisticsView 来渲染完整的统计概览页面
   */
  async renderSummary() {
    // 等待视图DOM加载完成
    await this.waitForSummaryViewDOM();
    
    // 如果实例已存在且正在渲染，不重复创建
    if (this.summaryStatisticsView && this.summaryStatisticsView._isRendering) {
      console.log('[统计视图] 统计概览正在渲染中，跳过重复调用');
      return;
    }
    
    // 每次渲染时都重新创建实例，确保状态是全新的（刷新时很重要）
    this.summaryStatisticsView = new SummaryStatisticsView({
      stateManager: this.stateManager,
      apiService: this.apiService
    });
    
    // 立即开始渲染
    await this.summaryStatisticsView.render();
  }

  /**
   * 等待统计概览视图DOM加载完成
   */
  async waitForSummaryViewDOM() {
    // 先快速检查一次
    const viewContainer = document.getElementById('analyticsSummary');
    if (viewContainer) {
      return;
    }
    
    // 如果未找到，进行重试
    const maxRetries = 10;
    const retryInterval = 30;
    
    for (let i = 0; i < maxRetries; i++) {
      const viewContainer = document.getElementById('analyticsSummary');
      if (viewContainer) {
        console.log('[统计视图] 统计概览视图DOM已加载，重试次数:', i);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    console.warn('[统计视图] 统计概览视图DOM等待超时，继续执行');
  }

  /**
   * 渲染出口统计页面
   */
  async renderExportStatistics() {
    // 等待视图DOM加载完成
    await this.waitForViewDOM();
    
    // 如果实例已存在且正在渲染，不重复创建
    if (this.exportStatisticsView && this.exportStatisticsView._isRendering) {
      console.log('[统计视图] 出口统计正在渲染中，跳过重复调用');
      return;
    }
    
    // 每次渲染时都重新创建实例，确保状态是全新的（刷新时很重要）
    // 这样可以避免复用旧实例导致的数据不更新问题
    this.exportStatisticsView = new ExportStatisticsView({
      stateManager: this.stateManager,
      apiService: this.apiService
    });
    
    // 立即开始渲染，不等待额外的帧
    // 如果state中有数据，会立即渲染，避免看到骨架屏
    await this.exportStatisticsView.render();
  }

  /**
   * 等待视图DOM加载完成（优化：减少等待时间）
   */
  async waitForViewDOM() {
    // 先快速检查一次
    const viewContainer = document.getElementById('view-analytics-export');
    if (viewContainer) {
      // 使用微任务立即返回，不等待下一帧
      return;
    }
    
    // 如果未找到，进行重试（减少重试次数和间隔）
    const maxRetries = 10; // 减少重试次数
    const retryInterval = 30; // 减少重试间隔
    
    for (let i = 0; i < maxRetries; i++) {
      // 检查视图容器是否存在
      const viewContainer = document.getElementById('view-analytics-export');
      if (viewContainer) {
        console.log('[统计视图] 出口统计视图DOM已加载，重试次数:', i);
        return;
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    console.warn('[统计视图] 出口统计视图DOM等待超时，继续执行');
  }

  /**
   * 渲染订单分析页面
   */
  async renderOrderAnalysis() {
    await this.waitForOrderAnalysisViewDOM();
    
    if (this.orderAnalysisView && this.orderAnalysisView._isRendering) {
      console.log('[统计视图] 订单分析正在渲染中，跳过重复调用');
      return;
    }
    
    this.orderAnalysisView = new OrderAnalysisView({
      stateManager: this.stateManager,
      apiService: this.apiService
    });
    
    await this.orderAnalysisView.render();
  }

  /**
   * 等待订单分析视图DOM加载完成
   */
  async waitForOrderAnalysisViewDOM() {
    const viewContainer = document.getElementById('view-analytics-order-analysis');
    if (viewContainer) {
      return;
    }
    
    const maxRetries = 10;
    const retryInterval = 30;
    
    for (let i = 0; i < maxRetries; i++) {
      const viewContainer = document.getElementById('view-analytics-order-analysis');
      if (viewContainer) {
        console.log('[统计视图] 订单分析视图DOM已加载，重试次数:', i);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    console.warn('[统计视图] 订单分析视图DOM等待超时，继续执行');
  }
}

