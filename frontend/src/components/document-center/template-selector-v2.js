/**
 * 模板选择器 V2
 * 支持自动匹配和手动选择
 */
import { TemplateMatcher } from '../../services/template-matcher.js';

export class TemplateSelectorV2 {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = options;
    this.selectedTemplate = null;
    this.matchResult = null;
    this.templates = options.templates || [];
  }

  /**
   * 根据订单自动匹配模板
   */
  async autoMatch(order, docType) {
    // 如果模板列表为空，尝试加载
    if (!this.templates || this.templates.length === 0) {
      await this.loadTemplates(docType);
    }

    this.matchResult = TemplateMatcher.match(order, docType, this.templates);
    this.selectedTemplate = this.matchResult.template;
    
    this.render();
    this.notifyChange();
    
    return this.matchResult;
  }

  /**
   * 加载模板列表
   */
  async loadTemplates(docType) {
    try {
      const response = await fetch(`/api/document-center/templates?type=${docType}`);
      if (response.ok) {
        const data = await response.json();
        this.templates = data.templates || data || [];
      } else {
        console.warn('加载模板列表失败');
        this.templates = [];
      }
    } catch (error) {
      console.error('加载模板列表错误:', error);
      this.templates = [];
    }
    return this.templates;
  }

  /**
   * 设置模板列表
   */
  setTemplates(templates) {
    this.templates = templates || [];
    this.render();
  }

  /**
   * 手动选择模板
   */
  selectTemplate(templateId) {
    this.selectedTemplate = this.templates.find(t => t.id === templateId);
    this.render();
    this.notifyChange();
  }

  /**
   * 渲染选择器
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    
    const template = this.selectedTemplate;
    const result = this.matchResult;
    
    container.innerHTML = `
      <div class="template-selector-v2">
        <label class="selector-label">选择模板</label>
        
        ${result ? `
          <div class="auto-match-info">
            <span class="match-icon">🎯</span>
            <span class="match-text">
              已自动匹配: <strong>${template?.name || '无'}</strong>
            </span>
            <span class="match-reason">${result.reason}</span>
          </div>
        ` : ''}
        
        <select id="templateSelect" class="template-select">
          <option value="">请选择模板...</option>
          ${this.renderOptions()}
        </select>
        
        ${result?.alternatives?.length > 0 ? `
          <div class="alternatives">
            <span class="alt-label">其他可用模板:</span>
            ${result.alternatives.map(t => `
              <button class="alt-btn" data-id="${t.id}">${t.name}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>
      
      <style>
        .template-selector-v2 {
          margin-bottom: 20px;
        }
        .selector-label {
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 14px;
        }
        .auto-match-info {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 15px;
          background: #f6ffed;
          border: 1px solid #b7eb8f;
          border-radius: 4px;
          margin-bottom: 10px;
          font-size: 13px;
        }
        .match-icon {
          font-size: 16px;
        }
        .match-text {
          flex: 1;
        }
        .match-reason {
          color: #52c41a;
          font-size: 12px;
        }
        .template-select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          background: #fff;
        }
        .template-select:focus {
          outline: none;
          border-color: #1890ff;
        }
        .alternatives {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .alt-label {
          font-size: 12px;
          color: #666;
        }
        .alt-btn {
          padding: 4px 10px;
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .alt-btn:hover {
          border-color: #1890ff;
          color: #1890ff;
        }
      </style>
    `;
    
    this.bindEvents();
  }

  /**
   * 渲染选项
   */
  renderOptions() {
    return this.templates.map(t => `
      <option value="${t.id}" ${t.id === this.selectedTemplate?.id ? 'selected' : ''}>
        ${t.name}
        ${t.applicability?.isDefault ? ' (默认)' : ''}
        ${t.applicability?.productTypes?.length > 0 ? ` [${t.applicability.productTypes.join(',')}类品]` : ''}
        ${t.applicability?.customerNames?.length > 0 ? ` [${t.applicability.customerNames.join(',')}]` : ''}
      </option>
    `).join('');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    
    // 选择变更
    container.querySelector('#templateSelect')?.addEventListener('change', (e) => {
      const id = e.target.value;
      if (id) {
        this.selectTemplate(id);
      } else {
        this.selectedTemplate = null;
        this.notifyChange();
      }
    });

    // 备选模板按钮
    container.querySelectorAll('.alt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.selectTemplate(id);
      });
    });
  }

  /**
   * 获取选中的模板
   */
  getSelectedTemplate() {
    return this.selectedTemplate;
  }

  /**
   * 获取匹配结果
   */
  getMatchResult() {
    return this.matchResult;
  }

  /**
   * 通知变更
   */
  notifyChange() {
    if (this.options.onChange) {
      this.options.onChange(this.selectedTemplate, this.matchResult);
    }
  }
}

