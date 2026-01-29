/**
 * 客户列表视图
 * 负责客户列表的渲染、筛选、分页和事件绑定
 * ES6 模块化版本
 */

import { CustomerService } from '../../services/customer-service.js';
import { timerManager } from '../../utils/timer-manager.js';
import { eventManager } from '../../utils/event-manager.js';
import { renderTableRows, renderHTML } from '../../utils/dom-utils.js';

/**
 * 客户列表视图类
 */
export class CustomersListView {
  constructor(options = {}) {
    /**
     * 客户服务
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
    this.escapeHtml = options.escapeHtml || ((v) => String(v || ''));

    /**
     * 回调函数
     */
    this.onCustomerEdit = options.onCustomerEdit || null;
    this.onCustomerDelete = options.onCustomerDelete || null;
    this.renderCustomerSelect = options.renderCustomerSelect || null;

    if (!this.customerService) {
      throw new Error('CustomersListView: customerService is required');
    }
    if (!this.stateManager) {
      throw new Error('CustomersListView: stateManager is required');
    }

    this._initialized = false;
    this._currentPage = 1;
    this._pageSize = 20;
  }

  /**
   * 初始化视图
   */
  async init() {
    // 等待 DOM 元素加载完成（最多重试 10 次，每次 50ms）
    let tbody = document.getElementById('customersTbody');
    let retries = 0;
    const maxRetries = 10;

    while (!tbody && retries < maxRetries) {
      console.log(`[CustomersListView] 等待 customersTbody 元素加载... (${retries + 1}/${maxRetries})`);
      await new Promise(resolve => timerManager.setTimeout(resolve, 50));
      tbody = document.getElementById('customersTbody');
      retries++;
    }

    if (!tbody) {
      console.error('[CustomersListView] customersTbody 元素未找到，初始化失败');
      return;
    }

    // 检查视图是否被重新加载（DOM元素可能被重新创建）
    const wasInitialized = tbody.hasAttribute('data-initialized');
    const wasInitializing = tbody.hasAttribute('data-initializing');

    // 如果视图已初始化且DOM元素也有初始化标记，说明只是重新进入页面
    // 此时只需要重新渲染，不需要重新加载数据（避免二次刷新）
    if (this._initialized && wasInitialized && !wasInitializing) {
      console.log('[CustomersListView] 已初始化，仅重新渲染（不重新加载数据）');
      // 只渲染，不重新加载数据，避免二次刷新抖动
      // 使用 requestAnimationFrame 确保在下一帧渲染，避免与DOM更新冲突
      requestAnimationFrame(() => {
        this.render();
      });
      return;
    }

    // 如果正在初始化中，等待初始化完成
    if (wasInitializing) {
      console.log('[CustomersListView] 正在初始化中，等待完成');
      // 等待最多1秒
      let waitCount = 0;
      const maxWait = 20; // 20 * 50ms = 1秒
      const checkInterval = setInterval(() => {
        waitCount++;
        if (!tbody.hasAttribute('data-initializing') || waitCount >= maxWait) {
          clearInterval(checkInterval);
          if (this._initialized && tbody.hasAttribute('data-initialized')) {
            console.log('[CustomersListView] 初始化完成，仅重新渲染');
            requestAnimationFrame(() => {
              this.render();
            });
          } else {
            // 如果等待超时，重新初始化
            console.log('[CustomersListView] 等待超时，重新初始化');
            this._initialized = false;
            // 继续执行初始化流程
          }
        }
      }, 50);
      return;
    }

    // 如果视图已初始化但DOM元素没有初始化标记，说明视图被重新加载了
    if (this._initialized && !wasInitialized) {
      console.log('[CustomersListView] 视图被重新加载，重新初始化数据');
      // 清除初始化标记，重新初始化
      this._initialized = false;
      // 继续执行初始化流程
    }

    // 标记为正在初始化，防止重复初始化
    if (tbody.hasAttribute('data-initializing')) {
      console.log('[CustomersListView] 正在初始化中，跳过重复调用');
      return;
    }

    tbody.setAttribute('data-initializing', 'true');

    try {
      tbody.setAttribute('data-initialized', 'true');
      this._initialized = true;

      console.log('[CustomersListView] 开始初始化');

      // 1. 优先绑定事件，确保界面响应
      this._bindEventDelegates();
      this._bindButtons();
      this._bindPagination();
      this._bindFilterEvents();

      // 2. 加载客户数据
      try {
        await this.customerService.loadCustomers();
      } catch (e) {
        console.error('[CustomersListView] 客户数据加载失败:', e);
        window.NotificationSystem?.toast('客户数据加载失败，请刷新重试', 'error');
      }

      // 3. 渲染客户列表（数据加载完成后立即渲染）
      // 使用 requestAnimationFrame 确保在下一帧渲染，避免与DOM更新冲突
      requestAnimationFrame(() => {
        this.render();
        this.updateStats();
        console.log('[CustomersListView] 初始化完成');
      });
    } finally {
      // 清除初始化中标记
      tbody.removeAttribute('data-initializing');
    }
  }

  /**
   * 渲染客户列表
   */
  render() {
    console.log('[CustomersListView] 开始渲染');
    const tbody = document.getElementById("customersTbody");
    if (!tbody) {
      console.error('[CustomersListView] customersTbody 元素未找到');
      return;
    }

    // 如果正在初始化，延迟渲染，避免与DOM更新冲突
    if (tbody.hasAttribute('data-initializing')) {
      console.log('[CustomersListView] 正在初始化中，延迟渲染');
      requestAnimationFrame(() => {
        this.render();
      });
      return;
    }

    // 获取筛选条件
    const filters = this._getFilters();

    // 筛选客户
    const filteredCustomers = this.customerService.filterCustomers(filters);

    // 分页
    const pageInfo = this.customerService.paginateCustomers(
      filteredCustomers,
      this._currentPage,
      this._pageSize
    );

    // 更新分页信息
    this._updatePaginationInfo(pageInfo);

    // 渲染列表
    if (pageInfo.data.length === 0) {
      this._renderEmptyState(tbody, filters);
    } else {
      this._renderCustomerRows(tbody, pageInfo.data);
    }

    // 更新UI状态（使用 requestAnimationFrame 确保在下一帧更新）
    requestAnimationFrame(() => {
      this.updateStats();
      if (this.renderCustomerSelect) {
        this.renderCustomerSelect();
      }
    });
  }

  /**
   * 获取筛选条件
   * @private
   */
  _getFilters() {
    const fltCustomerName = document.getElementById("fltCustomerName");
    const fltCustomerTel = document.getElementById("fltCustomerTel");
    const fltCustomerAddress = document.getElementById("fltCustomerAddress");
    const fltCustomerContact = document.getElementById("fltCustomerContact");

    return {
      name: fltCustomerName ? fltCustomerName.value.trim() : '',
      tel: fltCustomerTel ? fltCustomerTel.value.trim() : '',
      address: fltCustomerAddress ? fltCustomerAddress.value.trim() : '',
      contact: fltCustomerContact ? fltCustomerContact.value.trim() : ''
    };
  }

  /**
   * 渲染空状态
   * @private
   */
  _renderEmptyState(tbody, filters) {
    const customers = this.customerService.getCustomers();
    const isEmpty = customers.length === 0;
    const hasFilters = Object.values(filters).some(v => v);

    let emptyMessage = '';
    if (isEmpty) {
      emptyMessage = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #6c757d;"><div style="font-size: 16px; margin-bottom: 8px;">👥</div><div style="font-size: 14px;">暂无客户数据</div><div style="font-size: 12px; color: #999; margin-top: 8px;">点击"新建客户"按钮创建第一个客户</div></td></tr>';
    } else if (hasFilters) {
      emptyMessage = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #6c757d;"><div style="font-size: 16px; margin-bottom: 8px;">🔍</div><div style="font-size: 14px;">没有符合条件的客户</div><div style="font-size: 12px; color: #999; margin-top: 8px;">请调整筛选条件后重试</div></td></tr>';
    } else {
      emptyMessage = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #6c757d;"><div style="font-size: 16px; margin-bottom: 8px;">👥</div><div style="font-size: 14px;">暂无客户数据</div></td></tr>';
    }

    // 使用优化的渲染方法
    renderHTML(tbody, emptyMessage);
  }

  /**
   * 渲染客户行
   * 使用 DocumentFragment 优化性能
   * @private
   */
  _renderCustomerRows(tbody, customers) {
    // 调试：检查渲染前的数据
    if (customers.length > 0) {
      const sampleCustomer = customers[0];
      console.log('[CustomersListView] 调试 - 渲染前第一个客户数据:', {
        id: sampleCustomer.id,
        name: sampleCustomer.name,
        totalUSD: sampleCustomer.totalUSD,
        totalUSDType: typeof sampleCustomer.totalUSD,
        fmtMoneyResult: this.fmtMoney(sampleCustomer.totalUSD)
      });
    }

    // 生成行 HTML 数组
    const rowHTMLs = customers.map((c) => {
      const contact = this.customerService.formatContact(c);
      const formattedMoney = this.fmtMoney(c.totalUSD);
      console.log('[CustomersListView] 调试 - 格式化金额:', {
        customerName: c.name,
        rawTotalUSD: c.totalUSD,
        formattedMoney: formattedMoney
      });
      return `<tr>
        <td>${this.escapeHtml(c.name || "-")}</td>
        <td>${this.escapeHtml(contact)}</td>
        <td>${this.escapeHtml(c.address || "-")}</td>
        <td>${formattedMoney}</td>
        <td>
          <button class="btn small" data-action="editCustomer" data-id="${c.id || ''}" data-name="${this.escapeHtml(c.name || '')}">编辑</button>
          <button class="btn small danger" data-action="delCustomer" data-id="${c.id || ''}" data-name="${this.escapeHtml(c.name || '')}">删除</button>
        </td>
      </tr>`;
    });

    // 使用 DocumentFragment 批量渲染，提升性能
    renderTableRows(tbody, rowHTMLs);
  }

  /**
   * 更新分页信息
   * @private
   */
  _updatePaginationInfo(pageInfo) {
    const pageStart = document.getElementById("pageStart");
    const pageEnd = document.getElementById("pageEnd");
    const totalRecords = document.getElementById("totalRecords");
    const totalPages = document.getElementById("totalPages");
    const currentPage = document.getElementById("currentPage");

    if (pageStart) pageStart.textContent = pageInfo.total > 0 ? pageInfo.startIndex + 1 : 0;
    if (pageEnd) pageEnd.textContent = pageInfo.endIndex;
    if (totalRecords) totalRecords.textContent = pageInfo.total;
    if (totalPages) totalPages.textContent = pageInfo.totalPages;
    if (currentPage) currentPage.textContent = pageInfo.page;

    // 更新分页按钮状态
    const btnFirst = document.getElementById("btnFirstPage");
    const btnPrev = document.getElementById("btnPrevPage");
    const btnNext = document.getElementById("btnNextPage");
    const btnLast = document.getElementById("btnLastPage");

    if (btnFirst) btnFirst.disabled = pageInfo.page <= 1;
    if (btnPrev) btnPrev.disabled = pageInfo.page <= 1;
    if (btnNext) btnNext.disabled = pageInfo.page >= pageInfo.totalPages;
    if (btnLast) btnLast.disabled = pageInfo.page >= pageInfo.totalPages;
  }

  /**
   * 更新统计信息
   */
  updateStats() {
    const stats = this.customerService.getCustomerStats();
    const totalEl = document.getElementById("totalCustomersCount");
    const activeEl = document.getElementById("activeCustomersCount");
    const totalTradeEl = document.getElementById("totalTradeAmount");

    if (totalEl) totalEl.textContent = stats.total;
    if (activeEl) activeEl.textContent = stats.active;
    if (totalTradeEl) totalTradeEl.textContent = `$${this.fmtMoney(stats.totalUSD)}`;
  }

  /**
   * 绑定事件委托
   * @private
   */
  _bindEventDelegates() {
    const customersTbody = document.getElementById("customersTbody");
    if (!customersTbody || customersTbody.hasAttribute('data-events-bound')) {
      return;
    }

    customersTbody.setAttribute('data-events-bound', 'true');

    // 绑定点击事件委托
    eventManager.on(customersTbody, 'click', (e) => {
      const btn = e.target?.closest?.('button[data-action]');
      if (!btn) return;

      e.stopPropagation();

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const name = btn.dataset.name;

      if (action === 'editCustomer') {
        // 使用弹窗编辑客户
        this._handleEditCustomer(id, name);
      } else if (action === 'delCustomer' && this.onCustomerDelete) {
        this.onCustomerDelete(id, name);
      }
    });
  }

  /**
   * 绑定按钮事件
   * @private
   */
  _bindButtons() {
    // 新建客户按钮
    const btnNewCustomer = document.getElementById("btnNewCustomer");
    if (btnNewCustomer && !btnNewCustomer.hasAttribute('data-customer-bound')) {
      btnNewCustomer.setAttribute('data-customer-bound', 'true');
      eventManager.on(btnNewCustomer, 'click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[CustomersListView] 点击新建客户按钮');

        // 动态导入并显示弹窗
        const { showCustomerEditDialog } = await import('../../components/dialogs/customer-edit-dialog.js');
        const result = await showCustomerEditDialog();

        // 如果保存成功，刷新列表
        if (result && result.success) {
          await this.customerService.loadCustomers();
          this.render();
        }
      });
    }

    // 导出客户按钮
    const btnExport = document.getElementById("btnExportCustomers");
    if (btnExport && !btnExport.hasAttribute('data-export-bound')) {
      btnExport.setAttribute('data-export-bound', 'true');
      eventManager.on(btnExport, 'click', () => {
        this.exportToCSV();
      });
    }
  }

  /**
   * 绑定分页事件
   * @private
   */
  _bindPagination() {
    const btnFirst = document.getElementById("btnFirstPage");
    const btnPrev = document.getElementById("btnPrevPage");
    const btnNext = document.getElementById("btnNextPage");
    const btnLast = document.getElementById("btnLastPage");
    const pageSizeSelect = document.getElementById("pageSizeSelect");

    if (btnFirst && !btnFirst.hasAttribute('data-pagination-bound')) {
      btnFirst.setAttribute('data-pagination-bound', 'true');
      eventManager.on(btnFirst, 'click', () => {
        this._currentPage = 1;
        this.render();
      });
    }

    if (btnPrev && !btnPrev.hasAttribute('data-pagination-bound')) {
      btnPrev.setAttribute('data-pagination-bound', 'true');
      eventManager.on(btnPrev, 'click', () => {
        if (this._currentPage > 1) {
          this._currentPage--;
          this.render();
        }
      });
    }

    if (btnNext && !btnNext.hasAttribute('data-pagination-bound')) {
      btnNext.setAttribute('data-pagination-bound', 'true');
      eventManager.on(btnNext, 'click', () => {
        const totalPages = parseInt(document.getElementById("totalPages")?.textContent || '1');
        if (this._currentPage < totalPages) {
          this._currentPage++;
          this.render();
        }
      });
    }

    if (btnLast && !btnLast.hasAttribute('data-pagination-bound')) {
      btnLast.setAttribute('data-pagination-bound', 'true');
      eventManager.on(btnLast, 'click', () => {
        const totalPages = parseInt(document.getElementById("totalPages")?.textContent || '1');
        this._currentPage = totalPages;
        this.render();
      });
    }

    if (pageSizeSelect && !pageSizeSelect.hasAttribute('data-pagination-bound')) {
      pageSizeSelect.setAttribute('data-pagination-bound', 'true');
      eventManager.on(pageSizeSelect, 'change', () => {
        this._pageSize = parseInt(pageSizeSelect.value) || 20;
        this._currentPage = 1;
        this.render();
      });
    }
  }

  /**
   * 绑定筛选事件
   * @private
   */
  _bindFilterEvents() {
    const filterFields = ['fltCustomerName', 'fltCustomerTel', 'fltCustomerAddress', 'fltCustomerContact'];

    filterFields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field && !field.hasAttribute('data-filter-bound')) {
        field.setAttribute('data-filter-bound', 'true');

        const handleInput = () => {
          this._debounceFilter();
        };

        eventManager.on(field, 'input', handleInput);
        eventManager.on(field, 'change', handleInput);
      }
    });

    // 清空筛选按钮
    const btnClearFilters = document.getElementById("btnClearCustomerFilters");
    if (btnClearFilters && !btnClearFilters.hasAttribute('data-filter-bound')) {
      btnClearFilters.setAttribute('data-filter-bound', 'true');
      eventManager.on(btnClearFilters, 'click', () => {
        filterFields.forEach(fieldId => {
          const field = document.getElementById(fieldId);
          if (field) field.value = "";
        });
        this._currentPage = 1;
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
      this._currentPage = 1; // 筛选时重置到第一页
      this.render();
    }, 300);
  }

  /**
   * 处理编辑客户
   * @private
   */
  async _handleEditCustomer(customerId, customerName) {
    try {
      // 获取客户完整数据
      const customer = await window.ApiService.customers.get(customerId);

      // 动态导入并显示编辑弹窗
      const { showCustomerEditDialog } = await import('../../components/dialogs/customer-edit-dialog.js');
      const result = await showCustomerEditDialog(customer);

      // 如果保存成功，刷新列表
      if (result && result.success) {
        await this.customerService.loadCustomers();
        this.render();
      }
    } catch (error) {
      console.error('[CustomersListView] 编辑客户失败:', error);
      window.NotificationSystem?.toast('加载客户数据失败', 'error');
    }
  }

  /**
   * 导出客户数据为CSV
   */
  exportToCSV() {
    try {
      const csvContent = this.customerService.exportToCSV();

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `客户数据_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const customers = this.customerService.getCustomers();
      window.NotificationSystem?.toast(`成功导出 ${customers.length} 条客户记录`, 'success');
    } catch (error) {
      console.error('[CustomersListView] 导出失败:', error);
      window.NotificationSystem?.toast('导出失败，请重试', 'error');
    }
  }
}

/**
 * 创建客户列表视图实例
 * @param {Object} options - 选项
 * @returns {CustomersListView} 视图实例
 */
export function createCustomersListView(options) {
  return new CustomersListView(options);
}


