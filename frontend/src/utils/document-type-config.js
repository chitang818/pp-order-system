/**
 * 单据类型配置模块
 * 定义不同单据类型的字段、格式和预设模板
 */

export const DocumentTypeConfig = {
  // 单据类型定义
  types: {
    invoice: {
      name: '商业发票',
      nameEN: 'Commercial Invoice',
      icon: '📄',
      description: '用于商业发票单据，包含订单信息、产品明细、金额等',
      requiredFields: ['contractNo', 'invoiceNo', 'invoiceDate', 'totalUSD'],
      optionalFields: ['blNo', 'shipmentDate', 'shipFrom', 'shipTo', 'forwarder'],
      defaultComponents: [
        {
          type: 'company-header',
          label: '公司信息'
        },
        {
          type: 'document-title',
          label: '商业发票',
          content: '<div style="text-align: center; padding: 20px 0;"><h1 style="margin: 0; font-size: 24pt; font-weight: bold;">COMMERCIAL INVOICE</h1></div>'
        },
        {
          type: 'order-info',
          label: '订单信息',
          fields: ['contractNo', 'invoiceNo', 'invoiceDate', 'blNo']
        },
        {
          type: 'customer-info',
          label: '客户信息'
        },
        {
          type: 'product-table',
          label: '产品列表',
          columns: ['序号', '产品型号', '数量', '单价', '金额']
        },
        {
          type: 'total-amount',
          label: '合计金额'
        },
        {
          type: 'signature-area',
          label: '签名区域'
        }
      ],
      defaultStyles: {
        fontFamily: 'SimSun, 宋体, serif',
        fontSize: '12pt',
        lineHeight: '1.5'
      }
    },
    packing: {
      name: '装箱单',
      nameEN: 'Packing List',
      icon: '📦',
      description: '用于装箱单单据，包含包装信息、件数、重量等',
      requiredFields: ['contractNo', 'invoiceNo', 'totalPackages', 'totalWeight'],
      optionalFields: ['blNo', 'shipmentDate', 'shipFrom', 'shipTo'],
      defaultComponents: [
        {
          type: 'company-header',
          label: '公司信息'
        },
        {
          type: 'document-title',
          label: '装箱单',
          content: '<div style="text-align: center; padding: 20px 0;"><h1 style="margin: 0; font-size: 24pt; font-weight: bold;">PACKING LIST</h1></div>'
        },
        {
          type: 'order-info',
          label: '订单信息',
          fields: ['contractNo', 'invoiceNo', 'blNo', 'shipmentDate']
        },
        {
          type: 'customer-info',
          label: '客户信息'
        },
        {
          type: 'product-table',
          label: '产品列表',
          columns: ['序号', '产品型号', '数量', '包装件数', '重量', '包装']
        },
        {
          type: 'total-summary',
          label: '合计信息',
          fields: ['totalQuantity', 'totalPackages', 'totalWeight']
        },
        {
          type: 'signature-area',
          label: '签名区域'
        }
      ],
      defaultStyles: {
        fontFamily: 'SimSun, 宋体, serif',
        fontSize: '12pt',
        lineHeight: '1.5'
      }
    },
    sales: {
      name: '销售确认书',
      nameEN: 'Sales Confirmation',
      icon: '📋',
      description: '用于销售确认书单据，包含合同条款、产品明细等',
      requiredFields: ['contractNo', 'invoiceDate', 'shipmentDate'],
      optionalFields: ['blNo', 'shipFrom', 'shipTo', 'forwarder'],
      defaultComponents: [
        {
          type: 'company-header',
          label: '公司信息'
        },
        {
          type: 'document-title',
          label: '销售确认书',
          content: '<div style="text-align: center; padding: 20px 0;"><h1 style="margin: 0; font-size: 24pt; font-weight: bold;">SALES CONFIRMATION</h1></div>'
        },
        {
          type: 'order-info',
          label: '合同信息',
          fields: ['contractNo', 'invoiceDate', 'shipmentDate', 'shipFrom', 'shipTo']
        },
        {
          type: 'customer-info',
          label: '客户信息'
        },
        {
          type: 'product-table',
          label: '产品列表',
          columns: ['序号', '产品型号', '数量', '单价', '金额']
        },
        {
          type: 'terms-conditions',
          label: '条款说明'
        },
        {
          type: 'signature-area',
          label: '签名区域'
        }
      ],
      defaultStyles: {
        fontFamily: 'SimSun, 宋体, serif',
        fontSize: '12pt',
        lineHeight: '1.5'
      }
    },
    production: {
      name: '生产通知单',
      nameEN: 'Production Notice',
      icon: '🏭',
      description: '用于生产通知单单据，包含生产要求、产品明细等',
      requiredFields: ['contractNo', 'orderNo'],
      optionalFields: ['invoiceDate', 'shipmentDate'],
      defaultComponents: [
        {
          type: 'company-header',
          label: '公司信息'
        },
        {
          type: 'document-title',
          label: '生产通知单',
          content: '<div style="text-align: center; padding: 20px 0;"><h1 style="margin: 0; font-size: 24pt; font-weight: bold;">生产通知单</h1></div>'
        },
        {
          type: 'order-info',
          label: '订单信息',
          fields: ['contractNo', 'orderNo', 'invoiceDate']
        },
        {
          type: 'customer-info',
          label: '客户信息'
        },
        {
          type: 'product-table',
          label: '产品列表',
          columns: ['序号', '产品型号', '数量', '包装件数', '重量', '包装', '备注']
        },
        {
          type: 'production-requirements',
          label: '生产要求'
        },
        {
          type: 'signature-area',
          label: '签名区域'
        }
      ],
      defaultStyles: {
        fontFamily: 'SimSun, 宋体, serif',
        fontSize: '12pt',
        lineHeight: '1.5'
      }
    },
    pickup: {
      name: '拉货通知',
      nameEN: 'Pickup Notice',
      icon: '🚚',
      description: '用于拉货通知单据，包含拉货安排、产品明细等',
      requiredFields: ['contractNo', 'shipmentDate'],
      optionalFields: ['shipFrom', 'shipTo', 'forwarder', 'blNo'],
      defaultComponents: [
        {
          type: 'company-header',
          label: '公司信息'
        },
        {
          type: 'document-title',
          label: '拉货通知',
          content: '<div style="text-align: center; padding: 20px 0;"><h1 style="margin: 0; font-size: 24pt; font-weight: bold;">PICKUP NOTICE</h1></div>'
        },
        {
          type: 'order-info',
          label: '订单与运输信息',
          fields: ['contractNo', 'shipmentDate', 'shipFrom', 'shipTo', 'forwarder']
        },
        {
          type: 'customer-info',
          label: '客户信息'
        },
        {
          type: 'product-table',
          label: '产品列表',
          columns: ['序号', '产品型号', '数量', '包装件数', '重量', '包装', '备注']
        },
        {
          type: 'total-summary',
          label: '合计信息',
          fields: ['totalQuantity', 'totalPackages', 'totalWeight']
        },
        {
          type: 'signature-area',
          label: '签名区域'
        }
      ],
      defaultStyles: {
        fontFamily: 'SimSun, 宋体, serif',
        fontSize: '12pt',
        lineHeight: '1.5'
      }
    },
    custom: {
      name: '自定义',
      nameEN: 'Custom',
      icon: '🎨',
      description: '用户自定义单据类型',
      requiredFields: [],
      optionalFields: [],
      defaultComponents: [],
      defaultStyles: {
        fontFamily: 'SimSun, 宋体, serif',
        fontSize: '12pt',
        lineHeight: '1.5'
      }
    }
  },

  // 获取单据类型配置
  getTypeConfig(type) {
    return this.types[type] || this.types.custom;
  },

  // 获取所有单据类型
  getAllTypes() {
    return Object.keys(this.types).map(key => ({
      value: key,
      ...this.types[key]
    }));
  },

  // 获取单据类型的可用字段
  getAvailableFields(type) {
    const config = this.getTypeConfig(type);
    return {
      required: config.requiredFields || [],
      optional: config.optionalFields || [],
      all: [...(config.requiredFields || []), ...(config.optionalFields || [])]
    };
  },

  // 生成预设模板HTML
  generatePresetTemplate(type) {
    const config = this.getTypeConfig(type);
    if (!config.defaultComponents || config.defaultComponents.length === 0) {
      return '';
    }

    let html = '';
    
    config.defaultComponents.forEach(component => {
      switch (component.type) {
        case 'company-header':
          html += '<div style="padding: 15px; text-align: center; border-bottom: 2px solid #ddd; margin-bottom: 15px;"><h2 style="margin: 0 0 10px 0; font-size: 20pt;">{{company.companyNameCN}}</h2><p style="margin: 0; font-size: 11pt; color: #666;">{{company.companyAddressCN}}</p></div>';
          break;
        case 'document-title':
          html += component.content || `<div style="text-align: center; padding: 20px 0;"><h1 style="margin: 0; font-size: 24pt; font-weight: bold;">${config.name}</h1></div>`;
          break;
        case 'order-info':
          html += generateOrderInfoBlock(component.fields || []);
          break;
        case 'customer-info':
          html += '<div style="padding: 10px; border: 1px solid #ddd; margin: 10px 0;"><h3 style="margin: 0 0 10px 0; font-size: 14pt; border-bottom: 1px solid #ddd; padding-bottom: 5px;">客户信息</h3><p style="margin: 5px 0; font-size: 12pt;"><strong>名称：</strong>{{customer.name}}</p><p style="margin: 5px 0; font-size: 12pt;"><strong>地址：</strong>{{customer.address}}</p></div>';
          break;
        case 'product-table':
          html += generateProductTable(component.columns || []);
          break;
        case 'total-amount':
          html += '<div style="text-align: right; padding: 15px 0; border-top: 2px solid #333; margin-top: 15px;"><p style="margin: 5px 0; font-size: 14pt;"><strong>合计：</strong><span style="font-size: 16pt; font-weight: bold;">{{order.totalUSD}}</span></p></div>';
          break;
        case 'total-summary':
          html += generateTotalSummary(component.fields || []);
          break;
        case 'signature-area':
          html += '<div style="margin-top: 40px; padding: 20px 0; border-top: 1px dashed #ddd;"><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 20px 40px; text-align: center; width: 50%; border-right: 1px dashed #ddd;"><p style="margin: 0 0 50px 0; font-size: 12pt;">甲方签名：</p><p style="margin: 0; font-size: 12pt;">日期：</p></td><td style="padding: 20px 40px; text-align: center; width: 50%;"><p style="margin: 0 0 50px 0; font-size: 12pt;">乙方签名：</p><p style="margin: 0; font-size: 12pt;">日期：</p></td></tr></table></div>';
          break;
      }
    });

    return html;
  }
};

// 生成订单信息块
function generateOrderInfoBlock(fields) {
  const fieldLabels = {
    contractNo: '合同号',
    invoiceNo: '发票号',
    invoiceDate: '发票日期',
    blNo: '提单号',
    shipmentDate: '发货日期',
    shipFrom: '起运港',
    shipTo: '目的港',
    orderNo: '订单号'
  };

  let content = '<div style="padding: 10px; margin: 10px 0;"><table style="width: 100%; border-collapse: collapse;">';
  
  fields.forEach((field, index) => {
    const label = fieldLabels[field] || field;
    const isEven = index % 2 === 0;
    if (isEven) {
      content += '<tr>';
    }
    content += `<td style="padding: 5px 10px; font-size: 12pt; width: 50%;"><strong>${label}：</strong>{{order.${field}}}</td>`;
    if (!isEven || index === fields.length - 1) {
      content += '</tr>';
    }
  });
  
  content += '</table></div>';
  return content;
}

// 生成产品表格
function generateProductTable(columns) {
  let thead = '<thead><tr style="background-color: #f5f5f5;">';
  columns.forEach(col => {
    thead += `<th style="border:1px solid #333; padding:10px; text-align:center; font-weight:bold;">${col}</th>`;
  });
  thead += '</tr></thead>';

  let tbody = '<tbody>{{#each order.items}}<tr>';
  columns.forEach((col, index) => {
    const fieldMap = {
      '序号': '{{@index}}',
      '产品型号': '{{model}}',
      '数量': '{{quantity}}',
      '单价': '{{unitPrice}}',
      '金额': '{{amount}}',
      '包装件数': '{{packages}}',
      '重量': '{{weight}}',
      '包装': '{{packaging}}',
      '备注': '{{remarks}}'
    };
    const content = fieldMap[col] || '';
    const align = (col === '数量' || col === '单价' || col === '金额' || col === '包装件数' || col === '重量') ? 'right' : 'left';
    tbody += `<td style="border:1px solid #333; padding:8px; text-align:${align};">${content}</td>`;
  });
  tbody += '</tr>{{/each}}</tbody>';

  return `<table id="product-table" style="width:100%; border-collapse: collapse; margin: 15px 0;">${thead}${tbody}</table>`;
}

// 生成合计信息
function generateTotalSummary(fields) {
  const fieldLabels = {
    totalQuantity: '总数量',
    totalPackages: '总件数',
    totalWeight: '总重量',
    totalAmount: '总金额'
  };

  let content = '<div style="text-align: right; padding: 15px 0; border-top: 2px solid #333; margin-top: 15px;">';
  fields.forEach(field => {
    const label = fieldLabels[field] || field;
    content += `<p style="margin: 5px 0; font-size: 12pt;"><strong>${label}：</strong>{{order.${field}}}</p>`;
  });
  content += '</div>';
  return content;
}

