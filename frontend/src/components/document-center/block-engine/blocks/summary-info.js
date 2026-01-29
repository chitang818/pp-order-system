/**
 * 汇总信息区块
 */
import { BaseBlock } from './base-block.js';

export class SummaryInfoBlock extends BaseBlock {
  static displayName = '汇总信息';
  static icon = '💰';
  static category = 'content';

  static getDefaultConfig() {
    return {
      layout: 'two-column',  // two-column | single-column
      fields: [
        { position: 'left', label: 'TOTAL QUANTITY:', binding: 'calc.totalQuantityPCS' },
        { position: 'right', label: 'TOTAL AMOUNT:', binding: 'calc.totalAmountUSD' },
        { position: 'left', label: 'TOTAL PACKAGES:', binding: 'calc.totalPackages' },
        { position: 'right', label: 'TOTAL WEIGHT:', binding: 'calc.totalGrossWeight' }
      ],
      style: {
        fontSize: 11,
        labelFontWeight: 'bold',
        spacing: 8
      }
    };
  }

  render(data) {
    const config = { ...SummaryInfoBlock.getDefaultConfig(), ...this.config };
    
    if (config.layout === 'two-column') {
      return this.renderTwoColumn(config, data);
    } else {
      return this.renderSingleColumn(config, data);
    }
  }

  renderTwoColumn(config, data) {
    const leftFields = config.fields.filter(f => f.position === 'left');
    const rightFields = config.fields.filter(f => f.position === 'right');

    let html = '<div class="block summary-info-block" style="margin-bottom: 15px;">';
    html += '<div style="display: flex; justify-content: space-between;">';
    
    // 左列
    html += '<div style="flex: 1;">';
    leftFields.forEach(field => {
      const value = this.resolveBinding(field.binding, data);
      if (value !== '') {
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
      if (value !== '') {
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
    let html = '<div class="block summary-info-block" style="margin-bottom: 15px;">';
    config.fields.forEach(field => {
      const value = this.resolveBinding(field.binding, data);
      if (value !== '') {
        html += `<div style="margin-bottom: ${config.style.spacing}px; font-size: ${config.style.fontSize}pt;">
          <span style="font-weight: ${config.style.labelFontWeight};">${field.label}</span> ${value}
        </div>`;
      }
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

