/**
 * 客户列表页面模块
 * 从 spa.js 中拆分出的客户列表相关逻辑
 */

import { renderPagination, ensurePaginationContainer } from '../../components/pagination.js';

// 分页状态
const paginationState = {
  currentPage: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
};

/**
 * 初始化客户列表页面
 * @param {Object} context - 上下文对象（包含 state, ApiService 等）
 */
export function initCustomersListPage(context) {
  const { state, ApiService } = context;
  
  console.log('[客户列表] 初始化客户列表页面');
  
  // 加载客户数据（使用分页）
  loadCustomersWithPagination(context, paginationState.currentPage, paginationState.pageSize);
}

/**
 * 使用分页加载客户数据
 */
function loadCustomersWithPagination(context, page = 1, pageSize = 20) {
  const { state, ApiService } = context;
  
  console.log(`[客户列表] 加载客户数据 - 页码: ${page}, 每页: ${pageSize}`);
  
  // 显示骨架屏
  const route = location.hash.replace('#/', '') || 'home';
  if (route === 'customers') {
    renderCustomersSkeleton(10);
  }
  
  // 调用 API 获取分页数据
  ApiService.customers.list({ page, pageSize })
    .then(result => {
      console.log('[客户列表] API 返回数据:', result);
      
      // 判断返回的是分页结果还是数组
      if (result && typeof result === 'object' && 'data' in result) {
        // 分页结果
        state.customers = result.data || [];
        paginationState.currentPage = result.page || page;
        paginationState.pageSize = result.pageSize || pageSize;
        paginationState.total = result.total || 0;
        paginationState.totalPages = result.totalPages || 1;
        
        // 更新分页控件
        updatePagination(context);
      } else if (Array.isArray(result)) {
        // 数组结果（兼容旧版本）
        state.customers = result;
        paginationState.currentPage = 1;
        paginationState.pageSize = result.length;
        paginationState.total = result.length;
        paginationState.totalPages = 1;
      } else {
        state.customers = [];
      }
      
      // 渲染客户列表
      const route = location.hash.replace('#/', '') || 'home';
      if (route === 'customers' || route === 'orders') {
        if (context.renderCustomers) {
          context.renderCustomers();
        }
        if (context.renderCustomerSelect) {
          context.renderCustomerSelect();
        }
      }
    })
    .catch(error => {
      console.error('[客户列表] 加载客户数据失败:', error);
      state.customers = [];
      const tbody = document.getElementById('customersTbody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #dc3545;">加载客户数据失败</td></tr>';
      }
    });
}

/**
 * 更新分页控件
 */
function updatePagination(context) {
  const container = document.getElementById('customers-pagination-container');
  
  if (!container) {
    // 如果容器不存在，尝试创建
    const customersTable = document.getElementById('customersTable');
    if (customersTable && customersTable.parentElement) {
      const paginationContainer = ensurePaginationContainer(customersTable.parentElement, 'customers-pagination-container');
      renderPagination(paginationContainer, {
        currentPage: paginationState.currentPage,
        totalPages: paginationState.totalPages,
        total: paginationState.total,
        pageSize: paginationState.pageSize,
        onPageChange: (page, newPageSize) => {
          const pageSize = newPageSize || paginationState.pageSize;
          loadCustomersWithPagination(context, page, pageSize);
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
      loadCustomersWithPagination(context, page, pageSize);
    }
  });
}

/**
 * 渲染客户骨架屏
 */
function renderCustomersSkeleton(rows = 10) {
  const tbody = document.getElementById('customersTbody');
  if (!tbody) return;
  const skeletonRows = Array.from({ length: rows }).map(() => `
    <tr class="skeleton-row">
      <td style="width:25%"><div class="skeleton-line" style="width: 60%"></div></td>
      <td style="width:20%"><div class="skeleton-line" style="width: 50%"></div></td>
      <td style="width:25%"><div class="skeleton-line" style="width: 70%"></div></td>
      <td style="width:15%"><div class="skeleton-line short"></div></td>
      <td style="width:15%"><div class="skeleton-line short"></div></td>
    </tr>
  `).join('');
  tbody.innerHTML = skeletonRows;
}

/**
 * 刷新客户列表（兼容旧接口）
 */
export function refreshCustomers(context) {
  loadCustomersWithPagination(context, paginationState.currentPage, paginationState.pageSize);
}

/**
 * 刷新客户列表并渲染（兼容旧接口）
 */
export async function refreshCustomersAndRender(context) {
  await loadCustomersWithPagination(context, paginationState.currentPage, paginationState.pageSize);
}

