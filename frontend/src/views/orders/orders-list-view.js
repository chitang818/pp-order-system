/**
* 订单列表视图
* 负责订单列表的渲染、筛选和事件绑定
* ES6 模块化版本
*/

import { OrderService } from '../../services/order-service.js';
import { timerManager } from '../../utils/timer-manager.js';
import { eventManager } from '../../utils/event-manager.js';
import { renderTableRows, renderHTML } from '../../utils/dom-utils.js';
import { debounce } from '../../utils/binding-utils.js';
import { animateNumber } from '../../utils/format-utils.js';
import { VirtualScroller } from '../../utils/virtual-scroller.js';

// 动态导入预览模块（懒加载）
let previewModuleLoaded = false;
async function ensurePreviewModule() {
  if (previewModuleLoaded) return;
  try {
    await import('../../pages/order/order-preview-page.js');
    previewModuleLoaded = true;
    console.log('[OrdersListView] 预览模块加载完成');
  } catch (error) {
    console.error('[OrdersListView] 加载预览模块失败:', error);
  }
}

/**
 * 订单列表视图类
 */
export class OrdersListView {
  constructor(options = {}) {
    /**
     * 订单服务
     */
    this.orderService = options.orderService || null;

    /**
     * 客户服务（可选，用于加载客户数据）
     */
    this.customerService = options.customerService || null;

    /**
     * 状态管理器
     */
    this.stateManager = options.stateManager || null;

    /**
     * 格式化函数（从外部注入）
     */
    this.fmtMoney = options.fmtMoney || ((v) => v);
    this.fmtDateYMD = options.fmtDateYMD || ((v) => v);
    this.escapeHtml = options.escapeHtml || ((v) => String(v || ''));

    /**
     * 回调函数
     */
    this.onOrderEdit = options.onOrderEdit || null;
    this.onOrderPreview = options.onOrderPreview || null;
    this.onOrderDocs = options.onOrderDocs || null;
    this.renderCustomerSelect = options.renderCustomerSelect || null;

    if (!this.orderService) {
      throw new Error('OrdersListView: orderService is required');
    }
    if (!this.stateManager) {
      throw new Error('OrdersListView: stateManager is required');
    }

    this._initialized = false;

    /**
     * 排序相关状态
     */
    this.sortField = null;
    this.sortDirection = 'asc';
  }

  /**
   * 初始化视图
   */
  async init() {
    // 等待 DOM 元素加载完成（最多重试 10 次，每次 50ms）
    let tbody = document.getElementById('ordersTbody');
    let retries = 0;
    const maxRetries = 10;

    while (!tbody && retries < maxRetries) {
      console.log(`[OrdersListView] 等待 ordersTbody 元素加载... (${retries + 1}/${maxRetries})`);
      await new Promise(resolve => timerManager.setTimeout(resolve, 50));
      tbody = document.getElementById('ordersTbody');
      retries++;
    }

    if (!tbody) {
      console.error('[OrdersListView] ordersTbody 元素未找到，初始化失败');
      return;
    }

    // 检查视图是否被重新加载（DOM元素可能被重新创建）
    const wasInitialized = tbody.hasAttribute('data-initialized');

    // 如果视图已初始化但DOM元素没有初始化标记，说明视图被重新加载了
    if (this._initialized && !wasInitialized) {
      console.log('[OrdersListView] 视图被重新加载，重新初始化数据');

      // [FIX] 销毁旧的虚拟滚动实例，强制绑定新 DOM
      if (this.virtualScroller) {
        // 先检查 destroy 方法是否存在（防御性编程）
        if (typeof this.virtualScroller.destroy === 'function') {
          this.virtualScroller.destroy();
        }
        this.virtualScroller = null;
      }

      // 清除初始化标记，重新初始化
      this._initialized = false;
      // 继续执行初始化流程
    } else if (this._initialized && wasInitialized) {
      console.log('[OrdersListView] 已初始化，重新渲染数据');
      // 即使已初始化，也要重新渲染数据（确保数据是最新的）
      await this.orderService.loadOrders();
      this.render();
      return;
    }

    tbody.setAttribute('data-initialized', 'true');
    this._initialized = true;

    // 优先绑定事件，确保界面响应
    this._setupQuickFilters();
    this._setupFilterToggle();
    this._bindFilterEvents();
    this._bindEventDelegates();
    this._bindButtons();
    this._bindSortEvents();

    console.log('[OrdersListView] 开始加载数据');

    // 预加载预览模块（不阻塞，后台加载，延迟执行）
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        ensurePreviewModule().catch(err => {
          console.warn('[OrdersListView] 预加载预览模块失败:', err);
        });
      }, { timeout: 2000 });
    } else {
      setTimeout(() => {
        ensurePreviewModule().catch(err => {
          console.warn('[OrdersListView] 预加载预览模块失败:', err);
        });
      }, 2000);
    }

    try {
      // 加载订单数据（关键操作，立即执行）
      await this.orderService.loadOrders();

      // 如果客户服务可用，加载客户数据（用于填充筛选下拉框）
      // 优化：延迟加载，不阻塞主流程
      if (this.customerService) {
        const customers = this.stateManager.getState('customers') || [];
        if (customers.length === 0) {
          console.log('[OrdersListView] 客户数据为空，延迟加载客户列表');
          // 使用 requestIdleCallback 延迟加载，不阻塞主渲染流程
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => {
              this.customerService.loadCustomers().then(() => {
                // 加载完成后更新客户下拉框
                if (this.renderCustomerSelect) {
                  this.renderCustomerSelect();
                }
              }).catch(e => console.warn('客户加载失败', e));
            }, { timeout: 1000 });
          } else {
            setTimeout(() => {
              this.customerService.loadCustomers().then(() => {
                // 加载完成后更新客户下拉框
                if (this.renderCustomerSelect) {
                  this.renderCustomerSelect();
                }
              }).catch(e => console.warn('客户加载失败', e));
            }, 1000);
          }
        } else {
          console.log('[OrdersListView] 客户数据已存在，跳过加载');
        }
      }
    } catch (e) {
      console.error('[OrdersListView] 数据加载失败:', e);
      window.NotificationSystem?.toast('订单数据加载失败，请刷新重试', 'error');
    }

    // 检查URL参数，如果有筛选条件，填充到筛选输入框
    this._applyUrlFilters();

    // 渲染订单列表（会自动应用筛选条件）
    // this.render(); // 改为由 VirtualScroller 驱动渲染
    // 首次加载数据后，初始化或刷新虚拟滚动
    this._initOrUpdateVirtualScroller();

    // 更新统计信息
    this.updateStats();
    console.log('[OrdersListView] 初始化完成');

    // 监听客户更新事件，自动刷新订单列表
    eventManager.on(window, 'refreshOrdersList', async () => {
      console.log('[OrdersListView] 收到订单列表刷新事件');
      await this.orderService.loadOrders();
      this.render();
    });

    // 监听客户更新事件，自动刷新订单列表（备用事件名）
    eventManager.on(window, 'customerUpdated', async () => {
      console.log('[OrdersListView] 收到客户更新事件，刷新订单列表');
      await this.orderService.loadOrders();
      this.render();
    });
  }

  /**
   * 初始化或更新虚拟滚动
   * 代替原有的 render() 全量渲染
   * @private
   */
  _initOrUpdateVirtualScroller() {
    const tbody = document.getElementById("ordersTbody");
    if (!tbody) return;

    // 获取当前筛选排序后的数据
    const allOrders = this._getProcessedOrders();

    // 如果数据为空，直接渲染空状态
    if (allOrders.length === 0) {
      if (this.virtualScroller) {
        this.virtualScroller.destroy();
        this.virtualScroller = null;
      }
      const filters = this._getFilters();
      this._renderEmptyState(tbody, filters);
      this._updateStatsAndUI();
      return;
    }

    // 智能判断：如果订单数量较少（< 100），不使用虚拟滚动，直接渲染所有订单
    // 虚拟滚动主要用于优化大数据量（1000+）的性能，对于77个订单，直接渲染更简单可靠
    const VIRTUAL_SCROLL_THRESHOLD = 100;
    if (allOrders.length < VIRTUAL_SCROLL_THRESHOLD) {
      // 禁用虚拟滚动，直接渲染所有订单
      if (this.virtualScroller) {
        this.virtualScroller.destroy();
        this.virtualScroller = null;
      }
      console.log(`[OrdersListView] 订单数量 ${allOrders.length} < ${VIRTUAL_SCROLL_THRESHOLD}，禁用虚拟滚动，直接渲染所有订单`);
      this._renderOrderRows(tbody, allOrders);
      this._updateStatsAndUI();
      return;
    }

    // 订单数量 >= 100，使用虚拟滚动优化性能
    // 真实滚动容器：本项目 body 禁止滚动，实际滚动通常发生在 .main（overflow-y: auto）
    // 如果找不到，则回退 window
    const detectedScrollContainer = document.querySelector('.main') || window;

    // 若滚动容器变更（例如页面布局切换），销毁并重建，避免监听错对象导致“只显示部分订单”
    if (this.virtualScroller && this.virtualScroller.scrollContainer !== detectedScrollContainer) {
      try {
        this.virtualScroller.destroy();
      } catch (_) { }
      this.virtualScroller = null;
    }

    if (!this.virtualScroller) {
      this.virtualScroller = new VirtualScroller({
        scrollContainer: detectedScrollContainer,
        contentContainer: tbody,
        items: allOrders,
        itemHeight: 52, // 预估行高，请根据 CSS 调整
        buffer: 20, // 增加缓冲区，初始显示更多订单（从 10 增加到 20）
        renderCallback: (visibleOrders) => {
          this._renderOrderRows(tbody, visibleOrders);

          // 渲染完成后更新 UI 状态 (如 SelectAll 状态)
          // 注意：这可能频繁执行
          this._updateActiveFiltersCount();
        }
      });
    } else {
      this.virtualScroller.setItems(allOrders);
    }

    // 更新统计信息（基于全部数据）
    this._updateStatsAndUI();
  }

  /**
   * 获取经过筛选和排序的订单数据
   * @private
   */
  _getProcessedOrders() {
    const filters = this._getFilters();
    let filteredOrders = this.orderService.filterOrders(filters);

    // 应用排序（创建副本）
    const ordersToSort = [...filteredOrders];
    this.applySort(ordersToSort);
    return ordersToSort;
  }

  /**
   * 统一更新统计和 UI 状态
   * @private
   */
  _updateStatsAndUI() {
    // 更新统计信息
    this.updateStats();
    this._updateSelectAllState();
    this._updateBatchDeleteButton();
    this._updateActiveFiltersCount();
  }

  /**
   * 渲染订单列表 (保留为空壳，兼容外部调用)
   * 实际渲染逻辑移交给了 VirtualScroller
   */
  render() {
    console.log('[OrdersListView] render 被调用，转为更新虚拟滚动');
    this._initOrUpdateVirtualScroller();
  }

  /**
   * 从URL参数中读取筛选条件并应用到筛选输入框
   * @private
   */
  _applyUrlFilters() {
    try {
      const hash = location.hash.replace("#/", "");
      const routeParts = hash.split('?');
      const hashQueryString = routeParts[1] || '';
      if (!hashQueryString) {
        return; // 没有URL参数，跳过
      }

      const hashParams = new URLSearchParams(hashQueryString);

      // 检查是否有 orderNo 参数
      const orderNo = hashParams.get('orderNo');
      if (orderNo) {
        const fltOrderNo = document.getElementById("fltOrderNo");
        if (fltOrderNo) {
          fltOrderNo.value = decodeURIComponent(orderNo);
          console.log('[OrdersListView] 从URL参数设置合同号筛选:', orderNo);
        }
      }

      // 检查是否有状态筛选参数
      const status = hashParams.get('status');
      if (status) {
        const fltStatus = document.getElementById("fltStatus");
        if (fltStatus) {
          fltStatus.value = decodeURIComponent(status);
          console.log('[OrdersListView] 从URL参数设置状态筛选:', status);
        }
      }

      // 检查是否有日期筛选参数（用于本月新增订单）
      const date = hashParams.get('date');
      if (date) {
        const fltDate = document.getElementById("fltDate");
        if (fltDate) {
          fltDate.value = decodeURIComponent(date);
          console.log('[OrdersListView] 从URL参数设置日期筛选:', date);
        }
      }

      // 检查是否有本月筛选参数（用于本月新增订单）
      const monthly = hashParams.get('monthly');
      if (monthly === 'true') {
        // 设置本月第一天的日期
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthStartStr = currentMonthStart.toISOString().split('T')[0];
        const fltDate = document.getElementById("fltDate");
        if (fltDate) {
          fltDate.value = currentMonthStartStr;
          console.log('[OrdersListView] 从URL参数设置本月筛选:', currentMonthStartStr);
        }
      }

      // 应用筛选后，触发重新渲染
      if (orderNo || status || date || monthly) {
        // 延迟重新渲染，确保筛选输入框已更新
        setTimeout(() => {
          this.render(); // 已经重写为调用 _initOrUpdateVirtualScroller

          // 清除URL中的筛选参数（避免刷新时重复应用）
          const cleanHash = '#/orders/list';
          history.replaceState(null, '', location.pathname + cleanHash);
        }, 150);
      }
    } catch (error) {
      console.error('[OrdersListView] 应用URL筛选条件失败:', error);
    }
  }

  /**
   * 获取筛选条件
   * @private
   */
  _getFilters() {
    const fltOrderNo = document.getElementById("fltOrderNo");
    const fltInvoiceNo = document.getElementById("fltInvoiceNo");
    const fltCustomer = document.getElementById("fltCustomer");
    const fltStatus = document.getElementById("fltStatus");
    const fltDate = document.getElementById("fltDate");
    const fltDestination = document.getElementById("fltDestination");
    const fltProductModel = document.getElementById("fltProductModel");
    const fltProductType = document.getElementById("fltProductType");

    return {
      orderNo: fltOrderNo ? fltOrderNo.value.trim() : '',
      invoiceNo: fltInvoiceNo ? fltInvoiceNo.value.trim() : '',
      customer: fltCustomer ? fltCustomer.value.trim() : '',
      status: fltStatus ? fltStatus.value.trim() : '',
      date: fltDate ? fltDate.value.trim() : '',
      destination: fltDestination ? fltDestination.value.trim() : '',
      productModel: fltProductModel ? fltProductModel.value.trim() : '',
      productType: fltProductType ? fltProductType.value.trim() : ''
    };
  }

  /**
   * 渲染空状态
   * @private
   */
  _renderEmptyState(tbody, filters) {
    const orders = this.orderService.getOrders();
    const isEmpty = orders.length === 0;
    const hasFilters = Object.values(filters).some(v => v);

    let emptyMessage = '';
    if (isEmpty) {
      emptyMessage = '<tr><td colspan="12" style="text-align: center; padding: 40px; color: #6c757d;"><div style="font-size: 16px; margin-bottom: 8px;">📦</div><div style="font-size: 14px;">暂无订单数据</div><div style="font-size: 12px; color: #999; margin-top: 8px;">点击"新建订单"按钮创建第一个订单</div></td></tr>';
    } else if (hasFilters) {
      emptyMessage = '<tr><td colspan="12" style="text-align: center; padding: 40px; color: #6c757d;"><div style="font-size: 16px; margin-bottom: 8px;">🔍</div><div style="font-size: 14px;">没有符合条件的订单</div><div style="font-size: 12px; color: #999; margin-top: 8px;">请调整筛选条件后重试</div></td></tr>';
    } else {
      emptyMessage = '<tr><td colspan="12" style="text-align: center; padding: 40px; color: #6c757d;"><div style="font-size: 16px; margin-bottom: 8px;">📦</div><div style="font-size: 14px;">暂无订单数据</div></td></tr>';
    }

    // 使用优化的渲染方法
    renderHTML(tbody, emptyMessage);
  }

  /**
   * 渲染订单行
   * 使用 DocumentFragment 优化性能
   * @private
   */
  _renderOrderRows(tbody, orders) {
    if (!tbody) {
      console.warn('[OrdersListView] _renderOrderRows: tbody 元素未找到');
      return;
    }

    if (!orders || orders.length === 0) {
      console.warn('[OrdersListView] _renderOrderRows: 订单列表为空');
      tbody.innerHTML = '';
      return;
    }

    const allOrders = this.orderService.getOrders();
    console.log(`[OrdersListView] _renderOrderRows: 准备渲染 ${orders.length} 条订单`);

    // 生成行 HTML 数组
    // 注意：使用订单ID而不是索引，避免筛选后索引不匹配的问题
    const rowHTMLs = orders.map((o) => {
      // 获取订单在完整列表中的索引（用于复选框等需要索引的场景）
      const origIdx = allOrders.findIndex(order =>
        (order.id && o.id && order.id === o.id) ||
        (order.rowid && o.rowid && order.rowid === o.rowid) ||
        order === o
      );

      // 使用订单ID作为数据属性，更可靠
      const orderId = o.id || o.rowid || '';
      const orderIdAttr = orderId ? `data-order-id="${this.escapeHtml(String(orderId))}"` : '';

      // 规范化订单状态，去除乱码字符
      const statusText = this._normalizeStatus(o.status || '已创建');
      const statusClass = this._getStatusClass(statusText);

      return `<tr>
        <td style="text-align: center;"><input type="checkbox" class="order-checkbox" data-index="${origIdx >= 0 ? origIdx : ''}" ${orderIdAttr}></td>
        <td style="text-align: center;">${this.fmtDateYMD(o.invoiceDate || o.createdAt || o.updatedAt)}</td>
        <td style="text-align: center;">
          <span class="contract-no-link" data-action="previewOrder" data-index="${origIdx >= 0 ? origIdx : ''}" ${orderIdAttr}
                style="cursor: pointer; color: #3b82f6; font-weight: 600; text-decoration: underline;" 
                title="点击预览订单详情">
            ${this.escapeHtml(o.contractNo || o.orderNo || "-")}
          </span>
        </td>
        <td style="text-align: center;">${this.escapeHtml(o.invoiceNo || "-")}</td>
        <td style="text-align: center;">${this.escapeHtml(o.customerName || "-")}</td>
        <td style="text-align: center;">
          ${(() => {
            // 获取货款状态
            const extras = o.extras || {};
            const paymentStatus = extras.paymentStatus || {};
            const paymentDueDate = paymentStatus.paymentDueDate || '';
            const paymentStatusValue = paymentStatus.status || (paymentDueDate ? 'paid' : 'unpaid');
            
            // 根据状态设置颜色和字体粗细（与出口统计页面保持一致）
            const colorMap = {
              unpaid: '#1f2937',    // 黑色
              paid: '#dc2626',      // 红色
              pending: '#2563eb'     // 蓝色
            };
            const fontWeight = paymentStatusValue === 'unpaid' ? 'normal' : 'bold';
            const amountColor = colorMap[paymentStatusValue] || '#1f2937';
            
            return `<span class="order-amount-link" 
                data-action="showPaymentStatus" 
                data-order-id="${orderId}"
                style="color: ${amountColor}; font-weight: ${fontWeight}; cursor: pointer; transition: all 0.2s ease;"
                onmouseover="this.style.textDecoration='underline'; this.style.opacity='0.8';"
                onmouseout="this.style.textDecoration='none'; this.style.opacity='1';"
                title="点击查看货款状态">
            ${this.fmtMoney(o.totalUSD)}
          </span>`;
          })()}
        </td>
        <td style="text-align: center;">${(() => {
          const extras = o.extras || {};
          const paymentStatus = extras.paymentStatus || {};
          const paymentDueDate = paymentStatus.paymentDueDate || '';
          return paymentDueDate ? this.fmtDateYMD(paymentDueDate) : '-';
        })()}</td>
        <td style="text-align: center;">${this.fmtDateYMD(o.shipmentDate) || "-"}</td>
        <td style="text-align: center;">${this.escapeHtml(o.shipTo || "-")}</td>
        <td style="text-align: center;">${this.escapeHtml(o.forwarder || "-")}</td>
        <td style="text-align: center;">${this.escapeHtml(o.blNo || "-")}</td>
        <td style="text-align: center;"><span class="status-pill ${statusClass}">${this.escapeHtml(statusText)}</span></td>
      </tr>`;
    });

    console.log(`[OrdersListView] _renderOrderRows: 生成了 ${rowHTMLs.length} 行 HTML`);

    // 使用 DocumentFragment 批量渲染，提升性能
    renderTableRows(tbody, rowHTMLs);

    // 验证渲染结果
    const renderedRows = tbody.querySelectorAll('tr');
    console.log(`[OrdersListView] _renderOrderRows: 实际渲染了 ${renderedRows.length} 行`);
  }

  /**
   * 规范化订单状态文本，去除乱码字符和 emoji 图标
   * 注意：图标应该通过 CSS 的 ::after 伪元素显示，而不是在文本中
   * @private
   * @param {string} status - 原始状态文本
   * @returns {string} 规范化后的状态文本（纯文本，不包含 emoji）
   */
  _normalizeStatus(status) {
    if (!status || typeof status !== 'string') {
      return '已创建';
    }

    // 去除首尾空白
    let trimmed = status.trim();

    // 移除所有 emoji 和特殊 Unicode 字符（保留中文字符）
    // 匹配中文字符（Unicode 范围：\u4e00-\u9fa5）
    // 同时移除所有非中文字符（包括 emoji、乱码等）
    const chineseOnly = trimmed.match(/[\u4e00-\u9fa5]+/g);
    if (chineseOnly && chineseOnly.length > 0) {
      trimmed = chineseOnly.join('');
    } else {
      // 如果没有中文字符，尝试直接匹配标准状态
      trimmed = trimmed.replace(/[^\u4e00-\u9fa5]/g, '');
    }

    // 检查是否匹配标准状态值
    if (trimmed.includes('已创建')) {
      return '已创建';
    }
    if (trimmed.includes('已排产')) {
      return '已排产';
    }
    if (trimmed.includes('已发货')) {
      return '已发货';
    }
    if (trimmed.includes('已完成')) {
      return '已完成';
    }

    // 如果提取的中文字符看起来像状态，返回它
    if (trimmed.length > 0 && trimmed.length <= 6) {
      return trimmed;
    }

    // 如果无法识别，返回默认值
    return '已创建';
  }

  /**
   * 获取状态样式类
   * @private
   */
  _getStatusClass(status) {
    // 先规范化状态，再获取样式类
    const normalized = this._normalizeStatus(status);
    switch (normalized) {
      case '已创建': return 'status-created';
      case '已排产': return 'status-scheduled';
      case '已发货': return 'status-shipped';
      case '已完成': return 'status-completed';
      default: return 'status-created';
    }
  }

  /**
   * 更新统计信息
   * 注意：统计应该基于所有订单，而不是筛选后的订单
   */
  updateStats() {
    const stats = this.orderService.getOrderStats();
    const totalEl = document.getElementById('totalOrdersCount');
    const pendingEl = document.getElementById('pendingShipmentCount');
    const shippedEl = document.getElementById('shippedOrdersCount');
    const completedEl = document.getElementById('completedOrdersCount');

    // 使用动画更新数字
    if (totalEl) animateNumber(totalEl, stats.total, {}, timerManager);
    if (pendingEl) animateNumber(pendingEl, stats.pending, {}, timerManager);
    if (shippedEl) animateNumber(shippedEl, stats.shipped, {}, timerManager);
    if (completedEl) animateNumber(completedEl, stats.completed, {}, timerManager);
  }

  /**
   * 更新批量删除按钮状态
   * @private
   */
  _updateBatchDeleteButton() {
    const selectedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
    const btnDeleteSelected = document.getElementById('btnDeleteSelectedOrders');
    if (btnDeleteSelected) {
      if (selectedCheckboxes.length > 0) {
        btnDeleteSelected.style.display = 'inline-block';
        btnDeleteSelected.textContent = `删除订单 (${selectedCheckboxes.length})`;
      } else {
        btnDeleteSelected.style.display = 'none';
      }
    }
  }

  /**
   * 更新全选复选框状态
   * @private
   */
  _updateSelectAllState() {
    const allCheckboxes = document.querySelectorAll('.order-checkbox');
    const checkedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
    const selectAllCheckbox = document.getElementById('selectAllOrders');

    if (selectAllCheckbox && allCheckboxes.length > 0) {
      if (checkedCheckboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      } else if (checkedCheckboxes.length === allCheckboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
      } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
      }
    }
  }

  /**
   * 更新活跃筛选条件计数
   * @private
   */
  _updateActiveFiltersCount() {
    const activeFiltersCountEl = document.getElementById('activeFiltersCount');
    if (!activeFiltersCountEl) return;

    const filters = this._getFilters();
    const count = Object.values(filters).filter(v => v).length;

    activeFiltersCountEl.textContent = count > 0 ? `(${count}个条件)` : '(0个条件)';

    if (count > 0) {
      activeFiltersCountEl.classList.add('has-filters');
    } else {
      activeFiltersCountEl.classList.remove('has-filters');
    }
  }

  /**
   * 绑定事件委托
   * @private
   */
  _bindEventDelegates() {
    const ordersTbody = document.getElementById("ordersTbody");
    if (!ordersTbody || ordersTbody.hasAttribute('data-events-bound')) {
      return;
    }

    ordersTbody.setAttribute('data-events-bound', 'true');

    // 绑定点击事件委托
    eventManager.on(ordersTbody, 'click', async (e) => {
      // 检查是否是按钮点击
      const btn = e.target?.closest?.('button[data-action]');
      if (btn) {
        const action = btn.dataset.action;

        // 优先使用 data-order-id，如果没有则使用索引
        let orderId = btn.dataset.orderId;
        if (!orderId) {
          const index = parseInt(btn.dataset.index);
          if (isNaN(index) || index < 0) {
            console.error(`[OrdersListView] 无效的订单索引: ${btn.dataset.index}`);
            window.NotificationSystem?.toast('订单数据异常，无法操作', 'error');
            return;
          }

          // 从索引获取订单
          const orders = this.orderService.getOrders();
          const order = orders[index];

          if (!order) {
            console.error(`[OrdersListView] 未找到索引 ${index} 对应的订单`);
            window.NotificationSystem?.toast('订单不存在', 'error');
            return;
          }

          orderId = order.id || order.rowid;
        }

        if (!orderId) {
          console.error(`[OrdersListView] 订单没有ID:`, btn);
          window.NotificationSystem?.toast('订单数据异常，无法操作', 'error');
          return;
        }

        if (action === 'editOrder' && this.onOrderEdit) {
          this.onOrderEdit(orderId);
        } else if (action === 'docsOrder' && this.onOrderDocs) {
          this.onOrderDocs(orderId);
        }
        return;
      }

      // 检查是否是订单金额点击
      const amountLink = e.target?.closest?.('span.order-amount-link[data-action="showPaymentStatus"]');
      if (amountLink) {
        e.preventDefault();
        e.stopPropagation();

        const orderId = amountLink.dataset.orderId;
        if (!orderId) {
          const index = parseInt(amountLink.dataset.index);
          if (isNaN(index) || index < 0) {
            console.error(`[OrdersListView] 无效的订单索引: ${amountLink.dataset.index}`);
            window.NotificationSystem?.toast('订单数据异常，无法查看货款状态', 'error');
            return;
          }

          // 从索引获取订单
          const orders = this.orderService.getOrders();
          const order = orders[index];

          if (!order) {
            console.error(`[OrdersListView] 未找到索引 ${index} 对应的订单`);
            window.NotificationSystem?.toast('订单不存在', 'error');
            return;
          }

          // 获取订单ID并显示弹窗
          const finalOrderId = order.id || order.rowid;
          if (!finalOrderId) {
            window.NotificationSystem?.toast('订单数据异常，无法查看货款状态', 'error');
            return;
          }

          // 导入并显示货款状态弹窗
          const apiService = this.apiService || window.ApiService;
          import('../../components/dialogs/payment-status-dialog.js').then(module => {
            module.showPaymentStatusDialog(order, apiService).then(() => {
              // 弹窗关闭后，刷新订单列表以显示最新状态
              console.log('[OrdersListView] 货款状态弹窗已关闭，刷新订单列表');
              // 重新加载订单数据并渲染
              this.orderService.loadOrders().then(() => {
                this.render();
                console.log('[OrdersListView] 订单列表已刷新');
              }).catch(err => {
                console.error('[OrdersListView] 刷新订单列表失败:', err);
              });
            });
          }).catch(err => {
            console.error('[OrdersListView] 加载货款状态弹窗失败:', err);
            window.NotificationSystem?.toast('加载货款状态弹窗失败', 'error');
          });
          return;
        }

        // 使用订单ID获取订单数据
        const orders = this.orderService.getOrders();
        const order = orders.find(o => (o.id || o.rowid) == orderId);

        if (!order) {
          window.NotificationSystem?.toast('订单不存在', 'error');
          return;
        }

        // 导入并显示货款状态弹窗
        const apiService = this.apiService || window.ApiService;
        import('../../components/dialogs/payment-status-dialog.js').then(module => {
          module.showPaymentStatusDialog(order, apiService).then(() => {
            // 弹窗关闭后，订单列表应该已经通过 refreshOrdersList 事件自动刷新了
            // 这里作为备用刷新机制，确保数据同步
            console.log('[OrdersListView] 货款状态弹窗已关闭，确保数据已刷新');
            // 延迟一小段时间再刷新，避免与保存成功时的刷新冲突
            setTimeout(() => {
              this.orderService.loadOrders().then(() => {
                this.render();
              }).catch(err => {
                console.error('[OrdersListView] 备用刷新失败:', err);
              });
            }, 300);
          });
        }).catch(err => {
          console.error('[OrdersListView] 加载货款状态弹窗失败:', err);
          window.NotificationSystem?.toast('加载货款状态弹窗失败', 'error');
        });
        return;
      }

      // 检查是否是合同编号链接点击
      const link = e.target?.closest?.('span.contract-no-link[data-action="previewOrder"]');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        // 使用 state.orders 的索引打开预览弹窗（旧功能修复）
        const index = parseInt(link.dataset.index);
        if (isNaN(index) || index < 0) {
          console.error(`[OrdersListView] 无效的订单索引: ${link.dataset.index}`);
          window.NotificationSystem?.toast('订单数据异常，无法预览', 'error');
          return;
        }

        // 确保预览模块已加载
        await ensurePreviewModule();

        // 优先使用全局的 showOrderPreview（弹窗预览）
        if (typeof window.showOrderPreview === 'function') {
          // [FIX] 将变量定义移到 try 块外部，确保后续调用可见
          const allOrders = this.orderService.getOrders();

          // 确保 window.state.orders 与当前订单列表同步
          try {
            if (!window.state) {
              window.state = {};
            }
            window.state.orders = allOrders;
          } catch (err) {
            console.warn('[OrdersListView] 同步 state.orders 失败:', err);
          }

          window.showOrderPreview(allOrders[index]);
        } else if (this.onOrderPreview) {
          // 兼容：如果未来需要，仍然可以走回调（跳转预览页面）
          const orders = this.orderService.getOrders();
          const order = orders[index];
          const fallbackId = order && (order.id || order.rowid);
          if (!fallbackId) {
            console.error('[OrdersListView] 订单没有ID，无法通过回调预览:', order);
            window.NotificationSystem?.toast('订单数据异常，无法预览', 'error');
            return;
          }
          this.onOrderPreview(fallbackId);
        } else {
          console.error('[OrdersListView] 预览功能未加载，请刷新页面重试');
          window.NotificationSystem?.toast('预览功能加载失败，请刷新页面重试', 'error');
        }
      }
    });

    // 绑定复选框变化事件
    eventManager.on(ordersTbody, 'change', (e) => {
      if (e.target.classList.contains('order-checkbox')) {
        this._updateBatchDeleteButton();
        this._updateSelectAllState();
      }
    });
  }

  /**
   * 绑定按钮事件
   * @private
   */
  _bindButtons() {
    // 新建订单按钮
    const btnNewOrder = document.getElementById("btnNewOrder");
    if (btnNewOrder && !btnNewOrder.hasAttribute('data-order-bound')) {
      btnNewOrder.setAttribute('data-order-bound', 'true');
      eventManager.on(btnNewOrder, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.StorageService) {
          window.StorageService.remove('erp.order_draft');
        }
        window.NotificationSystem?.toast('正在打开新建订单页面...', 'info', 1500);
        timerManager.setTimeout(() => {
          location.hash = "#/orders/edit";
        }, 150);
      });
    }

    // 全选复选框
    const selectAllOrders = document.getElementById("selectAllOrders");
    if (selectAllOrders && !selectAllOrders.hasAttribute('data-bound')) {
      selectAllOrders.setAttribute('data-bound', 'true');
      eventManager.on(selectAllOrders, 'change', () => {
        const checkboxes = document.querySelectorAll('.order-checkbox');
        checkboxes.forEach(checkbox => {
          checkbox.checked = selectAllOrders.checked;
        });
        this._updateBatchDeleteButton();
        this._updateSelectAllState();
      });
    }

    // 批量删除按钮
    this._bindDeleteButton();
  }

  /**
   * 绑定删除按钮
   * @private
   */
  _bindDeleteButton() {
    const btnDelete = document.getElementById("btnDeleteSelectedOrders");
    if (!btnDelete || btnDelete.hasAttribute('data-delete-bound')) {
      return;
    }

    btnDelete.setAttribute('data-delete-bound', 'true');

    eventManager.on(btnDelete, 'click', async () => {
      const selectedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
      if (selectedCheckboxes.length === 0) {
        window.NotificationSystem?.toast('请先选择要删除的订单', 'warning');
        return;
      }

      const selectedIndexes = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.index));
      const orders = this.orderService.getOrders();
      const selectedOrders = selectedIndexes.map(idx => orders[idx]).filter(o => o);

      const confirmMsg = `确认删除选中的 ${selectedOrders.length} 个订单吗？此操作不可恢复。\n\n订单列表：\n${selectedOrders.map(o => `• ${o.contractNo || o.orderNo || '未知订单'} (${o.customerName || '未知客户'})`).join('\n')}`;

      const confirmed = await window.ModalDialog?.confirm(confirmMsg, {
        title: '确认删除订单',
        confirmText: '确认删除',
        cancelText: '取消',
        icon: '⚠️'
      });

      if (!confirmed) {
        window.NotificationSystem?.toast('已取消批量删除', 'info');
        return;
      }

      btnDelete.disabled = true;
      btnDelete.textContent = '删除中...';

      const orderIds = selectedOrders.map(o => o.id).filter(id => id != null);
      const result = await this.orderService.deleteOrders(orderIds);

      btnDelete.disabled = false;
      btnDelete.textContent = '删除订单';

      if (result.success) {
        window.NotificationSystem?.toast(`成功删除 ${result.successCount} 个订单`, 'success');
        this.render();
      } else {
        window.NotificationSystem?.toast(`删除失败：${result.message || '未知错误'}`, 'error');
      }
    });
  }

  /**
   * 应用排序
   * @param {Array} orders - 订单数组（会被修改）
   * @private
   */
  applySort(orders) {
    if (!this.sortField || !orders || orders.length === 0) {
      return;
    }

    orders.sort((a, b) => {
      let aVal, bVal;

      switch (this.sortField) {
        case 'orderDate':
          aVal = a.orderDate || '';
          bVal = b.orderDate || '';
          break;
        case 'contractNo':
          aVal = (a.contractNo || '').toLowerCase();
          bVal = (b.contractNo || '').toLowerCase();
          break;
        case 'customerName':
          aVal = (a.customerName || '').toLowerCase();
          bVal = (b.customerName || '').toLowerCase();
          break;
        case 'totalUSD':
          aVal = Number(a.totalUSD || 0);
          bVal = Number(b.totalUSD || 0);
          break;
        case 'paymentDueDate':
          const extrasA = a.extras || {};
          const extrasB = b.extras || {};
          const paymentStatusA = extrasA.paymentStatus || {};
          const paymentStatusB = extrasB.paymentStatus || {};
          aVal = paymentStatusA.paymentDueDate || '';
          bVal = paymentStatusB.paymentDueDate || '';
          break;
        case 'shipmentDate':
          aVal = a.shipmentDate || '';
          bVal = b.shipmentDate || '';
          break;
        case 'shipTo':
          aVal = (a.shipTo || '').toLowerCase();
          bVal = (b.shipTo || '').toLowerCase();
          break;
        case 'invoiceNo':
          aVal = (a.invoiceNo || '').toLowerCase();
          bVal = (b.invoiceNo || '').toLowerCase();
          break;
        case 'forwarder':
          aVal = (a.forwarder || '').toLowerCase();
          bVal = (b.forwarder || '').toLowerCase();
          break;
        case 'blNo':
          aVal = (a.blNo || '').toLowerCase();
          bVal = (b.blNo || '').toLowerCase();
          break;
        case 'status':
          aVal = (a.status || '').toLowerCase();
          bVal = (b.status || '').toLowerCase();
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
   * 更新排序图标显示
   * @private
   */
  _updateSortIcons() {
    const headers = document.querySelectorAll('#ordersTable thead th[data-sort]');
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
   * 绑定排序事件
   * @private
   */
  _bindSortEvents() {
    const sortHeaders = document.querySelectorAll('#ordersTable thead th[data-sort]');
    sortHeaders.forEach(header => {
      // 移除旧的事件监听器（如果存在）
      if (header.hasAttribute('data-sort-bound')) {
        return;
      }
      header.setAttribute('data-sort-bound', 'true');

      eventManager.on(header, 'click', () => {
        const field = header.dataset.sort;
        if (this.sortField === field) {
          // 切换排序方向
          this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          // 设置新的排序字段
          this.sortField = field;
          this.sortDirection = 'asc';
        }

        // 更新排序图标
        this._updateSortIcons();

        // 重新渲染列表（会应用排序）
        this.render();
      });
    });

    // 初始化排序图标
    this._updateSortIcons();
  }

  /**
   * 绑定筛选事件
   * @private
   */
  _bindFilterEvents() {
    const filterBody = document.getElementById('filterBody');
    if (!filterBody) return;

    console.log('[OrdersListView] 开始绑定筛选事件');

    // 日期格式化函数
    const normalizeDate = (text) => {
      if (!text) return "";
      const digits = String(text).replace(/[^0-9]/g, "");

      if (digits.length === 8) {
        const y = digits.slice(0, 4);
        const m = digits.slice(4, 6);
        const d = digits.slice(6, 8);
        const iso = `${y}-${m}-${d}`;
        const dt = new Date(iso);
        if (!isNaN(dt.getTime())) return iso;
      }

      if (digits.length === 4) {
        const currentYear = new Date().getFullYear();
        const m = digits.slice(0, 2);
        const d = digits.slice(2, 4);
        const iso = `${currentYear}-${m}-${d}`;
        const dt = new Date(iso);
        if (!isNaN(dt.getTime())) return iso;
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
      return text;
    };

    // 输入框字段
    const inputFields = ['fltOrderNo', 'fltInvoiceNo', 'fltDate', 'fltDestination', 'fltProductModel'];
    inputFields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field && !field.hasAttribute('data-filter-bound')) {
        field.setAttribute('data-filter-bound', 'true');

        if (fieldId === 'fltDate') {
          eventManager.on(field, 'input', () => {
            const v = field.value || "";
            if (/^\d{8}$/.test(v) || /^\d{4}$/.test(v)) {
              const iso = normalizeDate(v);
              if (iso) field.value = iso;
            }
            this._debounceFilter();
          });

          eventManager.on(field, 'blur', () => {
            const iso = normalizeDate(field.value);
            if (iso) field.value = iso;
            this.render();
          });

          // 绑定日期选择器按钮
          const datePickerBtn = document.getElementById('datePickerBtn');
          if (datePickerBtn && !datePickerBtn.hasAttribute('data-filter-bound')) {
            datePickerBtn.setAttribute('data-filter-bound', 'true');
            eventManager.on(datePickerBtn, 'click', (e) => {
              e.preventDefault();
              e.stopPropagation();

              // 保存原始状态和样式
              const originalType = field.type;
              const originalValue = field.value;
              const originalStyle = field.style.cssText;
              const computedStyle = window.getComputedStyle(field);
              const originalHeight = computedStyle.height;
              const originalPadding = computedStyle.padding;
              const originalFontSize = computedStyle.fontSize;

              // 临时转换为date类型
              field.type = 'date';

              // 强制保持原始样式
              field.style.height = originalHeight;
              field.style.padding = originalPadding;
              field.style.fontSize = originalFontSize;
              field.style.paddingRight = '35px';

              // 设置默认值（如果输入框有值）
              if (originalValue && /^\d{4}-\d{2}-\d{2}$/.test(originalValue)) {
                field.value = originalValue;
              } else if (originalValue) {
                // 尝试转换其他格式的日期
                const normalized = normalizeDate(originalValue);
                if (normalized) {
                  field.value = normalized;
                }
              }

              // 监听日期选择
              const handleDateChange = () => {
                console.log('[OrdersListView] 日期已选择:', field.value);
                field.type = originalType;
                field.style.cssText = originalStyle;
                field.removeEventListener('change', handleDateChange);
                field.removeEventListener('blur', handleDateBlur);
                // 触发筛选
                this._debounceFilter();
              };

              // 监听失焦事件
              const handleDateBlur = () => {
                console.log('[OrdersListView] 日期选择器失焦');
                setTimeout(() => {
                  field.type = originalType;
                  field.style.cssText = originalStyle;
                  field.removeEventListener('change', handleDateChange);
                  field.removeEventListener('blur', handleDateBlur);
                }, 100);
              };

              field.addEventListener('change', handleDateChange);
              field.addEventListener('blur', handleDateBlur);

              // 触发日期选择器
              setTimeout(() => {
                if (field.showPicker) {
                  field.showPicker();
                } else {
                  field.focus();
                }
              }, 10);
            });
          }
        } else {
          const handleInput = () => {
            if (fieldId === 'fltProductModel') {
              // 产品型号筛选需要通过后端API进行（订单列表数据不包含items）
              this._debounceProductModelFilter();
            } else {
              this._debounceFilter();
            }
          };

          eventManager.on(field, 'input', handleInput);
          eventManager.on(field, 'change', handleInput);
        }
      }
    });

    // 下拉选择字段
    const selectFields = ['fltCustomer', 'fltStatus', 'fltProductType'];
    selectFields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field && !field.hasAttribute('data-filter-bound')) {
        field.setAttribute('data-filter-bound', 'true');
        eventManager.on(field, 'change', () => {
          this.render();
          this._updateActiveFiltersCount();
        });
      }
    });

    // 清空筛选按钮
    const btnClearFilters = document.getElementById("btnClearFilters");
    if (btnClearFilters && !btnClearFilters.hasAttribute('data-filter-bound')) {
      btnClearFilters.setAttribute('data-filter-bound', 'true');
      eventManager.on(btnClearFilters, 'click', () => {
        const fields = ['fltOrderNo', 'fltInvoiceNo', 'fltCustomer', 'fltStatus', 'fltDate', 'fltDestination', 'fltProductModel', 'fltProductType'];
        fields.forEach(fieldId => {
          const field = document.getElementById(fieldId);
          if (field) field.value = "";
        });

        const filterTags = document.querySelectorAll('.filter-tag');
        filterTags.forEach(tag => {
          tag.classList.toggle('active', tag.getAttribute('data-filter') === 'all');
        });

        this.render();
      });
    }
  }

  /**
   * 防抖筛选
   * @private
   */
  _debounceFilter() {
    if (this._filterTimer) {
      timerManager.clearTimeout(this._filterTimer);
    }
    this._filterTimer = timerManager.setTimeout(() => {
      this.render();
      this._updateActiveFiltersCount();
    }, 300);
  }

  /**
   * 防抖产品型号筛选（通过后端API）
   * 产品型号筛选需要重新从后端加载数据，因为订单列表数据不包含items详情
   * @private
   */
  _debounceProductModelFilter() {
    if (this._productModelFilterTimer) {
      timerManager.clearTimeout(this._productModelFilterTimer);
    }
    this._productModelFilterTimer = timerManager.setTimeout(async () => {
      const fltProductModel = document.getElementById('fltProductModel');
      const productModel = fltProductModel ? fltProductModel.value.trim() : '';
      
      try {
        // 通过后端API进行产品型号筛选
        await this.orderService.loadOrders({ productModel: productModel });
        this.render();
        this._updateActiveFiltersCount();
      } catch (e) {
        console.error('[OrdersListView] 产品型号筛选失败:', e);
      }
    }, 500); // 产品型号筛选使用稍长的防抖时间，因为需要网络请求
  }

  /**
   * 设置快速筛选标签
   * @private
   */
  _setupQuickFilters() {
    const filterTags = document.querySelectorAll('.filter-tag');
    const fltStatus = document.getElementById('fltStatus');

    if (!filterTags.length || !fltStatus) return;

    filterTags.forEach(tag => {
      eventManager.on(tag, 'click', () => {
        const filter = tag.getAttribute('data-filter');

        filterTags.forEach(t => t.classList.remove('active'));
        tag.classList.add('active');

        if (filter === 'all') {
          fltStatus.value = '';
        } else {
          fltStatus.value = filter;
        }

        this.render();
      });
    });
  }

  /**
   * 设置筛选折叠功能
   * @private
   */
  _setupFilterToggle() {
    const filterToggleHeader = document.getElementById('filterToggleHeader');
    const filterBody = document.getElementById('filterBody');
    const filterToggleIcon = document.getElementById('filterToggleIcon');

    if (!filterToggleHeader || !filterBody || !filterToggleIcon) return;

    filterBody.classList.add('collapsed');
    filterToggleIcon.classList.remove('rotated');

    eventManager.on(filterToggleHeader, 'click', (e) => {
      if (e.target.closest('#btnClearFilters')) return;

      filterBody.classList.toggle('collapsed');
      filterToggleIcon.classList.toggle('rotated');

      if (!filterBody.classList.contains('collapsed')) {
        timerManager.setTimeout(() => {
          filterBody.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    });
  }
}

/**
 * 创建订单列表视图实例
 * @param {Object} options - 选项
 * @returns {OrdersListView} 视图实例
 */
export function createOrdersListView(options) {
  return new OrdersListView(options);
}
