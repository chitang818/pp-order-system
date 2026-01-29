/**
 * 印章区块
 */
import { BaseBlock } from './base-block.js';

export class StampAreaBlock extends BaseBlock {
  static displayName = '印章';
  static icon = '🔖';
  static category = 'footer';

  static getDefaultConfig() {
    return {
      position: 'center',  // center | left | right
      showPlaceholder: true,
      placeholderText: '[公司印章]',
      imageUrl: '',  // 印章图片URL
      style: {
        fontSize: 11,
        marginTop: 20,
        marginBottom: 20
      }
    };
  }

  render(data) {
    const config = { ...StampAreaBlock.getDefaultConfig(), ...this.config };

    let html = '<div class="block stamp-area-block" style="';
    html += `margin-top: ${config.style.marginTop}px; `;
    html += `margin-bottom: ${config.style.marginBottom}px; `;
    html += `text-align: ${config.position};`;
    html += '">';

    if (config.imageUrl) {
      html += `<img src="${config.imageUrl}" alt="公司印章" style="max-width: 150px; max-height: 150px;" />`;
    } else if (config.showPlaceholder) {
      html += `<div style="
        display: inline-block;
        padding: 20px 40px;
        border: 2px dashed #999;
        border-radius: 8px;
        font-size: ${config.style.fontSize}pt;
        color: #999;
      ">${config.placeholderText}</div>`;
    }

    html += '</div>';
    return html;
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'position',
        label: '对齐方式',
        type: 'select',
        options: [
          { value: 'center', label: '居中' },
          { value: 'left', label: '左对齐' },
          { value: 'right', label: '右对齐' }
        ]
      },
      {
        name: 'showPlaceholder',
        label: '显示占位符',
        type: 'boolean'
      },
      {
        name: 'placeholderText',
        label: '占位符文本',
        type: 'text'
      }
    ];
  }
}

