/**
 * 模板配置面板组件 - 重构版本
 * 紧凑设计，优化空间利用
 */

import { DocumentTypeConfig } from '../../utils/document-type-config.js';

export class TemplateConfigPanel {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.currentDocumentType = options.documentType || 'invoice';
    this.onPresetClick = options.onPresetClick || null;
    this.onComponentClick = options.onComponentClick || null;
    this.onFieldClick = options.onFieldClick || null;
    this.onTypeChange = options.onTypeChange || null;
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
      console.error('[TemplateConfigPanel] 容器未找到');
      return;
    }

    const typeConfig = DocumentTypeConfig.getTypeConfig(this.currentDocumentType);
    const availableFields = DocumentTypeConfig.getAvailableFields(this.currentDocumentType);

    container.innerHTML = `
      <div class="template-config-panel-content">
        <!-- 预设模板区域 -->
        <div class="config-section-item">
          <div class="section-header">
            <span class="section-icon">🎯</span>
            <div class="section-title-group">
              <div class="section-title">快速模板</div>
              <div class="section-desc">预设模板</div>
            </div>
          </div>
          <div class="section-body">
            <div class="preset-grid">
              <button class="preset-btn" data-preset="minimal">
                <span class="preset-icon">✨</span>
                <span class="preset-label">简洁</span>
              </button>
              <button class="preset-btn active" data-preset="standard">
                <span class="preset-icon">⭐</span>
                <span class="preset-label">标准</span>
              </button>
              <button class="preset-btn" data-preset="detailed">
                <span class="preset-icon">📋</span>
                <span class="preset-label">详细</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 快速插入组件 -->
        <div class="config-section-item">
          <div class="section-header">
            <span class="section-icon">⚡</span>
            <div class="section-title-group">
              <div class="section-title">快速插入</div>
              <div class="section-desc">常用组件</div>
            </div>
          </div>
          <div class="section-body">
            <div class="component-grid">
              <button class="component-btn" data-component="company-header">
                <span class="component-icon">🏢</span>
                <span class="component-label">公司</span>
              </button>
              <button class="component-btn" data-component="customer-info">
                <span class="component-icon">👤</span>
                <span class="component-label">客户</span>
              </button>
              <button class="component-btn" data-component="product-table">
                <span class="component-icon">📦</span>
                <span class="component-label">产品</span>
              </button>
              <button class="component-btn" data-component="signature">
                <span class="component-icon">✍️</span>
                <span class="component-label">签名</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 订单字段 -->
        <div class="config-section-item">
          <div class="section-header">
            <span class="section-icon">📋</span>
            <div class="section-title-group">
              <div class="section-title">订单信息</div>
              <div class="section-desc">点击插入</div>
            </div>
          </div>
          <div class="section-body">
            <div class="field-grid">
              ${this.renderFieldButtons(availableFields.all, 'order')}
            </div>
          </div>
        </div>

        <!-- 客户字段 -->
        <div class="config-section-item">
          <div class="section-header">
            <span class="section-icon">👥</span>
            <div class="section-title-group">
              <div class="section-title">客户信息</div>
              <div class="section-desc">点击插入</div>
            </div>
          </div>
          <div class="section-body">
            <div class="field-grid">
              <button class="field-btn" data-field="{{customer.name}}">客户名称</button>
              <button class="field-btn" data-field="{{customer.address}}">客户地址</button>
              <button class="field-btn" data-field="{{customer.tel}}">联系电话</button>
              <button class="field-btn" data-field="{{customer.fax}}">传真号码</button>
            </div>
          </div>
        </div>

        <!-- 公司字段 -->
        <div class="config-section-item">
          <div class="section-header">
            <span class="section-icon">🏢</span>
            <div class="section-title-group">
              <div class="section-title">公司信息</div>
              <div class="section-desc">点击插入</div>
            </div>
          </div>
          <div class="section-body">
            <div class="field-grid">
              <button class="field-btn" data-field="{{company.companyNameCN}}">公司中文名</button>
              <button class="field-btn" data-field="{{company.companyNameEN}}">公司英文名</button>
              <button class="field-btn" data-field="{{company.companyAddressCN}}">地址(中文)</button>
              <button class="field-btn" data-field="{{company.companyAddressEN}}">地址(英文)</button>
              <button class="field-btn" data-field="{{company.companyTel}}">公司电话</button>
              <button class="field-btn" data-field="{{company.companyFax}}">公司传真</button>
            </div>
          </div>
        </div>
      </div>

      <style>
        .template-config-panel-content {
          padding: 0;
        }

        .config-section-item {
          border-bottom: 1px solid #f3f4f6;
        }

        .config-section-item:last-child {
          border-bottom: none;
        }

        .section-header {
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f9fafb;
          border-bottom: 1px solid #f3f4f6;
        }

        .section-icon {
          font-size: 14px;
          line-height: 1;
        }

        .section-title-group {
          flex: 1;
        }

        .section-title {
          font-size: 11px;
          font-weight: 600;
          color: #111827;
          line-height: 1.3;
        }

        .section-desc {
          font-size: 9px;
          color: #6b7280;
          line-height: 1.2;
        }

        .section-body {
          padding: 10px 12px;
        }

        /* 预设模板按钮 */
        .preset-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }

        .preset-btn {
          padding: 8px 4px;
          border: 1px solid #e5e7eb;
          background: #fff;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .preset-btn:hover {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .preset-btn.active {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .preset-icon {
          font-size: 16px;
        }

        .preset-label {
          font-size: 10px;
          font-weight: 500;
          color: #374151;
        }

        /* 组件按钮 */
        .component-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
        }

        .component-btn {
          padding: 10px 8px;
          border: 1px solid #e5e7eb;
          background: #fff;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .component-btn:hover {
          border-color: #3b82f6;
          background: #f0f9ff;
        }

        .component-icon {
          font-size: 20px;
        }

        .component-label {
          font-size: 10px;
          font-weight: 500;
          color: #374151;
        }

        /* 字段按钮 */
        .field-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .field-btn {
          padding: 4px 10px;
          border: 1px solid #e5e7eb;
          background: #fff;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s;
          font-size: 10px;
          font-weight: 500;
          color: #374151;
          white-space: nowrap;
        }

        .field-btn:hover {
          border-color: #3b82f6;
          background: #eff6ff;
          color: #3b82f6;
        }
      </style>
    `;
  }

  /**
   * 渲染字段按钮
   */
  renderFieldButtons(fields, prefix) {
    const fieldLabels = {
      contractNo: '合同号',
      invoiceNo: '发票号',
      invoiceDate: '发票日期',
      blNo: '提单号',
      shipmentDate: '发货日期',
      shipFrom: '起运港',
      shipTo: '目的港',
      orderNo: '订单号',
      totalUSD: '总金额',
      totalPackages: '总件数',
      totalWeight: '总重量',
      totalQuantity: '总数量',
      forwarder: '货代'
    };

    return fields.map(field => {
      const label = fieldLabels[field] || field;
      return `<button class="field-btn" data-field="{{${prefix}.${field}}}">${label}</button>`;
    }).join('');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 预设模板按钮
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        const preset = e.currentTarget.dataset.preset;
        if (this.onPresetClick) {
          this.onPresetClick(preset);
        }
      });
    });

    // 组件按钮
    document.querySelectorAll('.component-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const component = e.currentTarget.dataset.component;
        if (this.onComponentClick) {
          this.onComponentClick(component);
        }
      });
    });

    // 字段按钮
    document.querySelectorAll('.field-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const field = e.currentTarget.dataset.field;
        if (this.onFieldClick) {
          this.onFieldClick(field);
        }
      });
    });
  }

  /**
   * 设置单据类型
   */
  setDocumentType(documentType) {
    this.currentDocumentType = documentType;
    this.render();
    this.bindEvents();
  }
}
