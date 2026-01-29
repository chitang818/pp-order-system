/**
 * 订单信息区块
 */
import { BaseBlock } from './base-block.js';

export class OrderInfoBlock extends BaseBlock {
  static displayName = '订单信息';
  static icon = '📦';
  static category = 'content';

  static getDefaultConfig() {
    return {
      layout: 'two-column',  // two-column | single-column | list
      fields: [
        { position: 'left', label: 'CONTRACT No:', binding: 'order.contractNo' },
        { position: 'right', label: 'INVOICE NO:', binding: 'order.invoiceNo' },
        { position: 'left', label: 'DATE:', binding: 'order.invoiceDate' },
        { position: 'right', label: 'SHIPMENT DATE:', binding: 'order.shipmentDate' }
      ],
      style: {
        fontSize: 11,
        labelFontWeight: 'normal',
        spacing: 8
      }
    };
  }

  render(data) {
    const config = { ...OrderInfoBlock.getDefaultConfig(), ...this.config };
    
    if (config.layout === 'two-column') {
      return this.renderTwoColumn(config, data);
    } else if (config.layout === 'list') {
      return this.renderList(config, data);
    } else {
      return this.renderSingleColumn(config, data);
    }
  }

  renderTwoColumn(config, data) {
    const leftFields = config.fields.filter(f => f.position === 'left');
    const rightFields = config.fields.filter(f => f.position === 'right');

    let html = '<div class="block order-info-block" style="margin-bottom: 15px;">';
    html += '<div style="display: flex; justify-content: space-between;">';
    
    // 左列
    html += '<div style="flex: 1;">';
    leftFields.forEach(field => {
      const value = this.resolveBinding(field.binding, data);
      if (value) {
        html += `<div style="margin-bottom: ${config.style.spacing}px; font-size: ${config.style.fontSize}pt;">
          <span style="font-weight: ${config.style.labelFontWeight};">${field.label}</span> ${value}
        </div>`;
      }
    });
    html += '</div>';

    // 右列
    html += '<div style="flex: 1; text-align: right;">';
    rightFields.forEach(field => {
      const value = this.resolveBinding(field.binding, data);
      if (value) {
        html += `<div style="margin-bottom: ${config.style.spacing}px; font-size: ${config.style.fontSize}pt;">
          <span style="font-weight: ${config.style.labelFontWeight};">${field.label}</span> ${value}
        </div>`;
      }
    });
    html += '</div>';

    html += '</div></div>';
    return html;
  }

  renderSingleColumn(config, data) {
    let html = '<div class="block order-info-block" style="margin-bottom: 15px;">';
    config.fields.forEach(field => {
      const value = this.resolveBinding(field.binding, data);
      if (value) {
        html += `<div style="margin-bottom: ${config.style.spacing}px; font-size: ${config.style.fontSize}pt;">
          <span style="font-weight: ${config.style.labelFontWeight};">${field.label}</span> ${value}
        </div>`;
      }
    });
    html += '</div>';
    return html;
  }

  renderList(config, data) {
    let html = '<div class="block order-info-block" style="margin-bottom: 15px;">';
    html += '<ul style="list-style: none; padding: 0; margin: 0;">';
    config.fields.forEach(field => {
      const value = this.resolveBinding(field.binding, data);
      if (value) {
        html += `<li style="margin-bottom: ${config.style.spacing}px; font-size: ${config.style.fontSize}pt;">
          <span style="font-weight: ${config.style.labelFontWeight};">${field.label}</span> ${value}
        </li>`;
      }
    });
    html += '</ul></div>';
    return html;
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'layout',
        label: '布局方式',
        type: 'select',
        options: [
          { value: 'two-column', label: '两列布局' },
          { value: 'single-column', label: '单列布局' },
          { value: 'list', label: '列表布局' }
        ]
      },
      {
        name: 'style.fontSize',
        label: '字体大小',
        type: 'number',
        min: 9,
        max: 14
      }
    ];
  }
}

