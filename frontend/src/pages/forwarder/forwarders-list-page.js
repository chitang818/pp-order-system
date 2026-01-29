/**
 * 货代列表页面模块
 * 基于客户列表页面创建
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
 * 初始化货代列表页面
 * @param {Object} context - 上下文对象（包含 state, ApiService 等）
 */
export function initForwardersListPage(context) {
    const { state, ApiService } = context;

    console.log('[货代列表] 初始化货代列表页面');

    // 加载货代数据（使用分页）
    loadForwardersWithPagination(context, paginationState.currentPage, paginationState.pageSize);
}

/**
 * 使用分页加载货代数据
 */
function loadForwardersWithPagination(context, page = 1, pageSize = 20) {
    const { state, ApiService } = context;

    console.log(`[货代列表] 加载货代数据 - 页码: ${page}, 每页: ${pageSize}`);

    // 显示骨架屏
    const route = location.hash.replace('#/', '') || 'home';
    if (route === 'partners/forwarders' || route === 'forwarders') {
        renderForwardersSkeleton(10);
    }

    // 调用 API 获取分页数据
    ApiService.forwarders.list({ page, pageSize })
        .then(result => {
            console.log('[货代列表] API 返回数据:', result);

            // 判断返回的是分页结果还是数组
            if (result && typeof result === 'object' && 'data' in result) {
                // 分页结果
                state.forwarders = result.data || [];
                paginationState.currentPage = result.page || page;
                paginationState.pageSize = result.pageSize || pageSize;
                paginationState.total = result.total || 0;
                paginationState.totalPages = result.totalPages || 1;

                // 更新分页控件
                updatePagination(context);
            } else if (Array.isArray(result)) {
                // 数组结果（兼容旧版本）
                state.forwarders = result;
                paginationState.currentPage = 1;
                paginationState.pageSize = result.length;
                paginationState.total = result.length;
                paginationState.totalPages = 1;
            } else {
                state.forwarders = [];
            }

            // 渲染货代列表
            const route = location.hash.replace('#/', '') || 'home';
            if (route === 'partners/forwarders' || route === 'forwarders') {
                if (context.renderForwarders) {
                    context.renderForwarders();
                }
            }
        })
        .catch(error => {
            console.error('[货代列表] 加载货代数据失败:', error);
            state.forwarders = [];
            const tbody = document.getElementById('forwardersTbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #dc3545;">加载货代数据失败</td></tr>';
            }
        });
}

/**
 * 更新分页控件
 */
function updatePagination(context) {
    const container = document.getElementById('forwarders-pagination-container');

    if (!container) {
        // 如果容器不存在，尝试创建
        const forwardersTable = document.getElementById('forwardersTable');
        if (forwardersTable && forwardersTable.parentElement) {
            const paginationContainer = ensurePaginationContainer(forwardersTable.parentElement, 'forwarders-pagination-container');
            renderPagination(paginationContainer, {
                currentPage: paginationState.currentPage,
                totalPages: paginationState.totalPages,
                total: paginationState.total,
                pageSize: paginationState.pageSize,
                onPageChange: (page, newPageSize) => {
                    const pageSize = newPageSize || paginationState.pageSize;
                    loadForwardersWithPagination(context, page, pageSize);
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
            loadForwardersWithPagination(context, page, pageSize);
        }
    });
}

/**
 * 渲染货代骨架屏
 */
function renderForwardersSkeleton(rows = 10) {
    const tbody = document.getElementById('forwardersTbody');
    if (!tbody) return;
    const skeletonRows = Array.from({ length: rows }).map(() => `
    <tr class="skeleton-row">
      <td style="width:25%"><div class="skeleton-line" style="width: 60%"></div></td>
      <td style="width:20%"><div class="skeleton-line" style="width: 50%"></div></td>
      <td style="width:25%"><div class="skeleton-line" style="width: 70%"></div></td>
      <td style="width:15%"><div class="skeleton-line" style="width: 60%"></div></td>
      <td style="width:15%"><div class="skeleton-line short"></div></td>
    </tr>
  `).join('');
    tbody.innerHTML = skeletonRows;
}

/**
 * 刷新货代列表（兼容旧接口）
 */
export function refreshForwarders(context) {
    loadForwardersWithPagination(context, paginationState.currentPage, paginationState.pageSize);
}

/**
 * 刷新货代列表并渲染（兼容旧接口）
 */
export async function refreshForwardersAndRender(context) {
    await loadForwardersWithPagination(context, paginationState.currentPage, paginationState.pageSize);
}
