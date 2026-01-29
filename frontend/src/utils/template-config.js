/**
 * 模板配置文件
 * ES6 模块化版本
 * 您可以在这里自定义更多的模板样式选项
 */

export const TemplateConfig = {
  // 预设模板样式
  presetTemplates: {
    classic: {
      name: '经典蓝色',
      themeColor: '#2c3e50',
      fontSize: '14',
      headerStyle: 'classic',
      tableStyle: 'bordered'
    },
    modern: {
      name: '现代绿色',
      themeColor: '#27ae60',
      fontSize: '14',
      headerStyle: 'modern',
      tableStyle: 'minimal'
    },
    professional: {
      name: '专业灰色',
      themeColor: '#34495e',
      fontSize: '13',
      headerStyle: 'professional',
      tableStyle: 'striped'
    },
    elegant: {
      name: '优雅紫色',
      themeColor: '#8e44ad',
      fontSize: '14',
      headerStyle: 'elegant',
      tableStyle: 'elegant'
    }
  },

  // 字体选项
  fontOptions: [
    { value: '12', label: '小号 (12px)' },
    { value: '13', label: '中小 (13px)' },
    { value: '14', label: '标准 (14px)' },
    { value: '15', label: '中大 (15px)' },
    { value: '16', label: '大号 (16px)' }
  ],

  // 颜色主题
  colorThemes: [
    { name: '深蓝色', value: '#2c3e50' },
    { name: '绿色', value: '#27ae60' },
    { name: '红色', value: '#e74c3c' },
    { name: '紫色', value: '#8e44ad' },
    { name: '橙色', value: '#f39c12' },
    { name: '青色', value: '#16a085' },
    { name: '深灰色', value: '#34495e' },
    { name: '棕色', value: '#a0522d' }
  ],

  // 公司信息模板
  companyTemplates: {
    // 您可以预设多个公司信息模板
    default: {
      name: 'QINGDAO SHENGCHI PACKAGING PRODUCT CO.,LTD',
      address: 'NO.300 DALIAN INTERNATIONAL TRADE MANSION, ROOM 1006 XIANGGANG TOWN JIAOZHOU DISTRICT QINGDAO SHANDONG CHINA',
      email: 'info@company.com',
      website: 'www.company.com'
    },
    // 您可以添加更多公司模板
    custom: {
      name: '您的公司名称',
      address: '您的公司地址',
      email: '您的邮箱',
      website: '您的网站'
    }
  },

  // 常用客户信息模板
  customerTemplates: {
    japan_customer: {
      name: 'DAINEN TRADING CO.,LTD',
      address: 'DAIYAMA-NAKAMUKUCHO BLDG. 5F 7-1 KANDAMIKURA-CHO,CHIYODA-KU TOKYO 101-0038 JAPAN'
    },
    usa_customer: {
      name: 'AMERICAN TRADING COMPANY',
      address: '123 BUSINESS STREET, NEW YORK, NY 10001, USA'
    },
    europe_customer: {
      name: 'EUROPEAN IMPORT EXPORT LTD',
      address: '456 COMMERCE AVENUE, LONDON, UK'
    }
  },

  // 常用商品模板
  productTemplates: [
    {
      description: 'PP NON-WOVEN BAG',
      unit: 'PCS',
      defaultPrice: 0.50
    },
    {
      description: 'COTTON BAG',
      unit: 'PCS',
      defaultPrice: 1.20
    },
    {
      description: 'PAPER BAG',
      unit: 'PCS',
      defaultPrice: 0.30
    },
    {
      description: 'PLASTIC BAG',
      unit: 'PCS',
      defaultPrice: 0.15
    }
  ],

  // 港口信息
  ports: {
    china: [
      'QINGDAO, CHINA',
      'SHANGHAI, CHINA',
      'NINGBO, CHINA',
      'SHENZHEN, CHINA',
      'GUANGZHOU, CHINA',
      'TIANJIN, CHINA',
      'DALIAN, CHINA'
    ],
    international: [
      'KOBE, JAPAN',
      'TOKYO, JAPAN',
      'YOKOHAMA, JAPAN',
      'LOS ANGELES, USA',
      'NEW YORK, USA',
      'HAMBURG, GERMANY',
      'ROTTERDAM, NETHERLANDS',
      'FELIXSTOWE, UK'
    ]
  },

  // 货币选项
  currencies: [
    { code: 'USD', symbol: '$', name: '美元' },
    { code: 'EUR', symbol: '€', name: '欧元' },
    { code: 'GBP', symbol: '£', name: '英镑' },
    { code: 'JPY', symbol: '¥', name: '日元' },
    { code: 'CNY', symbol: '¥', name: '人民币' }
  ],

  // 单位选项
  units: [
    'PCS',
    'BALES',
    'KGS',
    'SETS',
    'PALLETS',
    'CARTONS',
    'BOXES',
    'ROLLS',
    'METERS',
    'YARDS'
  ],

  // 发票类型
  invoiceTypes: [
    'COMMERCIAL INVOICE',
    'PROFORMA INVOICE',
    'CUSTOMS INVOICE'
  ],

  // 贸易条款
  tradeTerms: [
    'FOB',
    'CIF',
    'CNF',
    'EXW',
    'FCA',
    'CPT',
    'CIP',
    'DAP',
    'DPU',
    'DDP'
  ],

  // 获取预设模板
  getPresetTemplate(name) {
    return this.presetTemplates[name] || null;
  },

  // 获取公司模板
  getCompanyTemplate(name) {
    return this.companyTemplates[name] || this.companyTemplates.default;
  },

  // 获取客户模板
  getCustomerTemplate(name) {
    return this.customerTemplates[name] || null;
  },

  // 获取商品模板
  getProductTemplate(index) {
    return this.productTemplates[index] || null;
  }
};

// 导出到全局作用域（保持向后兼容）
if (typeof window !== 'undefined') {
  window.TemplateConfig = TemplateConfig;
}

