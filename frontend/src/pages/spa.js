/**
 * 简易SPA脚本：路由、数据模型、视图渲染、与发票页联动
 * ES6 模块化版本
 * 
 * 重构说明：
 * - 已创建 App 类来整合路由、状态、服务、视图层
 * - 逐步将功能迁移到 App 类
 * - 保留必要的全局函数和特殊视图渲染函数
 */
import { ViewLoader } from '../utils/view-loader.js';
import { eventManager } from '../utils/event-manager.js';
import { timerManager } from '../utils/timer-manager.js';
import { escapeHtml } from '../utils/format-utils.js';
import { createApp } from '../core/app.js';
import { showContractNoSelectDialog } from '../components/dialogs/contract-select-dialog.js';
import { SettingsView } from '../views/settings/settings-view.js';
import { HomeView } from '../views/home/home-view.js';
import { AnalyticsView } from '../views/analytics/analytics-view.js';
import { updateBatchDeleteButton, updateSelectAllState } from '../utils/ui-state-utils.js';
import { exportCustomersToCSV } from '../utils/export-utils.js';
import { goto } from '../utils/common-utils.js';
import { updateNavigation } from '../utils/navigation-utils.js';

// 标记为SPA模式
window.isSPA = true;

// 创建应用实例（用于新架构）
let app = null;

// 创建视图实例
let settingsView = null;
let homeView = null;
let analyticsView = null;

const routes = ["home", "orders", "customers", "analytics", "products", "settings"];
const toastContainer = document.getElementById("toastContainer");
const viewLoader = new ViewLoader();

// 本地数据存储键：统一使用 StorageService.keys，减少硬编码
const KEYS = (window.StorageService && StorageService.keys) ? StorageService.keys : {
  ORDERS: 'erp.orders',
  CUSTOMERS: 'erp.customers',
  COMPANY: 'erp.company',
  ORDER_DRAFT: 'erp.order_draft',
};
const KEY_ORDERS = KEYS.ORDERS;
const KEY_CUSTOMERS = KEYS.CUSTOMERS;
const KEY_COMPANY = KEYS.COMPANY; // ERP公司信息设置（与发票页解耦）
const KEY_ORDER_DRAFT = KEYS.ORDER_DRAFT; // 订单草稿（供将来使用）

// 初始化数据
// 清理旧本地数据：统一从后端加载，不再使用本地回退
try { StorageService.remove(KEY_ORDERS); } catch (e) { }
try { StorageService.remove(KEY_CUSTOMERS); } catch (e) { }
const state = {
  orders: [],
  customers: [],
};

// 骨架屏函数已移至 utils/dom-utils.js

// 保证从订单录入页返回后，订单列表使用最新数据
// 暴露到全局作用域，供订单编辑页面调用
// 优先使用新架构的 App 实例
window.refreshOrders = function refreshOrders() {
  // 如果新架构已初始化，使用新架构的方法
  if (app && typeof app.refreshOrders === 'function') {
    console.log('[订单列表] refreshOrders 使用新架构');
    return app.refreshOrders();
  }

  // 新架构未初始化时的兼容处理（理论上不应该执行到这里）
  console.warn('[订单列表] refreshOrders: 新架构未初始化，使用兼容处理');
  if (window.ApiService && window.ApiService.orders && window.ApiService.orders.list) {
    return window.ApiService.orders.list().then(() => {
      console.log('[订单列表] refreshOrders: 兼容处理完成');
    }).catch(err => {
      console.error('[订单列表] refreshOrders: 兼容处理失败', err);
    });
  }
}

// 刷新客户列表（暴露到全局，供其他模块调用）
// 优先使用新架构的 App 实例
window.refreshCustomers = function refreshCustomers() {
  // 如果新架构已初始化，使用新架构的方法
  if (app && typeof app.refreshCustomers === 'function') {
    console.log('[客户列表] refreshCustomers 使用新架构');
    return app.refreshCustomers();
  }

  // 新架构未初始化时的兼容处理（理论上不应该执行到这里）
  console.warn('[客户列表] refreshCustomers: 新架构未初始化，使用兼容处理');
  if (window.ApiService && window.ApiService.customers && window.ApiService.customers.list) {
    // 清除缓存
    if (window.CacheService) {
      window.CacheService.customers.clear();
    }
    return window.ApiService.customers.list().then(() => {
      console.log('[客户列表] refreshCustomers: 兼容处理完成');
    }).catch(err => {
      console.error('[客户列表] refreshCustomers: 兼容处理失败', err);
    });
  }
}

// goto, save, load 函数已移至 utils/common-utils.js

// 创建密码输入模态框（支持掩码显示）
// 注意：createPasswordModal 和 showPasswordModal 函数已删除
// 现在使用 ModalDialog.prompt 替代，支持 type: 'password' 参数

// [已删除] setActiveRoute - 功能已完全由 App.js 接管

// updateNavigation 函数已移至 utils/navigation-utils.js

// 订单编辑页面初始化函数
async function initOrderEditPage() {
  // 动态导入订单编辑页面逻辑
  try {
    const { initOrderNewPage } = await import('./order/order-new-page.js');
    // 调用订单编辑页面的初始化逻辑
    initOrderNewPage();

    // 绑定返回按钮（确保返回按钮能正常工作）
    // 使用微任务队列，立即绑定，但不阻塞渲染
    Promise.resolve().then(() => {
      const backLink = document.getElementById('backLink');
      if (backLink && !backLink.hasAttribute('data-bound')) {
        backLink.setAttribute('data-bound', 'true');
        eventManager.on(backLink, 'click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // 直接跳转，不使用延迟，提升响应速度
          location.hash = '#/orders/list';
        });
      }
    });
  } catch (error) {
    console.error('加载订单编辑页面失败:', error);
    window.NotificationSystem?.toast('加载订单编辑页面失败', 'error');
  }
}

// 合同号选择对话框已移至 components/dialogs/contract-select-dialog.js

// 使用EventManager管理hashchange事件（防止内存泄漏）
// 新架构已完全接管路由处理，这里只处理特殊逻辑（如 refresh 参数）
eventManager.on(window, "hashchange", async () => {
  // 新架构会处理路由，这里只处理特殊逻辑（如 refresh 参数）
  if (app && app.router && window.__routerInitialized) {
    const hash = location.hash.replace("#/", "");
    const routeParts = hash.split('?');
    const route = routeParts[0] || 'home';
    const hashQueryString = routeParts[1] || '';
    const hashParams = new URLSearchParams(hashQueryString);

    // 检查是否有refresh参数，如果有则强制刷新数据
    if (hashParams.has('refresh') && route === 'customers') {
      console.log('[SPA] 检测到 refresh 参数，强制刷新客户列表');
      if (window.CacheService) {
        window.CacheService.customers.clear();
      }
      const cleanHash = '#/' + route;
      history.replaceState(null, '', location.pathname + cleanHash);
      // 使用微任务队列，立即执行但不阻塞渲染
      Promise.resolve().then(() => {
        if (app && typeof app.refreshCustomers === 'function') {
          app.refreshCustomers();
        }
      });
    }
  }
});

// updateBatchDeleteButton, updateSelectAllState 函数已移至 utils/ui-state-utils.js

// 视图渲染：订单（统一使用新架构）
function renderOrders() {
  if (app?.ordersListView) {
    app.ordersListView.render();
  }
}

// 旧的 renderOrders 实现已移至 OrdersListView，代码已删除

// 获取订单状态样式类
// getStatusClass 函数已移至 utils/dom-utils.js

// 绑定新建订单按钮（独立函数，可在任何时候调用）
function bindNewOrderButton() {
  const btnNewOrder = document.getElementById("btnNewOrder");
  if (btnNewOrder) {
    // 检查是否已经绑定过（通过检查是否有自定义属性）
    if (btnNewOrder.hasAttribute('data-order-bound')) {
      console.log('[订单列表] 新建订单按钮已绑定，跳过');
      return;
    }

    // 标记为已绑定
    btnNewOrder.setAttribute('data-order-bound', 'true');

    // 绑定新的事件监听器（使用EventManager防止内存泄漏）
    const clickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[订单列表] 新建订单按钮被点击');
      // 清除可能残留的编辑桥与草稿，确保新建页为空白
      try {
        if (window.StorageService) {
          window.StorageService.remove(KEY_ORDER_DRAFT);
        }
      } catch (err) {
        console.warn('[订单列表] 清除草稿失败:', err);
      }
      // 跳转到SPA内的订单编辑页面（新建模式）
      // 直接跳转，移除延迟，提升响应速度
      location.hash = "#/orders/edit";
    };
    eventManager.on(btnNewOrder, "click", clickHandler);
    console.log('[订单列表] 新建订单按钮已绑定');
  } else {
    console.warn('[订单列表] 新建订单按钮未找到');
  }
}

// 绑定新建客户按钮（独立函数，可在任何时候调用）
function bindNewCustomerButton() {
  const btnNewCustomer = document.getElementById("btnNewCustomer");
  if (btnNewCustomer) {
    // 检查是否已经绑定过（通过检查是否有自定义属性）
    if (btnNewCustomer.hasAttribute('data-customer-bound')) {
      console.log('[客户列表] 新建客户按钮已绑定，跳过');
      return;
    }

    // 标记为已绑定
    btnNewCustomer.setAttribute('data-customer-bound', 'true');

    // 绑定新的事件监听器（使用EventManager防止内存泄漏）
    const clickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[客户列表] 新建客户按钮被点击');
      // 跳转到SPA内的客户编辑页面（新建模式）
      // 直接跳转，移除延迟，提升响应速度
      location.hash = "#/partners/customers/edit";
    };
    eventManager.on(btnNewCustomer, "click", clickHandler);
    console.log('[客户列表] 新建客户按钮已绑定');
  } else {
    console.warn('[客户列表] 新建客户按钮未找到');
  }
}

// 绑定客户列表事件委托（独立函数，可在任何时候调用）
function bindCustomersTbodyEvents() {
  const customersTbody = document.getElementById("customersTbody");
  if (customersTbody) {
    // 检查是否已经绑定过（通过检查是否有自定义属性）
    if (customersTbody.hasAttribute('data-events-bound')) {
      console.log('[客户列表] 事件委托已绑定，跳过');
      return;
    }

    // 标记为已绑定
    customersTbody.setAttribute('data-events-bound', 'true');

    // 绑定点击事件委托（使用EventManager防止内存泄漏）
    eventManager.on(customersTbody, 'click', onCustomersTbodyClick);

    console.log('[客户列表] 事件委托已绑定');
  } else {
    console.warn('[客户列表] customersTbody 元素未找到，无法绑定事件');
  }
}

// 绑定订单列表事件委托（独立函数，可在任何时候调用）
function bindOrdersTbodyEvents() {
  const ordersTbody = document.getElementById("ordersTbody");
  if (ordersTbody) {
    // 检查是否已经绑定过（通过检查是否有自定义属性）
    if (ordersTbody.hasAttribute('data-events-bound')) {
      console.log('[订单列表] 事件委托已绑定，跳过');
      return;
    }

    // 标记为已绑定
    ordersTbody.setAttribute('data-events-bound', 'true');

    // 绑定点击事件委托（使用EventManager防止内存泄漏）
    eventManager.on(ordersTbody, 'click', onOrdersTbodyClick);

    // 绑定复选框变化事件（使用EventManager防止内存泄漏）
    const changeHandler = function (e) {
      if (e.target.classList.contains('order-checkbox')) {
        updateBatchDeleteButton();
        updateSelectAllState();
      }
    };
    eventManager.on(ordersTbody, 'change', changeHandler);

    console.log('[订单列表] 事件委托已绑定');
  } else {
    console.warn('[订单列表] ordersTbody 元素未找到，无法绑定事件');
  }
}

// 绑定全选复选框（独立函数，可在任何时候调用）
function bindSelectAllCheckbox() {
  const selectAllOrders = document.getElementById("selectAllOrders");
  if (selectAllOrders) {
    // 检查是否已经绑定过
    if (selectAllOrders.hasAttribute('data-bound')) {
      console.log('[订单列表] 全选复选框已绑定，跳过');
      return;
    }

    // 标记为已绑定
    selectAllOrders.setAttribute('data-bound', 'true');

    // 绑定全选复选框功能（使用EventManager防止内存泄漏）
    const changeHandler = function () {
      const checkboxes = document.querySelectorAll('.order-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = this.checked;
      });
      updateBatchDeleteButton();
      updateSelectAllState();
    };
    eventManager.on(selectAllOrders, 'change', changeHandler);

    console.log('[订单列表] 全选复选框已绑定');
  } else {
    console.warn('[订单列表] 全选复选框未找到');
  }
}

// [已删除] initOrdersListPage - 功能已完全迁移到 OrdersListView


// 绑定删除订单按钮（独立函数，可在任何时候调用）
function bindDeleteOrdersButton() {
  const btnDeleteSelectedOrders = document.getElementById("btnDeleteSelectedOrders");
  if (btnDeleteSelectedOrders && !btnDeleteSelectedOrders.hasAttribute('data-delete-bound')) {
    // 标记为已绑定
    btnDeleteSelectedOrders.setAttribute('data-delete-bound', 'true');

    btnDeleteSelectedOrders.addEventListener('click', async function () {
      const selectedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
      if (selectedCheckboxes.length === 0) {
        window.NotificationSystem?.toast('请先选择要删除的订单', 'warning');
        return;
      }

      const selectedIndexes = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.index));
      const selectedOrders = selectedIndexes.map(idx => state.orders[idx]).filter(o => o);

      const confirmMsg = `确认删除选中的 ${selectedOrders.length} 个订单吗？此操作不可恢复。\n\n订单列表：\n${selectedOrders.map(o => `• ${o.contractNo || o.orderNo || '未知订单'} (${o.customerName || '未知客户'})`).join('\n')}`;

      // 用户确认对话框 - 使用统一弹窗模块的确认对话框
      const userConfirmed = await window.ModalDialog.confirm(confirmMsg, {
        title: '确认删除订单',
        confirmText: '确认删除',
        cancelText: '取消',
        icon: '⚠️'
      });
      if (!userConfirmed) {
        window.NotificationSystem?.toast('已取消批量删除', 'info');
        return; // 用户取消，直接返回，不做任何UI更改
      }

      // 只有在用户明确确认后，才开始执行删除操作
      console.log('[订单列表] 用户已确认删除操作，开始执行删除...');

      // 禁用删除按钮，防止重复点击
      btnDeleteSelectedOrders.disabled = true;
      btnDeleteSelectedOrders.textContent = '删除中...';

      let successCount = 0;
      let failCount = 0;
      const deletedOrderIds = [];
      const failedOrders = [];

      // 记录要删除的订单行，但不立即修改UI
      const selectedRows = Array.from(selectedCheckboxes).map(cb => cb.closest('tr'));

      for (const order of selectedOrders) {
        try {
          if (order.id) {
            // 发送删除请求到后端（使用 ApiService.orders.remove 以确保 CSRF token 被正确发送）
            try {
              const result = await ApiService.orders.remove(order.id);

              if (result && result.success) {
                // 只有在后端确认删除成功后，才更新UI
                deletedOrderIds.push(order.id);
                successCount++;

                // 删除成功后才添加视觉效果
                const orderRow = selectedRows.find(row => row && row.querySelector('.order-checkbox')?.dataset.index == state.orders.indexOf(order));
                if (orderRow) {
                  orderRow.style.transition = 'all 0.3s ease';
                  orderRow.style.transform = 'translateX(-100%)';
                  orderRow.style.opacity = '0';
                  orderRow.style.backgroundColor = '#e8f5e8';
                }

                console.log(`[订单列表] 订单 ${order.id} 删除成功:`, result);
              } else {
                // 删除失败，不修改UI
                failCount++;
                failedOrders.push(order.contractNo || order.orderNo || order.id);
                console.error('[订单列表] 删除订单失败:', result?.message || '未知错误');
              }
            } catch (deleteError) {
              // 网络错误或API错误
              failCount++;
              failedOrders.push(order.contractNo || order.orderNo || order.id);
              console.error('[订单列表] 删除订单异常:', deleteError);
            }
          } else {
            // 处理没有后端ID的旧订单
            const idx = state.orders.indexOf(order);
            if (idx >= 0) {
              state.orders.splice(idx, 1);
              successCount++;

              // 删除成功后才添加视觉效果
              const orderRow = selectedRows.find(row => row && row.querySelector('.order-checkbox')?.dataset.index == idx);
              if (orderRow) {
                orderRow.style.transition = 'all 0.3s ease';
                orderRow.style.transform = 'translateX(-100%)';
                orderRow.style.opacity = '0';
              }
            }
          }
        } catch (error) {
          // 网络错误，不修改UI
          failCount++;
          failedOrders.push(order.contractNo || order.orderNo || order.id);
          console.error('[订单列表] 删除订单失败:', error);
        }
      }

      // 只有在所有删除操作完成后，才从state中移除已删除的订单
      if (deletedOrderIds.length > 0) {
        state.orders = state.orders.filter(order => !deletedOrderIds.includes(order.id));
      }

      // 延迟移除已成功删除的订单行（使用TimerManager防止内存泄漏）
      timerManager.setTimeout(() => {
        selectedRows.forEach(row => {
          if (row && row.style.transform === 'translateX(-100%)') {
            if (row.parentNode) {
              row.parentNode.removeChild(row);
            }
          }
        });
      }, 300);

      // 重新渲染订单列表，确保界面同步（使用TimerManager防止内存泄漏）
      // 优先使用新架构的方法
      timerManager.setTimeout(() => {
        if (app && app.ordersListView) {
          app.ordersListView.render();
        } else {
          // 如果新架构未初始化，输出警告
          console.warn('[订单列表] 新架构未初始化，无法渲染');
        }
      }, 350);

      // 显示详细的删除结果
      let message = '';
      if (successCount > 0 && failCount === 0) {
        message = `成功删除 ${successCount} 个订单`;
        window.NotificationSystem?.toast(message, 'success');
      } else if (successCount > 0 && failCount > 0) {
        message = `删除完成：成功 ${successCount} 个，失败 ${failCount} 个`;
        if (failedOrders.length > 0) {
          message += `\n失败的订单: ${failedOrders.join(', ')}`;
        }
        window.NotificationSystem?.toast(message, 'warning');
      } else {
        message = `删除失败，共 ${failCount} 个订单删除失败`;
        if (failedOrders.length > 0) {
          message += `\n失败的订单: ${failedOrders.join(', ')}`;
        }
        window.NotificationSystem?.toast(message, 'error');
      }

      // 重置选择状态和按钮状态
      const selectAll = document.getElementById("selectAllOrders");
      if (selectAll) selectAll.checked = false;

      // 恢复删除按钮状态
      btnDeleteSelectedOrders.disabled = false;
      btnDeleteSelectedOrders.textContent = '删除订单';
      updateBatchDeleteButton();

      // 清除缓存，确保下次刷新获取最新数据
      if (window.CacheService) {
        window.CacheService.orders.clear();
      }

      // 刷新订单列表，确保数据同步（优先使用新架构）
      if (app && typeof app.refreshOrders === 'function') {
        app.refreshOrders();
      } else {
        refreshOrders();
      }
    });

    console.log('[订单列表] 删除订单按钮已绑定');
  } else if (btnDeleteSelectedOrders && btnDeleteSelectedOrders.hasAttribute('data-delete-bound')) {
    console.log('[订单列表] 删除订单按钮已绑定，跳过');
  } else {
    console.warn('[订单列表] 删除订单按钮未找到');
  }
}

// updateOrderStats 函数已移至 utils/stats-utils.js
// 使用方式：updateOrderStats(state.orders)

// animateNumber 函数已移至 utils/format-utils.js

// [已删除] bindFilterEvents, setupQuickFilters, setupFilterToggle - 功能已迁移到 OrdersListView

// 以下代码已删除，功能已迁移到 OrdersListView（所有筛选功能已由 OrdersListView._bindFilterEvents 接管）

// updateActiveFiltersCount 函数已移至 utils/ui-state-utils.js

// 视图渲染：客户（统一使用新架构）
function renderCustomers() {
  if (app?.customersListView) {
    app.customersListView.render();
  }
}

// 旧的 renderCustomers 实现已移至 CustomersListView，代码已删除

// updateCustomerStats, exportCustomersToCSV, renderCustomerSelect 函数已移至对应工具模块
// 使用方式：
// - updateCustomerStats(state.customers, fmtMoney)
// - exportCustomersToCSV(state.customers, escapeHtml)
// - renderCustomerSelect(state.customers, escapeHtml)

// 客户表事件委托：统一在 tbody 上捕获点击
function onCustomersTbodyClick(e) {
  const btn = e.target && e.target.closest && e.target.closest('button[data-action]');
  if (!btn) return;
  // 阻止事件冒泡，防止重复触发
  e.stopPropagation();
  // 复用现有处理逻辑，确保 dataset 来自目标按钮，同时传递原始事件对象
  onCustomerAction({
    currentTarget: btn,
    target: btn,
    preventDefault: () => e.preventDefault(),
    stopPropagation: () => e.stopPropagation()
  });
}

// 订单表事件委托：统一在 tbody 上捕获点击
function onOrdersTbodyClick(e) {
  const btn = e.target && e.target.closest && e.target.closest('button[data-action]');
  if (!btn) return;
  onOrderAction({ currentTarget: btn, target: btn });
}

async function onCustomerAction(e) {
  const btn = e.currentTarget || e.target;
  const ds = (btn && btn.dataset) ? btn.dataset : {};
  const action = ds.action;
  const idRaw = ds.id;
  const nameRaw = ds.name || '';

  async function resolveCustomerId() {
    const idStr = String(idRaw != null ? idRaw : '').trim();
    if (idStr && Number.isFinite(Number(idStr))) return Number(idStr);
    // 优先使用按钮上的 data-name，其次尝试从所在行第一列读取名称文本
    let name = String(nameRaw || '').trim();
    if (!name) {
      try {
        const tr = btn.closest && btn.closest('tr');
        const cell = tr && tr.querySelector && tr.querySelector('td');
        const txt = cell && (cell.textContent || '').trim();
        if (txt) name = txt;
      } catch (_) { }
    }
    if (name) {
      const local = state.customers.find(c => String(c.name || '').trim().toLowerCase() === name.toLowerCase());
      if (local) {
        const text = String(local.id != null ? local.id : '').trim();
        if (text && Number.isFinite(Number(text))) return Number(text);
      }
      try {
        const server = await ApiService.customers.list();
        const m = (server || []).find(c => String(c.name || '').trim().toLowerCase() === name.toLowerCase());
        if (m) {
          const text = String(m.id != null ? m.id : '').trim();
          if (text && Number.isFinite(Number(text))) return Number(text);
        }
      } catch (_) { }
    }
    return null;
  }

  if (action === "delCustomer") {
    // 先阻止默认行为和事件冒泡，防止意外触发
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();

    // 解析客户ID
    const id = await resolveCustomerId();
    if (!id && id !== 0) {
      window.NotificationSystem?.toast('删除失败：客户标识无效', 'error');
      return;
    }

    // 使用统一弹窗模块的确认对话框，确保用户明确确认后才删除
    const customerName = nameRaw || '该客户';
    const confirmed = await window.ModalDialog.confirm(
      `确定要删除客户"${customerName}"吗？此操作不可恢复！`,
      {
        title: '确认删除客户',
        icon: '⚠️',
        confirmText: '确认删除',
        cancelText: '取消'
      }
    );

    if (!confirmed) {
      window.NotificationSystem?.toast('已取消删除', 'info');
      return;
    }

    // 只有在用户明确确认后才执行删除
    try {
      // 使用 ApiService.json 确保包含 CSRF token
      const resp = await ApiService.json(`/api/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });

      // 检查响应：成功或错误
      // 后端返回格式：{success: true, message: '客户删除成功', deletedId: 57}
      if (resp && (resp.success === true || resp.ok === true)) {
        // 删除成功
        // 立即清除客户缓存
        if (window.CacheService) {
          window.CacheService.customers.clear();
        }
        window.NotificationSystem?.toast(`已删除客户：${customerName}`, 'warning');
        // 强制刷新客户数据并重新渲染
        await refreshCustomersAndRender();
      } else if (resp && (resp.error === 'NOT_FOUND' || resp.message === '客户不存在' || resp.message?.includes('不存在'))) {
        // 客户不存在（404 错误）
        window.NotificationSystem?.toast('删除失败：客户不存在', 'error');
        // 强制刷新客户数据，可能客户已被删除或ID不正确
        await refreshCustomersAndRender();
      } else {
        // 其他错误
        const errorMsg = resp && resp.message ? resp.message : '删除失败';
        window.NotificationSystem?.toast(`删除失败：${errorMsg}`, 'error');
        console.warn('[客户删除] 删除失败:', resp);
      }
    } catch (e) {
      // 捕获网络错误或其他异常
      console.error('[客户删除] 删除异常:', e);
      const errorMsg = (e && e.message) ? e.message : '网络连接异常';
      window.NotificationSystem?.toast(`删除失败：${errorMsg}`, 'error');
    }
    return;
  }
  if (action === "editCustomer") {
    const id = await resolveCustomerId();
    if (!id && id !== 0) { window.NotificationSystem?.toast('编辑失败：客户标识无效', 'warning'); return; }
    // 同步携带 name 以便编辑页在 id 拉取失败时回退按名称匹配
    const nameParam = encodeURIComponent(String(nameRaw || ''));
    // 跳转到SPA内的客户编辑页面
    location.hash = `#/customers/edit?id=${encodeURIComponent(id)}&name=${nameParam}`;
  }
}

// 订单操作：删除改为调用后端，编辑/文档保持原行为以兼容未迁移页面
function onOrderAction(e) {
  const target = e.currentTarget || e.target;
  const action = target && target.dataset ? target.dataset.action : undefined;
  const idx = Number((target && target.dataset ? target.dataset.index : undefined) || -1);

  if (action === 'editOrder') {
    const o = state.orders[idx];
    if (o && o.id) {
      window.NotificationSystem?.toast('正在打开订单录入以编辑…', 'info', 1500);
      timerManager.setTimeout(() => {
        location.hash = `#/orders/edit?id=${encodeURIComponent(o.id)}`;
      }, 150);
    } else {
      window.NotificationSystem?.toast('该旧订单缺少后端 id，无法编辑。请先将数据迁移到后端。', 'warning', 2000);
    }
    return;
  }
  if (action === 'docsOrder') {
    window.NotificationSystem?.toast('打开单据中心（当前订单）', 'info', 1500);
    const o = state.orders[idx];
    const idParam = (o && o.id != null) ? `id=${encodeURIComponent(o.id)}` : `index=${idx}`;
    timerManager.setTimeout(() => goto(`/docs.html?${idParam}&hide=1`), 80);
    return;
  }
}

// 单据中心视图（新版）
async function renderDocumentCenter(subRoute) {
  const route = subRoute || 'generate';
  console.log('[SPA] 渲染单据中心页面，子路由:', route);

  // 动态导入单据中心页面逻辑
  try {
    if (route === 'generate') {
      // 加载单据生成页面
      const { initDocumentCenterGeneratePage } = await import('./document-center/document-center-generate-page.js');
      initDocumentCenterGeneratePage();
    } else if (route === 'templates') {
      // 加载单据模板列表页面
      const { initDocumentCenterTemplatesPage } = await import('./document-center/document-center-templates-page.js');
      initDocumentCenterTemplatesPage();
    } else if (route === 'template-editor') {
      // 加载模板编辑器V2页面（新版）
      const { initDocumentCenterTemplateEditorV2Page } = await import('./document-center/document-center-template-editor-v2-page.js');
      await initDocumentCenterTemplateEditorV2Page();
    }
  } catch (error) {
    console.error('[SPA] 加载单据中心页面失败:', error);
    window.NotificationSystem?.toast('加载单据中心页面失败: ' + error.message, 'error');
  }
}

// 导出到全局作用域，供 app.js 调用
window.renderDocumentCenter = renderDocumentCenter;

/**
 * 显示模板编辑器选择弹窗
 */
async function showTemplateEditorModal() {
  // 创建弹窗
  const modal = document.createElement('div');
  modal.className = 'template-editor-modal-overlay';
  modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    `;

  const modalContent = document.createElement('div');
  modalContent.className = 'template-editor-modal-content';
  modalContent.style.cssText = `
      background: #fff;
      border-radius: 12px;
      padding: 0;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    `;

  // 加载模板列表
  let templates = [];
  try {
    const DocumentCenterService = (await import('../services/document-center-service.js')).default;
    templates = await DocumentCenterService.listTemplates();
  } catch (error) {
    console.error('[SPA] 加载模板列表失败:', error);
  }

  // 渲染主界面
  function renderMainView() {
    modalContent.innerHTML = `
        <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px;">
            <span>✏️</span>
            <span>模板编辑</span>
          </h3>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">请选择操作方式</p>
        </div>
        <div style="padding: 24px;">
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <button id="btnNewTemplate" class="template-editor-option-btn" style="
              width: 100%;
              padding: 16px 20px;
              background: #fff;
              border: 2px solid #3b82f6;
              border-radius: 8px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 600;
              color: #3b82f6;
              transition: all 0.2s;
              display: flex;
              align-items: center;
              gap: 12px;
              text-align: left;
            ">
              <span style="font-size: 24px;">➕</span>
              <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px;">新建模板</div>
                <div style="font-size: 12px; color: #6b7280; font-weight: normal;">创建一个全新的模板</div>
              </div>
            </button>
            <button id="btnSelectTemplate" class="template-editor-option-btn" style="
              width: 100%;
              padding: 16px 20px;
              background: #fff;
              border: 2px solid #e5e7eb;
              border-radius: 8px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 600;
              color: #374151;
              transition: all 0.2s;
              display: flex;
              align-items: center;
              gap: 12px;
              text-align: left;
            ">
              <span style="font-size: 24px;">📝</span>
              <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px;">选择编辑模板</div>
                <div style="font-size: 12px; color: #6b7280; font-weight: normal;">编辑已存在的模板</div>
              </div>
            </button>
          </div>
          ${templates.length > 0 ? `
            <div id="templateListContainer" style="display: none; margin-top: 20px; max-height: 300px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
              <div style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">选择模板</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${templates.map(template => `
                  <button class="template-item-btn" data-template-id="${template.id}" style="
                    width: 100%;
                    padding: 12px 16px;
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    text-align: left;
                    transition: all 0.2s;
                  ">
                    <div style="font-weight: 500; color: #111827; margin-bottom: 4px;">${template.name || '未命名模板'}</div>
                    <div style="font-size: 11px; color: #6b7280;">
                      ${template.type ? `类型: ${template.type} | ` : ''}
                      ${template.isDefault ? '默认模板' : ''}
                    </div>
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end;">
          <button id="btnCloseModal" style="
            padding: 8px 16px;
            background: #f3f4f6;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            color: #374151;
            transition: all 0.2s;
          ">取消</button>
        </div>
      `;
    bindMainViewEvents();
  }

  // 渲染单据类型选择界面
  function renderDocumentTypeView() {
    const documentTypes = [
      { value: 'sales', label: '销售确认书', icon: '📋', code: 'S/C' },
      { value: 'production', label: '生产通知单', icon: '🏭', code: '' },
      { value: 'invoice', label: '发票', icon: '📄', code: 'IV' },
      { value: 'packing', label: '装箱单', icon: '📦', code: 'PL' },
      { value: 'pickup', label: '拉货通知', icon: '🚚', code: '' }
    ];

    modalContent.innerHTML = `
        <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <button id="btnBackToMain" style="
              background: none;
              border: none;
              font-size: 20px;
              cursor: pointer;
              color: #6b7280;
              padding: 4px 8px;
              border-radius: 4px;
              transition: all 0.2s;
            " title="返回">←</button>
            <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px;">
              <span>➕</span>
              <span>新建模板</span>
            </h3>
          </div>
          <p style="margin: 0; font-size: 13px; color: #6b7280;">请选择单据类型</p>
        </div>
        <div style="padding: 24px;">
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${documentTypes.map(type => `
              <button class="document-type-btn" data-type="${type.value}" style="
                width: 100%;
                padding: 16px 20px;
                background: #fff;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                color: #374151;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 12px;
                text-align: left;
              ">
                <span style="font-size: 24px;">${type.icon}</span>
                <div style="flex: 1;">
                  <div style="font-weight: 600; margin-bottom: 4px;">${type.label}${type.code ? ` (${type.code})` : ''}</div>
                </div>
                <span style="font-size: 18px; color: #9ca3af;">→</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end;">
          <button id="btnCloseModal" style="
            padding: 8px 16px;
            background: #f3f4f6;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            color: #374151;
            transition: all 0.2s;
          ">取消</button>
        </div>
      `;
    bindDocumentTypeViewEvents();
  }

  // 绑定主界面事件
  function bindMainViewEvents() {
    const btnNewTemplate = modalContent.querySelector('#btnNewTemplate');
    const btnSelectTemplate = modalContent.querySelector('#btnSelectTemplate');
    const btnCloseModal = modalContent.querySelector('#btnCloseModal');
    const templateListContainer = modalContent.querySelector('#templateListContainer');
    const templateItemBtns = modalContent.querySelectorAll('.template-item-btn');

    // 新建模板按钮
    if (btnNewTemplate) {
      btnNewTemplate.addEventListener('click', () => {
        renderDocumentTypeView();
      });
      btnNewTemplate.addEventListener('mouseenter', () => {
        btnNewTemplate.style.background = '#eff6ff';
        btnNewTemplate.style.borderColor = '#2563eb';
      });
      btnNewTemplate.addEventListener('mouseleave', () => {
        btnNewTemplate.style.background = '#fff';
        btnNewTemplate.style.borderColor = '#3b82f6';
      });
    }

    // 选择编辑模板按钮
    if (btnSelectTemplate) {
      btnSelectTemplate.addEventListener('click', () => {
        if (templateListContainer) {
          const isVisible = templateListContainer.style.display !== 'none';
          templateListContainer.style.display = isVisible ? 'none' : 'block';
          if (!isVisible) {
            btnSelectTemplate.style.borderColor = '#3b82f6';
            btnSelectTemplate.style.background = '#eff6ff';
            btnSelectTemplate.style.color = '#3b82f6';
          } else {
            btnSelectTemplate.style.borderColor = '#e5e7eb';
            btnSelectTemplate.style.background = '#fff';
            btnSelectTemplate.style.color = '#374151';
          }
        } else {
          // 如果没有模板列表，直接跳转到模板列表页面
          modal.remove();
          window.location.hash = '#/document-center/templates';
        }
      });
      btnSelectTemplate.addEventListener('mouseenter', () => {
        if (templateListContainer?.style.display !== 'block') {
          btnSelectTemplate.style.background = '#f9fafb';
          btnSelectTemplate.style.borderColor = '#d1d5db';
        }
      });
      btnSelectTemplate.addEventListener('mouseleave', () => {
        if (templateListContainer?.style.display !== 'block') {
          btnSelectTemplate.style.background = '#fff';
          btnSelectTemplate.style.borderColor = '#e5e7eb';
        }
      });
    }

    // 模板项按钮
    templateItemBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const templateId = btn.getAttribute('data-template-id');
        modal.remove();
        window.location.hash = `#/document-center/template-editor?id=${encodeURIComponent(templateId)}`;
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#f0f7ff';
        btn.style.borderColor = '#3b82f6';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#f9fafb';
        btn.style.borderColor = '#e5e7eb';
      });
    });

    // 关闭按钮
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        modal.remove();
      });
      btnCloseModal.addEventListener('mouseenter', () => {
        btnCloseModal.style.background = '#e5e7eb';
      });
      btnCloseModal.addEventListener('mouseleave', () => {
        btnCloseModal.style.background = '#f3f4f6';
      });
    }
  }

  // 绑定单据类型选择界面事件
  function bindDocumentTypeViewEvents() {
    const btnBackToMain = modalContent.querySelector('#btnBackToMain');
    const btnCloseModal = modalContent.querySelector('#btnCloseModal');
    const documentTypeBtns = modalContent.querySelectorAll('.document-type-btn');

    // 返回按钮
    if (btnBackToMain) {
      btnBackToMain.addEventListener('click', () => {
        renderMainView();
      });
      btnBackToMain.addEventListener('mouseenter', () => {
        btnBackToMain.style.background = '#f3f4f6';
        btnBackToMain.style.color = '#111827';
      });
      btnBackToMain.addEventListener('mouseleave', () => {
        btnBackToMain.style.background = 'none';
        btnBackToMain.style.color = '#6b7280';
      });
    }

    // 单据类型按钮
    documentTypeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        modal.remove();
        window.location.hash = `#/document-center/template-editor?type=${encodeURIComponent(type)}`;
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#f0f7ff';
        btn.style.borderColor = '#3b82f6';
        btn.style.color = '#3b82f6';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#fff';
        btn.style.borderColor = '#e5e7eb';
        btn.style.color = '#374151';
      });
    });

    // 关闭按钮
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        modal.remove();
      });
      btnCloseModal.addEventListener('mouseenter', () => {
        btnCloseModal.style.background = '#e5e7eb';
      });
      btnCloseModal.addEventListener('mouseleave', () => {
        btnCloseModal.style.background = '#f3f4f6';
      });
    }
  }

  // 初始渲染主界面
  renderMainView();

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * 显示订单选择弹窗
 */
async function showOrderSelectModal() {
  // 创建弹窗
  const modal = document.createElement('div');
  modal.className = 'order-select-modal-overlay';
  modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    `;

  const modalContent = document.createElement('div');
  modalContent.className = 'order-select-modal-content';
  modalContent.style.cssText = `
      background: #fff;
      border-radius: 12px;
      padding: 0;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

  // 加载订单列表
  let orders = [];
  let isLoading = true;
  try {
    orders = await window.ApiService?.orders?.list() || [];
    isLoading = false;
  } catch (error) {
    console.error('[SPA] 加载订单列表失败:', error);
    isLoading = false;
  }

  // 渲染订单列表 - 优化性能，使用DocumentFragment和事件委托
  function renderOrderList(filteredOrders = orders) {
    const orderListContainer = modalContent.querySelector('#orderListContainer');
    if (!orderListContainer) return;

    // 清空容器
    orderListContainer.innerHTML = '';

    if (filteredOrders.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'text-align: center; padding: 40px 20px; color: #6b7280;';
      emptyDiv.innerHTML = `
          <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
          <div style="font-size: 16px; margin-bottom: 8px;">未找到匹配的订单</div>
          <div style="font-size: 13px;">请尝试其他关键词</div>
        `;
      orderListContainer.appendChild(emptyDiv);
      return;
    }

    // 使用DocumentFragment批量操作，提升性能
    const fragment = document.createDocumentFragment();
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    // 批量创建订单项
    filteredOrders.forEach(order => {
      const contractNo = order.contractNo || '无合同号';
      const customerName = order.customerName || '无客户';
      const orderDate = order.orderDate ? new Date(order.orderDate).toLocaleDateString('zh-CN') : '';
      const orderNo = order.orderNo || '';

      const btn = document.createElement('button');
      btn.className = 'order-item-btn';
      btn.setAttribute('data-order-id', order.id);
      btn.style.cssText = `
          width: 100%;
          padding: 16px 20px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
        `;
      btn.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">📦</span>
            <div style="flex: 1;">
              <div style="font-weight: 600; color: #111827; margin-bottom: 6px; font-size: 14px;">
                ${contractNo}
              </div>
              <div style="font-size: 12px; color: #6b7280; display: flex; gap: 16px; flex-wrap: wrap;">
                <span>客户: ${customerName}</span>
                ${orderNo ? `<span>订单号: ${orderNo}</span>` : ''}
                ${orderDate ? `<span>日期: ${orderDate}</span>` : ''}
              </div>
            </div>
            <span style="font-size: 18px; color: #9ca3af;">→</span>
          </div>
        `;
      wrapper.appendChild(btn);
    });

    fragment.appendChild(wrapper);
    orderListContainer.appendChild(fragment);

    // 使用事件委托，提升性能（只绑定一次）
    if (!wrapper._delegated) {
      wrapper._delegated = true;
      wrapper.addEventListener('click', (e) => {
        const btn = e.target.closest('.order-item-btn');
        if (btn) {
          const orderId = btn.getAttribute('data-order-id');
          modal.remove();
          window.location.hash = `#/document-center/generate?orderId=${encodeURIComponent(orderId)}`;
        }
      });

      // 使用CSS hover效果替代JavaScript事件（性能更好）
      const style = document.createElement('style');
      style.textContent = `
          .order-item-btn:hover {
            background: #f0f7ff !important;
            border-color: #3b82f6 !important;
          }
        `;
      if (!document.getElementById('order-select-modal-styles')) {
        style.id = 'order-select-modal-styles';
        document.head.appendChild(style);
      }
    }
  }

  modalContent.innerHTML = `
      <div style="padding: 24px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;">
        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px;">
          <span>📝</span>
          <span>单据生成</span>
        </h3>
        <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">请选择订单</p>
      </div>
      <div style="padding: 24px; flex-shrink: 0; border-bottom: 1px solid #e5e7eb;">
        <div style="position: relative;">
          <input type="text" id="orderSearchInput" placeholder="输入订单号或合同号搜索..." style="
            width: 100%;
            padding: 12px 16px 12px 40px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
            transition: all 0.2s;
            box-sizing: border-box;
          ">
          <span style="
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 18px;
            color: #9ca3af;
          ">🔍</span>
        </div>
      </div>
      <div style="padding: 24px; flex: 1; overflow: auto; min-height: 0;">
        <div id="orderListContainer">
          ${isLoading ? `
            <div style="text-align: center; padding: 40px 20px; color: #6b7280;">
              <div style="font-size: 24px; margin-bottom: 12px;">⏳</div>
              <div>加载订单列表中...</div>
            </div>
          ` : orders.length === 0 ? `
            <div style="text-align: center; padding: 40px 20px; color: #6b7280;">
              <div style="font-size: 48px; margin-bottom: 12px;">📋</div>
              <div style="font-size: 16px; margin-bottom: 8px;">暂无订单</div>
              <div style="font-size: 13px;">请先创建订单</div>
            </div>
          ` : ''}
        </div>
      </div>
      <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; flex-shrink: 0;">
        <button id="btnCloseOrderModal" style="
          padding: 8px 16px;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          transition: all 0.2s;
        ">取消</button>
      </div>
    `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // 初始渲染订单列表
  if (!isLoading && orders.length > 0) {
    renderOrderList(orders);
  }

  // 绑定事件
  const btnCloseOrderModal = modalContent.querySelector('#btnCloseOrderModal');
  const orderSearchInput = modalContent.querySelector('#orderSearchInput');

  // 搜索输入框 - 优化性能
  if (orderSearchInput) {
    let searchTimeout;
    let lastSearchTerm = '';

    // 预处理订单数据，提高搜索速度
    const preprocessedOrders = orders.map(order => ({
      ...order,
      _searchText: [
        (order.contractNo || '').toLowerCase(),
        (order.orderNo || '').toLowerCase(),
        (order.customerName || '').toLowerCase()
      ].join(' ')
    }));

    orderSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const searchTerm = e.target.value.trim().toLowerCase();

      // 如果搜索词没有变化，跳过
      if (searchTerm === lastSearchTerm) {
        return;
      }
      lastSearchTerm = searchTerm;

      // 立即显示结果（无防抖），提升响应速度
      if (searchTerm === '') {
        renderOrderList(orders);
        return;
      }

      // 使用预处理的数据进行快速搜索（优化：使用for循环比filter+map更快）
      const filteredOrders = [];
      for (let i = 0; i < preprocessedOrders.length; i++) {
        const order = preprocessedOrders[i];
        if (order._searchText.indexOf(searchTerm) !== -1) {
          // 移除临时搜索字段
          const { _searchText, ...cleanOrder } = order;
          filteredOrders.push(cleanOrder);
        }
      }

      // 使用requestAnimationFrame优化渲染时机，避免阻塞UI
      requestAnimationFrame(() => {
        renderOrderList(filteredOrders);
      });
    });

    orderSearchInput.addEventListener('focus', () => {
      orderSearchInput.style.borderColor = '#3b82f6';
      orderSearchInput.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
    });

    orderSearchInput.addEventListener('blur', () => {
      orderSearchInput.style.borderColor = '#d1d5db';
      orderSearchInput.style.boxShadow = 'none';
    });
  }

  // 关闭按钮
  if (btnCloseOrderModal) {
    btnCloseOrderModal.addEventListener('click', () => {
      modal.remove();
    });
    btnCloseOrderModal.addEventListener('mouseenter', () => {
      btnCloseOrderModal.style.background = '#e5e7eb';
    });
    btnCloseOrderModal.addEventListener('mouseleave', () => {
      btnCloseOrderModal.style.background = '#f3f4f6';
    });
  }

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// 统计视图：使用新的 AnalyticsView 类
async function renderAnalytics(subRoute) {
  if (!analyticsView) {
    // 获取app实例的stateManager和apiService
    const stateManager = app && app.stateManager ? app.stateManager : null;
    const apiService = app && app.apiService ? app.apiService : window.ApiService;
    analyticsView = new AnalyticsView(state, {
      stateManager: stateManager,
      apiService: apiService
    });
  }
  await analyticsView.render(subRoute || 'summary');
}

// 系统设置：使用新的 SettingsView 类
async function renderSettings(tab) {
  try {
    // 如果设置视图未初始化，创建实例
    if (!settingsView) {
      settingsView = new SettingsView(window.ApiService);
    }
    // 使用新的设置视图渲染（render 方法内部会处理异步操作）
    await settingsView.render(tab);
  } catch (error) {
    console.error('[SPA] renderSettings 失败:', error);
    // 不抛出错误，避免中断其他初始化流程
  }
}

// 旧的 renderSettings 函数已移至 views/settings/settings-view.js

// 初始化数据库设置按钮（兼容函数，实际功能已移至 DatabaseSettingsView）
function initDatabaseSettingsButtons() {
  // 如果设置视图已初始化，使用新的视图类
  if (settingsView && settingsView.databaseView) {
    settingsView.databaseView.render();
    return;
  }
  // 否则创建临时实例（兼容旧代码）
  if (!settingsView) {
    settingsView = new SettingsView(window.ApiService);
  }
  settingsView.databaseView.render();
}

// 初始化用户管理（兼容函数，实际功能已移至 SettingsView）
async function initUsersManagement() {
  // 如果设置视图已初始化，使用新的视图类
  if (settingsView) {
    await settingsView.initUsersManagement();
    return;
  }
  // 否则创建临时实例（兼容旧代码）
  if (!settingsView) {
    settingsView = new SettingsView(window.ApiService);
  }
  await settingsView.initUsersManagement();
}

// 事件绑定
function bindEvents() {
  const btnDocs = document.getElementById("btnDocsCenter");
  if (btnDocs) {
    // 使用EventManager防止内存泄漏
    eventManager.on(btnDocs, "click", () => {
      window.NotificationSystem?.toast("打开单据中心", "info");
      timerManager.setTimeout(() => goto("/docs.html"), 120);
    });
  }
  const btnGoInvoice = document.getElementById("btnGoInvoice");
  if (btnGoInvoice) {
    // 使用EventManager防止内存泄漏
    eventManager.on(btnGoInvoice, "click", () => {
      window.NotificationSystem?.toast("打开单据中心", "info");
      timerManager.setTimeout(() => goto("/docs.html"), 120);
    });
  }

  // 注意：新建订单按钮的绑定已移至 initOrdersListPage() 中
  // 因为按钮在订单列表视图加载时才存在
  // 这里不再绑定，避免重复绑定或绑定失败

  // 注意：新建客户按钮的绑定已移至 renderCustomers() 中
  // 因为按钮在客户列表视图加载时才存在
  // 这里不再绑定，避免重复绑定或绑定失败

  // 注意：筛选事件绑定（包括清空筛选按钮）已移至 bindFilterEvents() 函数
  // 该函数在 initOrdersListPage() 中调用，确保在视图加载后才绑定

  // 自动化测试按钮事件绑定
  const btnRunFullTest = document.getElementById("btnRunFullTest");
  const btnQuickHealthCheck = document.getElementById("btnQuickHealthCheck");
  const testStatus = document.getElementById("testStatus");

  if (btnRunFullTest) {
    btnRunFullTest.addEventListener("click", async () => {
      if (testStatus) testStatus.textContent = "运行中...";
      btnRunFullTest.disabled = true;
      try {
        await autoTest.runAllTests();
      } catch (error) {
        console.error('测试运行失败:', error);
        notification.error('测试运行失败: ' + error.message);
      } finally {
        btnRunFullTest.disabled = false;
        if (testStatus) testStatus.textContent = "就绪";
      }
    });
  }

  if (btnQuickHealthCheck) {
    btnQuickHealthCheck.addEventListener("click", async () => {
      if (testStatus) testStatus.textContent = "检查中...";
      btnQuickHealthCheck.disabled = true;
      try {
        await autoTest.quickHealthCheck();
      } catch (error) {
        console.error('健康检查失败:', error);
        notification.error('健康检查失败: ' + error.message);
      } finally {
        btnQuickHealthCheck.disabled = false;
        if (testStatus) testStatus.textContent = "就绪";
      }
    });
  }

  const btnClearCustomers = document.getElementById("btnClearCustomers");
  if (btnClearCustomers) {
    btnClearCustomers.addEventListener("click", async () => {
      if (!confirm('确定要清空所有客户吗？此操作不可恢复')) { window.NotificationSystem?.toast('已取消清空', 'info'); return; }
      try {
        const resp = await ApiService.customers.clear();
        if (resp && resp.ok) {
          window.NotificationSystem?.toast('已清空所有客户', 'warning');
          // 刷新客户视图（优先使用新架构）
          if (app && typeof app.refreshCustomers === 'function') {
            app.refreshCustomers();
          } else {
            refreshCustomers();
          }
        } else {
          window.NotificationSystem?.toast('清空失败：服务器响应异常', 'error');
        }
      } catch (e) {
        // 回退：尝试兼容 DELETE /api/customers（若服务器不支持 /clear）
        try {
          const alt = await window.ApiService.json('/api/customers', { method: 'DELETE' });
          if (alt && alt.ok) {
            window.NotificationSystem?.toast('已清空所有客户', 'warning');
            // 刷新客户视图（优先使用新架构）
            if (app && typeof app.refreshCustomers === 'function') {
              app.refreshCustomers();
            } else {
              refreshCustomers();
            }
            return;
          }
        } catch (_) { }
        window.NotificationSystem?.toast('清空客户失败：' + String(e), 'error');
      }
    });
  }

  // 客户录入已迁移至SPA路由 #/customers/edit

  // 首页“新建订单”日期输入与选择器（支持YYYYMMDD自动识别）
  const dateInput = document.getElementById("invoiceDate");
  if (dateInput) {
    const today = new Date().toISOString().slice(0, 10);
    if (!dateInput.value) dateInput.value = today;

    function normalizeDateTextToISO(text) {
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
      // 若已是YYYY-MM-DD格式则直接返回
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
      return text; // 其他情况保持原样
    }

    dateInput.addEventListener("blur", function () {
      const iso = normalizeDateTextToISO(dateInput.value);
      dateInput.value = iso;
    });
    dateInput.addEventListener("input", function () {
      const v = dateInput.value || "";
      if (/^\d{8}$/.test(v)) {
        const iso = normalizeDateTextToISO(v);
        if (iso) dateInput.value = iso;
      }
    });
    const btnPickDate = document.getElementById("btnPickDateIndex");
    if (btnPickDate) {
      btnPickDate.addEventListener("click", function () {
        const picker = document.createElement("input");
        picker.type = "date";
        picker.style.position = "fixed";
        picker.style.left = "-9999px";
        picker.style.opacity = "0";
        document.body.appendChild(picker);
        picker.addEventListener("change", function () {
          if (picker.value) dateInput.value = picker.value;
          document.body.removeChild(picker);
        });
        if (picker.showPicker) {
          picker.showPicker();
        } else {
          picker.focus();
        }
      });
    }
  }

  // 首页不再提供内嵌"保存订单"入口，统一使用右上角"新建订单"页面

  // 注意：订单列表的筛选相关的事件绑定（包括日期筛选）已移至 bindFilterEvents() 函数
  // 该函数在 initOrdersListPage() 中调用，确保在视图加载后才绑定

  // 客户管理页面的筛选、分页功能已迁移到 CustomersListView
  // 不再需要旧架构的事件绑定，所有功能由新架构接管

  // 导出客户按钮
  const btnExportCustomers = document.getElementById("btnExportCustomers");
  if (btnExportCustomers) {
    btnExportCustomers.addEventListener("click", async () => {
      await exportCustomersToCSV(state.customers, escapeHtml);
    });
  }
  // 注意：客户列表事件委托已移至 bindCustomersTbodyEvents() 函数
  // 该函数在客户列表视图加载时调用，确保在正确的时机绑定
  // 这里不再绑定，避免重复绑定或绑定失败
  // 注意：订单列表事件委托和全选复选框已移至 initOrdersListPage() 中
  // 因为按钮在订单列表视图加载时才存在
  // 这里不再绑定，避免重复绑定或绑定失败

  // 注意：删除订单按钮的绑定已移至 initOrdersListPage() 中的 bindDeleteOrdersButton() 函数
  // 因为按钮在订单列表视图加载时才存在，确保在正确的时机绑定

  // 订单页导出CSV
  const btnExportOrdersCsv = document.getElementById('btnExportOrdersCsv');
  if (btnExportOrdersCsv) {
    btnExportOrdersCsv.addEventListener('click', function () {
      const rows = Array.isArray(state.orders) ? state.orders : [];
      const headers = ['contractNo', 'invoiceNo', 'customerName', 'totalUSD', 'paymentDueDate', 'invoiceDate', 'shipmentDate', 'shipFrom', 'shipTo', 'shippedPerSs']; // 已删除status
      const csv = [headers.join(',')].concat(rows.map(r => {
        return headers.map(h => {
          if (h === 'paymentDueDate') {
            // 从extras.paymentStatus.paymentDueDate中获取
            const extras = r.extras || {};
            const paymentStatus = extras.paymentStatus || {};
            const paymentDueDate = paymentStatus.paymentDueDate || '';
            return JSON.stringify(paymentDueDate);
          }
          return JSON.stringify(r[h] != null ? r[h] : '');
        }).join(',');
      })).join('\n');
      const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `orders-${ts}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      window.NotificationSystem?.toast('CSV导出完成', 'success');
    });
  }
}

// Toast 提示系统已由 NotificationSystem 提供，无需重复定义

// 按钮涟漪微交互
function enableButtonRipple() {
  document.addEventListener("click", (evt) => {
    const btn = evt.target.closest(".btn");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    const x = evt.clientX - rect.left - size / 2;
    const y = evt.clientY - rect.top - size / 2;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    btn.appendChild(ripple);
    timerManager.setTimeout(() => ripple.remove(), 500);
  });
}

// 启动
function init() {
  console.log('SPA初始化开始...');
  bindEvents();
  enableButtonRipple();

  // 不再在这里处理路由，等待应用初始化完成后再处理
  // 应用初始化会在 initApp() 中完成，并在 app.init() 中处理初始路由

  window.NotificationSystem?.toast("欢迎使用PP外贸订单管理系统", "info", 1500);
  // 启动时提示来源一致性，避免同站不同端口或 file 协议造成数据不可见
  hintOriginConsistency();
}

// 将SPA路由功能暴露到全局作用域，供自动化测试使用
window.spa = {
  navigate: function (route) {
    if (route && app?.router) {
      app.router.navigate(route);
    } else if (route) {
      location.hash = '#/' + route;
    }
  },
  setActiveRoute: function (path) {
    // 委托给新架构的 Router
    if (app?.router?.setActiveRoute) {
      return app.router.setActiveRoute(path);
    }
  },
  getCurrentRoute: function () {
    if (app?.router) {
      const route = app.router.getCurrentRoute();
      return route.fullPath || 'home';
    }
    return location.hash.replace('#/', '') || 'home';
  }
};

// 来源一致性提示：检测 file:// 访问或非本机回环地址
function hintOriginConsistency() {
  try {
    const isFile = location.protocol === "file:";
    const origin = location.origin || "";
    const protocol = String(location.protocol || '').toLowerCase();
    const host = String(location.hostname || '').toLowerCase();
    const isTauri = protocol === 'tauri:' || host === 'tauri.localhost';
    const isLocalhost = /^(http:\/\/|https:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || isTauri;
    if (isFile) {
      window.NotificationSystem?.toast("当前以 file:// 打开，数据与预览不共享。请通过本地服务器访问。", "warning", 2000);
    } else if (!isLocalhost) {
      window.NotificationSystem?.toast("检测到非本机地址访问。请确保桌面与预览使用同一域名与端口。", "warning", 2000);
    }
  } catch (e) { /* ignore */ }
}

init();

// 暴露state到全局，供订单预览等功能使用
window.state = state;

// 视图渲染：首页 - 使用新的 HomeView 类
function renderHome() {
  if (!homeView) {
    homeView = new HomeView({ apiService: window.ApiService });
  }
  homeView.render();
}

// 拦截"订单管理"和"系统设置"点击：展开/高亮子菜单
function setupNavMenuHandlers() {
  // 拦截"订单管理"点击：展开/高亮子菜单，若无子路由则默认跳转 list
  const navOrders = document.getElementById('navOrders');
  const ordersSubnav = document.getElementById('ordersSubnav');
  if (navOrders && ordersSubnav) {
    navOrders.addEventListener('click', function (e) {
      e.preventDefault();
      const raw = (location.hash.replace('#/', '') || '').trim();
      const base = raw.split('/')[0] || '';
      const seg = raw.split('/')[1] || '';
      if (base === 'orders') {
        // 已在订单管理视图：点击一次收起，再次点击展开
        const isOpen = ordersSubnav.classList.contains('open');
        ordersSubnav.classList.toggle('open', !isOpen);
        navOrders.classList.toggle('expanded', !isOpen);
        // 当展开时如果没有子路由，默认跳转到 list
        if (!isOpen && !seg) {
          location.hash = '#/orders/list';
        } else if (!isOpen && seg) {
          // 如果展开时已有子路由，确保订单列表被选中
          updateNavigation('orders', seg);
        }
      } else {
        // 非订单管理视图：跳到 orders 并展开子菜单，同时选中订单列表
        location.hash = '#/orders/list';
        // 立即更新导航状态，确保订单列表被选中
        setTimeout(() => {
          updateNavigation('orders', 'list');
        }, 50);
      }
    });
  }

  // 拦截"单据中心"点击：展开/高亮子菜单，默认跳转 generate
  const navDocumentCenter = document.getElementById('navDocumentCenter');
  const documentCenterSubnav = document.getElementById('documentCenterSubnav');
  if (navDocumentCenter && documentCenterSubnav) {
    // 使用事件管理器，避免重复绑定
    eventManager.off(navDocumentCenter, 'click');
    eventManager.on(navDocumentCenter, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation(); // 阻止事件冒泡，避免被其他处理器拦截
      const raw = (location.hash.replace('#/', '') || '').trim();
      const base = raw.split('/')[0] || '';
      const seg = raw.split('/')[1] || '';

      if (base === 'document-center') {
        // 已在单据中心视图：如果子菜单已展开，点击收起；如果收起，点击展开并跳转到 generate
        const isOpen = documentCenterSubnav.classList.contains('open');
        if (isOpen) {
          // 已展开：收起子菜单
          documentCenterSubnav.classList.remove('open');
          navDocumentCenter.classList.remove('expanded');
        } else {
          // 已收起：展开子菜单并跳转到 generate
          documentCenterSubnav.classList.add('open');
          navDocumentCenter.classList.add('expanded');
          if (!seg || seg === '') {
            location.hash = '#/document-center/generate';
          }
        }
      } else {
        // 非单据中心视图：展开子菜单并跳转到 generate
        documentCenterSubnav.classList.add('open');
        navDocumentCenter.classList.add('expanded');
        location.hash = '#/document-center/generate';
      }
    });

    // 处理子菜单项的点击（确保链接正常工作）
    documentCenterSubnav.addEventListener('click', function (e) {
      const link = e.target.closest('a[data-tab]');
      if (link) {
        const tab = link.getAttribute('data-tab');

        // 拦截"模板编辑"点击，显示选择弹窗
        if (tab === 'template-editor') {
          e.preventDefault();
          e.stopPropagation();
          showTemplateEditorModal();
          return;
        }

        // 拦截"单据生成"点击，显示订单选择弹窗
        if (tab === 'generate') {
          e.preventDefault();
          e.stopPropagation();
          showOrderSelectModal();
          return;
        }

        // 其他子菜单项点击：确保子菜单展开
        documentCenterSubnav.classList.add('open');
        navDocumentCenter.classList.add('expanded');
        // 让链接的默认行为处理路由切换（不阻止）
        // 链接会触发 hashchange，由路由系统处理
      }
    });
  }

  // 拦截"交易统计"点击：展开/高亮子菜单，若无子路由则默认跳转 summary
  const navAnalytics = document.getElementById('navAnalytics');
  const analyticsSubnav = document.getElementById('analyticsSubnav');
  if (navAnalytics && analyticsSubnav) {
    navAnalytics.addEventListener('click', function (e) {
      e.preventDefault();
      const raw = (location.hash.replace('#/', '') || '').trim();
      const base = raw.split('/')[0] || '';
      const seg = raw.split('/')[1] || '';
      if (base === 'analytics') {
        // 已在交易统计视图：点击一次收起，再次点击展开
        const isOpen = analyticsSubnav.classList.contains('open');
        analyticsSubnav.classList.toggle('open', !isOpen);
        navAnalytics.classList.toggle('expanded', !isOpen);
        // 当展开时如果没有子路由，默认跳转到 summary
        if (!isOpen && !seg) {
          location.hash = '#/analytics/summary';
        }
      } else {
        // 非交易统计视图：跳到 analytics/summary 并展开子菜单
        // 确保子菜单展开并高亮统计概览
        analyticsSubnav.classList.add('open');
        navAnalytics.classList.add('expanded');
        location.hash = '#/analytics/summary';
      }
    });
  }

  // 拦截"系统设置"点击：展开/高亮子菜单，若无子路由则默认跳转 company
  const navSettings = document.getElementById('navSettings');
  const settingsSubnav = document.getElementById('settingsSubnav');
  if (navSettings && settingsSubnav) {
    navSettings.addEventListener('click', function (e) {
      e.preventDefault();
      const raw = (location.hash.replace('#/', '') || '').trim();
      const base = raw.split('/')[0] || '';
      const seg = raw.split('/')[1] || '';
      if (base === 'settings') {
        // 已在设置视图：点击一次收起，再次点击展开
        const isOpen = settingsSubnav.classList.contains('open');
        settingsSubnav.classList.toggle('open', !isOpen);
        navSettings.classList.toggle('expanded', !isOpen);
        // 当展开时如果没有子路由，默认跳转到 company
        if (!isOpen && !seg) {
          location.hash = '#/settings/company';
        }
      } else {
        // 非设置视图：跳到 settings 并展开子菜单
        location.hash = '#/settings/company';
      }
    });
  }

  // 拦截"订单编辑"菜单项点击：弹出合同号选择窗口
  // 注意：订单编辑菜单项的点击事件已在 app.js 中处理，这里不再重复绑定
  // 如果 app 未初始化，则在这里绑定作为后备
  const ordersSubnavForEdit = document.getElementById('ordersSubnav');
  if (ordersSubnavForEdit && (!app || !app._initialized)) {
    // 使用事件委托监听子菜单项的点击
    // 使用 EventManager 防止内存泄漏
    eventManager.on(ordersSubnavForEdit, 'click', async function (e) {
      const link = e.target.closest('a[data-tab="edit"]');
      if (link) {
        e.preventDefault();
        e.stopPropagation();

        // 显示合同号选择弹窗（传递订单列表作为参数）
        const orderId = await showContractNoSelectDialog(state.orders);

        if (orderId === 'CANCELLED') {
          // 用户点击取消，跳转到订单列表页
          location.hash = '#/orders/list';
        } else if (orderId) {
          // 找到对应的订单，跳转到编辑页面
          // 直接跳转，移除延迟，提升响应速度
          location.hash = `#/orders/edit?id=${encodeURIComponent(orderId)}`;
        } else {
          // 未找到订单，跳转到新建订单页面
          // 直接跳转，移除延迟，提升响应速度
          location.hash = '#/orders/edit';
        }
      }
    });
  }
}

// 使用微任务队列立即执行，不阻塞渲染
// 延迟执行以确保导航菜单已生成
function trySetupNavMenuHandlers() {
  const navDocumentCenter = document.getElementById('navDocumentCenter');
  const documentCenterSubnav = document.getElementById('documentCenterSubnav');

  // 如果元素存在，设置事件处理器
  if (navDocumentCenter && documentCenterSubnav) {
    setupNavMenuHandlers();
    return true;
  }
  return false;
}

// 尝试立即设置（如果菜单已生成）
if (!trySetupNavMenuHandlers()) {
  // 如果菜单未生成，使用轮询等待
  let retries = 0;
  const maxRetries = 50; // 最多尝试5秒（50 * 100ms）
  const checkInterval = setInterval(() => {
    if (trySetupNavMenuHandlers() || retries >= maxRetries) {
      clearInterval(checkInterval);
      if (retries >= maxRetries) {
        console.warn('[SPA] 导航菜单元素未找到，事件绑定失败');
      }
    }
    retries++;
  }, 100);
}

// 初始化应用（使用新架构）
async function initApp() {
  try {
    console.log('[SPA] 开始初始化应用（新架构）');

    // 创建应用实例
    app = createApp({
      apiService: window.ApiService
    });

    // 设置合同号选择对话框处理器（传递订单列表）
    app.setContractNoDialogHandler((orders) => showContractNoSelectDialog(orders || state.orders));

    // 设置特殊视图渲染函数
    app.setViewRenderers({
      'home': renderHome,
      'analytics': renderAnalytics,
      'settings': renderSettings
    });

    // 将视图渲染函数暴露到全局，供新架构调用
    window.renderHome = renderHome;
    window.renderSettings = renderSettings;
    window.renderAnalytics = renderAnalytics;
    // 保留兼容函数（虽然已移至 SettingsView，但可能在其他地方被调用）
    window.initDatabaseSettingsButtons = initDatabaseSettingsButtons;
    window.initUsersManagement = initUsersManagement;

    // 初始化视图实例
    settingsView = new SettingsView(window.ApiService);
    homeView = new HomeView({ apiService: window.ApiService });
    // AnalyticsView将在renderAnalytics中初始化，这里不提前创建

    // 初始化应用
    await app.init();

    // 将 viewLoader 暴露到全局，供其他模块使用
    if (app.router && app.router.viewLoader) {
      window.viewLoader = app.router.viewLoader;
    } else if (viewLoader) {
      window.viewLoader = viewLoader;
    }

    // 将 app 暴露到全局，供其他模块使用
    window.app = app;

    console.log('[SPA] 应用初始化完成（新架构）');
  } catch (error) {
    console.error('[SPA] 应用初始化失败:', error);
    // 如果新架构初始化失败，记录错误
  }
}

// 确保在 DOM 准备好后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[SPA] 模块已加载');
    // 初始化新架构（异步，不阻塞）
    initApp().catch(err => {
      console.error('[SPA] 新架构初始化失败:', err);
      window.NotificationSystem?.toast('应用初始化失败，请刷新页面重试', 'error', 5000);
    });
  });
} else {
  console.log('[SPA] 模块已加载');
  // 初始化新架构（异步，不阻塞）
  initApp().catch(err => {
    console.error('[SPA] 新架构初始化失败:', err);
    window.NotificationSystem?.toast('应用初始化失败，请刷新页面重试', 'error', 5000);
  });
}
