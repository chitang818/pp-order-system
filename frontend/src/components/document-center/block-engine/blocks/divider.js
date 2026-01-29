/**
 * 分割线区块
 */
import { BaseBlock } from './base-block.js';

export class DividerBlock extends BaseBlock {
  static displayName = '分割线';
  static icon = '➖';
  static category = 'layout';

  static getDefaultConfig() {
    return {
      style: 'solid',  // solid | dashed | dotted | double
      thickness: 1,    // 线条粗细
      color: '#333333',
      marginTop: 10,
      marginBottom: 10
    };
  }

  render(data) {
    const config = { ...DividerBlock.getDefaultConfig(), ...this.config };

    let borderStyle = '';
    switch (config.style) {
      case 'dashed':
        borderStyle = 'dashed';
        break;
      case 'dotted':
        borderStyle = 'dotted';
        break;
      case 'double':
        borderStyle = 'double';
        break;
      default:
        borderStyle = 'solid';
    }

    return `
      <div class="block divider-block" style="
        border-top: ${config.thickness}px ${borderStyle} ${config.color};
        margin-top: ${config.marginTop}px;
        margin-bottom: ${config.marginBottom}px;
      "></div>
    `;
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'style',
        label: '线条样式',
        type: 'select',
        options: [
          { value: 'solid', label: '实线' },
          { value: 'dashed', label: '虚线' },
          { value: 'dotted', label: '点线' },
          { value: 'double', label: '双线' }
        ]
      },
      {
        name: 'thickness',
        label: '线条粗细',
        type: 'number',
        min: 1,
        max: 5
      },
      {
        name: 'color',
        label: '线条颜色',
        type: 'color'
      }
    ];
  }
}

