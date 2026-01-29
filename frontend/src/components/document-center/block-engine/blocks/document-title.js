/**
 * 单据标题区块
 */
import { BaseBlock } from './base-block.js';

export class DocumentTitleBlock extends BaseBlock {
  static displayName = '单据标题';
  static icon = '📋';
  static category = 'header';

  static getDefaultConfig() {
    return {
      text: 'DOCUMENT TITLE',
      style: {
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        marginTop: 15,
        marginBottom: 15,
        color: '#000'
      }
    };
  }

  render(data) {
    const config = { ...DocumentTitleBlock.getDefaultConfig(), ...this.config };
    const style = config.style;

    return `
      <div class="block document-title-block" style="
        text-align: ${style.textAlign};
        margin-top: ${style.marginTop}px;
        margin-bottom: ${style.marginBottom}px;
      ">
        <h1 style="
          font-size: ${style.fontSize}pt;
          font-weight: ${style.fontWeight};
          color: ${style.color};
          margin: 0;
        ">${config.text}</h1>
      </div>
    `;
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'text',
        label: '标题文本',
        type: 'text'
      },
      {
        name: 'style.fontSize',
        label: '字体大小',
        type: 'number',
        min: 14,
        max: 36
      },
      {
        name: 'style.textAlign',
        label: '对齐方式',
        type: 'select',
        options: [
          { value: 'left', label: '左对齐' },
          { value: 'center', label: '居中' },
          { value: 'right', label: '右对齐' }
        ]
      }
    ];
  }
}

