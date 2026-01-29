/**
 * 公司信息区块
 */
import { BaseBlock } from './base-block.js';

export class CompanyHeaderBlock extends BaseBlock {
  static displayName = '公司信息';
  static icon = '🏢';
  static category = 'header';

  static getDefaultConfig() {
    return {
      layout: 'standard',  // standard | compact | full
      showLogo: false,
      logoPosition: 'left',
      fields: {
        title: 'companyNameEN',
        subtitle: 'companyAddressEN',
        left: ['companyTel', 'companyFax'],
        right: ['contractNo', 'invoiceDate']
      },
      style: {
        titleFontSize: 22,
        titleFontWeight: 'bold',
        subtitleFontSize: 11,
        borderBottom: true
      }
    };
  }

  render(data) {
    const config = { ...CompanyHeaderBlock.getDefaultConfig(), ...this.config };
    const company = data.company || {};
    const order = data.order || {};

    // 解析字段值
    // 如果字段名不包含路径分隔符，则自动添加 company. 前缀
    const titleField = config.fields.title.includes('.') 
      ? config.fields.title 
      : `company.${config.fields.title}`;
    const subtitleField = config.fields.subtitle.includes('.') 
      ? config.fields.subtitle 
      : `company.${config.fields.subtitle}`;
    
    const companyName = this.resolveBinding(titleField, data) || 
                       company.companyNameEN || company.companyNameCN || '';
    const companyAddress = this.resolveBinding(subtitleField, data) || 
                          company.companyAddressEN || company.companyAddressCN || '';
    
    // 左侧字段
    const leftFields = [];
    if (config.fields.left) {
      config.fields.left.forEach(field => {
        // 如果字段名不包含路径分隔符，则根据字段类型自动添加前缀
        let fieldPath = field;
        if (!field.includes('.')) {
          if (field === 'companyTel' || field === 'companyFax') {
            fieldPath = `company.${field}`;
          } else {
            fieldPath = field;
          }
        }
        const value = this.resolveBinding(fieldPath, data);
        if (value) {
          if (field === 'companyTel') leftFields.push(`TEL: ${value}`);
          else if (field === 'companyFax') leftFields.push(`FAX: ${value}`);
          else leftFields.push(value);
        }
      });
    }

    // 右侧字段
    const rightFields = [];
    if (config.fields.right) {
      config.fields.right.forEach(field => {
        // 如果字段名不包含路径分隔符，则根据字段类型自动添加前缀
        let fieldPath = field;
        if (!field.includes('.')) {
          if (field === 'contractNo' || field === 'invoiceDate') {
            fieldPath = `order.${field}`;
          } else {
            fieldPath = field;
          }
        }
        const value = this.resolveBinding(fieldPath, data);
        if (value) {
          if (field === 'contractNo') rightFields.push(`CONTRACT NO: ${value}`);
          else if (field === 'invoiceDate') rightFields.push(`DATE: ${value}`);
          else rightFields.push(value);
        }
      });
    }

    const borderStyle = config.style.borderBottom ? 'border-bottom: 2px solid #333;' : '';

    return `
      <div class="block company-header-block" style="padding-bottom: 10px; ${borderStyle} margin-bottom: 15px; width: 100%; box-sizing: border-box;">
        <div style="text-align: center; width: 100%; box-sizing: border-box;">
          <div style="font-size: ${config.style.titleFontSize}pt; font-weight: ${config.style.titleFontWeight}; margin-bottom: 5px; width: 100%; box-sizing: border-box; white-space: normal; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word;">
            ${companyName}
          </div>
          ${companyAddress ? `<div style="font-size: ${config.style.subtitleFontSize}pt; color: #333; margin-bottom: 8px; width: 100%; box-sizing: border-box; white-space: normal; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word;">${companyAddress}</div>` : ''}
        </div>
        ${(leftFields.length > 0 || rightFields.length > 0) ? `
        <div style="display: flex; justify-content: space-between; font-size: 11pt; margin-top: 8px;">
          <div>
            ${leftFields.map(f => `<div>${f}</div>`).join('')}
          </div>
          <div style="text-align: right;">
            ${rightFields.map(f => `<div>${f}</div>`).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'layout',
        label: '布局方式',
        type: 'select',
        options: [
          { value: 'standard', label: '标准布局' },
          { value: 'compact', label: '紧凑布局' },
          { value: 'full', label: '完整布局' }
        ]
      },
      {
        name: 'showLogo',
        label: '显示Logo',
        type: 'boolean'
      },
      {
        name: 'style.titleFontSize',
        label: '标题字号',
        type: 'number',
        min: 12,
        max: 24
      },
      {
        name: 'style.borderBottom',
        label: '底部边框',
        type: 'boolean'
      }
    ];
  }
}

