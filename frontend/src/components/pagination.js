/**
 * 分页组件
 * 提供统一的分页UI和功能
 */

/**
 * 渲染分页控件
 * @param {HTMLElement} container - 分页控件容器
 * @param {Object} options - 分页选项
 * @param {number} options.currentPage - 当前页码
 * @param {number} options.totalPages - 总页数
 * @param {number} options.total - 总记录数
 * @param {number} options.pageSize - 每页数量
 * @param {Function} options.onPageChange - 页码改变回调函数 (page) => {}
 */
export function renderPagination(container, options) {
  if (!container) {
    console.warn('[Pagination] 容器元素未找到');
    return;
  }

  const { currentPage = 1, totalPages = 1, total = 0, pageSize = 20, onPageChange } = options;

  if (totalPages <= 1 && total <= pageSize) {
    // 如果只有一页或没有数据，不显示分页控件
    container.innerHTML = '';
    return;
  }

  // 计算显示的页码范围
  const maxVisiblePages = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage < maxVisiblePages - 1) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  // 计算当前页的数据范围
  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, total);

  const html = `
    <div class="pagination-container" style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      background: #fff;
      border-top: 1px solid #e5e7eb;
      margin-top: 16px;
    ">
      <div class="pagination-info" style="
        color: #6b7280;
        font-size: 14px;
      ">
        显示第 ${startRecord}-${endRecord} 条，共 ${total} 条
      </div>
      <div class="pagination-controls" style="
        display: flex;
        align-items: center;
        gap: 4px;
      ">
        <button class="pagination-btn" data-page="first" 
                ${currentPage === 1 ? 'disabled' : ''}
                style="
                  padding: 6px 12px;
                  border: 1px solid #d1d5db;
                  background: ${currentPage === 1 ? '#f3f4f6' : '#fff'};
                  color: ${currentPage === 1 ? '#9ca3af' : '#374151'};
                  cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'};
                  border-radius: 4px;
                  font-size: 14px;
                "
                ${currentPage === 1 ? '' : 'onclick="this.dispatchEvent(new CustomEvent(\'pagination-change\', {detail: {page: 1}}))"'}>
          首页
        </button>
        <button class="pagination-btn" data-page="prev" 
                ${currentPage === 1 ? 'disabled' : ''}
                style="
                  padding: 6px 12px;
                  border: 1px solid #d1d5db;
                  background: ${currentPage === 1 ? '#f3f4f6' : '#fff'};
                  color: ${currentPage === 1 ? '#9ca3af' : '#374151'};
                  cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'};
                  border-radius: 4px;
                  font-size: 14px;
                "
                ${currentPage === 1 ? '' : `onclick="this.dispatchEvent(new CustomEvent('pagination-change', {detail: {page: ${currentPage - 1}}}))"`}>
          上一页
        </button>
        
        ${startPage > 1 ? `
          <button class="pagination-btn" data-page="${startPage - 1}"
                  style="
                    padding: 6px 12px;
                    border: 1px solid #d1d5db;
                    background: #fff;
                    color: #374151;
                    cursor: pointer;
                    border-radius: 4px;
                    font-size: 14px;
                  "
                  onclick="this.dispatchEvent(new CustomEvent('pagination-change', {detail: {page: ${startPage - 1}}}))">
            ...
          </button>
        ` : ''}
        
        ${pages.map(page => `
          <button class="pagination-btn" data-page="${page}"
                  style="
                    padding: 6px 12px;
                    border: 1px solid #d1d5db;
                    background: ${page === currentPage ? '#3b82f6' : '#fff'};
                    color: ${page === currentPage ? '#fff' : '#374151'};
                    cursor: pointer;
                    border-radius: 4px;
                    font-size: 14px;
                    font-weight: ${page === currentPage ? '600' : '400'};
                  "
                  onclick="this.dispatchEvent(new CustomEvent('pagination-change', {detail: {page: ${page}}}))">
            ${page}
          </button>
        `).join('')}
        
        ${endPage < totalPages ? `
          <button class="pagination-btn" data-page="${endPage + 1}"
                  style="
                    padding: 6px 12px;
                    border: 1px solid #d1d5db;
                    background: #fff;
                    color: #374151;
                    cursor: pointer;
                    border-radius: 4px;
                    font-size: 14px;
                  "
                  onclick="this.dispatchEvent(new CustomEvent('pagination-change', {detail: {page: ${endPage + 1}}}))">
            ...
          </button>
        ` : ''}
        
        <button class="pagination-btn" data-page="next" 
                ${currentPage === totalPages ? 'disabled' : ''}
                style="
                  padding: 6px 12px;
                  border: 1px solid #d1d5db;
                  background: ${currentPage === totalPages ? '#f3f4f6' : '#fff'};
                  color: ${currentPage === totalPages ? '#9ca3af' : '#374151'};
                  cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'};
                  border-radius: 4px;
                  font-size: 14px;
                "
                ${currentPage === totalPages ? '' : `onclick="this.dispatchEvent(new CustomEvent('pagination-change', {detail: {page: ${currentPage + 1}}}))"`}>
          下一页
        </button>
        <button class="pagination-btn" data-page="last" 
                ${currentPage === totalPages ? 'disabled' : ''}
                style="
                  padding: 6px 12px;
                  border: 1px solid #d1d5db;
                  background: ${currentPage === totalPages ? '#f3f4f6' : '#fff'};
                  color: ${currentPage === totalPages ? '#9ca3af' : '#374151'};
                  cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'};
                  border-radius: 4px;
                  font-size: 14px;
                "
                ${currentPage === totalPages ? '' : `onclick="this.dispatchEvent(new CustomEvent('pagination-change', {detail: {page: ${totalPages}}}))"`}>
          末页
        </button>
        
        <div class="pagination-size-selector" style="
          margin-left: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          <span style="font-size: 14px; color: #6b7280;">每页</span>
          <select id="pagination-page-size" style="
            padding: 4px 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 14px;
          ">
            <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
            <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
          </select>
          <span style="font-size: 14px; color: #6b7280;">条</span>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // 绑定事件
  const buttons = container.querySelectorAll('.pagination-btn:not([disabled])');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const page = parseInt(btn.dataset.page) || parseInt(btn.textContent);
      if (page && page !== currentPage && onPageChange) {
        onPageChange(page);
      }
    });
  });

  // 绑定每页数量选择事件
  const sizeSelector = container.querySelector('#pagination-page-size');
  if (sizeSelector && onPageChange) {
    sizeSelector.addEventListener('change', (e) => {
      const newPageSize = parseInt(e.target.value);
      if (onPageChange) {
        // 重新计算当前页（保持显示的数据范围）
        const startRecord = (currentPage - 1) * pageSize + 1;
        const newPage = Math.ceil(startRecord / newPageSize);
        onPageChange(newPage, newPageSize);
      }
    });
  }

  // 使用自定义事件机制（兼容全局事件）
  container.addEventListener('pagination-change', (e) => {
    const { page, pageSize: newPageSize } = e.detail || {};
    if (page && onPageChange) {
      onPageChange(page, newPageSize);
    }
  });
}

/**
 * 创建分页容器（如果不存在）
 * @param {HTMLElement} parent - 父容器
 * @param {string} id - 容器ID
 * @returns {HTMLElement} 分页容器元素
 */
export function ensurePaginationContainer(parent, id = 'pagination-container') {
  let container = document.getElementById(id);
  if (!container && parent) {
    container = document.createElement('div');
    container.id = id;
    parent.appendChild(container);
  }
  return container;
}

