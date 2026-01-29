/**
 * 公司地址区块
 */
import { BaseBlock } from './base-block.js';

export class CompanyAddressBlock extends BaseBlock {
  static displayName = '公司地址';
  static icon = '📍';
  static category = 'header';

  static getDefaultConfig() {
    return {
      field: 'company.companyAddressEN',  // 默认使用英文地址
      align: 'center',  // left | center | right
      style: {
        fontSize: 11,
        fontWeight: 'normal',
        color: '#333333'
      }
    };
  }

  render(data) {
    const config = { ...CompanyAddressBlock.getDefaultConfig(), ...this.config };
    const companyAddress = this.resolveBinding(config.field, data) || 
                          (data.company?.companyAddressEN || data.company?.companyAddressCN || '');

    const alignStyle = `text-align: ${config.align};`;
    const fontSize = config.style?.fontSize || 11;
    const fontWeight = config.style?.fontWeight || 'normal';
    const color = config.style?.color || '#333333';

    return `
      <div class="block company-address-block" style="margin-bottom: 10px;">
        <div style="${alignStyle} font-size: ${fontSize}pt; font-weight: ${fontWeight}; color: ${color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; display: block;">
          ${companyAddress}
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
        description: '选择要显示的公司地址字段'
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
        default: 11
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
        default: '#333333'
      }
    ];
  }
}

