/**
 * 已删除订单列表视图
 * 负责已删除订单列表的渲染和恢复功能
 * ES6 模块化版本
 */

import { timerManager } from '../../utils/timer-manager.js';
import { eventManager } from '../../utils/event-manager.js';
import { renderTableRows } from '../../utils/dom-utils.js';

/**
 * 已删除订单列表视图类
 */
export class DeletedOrdersView {
  constructor(options = {}) {
    /**
     * API 服务
     */
    this.apiService = options.apiService || window.ApiService;
    
    /**
     * 格式化函数（从外部注入）
     */
    this.fmtMoney = options.fmtMoney || ((v) => v);
    this.fmtDateYMD = options.fmtDateYMD || ((v) => v);
    this.escapeHtml = options.escapeHtml || ((v) => String(v || ''));
    
    /**
     * 排序相关状态
     */
    this.sortField = null;
    this.sortDirection = 'asc';
    
    /**
     * 已删除订单列表
     */
    this.deletedOrders = [];
    
    this._initialized = false;
  }
  
  /**
   * 初始化视图
   */
  async init() {
    // 等待 DOM 元素加载完成
    let tbody = document.getElementById('deletedOrdersTbody');
    let retries = 0;
    const maxRetries = 10;
    
    while (!tbody && retries < maxRetries) {
      console.log(`[DeletedOrdersView] 等待 deletedOrdersTbody 元素加载... (${retries + 1}/${maxRetries})`);
      await new Promise(resolve => timerManager.setTimeout(resolve, 50));
      tbody = document.getElementById('deletedOrdersTbody');
      retries++;
    }
    
    if (!tbody) {
      console.error('[DeletedOrdersView] deletedOrdersTbody 元素未找到，初始化失败');
      return;
    }
    
    if (this._initialized) {
      console.log('[DeletedOrdersView] 已初始化，重新加载数据');
      await this.loadDeletedOrders();
      this.render();
      return;
    }
    
    console.log('[DeletedOrdersView] 开始初始化');
    
    // 加载已删除订单数据
    await this.loadDeletedOrders();
    
    // 渲染已删除订单列表
    this.render();
    
    // 延迟初始化其他功能
    timerManager.setTimeout(() => {
      this._bindSortEvents();
      this._bindButtons();
    }, 100);
    
    this._initialized = true;
    tbody.setAttribute('data-initialized', 'true');
    console.log('[DeletedOrdersView] 初始化完成');
  }
  
  /**
   * 加载已删除订单列表
   */
  async loadDeletedOrders() {
    try {
      console.log('[DeletedOrdersView] 开始加载已删除订单列表');
      const result = await this.apiService.orders.listDeleted();
      
      // 判断返回的是分页结果还是数组
      if (result && typeof result === 'object' && 'data' in result) {
        this.deletedOrders = result.data || [];
      } else if (Array.isArray(result)) {
        this.deletedOrders = result;
      } else {
        this.deletedOrders = [];
      }
      
      console.log(`[DeletedOrdersView] 加载完成，共 ${this.deletedOrders.length} 条已删除订单`);
    } catch (error) {
      console.error('[DeletedOrdersView] 加载已删除订单列表失败:', error);
      this.deletedOrders = [];
      window.NotificationSystem?.toast('加载已删除订单列表失败', 'error');
    }
  }
  
  /**
   * 渲染已删除订单列表
   */
  render() {
    console.log('[DeletedOrdersView] 开始渲染');
    const tbody = document.getElementById("deletedOrdersTbody");
    if (!tbody) {
      console.warn('[DeletedOrdersView] deletedOrdersTbody 元素未找到');
      return;
    }
    
    // 应用排序
    const ordersToSort = [...this.deletedOrders];
    this.applySort(ordersToSort);
    
    // 渲染列表
    if (ordersToSort.length === 0) {
      this._renderEmptyState(tbody);
      return;
    }
    
    this._renderOrderRows(tbody, ordersToSort);
    
    console.log(`[DeletedOrdersView] 渲染完成，共 ${ordersToSort.length} 条已删除订单`);
    
    // 更新UI状态
    timerManager.setTimeout(() => {
      this._updateSelectAllState();
      this._updateButtonVisibility();
    }, 0);
  }
  
  /**
   * 渲染空状态
   * @private
   */
  _renderEmptyState(tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" style="text-align: center; padding: 60px 20px; color: #6c757d;">
          <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">🗑️</div>
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">暂无已删除的订单</div>
          <div style="font-size: 14px; opacity: 0.7;">所有已删除的订单都会显示在这里，您可以恢复它们</div>
        </td>
      </tr>
    `;
  }
  
  /**
   * 渲染订单行
   * @private
   */
  _renderOrderRows(tbody, orders) {
    if (!tbody) {
      console.warn('[DeletedOrdersView] _renderOrderRows: tbody 元素未找到');
      return;
    }
    
    if (!orders || orders.length === 0) {
      console.warn('[DeletedOrdersView] _renderOrderRows: 订单列表为空');
      tbody.innerHTML = '';
      return;
    }
    
    console.log(`[DeletedOrdersView] _renderOrderRows: 准备渲染 ${orders.length} 条订单`);
    
    // 生成行 HTML 数组
    const rowHTMLs = orders.map((o, index) => {
      const orderId = o.id || o.rowid || '';
      const orderIdAttr = orderId ? `data-order-id="${this.escapeHtml(String(orderId))}"` : '';
      
      // 规范化订单状态
      const statusText = this._normalizeStatus(o.status || '已创建');
      const statusClass = this._getStatusClass(statusText);
      
      // 格式化删除时间
      const deletedAt = o.deletedAt || '';
      const deletedAtFormatted = deletedAt ? this.fmtDateYMD(deletedAt) : '-';
      
      return `<tr>
        <td style="text-align: center;"><input type="checkbox" class="deleted-order-checkbox" ${orderIdAttr}></td>
        <td style="text-align: center;">${this.fmtDateYMD(o.invoiceDate || o.createdAt || o.updatedAt)}</td>
        <td style="text-align: center;">
          <span class="contract-no-link" data-action="previewOrder" ${orderIdAttr}
                style="cursor: pointer; color: #3b82f6; font-weight: 600; text-decoration: underline;" 
                title="点击预览订单详情">
            ${this.escapeHtml(o.contractNo || o.orderNo || "-")}
          </span>
        </td>
        <td style="text-align: center;">${this.escapeHtml(o.invoiceNo || "-")}</td>
        <td style="text-align: center;">${this.escapeHtml(o.customerName || "-")}</td>
        <td style="text-align: center;">${this.fmtMoney(o.totalUSD)}</td>
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
        <td style="text-align: center;">${deletedAtFormatted}</td>
        <td style="text-align: center;">
          <button class="btn small success" data-action="restoreOrder" ${orderIdAttr} title="恢复订单">🔄 恢复</button>
        </td>
      </tr>`;
    });
    
    console.log(`[DeletedOrdersView] _renderOrderRows: 生成了 ${rowHTMLs.length} 行 HTML`);
    
    // 使用 DocumentFragment 批量渲染，提升性能
    renderTableRows(tbody, rowHTMLs);
    
    // 验证渲染结果
    const renderedRows = tbody.querySelectorAll('tr');
    console.log(`[DeletedOrdersView] _renderOrderRows: 实际渲染了 ${renderedRows.length} 行`);
  }
  
  /**
   * 规范化订单状态文本
   * @private
   */
  _normalizeStatus(status) {
    if (!status) return '已创建';
    return String(status).trim();
  }
  
  /**
   * 获取状态样式类
   * @private
   */
  _getStatusClass(status) {
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
   * 应用排序
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
        case 'invoiceNo':
          aVal = (a.invoiceNo || '').toLowerCase();
          bVal = (b.invoiceNo || '').toLowerCase();
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
        case 'deletedAt':
          aVal = a.deletedAt || '';
          bVal = b.deletedAt || '';
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
    const headers = document.querySelectorAll('#deletedOrdersTable thead th[data-sort]');
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
    const sortHeaders = document.querySelectorAll('#deletedOrdersTable thead th[data-sort]');
    sortHeaders.forEach(header => {
      if (header.hasAttribute('data-sort-bound')) {
        return;
      }
      header.setAttribute('data-sort-bound', 'true');
      
      eventManager.on(header, 'click', () => {
        const field = header.dataset.sort;
        if (this.sortField === field) {
          this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortField = field;
          this.sortDirection = 'asc';
        }
        
        this._updateSortIcons();
        this.render();
      });
    });
    
    this._updateSortIcons();
  }
  
  /**
   * 绑定按钮事件
   * @private
   */
  _bindButtons() {
    // 刷新按钮
    const btnRefresh = document.getElementById('btnRefreshDeletedOrders');
    if (btnRefresh && !btnRefresh.hasAttribute('data-bound')) {
      btnRefresh.setAttribute('data-bound', 'true');
      eventManager.on(btnRefresh, 'click', async () => {
        btnRefresh.disabled = true;
        btnRefresh.textContent = '刷新中...';
        try {
          await this.loadDeletedOrders();
          this.render();
          window.NotificationSystem?.toast('刷新成功', 'success');
        } catch (error) {
          console.error('[DeletedOrdersView] 刷新失败:', error);
          window.NotificationSystem?.toast('刷新失败', 'error');
        } finally {
          btnRefresh.disabled = false;
          btnRefresh.innerHTML = '<span style="margin-right: 4px;">🔄</span>刷新';
        }
      });
    }
    
    // 全选复选框
    const selectAll = document.getElementById('selectAllDeletedOrders');
    if (selectAll && !selectAll.hasAttribute('data-bound')) {
      selectAll.setAttribute('data-bound', 'true');
      eventManager.on(selectAll, 'change', () => {
        const checkboxes = document.querySelectorAll('.deleted-order-checkbox');
        checkboxes.forEach(cb => {
          cb.checked = selectAll.checked;
        });
        this._updateButtonVisibility();
      });
    }
    
    // 监听复选框变化，更新按钮显示状态
    const tbody = document.getElementById('deletedOrdersTbody');
    if (tbody && !tbody.hasAttribute('data-checkbox-bound')) {
      tbody.setAttribute('data-checkbox-bound', 'true');
      eventManager.on(tbody, 'change', (e) => {
        if (e.target.classList.contains('deleted-order-checkbox')) {
          this._updateButtonVisibility();
          this._updateSelectAllState();
        }
      });
    }
    
    // 恢复选中按钮
    const btnRestoreSelected = document.getElementById('btnRestoreSelectedOrders');
    if (btnRestoreSelected && !btnRestoreSelected.hasAttribute('data-bound')) {
      btnRestoreSelected.setAttribute('data-bound', 'true');
      eventManager.on(btnRestoreSelected, 'click', async () => {
        await this._restoreSelectedOrders();
      });
    }
    
    // 永久删除选中按钮
    const btnPermanentlyDeleteSelected = document.getElementById('btnPermanentlyDeleteSelectedOrders');
    if (btnPermanentlyDeleteSelected && !btnPermanentlyDeleteSelected.hasAttribute('data-bound')) {
      btnPermanentlyDeleteSelected.setAttribute('data-bound', 'true');
      eventManager.on(btnPermanentlyDeleteSelected, 'click', async () => {
        await this._permanentlyDeleteSelectedOrders();
      });
    }
    
    // 事件委托：处理恢复订单按钮（使用已声明的 tbody 变量）
    if (tbody && !tbody.hasAttribute('data-events-bound')) {
      tbody.setAttribute('data-events-bound', 'true');
      eventManager.on(tbody, 'click', async (e) => {
        const button = e.target.closest('button[data-action="restoreOrder"]');
        if (button) {
          e.preventDefault();
          e.stopPropagation();
          
          const orderId = button.dataset.orderId;
          if (!orderId) {
            window.NotificationSystem?.toast('订单ID不能为空', 'error');
            return;
          }
          
          // 找到对应的订单
          const order = this.deletedOrders.find(o => (o.id || o.rowid) == orderId);
          if (!order) {
            window.NotificationSystem?.toast('订单不存在', 'error');
            return;
          }
          
          const orderTitle = order.contractNo || order.orderNo || '未知订单';
          const confirmed = await window.ModalDialog?.confirm(
            `确认恢复订单 "${orderTitle}" 吗？\n\n恢复后，订单将重新出现在订单列表中。`,
            {
              title: '确认恢复订单',
              confirmText: '确认恢复',
              cancelText: '取消',
              icon: '🔄'
            }
          );
          
          if (!confirmed) {
            return;
          }
          
          // 禁用按钮
          button.disabled = true;
          button.textContent = '恢复中...';
          
          try {
            const result = await this.apiService.orders.restore(orderId);
            if (result && result.success) {
              window.NotificationSystem?.toast('订单恢复成功', 'success');
              
              // 从列表中移除已恢复的订单
              this.deletedOrders = this.deletedOrders.filter(o => (o.id || o.rowid) != orderId);
              
              // 重新渲染
              this.render();
              
              // 触发订单列表刷新事件
              window.dispatchEvent(new CustomEvent('refreshOrdersList'));
            } else {
              throw new Error(result?.message || '恢复失败');
            }
          } catch (error) {
            console.error('[DeletedOrdersView] 恢复订单失败:', error);
            window.NotificationSystem?.toast(error.message || '恢复订单失败', 'error');
            button.disabled = false;
            button.innerHTML = '🔄 恢复';
          }
        }
      });
    }
  }
  
  /**
   * 更新全选状态
   * @private
   */
  _updateSelectAllState() {
    const selectAll = document.getElementById('selectAllDeletedOrders');
    if (!selectAll) return;
    
    const checkboxes = document.querySelectorAll('.deleted-order-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    if (checkboxes.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    } else if (checkedCount === checkboxes.length) {
      selectAll.checked = true;
      selectAll.indeterminate = false;
    } else if (checkedCount > 0) {
      selectAll.checked = false;
      selectAll.indeterminate = true;
    } else {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
  }
  
  /**
   * 更新按钮显示状态
   * @private
   */
  _updateButtonVisibility() {
    const checkboxes = document.querySelectorAll('.deleted-order-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    const btnRestore = document.getElementById('btnRestoreSelectedOrders');
    const btnDelete = document.getElementById('btnPermanentlyDeleteSelectedOrders');
    
    if (btnRestore) {
      btnRestore.style.display = checkedCount > 0 ? 'inline-block' : 'none';
    }
    if (btnDelete) {
      btnDelete.style.display = checkedCount > 0 ? 'inline-block' : 'none';
    }
  }
  
  /**
   * 恢复选中的订单
   * @private
   */
  async _restoreSelectedOrders() {
    const checkboxes = document.querySelectorAll('.deleted-order-checkbox:checked');
    if (checkboxes.length === 0) {
      window.NotificationSystem?.toast('请先选择要恢复的订单', 'warning');
      return;
    }
    
    const orderIds = Array.from(checkboxes).map(cb => cb.dataset.orderId).filter(id => id);
    if (orderIds.length === 0) {
      window.NotificationSystem?.toast('选中的订单ID无效', 'error');
      return;
    }
    
    const confirmed = await window.ModalDialog?.confirm(
      `确认恢复选中的 ${orderIds.length} 个订单吗？\n\n恢复后，订单将重新出现在订单列表中。`,
      {
        title: '确认恢复订单',
        confirmText: '确认恢复',
        cancelText: '取消',
        icon: '🔄'
      }
    );
    
    if (!confirmed) {
      return;
    }
    
    const btnRestore = document.getElementById('btnRestoreSelectedOrders');
    if (btnRestore) {
      btnRestore.disabled = true;
      btnRestore.textContent = '恢复中...';
    }
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    try {
      // 逐个恢复订单
      for (const orderId of orderIds) {
        try {
          const result = await this.apiService.orders.restore(orderId);
          if (result && result.success) {
            successCount++;
            // 从列表中移除已恢复的订单
            this.deletedOrders = this.deletedOrders.filter(o => (o.id || o.rowid) != orderId);
          } else {
            failCount++;
            errors.push({ id: orderId, error: result?.message || '恢复失败' });
          }
        } catch (error) {
          failCount++;
          errors.push({ id: orderId, error: error.message || '恢复失败' });
        }
      }
      
      // 重新渲染
      this.render();
      
      // 显示结果
      if (successCount > 0) {
        window.NotificationSystem?.toast(`成功恢复 ${successCount} 个订单`, 'success');
        // 触发订单列表刷新事件
        window.dispatchEvent(new CustomEvent('refreshOrdersList'));
      }
      if (failCount > 0) {
        window.NotificationSystem?.toast(`${failCount} 个订单恢复失败`, 'error');
        console.error('[DeletedOrdersView] 恢复失败的订单:', errors);
      }
    } catch (error) {
      console.error('[DeletedOrdersView] 批量恢复订单失败:', error);
      window.NotificationSystem?.toast('批量恢复订单失败', 'error');
    } finally {
      if (btnRestore) {
        btnRestore.disabled = false;
        btnRestore.innerHTML = '<span style="margin-right: 4px;">🔄</span>恢复选中';
      }
      this._updateButtonVisibility();
    }
  }
  
  /**
   * 永久删除选中的订单
   * @private
   */
  async _permanentlyDeleteSelectedOrders() {
    const checkboxes = document.querySelectorAll('.deleted-order-checkbox:checked');
    if (checkboxes.length === 0) {
      window.NotificationSystem?.toast('请先选择要删除的订单', 'warning');
      return;
    }
    
    const orderIds = Array.from(checkboxes).map(cb => cb.dataset.orderId).filter(id => id);
    if (orderIds.length === 0) {
      window.NotificationSystem?.toast('选中的订单ID无效', 'error');
      return;
    }
    
    const confirmed = await window.ModalDialog?.confirm(
      `确认永久删除选中的 ${orderIds.length} 个订单吗？\n\n此操作不可恢复，订单将被彻底删除！`,
      {
        title: '确认永久删除订单',
        confirmText: '确认删除',
        cancelText: '取消',
        icon: '🗑️',
        type: 'danger'
      }
    );
    
    if (!confirmed) {
      return;
    }
    
    const btnDelete = document.getElementById('btnPermanentlyDeleteSelectedOrders');
    if (btnDelete) {
      btnDelete.disabled = true;
      btnDelete.textContent = '删除中...';
    }
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    try {
      // 逐个永久删除订单
      for (const orderId of orderIds) {
        try {
          const result = await this.apiService.orders.permanentlyDelete(orderId);
          if (result && result.success) {
            successCount++;
            // 从列表中移除已删除的订单
            this.deletedOrders = this.deletedOrders.filter(o => (o.id || o.rowid) != orderId);
          } else {
            failCount++;
            errors.push({ id: orderId, error: result?.message || '删除失败' });
          }
        } catch (error) {
          failCount++;
          errors.push({ id: orderId, error: error.message || '删除失败' });
        }
      }
      
      // 重新渲染
      this.render();
      
      // 显示结果
      if (successCount > 0) {
        window.NotificationSystem?.toast(`成功删除 ${successCount} 个订单`, 'success');
      }
      if (failCount > 0) {
        window.NotificationSystem?.toast(`${failCount} 个订单删除失败`, 'error');
        console.error('[DeletedOrdersView] 删除失败的订单:', errors);
      }
    } catch (error) {
      console.error('[DeletedOrdersView] 批量永久删除订单失败:', error);
      window.NotificationSystem?.toast('批量永久删除订单失败', 'error');
    } finally {
      if (btnDelete) {
        btnDelete.disabled = false;
        btnDelete.innerHTML = '<span style="margin-right: 4px;">🗑️</span>永久删除';
      }
      this._updateButtonVisibility();
    }
  }
}

/**
 * 创建已删除订单列表视图实例
 * @param {Object} options - 选项
 * @returns {DeletedOrdersView} 视图实例
 */
export function createDeletedOrdersView(options) {
  return new DeletedOrdersView(options);
}

