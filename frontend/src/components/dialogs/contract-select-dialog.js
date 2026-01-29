/**
 * 合同号选择对话框组件
 * 
 * 功能：
 * - 显示已有合同号下拉列表
 * - 支持手动输入新合同号
 * - 自动完成功能
 * - 键盘导航
 * - 输入验证
 */
import { timerManager } from '../../utils/timer-manager.js';
import { bindValidation, validators } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/format-utils.js';

/**
 * 显示合同号选择对话框
 * @param {Array} orders - 订单列表（可选，如果不提供则从 ApiService 加载）
 * @param {Object} apiService - API服务（可选，如果不提供则使用 window.ApiService）
 * @returns {Promise<string|null|'CANCELLED'>} 返回订单ID、null（新建订单）或'CANCELLED'（取消）
 */
export async function showContractNoSelectDialog(orders = null, apiService = null) {
  return new Promise(async (resolve) => {
    const api = apiService || window.ApiService;
    
    // 确保订单数据已加载
    let orderList = orders;
    if (!orderList || orderList.length === 0) {
      console.log('[合同号选择] 订单数据未加载，开始加载...');
      try {
        if (api && api.orders && api.orders.list) {
          const loadedOrders = await api.orders.list();
          if (Array.isArray(loadedOrders)) {
            orderList = loadedOrders;
            console.log(`[合同号选择] 已加载 ${loadedOrders.length} 条订单数据`);
          } else {
            orderList = [];
            console.warn('[合同号选择] 订单数据加载失败，返回空数组');
          }
        } else {
          console.warn('[合同号选择] ApiService 不可用，无法加载订单数据');
          orderList = [];
        }
      } catch (error) {
        console.error('[合同号选择] 加载订单数据失败:', error);
        orderList = [];
      }
    }
    
    // 获取所有订单的合同号列表
    const contractNos = (orderList || [])
      .map(o => o.contractNo || o.orderNo)
      .filter(cn => cn && cn.trim())
      .sort()
      .filter((value, index, self) => self.indexOf(value) === index); // 去重

    // HTML转义函数
    // escapeHtml 函数已从 utils/format-utils.js 导入

    const bodyHTML = `
      <div style="padding: 0; position: relative; overflow: hidden;">
        <!-- 顶部装饰性渐变背景 -->
        <div style="position: absolute; top: 0; left: 0; right: 0; height: 180px; background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%); opacity: 0.1; pointer-events: none; border-radius: 16px 16px 0 0;"></div>
        
        <!-- 主要内容区域 -->
        <div style="position: relative; padding: 24px; background: linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(255,255,255,1) 100%); backdrop-filter: blur(20px);">
          <!-- 标题区域 - 玻璃态效果（紧凑版） -->
          <div style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 12px; padding: 12px 16px; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5); position: relative; overflow: hidden;">
            <div style="position: absolute; top: -50%; right: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); pointer-events: none;"></div>
            <div style="display: flex; align-items: center; gap: 10px; position: relative; z-index: 1;">
              <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(102, 126, 234, 0.25); flex-shrink: 0;">
                <span style="font-size: 16px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));">📋</span>
              </div>
              <div style="flex: 1; min-width: 0;">
                <h3 style="margin: 0; font-weight: 700; font-size: 15px; color: #1f2937; letter-spacing: -0.01em; line-height: 1.3;">选择或输入合同号</h3>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #6b7280; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">请从下拉列表中选择已有合同号，或手动输入新合同号</p>
              </div>
            </div>
          </div>
          
          <!-- 选择已有合同号 -->
          <div style="margin-bottom: 20px;">
            <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-weight: 600; color: #111827; font-size: 14px; letter-spacing: -0.01em;">
              <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);">
                <span style="font-size: 16px;">📝</span>
              </div>
              <span>选择已有合同号</span>
              ${contractNos.length > 0 ? `<span style="font-weight: 500; color: #6366f1; font-size: 12px; background: rgba(99, 102, 241, 0.1); padding: 2px 8px; border-radius: 6px; margin-left: 4px;">${contractNos.length} 个可选</span>` : ''}
            </label>
            <div style="position: relative;">
              <select id="contractNoSelect" 
                      class="form-input contract-select" 
                      style="width: 100%; padding: 14px 48px 14px 16px; border: 1.5px solid #e5e7eb; border-radius: 12px; font-size: 14px; background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); appearance: none; background-image: url('data:image/svg+xml;charset=UTF-8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%236366f1\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><polyline points=\\'6 9 12 15 18 9\\'></polyline></svg>'); background-repeat: no-repeat; background-position: right 16px center; background-size: 18px; cursor: pointer; font-weight: 500; color: #1f2937; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
                <option value="" style="color: #9ca3af;">请选择合同号</option>
                ${contractNos.map(cn => `<option value="${escapeHtml(cn)}" style="color: #1f2937;">${escapeHtml(cn)}</option>`).join('')}
              </select>
              <div style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; width: 18px; height: 18px;"></div>
            </div>
            ${contractNos.length === 0 ? '<p style="margin-top: 10px; color: #9ca3af; font-size: 12px; display: flex; align-items: center; gap: 6px;"><span>ℹ️</span>暂无已有合同号，请手动输入</p>' : ''}
          </div>
          
          <!-- 分隔线 -->
          <div style="display: flex; align-items: center; margin: 20px 0; gap: 12px; position: relative;">
            <div style="flex: 1; height: 1px; background: linear-gradient(to right, transparent, rgba(229, 231, 235, 0.8), transparent);"></div>
            <div style="padding: 6px 16px; background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 20px; color: #6b7280; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8);">或</div>
            <div style="flex: 1; height: 1px; background: linear-gradient(to right, transparent, rgba(229, 231, 235, 0.8), transparent);"></div>
          </div>
          
          <!-- 手动输入合同号 -->
          <div>
            <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-weight: 600; color: #111827; font-size: 14px; letter-spacing: -0.01em;">
              <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.15);">
                <span style="font-size: 16px;">✍️</span>
              </div>
              <span>手动输入合同号</span>
            </label>
            <div style="position: relative;">
              <input type="text" 
                     id="contractNoInput" 
                     class="form-input contract-input"
                     placeholder="请输入新合同号..."
                     style="width: 100%; padding: 14px 16px; border: 1.5px solid #e5e7eb; border-radius: 12px; font-size: 14px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%); font-weight: 500; color: #1f2937; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);"
                     autocomplete="off">
              <!-- 自动完成下拉列表 -->
              <div id="contractNoAutocomplete" class="contract-autocomplete-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1.5px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); max-height: 200px; overflow-y: auto; z-index: 1000; margin-top: 2px;"></div>
            </div>
            <p style="margin-top: 10px; color: #6b7280; font-size: 12px; line-height: 1.6; display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: rgba(99, 102, 241, 0.05); border-radius: 8px; border-left: 3px solid #6366f1;">
              <span style="color: #6366f1;">💡</span>
              <span>输入新合同号将创建新订单</span>
            </p>
          </div>
        </div>
      </div>
      <style>
        .contract-select, .contract-input {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
        }
        .contract-select:hover {
          border-color: #c7d2fe !important;
          background: linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%) !important;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15), 0 1px 3px rgba(0, 0, 0, 0.05) !important;
          transform: translateY(-1px);
        }
        .contract-select:focus {
          outline: none;
          border-color: #6366f1 !important;
          background: #ffffff !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1), 0 4px 16px rgba(99, 102, 241, 0.2) !important;
          transform: translateY(-1px);
        }
        .contract-input:hover {
          border-color: #c7d2fe !important;
          background: linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%) !important;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15), 0 1px 3px rgba(0, 0, 0, 0.05) !important;
          transform: translateY(-1px);
        }
        .contract-input:focus {
          outline: none;
          border-color: #6366f1 !important;
          background: #ffffff !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1), 0 4px 16px rgba(99, 102, 241, 0.2) !important;
          transform: translateY(-1px);
        }
        .contract-input::placeholder {
          color: #9ca3af;
          font-weight: 400;
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .contract-select, .contract-input {
          animation: slideIn 0.3s ease-out;
        }
        .contract-autocomplete-dropdown {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
        }
        .contract-autocomplete-item {
          padding: 10px 16px;
          cursor: pointer;
          font-size: 14px;
          color: #1f2937;
          transition: all 0.2s;
          border-bottom: 1px solid #f3f4f6;
          display: flex; 
          align-items: center;
          gap: 8px;
        }
        .contract-autocomplete-item:last-child {
          border-bottom: none;
        }
        .contract-autocomplete-item:hover,
        .contract-autocomplete-item.selected {
          background: linear-gradient(to right, rgba(99, 102, 241, 0.08), rgba(99, 102, 241, 0.05));
          color: #6366f1;
          font-weight: 500;
        }
        .contract-autocomplete-item .match-highlight {
          color: #6366f1;
          font-weight: 600;
        }
        .contract-autocomplete-no-results {
          padding: 12px 16px;
          text-align: center;
          color: #9ca3af;
          font-size: 13px;
        }
      </style>
    `;

    const footerHTML = `
      <button class="btn secondary contract-cancel-btn" data-action="cancel" style="padding: 12px 24px; border-radius: 12px; font-weight: 600; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: linear-gradient(to bottom, #ffffff 0%, #f9fafb 100%); border: 1.5px solid #e5e7eb; color: #374151; font-size: 14px; letter-spacing: 0.01em; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
        <span style="margin-right: 6px; font-size: 16px;">✕</span>取消
      </button>
      <button class="btn primary contract-confirm-btn" data-action="confirm" style="padding: 12px 28px; border-radius: 12px; font-weight: 600; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; color: white; font-size: 14px; letter-spacing: 0.01em; box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4), 0 2px 4px rgba(102, 126, 234, 0.2); position: relative; overflow: hidden;">
        <span style="position: relative; z-index: 1; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 16px;">✓</span>
          <span>确定</span>
        </span>
        <span style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition: left 0.5s;"></span>
      </button>
      <style>
        .contract-cancel-btn:hover {
          background: linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%) !important;
          border-color: #d1d5db !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
          transform: translateY(-2px);
        }
        .contract-cancel-btn:active {
          transform: translateY(0);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1) !important;
        }
        .contract-confirm-btn:hover {
          background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%) !important;
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5), 0 2px 6px rgba(102, 126, 234, 0.3) !important;
          transform: translateY(-2px);
        }
        .contract-confirm-btn:hover span:last-child {
          left: 100%;
        }
        .contract-confirm-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4) !important;
        }
      </style>
    `;

    // 下拉选择时自动填充到输入框，并改进交互体验（使用TimerManager防止内存泄漏）
    // 添加标志，用于标记弹窗是否正在关闭，避免在关闭时触发验证
    let isDialogClosing = false;
    let validationCleanup = null;
    
    timerManager.setTimeout(() => {
      const selectEl = document.getElementById('contractNoSelect');
      const inputEl = document.getElementById('contractNoInput');
      
      if (selectEl && inputEl) {
        // 绑定合同号输入验证（防止XSS和注入攻击）
        // 注意：从下拉列表选择时，值已经验证过，不需要再次验证
        let isFromSelect = false;
        
        // 只在输入框有值且用户主动输入时才验证，空值不验证
        const customValidator = (value) => {
          // 如果弹窗正在关闭，不验证
          if (isDialogClosing) {
            return true;
          }
          // 如果值为空，不验证（允许空值）
          if (!value || !value.trim()) {
            return true;
          }
          // 使用标准验证器
          return validators.contractNo(value);
        };
        
        validationCleanup = bindValidation(inputEl, customValidator, (error) => {
          // 如果弹窗正在关闭，不显示错误
          if (isDialogClosing) {
            return;
          }
          // 如果是从下拉列表选择的，跳过验证提示
          if (isFromSelect) {
            isFromSelect = false;
            return;
          }
          // 如果输入框为空，不显示错误
          if (!inputEl.value || !inputEl.value.trim()) {
            return;
          }
          if (error) {
            window.NotificationSystem?.toast(error, 'warning', 2000);
          }
        });
        
        // 聚焦到输入框
        inputEl.focus();
        
        // 下拉选择时自动填充到输入框，并添加高级视觉反馈
        selectEl.addEventListener('change', (e) => {
          if (e.target.value) {
            isFromSelect = true; // 标记是从下拉列表选择的
            inputEl.value = e.target.value;
            // 清除验证错误状态（如果存在）
            inputEl.classList.remove('validation-error');
            // 添加高级视觉反馈 - 绿色成功状态
            inputEl.style.borderColor = '#10b981';
            inputEl.style.background = 'linear-gradient(to bottom, #f0fdf4 0%, #ffffff 100%)';
            inputEl.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.15), 0 4px 16px rgba(16, 185, 129, 0.2)';
            inputEl.style.transform = 'scale(1.01)';
            
            // 添加成功图标动画
            const successIcon = document.createElement('span');
            successIcon.innerHTML = '✓';
            successIcon.style.cssText = 'position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: #10b981; font-size: 18px; font-weight: bold; animation: checkmark 0.5s ease-out; pointer-events: none;';
            const inputContainer = inputEl.parentElement;
            if (!inputContainer.querySelector('.success-icon')) {
              successIcon.className = 'success-icon';
              inputContainer.style.position = 'relative';
              inputContainer.appendChild(successIcon);
              timerManager.setTimeout(() => successIcon.remove(), 2000);
            }
            
            timerManager.setTimeout(() => {
              inputEl.style.borderColor = '#e5e7eb';
              inputEl.style.background = 'linear-gradient(to bottom, #ffffff 0%, #fafafa 100%)';
              inputEl.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
              inputEl.style.transform = 'scale(1)';
            }, 1500);
          }
        });
        
        // 自动完成功能
        const autocompleteEl = document.getElementById('contractNoAutocomplete');
        let selectedIndex = -1;
        let filteredOptions = [];
        
        // 高亮匹配文本
        function highlightMatch(text, query) {
          if (!query) return escapeHtml(text);
          // 先转义正则表达式特殊字符，再转义HTML
          const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedQuery})`, 'gi');
          return escapeHtml(text).replace(regex, '<span class="match-highlight">$1</span>');
        }
        
        // 过滤匹配的合同号
        function filterContractNos(query) {
          if (!query || query.trim() === '') {
            return [];
          }
          const lowerQuery = query.toLowerCase();
          return contractNos.filter(cn => {
            const lowerCn = cn.toLowerCase();
            return lowerCn.includes(lowerQuery);
          }).slice(0, 8); // 最多显示8个结果
        }
        
        // 显示自动完成下拉列表
        function showAutocomplete(matches) {
          if (!autocompleteEl) return;
          
          if (matches.length === 0) {
            autocompleteEl.innerHTML = '<div class="contract-autocomplete-no-results">未找到匹配的合同号</div>';
            autocompleteEl.style.display = 'block';
            return;
          }
          
          const query = inputEl.value.trim();
          autocompleteEl.innerHTML = matches.map((cn, index) => {
            return `<div class="contract-autocomplete-item" data-index="${index}" data-value="${escapeHtml(cn)}">
              <span style="color: #6366f1; font-size: 16px;">📄</span>
              <span>${highlightMatch(cn, query)}</span>
            </div>`;
          }).join('');
          
          autocompleteEl.style.display = 'block';
          selectedIndex = -1;
          
          // 绑定点击事件
          autocompleteEl.querySelectorAll('.contract-autocomplete-item').forEach((item, index) => {
            item.addEventListener('click', () => {
              const value = item.getAttribute('data-value');
              isFromSelect = true; // 标记是从自动完成选择的
              inputEl.value = value;
              selectEl.value = value;
              // 清除验证错误状态（如果存在）
              inputEl.classList.remove('validation-error');
              hideAutocomplete();
              inputEl.focus();
              // 添加成功反馈（使用TimerManager防止内存泄漏）
              inputEl.style.borderColor = '#10b981';
              inputEl.style.background = 'linear-gradient(to bottom, #f0fdf4 0%, #ffffff 100%)';
              timerManager.setTimeout(() => {
                inputEl.style.borderColor = '#e5e7eb';
                inputEl.style.background = 'linear-gradient(to bottom, #ffffff 0%, #fafafa 100%)';
              }, 1500);
            });
            
            item.addEventListener('mouseenter', () => {
              selectedIndex = index;
              updateSelectedItem();
            });
          });
        }
        
        // 隐藏自动完成下拉列表
        function hideAutocomplete() {
          if (autocompleteEl) {
            autocompleteEl.style.display = 'none';
            selectedIndex = -1;
          }
        }
        
        // 更新选中的项
        function updateSelectedItem() {
          const items = autocompleteEl.querySelectorAll('.contract-autocomplete-item');
          items.forEach((item, index) => {
            if (index === selectedIndex) {
              item.classList.add('selected');
              item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
              item.classList.remove('selected');
            }
          });
        }
        
        // 输入框输入时，显示自动完成
        inputEl.addEventListener('input', (e) => {
          const value = e.target.value.trim();
          
          // 如果输入的值完全匹配某个合同号，自动选中
          if (value && contractNos.includes(value)) {
            isFromSelect = true; // 标记是匹配到已有合同号
            selectEl.value = value;
            // 清除验证错误状态（如果存在）
            inputEl.classList.remove('validation-error');
            inputEl.style.borderColor = '#10b981';
            inputEl.style.background = 'linear-gradient(to bottom, #f0fdf4 0%, #ffffff 100%)';
            selectEl.style.borderColor = '#10b981';
            hideAutocomplete();
          } else {
            selectEl.value = '';
            inputEl.style.borderColor = '#e5e7eb';
            inputEl.style.background = 'linear-gradient(to bottom, #ffffff 0%, #fafafa 100%)';
            selectEl.style.borderColor = '#e5e7eb';
            
            // 显示自动完成
            if (value.length > 0) {
              filteredOptions = filterContractNos(value);
              showAutocomplete(filteredOptions);
            } else {
              hideAutocomplete();
            }
          }
        });
        
        // 键盘导航
        inputEl.addEventListener('keydown', (e) => {
          if (!autocompleteEl || autocompleteEl.style.display === 'none') {
            if (e.key === 'Enter') {
              const confirmBtn = document.querySelector('[data-action="confirm"]');
              if (confirmBtn) confirmBtn.click();
            }
            return;
          }
          
          const items = autocompleteEl.querySelectorAll('.contract-autocomplete-item');
          if (items.length === 0) return;
          
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateSelectedItem();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1;
            updateSelectedItem();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && items[selectedIndex]) {
              items[selectedIndex].click();
            } else {
              const confirmBtn = document.querySelector('[data-action="confirm"]');
              if (confirmBtn) confirmBtn.click();
            }
          } else if (e.key === 'Escape') {
            hideAutocomplete();
            inputEl.focus();
          }
        });
        
        // 点击外部时隐藏自动完成
        document.addEventListener('click', (e) => {
          if (!autocompleteEl.contains(e.target) && e.target !== inputEl) {
            hideAutocomplete();
          }
        });
        
        // 输入框失去焦点时延迟隐藏（允许点击自动完成项，使用TimerManager防止内存泄漏）
        inputEl.addEventListener('blur', () => {
          timerManager.setTimeout(() => {
            if (!autocompleteEl.matches(':hover') && !document.querySelector('.contract-autocomplete-item:hover')) {
              hideAutocomplete();
            }
          }, 200);
        });
        
        // 添加成功动画样式
        const style = document.createElement('style');
        style.textContent = `
          @keyframes checkmark {
            0% {
              opacity: 0;
              transform: translateY(-50%) scale(0);
            }
            50% {
              transform: translateY(-50%) scale(1.2);
            }
            100% {
              opacity: 1;
              transform: translateY(-50%) scale(1);
            }
          }
        `;
        document.head.appendChild(style);
        
        // 支持回车键快速确认
        const handleKeyPress = (e) => {
          if (e.key === 'Enter') {
            const confirmBtn = document.querySelector('[data-action="confirm"]');
            if (confirmBtn) {
              confirmBtn.click();
            }
          }
        };
        inputEl.addEventListener('keypress', handleKeyPress);
        selectEl.addEventListener('keypress', handleKeyPress);
      }
    }, 200);

    const result = await window.ModalDialog.custom(bodyHTML, {
      title: '', // 标题已在body中显示，这里留空
      footer: footerHTML,
      size: 'medium', // 改为medium以获得更好的显示效果
      onConfirm: () => {
        const selectEl = document.getElementById('contractNoSelect');
        const inputEl = document.getElementById('contractNoInput');
        const contractNo = inputEl.value.trim() || selectEl.value.trim();
        
        if (!contractNo) {
          window.NotificationSystem?.toast('请输入或选择合同号', 'warning');
          inputEl.focus();
          return false; // 不关闭弹窗
        }
        
        // 查找对应的订单（支持合同号和订单号匹配）
        const order = orderList.find(o => {
          const oContractNo = (o.contractNo || '').trim();
          const oOrderNo = (o.orderNo || '').trim();
          const searchContractNo = contractNo.trim();
          return (oContractNo && oContractNo === searchContractNo) || 
                 (oOrderNo && oOrderNo === searchContractNo);
        });
        
        console.log('[合同号选择] 查找订单:', { contractNo, order: order ? { id: order.id, contractNo: order.contractNo, orderNo: order.orderNo } : null });
        
        if (order && order.id != null) {
          console.log('[合同号选择] 找到订单，ID:', order.id);
          // 返回订单ID
          return { type: 'order', value: order.id };
        } else {
          console.warn('[合同号选择] 未找到对应的订单，合同号:', contractNo);
          window.NotificationSystem?.toast(`未找到合同号为"${contractNo}"的订单，将创建新订单`, 'info');
          // 返回null表示新建订单
          return { type: 'new', value: null };
        }
      },
      onClose: () => {
        // 标记弹窗正在关闭，避免触发验证
        isDialogClosing = true;
        
        // 清理验证监听器，避免在关闭时触发验证
        if (validationCleanup && typeof validationCleanup === 'function') {
          validationCleanup();
        }
        
        // 清除输入框的验证错误状态
        const inputEl = document.getElementById('contractNoInput');
        if (inputEl) {
          inputEl.classList.remove('validation-error');
        }
        
        // 用户取消，返回特殊值 'CANCELLED'
        return { type: 'cancelled', value: 'CANCELLED' };
      }
    });

    // 处理返回结果
    if (result && result.type === 'order') {
      resolve(result.value); // 返回订单ID
    } else if (result && result.type === 'new') {
      resolve(null); // 返回null表示新建订单
    } else {
      resolve('CANCELLED'); // 用户取消
    }
  });
}

