/**
 * 条款区块
 */
import { BaseBlock } from './base-block.js';

export class TermsBlock extends BaseBlock {
  static displayName = '条款';
  static icon = '📝';
  static category = 'content';

  static getDefaultConfig() {
    return {
      layout: 'two-column',  // two-column | single-column
      fields: [
        { position: 'left', label: 'TOTAL VALUE:', binding: 'order.totalValue' },
        { position: 'right', label: 'TOTAL AMOUNT:', binding: 'calc.totalAmountUSD' },
        { position: 'left', label: 'SHIPMENT DATE:', binding: 'order.shipmentDate' },
        { position: 'right', label: 'DESTINATION:', binding: 'order.destination' },
        { position: 'left', label: 'PAYMENT:', binding: 'order.payment' },
        { position: 'right', label: 'INSURANCE:', binding: 'order.insurance' },
        { position: 'left', label: 'SPECIAL CLAUSE:', binding: 'order.specialClause' },
        { position: 'right', label: 'REMARKS:', binding: 'order.remarks' }
      ],
      style: {
        fontSize: 11,
        labelFontWeight: 'normal',
        spacing: 8
      }
    };
  }

  render(data) {
    const config = { ...TermsBlock.getDefaultConfig(), ...this.config };
    
    if (config.layout === 'two-column') {
      return this.renderTwoColumn(config, data);
    } else {
      return this.renderSingleColumn(config, data);
    }
  }

  renderTwoColumn(config, data) {
    const leftFields = config.fields.filter(f => f.position === 'left');
    const rightFields = config.fields.filter(f => f.position === 'right');

    let html = '<div class="block terms-block" style="margin-bottom: 15px;">';
    html += '<div style="display: flex; justify-content: space-between;">';
    
    // 左列
    html += '<div style="flex: 1;">';
    leftFields.forEach(field => {
      const value = this.resolveBinding(field.binding, data);
      html += `<div style="margin-bottom: ${config.style.spacing}px; font-size: ${config.style.fontSize}pt;">
        <span style="font-weight: ${config.style.labelFontWeight};">${field.label}</span> ${value || ''}
      </div>`;
    });
    html += '</div>';

    // 右列
    html += '<div style="flex: 1;">';
    rightFields.forEach(field => {
      const value = this.resolveBinding(field.binding, data);
      html += `<div style="margin-bottom: ${config.style.spacing}px; font-size: ${config.style.fontSize}pt;">
        <span style="font-weight: ${config.style.labelFontWeight};">${field.label}</span> ${value || ''}
      </div>`;
    });
    html += '</div>';

    html += '</div></div>';
    return html;
  }

  renderSingleColumn(config, data) {
    let html = '<div class="block terms-block" style="margin-bottom: 15px;">';
    config.fields.forEach(field => {
      const value = this.resolveBinding(field.binding, data);
      html += `<div style="margin-bottom: ${config.style.spacing}px; font-size: ${config.style.fontSize}pt;">
        <span style="font-weight: ${config.style.labelFontWeight};">${field.label}</span> ${value || ''}
      </div>`;
    });
    html += '</div>';
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
          { value: 'single-column', label: '单列布局' }
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

