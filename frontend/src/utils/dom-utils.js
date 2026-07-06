/**
 * DOM 操作工具函数
 * 提供各种 DOM 操作和渲染功能
 * ES6 模块化版本
 */

/**
 * 解析订单编辑根节点。
 * 优先从锚点元素向上查找 #view-orders-edit，再退回全局 getElementById。
 * 在 Tauri WebView 的 SPA 环境下，全局 ID 查询可能命中隐藏视图，使用此函数可避免此问题。
 * @param {Element|null} anchorEl - 与当前操作相关的 DOM 元素（表格行、输入框等）
 * @returns {Element|null}
 */
export function resolveOrderEditRoot(anchorEl) {
  if (anchorEl) {
    const fromAnchor = anchorEl.closest('#view-orders-edit');
    if (fromAnchor) return fromAnchor;
  }
  const activeView = document.querySelector('#view-orders-edit.view-active');
  if (activeView) return activeView;
  return document.getElementById('view-orders-edit');
}

/**
 * 渲染订单列表骨架屏
 * @param {number} rows - 骨架屏行数，默认 10
 */
export function renderOrdersSkeleton(rows = 10) {
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
 * 渲染客户列表骨架屏
 * @param {number} rows - 骨架屏行数，默认 10
 */
export function renderCustomersSkeleton(rows = 10) {
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
 * 获取状态类名
 * @param {string} status - 订单状态
 * @returns {string} 状态对应的 CSS 类名
 */
export function getStatusClass(status) {
  const statusMap = {
    '已创建': 'status-created',
    '已排产': 'status-scheduled',
    '已发货': 'status-shipped',
    '已完成': 'status-completed',
    '已取消': 'status-cancelled'
  };
  return statusMap[status] || 'status-default';
}

/**
 * 安全地设置元素内容
 * @param {HTMLElement} element - 目标元素
 * @param {string} content - 要设置的内容（会自动转义）
 */
export function setTextContent(element, content) {
  if (!element) return;
  element.textContent = content || '';
}

/**
 * 安全地设置元素 HTML（需要手动转义）
 * @param {HTMLElement} element - 目标元素
 * @param {string} html - 要设置的 HTML
 * @param {boolean} escape - 是否转义，默认 false
 */
export function setInnerHTML(element, html, escape = false) {
  if (!element) return;
  if (escape) {
    const div = document.createElement('div');
    div.textContent = html;
    element.innerHTML = div.innerHTML;
  } else {
    element.innerHTML = html || '';
  }
}

/**
 * 创建元素
 * @param {string} tag - 标签名
 * @param {Object} attributes - 属性对象
 * @param {string|HTMLElement} content - 内容（字符串或元素）
 * @returns {HTMLElement} 创建的元素
 */
export function createElement(tag, attributes = {}, content = null) {
  const element = document.createElement(tag);
  
  // 设置属性
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('data-')) {
      element.setAttribute(key, value);
    } else {
      element[key] = value;
    }
  });
  
  // 设置内容
  if (content !== null) {
    if (typeof content === 'string') {
      element.textContent = content;
    } else if (content instanceof HTMLElement) {
      element.appendChild(content);
    }
  }
  
  return element;
}

/**
 * 批量更新元素属性
 * @param {HTMLElement} element - 目标元素
 * @param {Object} attributes - 属性对象
 */
export function updateAttributes(element, attributes) {
  if (!element) return;
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else {
      element.setAttribute(key, value);
    }
  });
}

/**
 * 切换元素显示/隐藏
 * @param {HTMLElement} element - 目标元素
 * @param {boolean} show - 是否显示，默认 true
 */
export function toggleVisibility(element, show = true) {
  if (!element) return;
  element.style.display = show ? '' : 'none';
}

/**
 * 添加/移除 CSS 类
 * @param {HTMLElement} element - 目标元素
 * @param {string} className - CSS 类名
 * @param {boolean} add - 是否添加，默认 true
 */
export function toggleClass(element, className, add = true) {
  if (!element) return;
  if (add) {
    element.classList.add(className);
  } else {
    element.classList.remove(className);
  }
}

/**
 * 使用 DocumentFragment 批量创建元素
 * 性能优化：避免多次 DOM 操作，减少重排和重绘
 * @param {string} html - HTML 字符串
 * @returns {DocumentFragment} DocumentFragment 对象
 */
export function createFragmentFromHTML(html) {
  const fragment = document.createDocumentFragment();
  
  // 检查是否是表格行（<tr>）
  const isTableRow = html.trim().startsWith('<tr');
  
  if (isTableRow) {
    // 对于表格行，使用 tbody 作为临时容器
    const temp = document.createElement('tbody');
    temp.innerHTML = html;
    
    // 将临时容器中的所有子节点移动到 fragment
    while (temp.firstChild) {
      fragment.appendChild(temp.firstChild);
    }
  } else {
    // 对于其他元素，使用 div 作为临时容器
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // 将临时容器中的所有子节点移动到 fragment
    while (temp.firstChild) {
      fragment.appendChild(temp.firstChild);
    }
  }
  
  return fragment;
}

/**
 * 使用 DocumentFragment 高效渲染表格行
 * @param {HTMLElement} tbody - 表格 tbody 元素
 * @param {Array<string>} rowHTMLs - 行 HTML 字符串数组
 */
export function renderTableRows(tbody, rowHTMLs) {
  if (!tbody) {
    console.warn('[renderTableRows] tbody 元素未找到');
    return;
  }
  
  // 清空现有内容
  tbody.innerHTML = '';
  
  if (!rowHTMLs || rowHTMLs.length === 0) {
    console.warn('[renderTableRows] 没有行数据');
    return;
  }
  
  // 对于表格行，直接使用 tbody 的 innerHTML 更可靠
  // 因为浏览器对表格结构的处理更严格
  try {
    const html = rowHTMLs.join('');
    tbody.innerHTML = html;
    
    // 验证渲染结果
    const renderedRows = tbody.querySelectorAll('tr');
    if (renderedRows.length === 0) {
      console.error('[renderTableRows] 渲染失败，tbody.innerHTML 后没有找到 tr 元素');
      console.error('[renderTableRows] HTML 内容:', html.substring(0, 200));
    } else {
      console.log(`[renderTableRows] 成功渲染 ${renderedRows.length} 行`);
    }
  } catch (error) {
    console.error('[renderTableRows] 渲染异常:', error);
    // 降级方案：逐行添加
    rowHTMLs.forEach((rowHTML, index) => {
      try {
        const temp = document.createElement('tbody');
        temp.innerHTML = rowHTML;
        if (temp.firstChild) {
          tbody.appendChild(temp.firstChild);
        }
      } catch (e) {
        console.error(`[renderTableRows] 渲染第 ${index + 1} 行失败:`, e);
      }
    });
  }
}

/**
 * 使用 DocumentFragment 高效渲染单个 HTML 字符串
 * @param {HTMLElement} container - 容器元素
 * @param {string} html - HTML 字符串
 */
export function renderHTML(container, html) {
  if (!container) return;
  
  // 对于简单内容，直接使用 innerHTML
  // 对于复杂内容（多个元素），使用 DocumentFragment
  if (html.trim().startsWith('<') && html.includes('>')) {
    const fragment = createFragmentFromHTML(html);
    container.innerHTML = '';
    container.appendChild(fragment);
  } else {
    container.innerHTML = html;
  }
}

/**
 * 增量更新表格行
 * 只更新变化的部分，提升性能
 * @param {HTMLElement} tbody - 表格 tbody 元素
 * @param {Array} newData - 新数据数组
 * @param {Array} oldData - 旧数据数组（可选，如果不提供则全量更新）
 * @param {Function} renderRow - 渲染单行的函数，接收 (item, index) 返回 HTML 字符串
 * @param {Function} getItemId - 获取项目ID的函数，接收 (item) 返回唯一标识符
 * @returns {Object} 更新统计 { added: 新增数量, updated: 更新数量, removed: 删除数量 }
 */
export function incrementalUpdateTableRows(tbody, newData, oldData, renderRow, getItemId) {
  if (!tbody || !renderRow || !getItemId) {
    console.warn('[incrementalUpdateTableRows] 参数不完整，使用全量更新');
    const rowHTMLs = newData.map((item, index) => renderRow(item, index));
    renderTableRows(tbody, rowHTMLs);
    return { added: newData.length, updated: 0, removed: 0 };
  }
  
  // 如果没有旧数据，使用全量更新
  if (!oldData || oldData.length === 0) {
    const rowHTMLs = newData.map((item, index) => renderRow(item, index));
    renderTableRows(tbody, rowHTMLs);
    return { added: newData.length, updated: 0, removed: 0 };
  }
  
  // 创建数据映射：ID -> 数据项
  const oldDataMap = new Map();
  oldData.forEach((item, index) => {
    const id = getItemId(item);
    if (id != null) {
      oldDataMap.set(String(id), { item, index });
    }
  });
  
  const newDataMap = new Map();
  newData.forEach((item, index) => {
    const id = getItemId(item);
    if (id != null) {
      newDataMap.set(String(id), { item, index });
    }
  });
  
  // 获取现有行
  const existingRows = Array.from(tbody.querySelectorAll('tr'));
  const existingRowsMap = new Map();
  existingRows.forEach((row, index) => {
    const checkbox = row.querySelector('input[data-order-id], input[data-id]');
    if (checkbox) {
      const id = checkbox.getAttribute('data-order-id') || checkbox.getAttribute('data-id');
      if (id) {
        existingRowsMap.set(id, { row, index });
      }
    }
  });
  
  let added = 0;
  let updated = 0;
  let removed = 0;
  
  // 处理新增和更新
  newData.forEach((newItem, newIndex) => {
    const id = String(getItemId(newItem) || '');
    const oldItemData = oldDataMap.get(id);
    const existingRowData = existingRowsMap.get(id);
    
    if (!oldItemData) {
      // 新增项
      const rowHTML = renderRow(newItem, newIndex);
      const temp = document.createElement('tbody');
      temp.innerHTML = rowHTML;
      if (temp.firstChild) {
        // 插入到正确位置
        if (newIndex < existingRows.length) {
          tbody.insertBefore(temp.firstChild, existingRows[newIndex] || null);
        } else {
          tbody.appendChild(temp.firstChild);
        }
        added++;
      }
    } else if (existingRowData) {
      // 检查是否需要更新（简单比较：如果数据引用相同，可能不需要更新）
      // 这里简化处理：如果位置变化或数据可能变化，则更新
      const needsUpdate = oldItemData.index !== newIndex || 
                         JSON.stringify(oldItemData.item) !== JSON.stringify(newItem);
      
      if (needsUpdate) {
        // 更新现有行
        const rowHTML = renderRow(newItem, newIndex);
        const temp = document.createElement('tbody');
        temp.innerHTML = rowHTML;
        if (temp.firstChild && existingRowData.row.parentNode) {
          existingRowData.row.parentNode.replaceChild(temp.firstChild, existingRowData.row);
          updated++;
        }
      }
    }
  });
  
  // 处理删除
  oldData.forEach((oldItem) => {
    const id = String(getItemId(oldItem) || '');
    if (!newDataMap.has(id)) {
      const existingRowData = existingRowsMap.get(id);
      if (existingRowData && existingRowData.row.parentNode) {
        existingRowData.row.parentNode.removeChild(existingRowData.row);
        removed++;
      }
    }
  });
  
  // 如果变化太大（超过50%），使用全量更新更高效
  const totalChanges = added + updated + removed;
  const changeRatio = totalChanges / Math.max(newData.length, oldData.length);
  
  if (changeRatio > 0.5) {
    console.log(`[incrementalUpdateTableRows] 变化比例 ${(changeRatio * 100).toFixed(1)}% 过大，使用全量更新`);
    const rowHTMLs = newData.map((item, index) => renderRow(item, index));
    renderTableRows(tbody, rowHTMLs);
    return { added: newData.length, updated: 0, removed: oldData.length };
  }
  
  console.log(`[incrementalUpdateTableRows] 增量更新完成: 新增 ${added}, 更新 ${updated}, 删除 ${removed}`);
  return { added, updated, removed };
}

