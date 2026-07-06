/**
 * 导出工具模块
 * 负责各种数据导出功能
 */

/**
 * 导出客户数据为CSV
 * @param {Array} customers - 客户数组
 * @param {Function} escapeHtml - HTML转义函数（可选，用于安全处理）
 */
export async function exportCustomersToCSV(customers = [], escapeHtml = (str) => String(str || '')) {
  try {
    if (!customers || customers.length === 0) {
      window.NotificationSystem?.toast('没有客户数据可导出', 'warning');
      return;
    }

    const headers = ['客户名称', '联系电话', '传真', '地址', '联系人', '交易额(USD)'];
    const csvContent = [
      headers.join(','),
      ...customers.map(c => [
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${(c.tel || '').replace(/"/g, '""')}"`,
        `"${(c.fax || '').replace(/"/g, '""')}"`,
        `"${(c.address || '').replace(/"/g, '""')}"`,
        `"${(c.contact || '').replace(/"/g, '""')}"`,
        c.totalUSD || 0
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `客户数据_${new Date().toISOString().slice(0, 10)}.csv`;

    const { FileExportService } = await import('../services/file-export-service.js');
    // 使用统一文件导出服务（支持 Tauri 文件对话框）
    await FileExportService.exportCSV(blob, fileName, {
      successMessage: `成功导出 ${customers.length} 条客户记录`
    });
  } catch (error) {
    console.error('导出客户数据失败:', error);
    window.NotificationSystem?.toast('导出失败，请重试', 'error');
  }
}

