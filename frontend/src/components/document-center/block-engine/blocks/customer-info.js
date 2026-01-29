/**
 * 客户信息区块
 */
import { BaseBlock } from './base-block.js';

export class CustomerInfoBlock extends BaseBlock {
  static displayName = '客户信息';
  static icon = '👤';
  static category = 'content';

  static getDefaultConfig() {
    return {
      layout: 'standard',  // standard | compact
      showTitle: true,
      title: 'TO MESSRS:',
      fields: {
        name: 'customer.name',
        address: 'customer.address',
        tel: 'customer.tel',
        fax: 'customer.fax'
      },
      style: {
        fontSize: 11,
        titleFontSize: 11,
        titleFontWeight: 'bold'
      }
    };
  }

  render(data) {
    const config = { ...CustomerInfoBlock.getDefaultConfig(), ...this.config };
    const customer = data.customer || {};

    const name = this.resolveBinding(config.fields.name, data) || customer.name || '';
    const address = this.resolveBinding(config.fields.address, data) || customer.address || '';
    const tel = this.resolveBinding(config.fields.tel, data) || customer.tel || '';
    const fax = this.resolveBinding(config.fields.fax, data) || customer.fax || '';

    let html = '<div class="block customer-info-block" style="margin-bottom: 15px;">';
    
    if (config.showTitle && config.title) {
      html += `<div style="font-size: ${config.style.titleFontSize}pt; font-weight: ${config.style.titleFontWeight}; margin-bottom: 5px;">
        ${config.title}
      </div>`;
    }

    if (name) {
      html += `<div style="font-size: ${config.style.fontSize}pt; margin-bottom: 3px;">${name}</div>`;
    }
    if (address) {
      html += `<div style="font-size: ${config.style.fontSize}pt; margin-bottom: 3px;">${address}</div>`;
    }
    if (tel || fax) {
      html += '<div style="font-size: ' + config.style.fontSize + 'pt;">';
      if (tel) html += `TEL: ${tel}`;
      if (tel && fax) html += ' / ';
      if (fax) html += `FAX: ${fax}`;
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'showTitle',
        label: '显示标题',
        type: 'boolean'
      },
      {
        name: 'title',
        label: '标题文本',
        type: 'text'
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

