/**
 * 计算规则配置面板
 * 提供可视化的计算规则配置界面
 */

import { CalculationFunctions } from './calculation-functions.js';
import { CalculationConfigManager } from './calculation-config-manager.js';

export class CalculationConfigPanel {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.calculations = options.calculations || [];
    this.onChange = options.onChange || null;
    this.availableFields = options.availableFields || this.getDefaultAvailableFields();
  }

  /**
   * 初始化面板
   */
  init() {
    this.render();
    this.bindEvents();
  }

  /**
   * 渲染面板
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      // 容器不存在时，静默返回（在弹窗模式下这是正常的）
      // 不输出错误日志，避免控制台噪音
      return;
    }

    container.innerHTML = `
      <div class="calculation-config-panel">
        <div class="panel-header">
          <h3>计算规则配置</h3>
          <div style="display: flex; gap: 8px;">
            <button class="btn-template" id="btnTemplates" title="快速模板">
              📋 模板
            </button>
            <button class="btn-add-calculation" id="addCalculationBtn">
              <span>+</span> 添加规则
            </button>
          </div>
        </div>
        
        <!-- 快速模板面板 -->
        <div class="templates-panel" id="templatesPanel" style="display: none; margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <strong style="font-size: 13px; color: #111827;">快速模板</strong>
            <button class="btn-close" id="btnCloseTemplates" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #6b7280;">×</button>
          </div>
          <div class="templates-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
            <button class="template-btn" data-template="totalAmount">
              <div style="font-weight: 600; font-size: 12px;">总金额</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">计算所有产品金额总和</div>
            </button>
            <button class="template-btn" data-template="totalQuantity">
              <div style="font-weight: 600; font-size: 12px;">总数量</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">计算所有产品数量总和</div>
            </button>
            <button class="template-btn" data-template="totalPackages">
              <div style="font-weight: 600; font-size: 12px;">总件数</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">计算所有产品件数总和</div>
            </button>
            <button class="template-btn" data-template="totalVolume">
              <div style="font-weight: 600; font-size: 12px;">总体积</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">计算所有产品体积总和</div>
            </button>
          </div>
        </div>
        
        <div class="calculations-list" id="calculationsList">
          ${this.renderCalculationsList()}
        </div>
        
        <div class="panel-footer">
          <div class="help-text">
            <strong>提示：</strong>
            <ul>
              <li>默认计算变量（无需配置即可使用）：netWeight, grossWeight, packageUnit, amount等</li>
              <li>可以通过配置添加新的计算规则</li>
              <li>公式中可以使用 it.字段名 访问产品字段</li>
              <li>可以使用 sum 表示累加值</li>
            </ul>
          </div>
        </div>
      </div>

      <style>
        .calculation-config-panel {
          padding: 16px;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #e5e7eb;
        }

        .panel-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        .btn-add-calculation {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: #3b82f6;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-add-calculation:hover {
          background: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .btn-template {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-template:hover {
          background: #e5e7eb;
          border-color: #d1d5db;
        }

        .template-btn {
          padding: 10px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .template-btn:hover {
          background: #eff6ff;
          border-color: #3b82f6;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
        }

        .btn-close:hover {
          color: #111827;
        }

        .calculations-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .calculation-item {
          padding: 16px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          position: relative;
        }

        .calculation-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .calculation-item-title {
          font-weight: 600;
          color: #111827;
          font-size: 14px;
        }

        .calculation-item-actions {
          display: flex;
          gap: 8px;
        }

        .btn-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #e5e7eb;
          background: #fff;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-icon:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
        }

        .btn-icon.danger:hover {
          background: #fee2e2;
          border-color: #fca5a5;
          color: #dc2626;
        }

        .calculation-item-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-label {
          font-size: 12px;
          font-weight: 500;
          color: #374151;
        }

        .form-input,
        .form-select {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s;
        }

        .form-input:focus,
        .form-select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-textarea {
          min-height: 80px;
          resize: vertical;
          font-family: 'Courier New', monospace;
          font-size: 13px;
        }

        .panel-footer {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
        }

        .help-text {
          font-size: 12px;
          color: #6b7280;
          line-height: 1.6;
        }

        .help-text ul {
          margin: 8px 0 0 20px;
          padding: 0;
        }

        .help-text li {
          margin: 4px 0;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #9ca3af;
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }
      </style>
    `;
  }

  /**
   * 渲染计算规则列表
   */
  renderCalculationsList() {
    if (this.calculations.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <div>暂无计算规则</div>
          <div style="font-size: 12px; margin-top: 8px;">点击"添加计算规则"开始配置</div>
        </div>
      `;
    }

    return this.calculations.map((calc, index) => this.renderCalculationItem(calc, index)).join('');
  }

  /**
   * 渲染单个计算规则项
   */
  renderCalculationItem(calc, index) {
    const typeOptions = [
      { value: 'sum', label: '求和 (Sum)' },
      { value: 'reduce', label: '累加 (Reduce)' },
      { value: 'map', label: '映射 (Map)' },
      { value: 'custom', label: '自定义函数 (Custom)' }
    ];

    return `
      <div class="calculation-item" data-index="${index}">
        <div class="calculation-item-header">
          <div class="calculation-item-title">计算规则 #${index + 1}</div>
          <div class="calculation-item-actions">
            <button class="btn-icon" data-action="duplicate" data-index="${index}" title="复制">
              📋
            </button>
            <button class="btn-icon danger" data-action="delete" data-index="${index}" title="删除">
              🗑️
            </button>
          </div>
        </div>
        <div class="calculation-item-body">
          <div class="form-group">
            <label class="form-label">计算类型 *</label>
            <select class="form-select" data-field="type" data-index="${index}">
              ${typeOptions.map(opt => `
                <option value="${opt.value}" ${calc.type === opt.value ? 'selected' : ''}>
                  ${opt.label}
                </option>
              `).join('')}
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">结果变量名 *</label>
            <input 
              type="text" 
              class="form-input" 
              data-field="target" 
              data-index="${index}"
              value="${calc.target || ''}"
              placeholder="例如: totalAmount"
            />
          </div>
          
          ${calc.type === 'custom' ? `
            <div class="form-group full-width">
              <label class="form-label">函数名称 *</label>
              <input 
                type="text" 
                class="form-input" 
                data-field="function" 
                data-index="${index}"
                value="${calc.function || ''}"
                placeholder="例如: calculateVolume"
              />
            </div>
          ` : `
            <div class="form-group full-width">
              <label class="form-label">计算公式 *</label>
              <textarea 
                class="form-input form-textarea" 
                data-field="formula" 
                data-index="${index}"
                placeholder="例如: sum + Number(it.quantity || 0) * Number(it.unitPrice || 0)"
              >${calc.formula || ''}</textarea>
              <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
                可用变量: <code>sum</code> (累加值), <code>it.字段名</code> (当前产品项), <code>item.字段名</code> (当前产品项)
              </div>
              <div style="font-size: 11px; color: #3b82f6; margin-top: 4px; cursor: pointer;" class="btn-show-fields" data-index="${index}">
                📋 查看可用字段
              </div>
              <div class="fields-preview" id="fieldsPreview${index}" style="display: none; margin-top: 8px; padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 11px; max-height: 150px; overflow-y: auto;">
                <div style="font-weight: 600; margin-bottom: 6px; color: #111827;">可用字段：</div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${this.availableFields.map(field => `<span style="padding: 2px 6px; background: #e0f2fe; color: #0369a1; border-radius: 3px; font-family: monospace;">${field}</span>`).join('')}
                </div>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #6b7280;">
                  💡 提示：订单中的新字段会自动可用，无需配置
                </div>
              </div>
            </div>
          `}
          
          <div class="form-group">
            <label class="form-label">初始值</label>
            <input 
              type="number" 
              class="form-input" 
              data-field="initial" 
              data-index="${index}"
              value="${calc.initial || '0'}"
              placeholder="0"
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">作用域</label>
            <select class="form-select" data-field="scope" data-index="${index}">
              <option value="items" ${calc.scope === 'items' ? 'selected' : ''}>产品列表 (items)</option>
              <option value="item" ${calc.scope === 'item' ? 'selected' : ''}>单个产品 (item)</option>
              <option value="order" ${calc.scope === 'order' ? 'selected' : ''}>订单 (order)</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 添加计算规则
    const addBtn = document.getElementById('addCalculationBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.addCalculation();
      });
    }

    // 删除计算规则
    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.deleteCalculation(index);
      });
    });

    // 复制计算规则
    document.querySelectorAll('[data-action="duplicate"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.duplicateCalculation(index);
      });
    });

    // 输入变化
    document.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('change', () => {
        this.updateCalculation();
      });
      // 实时验证
      if (input.dataset.field === 'formula' || input.dataset.field === 'target') {
        input.addEventListener('input', () => {
          this.validateCalculationItem(input);
        });
      }
    });

    // 显示/隐藏字段预览
    document.querySelectorAll('.btn-show-fields').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = e.currentTarget.dataset.index;
        const preview = document.getElementById(`fieldsPreview${index}`);
        if (preview) {
          preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
        }
      });
    });

    // 快速模板按钮
    const btnTemplates = document.getElementById('btnTemplates');
    const templatesPanel = document.getElementById('templatesPanel');
    const btnCloseTemplates = document.getElementById('btnCloseTemplates');
    
    if (btnTemplates && templatesPanel) {
      btnTemplates.addEventListener('click', () => {
        templatesPanel.style.display = templatesPanel.style.display === 'none' ? 'block' : 'none';
      });
    }
    
    if (btnCloseTemplates && templatesPanel) {
      btnCloseTemplates.addEventListener('click', () => {
        templatesPanel.style.display = 'none';
      });
    }

    // 快速模板应用
    document.querySelectorAll('.template-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const template = e.currentTarget.dataset.template;
        this.applyTemplate(template);
        if (templatesPanel) {
          templatesPanel.style.display = 'none';
        }
      });
    });
  }

  /**
   * 添加计算规则
   */
  addCalculation() {
    const newCalc = {
      type: 'sum',
      target: '',
      formula: 'sum + 0',
      initial: '0',
      scope: 'items'
    };
    
    this.calculations.push(newCalc);
    this.render();
    this.bindEvents();
    this.notifyChange();
  }

  /**
   * 删除计算规则
   */
  deleteCalculation(index) {
    if (confirm('确定要删除这个计算规则吗？')) {
      this.calculations.splice(index, 1);
      this.render();
      this.bindEvents();
      this.notifyChange();
    }
  }

  /**
   * 复制计算规则
   */
  duplicateCalculation(index) {
    const calc = { ...this.calculations[index] };
    this.calculations.splice(index + 1, 0, calc);
    this.render();
    this.bindEvents();
    this.notifyChange();
  }

  /**
   * 更新计算规则
   */
  updateCalculation() {
    const items = document.querySelectorAll('.calculation-item');
    items.forEach((item, index) => {
      const calc = this.calculations[index] || {};
      const inputs = item.querySelectorAll('[data-field]');
      
      inputs.forEach(input => {
        const field = input.dataset.field;
        const value = input.type === 'number' ? parseFloat(input.value) : input.value;
        
        if (field === 'initial' && input.value === '') {
          calc[field] = '0';
        } else {
          calc[field] = value;
        }
      });
      
      this.calculations[index] = calc;
    });
    
    this.notifyChange();
  }

  /**
   * 通知变化
   */
  notifyChange() {
    if (this.onChange) {
      this.onChange(this.calculations);
    }
  }

  /**
   * 获取计算规则
   */
  getCalculations() {
    return this.calculations;
  }

  /**
   * 设置计算规则
   */
  setCalculations(calculations) {
    this.calculations = calculations || [];
    // 只有在容器存在时才渲染
    const container = document.getElementById(this.containerId);
    if (container) {
      this.render();
      this.bindEvents();
    } else {
      // 容器不存在时，只更新数据，不渲染（避免控制台警告）
      // 这种情况在弹窗模式下是正常的
    }
  }

  /**
   * 验证计算规则
   */
  validate() {
    return CalculationConfigManager.validateCalculations(this.calculations);
  }

  /**
   * 验证单个计算规则项
   */
  validateCalculationItem(input) {
    const index = parseInt(input.dataset.index);
    const calc = this.calculations[index];
    if (!calc) return;

    const field = input.dataset.field;
    const value = input.value.trim();

    // 移除之前的错误提示
    const existingError = input.parentElement.querySelector('.field-error');
    if (existingError) {
      existingError.remove();
    }

    // 验证必填字段
    if (field === 'target' && !value) {
      this.showFieldError(input, '结果变量名不能为空');
      return;
    }

    if (field === 'formula' && calc.type !== 'custom' && !value) {
      this.showFieldError(input, '计算公式不能为空');
      return;
    }

    if (field === 'function' && calc.type === 'custom' && !value) {
      this.showFieldError(input, '函数名称不能为空');
      return;
    }

    // 验证变量名格式
    if (field === 'target' && value && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      this.showFieldError(input, '变量名只能包含字母、数字和下划线，且不能以数字开头');
      return;
    }
  }

  /**
   * 显示字段错误提示
   */
  showFieldError(input, message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.style.cssText = 'font-size: 11px; color: #ef4444; margin-top: 4px;';
    errorDiv.textContent = message;
    input.parentElement.appendChild(errorDiv);
  }

  /**
   * 应用快速模板
   */
  applyTemplate(templateName) {
    const templates = {
      totalAmount: {
        type: 'sum',
        target: 'totalAmount',
        formula: 'sum + Number(it.quantity || 0) * Number(it.unitPrice || 0)',
        initial: '0',
        scope: 'items'
      },
      totalQuantity: {
        type: 'sum',
        target: 'totalQuantity',
        formula: 'sum + Number(it.quantity || 0)',
        initial: '0',
        scope: 'items'
      },
      totalPackages: {
        type: 'sum',
        target: 'totalPackages',
        formula: 'sum + Number(it.packages || 0)',
        initial: '0',
        scope: 'items'
      },
      totalVolume: {
        type: 'sum',
        target: 'totalVolume',
        formula: 'sum + Number(it.volume || 0)',
        initial: '0',
        scope: 'items'
      }
    };

    const template = templates[templateName];
    if (template) {
      // 检查是否已存在
      const exists = this.calculations.some(c => c.target === template.target);
      if (exists) {
        if (window.NotificationSystem) {
          window.NotificationSystem.toast(`计算规则 "${template.target}" 已存在`, 'warning');
        }
        return;
      }

      this.calculations.push(template);
      this.render();
      this.bindEvents();
      this.notifyChange();
      
      if (window.NotificationSystem) {
        window.NotificationSystem.toast(`已添加计算规则：${template.target}`, 'success');
      }
    }
  }

  /**
   * 获取默认可用字段
   */
  getDefaultAvailableFields() {
    return [
      'quantity', 'packages', 'unitPrice', 'price', 'amount',
      'weight', 'actualWeight', 'netWeight', 'grossWeight',
      'unit', 'model', 'packing', 'volume', 'discount', 'taxRate',
      'labelWeight', 'safetyFactor', 'cleanliness'
    ];
  }
}

