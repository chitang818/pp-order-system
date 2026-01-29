/**
 * 首页视图
 * 处理首页的渲染和初始化
 */
import { DashboardService } from '../../services/dashboard-service.js';
import {
  renderStatsCards,
  renderTodoReminderCard,
  renderAISecretaryCard,
  renderDestinationDistributionCard,
  renderProductQuantityRankingCard,
  renderBoxTypeStatsCard,
  renderDailyTopicCard
} from './dashboard-stats.js';
// 移除静态导入，改为动态导入
// import {
//   renderOrderTrendChart,
//   renderStatusDistributionChart,
//   renderCustomerRankingChart,
//   renderMonthlyComparisonChart,
//   renderYearlyComparisonChart
// } from './dashboard-charts.js';
import {
  renderQuickActions,
  renderRecentActivities
} from './dashboard-actions.js';
import {
  renderShipmentReminder,
  renderPaymentReminder
} from './dashboard-reminders.js';
import { renderWelcomeCard } from './dashboard-welcome.js';
// import { toggleLayoutEditingMode, initLayoutSettings, syncLayoutToDefaults } from './dashboard-layout-editor.js';

export class HomeView {
  constructor(options = {}) {
    this.apiService = options.apiService || (window.ApiService || null);
    this.dashboardService = null;
    this.charts = {};
    this.data = null;
    this._secondaryDataAutoRefreshed = false;

    if (this.apiService) {
      this.dashboardService = new DashboardService({
        apiService: this.apiService
      });
    }
  }

  /**
   * 渲染首页（优化版：快速加载）
   * @param {boolean} forceRefresh - 是否强制刷新
   */
  async render(forceRefresh = false) {
    console.time('[HomeView] 完美初始化计时');
    const container = document.querySelector('#view-home .panel-body');
    if (!container) {
      console.warn('[HomeView] 首页容器未找到');
      return;
    }

    const startTime = performance.now();

    // 重置布局初始化标志位（允许重新初始化布局）
    try {
      const { resetLayoutInitialization } = await import('./dashboard-layout-editor.js');
      resetLayoutInitialization();
    } catch (error) {
      console.warn('[HomeView] 重置布局初始化标志位失败:', error);
    }

    // 显示加载状态
    this.showLoading();

    try {
      // 第一阶段：只加载最关键的数据（stats），立即显示
      await this.loadCriticalData(forceRefresh);

      // 立即渲染关键内容（欢迎卡片和统计卡片）
      // 使用 requestAnimationFrame 优化渲染时机，减少阻塞
      requestAnimationFrame(() => {
        // 欢迎卡片异步渲染，不阻塞（天气信息已延迟加载）
        renderWelcomeCard().catch(err => console.error('[HomeView] 渲染欢迎卡片失败:', err));
        // 统计卡片同步渲染（关键内容）
        try {
          console.log('[HomeView] 准备渲染统计卡片...');
          this.renderStatsCards();
        } catch (err) {
          console.error('[HomeView] 统计卡片渲染崩溃:', err);
          // 不抛出错误，避免阻塞后续加载
        }
      });

      // 隐藏加载状态（快速显示内容）
      this.hideLoading();

      const firstPhaseTime = performance.now() - startTime;
      console.log(`[HomeView] 第一阶段完成: ${firstPhaseTime.toFixed(0)}ms`);

      // 第二阶段：延迟加载其他数据（不阻塞首屏，使用requestIdleCallback优化）
      const loadSecondary = async () => {
        try {
          // 并行加载数据和渲染（优化：不等待数据加载完成就开始渲染已有内容）
          const dataPromise = this.loadSecondaryData(forceRefresh);
          
          // 先渲染不依赖数据的组件
          requestAnimationFrame(() => {
            this.renderTodoReminder();
            this.renderQuickActions();
            this.renderDailyTopic();
          });

          // 等待数据加载完成后再渲染依赖数据的组件
          await dataPromise;
          requestAnimationFrame(() => {
            this.renderDistributionAndRankingCards();
          });
        } catch (error) {
          console.error('[HomeView] 加载次要数据失败:', error);
          // 即使失败也尝试渲染已有内容
          requestAnimationFrame(() => {
            this.renderTodoReminder();
            this.renderQuickActions();
            this.renderDailyTopic();
          });
        }
      };

      // 优先使用 requestIdleCallback，否则使用 setTimeout
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(loadSecondary, { timeout: 150 });
      } else {
        setTimeout(loadSecondary, 50);
      }

      // 第三阶段：延迟加载实时数据（更低优先级）
      const loadRealtime = async () => {
        try {
          await this.loadRealtimeData();
          // 使用 requestIdleCallback 优化渲染时机
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => {
              this.renderReminders();
              this.renderRecentActivities();
            }, { timeout: 300 });
          } else {
            requestAnimationFrame(() => {
              this.renderReminders();
              this.renderRecentActivities();
            });
          }
        } catch (error) {
          console.error('[HomeView] 加载实时数据失败:', error);
        }
      };

      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(loadRealtime, { timeout: 400 });
      } else {
        setTimeout(loadRealtime, 200);
      }

      // 图表完全延迟加载（使用Intersection Observer）
      this.initLazyChartLoading();

      // 绑定事件（不阻塞，延迟执行）
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          this.bindEvents();
        }, { timeout: 1000 });
      } else {
        setTimeout(() => {
          this.bindEvents();
        }, 200);
      }

      // 初始化布局设置（等待所有卡片渲染完成后再执行）
      // 使用多重延迟确保所有卡片都已渲染
      const initLayout = async () => {
        try {
          const { initLayoutSettings, resetLayoutInitialization } = await import('./dashboard-layout-editor.js');
          // 重置初始化标志位，允许重新初始化（用于页面切换）
          resetLayoutInitialization();
          // 等待一个渲染周期，确保所有卡片都已渲染
          await new Promise(resolve => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
          });
          // 初始化布局
          initLayoutSettings();
        } catch (error) {
          console.error('[HomeView] 初始化布局设置失败:', error);
        }
      };

      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(initLayout, { timeout: 1500 });
      } else {
        setTimeout(initLayout, 800);
      }

      const totalTime = performance.now() - startTime;
      console.log(`[HomeView] 首页初始化完成: ${totalTime.toFixed(0)}ms`);
      console.timeEnd('[HomeView] 完美初始化计时');
    } catch (error) {
      console.error('[HomeView] 渲染主循环异常:', error);
      this.showError(error);
    }
  }

  /**
   * 加载关键数据（只加载首屏必需的数据，使用批量API优化）
   * @param {boolean} forceRefresh - 是否强制刷新
   */
  async loadCriticalData(forceRefresh = false) {
    if (!this.dashboardService) {
      throw new Error('DashboardService 未初始化');
    }

    const useCache = !forceRefresh;

    // 初始化数据结构（提前初始化，避免后续undefined错误）
    this.data = {
      stats: this._getDefaultData(0),
      shipmentSettings: { advanceDays: 5 },
      paymentSettings: {
        messageTemplate: localStorage.getItem('payment_reminder_message_template') ||
          '发票号{invoiceNo}订单都发货了{days}天了，还没要到钱呀，快催催别跑路了'
      }
    };

    // 使用批量API只加载统计数据（最快）
    // 直接调用 getStats，避免 batch API 的开销和潜在风险
    try {
      const stats = await this.dashboardService.getStats(useCache);
      if (stats) {
        this.data.stats = stats;
      }
    } catch (error) {
      console.error('[HomeView] 加载统计数据失败:', error);
      // 已使用默认值，无需再次设置
    }
  }

  /**
   * 加载次要数据（延迟加载，使用批量API优化）
   * @param {boolean} forceRefresh - 是否强制刷新
   */
  async loadSecondaryData(forceRefresh = false) {
    if (!this.dashboardService) {
      return;
    }

    const useCache = !forceRefresh;

    // 初始化默认数据，避免undefined错误
    if (!this.data) {
      this.data = {};
    }

    // 使用批量API一次性加载所有次要数据（减少HTTP请求）
    try {
      console.log('[HomeView] 开始加载次要数据...');
      const batchData = await this.dashboardService.getBatchData(
        ['trends', 'distribution', 'ranking', 'comparison', 'yearlyComparison', 'destinationDistribution', 'productRanking', 'boxTypeStats'],
        {
          useCache,
          trendsDays: 30,
          rankingLimit: 10,
          comparisonMonths: 6,
          yearlyComparisonYears: 5,
          productRankingLimit: 5,
          boxTypeStatsLimit: 5
        }
      );

      // 更新数据（只更新存在的字段，避免覆盖已有数据）
      if (batchData) {
        this.data.trends = batchData.trends || this._getDefaultData(1);
        this.data.distribution = batchData.distribution || this._getDefaultData(2);
        this.data.ranking = batchData.ranking || this._getDefaultData(3);
        this.data.comparison = batchData.comparison || this._getDefaultData(4);
        this.data.yearlyComparison = batchData.yearlyComparison || this._getDefaultData(5);
        this.data.destinationDistribution = batchData.destinationDistribution || this._getDefaultData(9);
        this.data.productRanking = batchData.productRanking || this._getDefaultData(10);
        this.data.boxTypeStats = batchData.boxTypeStats || this._getDefaultData(11);
        console.log('[HomeView] 批量数据加载成功');
      }

      // 如果使用缓存且数据为空，尝试后台静默刷新
      const productEmpty = !this.data.productRanking || (Array.isArray(this.data.productRanking) && this.data.productRanking.length === 0);
      const boxTypeEmpty = !this.data.boxTypeStats || (Array.isArray(this.data.boxTypeStats) && this.data.boxTypeStats.length === 0);
      
      if (useCache && (productEmpty || boxTypeEmpty) && !this._secondaryDataAutoRefreshed) {
        this._secondaryDataAutoRefreshed = true;
        console.log('[HomeView] 检测到数据为空，触发后台刷新...');
        // 注意：这里不使用 await，让它在后台跑，不阻塞当前渲染
        this.dashboardService.getProductQuantityRanking(5, false).then(res => {
          if (Array.isArray(res) && res.length > 0) {
            this.data.productRanking = res;
            this.renderDistributionAndRankingCards();
          }
        }).catch(e => console.warn('[HomeView] 后台刷新排名失败', e));

        this.dashboardService.getBoxTypeStats(5, false).then(res => {
          if (Array.isArray(res) && res.length > 0) {
            this.data.boxTypeStats = res;
            this.renderDistributionAndRankingCards();
          }
        }).catch(e => console.warn('[HomeView] 后台刷新箱型失败', e));
      }
    } catch (error) {
      console.error('[HomeView] 批量加载次要数据失败，使用单个API并行加载:', error);
      // 降级：使用单个API并行加载（所有数据一起等待）
      const allRequests = await Promise.allSettled([
        this.dashboardService.getTrends(30, useCache),
        this.dashboardService.getStatusDistribution(useCache),
        this.dashboardService.getCustomerRanking(10, useCache),
        this.dashboardService.getMonthlyComparison(6, useCache),
        this.dashboardService.getYearlyComparison(5, useCache),
        this.dashboardService.getDestinationDistribution(useCache),
        this.dashboardService.getProductQuantityRanking(5, useCache),
        this.dashboardService.getBoxTypeStats(5, useCache)
      ]);

      // 处理所有数据
      this.data.trends = allRequests[0].status === 'fulfilled' ? allRequests[0].value : this._getDefaultData(1);
      this.data.distribution = allRequests[1].status === 'fulfilled' ? allRequests[1].value : this._getDefaultData(2);
      this.data.ranking = allRequests[2].status === 'fulfilled' ? allRequests[2].value : this._getDefaultData(3);
      this.data.comparison = allRequests[3].status === 'fulfilled' ? allRequests[3].value : this._getDefaultData(4);
      this.data.yearlyComparison = allRequests[4].status === 'fulfilled' ? allRequests[4].value : this._getDefaultData(5);
      this.data.destinationDistribution = allRequests[5].status === 'fulfilled' ? allRequests[5].value : this._getDefaultData(9);
      this.data.productRanking = allRequests[6].status === 'fulfilled' ? allRequests[6].value : this._getDefaultData(10);
      this.data.boxTypeStats = allRequests[7].status === 'fulfilled' ? allRequests[7].value : this._getDefaultData(11);
      
      console.log('[HomeView] 降级加载完成，数据:', {
        destinationDistribution: this.data.destinationDistribution?.length,
        productRanking: this.data.productRanking?.length,
        boxTypeStats: this.data.boxTypeStats?.length
      });
    }

    // 渲染图表（如果关键数据已准备好）
    if (this.data.trends && this.data.distribution && this.data.ranking) {
      // 使用 requestIdleCallback 优化渲染时机
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          this.renderCharts();
        }, { timeout: 500 });
      } else {
        requestAnimationFrame(() => {
          this.renderCharts();
        });
      }
    }
  }

  /**
   * 加载实时数据（最后加载，优化：并行加载设置和数据）
   */
  async loadRealtimeData() {
    if (!this.dashboardService) {
      return;
    }

    // 并行加载设置和实时数据（优化：减少等待时间）
    const [settingsResult, activitiesResult, shipmentResult, paymentResult] = await Promise.allSettled([
      this.dashboardService.getShipmentReminderSettings().catch(() => ({ advanceDays: 5 })),
      this.dashboardService.getRecentActivities(false),
      // 先使用默认值，设置加载完成后再更新
      Promise.resolve({ advanceDays: 5 }).then(async (defaultSettings) => {
        const settings = await this.dashboardService.getShipmentReminderSettings().catch(() => defaultSettings);
        const advanceDays = settings?.advanceDays || 5;
        return this.dashboardService.getShipmentReminders(advanceDays, 5, false);
      }),
      this.dashboardService.getPaymentReminders(5, false)
    ]);

    // 更新数据
    const shipmentSettings = settingsResult.status === 'fulfilled' ? settingsResult.value : { advanceDays: 5 };
    const advanceDays = shipmentSettings?.advanceDays || 5;

    if (!this.data) {
      this.data = {};
    }

    this.data.shipmentSettings = shipmentSettings;
    this.data.activities = activitiesResult.status === 'fulfilled' ? activitiesResult.value : this._getDefaultData(6);
    
    // 处理发货提醒数据（兼容后端返回的 snake_case 格式）
    if (shipmentResult.status === 'fulfilled') {
      const rawData = shipmentResult.value;
      // 后端返回格式: { data: [...], advance_days: 5 }
      // 前端期望格式: { orders: [...], advanceDays: 5 }
      this.data.shipmentReminders = {
        orders: (rawData.data || rawData.orders || []).map(item => ({
          contractNo: item.contract_no || item.contractNo,
          shipmentDate: item.shipment_date || item.shipmentDate,
          status: item.status,
          daysUntilShipment: item.days_remaining ?? item.daysUntilShipment ?? item.days_until_shipment
        })),
        total: (rawData.data || rawData.orders || []).length,
        advanceDays: rawData.advance_days ?? rawData.advanceDays ?? advanceDays
      };
    } else {
      this.data.shipmentReminders = { orders: [], total: 0, advanceDays };
    }
    
    // 处理收款提醒数据（兼容后端返回的 snake_case 格式）
    if (paymentResult.status === 'fulfilled') {
      const rawData = paymentResult.value;
      // 后端返回格式: { data: [...], total: n }
      // 前端期望格式: { orders: [...], total: n }
      this.data.paymentReminders = {
        orders: (rawData.data || rawData.orders || []).map(item => ({
          contractNo: item.contract_no || item.contractNo,
          invoiceNo: item.invoice_no || item.invoiceNo,
          shipmentDate: item.shipment_date || item.shipmentDate,
          daysSinceShipment: item.days_since_shipment ?? item.daysSinceShipment,
          totalUSD: item.total_usd ?? item.totalUSD ?? item.total_USD
        })),
        total: rawData.total ?? (rawData.data || rawData.orders || []).length
      };
    } else {
      this.data.paymentReminders = { orders: [], total: 0 };
    }
    
    console.log('[HomeView] 实时数据加载完成:', {
      shipmentReminders: this.data.shipmentReminders,
      paymentReminders: this.data.paymentReminders
    });
  }

  /**
   * 初始化图表懒加载（使用Intersection Observer）
   */
  initLazyChartLoading() {
    if (typeof IntersectionObserver === 'undefined') {
      // 不支持IntersectionObserver，延迟500ms后加载所有图表
      setTimeout(() => {
        if (this.data) {
          this.renderCharts();
        }
      }, 500);
      return;
    }

    const chartContainers = [
      'orderTrendChart',
      'statusDistributionChart',
      'customerRankingChart',
      'monthlyComparisonChart',
      'yearlyComparisonChart'
    ];

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const containerId = entry.target.id;
          observer.unobserve(entry.target);

          // 延迟渲染，避免阻塞
          requestAnimationFrame(() => {
            if (this.data && !this.charts[containerId]) {
              this.renderSingleChart(containerId);
            }
          });
        }
      });
    }, {
      rootMargin: '200px', // 提前200px开始加载
      threshold: 0.01
    });

    chartContainers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        observer.observe(container);
      }
    });

    // 保存observer以便清理
    this.chartObserver = observer;
  }

  /**
   * 渲染单个图表
   * @param {string} containerId - 容器ID
   */
  renderSingleChart(containerId) {
    if (!this.data) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    switch (containerId) {
      case 'orderTrendChart':
        if (this.data.trends && !this.charts.trend) {
          if (container) {
            import('./dashboard-charts.js').then(module => {
              this.charts.trend = module.renderOrderTrendChart(container, this.data.trends, 30);
            }).catch(e => console.error('加载图表模块失败', e));
          }
        }
        break;
      case 'statusDistributionChart':
        if (this.data.distribution && !this.charts.distribution) {
          if (container) {
            import('./dashboard-charts.js').then(module => {
              this.charts.distribution = module.renderStatusDistributionChart(container, this.data.distribution);
            }).catch(e => console.error('加载图表模块失败', e));
          }
        }
        break;
      case 'customerRankingChart':
        if (this.data.ranking && !this.charts.ranking) {
          if (container) {
            import('./dashboard-charts.js').then(module => {
              this.charts.ranking = module.renderCustomerRankingChart(container, this.data.ranking);
            }).catch(e => console.error('加载图表模块失败', e));
          }
        }
        break;
      case 'monthlyComparisonChart':
        if (this.data.comparison && !this.charts.comparison) {
          if (container) {
            import('./dashboard-charts.js').then(module => {
              this.charts.comparison = module.renderMonthlyComparisonChart(container, this.data.comparison);
            }).catch(e => console.error('加载图表模块失败', e));
          }
        }
        break;
      case 'yearlyComparisonChart':
        if (this.data.yearlyComparison && !this.charts.yearlyComparison) {
          if (container) {
            import('./dashboard-charts.js').then(module => {
              this.charts.yearlyComparison = module.renderYearlyComparisonChart(container, this.data.yearlyComparison);
            }).catch(e => console.error('加载图表模块失败', e));
          }
        }
        break;
    }
  }

  /**
   * 加载仪表盘数据（已废弃，使用新的分阶段加载）
   * @deprecated 使用 loadCriticalData, loadSecondaryData, loadRealtimeData 代替
   */
  async loadDashboardData(forceRefresh = false) {
    if (!this.dashboardService) {
      throw new Error('DashboardService 未初始化');
    }

    try {
      const useCache = !forceRefresh;

      // 先加载发货提醒设置
      let shipmentSettings = { advanceDays: 5 };
      try {
        shipmentSettings = await this.dashboardService.getShipmentReminderSettings();
      } catch (error) {
        console.warn('[HomeView] 获取发货提醒设置失败，使用默认值:', error);
      }

      const advanceDays = shipmentSettings?.advanceDays || 5;

      // 第一批：关键数据（立即渲染需要的数据）
      this.updateLoadingProgress(10, '加载关键数据...');
      const criticalResults = await Promise.allSettled([
        this.dashboardService.getStats(useCache),
        this.dashboardService.getTrends(30, useCache),
        this.dashboardService.getStatusDistribution(useCache),
        this.dashboardService.getCustomerRanking(10, useCache)
      ]);

      // 处理关键数据结果
      const [stats, trends, distribution, ranking] = criticalResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          const data = result.value;
          if (data === null || data === undefined) {
            console.warn(`[HomeView] 关键数据为空 (${index})，使用默认值`);
            return this._getDefaultData(index);
          }
          return data;
        } else {
          console.error(`[HomeView] 加载关键数据失败 (${index}):`, result.reason);
          return this._getDefaultData(index);
        }
      });

      // 先设置关键数据，允许部分渲染
      this.data = {
        stats,
        trends,
        distribution,
        ranking,
        shipmentSettings,
        paymentSettings: {
          messageTemplate: localStorage.getItem('payment_reminder_message_template') ||
            '发票号{invoiceNo}订单都发货了{days}天了，还没要到钱呀，快催催别跑路了'
        }
      };

      // 第二批：次要数据（延迟加载）
      this.updateLoadingProgress(50, '加载次要数据...');
      const secondaryResults = await Promise.allSettled([
        this.dashboardService.getMonthlyComparison(6, useCache),
        this.dashboardService.getYearlyComparison(5, useCache),
        this.dashboardService.getDestinationDistribution(useCache),
        this.dashboardService.getProductQuantityRanking(5, useCache),
        this.dashboardService.getBoxTypeStats(5, useCache)
      ]);

      // 第三批：实时数据（不使用缓存）
      this.updateLoadingProgress(80, '加载实时数据...');
      const realtimeResults = await Promise.allSettled([
        this.dashboardService.getRecentActivities(false),
        this.dashboardService.getShipmentReminders(advanceDays, 5, false),
        this.dashboardService.getPaymentReminders(5, false)
      ]);

      // 合并所有结果
      const results = [
        ...criticalResults,
        ...secondaryResults,
        ...realtimeResults
      ];

      // 处理次要数据和实时数据结果
      const [comparison, yearlyComparison, destinationDistribution, productRanking, boxTypeStats, activities, shipmentReminders, paymentReminders] = [
        ...secondaryResults,
        ...realtimeResults
      ].map((result, index) => {
        const actualIndex = index + 4; // 偏移量（前4个是关键数据）
        if (result.status === 'fulfilled') {
          const data = result.value;
          if (data === null || data === undefined) {
            console.warn(`[HomeView] 数据为空 (${actualIndex})，使用默认值`);
            return this._getDefaultData(actualIndex);
          }
          return data;
        } else {
          console.error(`[HomeView] 加载数据失败 (${actualIndex}):`, result.reason);
          return this._getDefaultData(actualIndex);
        }
      });

      // 更新完整数据
      this.data = {
        ...this.data,
        comparison,
        yearlyComparison,
        destinationDistribution,
        productRanking,
        boxTypeStats,
        activities,
        shipmentReminders: shipmentReminders || { orders: [], total: 0, advanceDays },
        paymentReminders: paymentReminders || { orders: [], total: 0 }
      };

      this.updateLoadingProgress(100, '加载完成');
    } catch (error) {
      console.error('[HomeView] 加载数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取默认数据（当请求失败时使用）
   */
  _getDefaultData(index) {
    const defaults = [
      { orders: {}, customers: {}, products: {}, documents: {} }, // 0: stats
      { orderCount: [], orderAmount: [] }, // 1: trends
      {}, // 2: distribution
      [], // 3: ranking
      { months: [], orderCount: [], orderAmount: [] }, // 4: comparison
      { years: [], orderCount: [], orderAmount: [] }, // 5: yearlyComparison
      { orders: [], customers: [], documents: [] }, // 6: activities
      { orders: [], total: 0, advanceDays: 5 }, // 7: shipmentReminders
      { orders: [], total: 0 }, // 8: paymentReminders
      [], // 9: destinationDistribution
      [], // 10: productRanking
      [] // 11: boxTypeStats
    ];
    return defaults[index] || null;
  }

  /**
   * 渲染统计卡片（优化：减少不必要的DOM查询）
   */
  renderStatsCards() {
    const container = document.getElementById('statsGrid');
    if (!container) {
      console.warn('[HomeView] 渲染失败: statsGrid 容器未找到');
      return;
    }
    if (!this.data || !this.data.stats) {
      console.warn('[HomeView] 渲染跳转: 统计数据未准备好', this.data);
      return;
    }

    // 使用 DocumentFragment 优化DOM操作（如果renderStatsCards支持）
    console.log('[HomeView] 正在渲染统计卡片:', this.data.stats);
    renderStatsCards(this.data.stats, container);
  }

  /**
   * 渲染待办提醒卡片
   */
  renderTodoReminder() {
    const todoContainer = document.getElementById('todoReminderCard');
    if (todoContainer) {
      todoContainer.innerHTML = ''; // 清空容器
      renderTodoReminderCard(todoContainer);
    }
  }

  /**
   * 渲染目的港分布和产品排名卡片（在提醒卡片区域）
   */
  renderDistributionAndRankingCards() {
    if (!this.data) {
      console.warn('[HomeView] renderDistributionAndRankingCards: 数据未加载');
      return;
    }

    console.log('[HomeView] renderDistributionAndRankingCards 开始渲染，数据:', {
      destinationDistribution: this.data.destinationDistribution,
      productRanking: this.data.productRanking,
      boxTypeStats: this.data.boxTypeStats
    });

    // 渲染AI秘书卡片
    const aiSecretaryContainer = document.getElementById('aiSecretaryCard');
    if (aiSecretaryContainer) {
      aiSecretaryContainer.innerHTML = ''; // 清空容器
      renderAISecretaryCard(aiSecretaryContainer);
    }

    // 渲染目的港城市分布卡片
    const destinationContainer = document.getElementById('destinationDistributionCard');
    if (destinationContainer) {
      destinationContainer.innerHTML = ''; // 清空容器
      const destData = this.data.destinationDistribution || [];
      console.log('[HomeView] 渲染目的港分布，数据条数:', destData.length);
      renderDestinationDistributionCard(destinationContainer, destData);
    }

    // 渲染产品数量排名卡片
    const productContainer = document.getElementById('productRankingCard');
    if (productContainer) {
      productContainer.innerHTML = ''; // 清空容器
      const productData = this.data.productRanking || [];
      console.log('[HomeView] 渲染产品排名，数据条数:', productData.length);
      renderProductQuantityRankingCard(productContainer, productData);
    }

    // 渲染箱型统计卡片
    const boxTypeContainer = document.getElementById('boxTypeStatsCard');
    if (boxTypeContainer) {
      boxTypeContainer.innerHTML = ''; // 清空容器
      const boxTypeData = this.data.boxTypeStats || [];
      console.log('[HomeView] 渲染箱型统计，数据条数:', boxTypeData.length);
      renderBoxTypeStatsCard(boxTypeContainer, boxTypeData);
    }
  }

  /**
   * 渲染图表
   */
  renderCharts() {
    if (!this.data) {
      return;
    }

    // 销毁旧图表（安全销毁，避免错误）
    Object.values(this.charts).forEach(chart => {
      try {
        if (chart && typeof chart.destroy === 'function') {
          chart.destroy();
        } else if (chart && chart.canvas) {
          // Chart.js 图表，确保清理
          const canvas = chart.canvas;
          if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
          }
        }
      } catch (error) {
        console.warn('[HomeView] 销毁图表失败:', error);
      }
    });
    this.charts = {};

    // 渲染订单趋势图
    const trendContainer = document.getElementById('orderTrendChart');
    if (trendContainer && this.data.trends) {
      // this.charts.trend = renderOrderTrendChart(trendContainer, this.data.trends, 30);
      // 已通过 lazy loading 处理，此处仅保留逻辑或彻底移除
      if (!this.charts.trend) this.renderSingleChart('orderTrendChart');
    }

    // 渲染状态分布图
    const distributionContainer = document.getElementById('statusDistributionChart');
    if (distributionContainer && this.data.distribution) {
      if (!this.charts.distribution) this.renderSingleChart('statusDistributionChart');
    }

    // 渲染客户排行图
    const rankingContainer = document.getElementById('customerRankingChart');
    if (rankingContainer && this.data.ranking) {
      if (!this.charts.ranking) this.renderSingleChart('customerRankingChart');
    }

    // 渲染月度对比图
    const comparisonContainer = document.getElementById('monthlyComparisonChart');
    if (comparisonContainer && this.data.comparison) {
      if (!this.charts.comparison) this.renderSingleChart('monthlyComparisonChart');
    }

    // 渲染年度对比图
    const yearlyComparisonContainer = document.getElementById('yearlyComparisonChart');
    if (yearlyComparisonContainer && this.data.yearlyComparison) {
      if (!this.charts.yearlyComparison) this.renderSingleChart('yearlyComparisonChart');
    }
  }

  /**
   * 渲染快速操作
   */
  renderQuickActions() {
    const container = document.getElementById('quickActions');
    if (!container) {
      return;
    }

    renderQuickActions(container);
  }

  /**
   * 渲染最近操作记录
   */
  renderRecentActivities() {
    const container = document.getElementById('recentActivities');
    if (!container || !this.data) {
      return;
    }

    renderRecentActivities(container, this.data.activities);
  }

  /**
   * 渲染每日话题卡片
   */
  renderDailyTopic() {
    const container = document.getElementById('dailyTopicCard');
    if (!container) {
      return;
    }

    renderDailyTopicCard(container);
  }

  /**
   * 渲染提醒卡片
   */
  renderReminders() {
    if (!this.data) {
      console.warn('[HomeView] 数据未加载，无法渲染提醒卡片');
      return;
    }

    console.log('[HomeView] 渲染提醒卡片，数据:', {
      shipmentReminders: this.data.shipmentReminders,
      paymentReminders: this.data.paymentReminders,
      shipmentSettings: this.data.shipmentSettings
    });

    // 渲染发货提醒
    const shipmentContainer = document.getElementById('shipmentReminderCard');
    if (shipmentContainer) {
      // 确保有 dashboardService
      if (!this.dashboardService) {
        console.error('[HomeView] DashboardService 未初始化，无法设置提醒功能');
        renderShipmentReminder(shipmentContainer, this.data.shipmentReminders, this.data.shipmentSettings, null);
      } else {
        renderShipmentReminder(
          shipmentContainer,
          this.data.shipmentReminders,
          this.data.shipmentSettings,
          async (currentDays) => {
            console.log('[HomeView] 打开设置对话框，当前提前天数:', currentDays);
            try {
              // 直接使用已导入的函数，不需要动态导入
              const { showSettingsDialog } = await import('./dashboard-reminders.js');
              showSettingsDialog(currentDays, async (days) => {
                try {
                  console.log('[HomeView] 保存设置，提前天数:', days);
                  // 保存设置
                  await this.dashboardService.saveShipmentReminderSettings(days);
                  // 刷新提醒数据
                  const reminders = await this.dashboardService.getShipmentReminders(days, 5, false);
                  this.data.shipmentReminders = reminders;
                  this.data.shipmentSettings = { advanceDays: days };
                  // 重新渲染
                  this.renderReminders();
                } catch (error) {
                  console.error('[HomeView] 保存设置失败:', error);
                  if (window.NotificationSystem) {
                    window.NotificationSystem.toast('保存失败，请重试', 'error');
                  }
                }
              });
            } catch (error) {
              console.error('[HomeView] 打开设置对话框失败:', error);
              if (window.NotificationSystem) {
                window.NotificationSystem.toast('打开设置失败', 'error');
              }
            }
          }
        );
      }
    } else {
      console.warn('[HomeView] 发货提醒容器未找到');
    }

    // 渲染收款提醒
    const paymentContainer = document.getElementById('paymentReminderCard');
    if (paymentContainer) {
      renderPaymentReminder(
        paymentContainer,
        this.data.paymentReminders,
        this.data.paymentSettings,
        async (currentTemplate) => {
          console.log('[HomeView] 打开收款提醒设置对话框，当前模板:', currentTemplate);
          try {
            const { showPaymentMessageSettingsDialog } = await import('./dashboard-reminders.js');
            showPaymentMessageSettingsDialog(currentTemplate, async (template) => {
              try {
                console.log('[HomeView] 保存收款提醒消息模板:', template);
                // 保存到localStorage
                localStorage.setItem('payment_reminder_message_template', template);
                // 更新数据
                this.data.paymentSettings = { messageTemplate: template };
                // 重新渲染
                this.renderReminders();
              } catch (error) {
                console.error('[HomeView] 保存设置失败:', error);
                if (window.NotificationSystem) {
                  window.NotificationSystem.toast('保存失败，请重试', 'error');
                }
              }
            });
          } catch (error) {
            console.error('[HomeView] 打开设置对话框失败:', error);
            if (window.NotificationSystem) {
              window.NotificationSystem.toast('打开设置失败', 'error');
            }
          }
        }
      );
    } else {
      console.warn('[HomeView] 收款提醒容器未找到');
    }
  }

  /**
   * 显示加载状态
   */
  showLoading() {
    const loadingEl = document.getElementById('dashboardLoading');
    const errorEl = document.getElementById('dashboardError');
    const container = document.querySelector('.dashboard-container');

    if (loadingEl) {
      loadingEl.style.display = 'flex';
      // 初始化进度条
      const progressBar = loadingEl.querySelector('.loading-progress-bar');
      if (progressBar) {
        progressBar.style.width = '0%';
      }
      const progressText = loadingEl.querySelector('.loading-progress-text');
      if (progressText) {
        progressText.textContent = '初始化...';
      }
    }
    if (errorEl) errorEl.style.display = 'none';
    if (container) {
      container.querySelectorAll('.reminders-grid, .stats-grid, .charts-grid, .actions-grid').forEach(el => {
        el.style.display = 'none';
      });
    }
  }

  /**
   * 更新加载进度
   * @param {number} progress - 进度百分比 (0-100)
   * @param {string} message - 进度消息
   */
  updateLoadingProgress(progress, message = '') {
    const loadingEl = document.getElementById('dashboardLoading');
    if (!loadingEl) return;

    const progressBar = loadingEl.querySelector('.loading-progress-bar');
    const progressText = loadingEl.querySelector('.loading-progress-text');

    if (progressBar) {
      progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
    if (progressText && message) {
      progressText.textContent = message;
    }
  }

  /**
   * 隐藏加载状态
   */
  hideLoading() {
    const loadingEl = document.getElementById('dashboardLoading');
    const container = document.querySelector('.dashboard-container');

    if (loadingEl) loadingEl.style.display = 'none';
    if (container) {
      container.querySelectorAll('.reminders-grid, .stats-grid, .charts-grid, .actions-grid').forEach(el => {
        el.style.display = '';
      });
    }
  }

  /**
   * 显示错误状态
   */
  showError(error) {
    console.error('[HomeView] showError 被调用，错误对象:', error);
    if (error && error.stack) console.error('[HomeView] 错误堆栈:', error.stack);
    const loadingEl = document.getElementById('dashboardLoading');
    const errorEl = document.getElementById('dashboardError');
    const errorMessageEl = document.getElementById('dashboardErrorMessage');
    const container = document.querySelector('.dashboard-container');

    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'flex';
      // 添加强制刷新按钮（如果不存在）
      if (!document.getElementById('btnForceClearRefresh')) {
        const btnGroup = errorEl.querySelector('.error-actions') || errorEl;
        const forceBtn = document.createElement('button');
        forceBtn.id = 'btnForceClearRefresh';
        forceBtn.className = 'btn btn-primary';
        forceBtn.style.marginTop = '15px';
        forceBtn.innerHTML = '🛡️ 清理缓存并强制刷新';
        forceBtn.onclick = () => {
          console.log('[HomeView] 执行强制清理并刷新');
          if (this.dashboardService) this.dashboardService.clearCache();
          window.location.reload();
        };
        btnGroup.appendChild(forceBtn);
      }
    }
    if (container) {
      container.querySelectorAll('.stats-grid, .charts-grid, .actions-grid').forEach(el => {
        el.style.display = 'none';
      });
    }

    if (errorMessageEl) {
      // 更友好的错误提示
      let message = '加载失败，请尝试下方强制刷新';
      if (error && error.message) {
        if (error.message.includes('网络') || error.message.includes('Network')) {
          message = '网络连接失败，请检查网络后重试';
        } else if (error.message.includes('timeout') || error.message.includes('超时')) {
          message = '请求超时，请稍后重试';
        } else {
          message = error.message;
        }
      }
      errorMessageEl.textContent = message;
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 布局设置按钮 - 只有管理员才显示
    const layoutBtn = document.getElementById('btnLayoutSettings');
    const syncBtn = document.getElementById('btnSyncLayoutToDefaults');

    // 检查用户角色，只有管理员才显示布局设置相关按钮
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.role !== 'admin') {
          // 非管理员用户，隐藏布局设置按钮
          if (layoutBtn) {
            layoutBtn.style.display = 'none';
          }
          if (syncBtn) {
            syncBtn.style.display = 'none';
          }
          return; // 非管理员不绑定布局设置相关事件
        }
      } else {
        // 没有用户信息，隐藏按钮
        if (layoutBtn) {
          layoutBtn.style.display = 'none';
        }
        if (syncBtn) {
          syncBtn.style.display = 'none';
        }
        return;
      }
    } catch (e) {
      console.error('[HomeView] 检查用户角色失败:', e);
      // 出错时隐藏按钮
      if (layoutBtn) {
        layoutBtn.style.display = 'none';
      }
      if (syncBtn) {
        syncBtn.style.display = 'none';
      }
      return;
    }

    if (layoutBtn) {
      const newLayoutBtn = layoutBtn.cloneNode(true);
      layoutBtn.parentNode.replaceChild(newLayoutBtn, layoutBtn);

      newLayoutBtn.addEventListener('click', async () => {
        try {
          await toggleLayoutEditingMode();
        } catch (error) {
          console.error('[HomeView] 切换布局设置模式失败:', error);
          if (window.NotificationSystem?.toast) {
            window.NotificationSystem.toast('切换布局设置模式失败', 'error');
          }
        }
      });
    }

    // 同步到默认布局按钮（syncBtn已在上面声明）
    if (syncBtn) {
      const newSyncBtn = syncBtn.cloneNode(true);
      syncBtn.parentNode.replaceChild(newSyncBtn, syncBtn);

      newSyncBtn.addEventListener('click', () => {
        try {
          const confirmed = confirm('确定要将当前保存的布局设置同步到代码中的默认布局吗？\n\n同步后，新用户或清除缓存后将使用您当前的布局作为默认布局。\n\n提示：同步后会显示更新后的代码，请复制并替换文件中的 CARD_CONFIGS 对象。');
          if (confirmed) {
            syncLayoutToDefaults();
          }
        } catch (error) {
          console.error('[HomeView] 同步布局到默认值失败:', error);
          if (window.NotificationSystem?.toast) {
            window.NotificationSystem.toast('同步失败: ' + (error.message || '未知错误'), 'error');
          }
        }
      });
    }

    const refreshBtn = document.getElementById('btnRefreshDashboard');
    if (refreshBtn) {
      // 移除旧的事件监听器，避免重复绑定
      const newRefreshBtn = refreshBtn.cloneNode(true);
      refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);

      // 防抖处理，避免快速点击导致多次刷新
      let refreshTimeout = null;
      newRefreshBtn.addEventListener('click', async () => {
        // 如果正在刷新，忽略点击
        if (newRefreshBtn.disabled) {
          return;
        }

        // 清除之前的定时器
        if (refreshTimeout) {
          clearTimeout(refreshTimeout);
        }

        // 禁用按钮，防止重复点击
        newRefreshBtn.disabled = true;
        const originalText = newRefreshBtn.innerHTML;
        newRefreshBtn.innerHTML = '<span>⏳</span> 刷新中...';

        try {
          // 清除缓存并刷新
          if (this.dashboardService) {
            this.dashboardService.clearCache();
          }
          await this.render(true);
        } catch (error) {
          console.error('[HomeView] 刷新失败:', error);
          if (window.NotificationSystem?.toast) {
            window.NotificationSystem.toast('刷新失败，请重试', 'error');
          }
        } finally {
          // 恢复按钮状态
          refreshTimeout = setTimeout(() => {
            newRefreshBtn.disabled = false;
            newRefreshBtn.innerHTML = originalText;
          }, 500);
        }
      });
    }

    // 添加重试按钮事件（防抖处理）
    const retryBtn = document.getElementById('btnRetryLoadDashboard');
    if (retryBtn) {
      let retryTimeout = null;
      retryBtn.addEventListener('click', async () => {
        if (retryBtn.disabled) {
          return;
        }

        if (retryTimeout) {
          clearTimeout(retryTimeout);
        }

        retryBtn.disabled = true;
        const originalText = retryBtn.innerHTML;
        retryBtn.innerHTML = '⏳ 重试中...';

        try {
          await this.render(true);
        } catch (error) {
          console.error('[HomeView] 重试失败:', error);
        } finally {
          retryTimeout = setTimeout(() => {
            retryBtn.disabled = false;
            retryBtn.innerHTML = originalText;
          }, 500);
        }
      });
    }
  }

  /**
   * 清理资源（防止内存泄漏）
   */
  destroy() {
    // 清理图表Observer
    if (this.chartObserver) {
      this.chartObserver.disconnect();
      this.chartObserver = null;
    }

    // 清理所有图表
    Object.values(this.charts).forEach(chart => {
      try {
        if (chart && typeof chart.destroy === 'function') {
          chart.destroy();
        } else if (chart && chart.canvas) {
          const canvas = chart.canvas;
          if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
          }
        }
      } catch (error) {
        console.warn('[HomeView] 销毁图表失败:', error);
      }
    });
    this.charts = {};

    // 清理数据引用
    this.data = null;
  }
}

