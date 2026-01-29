/**
 * 订单分析视图
 * 显示订单的分析信息
 */
import { fmtMoney, fmtDateYMD, escapeHtml } from '../../utils/format-utils.js';
import { eventManager } from '../../utils/event-manager.js';
import { timerManager } from '../../utils/timer-manager.js';

export class OrderAnalysisView {
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
      customerName: '',
      pickupDateFrom: '',
      pickupDateTo: ''
    };
    this._isRendering = false;
    this._hasRendered = false;
  }

  /**
   * 渲染订单分析视图
   */
  async render() {
    if (this._isRendering) {
      console.log('[订单分析] 正在渲染中，跳过重复调用');
      return;
    }
    
    this._isRendering = true;
    console.log('[订单分析] 开始渲染');
    
    try {
      await this.waitForDOMReady();
      
      const hasStateData = (this.stateManager && this.stateManager.getState('orders')?.length > 0) ||
                           (window.state && window.state.orders?.length > 0);
      
      const tbody = document.getElementById('orderAnalysisTbody');
      
      if (hasStateData) {
        console.log('[订单分析] state中已有数据，直接使用');
        await this.loadOrders(false);
        this.applyFilters();
        this.applySort();
        this.renderStats();
        this.renderTableSync();
        if (!this._hasRendered) {
          this.bindEvents();
        }
        this._hasRendered = true;
        this.loadOrderItemsAndUpdate().catch(err => {
          console.warn('[订单分析] 后台加载订单项失败:', err);
        });
      } else {
        console.log('[订单分析] state中无数据，强制重新加载');
        if (tbody) {
          tbody.style.opacity = '1';
          tbody.style.transition = 'none';
          if (!tbody.querySelector('.skeleton-row')) {
            this.renderSkeleton();
          }
        }
        await this.loadOrdersBasic(true);
        this.applyFilters();
        this.applySort();
        this.renderStats();
        this.renderTableSync();
        if (!this._hasRendered) {
          this.bindEvents();
        }
        this._hasRendered = true;
        this.loadOrderItemsAndUpdate().catch(err => {
          console.warn('[订单分析] 后台加载订单项失败:', err);
        });
      }
    } finally {
      this._isRendering = false;
    }
  }

  /**
   * 等待DOM元素就绪
   */
  async waitForDOMReady() {
    let tbody = document.getElementById('orderAnalysisTbody');
    let totalOrdersEl = document.getElementById('totalOrderAnalysisOrdersCount');
    
    if (tbody && totalOrdersEl) {
      const hasStateData = (this.stateManager && this.stateManager.getState('orders')?.length > 0) ||
                           (window.state && window.state.orders?.length > 0);
      if (hasStateData && tbody.querySelector('.skeleton-row')) {
        const skeletonRows = tbody.querySelectorAll('.skeleton-row');
        skeletonRows.forEach(row => {
          row.style.display = 'none';
          const skeletonLines = row.querySelectorAll('.skeleton-line');
          skeletonLines.forEach(line => {
            line.style.animation = 'none';
          });
        });
        tbody.style.transition = 'none';
        tbody.style.opacity = '1';
        tbody.replaceChildren();
      }
      return;
    }
    
    const maxRetries = 5;
    const retryInterval = 20;
    
    for (let i = 0; i < maxRetries; i++) {
      tbody = document.getElementById('orderAnalysisTbody');
      totalOrdersEl = document.getElementById('totalOrderAnalysisOrdersCount');
      
      if (tbody && totalOrdersEl) {
        const hasStateData = (this.stateManager && this.stateManager.getState('orders')?.length > 0) ||
                             (window.state && window.state.orders?.length > 0);
        if (hasStateData && tbody.querySelector('.skeleton-row')) {
          const skeletonRows = tbody.querySelectorAll('.skeleton-row');
          skeletonRows.forEach(row => {
            row.style.display = 'none';
            const skeletonLines = row.querySelectorAll('.skeleton-line');
            skeletonLines.forEach(line => {
              line.style.animation = 'none';
            });
          });
          tbody.style.transition = 'none';
          tbody.style.opacity = '1';
          tbody.replaceChildren();
        }
        console.log('[订单分析] DOM元素已就绪，重试次数:', i);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    console.warn('[订单分析] DOM元素等待超时，继续执行');
  }

  /**
   * 加载基本订单数据（不加载 items，加快初始显示速度）
   */
  async loadOrdersBasic(forceReload = false) {
    try {
      if (forceReload) {
        this.orders = [];
        console.log('[订单分析] 强制重新加载订单数据（基本数据）');
      }
      
      if (!forceReload) {
        if (this.stateManager) {
          this.orders = this.stateManager.getState('orders') || [];
        } else if (window.state) {
          this.orders = window.state.orders || [];
        }
        
        if (this.orders && this.orders.length > 0) {
          console.log('[订单分析] 从state获取订单数据，共', this.orders.length, '条');
          return;
        }
      }
      
      if (forceReload || !this.orders || this.orders.length === 0) {
        await this.waitForStateReady();
        
        if (this.apiService && this.apiService.orders && this.apiService.orders.list) {
          console.log('[订单分析] 从API加载订单数据（基本数据）');
          const result = await this.apiService.orders.list();
          
          if (Array.isArray(result)) {
            this.orders = result;
          } else if (result && typeof result === 'object' && 'data' in result) {
            this.orders = Array.isArray(result.data) ? result.data : [];
            console.log('[订单分析] 分页结果:', {
              total: result.total,
              page: result.page,
              pageSize: result.pageSize,
              dataCount: this.orders.length
            });
          } else {
            console.warn('[订单分析] API返回未知格式:', result);
            this.orders = [];
          }
          
          if (this.stateManager && this.orders.length > 0) {
            this.stateManager.setState('orders', this.orders);
          } else if (window.state && this.orders.length > 0) {
            window.state.orders = this.orders;
          }
          
          console.log('[订单分析] API返回订单数据，共', this.orders.length, '条');
        }
      }
      
      console.log('[订单分析] 基本订单数据加载完成，共', this.orders.length, '条');
    } catch (error) {
      console.error('[订单分析] 加载订单数据失败:', error);
      window.NotificationSystem?.toast('加载订单数据失败', 'error');
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
   */
  async loadOrders(forceReload = false) {
    try {
      if (forceReload) {
        this.orders = [];
        console.log('[订单分析] 强制重新加载订单数据');
      }
      
      if (!forceReload) {
        if (this.stateManager) {
          this.orders = this.stateManager.getState('orders') || [];
        } else if (window.state) {
          this.orders = window.state.orders || [];
        }
        
        if (this.orders && this.orders.length > 0) {
          console.log('[订单分析] 从state获取订单数据，共', this.orders.length, '条');
          return;
        }
      }
      
      if (forceReload || !this.orders || this.orders.length === 0) {
        await this.waitForStateReady();
        
        if (this.apiService && this.apiService.orders && this.apiService.orders.list) {
          console.log('[订单分析] 从API加载订单数据');
          const result = await this.apiService.orders.list();
          
          if (Array.isArray(result)) {
            this.orders = result;
          } else if (result && typeof result === 'object' && 'data' in result) {
            this.orders = Array.isArray(result.data) ? result.data : [];
          } else {
            this.orders = [];
          }
          
          if (this.stateManager && this.orders.length > 0) {
            this.stateManager.setState('orders', this.orders);
          } else if (window.state && this.orders.length > 0) {
            window.state.orders = this.orders;
          }
        }
      }
      
      await this.loadOrderItems();
      
      console.log('[订单分析] 订单数据加载完成，共', this.orders.length, '条');
    } catch (error) {
      console.error('[订单分析] 加载订单数据失败:', error);
      window.NotificationSystem?.toast('加载订单数据失败', 'error');
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
   * 等待state就绪
   */
  async waitForStateReady() {
    if ((this.stateManager || window.state) && 
        this.apiService && this.apiService.orders && this.apiService.orders.list) {
      return;
    }
    
    const maxRetries = 5;
    const retryInterval = 50;
    
    for (let i = 0; i < maxRetries; i++) {
      if (this.stateManager || window.state) {
        if (this.apiService && this.apiService.orders && this.apiService.orders.list) {
          console.log('[订单分析] State已就绪，重试次数:', i);
          return;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    console.warn('[订单分析] State等待超时，继续执行');
  }

  /**
   * 加载订单项数据
   */
  async loadOrderItems() {
    const ordersNeedingItems = this.orders.filter(order => 
      !order.items || order.items.length === 0
    );
    
    if (ordersNeedingItems.length === 0) {
      return;
    }
    
    console.log(`[订单分析] 需要加载 ${ordersNeedingItems.length} 个订单的 items 数据`);
    
    if (this.apiService && this.apiService.orders && this.apiService.orders.get) {
      const loadPromises = ordersNeedingItems.map(async (order) => {
        if (!order.id) return;
        
        try {
          const fullOrder = await this.apiService.orders.get(order.id);
          if (fullOrder && fullOrder.items) {
            order.items = fullOrder.items;
          }
        } catch (error) {
          console.warn('[订单分析] 加载订单项失败:', order.id, error);
        }
      });
      
      await Promise.all(loadPromises);
      console.log(`[订单分析] 完成加载 ${ordersNeedingItems.length} 个订单的 items 数据`);
    }
  }

  /**
   * 加载订单项数据并更新表格显示
   */
  async loadOrderItemsAndUpdate() {
    const ordersNeedingItems = this.orders.filter(order => 
      !order.items || order.items.length === 0
    );
    
    if (ordersNeedingItems.length === 0) {
      console.log('[订单分析] 所有订单已有 items 数据，跳过加载和更新');
      return;
    }
    
    const oldStats = this.calculateAllStats();
    
    await this.loadOrderItems();
    
    this.applyFilters();
    this.applySort();
    
    const newStats = this.calculateAllStats();
    
    const statsChanged = (
      oldStats.totalQuantity !== newStats.totalQuantity ||
      oldStats.totalNetWeight !== newStats.totalNetWeight ||
      oldStats.totalAmount !== newStats.totalAmount
    );
    
    let tableDataChanged = false;
    if (this.filteredOrders.length !== oldStats.totalOrders) {
      tableDataChanged = true;
    } else {
      for (let i = 0; i < this.filteredOrders.length; i++) {
        const order = this.filteredOrders[i];
        const newOrderStats = this.calculateOrderStats(order);
        const oldOrderStats = oldStats.orderStats?.[i];
        
        if (oldOrderStats && 
            (oldOrderStats.totalQuantity !== newOrderStats.totalQuantity ||
             oldOrderStats.totalNetWeight !== newOrderStats.totalNetWeight)) {
          tableDataChanged = true;
          break;
        }
      }
    }
    
    if (statsChanged || tableDataChanged) {
      console.log('[订单分析] 数据已更新，刷新显示');
      this.renderStats();
      if (this._hasRendered) {
        this.updateTableCells();
      } else {
        this.renderTableSync();
      }
    } else {
      console.log('[订单分析] 数据未变化，跳过更新');
    }
  }

  /**
   * 计算所有订单的统计数据
   */
  calculateAllStats() {
    const totalOrders = this.filteredOrders.length;
    let totalAmount = 0;
    let totalQuantity = 0;
    let totalNetWeight = 0;
    const orderStats = [];
    
    this.filteredOrders.forEach(order => {
      totalAmount += Number(order.totalUSD || 0);
      const hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
      const stats = this.calculateOrderStats(order, hasItems);
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
   */
  calculateOrderStats(order, hasItems = null) {
    if (hasItems === null) {
      hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
    }
    
    const items = Array.isArray(order.items) ? order.items : [];
    
    let totalQuantity = 0;
    let quantityLoaded = hasItems;
    
    if (hasItems) {
      items.forEach(item => {
        const qty = Number(item.quantity || 0);
        if (Number.isFinite(qty)) {
          totalQuantity += qty;
        }
      });
    }
    
    let totalNetWeight = 0;
    let weightLoaded = hasItems;
    
    if (hasItems) {
      items.forEach(item => {
        const qty = Number(item.quantity || 0);
        const actualWeight = Number(item.actualWeight || 0);
        if (Number.isFinite(qty) && Number.isFinite(actualWeight) && actualWeight > 0) {
          totalNetWeight += Math.round(actualWeight * qty);
        }
      });
    }
    
    const extras = order.extras || {};
    const boxType = extras.boxType || '';
    
    return {
      totalQuantity,
      totalNetWeight,
      boxType,
      quantityLoaded,
      weightLoaded
    };
  }

  /**
   * 格式化产品型号和数量（分开显示，但行数对应）
   * 返回 { products: string, quantities: string }
   */
  formatProductsAndQuantities(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    
    if (!items || items.length === 0) {
      return {
        products: '<span style="color: #9ca3af;">-</span>',
        quantities: '<span style="color: #9ca3af;">-</span>'
      };
    }
    
    // 按产品型号分组并统计数量
    const productMap = new Map();
    
    items.forEach((item) => {
      const model = item.model || item.productModel || item.product || '';
      const quantity = Number(item.quantity || item.qty || 0);
      
      if (model && model.trim() && Number.isFinite(quantity) && quantity > 0) {
        const modelKey = model.trim();
        if (productMap.has(modelKey)) {
          productMap.set(modelKey, productMap.get(modelKey) + quantity);
        } else {
          productMap.set(modelKey, quantity);
        }
      }
    });
    
    if (productMap.size === 0) {
      return {
        products: '<span style="color: #9ca3af;">-</span>',
        quantities: '<span style="color: #9ca3af;">-</span>'
      };
    }
    
    // 格式化为多行显示，确保产品型号和数量行数一致
    const entries = Array.from(productMap.entries());
    const productsLines = entries.map(([model]) => escapeHtml(model));
    const quantitiesLines = entries.map(([, totalQty]) => `${totalQty}条`);
    
    return {
      products: productsLines.join('<br>'),
      quantities: quantitiesLines.join('<br>')
    };
  }

  /**
   * 格式化产品型号（多行显示）
   */
  formatProducts(order) {
    const result = this.formatProductsAndQuantities(order);
    return result.products;
  }

  /**
   * 格式化产品数量（多行显示）
   */
  formatQuantities(order) {
    const result = this.formatProductsAndQuantities(order);
    return result.quantities;
  }

  /**
   * 应用筛选条件
   */
  applyFilters() {
    this.filteredOrders = this.orders.filter(order => {
      if (this.filters.contractNo) {
        const contractNo = (order.contractNo || '').toLowerCase();
        if (!contractNo.includes(this.filters.contractNo.toLowerCase())) {
          return false;
        }
      }
      
      if (this.filters.invoiceNo) {
        const invoiceNo = (order.invoiceNo || '').toLowerCase();
        if (!invoiceNo.includes(this.filters.invoiceNo.toLowerCase())) {
          return false;
        }
      }
      
      if (this.filters.customerName) {
        const customerName = (order.customerName || '').toLowerCase();
        if (!customerName.includes(this.filters.customerName.toLowerCase())) {
          return false;
        }
      }
      
      if (this.filters.pickupDateFrom) {
        const extras = order.extras || {};
        const pickupDate = extras.pickupDate || '';
        if (!pickupDate || pickupDate < this.filters.pickupDateFrom) {
          return false;
        }
      }
      
      if (this.filters.pickupDateTo) {
        const extras = order.extras || {};
        const pickupDate = extras.pickupDate || '';
        if (!pickupDate || pickupDate > this.filters.pickupDateTo) {
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
        case 'customerName':
          aVal = (a.customerName || '').toLowerCase();
          bVal = (b.customerName || '').toLowerCase();
          break;
        case 'products':
          const itemsA = Array.isArray(a.items) ? a.items : [];
          const itemsB = Array.isArray(b.items) ? b.items : [];
          const modelsA = new Set(itemsA.map(item => (item.model || item.productModel || item.product || '').trim()).filter(m => m));
          const modelsB = new Set(itemsB.map(item => (item.model || item.productModel || item.product || '').trim()).filter(m => m));
          aVal = Array.from(modelsA).sort().join(' ');
          bVal = Array.from(modelsB).sort().join(' ');
          break;
        case 'quantity':
          const hasItemsA = !!(a.items && Array.isArray(a.items) && a.items.length > 0);
          const hasItemsB = !!(b.items && Array.isArray(b.items) && b.items.length > 0);
          const statsA = this.calculateOrderStats(a, hasItemsA);
          const statsB = this.calculateOrderStats(b, hasItemsB);
          aVal = statsA.quantityLoaded ? statsA.totalQuantity : 0;
          bVal = statsB.quantityLoaded ? statsB.totalQuantity : 0;
          break;
        case 'netWeight':
          const hasItemsA2 = !!(a.items && Array.isArray(a.items) && a.items.length > 0);
          const hasItemsB2 = !!(b.items && Array.isArray(b.items) && b.items.length > 0);
          const statsA2 = this.calculateOrderStats(a, hasItemsA2);
          const statsB2 = this.calculateOrderStats(b, hasItemsB2);
          aVal = statsA2.weightLoaded ? statsA2.totalNetWeight : 0;
          bVal = statsB2.weightLoaded ? statsB2.totalNetWeight : 0;
          break;
        case 'boxType':
          const extrasA = a.extras || {};
          const extrasB = b.extras || {};
          aVal = (extrasA.boxType || '').toLowerCase();
          bVal = (extrasB.boxType || '').toLowerCase();
          break;
        case 'tradeMode':
          aVal = '一般贸易';
          bVal = '一般贸易';
          break;
        case 'pickupDate':
          const extrasA2 = a.extras || {};
          const extrasB2 = b.extras || {};
          aVal = extrasA2.pickupDate || '';
          bVal = extrasB2.pickupDate || '';
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
   * 渲染统计卡片
   */
  renderStats() {
    const totalOrders = this.filteredOrders.length;
    let totalAmount = 0;
    let totalQuantity = 0;
    let totalNetWeight = 0;
    
    this.filteredOrders.forEach(order => {
      totalAmount += Number(order.totalUSD || 0);
      const hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
      const stats = this.calculateOrderStats(order, hasItems);
      if (stats.quantityLoaded) {
        totalQuantity += stats.totalQuantity;
      }
      if (stats.weightLoaded) {
        totalNetWeight += stats.totalNetWeight;
      }
    });
    
    const totalOrdersEl = document.getElementById('totalOrderAnalysisOrdersCount');
    const totalAmountEl = document.getElementById('totalOrderAnalysisAmount');
    const totalQuantityEl = document.getElementById('totalOrderAnalysisQuantity');
    const totalNetWeightEl = document.getElementById('totalOrderAnalysisWeight');
    
    if (totalOrdersEl) {
      totalOrdersEl.textContent = totalOrders;
    }
    
    if (totalAmountEl) {
      totalAmountEl.textContent = '$' + fmtMoney(totalAmount);
    }
    
    if (totalQuantityEl) {
      totalQuantityEl.textContent = totalQuantity.toLocaleString();
    }
    
    if (totalNetWeightEl) {
      totalNetWeightEl.textContent = totalNetWeight.toLocaleString();
    }
  }

  /**
   * 渲染骨架屏
   */
  renderSkeleton() {
    const tbody = document.getElementById('orderAnalysisTbody');
    if (!tbody) return;
    
    const skeletonRows = Array.from({ length: 10 }).map(() => `
      <tr class="skeleton-row">
        <td style="text-align: center; padding: 8px 6px;"><div class="skeleton-line" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 8px 6px;"><div class="skeleton-line" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 8px 6px;"><div class="skeleton-line" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 8px 6px;"><div class="skeleton-line" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 8px 6px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 8px 6px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 8px 6px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 8px 6px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
        <td style="text-align: center; padding: 8px 6px;"><div class="skeleton-line short" style="margin: 0 auto;"></div></td>
      </tr>
    `).join('');
    
    tbody.innerHTML = skeletonRows;
  }

  /**
   * 精细更新表格单元格
   */
  updateTableCells() {
    const tbody = document.getElementById('orderAnalysisTbody');
    if (!tbody) {
      return;
    }
    
    const rows = tbody.querySelectorAll('tr:not(.skeleton-row)');
    
    if (rows.length !== this.filteredOrders.length) {
      this.renderTableSync();
      return;
    }
    
    this.filteredOrders.forEach((order, index) => {
      const row = rows[index];
      if (!row) return;
      
      const hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
      const stats = this.calculateOrderStats(order, hasItems);
      const cells = row.querySelectorAll('td');
      
      // 更新产品型号（第4列，索引3）
      if (cells[3]) {
        const newProductsDisplay = this.formatProducts(order);
        const currentHTML = cells[3].innerHTML;
        if (currentHTML !== newProductsDisplay) {
          cells[3].innerHTML = newProductsDisplay;
        }
      }
      
      // 更新数量（第5列，索引4）
      if (cells[4]) {
        const newQuantitiesDisplay = this.formatQuantities(order);
        const currentHTML = cells[4].innerHTML;
        if (currentHTML !== newQuantitiesDisplay) {
          cells[4].innerHTML = newQuantitiesDisplay;
        }
      }
      
      // 更新净重（第6列，索引5）
      if (cells[5]) {
        const newValue = stats.weightLoaded 
          ? stats.totalNetWeight.toLocaleString() 
          : '<span style="color: #9ca3af;">-</span>';
        const currentText = cells[5].textContent.trim();
        const expectedText = stats.weightLoaded 
          ? stats.totalNetWeight.toLocaleString() 
          : '-';
        
        if (currentText !== expectedText) {
          cells[5].innerHTML = newValue;
        }
      }
    });
  }

  /**
   * 渲染表格（同步版本）
   */
  renderTableSync() {
    const tbody = document.getElementById('orderAnalysisTbody');
    if (!tbody) {
      return;
    }
    
    const hasSkeleton = tbody.querySelector('.skeleton-row');
    
      if (this.filteredOrders.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="9" style="text-align: center; padding: 30px; color: #6c757d;">
          <div style="font-size: 14px; margin-bottom: 6px;">📊</div>
          <div style="font-size: 13px;">暂无数据</div>
        </td>
      `;
      tbody.replaceChildren(emptyRow);
      if (hasSkeleton) {
        tbody.style.transition = 'none';
        tbody.style.opacity = '1';
      }
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    this.filteredOrders.forEach(order => {
      const hasItems = !!(order.items && Array.isArray(order.items) && order.items.length > 0);
      const stats = this.calculateOrderStats(order, hasItems);
      const extras = order.extras || {};
      
      const weightDisplay = stats.weightLoaded 
        ? stats.totalNetWeight.toLocaleString() 
        : '<span style="color: #9ca3af;">-</span>';
      
      // 格式化产品型号和数量（分开显示）
      const productsDisplay = this.formatProducts(order);
      const quantitiesDisplay = this.formatQuantities(order);
      const pickupDate = extras.pickupDate ? fmtDateYMD(extras.pickupDate) : '-';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center; padding: 8px 6px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 12px;">${escapeHtml(order.contractNo || '-')}</td>
        <td style="text-align: center; padding: 8px 6px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 12px;">${escapeHtml(order.invoiceNo || '-')}</td>
        <td style="text-align: center; padding: 8px 6px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 12px;">${escapeHtml(order.customerName || '-')}</td>
        <td style="text-align: left; padding: 8px 6px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 11px; line-height: 1.5;">${productsDisplay}</td>
        <td style="text-align: center; padding: 8px 6px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 11px; line-height: 1.5;">${quantitiesDisplay}</td>
        <td style="text-align: center; padding: 8px 6px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 12px;" data-weight="${order.id || ''}">${weightDisplay}</td>
        <td style="text-align: center; padding: 8px 6px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 12px;">${escapeHtml(stats.boxType || '-')}</td>
        <td style="text-align: center; padding: 8px 6px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 12px;">一般贸易</td>
        <td style="text-align: center; padding: 8px 6px; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; font-size: 12px;">${pickupDate}</td>
      `;
      fragment.appendChild(tr);
    });
    
    if (hasSkeleton) {
      const skeletonRows = tbody.querySelectorAll('.skeleton-row');
      skeletonRows.forEach(row => {
        row.style.display = 'none';
        const skeletonLines = row.querySelectorAll('.skeleton-line');
        skeletonLines.forEach(line => {
          line.style.animation = 'none';
        });
      });
      tbody.style.transition = 'none';
      tbody.style.opacity = '1';
    }
    
    tbody.replaceChildren(fragment);
    
    this.updateSortIcons();
  }

  /**
   * 更新排序图标
   */
  updateSortIcons() {
    const headers = document.querySelectorAll('#orderAnalysisTable thead th[data-sort]');
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
    const filterInputs = [
      { id: 'fltOrderAnalysisContractNo', key: 'contractNo' },
      { id: 'fltOrderAnalysisInvoiceNo', key: 'invoiceNo' },
      { id: 'fltOrderAnalysisCustomerName', key: 'customerName' },
      { id: 'fltOrderAnalysisPickupDateFrom', key: 'pickupDateFrom' },
      { id: 'fltOrderAnalysisPickupDateTo', key: 'pickupDateTo' }
    ];
    
    filterInputs.forEach(({ id, key }) => {
      const input = document.getElementById(id);
      if (input) {
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        eventManager.on(newInput, 'input', () => {
          this.filters[key] = newInput.value.trim();
          this.applyFilters();
          this.applySort();
          this.renderStats();
          this.renderTableSync();
        });
      }
    });
    
    const btnClearFilters = document.getElementById('btnClearOrderAnalysisFilters');
    if (btnClearFilters) {
      eventManager.on(btnClearFilters, 'click', () => {
        this.filters = { contractNo: '', invoiceNo: '', customerName: '', pickupDateFrom: '', pickupDateTo: '' };
        filterInputs.forEach(({ id }) => {
          const input = document.getElementById(id);
          if (input) input.value = '';
        });
        this.applyFilters();
        this.applySort();
        this.renderStats();
        this.renderTableSync();
      });
    }
    
    const filterToggleHeader = document.getElementById('orderAnalysisFilterToggleHeader');
    const filterBody = document.getElementById('orderAnalysisFilterBody');
    const filterToggleIcon = document.getElementById('orderAnalysisFilterToggleIcon');
    if (filterToggleHeader && filterBody && filterToggleIcon) {
      eventManager.on(filterToggleHeader, 'click', () => {
        const isOpen = filterBody.style.display !== 'none';
        filterBody.style.display = isOpen ? 'none' : 'block';
        filterToggleIcon.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
      });
    }
    
    const sortHeaders = document.querySelectorAll('#orderAnalysisTable thead th[data-sort]');
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
        this.renderTableSync();
      });
    });
    
    const btnExportExcel = document.getElementById('btnExportOrderAnalysisCsv');
    if (btnExportExcel) {
      eventManager.on(btnExportExcel, 'click', () => {
        this.exportToExcel();
      });
    }
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
      if (!window.ExcelJS) {
        try {
          const ExcelJSModule = await import('exceljs');
          window.ExcelJS = ExcelJSModule.default || ExcelJSModule;
        } catch (importError) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
      }
      
      const workbook = new window.ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('订单分析');
      
      worksheet.columns = [
        { header: '合同号', key: 'contractNo', width: 18 },
        { header: '发票号', key: 'invoiceNo', width: 18 },
        { header: '客户名称', key: 'customerName', width: 20 },
        { header: '产品型号', key: 'products', width: 35 },
        { header: '数量', key: 'quantity', width: 15 },
        { header: '净重(KGS)', key: 'netWeight', width: 15 },
        { header: '柜型', key: 'boxType', width: 12 },
        { header: '贸易方式', key: 'tradeMode', width: 12 },
        { header: '拉货日期', key: 'pickupDate', width: 12 }
      ];
      
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, size: 12 };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 20;
      
      this.filteredOrders.forEach(order => {
        const stats = this.calculateOrderStats(order);
        const extras = order.extras || {};
        const pickupDate = extras.pickupDate ? fmtDateYMD(extras.pickupDate) : '';
        const items = Array.isArray(order.items) ? order.items : [];
        const productMap = new Map();
        
        items.forEach(item => {
          const model = item.model || item.productModel || item.product || '';
          const quantity = Number(item.quantity || item.qty || 0);
          if (model && model.trim() && Number.isFinite(quantity) && quantity > 0) {
            const modelKey = model.trim();
            productMap.set(modelKey, (productMap.get(modelKey) || 0) + quantity);
          }
        });
        
        // 确保产品型号和数量行数对应
        const entries = Array.from(productMap.entries());
        const productsText = entries.map(([model]) => model).join('\n');
        const quantitiesText = entries.map(([, totalQty]) => `${totalQty}条`).join('\n');
        
        const row = worksheet.addRow({
          contractNo: order.contractNo || '',
          invoiceNo: order.invoiceNo || '',
          customerName: order.customerName || '',
          products: productsText || '',
          quantity: quantitiesText || '',
          netWeight: stats.totalNetWeight || 0,
          boxType: stats.boxType || '',
          tradeMode: '一般贸易',
          pickupDate: pickupDate
        });
        
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        row.height = Math.max(18, productMap.size * 15);
        row.getCell('products').alignment = { vertical: 'middle', horizontal: 'left' };
        row.getCell('quantity').alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell('netWeight').numFmt = '#,##0';
      });
      
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `订单分析_${new Date().toISOString().slice(0, 10)}.xlsx`;
      
      // 使用统一文件导出服务（支持 Tauri 文件对话框）
      const { FileExportService } = await import('../../services/file-export-service.js');
      await FileExportService.exportExcel(blob, fileName);
    } catch (error) {
      console.error('[订单分析Excel导出] 失败:', error);
      window.NotificationSystem?.toast('Excel导出失败: ' + (error.message || '未知错误'), 'error');
    }
  }
}

