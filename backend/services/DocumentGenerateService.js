/**
 * 单据生成服务
 * 负责根据订单数据和模板生成单据HTML
 */

const DocumentTemplateService = require('./DocumentTemplateService');
const OrderService = require('./OrderService');
const CustomerService = require('./CustomerService');
const CompanyService = require('./CompanyService');

class DocumentGenerateService {
  /**
   * 生成单据HTML
   * @param {number|string} orderId - 订单ID
   * @param {number|string} templateId - 模板ID
   * @returns {Promise<string>} HTML字符串
   */
  static async generateDocument(orderId, templateId) {
    try {
      // 1. 获取订单数据
      const order = await OrderService.getOrder(orderId);
      if (!order) {
        throw new Error('订单不存在');
      }

      // 2. 获取模板
      const template = await DocumentTemplateService.getTemplate(templateId);
      if (!template) {
        throw new Error('模板不存在');
      }

      // 3. 获取客户数据
      let customer = null;
      if (order.customerId) {
        customer = await CustomerService.getCustomer(order.customerId);
      }

      // 4. 获取公司数据
      const company = await CompanyService.getCompany();

      // 5. 合并数据
      const data = {
        order: this.formatOrderData(order),
        customer: customer ? this.formatCustomerData(customer) : {},
        company: this.formatCompanyData(company)
      };

      // 6. 渲染模板
      const html = this.renderTemplate(template.config, data);

      return html;
    } catch (error) {
      console.error('[DocumentGenerateService] 生成单据失败:', error);
      throw new Error('生成单据失败: ' + error.message);
    }
  }

  /**
   * 格式化订单数据
   * @param {Object} order - 订单对象
   * @returns {Object}
   */
  static formatOrderData(order) {
    return {
      contractNo: order.contractNo || '',
      invoiceNo: order.invoiceNo || '',
      blNo: order.blNo || '',
      invoiceDate: order.invoiceDate || '',
      shipmentDate: order.shipmentDate || '',
      shipFrom: order.shipFrom || '',
      shipTo: order.shipTo || '',
      shippedPerSs: order.shippedPerSs || '',
      forwarder: order.forwarder || '',
      customerName: order.customerName || '',
      totalUSD: order.totalUSD || 0,
      status: order.status || '',
      items: (order.items || []).map(item => ({
        model: item.model || '',
        quantity: item.quantity || 0,
        packages: item.packages || 0,
        weight: item.weight || 0,
        actualWeight: item.actualWeight || 0,
        unitPrice: item.unitPrice || 0,
        amount: item.amount || 0,
        unit: item.unit || '',
        packing: item.packing || '',
        labelWeight: item.labelWeight || 0,
        safetyFactor: item.safetyFactor || '',
        cleanliness: item.cleanliness || ''
      })),
      // 计算字段
      totalQuantity: (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
      totalPackages: (order.items || []).reduce((sum, item) => sum + (item.packages || 0), 0),
      totalWeight: (order.items || []).reduce((sum, item) => sum + (item.weight || 0), 0),
      totalAmount: order.totalUSD || 0
    };
  }

  /**
   * 格式化客户数据
   * @param {Object} customer - 客户对象
   * @returns {Object}
   */
  static formatCustomerData(customer) {
    return {
      name: customer.name || '',
      address: customer.address || '',
      tel: customer.tel || '',
      fax: customer.fax || '',
      contact: customer.contact || ''
    };
  }

  /**
   * 格式化公司数据
   * @param {Object} company - 公司对象
   * @returns {Object}
   */
  static formatCompanyData(company) {
    return {
      nameCN: company.companyNameCN || '',
      nameEN: company.companyNameEN || '',
      addressCN: company.companyAddressCN || '',
      addressEN: company.companyAddressEN || '',
      tel: company.companyTel || '',
      fax: company.companyFax || ''
    };
  }

  /**
   * 渲染模板（简单的变量替换，实际可以使用Handlebars等模板引擎）
   * @param {Object} templateConfig - 模板配置
   * @param {Object} data - 数据对象
   * @returns {string} HTML字符串
   */
  static renderTemplate(templateConfig, data) {
    let html = templateConfig.canvas?.components || '';
    const css = templateConfig.canvas?.styles || '';

    // 简单的变量替换（实际应使用模板引擎如Handlebars）
    html = this.replaceVariables(html, data);
    
    // 处理循环（产品列表）
    html = this.processLoops(html, data);

    // 包装完整HTML
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 210mm;
            min-height: 297mm;
            padding: 10mm;
            font-family: Arial, sans-serif;
            font-size: 12px;
          }
          ${css}
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `;
  }

  /**
   * 替换变量
   * @param {string} html - HTML字符串
   * @param {Object} data - 数据对象
   * @returns {string}
   */
  static replaceVariables(html, data) {
    // 替换订单变量
    html = html.replace(/\{\{order\.(\w+)\}\}/g, (match, field) => {
      return data.order[field] !== undefined ? String(data.order[field]) : '';
    });

    // 替换客户变量
    html = html.replace(/\{\{customer\.(\w+)\}\}/g, (match, field) => {
      return data.customer[field] !== undefined ? String(data.customer[field]) : '';
    });

    // 替换公司变量
    html = html.replace(/\{\{company\.(\w+)\}\}/g, (match, field) => {
      return data.company[field] !== undefined ? String(data.company[field]) : '';
    });

    // 替换计算变量
    html = html.replace(/\{\{totalQuantity\}\}/g, String(data.order.totalQuantity || 0));
    html = html.replace(/\{\{totalPackages\}\}/g, String(data.order.totalPackages || 0));
    html = html.replace(/\{\{totalWeight\}\}/g, String(data.order.totalWeight || 0));
    html = html.replace(/\{\{totalAmount\}\}/g, String(data.order.totalAmount || 0));

    return html;
  }

  /**
   * 处理循环（产品列表）
   * @param {string} html - HTML字符串
   * @param {Object} data - 数据对象
   * @returns {string}
   */
  static processLoops(html, data) {
    // 处理产品列表循环
    const productLoopRegex = /\{\{#each order\.items\}\}([\s\S]*?)\{\{\/each\}\}/g;
    html = html.replace(productLoopRegex, (match, content) => {
      if (!data.order.items || data.order.items.length === 0) {
        return '';
      }
      return data.order.items.map(item => {
        let itemHtml = content;
        // 替换产品字段
        Object.keys(item).forEach(key => {
          const value = item[key] !== undefined ? String(item[key]) : '';
          itemHtml = itemHtml.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        });
        return itemHtml;
      }).join('');
    });

    return html;
  }
}

module.exports = DocumentGenerateService;

