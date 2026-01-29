/**
 * 单据中心错误消息辅助工具
 * 提供用户友好的错误提示
 */

/**
 * 获取用户友好的错误消息
 * @param {Error|string} error - 错误对象或错误消息
 * @param {string} context - 错误上下文（如：'loadOrders', 'exportPDF'）
 * @returns {string} 用户友好的错误消息
 */
export function getFriendlyErrorMessage(error, context = '') {
  let errorMessage = '';
  
  // 提取错误消息
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error?.message) {
    errorMessage = error.message;
  } else if (error?.details?.message) {
    errorMessage = error.details.message;
  } else {
    errorMessage = '未知错误';
  }
  
  // 错误消息映射表
  const errorMap = {
    // 网络错误
    'NetworkError': '网络连接失败，请检查网络设置后重试',
    'Failed to fetch': '网络连接失败，请检查网络设置后重试',
    'Network request failed': '网络请求失败，请检查网络连接',
    
    // HTTP状态码错误
    '404': '请求的资源不存在',
    '500': '服务器错误，请稍后重试',
    '503': '服务暂时不可用，请稍后重试',
    
    // 业务错误
    '订单不存在': '订单不存在或已被删除',
    '模板不存在': '模板不存在或已被删除',
    '订单或模板未选择': '请先选择订单和模板',
    '模板内容不能为空': '模板内容不能为空，请编辑模板',
    
    // 导出错误
    '导出PDF失败': 'PDF导出失败，请稍后重试',
    '导出Word失败': 'Word导出失败，请稍后重试',
    '导出Excel失败': 'Excel导出失败，请稍后重试',
  };
  
  // 检查是否有匹配的错误消息
  for (const [key, value] of Object.entries(errorMap)) {
    if (errorMessage.includes(key) || errorMessage === key) {
      return value;
    }
  }
  
  // 根据上下文添加提示
  const contextMessages = {
    'loadOrders': '加载订单列表失败',
    'loadOrder': '加载订单详情失败',
    'loadTemplates': '加载模板列表失败',
    'loadTemplate': '加载模板详情失败',
    'generatePreview': '生成预览失败',
    'exportPDF': '导出PDF失败',
    'exportWord': '导出Word失败',
    'exportExcel': '导出Excel失败',
  };
  
  const contextMessage = contextMessages[context] || '操作失败';
  
  // 如果错误消息包含技术细节，提取主要部分
  if (errorMessage.length > 100) {
    return `${contextMessage}，请稍后重试`;
  }
  
  // 返回原始错误消息，但添加上下文
  return `${contextMessage}: ${errorMessage}`;
}

/**
 * 显示友好的错误提示
 * @param {Error|string} error - 错误对象或错误消息
 * @param {string} context - 错误上下文
 */
export function showFriendlyError(error, context = '') {
  const message = getFriendlyErrorMessage(error, context);
  
  if (window.NotificationSystem) {
    window.NotificationSystem.toast(message, 'error');
  } else {
    console.error(`[DocumentCenter] ${context}:`, error);
    alert(message);
  }
}

/**
 * 显示加载状态
 * @param {HTMLElement} element - 要显示加载状态的元素
 * @param {string} loadingText - 加载文本，默认为"加载中..."
 */
export function showLoadingState(element, loadingText = '加载中...') {
  if (!element) return;
  
  element.disabled = true;
  if (element.tagName === 'SELECT') {
    const originalHTML = element.innerHTML;
    element.innerHTML = `<option value="">${loadingText}</option>`;
    element._originalHTML = originalHTML;
  } else if (element.tagName === 'BUTTON') {
    const originalText = element.textContent;
    element.textContent = loadingText;
    element._originalText = originalText;
  }
}

/**
 * 恢复元素状态（加载完成后）
 * @param {HTMLElement} element - 要恢复的元素
 * @param {string} errorText - 错误时的文本，默认为"加载失败"
 */
export function restoreElementState(element, errorText = '加载失败') {
  if (!element) return;
  
  element.disabled = false;
  
  if (element.tagName === 'SELECT') {
    if (element._originalHTML) {
      element.innerHTML = element._originalHTML;
      delete element._originalHTML;
    } else {
      element.innerHTML = `<option value="">${errorText}</option>`;
    }
  } else if (element.tagName === 'BUTTON') {
    if (element._originalText) {
      element.textContent = element._originalText;
      delete element._originalText;
    }
  }
}

