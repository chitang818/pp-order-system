/**
 * 操作日志管理模块
 * ES6 模块化版本
 */
let logs = [];
  let currentPage = 1;
  let pageSize = 20;
  let totalPages = 1;
  let totalCount = 0;

  // 获取Token
  function getToken() {
  return localStorage.getItem('token');
  }

  // Toast提示
  function showToast(message, type = 'info') {
  if (typeof window.NotificationSystem?.toast === "function") {
  window.NotificationSystem?.toast(message, type);
  } else {
  alert(message);
  }
  }

  // 加载操作日志
  async function loadLogs(page = 1) {
  const apiService = window.ApiService;
  if (!apiService) {
    console.error('[操作日志] ApiService 未定义');
    return;
  }

  // 获取筛选条件
  const module = document.getElementById('logFilterModule')?.value || '';
  const operation = document.getElementById('logFilterOperation')?.value || '';
  const timeRange = document.getElementById('logFilterTimeRange')?.value || '';

  // 计算时间范围
  let startDate = '';
  if (timeRange) {
  const now = new Date();
  if (timeRange === 'today') {
      startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
  } else if (timeRange === 'week') {
      startDate = new Date(now.setDate(now.getDate() - 7)).toISOString();
  } else if (timeRange === 'month') {
      startDate = new Date(now.setDate(now.getDate() - 30)).toISOString();
  }
  }

  try {
  const options = {
      page: page,
      pageSize: pageSize,
      module,
      operation,
      startDate
  };

  const result = await apiService.logs.list(options);

  // 统一处理返回结果：Tauri 和 HTTP 模式下数据结构可能不同
  // 使用新的 API 模块后，result 已经是实际的数据对象 { data, total, page... }
  if (result && result.data) {
      logs = result.data || [];
      currentPage = result.page || 1;
      totalPages = result.totalPages || 1;
      totalCount = result.total || 0;
      
      renderLogs();
      updatePagination();
  } else if (Array.isArray(result)) {
      // 兼容直接返回数组的情况
      logs = result;
      currentPage = 1;
      totalPages = 1;
      totalCount = result.length;
      renderLogs();
      updatePagination();
  } else {
      showToast(result?.message || '加载日志失败', 'error');
      // 即便失败也要调用一次渲染，以清除“加载中”状态并显示可能的“暂无数据”
      renderLogs();
  }
  } catch (error) {
  console.error('加载日志失败:', error);
  showToast(error.message || '网络错误', 'error');
  // 出错时也要清除“加载中”
  renderLogs();
  }
  }

  // 渲染日志列表
  function renderLogs() {
  const container = document.getElementById('logsTableContainer');
  if (!container) return;

  if (logs.length === 0) {
  container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #9ca3af;">
          <div style="font-size: 48px; margin-bottom: 12px;">📋</div>
          <div style="font-size: 16px;">暂无日志记录</div>
      </div>
  `;
  return;
  }

  const tableHTML = `
  <div style="overflow-x: auto;">
      <table class="table" style="width: 100%; min-width: 1000px;">
          <thead>
      <tr>
              <th style="width: 80px;">ID</th>
              <th style="width: 100px;">用户</th>
              <th style="width: 100px;">模块</th>
              <th style="width: 100px;">操作</th>
              <th style="width: 120px;">目标</th>
              <th style="width: 80px;">状态</th>
              <th style="width: 120px;">IP地址</th>
              <th style="width: 150px;">时间</th>
              <th style="width: 80px;">操作</th>
      </tr>
          </thead>
          <tbody>
      ${logs.map(log => `
              <tr>
        <td>${log.id}</td>
        <td><strong>${escapeHtml(log.username || '系统')}</strong></td>
        <td>
                  <span style="padding: 4px 8px; border-radius: 8px; font-size: 12px; background: ${getModuleColor(log.module)}">
          ${escapeHtml(log.module)}
                  </span>
        </td>
        <td>${escapeHtml(log.operation)}</td>
        <td title="${escapeHtml(log.target || '')}" style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtml(log.target || '-')}
        </td>
        <td>
                  <span style="padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: 500; ${log.status === 'success' ? 'background: #d1fae5; color: #065f46;' : 'background: #fee2e2; color: #991b1b;'}">
          ${log.status === 'success' ? '成功' : '失败'}
                  </span>
        </td>
        <td style="font-family: monospace; font-size: 12px;">${escapeHtml(log.ipAddress || '-')}</td>
        <td style="font-size: 12px;">${formatDateTime(log.createdAt)}</td>
        <td>
                  <button type="button" class="btn secondary small log-detail-btn" data-log-id="${log.id}">详情</button>
        </td>
              </tr>
      `).join('')}
          </tbody>
      </table>
  </div>
  `;

  container.innerHTML = tableHTML;
  container.querySelectorAll('button.log-detail-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-log-id'), 10);
      if (Number.isFinite(id)) {
        showLogDetail(id);
      }
    });
  });
  }

  // 获取模块颜色
  function getModuleColor(module) {
  const colors = {
  '认证': '#e0e7ff',
  '用户管理': '#fef3c7',
  '订单': '#d1fae5',
  '客户': '#dbeafe',
  '产品': '#fce7f3',
  '操作日志': '#f3e8ff'
  };
  return colors[module] || '#f3f4f6';
  }

  // 更新分页
  function updatePagination() {
  const currentPageEl = document.getElementById('logsCurrentPage');
  const totalPagesEl = document.getElementById('logsTotalPages');
  const prevBtn = document.getElementById('btnLogsPrevPage');
  const nextBtn = document.getElementById('btnLogsNextPage');

  if (currentPageEl) currentPageEl.textContent = currentPage;
  if (totalPagesEl) totalPagesEl.textContent = totalPages;

  if (prevBtn) {
  prevBtn.disabled = currentPage <= 1;
  }

  if (nextBtn) {
  nextBtn.disabled = currentPage >= totalPages;
  }
  }

  // 显示日志详情 - 使用统一弹窗模块
  async function showLogDetail(logId) {
  const log = logs.find(l => l.id === logId);
  if (!log) return;

  let details = {};
  try {
  details = JSON.parse(log.details || '{}');
  } catch (e) {
  details = {};
  }

  const bodyHTML = `
      <div style="display: grid; gap: 16px; max-height: 600px; overflow-y: auto;">
      <div class="settings-info-box">
              <div class="settings-info-icon">👤</div>
              <div class="settings-info-content">
        <div class="settings-info-title">操作用户</div>
        <div class="settings-info-text">${escapeHtml(log.username || '系统')}</div>
              </div>
      </div>

      <div class="settings-info-box">
              <div class="settings-info-icon">📦</div>
              <div class="settings-info-content">
        <div class="settings-info-title">模块 / 操作</div>
        <div class="settings-info-text">${escapeHtml(log.module)} - ${escapeHtml(log.operation)}</div>
              </div>
      </div>

      ${log.target ? `
              <div class="settings-info-box">
        <div class="settings-info-icon">🎯</div>
        <div class="settings-info-content">
                  <div class="settings-info-title">操作目标</div>
                  <div class="settings-info-text">${escapeHtml(log.target)}</div>
        </div>
              </div>
      ` : ''}

      <div class="settings-info-box">
              <div class="settings-info-icon">🌐</div>
              <div class="settings-info-content">
        <div class="settings-info-title">IP地址</div>
        <div class="settings-info-text" style="font-family: monospace;">${escapeHtml(log.ipAddress || '-')}</div>
              </div>
      </div>

      <div class="settings-info-box">
              <div class="settings-info-icon">⏰</div>
              <div class="settings-info-content">
        <div class="settings-info-title">操作时间</div>
        <div class="settings-info-text">${formatDateTime(log.createdAt)}</div>
              </div>
      </div>

      <div class="settings-info-box ${log.status === 'success' ? '' : 'danger'}">
              <div class="settings-info-icon">${log.status === 'success' ? '✅' : '❌'}</div>
              <div class="settings-info-content">
        <div class="settings-info-title">操作状态</div>
        <div class="settings-info-text">${log.status === 'success' ? '成功' : '失败'}</div>
        ${log.errorMessage ? `<div style="color: #991b1b; margin-top: 4px;">${escapeHtml(log.errorMessage)}</div>` : ''}
              </div>
      </div>

      ${log.userAgent ? `
              <div class="settings-info-box">
        <div class="settings-info-icon">💻</div>
        <div class="settings-info-content">
                  <div class="settings-info-title">User Agent</div>
                  <div class="settings-info-text" style="font-size: 12px; word-break: break-all;">${escapeHtml(log.userAgent)}</div>
        </div>
              </div>
      ` : ''}

      ${Object.keys(details).length > 0 ? `
              <div class="settings-info-box">
        <div class="settings-info-icon">📝</div>
        <div class="settings-info-content">
                  <div class="settings-info-title">详细信息</div>
                  <pre style="font-size: 12px; background: #f3f4f6; padding: 12px; border-radius: 8px; overflow-x: auto; max-width: 100%;">${JSON.stringify(details, null, 2)}</pre>
        </div>
              </div>
      ` : ''}
          </div>
  `;

  const footerHTML = `
      <button class="settings-btn secondary" data-action="cancel">关闭</button>
  `;

  await window.ModalDialog.custom(bodyHTML, {
      title: `日志详情 #${log.id}`,
      footer: footerHTML,
      size: 'medium',
      closable: true,
      clickOutsideToClose: true
  });
  }

  // HTML转义
  function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
  }

  // 格式化时间
  function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
  });
  }

  // 清空日志
  function clearAllLogs() {
  if (!confirm('确定要清空所有操作日志吗？\n此操作不可恢复！')) {
  return;
  }

  const apiService = window.ApiService;
  if (!apiService) {
    showToast('ApiService 未定义', 'error');
    return;
  }

  apiService.logs.clear()
  .then(result => {
  // 处理 Tauri 或 HTTP 返回格式
  // result 可能直接就是 { changes: N }
  if (result && (result.success !== false)) {
      showToast('清空成功', 'success');
      loadLogs(1);
  } else {
      showToast(result?.message || '清空失败', 'error');
  }
  })
  .catch(error => {
  console.error('清空日志失败:', error);
  showToast(error.message || '网络错误', 'error');
  });
  }

  // 初始化
  function init() {
  console.log('[操作日志] 模块初始化');
  // 监听页面切换
  const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
      const logsPage = document.getElementById('settingsLogsPage');
      if (logsPage && logsPage.style.display !== 'none') {
          console.log('[操作日志] 页面显示，加载数据');
          loadLogs(currentPage);
      }
  });
  });

  const logsPage = document.getElementById('settingsLogsPage');
  if (logsPage) {
  observer.observe(logsPage, { attributes: true, attributeFilter: ['style'] });
  
  // 如果页面当前已经是可见的，立即加载一次
  if (logsPage.style.display !== 'none') {
      console.log('[操作日志] 页面当前可见，立即加载数据');
      loadLogs(currentPage);
  }
  }

  // 搜索按钮
  const btnSearchLogs = document.getElementById('btnSearchLogs');
  if (btnSearchLogs) {
  btnSearchLogs.addEventListener('click', () => loadLogs(1));
  }

  // 重置筛选按钮
  const btnResetLogFilter = document.getElementById('btnResetLogFilter');
  if (btnResetLogFilter) {
  btnResetLogFilter.addEventListener('click', () => {
      document.getElementById('logFilterModule').value = '';
      document.getElementById('logFilterOperation').value = '';
      document.getElementById('logFilterTimeRange').value = '';
      loadLogs(1);
  });
  }

  // 清空日志按钮
  const btnClearLogs = document.getElementById('btnClearLogs');
  if (btnClearLogs) {
  btnClearLogs.addEventListener('click', clearAllLogs);
  }

  // 分页按钮
  const btnLogsPrevPage = document.getElementById('btnLogsPrevPage');
  if (btnLogsPrevPage) {
  btnLogsPrevPage.addEventListener('click', () => {
      if (currentPage > 1) {
          loadLogs(currentPage - 1);
      }
  });
  }

  const btnLogsNextPage = document.getElementById('btnLogsNextPage');
  if (btnLogsNextPage) {
  btnLogsNextPage.addEventListener('click', () => {
      if (currentPage < totalPages) {
          loadLogs(currentPage + 1);
      }
  });
  }
  }

  // 页面加载时初始化
  if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
  } else {
  init();
  }

// 导出模块
const LogManagement = {
  loadLogs,
  showLogDetail
};
export { LogManagement };

// 暴露到全局（保持向后兼容）
if (typeof window !== 'undefined') {
  window.LogManagement = LogManagement;
}
