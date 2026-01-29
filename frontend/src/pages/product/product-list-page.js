/**
 * 产品管理页面业务逻辑
 * 从 products.html 中提取的内联脚本
 */

// 导入依赖
import { ApiService } from '../../api/api.js';
import { debounce } from '../../utils/binding-utils.js';
import { timerManager } from '../../utils/timer-manager.js';

async function invokeIfTauri(cmd, payload) {
  try {
    const core = await import('@tauri-apps/api/core');
    if (!core?.invoke) return null;
    return await core.invoke(cmd, payload);
  } catch (_) {
    return null;
  }
}

// 兼容 Tauri/file:// 环境：避免 fetch('/api/...') 命中前端资源协议返回 HTML
function isTauriLikeEnv() {
  try {
    if (typeof window !== 'undefined') {
      if (window.__TAURI__ || window.__TAURI_INTERNALS__ || window.__TAURI_METADATA__) return true;
    }
    const p = String(window.location.protocol || '').toLowerCase();
    if (p === 'tauri:' || p === 'file:') return true;
    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'tauri.localhost') return true;
  } catch (_) {}
  return false;
}

const API_BASE_URL = isTauriLikeEnv() ? 'http://127.0.0.1:3000' : '';
function withApiBase(url) {
  if (typeof url === 'string' && url.startsWith('/')) return API_BASE_URL + url;
  return url;
}

// 将 toast() 调用替换为 window.NotificationSystem.toast()
// 注意：保留原有的 toast() 函数实现，但使用 window.NotificationSystem.toast() 作为底层
function toast(message, type = "info", duration = 2000) {
  if (window.NotificationSystem && window.NotificationSystem.toast) {
    return window.NotificationSystem.toast(message, type, duration);
  }
  // 降级处理：如果 NotificationSystem 不可用，使用原有实现
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;
  
  const el = document.createElement("div");
  el.className = `toast ${type} toast-enter`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  
  const content = document.createElement("div");
  content.className = "toast-content";
  
  const message_div = document.createElement("div");
  message_div.className = "toast-message";
  message_div.textContent = message;
  
  content.appendChild(message_div);
  el.appendChild(content);
  
  const progress = document.createElement("div");
  progress.className = "toast-progress";
  const progressBar = document.createElement("div");
  progressBar.className = "toast-progress-bar";
  progressBar.style.animationDuration = `${duration}ms`;
  progress.appendChild(progressBar);
  el.appendChild(progress);
  
  toastContainer.appendChild(el);
  
  setTimeout(() => {
    el.classList.remove('toast-enter');
    el.classList.add('toast-show');
  }, 10);
  
  const timer = setTimeout(() => removeToast(el), duration);
  el.addEventListener("click", () => {
    clearTimeout(timer);
    removeToast(el);
  });
  
  return el;
}

// 渲染骨架屏（加载占位）
function renderSkeleton(rows = 6) {
  const container = document.getElementById('tableContainer');
  if (!container) return;
  const skeletonTable = `
    <table class="products-table skeleton">
      <thead>
        <tr>
          <th style="width: 50px;"></th>
          <th>产品类型</th>
          <th>产品型号</th>
          <th>件数单位</th>
          <th>预估重量(kg)</th>
          <th>标签重量(kg)</th>
          <th>安全系数</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({ length: rows }).map(() => `
          <tr>
            <td><div class="skeleton-box small"></div></td>
            <td><div class="skeleton-line"></div></td>
            <td><div class="skeleton-line"></div></td>
            <td><div class="skeleton-line short"></div></td>
            <td><div class="skeleton-line short"></div></td>
            <td><div class="skeleton-line short"></div></td>
            <td><div class="skeleton-line short"></div></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  container.innerHTML = skeletonTable;
}

function removeToast(el) {
  if (!el || !el.parentNode) return;
  el.classList.remove('toast-show');
  el.classList.add('toast-exit');
  setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 200);
}

/**
 * 初始化产品管理页面
 */
export function initProductsPage() {
  let products = [];
  let filteredProducts = [];
  
  // 防止重复初始化
  let isInitialized = false;

        // 初始化函数（支持SPA模式）
        function init() {
            // 检查是否有refresh参数，如果有则强制刷新
            const hash = location.hash.replace("#/", "");
            const routeParts = hash.split('?');
            const hashQueryString = routeParts[1] || '';
            const hashParams = new URLSearchParams(hashQueryString);
            const shouldRefresh = hashParams.has('refresh');
            
            // 如果已初始化且没有refresh参数，跳过
            if (isInitialized && !shouldRefresh) {
                console.log('[产品管理] 已初始化，跳过重复初始化');
                return;
            }
            
            // 如果有refresh参数，清除URL中的refresh参数
            if (shouldRefresh) {
                console.log('[产品管理] 检测到refresh参数，强制刷新产品列表');
                const cleanHash = '#/' + routeParts[0];
                history.replaceState(null, '', location.pathname + cleanHash);
            }
            
            // 检查DOM元素是否准备好
            const container = document.getElementById('tableContainer');
            if (!container) {
                console.warn('[产品管理] tableContainer 元素未找到，延迟初始化');
                // 延迟重试（最多5次，每次50ms）
                let retries = 0;
                const maxRetries = 5;
                const retryInit = () => {
                    const retryContainer = document.getElementById('tableContainer');
                    if (retryContainer) {
                        isInitialized = true;
                        loadProducts();
                        setupEventListeners();
                    } else if (retries < maxRetries) {
                        retries++;
                        timerManager.setTimeout(retryInit, 50);
                    } else {
                        console.error('[产品管理] tableContainer 元素未找到，初始化失败');
                    }
                };
                timerManager.setTimeout(retryInit, 50);
                return;
            }
            
            isInitialized = true;
            console.log('[产品管理] 开始初始化产品列表' + (shouldRefresh ? '（强制刷新）' : ''));
            loadProducts();
            setupEventListeners();
        }

        // 页面加载时初始化（仅在非SPA模式下）
        // 在SPA模式下，由路由系统调用init函数
        // 移除setTimeout延迟，立即设置函数，提升响应速度
        if (!window.isSPA && !window.__routerInitialized) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
        } else {
            // SPA模式下，不自动初始化，等待路由系统调用
            console.log('[产品管理] SPA模式，等待路由切换时初始化');
            // 立即导出init函数供路由系统调用，不延迟
            window.initProductsPageInternal = init;
        }

        // 设置事件监听器
        function setupEventListeners() {
            // 搜索功能（使用防抖优化性能）
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                // 使用防抖函数，延迟300ms执行搜索
                const debouncedSearch = debounce(handleSearch, 300, { timerManager });
                searchInput.addEventListener('input', debouncedSearch);
            }
            
            // 绑定按钮事件（移除内联 onclick）
            const btnEditSelected = document.getElementById('btnEditSelected');
            if (btnEditSelected) {
                console.log('[产品管理] 绑定编辑所选按钮事件');
                btnEditSelected.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!btnEditSelected.disabled) {
                        editSelectedProducts();
                    } else {
                        console.log('[产品管理] 编辑所选按钮被禁用，无法点击');
                    }
                });
            } else {
                console.warn('[产品管理] 未找到编辑所选按钮');
            }
            
            const btnDeleteSelected = document.getElementById('btnDeleteSelected');
            if (btnDeleteSelected) {
                console.log('[产品管理] 绑定删除所选按钮事件');
                btnDeleteSelected.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!btnDeleteSelected.disabled) {
                        deleteSelectedProducts();
                    } else {
                        console.log('[产品管理] 删除所选按钮被禁用，无法点击');
                    }
                });
            } else {
                console.warn('[产品管理] 未找到删除所选按钮');
            }
            
            // 刷新按钮
            const refreshBtn = document.getElementById('btnRefreshProducts');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', refreshProducts);
            }
            
            // 同步按钮
            const syncBtn = document.getElementById('btnSyncProducts');
            if (syncBtn) {
                syncBtn.addEventListener('click', syncProducts);
            }
            
            // 清空按钮
            const clearBtn = document.getElementById('btnClearAllProducts');
            if (clearBtn) {
                console.log('[产品管理] 绑定清空按钮事件');
                clearBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!clearBtn.disabled) {
                        clearAllProducts();
                    } else {
                        console.log('[产品管理] 清空按钮被禁用，无法点击');
                    }
                });
            } else {
                console.warn('[产品管理] 未找到清空按钮');
            }
            
            // 确保按钮状态正确初始化
            ensureActionButtonsEnabled();
            updateActionButtons();
        }

        // 加载产品列表
        async function loadProducts() {
            console.log('[产品管理] 开始加载产品列表');
            
            // 检查容器是否存在
            const container = document.getElementById('tableContainer');
            if (!container) {
                console.error('[产品管理] tableContainer 元素未找到，无法加载产品列表');
                return;
            }
            
            // 显示骨架屏作为加载占位
            renderSkeleton(8);
            try {
                // 桌面端（Tauri）优先走 Rust command；失败则回退到旧 HTTP API
                const token = localStorage.getItem('token') || '';
                const ipc = await invokeIfTauri('products_list', { token });
                const result = ipc || await ApiService.json('/api/products');
                
                console.log('[产品管理] 产品列表加载成功:', result.success ? `${result.data?.length || 0} 条` : '失败');
                
                if (result.success) {
                    products = result.data || [];
                    filteredProducts = [...products];
                    console.log('[产品管理] 开始渲染产品列表，共', products.length, '条');
                    renderProducts();
                    updateStats();
                    // 确保按钮状态正确初始化
                    updateActionButtons();
                    // 确保同步和清空按钮始终可用
                    ensureActionButtonsEnabled();
                    console.log('[产品管理] 产品列表渲染完成');
                } else {
                    console.error('[产品管理] 加载产品列表失败:', result.message || '未知错误');
                    showMessage('加载产品列表失败: ' + (result.message || '未知错误'), 'danger');
                }
            } catch (error) {
                console.error('[产品管理] 加载产品列表失败:', error);
                showMessage('加载产品列表失败: ' + error.message, 'danger');
            }
        }

        // 渲染产品列表
        function renderProducts() {
            const container = document.getElementById('tableContainer');
            if (!container) return;
            
            // 清空容器，确保移除所有可能存在的旧内容，包括可能的额外表头
            container.innerHTML = '';
            
            if (filteredProducts.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">📦</div>
                        <h4>暂无产品数据</h4>
                        <p>您可以前往"新增产品"页面手动添加产品，或者创建订单时系统会自动同步产品型号</p>
                    </div>
                `;
                // 确保按钮状态正确
                updateActionButtons();
                ensureActionButtonsEnabled();
                return;
            }

            // 判断产品类型的辅助函数
            function getProductType(product) {
                // 确保 productType 有默认值，避免 null/undefined 导致的问题
                let type = product.productType;
                
                // 如果 productType 为 null、undefined 或 0，则根据字段判断（兼容旧数据）
                if (type === null || type === undefined || type === 0) {
                    // 兼容旧数据：根据字段判断产品类型
                    if (product.marks && product.marks.trim() !== '') {
                        return { type: 'C类品', value: 3, badgeClass: 'product-type-c' };
                    } else if (product.labelBatchNo && product.labelBatchNo.trim() !== '') {
                        return { type: 'B类品', value: 2, badgeClass: 'product-type-b' };
                    } else {
                        return { type: 'A类品', value: 1, badgeClass: 'product-type-a' };
                    }
                }
                
                // 直接使用 productType 字段作为唯一判断条件
                if (type === 2) {
                    return { type: 'B类品', value: 2, badgeClass: 'product-type-b' };
                } else if (type === 3) {
                    return { type: 'C类品', value: 3, badgeClass: 'product-type-c' };
                } else {
                    // 默认或 type === 1 的情况
                    return { type: 'A类品', value: 1, badgeClass: 'product-type-a' };
                }
            }

            // 预先计算所有产品的类型信息，避免重复计算
            const productsWithType = filteredProducts.map(product => ({
                product,
                typeInfo: getProductType(product)
            }));

            // 按产品类型排序：A类品(1) -> B类品(2) -> C类品(3)，同一类型内按产品型号排序
            const sortedProducts = productsWithType.sort((a, b) => {
                const typeA = a.typeInfo.value;
                const typeB = b.typeInfo.value;
                // 先按产品类型排序
                if (typeA !== typeB) {
                    return typeA - typeB;
                }
                // 同一类型内按产品型号排序
                const modelA = (a.product.model || '').toLowerCase();
                const modelB = (b.product.model || '').toLowerCase();
                return modelA.localeCompare(modelB);
            });

            // 使用 DocumentFragment 优化 DOM 操作性能
            const fragment = document.createDocumentFragment();
            const table = document.createElement('table');
            table.className = 'products-table';
            
            // 创建 colgroup
            const colgroup = document.createElement('colgroup');
            const colWidths = ['3%', '7%', '20%', '5%', '7%', '7%', '5%', '5%', '7%', '11%', '6%', '9%', '8%'];
            colWidths.forEach(width => {
                const col = document.createElement('col');
                col.style.width = width;
                colgroup.appendChild(col);
            });
            table.appendChild(colgroup);
            
            // 创建表头
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            const headerCells = [
                '<input type="checkbox" id="checkAllProducts" title="全选/取消全选" />',
                '产品类型', '产品型号', '件数单位', '预估重量(kg)', '标签重量(kg)',
                '安全系数', '清洁度', '标签批号', '标签说明', '来源', '创建时间', '更新时间'
            ];
            headerCells.forEach((text, index) => {
                const th = document.createElement('th');
                if (index === 0) {
                    th.innerHTML = text;
                } else {
                    th.textContent = text;
                }
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);
            
            // 创建表体
            const tbody = document.createElement('tbody');
            sortedProducts.forEach(({ product, typeInfo }) => {
                const tr = document.createElement('tr');
                tr.setAttribute('data-product-id', product.id);
                
                // 创建所有单元格
                const cells = [
                    `<input type="checkbox" class="product-checkbox" data-id="${product.id}" />`,
                    `<span class="source-badge ${typeInfo.badgeClass}">${typeInfo.type}</span>`,
                    `<strong>${escapeHtml(product.model || '')}</strong>`,
                    escapeHtml(product.unit || '-'),
                    product.estimatedWeight ? product.estimatedWeight.toFixed(2) : '-',
                    product.labelWeight ? Math.floor(product.labelWeight) : '-',
                    (product.safetyFactor && String(product.safetyFactor) !== '0') ? escapeHtml(product.safetyFactor) : '-',
                    (product.cleanliness && String(product.cleanliness) !== '0') ? escapeHtml(product.cleanliness) : '-',
                    escapeHtml(product.labelBatchNo || '-'),
                    escapeHtml(product.label || '-'),
                    `<span class="source-badge source-${product.source || 'manual'}">${product.source === 'order' ? '订单同步' : '手动添加'}</span>`,
                    formatDateTime(product.createdAt),
                    formatDateTime(product.updatedAt)
                ];
                
                cells.forEach((content, index) => {
                    const td = document.createElement('td');
                    if (index === 0 || index === 1 || index === 2 || index === 10) {
                        td.innerHTML = content;
                    } else {
                        td.textContent = content;
                    }
                    tr.appendChild(td);
                });
                
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            fragment.appendChild(table);
            
            // 一次性更新 DOM
            container.innerHTML = '';
            container.appendChild(fragment);
            
            // 绑定全选复选框事件
            const checkAllBox = document.getElementById('checkAllProducts');
            if (checkAllBox) {
                checkAllBox.addEventListener('change', function() {
                    const checkboxes = document.querySelectorAll('.product-checkbox');
                    checkboxes.forEach(cb => {
                        cb.checked = this.checked;
                        // 更新行高亮
                        const row = cb.closest('tr');
                        if (row) {
                            if (this.checked) {
                                row.classList.add('selected');
                            } else {
                                row.classList.remove('selected');
                            }
                        }
                    });
                    updateActionButtons();
                });
            }
            
            // 绑定单个复选框事件
            const checkboxes = document.querySelectorAll('.product-checkbox');
            checkboxes.forEach(cb => {
                cb.addEventListener('change', function() {
                    // 更新行高亮
                    const row = this.closest('tr');
                    if (row) {
                        if (this.checked) {
                            row.classList.add('selected');
                        } else {
                            row.classList.remove('selected');
                        }
                    }
                    
                    updateActionButtons();
                    // 更新全选框状态
                    const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);
                    const someChecked = Array.from(checkboxes).some(checkbox => checkbox.checked);
                    if (checkAllBox) {
                        checkAllBox.checked = allChecked;
                        checkAllBox.indeterminate = someChecked && !allChecked;
                    }
                });
            });
            
            // 确保按钮状态正确
            updateActionButtons();
            ensureActionButtonsEnabled();
        }
        
        // 更新操作按钮状态
        function updateActionButtons() {
            const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');
            const editBtn = document.getElementById('btnEditSelected');
            const deleteBtn = document.getElementById('btnDeleteSelected');
            
            const hasSelection = selectedCheckboxes.length > 0;
            const isSingleSelection = selectedCheckboxes.length === 1;
            
            if (editBtn) {
                editBtn.disabled = !isSingleSelection;
                editBtn.style.opacity = isSingleSelection ? '1' : '0.5';
                editBtn.textContent = '编辑所选';
            }
            
            if (deleteBtn) {
                deleteBtn.disabled = !hasSelection;
                deleteBtn.style.opacity = hasSelection ? '1' : '0.5';
                deleteBtn.textContent = hasSelection ? `删除所选 (${selectedCheckboxes.length})` : '删除所选';
            }
        }
        
        // 确保操作按钮（同步、清空）始终可用
        function ensureActionButtonsEnabled() {
            const syncBtn = document.getElementById('btnSyncProducts');
            const clearBtn = document.getElementById('btnClearAllProducts');
            const refreshBtn = document.getElementById('btnRefreshProducts');
            
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.style.opacity = '1';
            }
            
            if (clearBtn) {
                clearBtn.disabled = false;
                clearBtn.style.opacity = '1';
            }
            
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.style.opacity = '1';
            }
        }

        // 更新统计信息
        function updateStats() {
            const total = products.length;
            const manual = products.filter(p => p.source === 'manual').length;
            const order = products.filter(p => p.source === 'order').length;
            
            document.getElementById('totalProducts').textContent = total;
            document.getElementById('manualProducts').textContent = manual;
            document.getElementById('orderProducts').textContent = order;
        }


        // 处理搜索
        function handleSearch(event) {
            const searchTerm = event.target.value.toLowerCase().trim();
            
            if (!searchTerm) {
                filteredProducts = [...products];
            } else {
                filteredProducts = products.filter(product => 
                    (product.model || '').toLowerCase().includes(searchTerm) ||
                    (product.description || '').toLowerCase().includes(searchTerm)
                );
            }
            
            renderProducts();
        }

        // 编辑产品 - 使用统一弹窗模块
        async function editProduct(id) {
            const product = products.find(p => p.id === id);
            if (!product) {
                toast('产品不存在', 'error');
                return;
            }

            // 创建编辑表单HTML
            const formHTML = `
                        <div class="form-group">
                            <label for="editModel">产品型号 <span style="color: red;">*</span></label>
                            <input type="text" id="editModel" value="${escapeHtml(product.model || '')}" placeholder="请输入产品型号">
                        </div>
                        <div class="form-group">
                            <label for="editDescription">产品描述</label>
                            <textarea id="editDescription" rows="3" placeholder="请输入产品描述">${escapeHtml(product.description || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label for="editWeight">实际重量(kg)</label>
                            <input type="number" id="editWeight" step="0.01" min="0" value="${product.actualWeight || ''}" placeholder="请输入实际重量">
                        </div>
                        <div class="form-group">
                            <label for="editSafetyFactor">安全系数</label>
                            <select id="editSafetyFactor">
                                <option value="">请选择</option>
                                <option value="不写" ${product.safetyFactor === '不写' ? 'selected' : ''}>不写</option>
                                <option value="5:1" ${product.safetyFactor === '5:1' ? 'selected' : ''}>5:1</option>
                                <option value="6:1" ${product.safetyFactor === '6:1' ? 'selected' : ''}>6:1</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="editCleanliness">清洁度</label>
                            <select id="editCleanliness">
                                <option value="">请选择</option>
                                <option value="A" ${product.cleanliness === 'A' ? 'selected' : ''}>A</option>
                                <option value="B" ${product.cleanliness === 'B' ? 'selected' : ''}>B</option>
                                <option value="B+" ${product.cleanliness === 'B+' ? 'selected' : ''}>B+</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="editUnit">件数单位</label>
                            <select id="editUnit">
                                <option value="">请选择</option>
                                <option value="件" ${product.unit === '件' ? 'selected' : ''}>件</option>
                                <option value="托盘" ${product.unit === '托盘' ? 'selected' : ''}>托盘</option>
                                <option value="捆包" ${product.unit === '捆包' ? 'selected' : ''}>捆包</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="editLabelBatchNo">标签批号</label>
                            <input type="text" id="editLabelBatchNo" value="${escapeHtml(product.labelBatchNo || '')}" placeholder="请输入标签批号">
                        </div>
                        <div class="form-group">
                            <label for="editLabel">标签说明</label>
                            <input type="text" id="editLabel" value="${escapeHtml(product.label || '')}" placeholder="请输入标签说明">
                </div>
            `;
            
            const footerHTML = `
                <button class="btn btn-secondary" data-action="cancel">取消</button>
                <button class="btn btn-primary" data-action="confirm">保存</button>
            `;
            
            // 使用统一弹窗模块
            await window.ModalDialog.custom(formHTML, {
                title: '编辑产品',
                footer: footerHTML,
                size: 'medium',
                onConfirm: async () => {
                    // 获取表单数据
                    const modelInput = document.getElementById('editModel');
                    const descriptionInput = document.getElementById('editDescription');
                    const weightInput = document.getElementById('editWeight');
                    const safetyFactorSelect = document.getElementById('editSafetyFactor');
                    const cleanlinessSelect = document.getElementById('editCleanliness');
                    const unitSelect = document.getElementById('editUnit');
                    const labelBatchNoInput = document.getElementById('editLabelBatchNo');
                    const labelInput = document.getElementById('editLabel');
                    
                    // 检查元素是否存在
                    if (!modelInput) {
                        console.error('[产品编辑] editModel 元素未找到');
                        toast('表单元素未找到，请刷新页面重试', 'error');
                        return false;
                    }
                    
                    const model = modelInput.value ? modelInput.value.trim() : '';
                    const description = descriptionInput ? (descriptionInput.value || '').trim() : '';
                    const weightValue = weightInput ? (weightInput.value || '').trim() : '';
                    const safetyFactor = safetyFactorSelect ? safetyFactorSelect.value : '';
                    const cleanliness = cleanlinessSelect ? cleanlinessSelect.value : '';
                    const unit = unitSelect ? unitSelect.value : '';
                    const labelBatchNo = labelBatchNoInput ? (labelBatchNoInput.value || '').trim() : '';
                    const label = labelInput ? (labelInput.value || '').trim() : '';
                    
                    console.log('[产品编辑] 表单数据:', {
                        model: model,
                        modelLength: model.length,
                        description: description,
                        weightValue: weightValue,
                        safetyFactor: safetyFactor,
                        cleanliness: cleanliness,
                        unit: unit,
                        labelBatchNo: labelBatchNo,
                        label: label
                    });
                    
                    // 验证
                    if (!model || model.length === 0) {
                        toast('产品型号不能为空', 'warning');
                        return false; // 返回false不关闭弹窗
                    }

                    // 验证重量格式
                    let actualWeight = null;
                    if (weightValue) {
                        actualWeight = parseFloat(weightValue);
                        if (isNaN(actualWeight) || actualWeight < 0) {
                            toast('实际重量必须是有效的正数', 'warning');
                            return false; // 返回false不关闭弹窗
                        }
                    }

                    // 显示加载状态
                    const loading = window.ModalDialog.loading('正在更新产品...');
                    
                    // 构建请求数据
                    // 注意：验证规则要求某些字段必须是字符串或数字，不能是 null
                    // description 使用 .optional().isString()，所以空字符串或 undefined 都可以，但 null 可能不行
                    const requestData = {
                        model: model, // 必填，不能为空
                        description: description || undefined, // 可选，空字符串转为 undefined
                        actualWeight: actualWeight !== null && actualWeight !== undefined ? actualWeight : undefined, // 可选数字
                        safetyFactor: safetyFactor || undefined, // 可选字符串
                        cleanliness: cleanliness || undefined, // 可选字符串
                        unit: unit || undefined, // 可选字符串
                        labelBatchNo: labelBatchNo || undefined, // 可选字符串
                        label: label || undefined // 可选字符串
                    };
                    
                    // 移除 undefined 字段，避免发送无效数据
                    Object.keys(requestData).forEach(key => {
                        if (requestData[key] === undefined || requestData[key] === null) {
                            delete requestData[key];
                        }
                    });
                    
                    // 详细日志，显示所有字段的值
                    console.log('[产品编辑] 准备发送更新请求:', {
                        id: id,
                        model: model,
                        modelLength: model ? model.length : 0,
                        description: description,
                        actualWeight: actualWeight,
                        safetyFactor: safetyFactor,
                        cleanliness: cleanliness,
                        unit: unit,
                        labelBatchNo: labelBatchNo,
                        label: label,
                        fullData: requestData
                    });
                    
                    // 再次验证 model 字段
                    if (!model || model.trim() === '') {
                        toast('产品型号不能为空', 'warning');
                        return false;
                    }
                    
                    try {
                        // 获取 CSRF token
                        const getCookie = (name) => {
                            const value = `; ${document.cookie}`;
                            const parts = value.split(`; ${name}=`);
                            if (parts.length === 2) return parts.pop().split(';').shift();
                            return null;
                        };
                        
                        const csrfToken = getCookie('csrf_token');
                        const headers = {
                            'Content-Type': 'application/json'
                        };
                        if (csrfToken) {
                            headers['x-csrf-token'] = csrfToken;
                        }
                        
                        // 桌面端（Tauri）优先走 Rust command
                        const token = localStorage.getItem('token') || '';
                        const ipc = await invokeIfTauri('products_update', { token, id: Number(id), ...requestData });
                        if (ipc && ipc.success) {
                            loading.close();
                            toast('产品更新成功', 'success', 2000);
                            await loadProducts();
                            return true; // 关闭弹窗
                        }

                        // 回退：使用 fetch 直接调用，以便更好地处理错误响应
                        const response = await fetch(withApiBase(`/api/products/${id}`), {
                            method: 'PUT',
                            headers: headers,
                            credentials: 'include',
                            body: JSON.stringify(requestData)
                        });
                        
                        const responseText = await response.text();
                        let result;
                        try {
                            result = JSON.parse(responseText);
                        } catch (e) {
                            console.error('[产品编辑] 解析响应失败:', responseText);
                            throw new Error('服务器返回格式错误');
                        }
                        
                        loading.close();
                        
                        if (!response.ok) {
                            // 处理错误响应
                            console.error('[产品编辑] 更新失败:', { 
                                status: response.status, 
                                error: result,
                                requestData: requestData
                            });
                            
                            // 尝试显示详细的错误信息
                            let errorMessage = '更新产品失败';
                            if (result && result.message) {
                                errorMessage = result.message;
                            } else if (result && result.error) {
                                errorMessage = result.error;
                            } else if (result && result.details && Array.isArray(result.details) && result.details.length > 0) {
                                // 显示第一个验证错误的详细信息
                                const firstError = result.details[0];
                                errorMessage = firstError.msg || firstError.message || '输入验证失败';
                            }
                            
                            toast(errorMessage, 'error', 3000);
                            return false; // 返回false不关闭弹窗
                        }
                        
                        if (result.success) {
                            toast('产品更新成功', 'success', 2000);
                            
                            // 清除产品列表缓存，确保数据同步
                            if (window.CacheService && window.CacheService.products) {
                                try {
                                    if (typeof window.CacheService.products.clear === 'function') {
                                        window.CacheService.products.clear();
                                    }
                                } catch (e) {
                                    console.warn('[产品编辑] 清除缓存失败:', e);
                                }
                            }
                            
                            // 重新加载产品列表，确保显示最新数据
                            console.log('[产品编辑] 保存成功，重新加载产品列表');
                            await loadProducts();
                            
                            return true; // 返回true关闭弹窗
                        } else {
                            toast(result.message || '更新产品失败', 'error', 2000);
                            return false; // 返回false不关闭弹窗
                        }
                    } catch (error) {
                        console.error('更新产品失败:', error);
                        loading.close();
                        
                        // 尝试解析错误信息，显示更详细的错误提示
                        let errorMessage = '更新产品失败';
                        if (error.message) {
                            if (error.message.includes('网络') || error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
                                errorMessage = '网络连接异常，请检查网络后重试';
                            } else {
                                errorMessage = error.message;
                            }
                        }
                        
                        toast(errorMessage, 'error', 3000);
                        return false; // 返回false不关闭弹窗
                    }
                }
            });
            
            // 聚焦到第一个输入框
            setTimeout(() => {
                const firstInput = document.getElementById('editModel');
                if (firstInput) firstInput.focus();
            }, 200);
        }

        // 保存产品编辑
        async function saveProductEdit(id) {
            const model = document.getElementById('editModel').value.trim();
            const description = document.getElementById('editDescription').value.trim();
            const weightValue = document.getElementById('editWeight').value.trim();
            const safetyFactor = document.getElementById('editSafetyFactor').value;
            const cleanliness = document.getElementById('editCleanliness').value;
            const unit = document.getElementById('editUnit').value;
            const labelBatchNo = document.getElementById('editLabelBatchNo').value.trim();
            const label = document.getElementById('editLabel').value.trim();
            
            if (!model) {
                toast('产品型号不能为空', 'warning');
                return;
            }

            // 验证重量格式
            let actualWeight = null;
            if (weightValue) {
                actualWeight = parseFloat(weightValue);
                if (isNaN(actualWeight) || actualWeight < 0) {
                    toast('实际重量必须是有效的正数', 'warning');
                    return;
                }
            }

            let loadingToast = toast('正在更新产品...', 'info', 2000); // 缩短到2秒
            
            try {
                const token = localStorage.getItem('token') || '';
                const ipc = await invokeIfTauri('products_update', {
                    token,
                    id: Number(id),
                    model: model,
                    description: description,
                    actualWeight: actualWeight,
                    safetyFactor: safetyFactor,
                    cleanliness: cleanliness,
                    unit: unit,
                    labelBatchNo: labelBatchNo || null,
                    label: label || null
                });

                // 桌面端优先走 Rust command；失败回退旧接口
                const result = ipc || await ApiService.json(`/api/products/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        description: description,
                        actualWeight: actualWeight,
                        safetyFactor: safetyFactor,
                        cleanliness: cleanliness,
                        unit: unit,
                        labelBatchNo: labelBatchNo || null,
                        label: label || null
                    })
                });
                
                // 立即关闭加载提示
                if (loadingToast) {
                    const toastEl = document.querySelector('.toast.info');
                    if (toastEl) removeToast(toastEl);
                }
                
                if (result.success) {
                    toast('产品更新成功', 'success', 2000);
                    
                    // 清除产品列表缓存，确保数据同步
                    if (window.CacheService && window.CacheService.products) {
                        try {
                            if (typeof window.CacheService.products.clear === 'function') {
                                window.CacheService.products.clear();
                            }
                        } catch (e) {
                            console.warn('[产品编辑] 清除缓存失败:', e);
                        }
                    }
                    
                    // 重新加载产品列表，确保显示最新数据
                    console.log('[产品编辑] 保存成功，重新加载产品列表');
                    await loadProducts();
                    
                    closeEditModal();
                } else {
                    toast('更新产品失败: ' + (result.message || '未知错误'), 'error', 2000);
                }
            } catch (error) {
                console.error('更新产品失败:', error);
                
                // 立即关闭加载提示
                if (loadingToast) {
                    const toastEl = document.querySelector('.toast.info');
                    if (toastEl) removeToast(toastEl);
                }
                
                toast('更新产品失败: ' + error.message, 'error', 2000);
            }
        }


        // 编辑选中的产品（仅支持单选）
        function editSelectedProducts() {
            console.log('[产品管理] 编辑所选按钮被点击');
            const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');
            console.log('[产品管理] 选中的产品数量:', selectedCheckboxes.length);
            if (selectedCheckboxes.length !== 1) {
                toast('请选择一个产品进行编辑', 'warning');
                return;
            }
            
            const productId = parseInt(selectedCheckboxes[0].dataset.id);
            console.log('[产品管理] 编辑产品ID:', productId);
            editProduct(productId);
        }
        
        // 删除选中的产品（支持批量）
        async function deleteSelectedProducts() {
            console.log('[产品管理] 删除所选按钮被点击');
            const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');
            console.log('[产品管理] 选中的产品数量:', selectedCheckboxes.length);
            if (selectedCheckboxes.length === 0) {
                toast('请选择要删除的产品', 'warning');
                return;
            }
            
            const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.id));
            const selectedProducts = products.filter(p => selectedIds.includes(p.id));
            const productNames = selectedProducts.map(p => p.model).join('、');
            
            // 使用统一弹窗模块的确认对话框
            const message = `确定要删除以下 ${selectedIds.length} 个产品吗？\n\n${escapeHtml(productNames)}\n\n此操作不可撤销，请谨慎操作。`;
            const confirmed = await window.ModalDialog.confirm(message, {
                title: '确认批量删除',
                icon: '⚠️',
                confirmText: `确认删除 (${selectedIds.length})`,
                cancelText: '取消',
                size: 'medium'
            });

            if (!confirmed) {
                return;
            }
                
                // 批量删除
            const loading = window.ModalDialog.loading(`正在删除 ${selectedIds.length} 个产品...`);
            
                let successCount = 0;
                let failCount = 0;
                
                for (const id of selectedIds) {
                    try {
                        const token = localStorage.getItem('token') || '';
                        const ipc = await invokeIfTauri('products_delete', { token, id: Number(id) });
                        // 桌面端优先走 Rust command；失败回退旧接口
                        const result = ipc || await ApiService.json(`/api/products/${id}`, {
                            method: 'DELETE'
                        });
                        
                        if (result.success) {
                            successCount++;
                            // 从本地数据中移除
                            products = products.filter(p => p.id !== id);
                            filteredProducts = filteredProducts.filter(p => p.id !== id);
                        } else {
                            failCount++;
                        }
                    } catch (error) {
                        console.error('删除产品失败:', id, error);
                        failCount++;
                    }
                }
                
            loading.close();
                
                // 显示结果
                if (successCount > 0) {
                    toast(`成功删除 ${successCount} 个产品${failCount > 0 ? `，${failCount} 个失败` : ''}`, 'success', 2000);
                    renderProducts();
                    updateStats();
                } else {
                    toast('删除失败', 'error', 2000);
                }
        }

        // 删除产品 - 使用统一弹窗模块
        async function deleteProduct(id, model) {
            // 使用统一弹窗模块的确认对话框
            const confirmed = await window.ModalDialog.confirm(
                `确定要删除产品 "${escapeHtml(model)}" 吗？\n\n此操作不可撤销，请谨慎操作。`,
                {
                    title: '确认删除产品',
                    icon: '⚠️',
                    confirmText: '确认删除',
                    cancelText: '取消'
                }
            );

            if (confirmed) {
                await confirmDeleteProduct(id);
            }
        }

        // 确认删除产品
        async function confirmDeleteProduct(id) {
            let loadingToast = null;
            try {
                loadingToast = toast('正在删除产品...', 'info', 2000); // 缩短到2秒
                
                const token = localStorage.getItem('token') || '';
                const ipc = await invokeIfTauri('products_delete', { token, id: Number(id) });
                // 桌面端优先走 Rust command；失败回退旧接口
                const result = ipc || await ApiService.json(`/api/products/${id}`, {
                    method: 'DELETE'
                });
                
                // 立即关闭加载提示
                if (loadingToast) {
                    const toastEl = document.querySelector('.toast.info');
                    if (toastEl) removeToast(toastEl);
                }
                
                if (result.success) {
                    toast('产品删除成功', 'success', 2000);
                    // 立即从本地数组中移除该产品
                    products = products.filter(p => p.id !== id);
                    filteredProducts = filteredProducts.filter(p => p.id !== id);
                    renderProducts();
                    updateStats();
                    closeDeleteModal();
                } else {
                    toast('删除产品失败: ' + (result.message || '未知错误'), 'error', 2000);
                }
            } catch (error) {
                console.error('删除产品失败:', error);
                
                // 立即关闭加载提示
                if (loadingToast) {
                    const toastEl = document.querySelector('.toast.info');
                    if (toastEl) removeToast(toastEl);
                }
                
                toast('删除产品失败: ' + error.message, 'error', 2000);
            }
        }

        // 刷新产品列表
        function refreshProducts() {
            document.getElementById('searchInput').value = '';
            loadProducts();
        }

        // 显示消息
        // Toast 提示系统 - 使用顶部定义的 toast() 函数（已使用 window.NotificationSystem.toast()）

        // 统一使用toast函数显示消息
        function showMessage(message, type = 'success') {
            // 映射类型：danger -> error
            const toastType = type === 'danger' ? 'error' : type;
            toast(message, toastType);
        }

        // HTML转义
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 手动同步产品数据
        async function syncProducts() {
            let loadingToastElement = null;
            try {
                // 创建加载提示并保存元素引用
                const toastContainer = document.getElementById("toastContainer");
                if (!toastContainer) return;
                
                loadingToastElement = document.createElement("div");
                loadingToastElement.className = `toast info toast-enter`;
                loadingToastElement.setAttribute("role", "status");
                loadingToastElement.setAttribute("aria-live", "polite");
                loadingToastElement.textContent = '正在从订单中同步产品数据...';
                toastContainer.appendChild(loadingToastElement);
                
                // 使用 ApiService.json 自动处理 CSRF token
                const result = await ApiService.json('/api/products/sync-from-orders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                // 立即关闭加载提示
                if (loadingToastElement && loadingToastElement.parentNode) {
                    removeToast(loadingToastElement);
                }
                
                if (result.success) {
                    const { added, updated, total } = result.data;
                    toast(`同步完成！新增 ${added} 个产品，更新 ${updated} 个产品，共处理 ${total} 个产品型号`, 'success', 2500);
                    // 延迟重新加载以确保用户看到成功消息
                    setTimeout(() => {
                        loadProducts(); // 重新加载产品列表
                    }, 1000);
                } else {
                    toast(result.message || '同步失败', 'error', 2000);
                }
            } catch (error) {
                // 确保关闭加载提示
                if (loadingToastElement && loadingToastElement.parentNode) {
                    removeToast(loadingToastElement);
                }
                console.error('同步产品失败:', error);
                toast('网络连接异常，请检查网络后重试', 'error', 2000);
            }
        }

        // 清空产品库 - 使用统一弹窗模块
        async function clearAllProducts() {
            console.log('[产品管理] 清空按钮被点击');

            // 使用统一弹窗模块的确认对话框
            const message = `确定要清空整个产品库吗？\n\n此操作将删除所有产品数据，且不可恢复！\n\n当前产品库共有 **${products.length}** 个产品`;
            const confirmed = await window.ModalDialog.confirm(message, {
                title: '确认清空产品库',
                icon: '🗑️',
                confirmText: '确认清空',
                cancelText: '取消'
            });

            if (confirmed) {
                await confirmClearProducts();
            }
        }

        // 通用模态框清理函数
        function closeAllModals() {
            const modals = document.querySelectorAll('.modal-dialog-overlay');
            modals.forEach(modal => modal.remove());
        }

        // 确认清空产品库
        async function confirmClearProducts() {
            console.log('[产品管理] 开始执行清空操作');
            let loadingToast = null;
            try {
                // 显示加载状态
                const confirmBtn = document.querySelector('#clearModal .modal-footer .btn-danger');
                if (confirmBtn) {
                    const originalText = confirmBtn.textContent;
                    confirmBtn.textContent = '正在清空...';
                    confirmBtn.disabled = true;
                }
                
                loadingToast = toast('正在清空产品库...', 'info', 2000);
                console.log('[产品管理] 发送清空请求到 /api/products/clear');
                
                const token = localStorage.getItem('token') || '';
                const ipc = await invokeIfTauri('products_clear', { token });
                // 桌面端优先走 Rust command；失败回退旧接口
                const result = ipc || await ApiService.json('/api/products/clear', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log('[产品管理] 清空请求响应:', result);
                
                // 立即关闭加载提示
                if (loadingToast) {
                    const toastEl = document.querySelector('.toast.info');
                    if (toastEl) removeToast(toastEl);
                }
                
                if (result && result.success) {
                    const deletedCount = result.result?.changes || 0;
                    console.log('[产品管理] 清空成功，删除了', deletedCount, '个产品');
                    toast(`产品库清空成功！共删除 ${deletedCount} 个产品`, 'success', 2500);
                    
                    // 立即清空本地数据并重新渲染
                    products = [];
                    filteredProducts = [];
                    console.log('[产品管理] 清空本地数据，重新渲染产品列表');
                    renderProducts();
                    updateStats();
                    
                    // 关闭模态框
                    closeAllModals();
                    
                    // 清空搜索框
                    const searchInput = document.getElementById('searchInput');
                    if (searchInput) {
                        searchInput.value = '';
                    }
                    
                } else {
                    const errorMsg = result?.message || '清空操作失败';
                    console.error('[产品管理] 清空失败:', errorMsg);
                    throw new Error(errorMsg);
                }
                
            } catch (error) {
                console.error('[产品管理] 清空产品库失败:', error);
                
                // 立即关闭加载提示
                if (loadingToast) {
                    const toastEl = document.querySelector('.toast.info');
                    if (toastEl) removeToast(toastEl);
                }
                
                // 恢复按钮状态
                const confirmBtn = document.querySelector('#clearModal .modal-footer .btn-danger');
                if (confirmBtn) {
                    confirmBtn.textContent = '确认清空';
                    confirmBtn.disabled = false;
                }
                
                // 显示错误信息
                let errorMessage = '清空产品库失败，请重试';
                if (error.message) {
                    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                        errorMessage = '网络连接异常，请检查服务器状态后重试';
                    } else if (error.message.includes('HTTP')) {
                        errorMessage = `服务器错误: ${error.message}`;
                    } else {
                        errorMessage = error.message;
                    }
                }
                
                toast(errorMessage, 'error', 2000);
            }
        }

        // 格式化日期时间
        function formatDateTime(dateString) {
            if (!dateString) return '-';
            
            try {
                const date = new Date(dateString);
                return date.toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (error) {
                return dateString;
            }
        }
}
