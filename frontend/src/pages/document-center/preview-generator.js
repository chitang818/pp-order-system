/**
 * 预览生成器模块
 * 将 generatePreview 函数拆分为多个小函数，提高可维护性
 */

import { DocumentCenterErrorHandler } from '../../utils/document-center-error-handler.js';
import { PerformanceMonitor } from '../../utils/performance-monitor.js';
import { TemplateService } from '../../components/document-center/template-service.js';
import { DocumentCenterValidator } from '../../utils/document-center-validator.js';
import { showFriendlyError } from '../../utils/document-center-error-helper.js';
import { DEFAULT_MARGIN, A4_SIZE, MM_TO_PX } from '../../constants/document-center.js';

/**
 * 准备预览数据
 * @param {Object} order - 订单对象
 * @returns {Promise<Object>} 包含订单、客户、公司的数据对象
 */
async function preparePreviewData(order) {
  return PerformanceMonitor.measureAsync('preparePreviewData', async () => {
    let customer = null;
    if (order.customerId) {
      const result = await DocumentCenterErrorHandler.safeAsync(
        () => window.ApiService?.customers?.get?.(order.customerId),
        'loadCustomer'
      );
      customer = result.success ? result.data : null;
    }

    let company = {};
    const companyResult = await DocumentCenterErrorHandler.safeAsync(
      () => window.ApiService?.company?.get?.(),
      'loadCompany'
    );
    company = companyResult.success ? (companyResult.data || {}) : {};

    return TemplateService.prepareData(order, customer, company);
  });
}

/**
 * 渲染模板HTML
 * @param {Object} template - 模板对象
 * @param {Object} data - 数据对象
 * @returns {Promise<string>} 渲染后的HTML字符串
 */
async function renderTemplateHTML(template, data) {
  return PerformanceMonitor.measureAsync('renderTemplateHTML', async () => {
    return await TemplateService.renderTemplate(template, data, {
      useNewEngine: true
    });
  });
}

/**
 * 创建临时iframe用于测量内容高度
 * @param {string} html - HTML内容
 * @returns {Promise<HTMLIFrameElement>} iframe元素
 */
function createTempIframe(html) {
  return new Promise((resolve, reject) => {
    const tempIframe = document.createElement('iframe');
    tempIframe.style.position = 'absolute';
    tempIframe.style.visibility = 'hidden';
    tempIframe.style.width = '210mm';
    tempIframe.style.height = '500mm';
    tempIframe.style.border = 'none';
    document.body.appendChild(tempIframe);

    const iframeDoc = tempIframe.contentDocument || tempIframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    tempIframe.onload = () => {
      resolve(tempIframe);
    };

    // 如果iframe已经加载完成
    if (iframeDoc.readyState === 'complete') {
      resolve(tempIframe);
    }

    // 超时处理
    setTimeout(() => {
      if (tempIframe.parentNode) {
        reject(new Error('iframe加载超时'));
      }
    }, 5000);
  });
}

/**
 * 清理临时iframe
 * @param {HTMLIFrameElement} iframe - iframe元素
 */
function cleanupIframe(iframe) {
  if (iframe && iframe.parentNode === document.body) {
    try {
      document.body.removeChild(iframe);
    } catch (e) {
      console.warn('[PreviewGenerator] 清理iframe失败:', e);
    }
  }
}

/**
 * 计算内容高度和分页信息
 * @param {HTMLIFrameElement} iframe - iframe元素
 * @param {Object} margin - 页边距对象
 * @returns {Object} { contentHeight, pageContentHeight, needsPagination }
 */
function calculatePagination(iframe, margin) {
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  const iframeBody = iframeDoc.body;
  
  if (!iframeBody) {
    throw new Error('无法获取iframe内容');
  }

  const bodyStyle = window.getComputedStyle(iframeBody);
  const bodyPaddingTop = parseFloat(bodyStyle.paddingTop) || 0;
  const bodyPaddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
  
  let contentHeight = iframeBody.scrollHeight;
  if (bodyPaddingTop > 0 || bodyPaddingBottom > 0) {
    contentHeight = contentHeight - bodyPaddingTop - bodyPaddingBottom;
  }
  
  const marginTop = margin.top || DEFAULT_MARGIN.top;
  const marginBottom = margin.bottom || DEFAULT_MARGIN.bottom;
  const a4HeightPx = A4_SIZE.HEIGHT * MM_TO_PX;
  const pageContentHeight = a4HeightPx - ((marginTop + marginBottom) * MM_TO_PX);
  
  return {
    contentHeight,
    pageContentHeight,
    needsPagination: contentHeight > pageContentHeight,
    iframeBody
  };
}

/**
 * 修复tfoot样式
 * @param {HTMLElement} tfoot - tfoot元素
 */
function fixTfootStyles(tfoot) {
  const tds = tfoot.querySelectorAll('td');
  tds.forEach(td => {
    const hasBr = td.querySelectorAll('br').length > 0 || td.innerHTML.includes('<br');
    if (hasBr) {
      // 移除可能冲突的样式
      let currentStyle = td.getAttribute('style') || '';
      currentStyle = currentStyle
        .replace(/white-space\s*:\s*[^;]+;?/gi, '')
        .replace(/word-wrap\s*:\s*[^;]+;?/gi, '')
        .replace(/overflow-wrap\s*:\s*[^;]+;?/gi, '');
      currentStyle = currentStyle.replace(/;\s*;/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '');
      currentStyle = (currentStyle ? currentStyle + '; ' : '') + 'white-space: normal !important; word-wrap: break-word !important; overflow-wrap: break-word !important;';
      td.setAttribute('style', currentStyle);
      
      // 通过 style 对象直接设置
      td.style.setProperty('white-space', 'normal', 'important');
      td.style.setProperty('word-wrap', 'break-word', 'important');
      td.style.setProperty('overflow-wrap', 'break-word', 'important');
    }
  });
}

/**
 * 渲染单页内容
 * @param {HTMLElement} pageEl - 页面元素
 * @param {HTMLElement} sourceBody - 源body元素
 * @param {Object} margin - 页边距对象
 */
function renderSinglePage(pageEl, sourceBody, margin) {
  // 清空页面，但保留页边距标记
  pageEl.innerHTML = '';
  
  // 重新添加页边距标记
  const marks = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  marks.forEach(pos => {
    const mark = document.createElement('div');
    mark.className = `margin-mark margin-mark-${pos}`;
    pageEl.appendChild(mark);
  });
  
  // 更新标记位置
  updatePreviewMarginMarks(pageEl, margin);
  
  // 应用页边距
  const marginTop = margin.top || DEFAULT_MARGIN.top;
  const marginBottom = margin.bottom || DEFAULT_MARGIN.bottom;
  const marginLeft = margin.left || DEFAULT_MARGIN.left;
  const marginRight = margin.right || DEFAULT_MARGIN.right;
  pageEl.style.padding = `${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm`;
  
  // 使用DocumentFragment批量操作
  const fragment = document.createDocumentFragment();
  const contentDiv = document.createElement('div');
  contentDiv.innerHTML = sourceBody.innerHTML;
  
  // 修复tfoot样式
  const tables = contentDiv.querySelectorAll('table');
  tables.forEach(table => {
    const tfoot = table.querySelector('tfoot');
    if (tfoot) {
      fixTfootStyles(tfoot);
    }
  });
  
  fragment.appendChild(contentDiv);
  pageEl.appendChild(fragment);
  
  // 确保内容可选择
  pageEl.style.userSelect = 'text';
  const allElements = pageEl.querySelectorAll('*');
  allElements.forEach(el => {
    el.style.userSelect = 'text';
  });
}

/**
 * 更新预览页面的页边距标记位置
 * @param {HTMLElement} pageElement - 页面元素
 * @param {Object} margin - 页边距对象
 */
function updatePreviewMarginMarks(pageElement, margin) {
  if (!pageElement) return;
  
  const marginTop = margin.top || 20;
  const marginBottom = margin.bottom || 20;
  const marginLeft = margin.left || 20;
  const marginRight = margin.right || 20;
  
  const positions = {
    'top-left': { top: `${marginTop}mm`, left: `${marginLeft}mm` },
    'top-right': { top: `${marginTop}mm`, right: `${marginRight}mm` },
    'bottom-left': { bottom: `${marginBottom}mm`, left: `${marginLeft}mm` },
    'bottom-right': { bottom: `${marginBottom}mm`, right: `${marginRight}mm` }
  };
  
  Object.entries(positions).forEach(([pos, style]) => {
    const mark = pageElement.querySelector(`.margin-mark-${pos}`);
    if (mark) {
      Object.assign(mark.style, style);
    }
  });
}

/**
 * 显示加载状态
 * @param {HTMLElement} pageEl - 页面元素
 * @param {string} message - 加载消息
 */
function showLoadingState(pageEl, message) {
  if (!pageEl) return;
  pageEl.innerHTML = `
    <div class="preview-empty-state">
      <div class="empty-icon">⏳</div>
      <p class="empty-text">${message}</p>
    </div>
  `;
}

/**
 * 生成预览（主函数）
 * @param {Object} params - 参数对象
 * @param {Object} params.order - 订单对象
 * @param {Object} params.template - 模板对象
 * @param {Function} params.onProgress - 进度回调函数
 * @returns {Promise<void>}
 */
export async function generatePreview({ order, template, onProgress }) {
  return PerformanceMonitor.measureAsync('generatePreview', async () => {
    // 数据验证
    const validation = DocumentCenterValidator.validatePreviewParams({
      order,
      template
    });

    if (!validation.valid) {
      DocumentCenterErrorHandler.handle(
        new Error(validation.errors.join('；')),
        'generatePreview',
        { customMessage: validation.errors.join('；') }
      );
      return;
    }

    const page1El = document.getElementById('documentPreviewPage1');
    const page2El = document.getElementById('documentPreviewPage2');
    
    // 显示初始加载状态
    showLoadingState(page1El, '正在加载模板...');
    if (page2El) {
      page2El.innerHTML = '';
      page2El.style.display = 'none';
    }

    let tempIframe = null;

    try {
      // 步骤1: 准备数据
      if (onProgress) onProgress(0, '准备数据...');
      const data = await preparePreviewData(order);

      // 步骤2: 渲染模板
      if (onProgress) onProgress(30, '渲染模板...');
      showLoadingState(page1El, '正在渲染模板...');
      const fullHtml = await renderTemplateHTML(template, data);

      // 步骤3: 创建临时iframe测量内容
      if (onProgress) onProgress(50, '分析内容...');
      tempIframe = await createTempIframe(fullHtml);
      
      const iframeDoc = tempIframe.contentDocument || tempIframe.contentWindow.document;
      const iframeBody = iframeDoc.body;
      
      if (!iframeBody) {
        throw new Error('无法获取iframe内容');
      }

      // 步骤4: 计算分页
      // 从模板中获取页边距，支持多种格式：
      // 1. 新格式V2: template.config.pageSettings.margin
      // 2. 新格式: template.config.margin
      // 3. 旧格式: template.margin
      let margin = DEFAULT_MARGIN;
      if (template?.config?.pageSettings?.margin) {
        margin = template.config.pageSettings.margin;
      } else if (template?.config?.margin) {
        margin = template.config.margin;
      } else if (template?.margin) {
        margin = template.margin;
      } else if (template?.pageSettings?.margin) {
        margin = template.pageSettings.margin;
      }
      
      const { contentHeight, pageContentHeight, needsPagination, iframeBody: body } = 
        calculatePagination(tempIframe, margin);

      // 步骤5: 渲染到预览窗口
      if (onProgress) onProgress(70, '生成预览...');
      
      if (!needsPagination) {
        // 单页显示
        renderSinglePage(page1El, body, margin);
        if (page2El) {
          page2El.style.display = 'none';
        }
      } else {
        // 分页显示（简化版，完整分页逻辑需要更复杂的实现）
        renderSinglePage(page1El, body, margin);
        // TODO: 实现完整的分页逻辑
        console.warn('[PreviewGenerator] 内容超过一页，分页功能待完善');
      }

      // 步骤6: 完成
      if (onProgress) onProgress(100, '完成');
      
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('预览生成成功', 'success');
      }

    } catch (error) {
      DocumentCenterErrorHandler.handle(error, 'generatePreview');
    } finally {
      // 清理临时iframe
      if (tempIframe) {
        cleanupIframe(tempIframe);
      }
    }
  });
}

