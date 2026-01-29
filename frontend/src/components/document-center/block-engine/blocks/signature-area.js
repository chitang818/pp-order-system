/**
 * 签名区块
 */
import { BaseBlock } from './base-block.js';

export class SignatureAreaBlock extends BaseBlock {
  static displayName = '签名';
  static icon = '✍️';
  static category = 'footer';

  static getDefaultConfig() {
    return {
      layout: 'two-column',  // two-column | single-column
      leftLabel: 'THE BUYER',
      rightLabel: 'THE SELLER',
      showLines: true,
      style: {
        fontSize: 11,
        marginTop: 30,
        lineHeight: 40
      }
    };
  }

  render(data) {
    const config = { ...SignatureAreaBlock.getDefaultConfig(), ...this.config };

    let html = '<div class="block signature-area-block" style="margin-top: ' + config.style.marginTop + 'px; margin-bottom: 15px;">';
    
    if (config.layout === 'two-column') {
      html += '<div style="display: flex; justify-content: space-between;">';
      
      // 左侧签名
      html += '<div style="flex: 1; text-align: center;">';
      html += `<div style="font-size: ${config.style.fontSize}pt; margin-bottom: 5px;">${config.leftLabel}</div>`;
      if (config.showLines) {
        html += `<div style="border-top: 1px solid #333; width: 200px; margin: 0 auto; height: ${config.style.lineHeight}px;"></div>`;
      }
      html += '</div>';

      // 右侧签名
      html += '<div style="flex: 1; text-align: center;">';
      html += `<div style="font-size: ${config.style.fontSize}pt; margin-bottom: 5px;">${config.rightLabel}</div>`;
      if (config.showLines) {
        html += `<div style="border-top: 1px solid #333; width: 200px; margin: 0 auto; height: ${config.style.lineHeight}px;"></div>`;
      }
      html += '</div>';

      html += '</div>';
    } else {
      html += '<div style="text-align: center;">';
      html += `<div style="font-size: ${config.style.fontSize}pt; margin-bottom: 5px;">${config.leftLabel || 'SIGNATURE'}</div>`;
      if (config.showLines) {
        html += `<div style="border-top: 1px solid #333; width: 300px; margin: 0 auto; height: ${config.style.lineHeight}px;"></div>`;
      }
      html += '</div>';
    }

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
        name: 'leftLabel',
        label: '左侧标签',
        type: 'text'
      },
      {
        name: 'rightLabel',
        label: '右侧标签',
        type: 'text'
      },
      {
        name: 'showLines',
        label: '显示签名线',
        type: 'boolean'
      }
    ];
  }
}

