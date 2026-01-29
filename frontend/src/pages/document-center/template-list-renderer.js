/**
 * 模板列表渲染器模块
 * 将 renderTemplateList 函数拆分为多个小函数，提高可维护性
 */

import { DocumentCenterUtils } from '../../utils/document-center-utils.js';
import { PerformanceMonitor } from '../../utils/performance-monitor.js';
import { DocumentCenterErrorHandler } from '../../utils/document-center-error-handler.js';
import { DOCUMENT_TYPE_NAMES } from '../../constants/document-center.js';

/**
 * 渲染验证状态HTML
 * @param {Object} status - 验证状态对象
 * @param {number} templateId - 模板ID
 * @returns {string} HTML字符串
 */
function renderValidationStatus(status, templateId) {
  if (status.hasDetails) {
    return `
      <span class="validation-status-clickable" data-template-id="${templateId}" 
            style="color: ${status.color}; cursor: pointer; text-decoration: underline; text-decoration-style: dotted;" 
            title="点击查看详情">
        ${status.icon} ${status.text}
      </span>
    `;
  }
  return `
    <span style="color: ${status.color};" title="${status.tooltip || ''}">
      ${status.icon} ${status.text}
    </span>
  `;
}

/**
 * 渲染操作按钮
 * @param {Object} template - 模板对象
 * @returns {string} HTML字符串
 */
function renderActionButtons(template) {
  const buttons = [
    { action: 'edit', icon: '✏️', title: '编辑', class: 'secondary' },
    { action: 'copy', icon: '📋', title: '复制', class: 'secondary' },
    { action: 'export', icon: '📤', title: '导出', class: 'secondary' }
  ];
  
  let html = buttons.map(btn => 
    `<button class="btn ${btn.class}" data-action="${btn.action}" data-id="${template.id}" 
             title="${btn.title}" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">
      ${btn.icon}
    </button>`
  ).join('');
  
  // 默认模板按钮
  if (!template.isDefault) {
    html += `<button class="btn secondary" data-action="setDefault" data-id="${template.id}" 
                     title="设为默认" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">⭐</button>`;
  } else {
    html += `<span title="默认模板" style="flex-shrink: 0; display: inline-block; min-width: 32px; text-align: center; font-size: 16px;">⭐</span>`;
  }
  
  // 删除按钮
  html += `<button class="btn danger" data-action="delete" data-id="${template.id}" 
                   title="删除" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">🗑️</button>`;
  
  return html;
}

/**
 * 渲染桌面端表格行
 * @param {Object} template - 模板对象
 * @param {Object} status - 验证状态
 * @returns {string} HTML字符串
 */
function renderDesktopTableRow(template, status) {
  return `
    <tr>
      <td style="padding: 12px; text-align: center; font-size: 13px;">
        <span class="template-name-copyable" data-template-name="${DocumentCenterUtils.escapeHtml(template.name)}" 
              style="cursor: pointer; user-select: text;" title="点击复制模板名称">
          ${DocumentCenterUtils.escapeHtml(template.name)}
        </span>
      </td>
      <td style="padding: 12px; text-align: center; font-size: 13px;">
        ${DOCUMENT_TYPE_NAMES[template.type] || template.type}
      </td>
      <td style="padding: 12px; text-align: center;">
        ${renderValidationStatus(status, template.id)}
      </td>
      <td style="padding: 12px; text-align: center; font-size: 13px; white-space: nowrap;">
        ${DocumentCenterUtils.formatDate(template.createdAt)}
      </td>
      <td style="padding: 12px; text-align: center; font-size: 13px; white-space: nowrap;">
        ${DocumentCenterUtils.formatDate(template.updatedAt)}
      </td>
      <td style="padding: 12px; text-align: center; font-size: 13px;">
        ${template.createdBy || '-'}
      </td>
      <td style="padding: 6px 4px; text-align: center; overflow: visible; position: relative; z-index: 10;">
        <div style="display: flex; gap: 4px; flex-wrap: nowrap; justify-content: center; align-items: center; overflow: visible; position: relative; z-index: 11;">
          ${renderActionButtons(template)}
        </div>
      </td>
    </tr>
  `;
}

/**
 * 渲染移动端卡片
 * @param {Object} template - 模板对象
 * @param {Object} status - 验证状态
 * @returns {string} HTML字符串
 */
function renderMobileCard(template, status) {
  return `
    <div class="template-card">
      <div class="template-card-header">
        <h3 class="template-card-title" data-template-name="${DocumentCenterUtils.escapeHtml(template.name)}" 
            style="cursor: pointer; user-select: text;" title="点击复制模板名称">
          ${DocumentCenterUtils.escapeHtml(template.name)}
        </h3>
        <div class="template-card-actions">
          ${!template.isDefault 
            ? `<button class="btn secondary" data-action="setDefault" data-id="${template.id}" title="设为默认">⭐</button>` 
            : '<span title="默认模板" style="font-size:18px;">⭐</span>'}
        </div>
      </div>
      <div class="template-card-content">
        <div class="template-card-item">
          <div class="template-card-label">✓ 验证状态</div>
          <div class="template-card-value" style="color: ${status.color};">
            ${renderValidationStatus(status, template.id)}
          </div>
        </div>
        <div class="template-card-item">
          <div class="template-card-label">📑 类型</div>
          <div class="template-card-value">${DOCUMENT_TYPE_NAMES[template.type] || template.type}</div>
        </div>
        <div class="template-card-item">
          <div class="template-card-label">📅 创建时间</div>
          <div class="template-card-value">${DocumentCenterUtils.formatDate(template.createdAt)}</div>
        </div>
        <div class="template-card-item">
          <div class="template-card-label">👤 创建人</div>
          <div class="template-card-value">${template.createdBy || '-'}</div>
        </div>
        <div class="template-card-item">
          <div class="template-card-label">🔄 最后修改</div>
          <div class="template-card-value">${DocumentCenterUtils.formatDate(template.updatedAt)}</div>
        </div>
      </div>
      <div class="template-card-footer">
        <button class="btn secondary" data-action="edit" data-id="${template.id}" title="编辑">✏️ 编辑</button>
        <button class="btn secondary" data-action="copy" data-id="${template.id}" title="复制">📋 复制</button>
        <button class="btn secondary" data-action="export" data-id="${template.id}" title="导出">📤 导出</button>
        <button class="btn danger" data-action="delete" data-id="${template.id}" title="删除">🗑️ 删除</button>
      </div>
    </div>
  `;
}

/**
 * 批量加载验证状态（使用并发控制）
 * @param {Array<Object>} templates - 模板数组
 * @param {Function} getValidationStatus - 获取验证状态的函数
 * @param {number} batchSize - 批次大小
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<Array>} 包含模板和状态的数组
 */
async function loadValidationStatusesBatch(templates, getValidationStatus, batchSize = 5, onProgress) {
  const results = [];
  
  for (let i = 0; i < templates.length; i += batchSize) {
    const batch = templates.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(template => 
        getValidationStatus(template).then(status => ({ template, status }))
      )
    );
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // 验证失败时使用默认状态
        results.push({
          template: batch[index],
          status: {
            icon: '⏳',
            text: '验证中...',
            color: '#64748b',
            hasDetails: false
          }
        });
      }
    });
    
    // 更新进度
    if (onProgress) {
      onProgress(i + batch.length, templates.length);
    }
  }
  
  return results;
}

/**
 * 渲染空状态
 * @param {HTMLElement} container - 容器元素
 * @param {HTMLElement} tbody - tbody元素
 * @param {boolean} isMobile - 是否为移动端
 */
function renderEmptyState(container, tbody, isMobile) {
  if (isMobile) {
    const cardsContainer = container.querySelector('.template-cards-container');
    if (cardsContainer) {
      cardsContainer.innerHTML = '<div style="text-align:center; padding:40px 20px; color:#999; font-size:14px;">暂无模板</div>';
    } else {
      container.innerHTML = '<div class="template-cards-container"><div style="text-align:center; padding:40px 20px; color:#999; font-size:14px;">暂无模板</div></div>';
    }
  } else {
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#999;">暂无模板</td></tr>';
    }
  }
}

/**
 * 准备移动端容器
 * @param {HTMLElement} container - 容器元素
 * @returns {HTMLElement} 卡片容器
 */
function prepareMobileContainer(container) {
  let cardsContainer = container.querySelector('.template-cards-container');
  if (!cardsContainer) {
    const table = container.querySelector('#templateListTable');
    if (table) {
      table.style.display = 'none';
    }
    cardsContainer = document.createElement('div');
    cardsContainer.className = 'template-cards-container';
    container.appendChild(cardsContainer);
  }
  return cardsContainer;
}

/**
 * 准备桌面端容器
 * @param {HTMLElement} container - 容器元素
 * @returns {HTMLElement} tbody元素
 */
function prepareDesktopContainer(container) {
  const cardsContainer = container.querySelector('.template-cards-container');
  if (cardsContainer) {
    cardsContainer.remove();
  }
  const table = container.querySelector('#templateListTable');
  if (table) {
    table.style.display = '';
  }
  return document.getElementById('templateListBody');
}

/**
 * 渲染移动端视图
 * @param {HTMLElement} container - 容器元素
 * @param {Array<Object>} templates - 模板数组
 * @param {Function} getValidationStatus - 获取验证状态的函数
 * @param {Function} onProgress - 进度回调
 */
async function renderMobileView(container, templates, getValidationStatus, onProgress) {
  const cardsContainer = prepareMobileContainer(container);
  
  // 显示加载状态
  cardsContainer.innerHTML = '<div style="text-align:center; padding:40px 20px; color:#999; font-size:14px;">加载中...</div>';
  
  try {
    // 批量加载验证状态
    const results = await loadValidationStatusesBatch(
      templates,
      getValidationStatus,
      5,
      onProgress
    );
    
    // 渲染卡片
    cardsContainer.innerHTML = results
      .map(({ template, status }) => renderMobileCard(template, status))
      .join('');
  } catch (error) {
    DocumentCenterErrorHandler.handle(error, 'renderMobileView');
    // 显示错误状态
    cardsContainer.innerHTML = '<div style="text-align:center; padding:40px 20px; color:#ef4444; font-size:14px;">加载失败，请刷新重试</div>';
  }
}

/**
 * 渲染桌面端视图
 * @param {HTMLElement} tbody - tbody元素
 * @param {Array<Object>} templates - 模板数组
 * @param {Function} getValidationStatus - 获取验证状态的函数
 * @param {Function} onProgress - 进度回调
 */
async function renderDesktopView(tbody, templates, getValidationStatus, onProgress) {
  if (!tbody) return;
  
  // 显示加载状态
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#999;">加载中...</td></tr>';
  
  try {
    // 批量加载验证状态
    const results = await loadValidationStatusesBatch(
      templates,
      getValidationStatus,
      5,
      onProgress
    );
    
    // 使用DocumentFragment批量操作
    // 注意：不能使用div来解析tr元素，必须使用table/tbody
    const fragment = document.createDocumentFragment();
    const tempTable = document.createElement('table');
    const tempTbody = document.createElement('tbody');
    tempTbody.innerHTML = results
      .map(({ template, status }) => renderDesktopTableRow(template, status))
      .join('');
    tempTable.appendChild(tempTbody);
    
    // 从临时tbody中提取所有tr元素
    while (tempTbody.firstChild) {
      fragment.appendChild(tempTbody.firstChild);
    }
    
    // 清空并插入新内容
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  } catch (error) {
    DocumentCenterErrorHandler.handle(error, 'renderDesktopView');
    // 显示错误状态
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">加载失败，请刷新重试</td></tr>';
  }
}

/**
 * 渲染模板列表（主函数）
 * @param {Object} params - 参数对象
 * @param {Array<Object>} params.templates - 模板数组
 * @param {Function} params.getValidationStatus - 获取验证状态的函数
 * @param {Function} params.onProgress - 进度回调
 * @param {Function} params.ensureEventBinding - 确保事件绑定的函数
 */
export async function renderTemplateList({ templates, getValidationStatus, onProgress, ensureEventBinding }) {
  return PerformanceMonitor.measureAsync('renderTemplateList', async () => {
    const tbody = document.getElementById('templateListBody');
    const container = document.querySelector('.template-list-container');
    
    if (!tbody || !container) {
      console.warn('[TemplateListRenderer] 容器元素未找到');
      return;
    }
    
    // 确保事件绑定
    if (ensureEventBinding) {
      setTimeout(ensureEventBinding, 50);
    }
    
    // 检测设备类型
    const isMobile = DocumentCenterUtils.isMobile();
    
    // 处理空列表
    if (!templates || templates.length === 0) {
      renderEmptyState(container, tbody, isMobile);
      return;
    }
    
    // 根据设备类型渲染
    if (isMobile) {
      await renderMobileView(container, templates, getValidationStatus, onProgress);
    } else {
      const desktopTbody = prepareDesktopContainer(container);
      await renderDesktopView(desktopTbody, templates, getValidationStatus, onProgress);
    }
  });
}

