/**
 * 订单列表页面模块
 * 从 spa.js 中拆分出的订单列表相关逻辑
 */

import { renderPagination, ensurePaginationContainer } from '../../components/pagination.js';
import { updateNavigation } from '../../utils/navigation-utils.js';

// 分页状态
const paginationState = {
  currentPage: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
};

/**
 * 初始化订单列表页面
 * @param {Object} context - 上下文对象（包含 state, ApiService 等）
 */
export function initOrdersListPage(context) {
  const { state, ApiService, fmtMoney, fmtDateYMD } = context;
  
  console.log('[订单列表] 初始化订单列表页面');
  
  // 更新导航栏高亮状态
  updateNavigation('orders', 'list');
  
  // 绑定新建订单按钮
  bindNewOrderButton(context);
  
  // 绑定订单表格事件
  bindOrdersTbodyEvents(context);
  
  // 绑定全选复选框
  bindSelectAllCheckbox(context);
  
  // 初始化筛选功能
  setupQuickFilters(context);
  setupFilterToggle(context);
  
  // 加载订单数据（使用分页）
  loadOrdersWithPagination(context, paginationState.currentPage, paginationState.pageSize);
}

/**
 * 使用分页加载订单数据
 */
function loadOrdersWithPagination(context, page = 1, pageSize = 20) {
  const { state, ApiService } = context;
  
  console.log(`[订单列表] 加载订单数据 - 页码: ${page}, 每页: ${pageSize}`);
  
  // 显示骨架屏
  const route = location.hash.replace('#/', '') || 'home';
  const routeBase = route.split('/')[0];
  if (routeBase === 'orders') {
    renderOrdersSkeleton(10);
  }
  
  // 调用 API 获取分页数据
  ApiService.orders.list({ page, pageSize })
    .then(result => {
      console.log('[订单列表] API 返回数据:', result);
      
      // 判断返回的是分页结果还是数组
      if (result && typeof result === 'object' && 'data' in result) {
        // 分页结果
        state.orders = result.data || [];
        paginationState.currentPage = result.page || page;
        paginationState.pageSize = result.pageSize || pageSize;
        paginationState.total = result.total || 0;
        paginationState.totalPages = result.totalPages || 1;
        
        // 更新分页控件
        updatePagination(context);
      } else if (Array.isArray(result)) {
        // 数组结果（兼容旧版本）
        state.orders = result;
        paginationState.currentPage = 1;
        paginationState.pageSize = result.length;
        paginationState.total = result.length;
        paginationState.totalPages = 1;
      } else {
        state.orders = [];
      }
      
      // 渲染订单列表
      const route = location.hash.replace('#/', '') || 'home';
      const routeBase = route.split('/')[0];
      if (routeBase === 'orders') {
        renderOrders(context);
      }
    })
    .catch(error => {
      console.error('[订单列表] 加载订单数据失败:', error);
      state.orders = [];
      const tbody = document.getElementById('ordersTbody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px; color: #dc3545;"><div style="font-size: 16px; margin-bottom: 8px;">❌</div><div style="font-size: 14px;">加载订单数据失败</div></td></tr>';
      }
    });
}

/**
 * 更新分页控件
 */
function updatePagination(context) {
  const { state } = context;
  const container = document.getElementById('orders-pagination-container');
  
  if (!container) {
    // 如果容器不存在，尝试创建
    const ordersTable = document.getElementById('ordersTable');
    if (ordersTable && ordersTable.parentElement) {
      const paginationContainer = ensurePaginationContainer(ordersTable.parentElement, 'orders-pagination-container');
      renderPagination(paginationContainer, {
        currentPage: paginationState.currentPage,
        totalPages: paginationState.totalPages,
        total: paginationState.total,
        pageSize: paginationState.pageSize,
        onPageChange: (page, newPageSize) => {
          const pageSize = newPageSize || paginationState.pageSize;
          loadOrdersWithPagination(context, page, pageSize);
        }
      });
    }
    return;
  }
  
  renderPagination(container, {
    currentPage: paginationState.currentPage,
    totalPages: paginationState.totalPages,
    total: paginationState.total,
    pageSize: paginationState.pageSize,
    onPageChange: (page, newPageSize) => {
      const pageSize = newPageSize || paginationState.pageSize;
      loadOrdersWithPagination(context, page, pageSize);
    }
  });
}

/**
 * 渲染订单骨架屏
 */
function renderOrdersSkeleton(rows = 10) {
  const tbody = document.getElementById('ordersTbody');
  if (!tbody) return;
  const skeletonRows = Array.from({ length: rows }).map(() => `
    <tr class="skeleton-row">
      <td><div class="skeleton-box small"></div></td>
      <td><div class="skeleton-line"></div></td>
      <td style="text-align:center"><div class="skeleton-line short"></div></td>
      <td><div class="skeleton-line"></div></td>
      <td><div class="skeleton-line short"></div></td>
      <td><div class="skeleton-line"></div></td>
      <td><div class="skeleton-line"></div></td>
      <td><div class="skeleton-line short"></div></td>
      <td style="text-align:center"><div class="skeleton-line short"></div></td>
    </tr>
  `).join('');
  tbody.innerHTML = skeletonRows;
}

/**
 * 渲染订单列表
 */
function renderOrders(context) {
  // 这个函数需要从 spa.js 中提取
  // 暂时保持引用原函数
  if (context.renderOrders) {
    context.renderOrders();
  }
}

/**
 * 绑定新建订单按钮
 */
function bindNewOrderButton(context) {
  const btnNewOrder = document.getElementById("btnNewOrder");
  if (btnNewOrder && !btnNewOrder.hasAttribute('data-order-bound')) {
    btnNewOrder.setAttribute('data-order-bound', 'true');
    btnNewOrder.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.NotificationSystem?.toast('正在打开新建订单页面...', 'info', 1500);
      setTimeout(() => {
        location.hash = "#/orders/edit";
      }, 150);
    });
  }
}

/**
 * 绑定订单表格事件
 */
function bindOrdersTbodyEvents(context) {
  // 从 spa.js 中提取
  // 暂时保持引用
}

/**
 * 绑定全选复选框
 */
function bindSelectAllCheckbox(context) {
  // 从 spa.js 中提取
  // 暂时保持引用
}

/**
 * 设置快速筛选
 */
function setupQuickFilters(context) {
  // 从 spa.js 中提取
  // 暂时保持引用
}

/**
 * 设置筛选切换
 */
function setupFilterToggle(context) {
  // 从 spa.js 中提取
  // 暂时保持引用
}

/**
 * 刷新订单列表（兼容旧接口）
 */
export function refreshOrders(context) {
  loadOrdersWithPagination(context, paginationState.currentPage, paginationState.pageSize);
}

