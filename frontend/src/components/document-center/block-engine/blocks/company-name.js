/**
 * 公司名称区块
 */
import { BaseBlock } from './base-block.js';

export class CompanyNameBlock extends BaseBlock {
  static displayName = '公司名称';
  static icon = '🏢';
  static category = 'header';

  static getDefaultConfig() {
    return {
      field: 'company.companyNameEN',  // 默认使用英文名称
      align: 'center',  // left | center | right
      style: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#000000'
      }
    };
  }

  render(data) {
    const config = { ...CompanyNameBlock.getDefaultConfig(), ...this.config };
    const companyName = this.resolveBinding(config.field, data) || 
                       (data.company?.companyNameEN || data.company?.companyNameCN || '');

    const alignStyle = `text-align: ${config.align};`;
    const fontSize = config.style?.fontSize || 22;
    const fontWeight = config.style?.fontWeight || 'bold';
    const color = config.style?.color || '#000000';

    return `
      <div class="block company-name-block" style="margin-bottom: 10px;">
        <div style="${alignStyle} font-size: ${fontSize}pt; font-weight: ${fontWeight}; color: ${color};">
          ${companyName}
        </div>
      </div>
    `;
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'field',
        label: '数据字段',
        type: 'variable',
        description: '选择要显示的公司名称字段'
      },
      {
        name: 'align',
        label: '对齐方式',
        type: 'select',
        options: [
          { value: 'left', label: '左对齐' },
          { value: 'center', label: '居中' },
          { value: 'right', label: '右对齐' }
        ]
      },
      {
        name: 'style.fontSize',
        label: '字号',
        type: 'fontSize',
        default: 22
      },
      {
        name: 'style.fontWeight',
        label: '字体粗细',
        type: 'select',
        options: [
          { value: 'normal', label: '正常' },
          { value: 'bold', label: '粗体' }
        ]
      },
      {
        name: 'style.color',
        label: '文字颜色',
        type: 'color',
        default: '#000000'
      }
    ];
  }
}

