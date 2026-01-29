/**
 * 出口统计视图
 * 显示订单的出口统计信息
 */
import { fmtMoney, fmtDateYMD, escapeHtml } from '../../utils/format-utils.js';
import { eventManager } from '../../utils/event-manager.js';
import { timerManager } from '../../utils/timer-manager.js';

export class ExportStatisticsView {
  constructor(options = {}) {
    this.stateManager = options.stateManager || null;
    this.apiService = options.apiService || (window.ApiService || null);
    this.orders = [];
    this.filteredOrders = [];
    this.sortField = null;
    this.sortDirection = 'asc';
    this.filters = {
      contractNo: '',
      invoiceNo: '',
      destination: '',
      shipmentDateFrom: '',
      shipmentDateTo: '',
      blNo: ''
    };
    this._isRendering = false; // 防止重复渲染标志
    this._hasRendered = false; // 是否已渲染过
    this.cacheKey = 'analytics.export.orders';
    this.cacheTTL = 2 * 60 * 1000; // 2分钟内的缓存可直接复用
    this._cacheHydrated = false;
    this._shouldBackgroundRefresh = false;
    this._refreshingInBackground = false;
    this._ordersSignature = '';
  }

  /**
   * 渲染出口统计视图
   */
  async render() {
    // 防止重复渲染
    if (this._isRendering) {
      console.log('[出口统计] 正在渲染中，跳过重复调用');
      return;
    }
    
    this._isRendering = true;
    console.log('[出口统计] 开始渲染');
    
    try {
      // 等待DOM元素就绪
      await this.waitForDOMReady();
      
      // 先快速检查state中是否有数据
      let hasStateData = (this.stateManager && this.stateManager.getState('orders')?.length > 0) ||
                         (window.state && window.state.orders?.length > 0);

      if (!hasStateData) {
        const cachedOrders = this.loadOrdersFromCache();
        if (cachedOrders && cachedOrders.length > 0) {
          console.log('[出口统计] 使用 sessionStorage 缓存的订单数据');
          hasStateData = true;
          this._shouldBackgroundRefresh = true;
        }
      }
      
      const tbody = document.getElementById('exportTbody');
      
      // 如果state中有数据，立即加载并渲染，避免显示骨架屏
      if (hasStateData) {
        console.log('[出口统计] state中已有数据，直接使用');
        
        // 立即加载数据（同步操作，因为数据已在state中）
        await this.loadOrders(false);
        
        // 应用筛选和排序
        this.applyFilters();
        this.applySort();
        
        // 立即同步渲染统计卡片和表格，确保同时显示
        this.renderStats();
        this.renderTableSync(); // 使用同步渲染，避免过渡动画和延迟
        
        // 绑定事件（只在第一次渲染时绑定）
        if (!this._hasRendered) {
          this.bindEvents();
        }
        
        // 标记已渲染
        this._hasRendered = true;

        this.maybeRefreshOrdersInBackground();
        
        // 后台异步加载items（不阻塞页面显示）
        // 加载完成后更新表格显示
        this.loadOrderItemsAndUpdate().catch(err => {
          console.warn('[出口统计] 后台加载订单项失败:', err);
        });
      } else {
        console.log('[出口统计] state中无数据，强制重新加载');
        
        // 如果state中没有数据，确保骨架屏可见（HTML中已有初始骨架屏）
        if (tbody) {
          // 确保tbody可见，移除过渡效果，避免抖动
          tbody.style.opacity = '1';
          tbody.style.transition = 'none'; // 移除过渡效果，避免抖动
          // 如果HTML中没有骨架屏，渲染一个
          if (!tbody.querySelector('.skeleton-row')) {
            this.renderSkeleton();
          }
        }
        
        // 先加载基本订单数据（不加载 items，加快初始显示速度）
        await this.loadOrdersBasic(true);
        
        // 应用筛选和排序
        this.applyFilters();
        this.applySort();
        
        // 立即同步渲染统计卡片和表格（使用基本数据，即使没有 items 也能显示部分信息）
        // 使用同步渲染，确保同时显示，避免过渡动画导致的抖动
        this.renderStats();
        this.renderTableSync(); // 使用同步渲染，避免过渡动画和延迟
        
        // 绑定事件（只在第一次渲染时绑定）
        if (!this._hasRendered) {
          this.bindEvents();
        }
        
        // 标记已渲染
        this._hasRendered = true;
        this._shouldBackgroundRefresh = false; // 已强制从API加载
        
        // 后台异步加载 items 数据（不阻塞页面显示）
        // 加载完成后更新表格显示
        this.loadOrderItemsAndUpdate().catch(err => {
          console.warn('[出口统计] 后台加载订单项失败:', err);
        });
      }
    } finally {
      this._isRendering = false;
    }
  }

  /**
   * 等待DOM元素就绪（优化：减少等待时间，立即清空骨架屏）
   */
  async waitForDOMReady() {
    // 先快速检查一次，如果元素已存在则立即返回
    let tbody = document.getElementById('exportTbody');
    let totalOrdersEl = document.getElementById('totalExportOrdersCount');
    
    if (tbody && totalOrdersEl) {
      // 如果state中有数据，立即清空骨架屏，避免闪动和抖动
      const hasStateData = (this.stateManager && this.stateManager.getState('orders')?.length > 0) ||
                           (window.state && window.state.orders?.length > 0);
      if (hasStateData && tbody.querySelector('.skeleton-row')) {
        // 立即停止骨架屏动画并清空，避免抖动
        const skeletonRows = tbody.querySelectorAll('.skeleton-row');
        skeletonRows.forEach(row => {
          row.style.display = 'none';
          const skeletonLines = row.querySelectorAll('.skeleton-line');
          skeletonLines.forEach(line => {
            line.style.animation = 'none';
          });
        });
        // 移除过渡效果
        tbody.style.transition = 'none';
        tbody.style.opacity = '1';
        // 使用 replaceChildren 而不是 innerHTML，避免布局重排
        tbody.replaceChildren(); // 清空所有子节点，比 innerHTML = '' 更平滑
      }
      // 使用微任务立即返回，不等待下一帧
      return;
    }
    
    // 如果元素不存在，进行重试（减少重试次数和间隔，加快响应）
    const maxRetries = 5; // 进一步减少重试次数
    const retryInterval = 20; // 进一步减少重试间隔
    
    for (let i = 0; i < maxRetries; i++) {
      tbody = document.getElementById('exportTbody');
      totalOrdersEl = document.getElementById('totalExportOrdersCount');
      
      if (tbody && totalOrdersEl) {
        // 如果state中有数据，立即清空骨架屏，避免闪动和抖动
        const hasStateData = (this.stateManager && this.stateManager.getState('orders')?.length > 0) ||
                             (window.state && window.state.orders?.length > 0);
        if (hasStateData && tbody.querySelector('.skeleton-row')) {
          // 立即停止骨架屏动画并清空，避免抖动
          const skeletonRows = tbody.querySelectorAll('.skeleton-row');
          skeletonRows.forEach(row => {
            row.style.display = 'none';
            const skeletonLines = row.querySelectorAll('.skeleton-line');
            skeletonLines.forEach(line => {
              line.style.animation = 'none';
            });
          });
          // 移除过渡效果
          tbody.style.transition = 'none';
          tbody.style.opacity = '1';
          // 使用 replaceChildren 而不是 innerHTML，避免布局重排
          tbody.replaceChildren(); // 清空所有子节点，比 innerHTML = '' 更平滑
        }
        console.log('[出口统计] DOM元素已就绪，重试次数:', i);
        return;
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    console.warn('[出口统计] DOM元素等待超时，继续执行');
  }

  /**
   * 加载基本订单数据（不加载 items，加快初始显示速度）
   * @param {boolean} forceReload - 是否强制重新加载（刷新时使用）
   */
  async loadOrdersBasic(forceReload = false) {
    try {
      // 如果强制重新加载，先清空现有数据
      if (forceReload) {
        this.orders = [];
        console.log('[出口统计] 强制重新加载订单数据（基本数据）');
      }
      
      // 先尝试从state中获取数据（可能已经加载过）
      if (!forceReload) {
        if (this.stateManager) {
          this.orders = this.stateManager.getState('orders') || [];
        } else if (window.state) {
          this.orders = window.state.orders || [];
        }
        
        // 如果state中有数据，直接使用
        if (this.orders && this.orders.length > 0) {
          console.log('[出口统计] 从state获取订单数据，共', this.orders.length, '条');
          this._ordersSignature = this.computeOrdersSignature(this.orders);
          return;
        }
      }
      
      // 如果state中没有数据或数据为空，或强制重新加载，则从API加载
      if (forceReload || !this.orders || this.orders.length === 0) {
        // 等待stateManager初始化完成（刷新时可能需要等待）
        await this.waitForStateReady();
        
        if (this.apiService && this.apiService.orders && this.apiService.orders.list) {
          console.log('[出口统计] 从API加载订单数据（基本数据）');
          // 直接使用API返回的数据，而不是从state获取
          const result = await this.apiService.orders.list();
          
          // 处理分页结果对象或数组
          if (Array.isArray(result)) {
            this.orders = result;
          } else if (result && typeof result === 'object' && 'data' in result) {
            // 分页结果格式：{ total, page, pageSize, totalPages, data }
            this.orders = Array.isArray(result.data) ? result.data : [];
            console.log('[出口统计] 分页结果:', {
              total: result.total,
              page: result.page,
              pageSize: result.pageSize,
              dataCount: this.orders.length
            });
          } else {
            console.warn('[出口统计] API返回未知格式:', result);
            this.orders = [];
          }
          
          // 如果stateManager存在，同时更新state（供其他模块使用）
          if (this.orders.length > 0) {
            this.updateSharedState(this.orders);
            this._ordersSignature = this.computeOrdersSignature(this.orders);
            this.saveOrdersToCache(this.orders);
          }
          
          console.log('[出口统计] API返回订单数据，共', this.orders.length, '条');
        }
      }
      
      console.log('[出口统计] 基本订单数据加载完成，共', this.orders.length, '条');
    } catch (error) {
      console.error('[出口统计] 加载订单数据失败:', error);
      window.NotificationSystem?.toast('加载订单数据失败', 'error');
      // 如果加载失败，尝试使用已有的数据
      if (!this.orders || this.orders.length === 0) {
        if (this.stateManager) {
          this.orders = this.stateManager.getState('orders') || [];
        } else if (window.state) {
          this.orders = window.state.orders || [];
        } else {
          this.orders = [];
        }
      }
    }
  }

  /**
   * 加载订单数据（包含 items）
   * @param {boolean} forceReload - 是否强制重新加载（刷新时使用）
   */
  async loadOrders(forceReload = false) {
    try {
      // 如果强制重新加载，先清空现有数据
      if (forceReload) {
        this.orders = [];
        console.log('[出口统计] 强制重新加载订单数据');
      }
      
      // 先尝试从state中获取数据（可能已经加载过）
      if (!forceReload) {
        if (this.stateManager) {
          this.orders = this.stateManager.getState('orders') || [];
        } else if (window.state) {
          this.orders = window.state.orders || [];
        }
        
        // 如果state中有数据，直接使用，不加载items（避免触发重新渲染）
        if (this.orders && this.orders.length > 0) {
          console.log('[出口统计] 从state获取订单数据，共', this.orders.length, '条');
          this._ordersSignature = this.computeOrdersSignature(this.orders);
          // 不在这里加载items，避免触发重新渲染，在render()中后台异步加载
          return;
        }
      }
      
      // 如果state中没有数据或数据为空，或强制重新加载，则从API加载
      if (forceReload || !this.orders || this.orders.length === 0) {
        // 等待stateManager初始化完成（刷新时可能需要等待）
        await this.waitForStateReady();
        
        if (this.apiService && this.apiService.orders && this.apiService.orders.list) {
          console.log('[出口统计] 从API加载订单数据');
          // 直接使用API返回的数据，而不是从state获取
          const result = await this.apiService.orders.list();
          
          // 处理分页结果对象或数组
          if (Array.isArray(result)) {
            this.orders = result;
          } else if (result && typeof result === 'object' && 'data' in result) {
            // 分页结果格式：{ total, page, pageSize, totalPages, data }
            this.orders = Array.isArray(result.data) ? result.data : [];
            console.log('[出口统计] 分页结果:', {
              total: result.total,
              page: result.page,
              pageSize: result.pageSize,
              dataCount: this.orders.length
            });
          } else {
            console.warn('[出口统计] API返回未知格式:', result);
            this.orders = [];
          }
          
          // 如果stateManager存在，同时更新state（供其他模块使用）
          if (this.orders.length > 0) {
            this.updateSharedState(this.orders);
            this._ordersSignature = this.computeOrdersSignature(this.orders);
            this.saveOrdersToCache(this.orders);
          }
          
          console.log('[出口统计] API返回订单数据，共', this.orders.length, '条');
        }
      }
      
      // 加载订单的items数据（如果需要）
      await this.loadOrderItems();
      this._ordersSignature = this.computeOrdersSignature(this.orders);
      this.saveOrdersToCache(this.orders);
      
      console.log('[出口统计] 订单数据加载完成，共', this.orders.length, '条');
    } catch (error) {
      console.error('[出口统计] 加载订单数据失败:', error);
      window.NotificationSystem?.toast('加载订单数据失败', 'error');
      // 如果加载失败，尝试使用已有的数据
      if (!this.orders || this.orders.length === 0) {
        if (this.stateManager) {
          this.orders = this.stateManager.getState('orders') || [];
        } else if (window.state) {
          this.orders = window.state.orders || [];
        } else {
          this.orders = [];
        }
      }
    }
  }

  /**
   * 等待state就绪（优化：减少等待时间）
   */
  async waitForStateReady() {
    // 先快速检查一次
    if ((this.stateManager || window.state) && 
        this.apiService && this.apiService.orders && this.apiService.orders.list) {
      return; // 已就绪，立即返回
    }
    
    // 如果未就绪，进行重试（减少重试次数和间隔）
    const maxRetries = 5; // 减少重试次数
    const retryInterval = 50; // 减少重试间隔
    
    for (let i = 0; i < maxRetries; i++) {
      // 检查stateManager或window.state是否可用
      if (this.stateManager || window.state) {
        // 检查apiService是否可用
        if (this.apiService && this.apiService.orders && this.apiService.orders.list) {
          console.log('[出口统计] State已就绪，重试次数:', i);
          return;
        }
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    console.warn('[出口统计] State等待超时，继续执行');
  }

  /**
   * 加载订单项数据（并行加载，大幅提升速度）
   */
  async loadOrderItems() {
    // 找出需要加载 items 的订单
    const ordersNeedingItems = this.orders.filter(order => 
      !order.items || order.items.length === 0
    );
    
    if (ordersNeedingItems.length === 0) {
      return; // 所有订单都有 items，无需加载
    }
    
    console.log(`[出口统计] 需要加载 ${ordersNeedingItems.length} 个订单的 items 数据`);
    
    // 并行加载所有订单的 items（使用 Promise.all）
    if (this.apiService && this.apiService.orders && this.apiService.orders.get) {
      const loadPromises = ordersNeedingItems.map(async (order) => {
        if (!order.id) return;
        
        try {
          const fullOrder = await this.apiService.orders.get(order.id);
          if (fullOrder && fullOrder.items) {
            order.items = fullOrder.items;
          }
        } catch (error) {
          console.warn('[出口统计] 加载订单项失败:', order.id, error);
        }
      });
      
      // 并行执行所有加载请求
      await Promise.all(loadPromises);
      console.log(`[出口统计] 完成加载 ${ordersNeedingItems.length} 个订单的 items 数据`);
      this._ordersSignature = this.computeOrdersSignature(this.orders);
      this.saveOrdersToCache(this.orders);
    }
  }

  /**
   * 加载订单项数据并更新表格显示
   * 在后台异步执行，不阻塞页面初始渲染
   * 优化：只在数据真正变化时才更新，避免不必要的抖动
   */
  async loadOrderItemsAndUpdate() {
    // 先检查是否有订单需要加载 items
    const ordersNeedingItems = this.orders.filter(order => 
      !order.items || order.items.length === 0
    );
    
    // 如果所有订单都已经有 items，就不需要加载和更新
    if (ordersNeedingItems.length === 0) {
      console.log('[出口统计] 所有订单已有 items 数据，跳过加载和更新，避免抖动');
      return;
    }
    
    // 保存更新前的统计数据，用于比较
    const oldStats = this.calculateAllStats();
    
    // 加载 items 数据
    await this.loadOrderItems();
    
    // 重新应用筛选和排序（因为 items 数据可能影响统计）
    this.applyFilters();
    this.applySort();
    
    // 计算更新后的统计数据
    const newStats = this.calculateAllStats();
    
    // 检查统计数据是否真的发生了变化
    const statsChanged = (
      oldStats.totalQuantity !== newStats.totalQuantity ||
      oldStats.totalNetWeight !== newStats.totalNetWeight ||
      oldStats.totalAmount !== newStats.totalAmount
    );
    
    // 检查表格数据是否发生了变化（比较每个订单的统计）
    let tableDataChanged = false;
    if (this.filteredOrders.length !== oldStats.totalOrders) {
      tableDataChanged = true;
    } else {
      // 检查每个订单的统计是否变化
      for (let i = 0; i < this.filteredOrders.length; i++) {
        const order = this.filteredOrders[i];
        const newOrderStats = this.calculateOrderStats(order);
        const oldOrderStats = oldStats.orderStats?.[i];
        
        // 如果统计值发生变化，说明数据更新了
        if (oldOrderStats && 
            (oldOrderStats.totalQuantity !== newOrderStats.totalQuantity ||
             oldOrderStats.totalNetWeight !== newOrderStats.totalNetWeight)) {
          tableDataChanged = true;
          break;
        }
      }
    }
    
    // 只有在数据真正变化时才更新显示
    if (statsChanged || tableDataChanged) {
      console.log('[出口统计] 数据已更新，刷新显示');
      // 同步更新，确保立即显示，避免延迟导致的抖动
      this.renderStats();
      // 如果表格已经渲染过，使用精细更新方法，只更新变化的单元格
      if (this._hasRendered) {
        this.updateTableCells(); // 精细更新，避免整表重渲染
      } else {
        this.renderTableSync(); // 首次渲染，使用完整渲染
      }
      this._ordersSignature = this.computeOrdersSignature(this.orders);
      this.saveOrdersToCache(this.orders);
    } else {
      console.log('[出口统计] 数据未变化，跳过更新，避免抖动');
    }
  }

  /**
   * 计算所有订单的统计数据（用于比较）
   */
  calculateAllStats() {
    const totalOrders = this.filteredOrders.length;
    let totalAmount = 0;
    let totalQuantity = 0;
    let totalNetWeight = 0;
    const orderStats = [];
    
    this.filteredOrders.forEach(order => {
      totalAmount += Number(order.totalUSD || 0);
      // 检查是否已加载 items
      const hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
      const stats = this.calculateOrderStats(order, hasItems);
      // 只统计已加载的数据
      if (stats.quantityLoaded) {
        totalQuantity += stats.totalQuantity;
      }
      if (stats.weightLoaded) {
        totalNetWeight += stats.totalNetWeight;
      }
      orderStats.push({ ...stats });
    });
    
    return {
      totalOrders,
      totalAmount,
      totalQuantity,
      totalNetWeight,
      orderStats
    };
  }

  /**
   * 计算订单的统计数据
   * @param {Object} order - 订单对象
   * @param {boolean} hasItems - 是否已加载 items（用于判断是否显示占位符）
   */
  calculateOrderStats(order, hasItems = null) {
    // 如果 hasItems 为 null，自动检测
    if (hasItems === null) {
      hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
    }
    
    const items = Array.isArray(order.items) ? order.items : [];
    
    // 数量合计
    let totalQuantity = 0;
    let quantityLoaded = hasItems; // 标记是否已加载
    
    if (hasItems) {
      items.forEach(item => {
        const qty = Number(item.quantity || 0);
        if (Number.isFinite(qty)) {
          totalQuantity += qty;
        }
      });
    }
    
    // 总净重（KGS）
    let totalNetWeight = 0;
    let weightLoaded = hasItems; // 标记是否已加载
    
    if (hasItems) {
      items.forEach(item => {
        const qty = Number(item.quantity || 0);
        const actualWeight = Number(item.actualWeight || 0);
        if (Number.isFinite(qty) && Number.isFinite(actualWeight) && actualWeight > 0) {
          totalNetWeight += Math.round(actualWeight * qty);
        }
      });
    }
    
    // 获取扩展字段
    const extras = order.extras || {};
    const tradeTerm = extras.tradeTerm || '';
    const boxType = extras.boxType || '';
    
    return {
      totalQuantity,
      totalNetWeight,
      tradeTerm,
      boxType,
      quantityLoaded, // 标记数量是否已加载
      weightLoaded    // 标记重量是否已加载
    };
  }

  /**
   * 应用筛选条件
   */
  applyFilters() {
    this.filteredOrders = this.orders.filter(order => {
      // 合同编号筛选
      if (this.filters.contractNo) {
        const contractNo = (order.contractNo || '').toLowerCase();
        if (!contractNo.includes(this.filters.contractNo.toLowerCase())) {
          return false;
        }
      }
      
      // 发票号筛选
      if (this.filters.invoiceNo) {
        const invoiceNo = (order.invoiceNo || '').toLowerCase();
        if (!invoiceNo.includes(this.filters.invoiceNo.toLowerCase())) {
          return false;
        }
      }
      
      // 目的港筛选
      if (this.filters.destination) {
        const shipTo = (order.shipTo || '').toLowerCase();
        if (!shipTo.includes(this.filters.destination.toLowerCase())) {
          return false;
        }
      }
      
      // 发货日期筛选
      if (this.filters.shipmentDateFrom) {
        const shipmentDate = order.shipmentDate || '';
        if (!shipmentDate || shipmentDate < this.filters.shipmentDateFrom) {
          return false;
        }
      }
      
      if (this.filters.shipmentDateTo) {
        const shipmentDate = order.shipmentDate || '';
        if (!shipmentDate || shipmentDate > this.filters.shipmentDateTo) {
          return false;
        }
      }
      
      // 提单号筛选
      if (this.filters.blNo) {
        const blNo = (order.blNo || '').toLowerCase();
        if (!blNo.includes(this.filters.blNo.toLowerCase())) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * 应用排序
   */
  applySort() {
    if (!this.sortField) {
      return;
    }
    
    this.filteredOrders.sort((a, b) => {
      let aVal, bVal;
      
      switch (this.sortField) {
        case 'contractNo':
          aVal = (a.contractNo || '').toLowerCase();
          bVal = (b.contractNo || '').toLowerCase();
          break;
        case 'invoiceNo':
          aVal = (a.invoiceNo || '').toLowerCase();
          bVal = (b.invoiceNo || '').toLowerCase();
          break;
        case 'shipTo':
          aVal = (a.shipTo || '').toLowerCase();
          bVal = (b.shipTo || '').toLowerCase();
          break;
        case 'shipmentDate':
          aVal = a.shipmentDate || '';
          bVal = b.shipmentDate || '';
          break;
        case 'totalQuantity':
          const hasItemsA = !!(a.items && Array.isArray(a.items) && a.items.length > 0);
          const hasItemsB = !!(b.items && Array.isArray(b.items) && b.items.length > 0);
          const statsA = this.calculateOrderStats(a, hasItemsA);
          const statsB = this.calculateOrderStats(b, hasItemsB);
          // 如果未加载，使用 0 进行排序（占位符排在最后）
          aVal = statsA.quantityLoaded ? statsA.totalQuantity : 0;
          bVal = statsB.quantityLoaded ? statsB.totalQuantity : 0;
          break;
        case 'totalNetWeight':
          const hasItemsA2 = !!(a.items && Array.isArray(a.items) && a.items.length > 0);
          const hasItemsB2 = !!(b.items && Array.isArray(b.items) && b.items.length > 0);
          const statsA2 = this.calculateOrderStats(a, hasItemsA2);
          const statsB2 = this.calculateOrderStats(b, hasItemsB2);
          // 如果未加载，使用 0 进行排序（占位符排在最后）
          aVal = statsA2.weightLoaded ? statsA2.totalNetWeight : 0;
          bVal = statsB2.weightLoaded ? statsB2.totalNetWeight : 0;
          break;
        case 'totalUSD':
          aVal = Number(a.totalUSD || 0);
          bVal = Number(b.totalUSD || 0);
          break;
        case 'tradeTerm':
          const extrasA = a.extras || {};
          const extrasB = b.extras || {};
          aVal = (extrasA.tradeTerm || '').toLowerCase();
          bVal = (extrasB.tradeTerm || '').toLowerCase();
          break;
        case 'boxType':
          const extrasA2 = a.extras || {};
          const extrasB2 = b.extras || {};
          aVal = (extrasA2.boxType || '').toLowerCase();
          bVal = (extrasB2.boxType || '').toLowerCase();
          break;
        case 'blNo':
          aVal = (a.blNo || '').toLowerCase();
          bVal = (b.blNo || '').toLowerCase();
          break;
        case 'forwarder':
          aVal = (a.forwarder || '').toLowerCase();
          bVal = (b.forwarder || '').toLowerCase();
          break;
        case 'paymentDueDate':
          const extrasA3 = a.extras || {};
          const extrasB3 = b.extras || {};
          const paymentStatusA = extrasA3.paymentStatus || {};
          const paymentStatusB = extrasB3.paymentStatus || {};
          aVal = paymentStatusA.paymentDueDate || '';
          bVal = paymentStatusB.paymentDueDate || '';
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) {
        return this.sortDirection === 'asc' ? -1 : 1;
      } else if (aVal > bVal) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  /**
   * 渲染统计卡片（优化：同步更新，确保与表格同时显示）
   */
  renderStats() {
    const totalOrders = this.filteredOrders.length;
    let totalAmount = 0;
    let totalQuantity = 0;
    let totalNetWeight = 0;
    
    this.filteredOrders.forEach(order => {
      totalAmount += Number(order.totalUSD || 0);
      // 检查是否已加载 items
      const hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
      const stats = this.calculateOrderStats(order, hasItems);
      // 只统计已加载的数据，避免显示不准确的统计
      if (stats.quantityLoaded) {
        totalQuantity += stats.totalQuantity;
      }
      if (stats.weightLoaded) {
        totalNetWeight += stats.totalNetWeight;
      }
    });
    
    const totalOrdersEl = document.getElementById('totalExportOrdersCount');
    const totalAmountEl = document.getElementById('totalExportAmount');
    const totalQuantityEl = document.getElementById('totalExportQuantity');
    const totalNetWeightEl = document.getElementById('totalExportWeight');
    
    // 直接同步更新，不使用 requestAnimationFrame，确保与表格同时显示
    if (totalOrdersEl) {
      totalOrdersEl.textContent = totalOrders;
    } else {
      console.warn('[出口统计] totalExportOrdersCount 元素未找到');
    }
    
    if (totalAmountEl) {
      totalAmountEl.textContent = '$' + fmtMoney(totalAmount);
    } else {
      console.warn('[出口统计] totalExportAmount 元素未找到');
    }
    
    if (totalQuantityEl) {
      totalQuantityEl.textContent = totalQuantity.toLocaleString();
    } else {
      console.warn('[出口统计] totalExportQuantity 元素未找到');
    }
    
    if (totalNetWeightEl) {
      totalNetWeightEl.textContent = totalNetWeight.toLocaleString();
    } else {
      console.warn('[出口统计] totalExportWeight 元素未找到');
    }
  }

  /**
   * 渲染骨架屏
   */
  renderSkeleton() {
    const tbody = document.getElementById('exportTbody');
    if (!tbody) return;
    
    // 渲染10行骨架屏
    const skeletonRows = Array.from({ length: 10 }).map(() => `
      <tr class="skeleton-row">
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 10px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
      </tr>
    `).join('');
    
    tbody.innerHTML = skeletonRows;
  }

  /**
   * 精细更新表格单元格（只更新变化的单元格，避免整表重渲染造成抖动）
   * 优化：使用 data 属性定位单元格，更精确地更新数量合计和总净重
   */
  updateTableCells() {
    const tbody = document.getElementById('exportTbody');
    if (!tbody) {
      return;
    }
    
    const rows = tbody.querySelectorAll('tr:not(.skeleton-row)');
    
    // 如果行数不匹配，需要重新渲染
    if (rows.length !== this.filteredOrders.length) {
      this.renderTableSync();
      return;
    }
    
    // 只更新变化的单元格（数量合计和总净重）
    this.filteredOrders.forEach((order, index) => {
      const row = rows[index];
      if (!row) return;
      
      // 检查是否已加载 items
      const hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
      const stats = this.calculateOrderStats(order, hasItems);
      const cells = row.querySelectorAll('td');
      
      // 更新数量合计（第5列，索引4）
      if (cells[4]) {
        const quantityCell = cells[4];
        const newValue = stats.quantityLoaded 
          ? stats.totalQuantity.toLocaleString() 
          : '<span style="color: #9ca3af;">-</span>';
        
        // 检查是否需要更新（避免不必要的 DOM 操作）
        const currentText = quantityCell.textContent.trim();
        const expectedText = stats.quantityLoaded 
          ? stats.totalQuantity.toLocaleString() 
          : '-';
        
        if (currentText !== expectedText) {
          // 使用 innerHTML 更新，支持 HTML 内容（占位符）
          quantityCell.innerHTML = newValue;
        }
      }
      
      // 更新总净重（第6列，索引5）
      if (cells[5]) {
        const weightCell = cells[5];
        const newValue = stats.weightLoaded 
          ? stats.totalNetWeight.toLocaleString() 
          : '<span style="color: #9ca3af;">-</span>';
        
        // 检查是否需要更新（避免不必要的 DOM 操作）
        const currentText = weightCell.textContent.trim();
        const expectedText = stats.weightLoaded 
          ? stats.totalNetWeight.toLocaleString() 
          : '-';
        
        if (currentText !== expectedText) {
          // 使用 innerHTML 更新，支持 HTML 内容（占位符）
          weightCell.innerHTML = newValue;
        }
      }
      
      // 更新订单金额颜色和快捷按钮（第7列，索引6）
      if (cells[6]) {
        const extras = order.extras || {};
        const paymentStatus = (extras.paymentStatus || {});
        const paymentDueDate = paymentStatus.paymentDueDate || '';
        const paymentStatusValue = paymentStatus.status || (paymentDueDate ? 'paid' : 'unpaid');
        const colorMap = {
          unpaid: '#1f2937',
          paid: '#dc2626',
          pending: '#2563eb'
        };
        const fontWeight = paymentStatusValue === 'unpaid' ? 'normal' : 'bold';
        const amountColor = colorMap[paymentStatusValue] || '#1f2937';
        
        // 更新内部span的样式，而不是单元格本身（确保垂直对齐）
        const amountSpan = cells[6].querySelector('span');
        if (amountSpan) {
          amountSpan.style.color = amountColor;
          amountSpan.style.fontWeight = fontWeight;
        } else {
          // 如果没有span，更新单元格（兼容旧数据）
          cells[6].style.color = amountColor;
          cells[6].style.fontWeight = fontWeight;
        }
        
        // 更新快捷按钮显示状态
        const quickButton = cells[6].querySelector('.quick-mark-paid-btn');
        if (quickButton) {
          if (paymentStatusValue === 'paid') {
            // 如果已经是已到账，隐藏按钮
            quickButton.style.display = 'none';
          } else {
            // 如果不是已到账，显示按钮（但默认隐藏，鼠标悬停时显示）
            quickButton.style.display = 'inline-block';
          }
        }
      }
      
      // 更新货款到账时间（第8列，索引7）
      if (cells[7]) {
        const extras = order.extras || {};
        const paymentStatus = (extras.paymentStatus || {});
        const paymentDueDate = paymentStatus.paymentDueDate || '';
        const newValue = paymentDueDate ? fmtDateYMD(paymentDueDate) : '-';
        if (cells[7].textContent !== newValue) {
          cells[7].textContent = newValue;
        }
      }
      
      // 更新贸易术语（第9列，索引8）
      if (cells[8]) {
        const newValue = stats.tradeTerm || '-';
        if (cells[8].textContent !== newValue) {
          cells[8].textContent = newValue;
        }
      }
      
      // 更新箱型（第10列，索引9）
      if (cells[9]) {
        const newValue = stats.boxType || '-';
        if (cells[9].textContent !== newValue) {
          cells[9].textContent = newValue;
        }
      }
    });
  }

  /**
   * 渲染表格（同步版本，用于筛选和排序，无过渡效果）
   * 优化：使用 replaceChildren 平滑替换，避免布局重排导致的抖动
   */
  renderTableSync() {
    const tbody = document.getElementById('exportTbody');
    if (!tbody) {
      return;
    }
    
    // 检查是否有骨架屏
    const hasSkeleton = tbody.querySelector('.skeleton-row');
    
    if (this.filteredOrders.length === 0) {
      // 使用 replaceChildren 平滑替换，避免布局重排
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="12" style="text-align: center; padding: 40px; color: #6c757d;">
          <div style="font-size: 16px; margin-bottom: 8px;">📊</div>
          <div>暂无数据</div>
        </td>
      `;
      // 使用 replaceChildren 一次性替换所有子节点，避免布局重排
      tbody.replaceChildren(emptyRow);
      // 如果有骨架屏，确保移除过渡效果
      if (hasSkeleton) {
        tbody.style.transition = 'none';
        tbody.style.opacity = '1';
      }
      return;
    }
    
    // 使用 DocumentFragment 批量构建DOM，减少重绘
    const fragment = document.createDocumentFragment();
    
    this.filteredOrders.forEach(order => {
      // 检查是否已加载 items
      const hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
      const stats = this.calculateOrderStats(order, hasItems);
      const extras = order.extras || {};
      
      // 如果 items 未加载，使用占位符，避免显示 0 导致后续更新时的抖动
      const quantityDisplay = stats.quantityLoaded 
        ? stats.totalQuantity.toLocaleString() 
        : '<span style="color: #9ca3af;">-</span>';
      const weightDisplay = stats.weightLoaded 
        ? stats.totalNetWeight.toLocaleString() 
        : '<span style="color: #9ca3af;">-</span>';
      
      // 获取货款到账时间和状态
      const paymentStatus = (extras.paymentStatus || {});
      const paymentDueDate = paymentStatus.paymentDueDate || '';
      const paymentStatusValue = paymentStatus.status || (paymentDueDate ? 'paid' : 'unpaid');
      
      // 根据状态设置颜色和字体粗细
      const colorMap = {
        unpaid: '#1f2937',    // 黑色
        paid: '#dc2626',      // 红色
        pending: '#2563eb'     // 蓝色
      };
      const fontWeight = paymentStatusValue === 'unpaid' ? 'normal' : 'bold';
      const amountColor = colorMap[paymentStatusValue] || '#1f2937';
      
      // 如果已经是已到账状态，不显示快捷按钮
      const showQuickButton = paymentStatusValue !== 'paid';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${escapeHtml(order.contractNo || '-')}</td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${escapeHtml(order.invoiceNo || '-')}</td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${escapeHtml(order.shipTo || '-')}</td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${order.shipmentDate ? fmtDateYMD(order.shipmentDate) : '-'}</td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;" data-quantity="${order.id || ''}">${quantityDisplay}</td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;" data-weight="${order.id || ''}">${weightDisplay}</td>
        <td class="payment-amount-cell" 
            data-order-id="${order.id || ''}" 
            style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: nowrap; position: relative; cursor: pointer; transition: all 0.2s ease; line-height: 1.5; vertical-align: middle;" 
            onmouseover="this.style.textDecoration='underline'; this.style.opacity='0.8'; const btn = this.querySelector('.quick-mark-paid-btn'); if(btn) { btn.style.opacity='1'; btn.style.visibility='visible'; }" 
            onmouseout="this.style.textDecoration='none'; this.style.opacity='1'; const btn = this.querySelector('.quick-mark-paid-btn'); if(btn) { btn.style.opacity='0'; btn.style.visibility='hidden'; }"
            title="点击设置货款状态">
          <span style="display: inline-block; color: ${amountColor}; font-weight: ${fontWeight}; line-height: 1.5; vertical-align: baseline;">$${fmtMoney(order.totalUSD || 0)}</span>
          ${showQuickButton ? `<button class="quick-mark-paid-btn" 
            data-order-id="${order.id || ''}" 
            style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); padding: 2px 6px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; opacity: 0; visibility: hidden; transition: all 0.2s ease; line-height: 1.2; z-index: 10;"
            onmouseover="this.style.background='#b91c1c'; this.style.transform='translateY(-50%) scale(1.1)';"
            onmouseout="this.style.background='#dc2626'; this.style.transform='translateY(-50%) scale(1)';"
            title="快速标记为已到账">✓</button>` : ''}
        </td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${paymentDueDate ? fmtDateYMD(paymentDueDate) : '-'}</td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${escapeHtml(stats.tradeTerm || '-')}</td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${escapeHtml(stats.boxType || '-')}</td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${escapeHtml(order.blNo || '-')}</td>
        <td style="text-align: center; padding: 10px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${escapeHtml(order.forwarder || '-')}</td>
      `;
      fragment.appendChild(tr);
    });
    
    // 如果有骨架屏，先停止动画并隐藏，避免视觉抖动
    if (hasSkeleton) {
      // 立即停止骨架屏的动画，避免视觉抖动
      const skeletonRows = tbody.querySelectorAll('.skeleton-row');
      skeletonRows.forEach(row => {
        // 停止动画，立即隐藏
        row.style.display = 'none';
        // 停止所有子元素的动画
        const skeletonLines = row.querySelectorAll('.skeleton-line');
        skeletonLines.forEach(line => {
          line.style.animation = 'none';
        });
      });
      // 移除过渡效果
      tbody.style.transition = 'none';
      tbody.style.opacity = '1';
    }
    
    // 使用 replaceChildren 一次性替换所有子节点，避免布局重排
    // 这比 innerHTML = '' 然后 appendChild 更平滑，因为浏览器可以优化这个过程
    tbody.replaceChildren(fragment);
    
    // 绑定订单金额点击事件
    this.bindPaymentAmountClickEvents();
    
    // 绑定快捷标记按钮事件
    this.bindQuickMarkButtons();
    
    // 更新排序图标
    this.updateSortIcons();
  }

  /**
   * 绑定快捷标记按钮事件
   */
  bindQuickMarkButtons() {
    // 使用WeakSet跟踪已绑定的按钮，避免重复绑定
    if (!this._boundQuickButtons) {
      this._boundQuickButtons = new WeakSet();
    }
    
    const quickButtons = document.querySelectorAll('.quick-mark-paid-btn');
    quickButtons.forEach(button => {
      // 如果已经绑定过，跳过
      if (this._boundQuickButtons.has(button)) {
        return;
      }
      
      // 标记为已绑定
      this._boundQuickButtons.add(button);
      
      eventManager.on(button, 'click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const orderId = button.dataset.orderId;
        if (!orderId) {
          console.warn('[出口统计] 订单ID未找到');
          return;
        }
        
        // 查找对应的订单
        const order = this.filteredOrders.find(o => String(o.id) === String(orderId));
        if (!order) {
          window.NotificationSystem?.toast('订单数据未找到', 'error');
          return;
        }
        
        // 确认操作
        const confirmed = window.confirm(`确定要将订单 ${order.contractNo || order.invoiceNo || ''} 标记为"已到账"吗？`);
        if (!confirmed) {
          return;
        }
        
        // 检查当前日期是否早于发货日期
        if (order.shipmentDate) {
          const now = new Date();
          const shipmentDate = new Date(order.shipmentDate);
          
          // 只比较日期部分，忽略时间
          now.setHours(0, 0, 0, 0);
          shipmentDate.setHours(0, 0, 0, 0);
          
          if (now < shipmentDate) {
            window.NotificationSystem?.toast('当前日期早于发货日期，不允许标记为"已到账"。请检查或修改发货时间。', 'error', 3000);
            return;
          }
        }
        
        try {
          // 获取当前日期
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const currentDate = year + '-' + month + '-' + day;
          
          // 构建更新数据
          const paymentData = {
            status: 'paid',
            paymentDueDate: currentDate,
            remark: ''
          };
          
          // 显示加载提示
          button.disabled = true;
          button.textContent = '...';
          
          // 获取完整订单数据（如果需要）
          let fullOrder = order;
          if (!order.items || order.items.length === 0) {
            try {
              fullOrder = await this.apiService.orders.get(orderId);
            } catch (error) {
              console.warn('[出口统计] 获取完整订单数据失败，使用现有数据:', error);
            }
          }
          
          // 构建更新数据
          const updateData = {
            ...fullOrder,
            extras: {
              ...(fullOrder.extras || {}),
              paymentStatus: paymentData
            },
            status: '已完成' // 标记为已到账时，自动更新订单状态为已完成
          };
          
          // 调用API更新订单
          await this.apiService.orders.update(orderId, updateData);
          
          console.log('[出口统计] 快捷标记为已到账成功');
          
          // 清除订单缓存
          if (window.CacheService && window.CacheService.orders) {
            if (typeof window.CacheService.orders.clearItem === 'function') {
              window.CacheService.orders.clearItem(orderId);
            }
            if (typeof window.CacheService.orders.clear === 'function') {
              window.CacheService.orders.clear();
            }
          }
          
          // 触发订单列表刷新事件
          window.dispatchEvent(new CustomEvent('refreshOrdersList', { 
            detail: { orderId } 
          }));
          
          // 显示成功提示
          window.NotificationSystem?.toast('已快速标记为"已到账"', 'success', 1500);
          
          // 重新加载订单数据并刷新表格
          await this.loadOrdersBasic(true);
          this.applyFilters();
          this.applySort();
          this.renderStats();
          this.renderTableSync();
        } catch (error) {
          console.error('[出口统计] 快捷标记失败:', error);
          window.NotificationSystem?.toast('快捷标记失败：' + (error.message || '未知错误'), 'error');
          
          // 恢复按钮状态
          button.disabled = false;
          button.textContent = '✓';
        }
      });
    });
  }

  /**
   * 绑定订单金额点击事件
   */
  bindPaymentAmountClickEvents() {
    const amountCells = document.querySelectorAll('.payment-amount-cell');
    amountCells.forEach(cell => {
      // 移除旧的事件监听器（如果存在）
      const newCell = cell.cloneNode(true);
      cell.parentNode.replaceChild(newCell, cell);
      
      eventManager.on(newCell, 'click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const orderId = newCell.dataset.orderId;
        if (!orderId) {
          console.warn('[出口统计] 订单ID未找到');
          return;
        }
        
        // 查找对应的订单
        const order = this.filteredOrders.find(o => String(o.id) === String(orderId));
        if (!order) {
          window.NotificationSystem?.toast('订单数据未找到', 'error');
          return;
        }
        
        try {
          // 动态加载货款状态弹窗组件
          const { showPaymentStatusDialog } = await import('../../components/dialogs/payment-status-dialog.js');
          await showPaymentStatusDialog(order, this.apiService);
          
          // 弹窗关闭后，重新加载订单数据并刷新表格
          await this.loadOrdersBasic(true);
          this.applyFilters();
          this.applySort();
          this.renderStats();
          this.renderTableSync();
        } catch (error) {
          console.error('[出口统计] 打开货款状态弹窗失败:', error);
          window.NotificationSystem?.toast('打开货款状态弹窗失败', 'error');
        }
      });
    });
  }

  /**
   * 更新排序图标
   */
  updateSortIcons() {
    const headers = document.querySelectorAll('#exportTable thead th[data-sort]');
    headers.forEach(header => {
      const sortIcon = header.querySelector('.sort-icon');
      if (sortIcon) {
        if (header.dataset.sort === this.sortField) {
          sortIcon.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
          sortIcon.style.color = '#3b82f6';
        } else {
          sortIcon.textContent = '⇅';
          sortIcon.style.color = '#6c757d';
        }
      }
    });
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 筛选输入框
    const filterInputs = [
      { id: 'fltExportContractNo', key: 'contractNo' },
      { id: 'fltExportInvoiceNo', key: 'invoiceNo' },
      { id: 'fltExportDestination', key: 'destination' },
      { id: 'fltExportShipmentDateFrom', key: 'shipmentDateFrom' },
      { id: 'fltExportShipmentDateTo', key: 'shipmentDateTo' },
      { id: 'fltExportBlNo', key: 'blNo' }
    ];
    
    filterInputs.forEach(({ id, key }) => {
      const input = document.getElementById(id);
      if (input) {
        // 移除旧的事件监听器（如果存在）
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        
        eventManager.on(newInput, 'input', () => {
          this.filters[key] = newInput.value.trim();
          this.applyFilters();
          this.applySort();
          this.renderStats();
          // 筛选时不需要过渡效果，直接更新
          this.renderTableSync();
        });
      }
    });
    
    // 清空筛选按钮
    const btnClearFilters = document.getElementById('btnClearExportFilters');
    if (btnClearFilters) {
      eventManager.on(btnClearFilters, 'click', () => {
        this.filters = {
          contractNo: '',
          invoiceNo: '',
          destination: '',
          shipmentDateFrom: '',
          shipmentDateTo: '',
          blNo: ''
        };
        
        filterInputs.forEach(({ id }) => {
          const input = document.getElementById(id);
          if (input) input.value = '';
        });
        
        this.applyFilters();
        this.applySort();
        this.renderStats();
        // 清空筛选时不需要过渡效果，直接更新
        this.renderTableSync();
      });
    }
    
    // 筛选区域折叠
    const filterToggleHeader = document.getElementById('exportFilterToggleHeader');
    const filterBody = document.getElementById('exportFilterBody');
    const filterToggleIcon = document.getElementById('exportFilterToggleIcon');
    if (filterToggleHeader && filterBody && filterToggleIcon) {
      eventManager.on(filterToggleHeader, 'click', () => {
        const isOpen = filterBody.style.display !== 'none';
        filterBody.style.display = isOpen ? 'none' : 'block';
        filterToggleIcon.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
      });
    }
    
    // 表格排序
    const sortHeaders = document.querySelectorAll('#exportTable thead th[data-sort]');
    sortHeaders.forEach(header => {
      eventManager.on(header, 'click', () => {
        const field = header.dataset.sort;
        if (this.sortField === field) {
          this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortField = field;
          this.sortDirection = 'asc';
        }
        this.applySort();
        // 排序时不需要过渡效果，直接更新
        this.renderTableSync();
      });
    });
    
    // 导出Excel按钮
    const btnExportExcel = document.getElementById('btnExportStatisticsCsv');
    if (btnExportExcel) {
      eventManager.on(btnExportExcel, 'click', () => {
        this.exportToExcel();
      });
    }
    
    // 监听订单列表刷新事件，自动刷新出口统计
    eventManager.on(window, 'refreshOrdersList', async () => {
      console.log('[出口统计] 收到订单列表刷新事件，刷新数据');
      await this.loadOrdersBasic(true);
      this.applyFilters();
      this.applySort();
      this.renderStats();
      this.renderTableSync();
    });
  }

  /**
   * 导出Excel
   */
  async exportToExcel() {
    if (this.filteredOrders.length === 0) {
      window.NotificationSystem?.toast('没有数据可导出', 'warning');
      return;
    }
    
    try {
      // 动态加载 ExcelJS
      if (!window.ExcelJS) {
        try {
          // 尝试从本地模块导入
          const ExcelJSModule = await import('exceljs');
          window.ExcelJS = ExcelJSModule.default || ExcelJSModule;
          console.log('[出口统计Excel导出] 已从本地模块加载ExcelJS');
        } catch (importError) {
          console.warn('[出口统计Excel导出] 本地模块导入失败，尝试CDN加载:', importError);
          // 如果本地导入失败，尝试CDN（作为备用方案）
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
            s.onload = resolve;
            s.onerror = (err) => {
              console.error('[出口统计Excel导出] CDN加载也失败:', err);
              reject(new Error('无法加载ExcelJS库，请检查网络连接或安装npm依赖: npm install exceljs'));
            };
            document.head.appendChild(s);
          });
        }
      }
      
      // 创建工作簿
      const workbook = new window.ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('出口统计');
      
      // 定义列标题和宽度
      const headers = [
        { header: '合同编号', key: 'contractNo', width: 18 },
        { header: '发票号', key: 'invoiceNo', width: 18 },
        { header: '目的港', key: 'destination', width: 15 },
        { header: '发货日期', key: 'shipmentDate', width: 12 },
        { header: '数量合计', key: 'totalQuantity', width: 12 },
        { header: '总净重/KGS', key: 'totalNetWeight', width: 15 },
        { header: '订单金额', key: 'totalUSD', width: 15 },
        { header: '货款到账时间', key: 'paymentDueDate', width: 15 },
        { header: '贸易术语', key: 'tradeTerm', width: 12 },
        { header: '箱型', key: 'boxType', width: 12 },
        { header: '提单号', key: 'blNo', width: 18 },
        { header: '货代', key: 'forwarder', width: 15 }
      ];
      
      worksheet.columns = headers;
      
      // 设置表头样式
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, size: 12 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 20;
      
      // 添加数据行
      this.filteredOrders.forEach(order => {
        const stats = this.calculateOrderStats(order);
        const extras = order.extras || {};
        const paymentStatus = (extras.paymentStatus || {});
        const paymentDueDate = paymentStatus.paymentDueDate || '';
        
        const row = worksheet.addRow({
          contractNo: order.contractNo || '',
          invoiceNo: order.invoiceNo || '',
          destination: order.shipTo || '',
          shipmentDate: order.shipmentDate ? fmtDateYMD(order.shipmentDate) : '',
          totalQuantity: stats.totalQuantity,
          totalNetWeight: stats.totalNetWeight,
          totalUSD: order.totalUSD || 0,
          paymentDueDate: paymentDueDate ? fmtDateYMD(paymentDueDate) : '',
          tradeTerm: stats.tradeTerm || '',
          boxType: stats.boxType || '',
          blNo: order.blNo || '',
          forwarder: order.forwarder || ''
        });
        
        // 设置数据行样式
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        row.height = 18;
        
        // 设置数字列格式
        row.getCell('totalQuantity').numFmt = '#,##0';
        row.getCell('totalNetWeight').numFmt = '#,##0';
        row.getCell('totalUSD').numFmt = '$#,##0.00';
      });
      
      // 冻结表头
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }
      ];
      
      // 生成Excel文件
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // 生成文件名
      const fileName = `出口统计_${new Date().toISOString().slice(0, 10)}.xlsx`;
      
      // 使用统一文件导出服务（支持 Tauri 文件对话框）
      const { FileExportService } = await import('../../services/file-export-service.js');
      await FileExportService.exportExcel(blob, fileName, {
        successMessage: `Excel导出完成\n文件名: ${fileName}`
      });
    } catch (error) {
      console.error('[出口统计Excel导出] 失败:', error);
      window.NotificationSystem?.toast('Excel导出失败: ' + (error.message || '未知错误'), 'error');
    }
  }

  /**
   * 计算订单数组的签名（用于比对数据是否变化）
   * @param {Array} orders
   * @returns {string}
   */
  computeOrdersSignature(orders = []) {
    if (!Array.isArray(orders) || orders.length === 0) {
      return '';
    }
    try {
      const fingerprint = orders.slice(0, 200).map(order => [
        order.id ?? order.contractNo ?? '',
        order.shipmentDate ?? order.updatedAt ?? '',
        Number(order.totalUSD || 0),
        Array.isArray(order.items) ? order.items.length : 0
      ]);
      return JSON.stringify(fingerprint);
    } catch (error) {
      console.warn('[出口统计] 生成订单签名失败:', error);
      return String(orders.length);
    }
  }

  /**
   * 更新共享状态（stateManager 或 window.state）
   */
  updateSharedState(orders = []) {
    if (!orders || !Array.isArray(orders)) {
      return;
    }
    if (this.stateManager) {
      this.stateManager.setState('orders', orders);
    } else if (window.state) {
      window.state.orders = orders;
    }
  }

  /**
   * 从 sessionStorage 读取缓存的订单数据
   */
  loadOrdersFromCache() {
    if (this._cacheHydrated) {
      return this.orders;
    }
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }
    try {
      const raw = window.sessionStorage.getItem(this.cacheKey);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw);
      if (!payload || !Array.isArray(payload.data) || payload.data.length === 0) {
        return null;
      }
      const timestamp = payload.timestamp || 0;
      if (timestamp && Date.now() - timestamp > this.cacheTTL) {
        console.log('[出口统计] 缓存已过期，忽略');
        return null;
      }
      this.orders = payload.data;
      this._ordersSignature = payload.signature || this.computeOrdersSignature(this.orders);
      this._cacheHydrated = true;
      this.updateSharedState(this.orders);
      return this.orders;
    } catch (error) {
      console.warn('[出口统计] 读取缓存失败:', error);
      return null;
    }
  }

  /**
   * 保存订单数据到 sessionStorage
   */
  saveOrdersToCache(orders = []) {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }
    if (!Array.isArray(orders) || orders.length === 0) {
      return;
    }
    try {
      const payload = {
        timestamp: Date.now(),
        signature: this._ordersSignature || this.computeOrdersSignature(orders),
        data: orders
      };
      window.sessionStorage.setItem(this.cacheKey, JSON.stringify(payload));
    } catch (error) {
      console.warn('[出口统计] 写入缓存失败:', error);
    }
  }

  /**
   * 根据标记按需触发后台刷新
   */
  maybeRefreshOrdersInBackground() {
    if (!this._shouldBackgroundRefresh) {
      return;
    }
    this.refreshOrdersFromApiInBackground();
  }

  /**
   * 从 API 后台刷新订单数据，避免页面闪烁
   */
  async refreshOrdersFromApiInBackground() {
    if (this._refreshingInBackground) {
      return;
    }
    if (!this.apiService || !this.apiService.orders || !this.apiService.orders.list) {
      return;
    }
    this._refreshingInBackground = true;
    try {
      const result = await this.apiService.orders.list();
      let freshOrders = Array.isArray(result) ? result : [];
      if (!Array.isArray(result) && result && Array.isArray(result.data)) {
        freshOrders = result.data;
      }
      if (!freshOrders || freshOrders.length === 0) {
        return;
      }
      const newSignature = this.computeOrdersSignature(freshOrders);
      if (newSignature && newSignature === this._ordersSignature) {
        console.log('[出口统计] 后台刷新数据未变化，跳过重绘');
        return;
      }
      this.orders = freshOrders;
      this._ordersSignature = newSignature;
      this.updateSharedState(this.orders);
      this.saveOrdersToCache(this.orders);
      this.applyFilters();
      this.applySort();
      this.renderStats();
      this.renderTableSync();
      this.loadOrderItemsAndUpdate().catch(err => {
        console.warn('[出口统计] 刷新后加载订单项失败:', err);
      });
    } catch (error) {
      console.warn('[出口统计] 后台刷新订单失败:', error);
    } finally {
      this._refreshingInBackground = false;
      this._shouldBackgroundRefresh = false;
    }
  }
}

