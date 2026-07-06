/**
 * 文档生成器脚本：加载订单、生成预览、导出
 * 
 * 功能说明：
 * - 这是一个独立的单页面应用（docs.html），只有一个页面
 * - 提供基本的单据生成、预览和导出功能
 * - 与单据中心（document-center）功能相互独立
 * 
 * 注意：单据中心（document-center）是一个多页面功能模块，包含：
 *   1. 单据生成页面（generate）
 *   2. 单据模版页面（templates）
 *   3. 模板编辑页面（template-editor）
 * 
 * ES6 模块化版本
 */
import { isOldDocsExportPdfButtonHidden } from '../../utils/ui-preferences.js';
import { formatCClassMarksPlainText } from '../order/order-item-marks.js';

// 前端偏好：仅样式模式使用本地存储，其余业务数据统一走后端
const KEY_DOCS_STYLE = (window.StorageService && StorageService.keys && StorageService.keys.DOCS_STYLE) ? StorageService.keys.DOCS_STYLE : 'erp.docs.style';

// 辅助函数：根据数量返回正确的单位单复数形式
function getPluralUnit(count, singular, plural) {
  return count === 1 ? singular : (plural || singular + 'S');
}

// Toast 已由 NotificationSystem 提供，无需额外定义
// 确保 toastContainer 存在（如果需要）
if (typeof document !== 'undefined') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

function load(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}

// 获取Cookie的辅助函数（用于CSRF token）
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { }
}

function goto(path) {
  try {
    const base = location.origin && location.origin !== 'null' ? location.origin : (new URL(window.location.href)).origin;
    const url = new URL(path, base);
    window.location.href = url.toString();
  } catch (e) { window.location.href = path; }
}

// 订单列表：后端为准（移除本地存储回退）
let orders = [];
// 默认使用第一个订单
let currentOrderIdx = 0;
// 公司配置：仅在内存中缓存（移除本地存储回退）
let companyCache = {};

/**
 * 根据导出的单据类型自动更新订单状态
 * @param {Object} order - 订单对象
 * @param {string} type - 单据类型 ('sales', 'production', 'invoice', 'packing')
 */
async function updateOrderStatusAfterExport(order, type) {
  try {
    if (!order || !order.id) {
      console.warn('订单信息不完整，无法更新状态');
      return;
    }

    let newStatus = null;

    // 根据单据类型确定新状态
    switch (type) {
      case 'sales':
        // 导出SALES CONFIRMATION后，状态更新为"已排产"
        if (order.status === '已创建') {
          newStatus = '已排产';
        }
        break;
      case 'production':
        // 导出生产通知单后，状态更新为"已排产"
        if (order.status === '已创建') {
          newStatus = '已排产';
        }
        break;
      case 'invoice':
      case 'packing':
        // 导出发票或装箱单后，状态更新为"已发货"
        if (order.status === '已创建' || order.status === '已排产') {
          newStatus = '已发货';
        }
        break;
      default:
        console.log('未知单据类型，不更新订单状态');
        return;
    }

    // 如果不需要更新状态，直接返回
    if (!newStatus || order.status === newStatus) {
      console.log(`订单状态无需更新，当前状态：${order.status}`);
      return;
    }

    // 调用API更新订单状态
    const updateData = {
      ...order,
      status: newStatus
    };

    const response = await ApiService.orders.update(order.id, updateData);

    if (response && response.id) {
      console.log(`订单状态已自动更新：${order.status} → ${newStatus}`);

      // 显示状态更新提示
      if (window.NotificationSystem && typeof window.NotificationSystem.toast === 'function') {
        window.NotificationSystem?.toast(`订单状态已自动更新为：${newStatus}`, 'success', 3000);
      }

      // 更新当前订单对象的状态
      if (orders && orders.length > 0) {
        const currentOrderIndex = orders.findIndex(o => o.id === order.id);
        if (currentOrderIndex >= 0) {
          orders[currentOrderIndex].status = newStatus;
        }
      }

      // 如果在订单管理页面，刷新订单列表
      if (window.location.hash.includes('orders') && window.refreshOrders) {
        setTimeout(() => {
          window.refreshOrders();
        }, 1000);
      }

    } else {
      console.error('订单状态更新失败：API响应异常');
    }

  } catch (error) {
    console.error('自动更新订单状态失败:', error);
    // 不显示错误提示，避免影响用户体验
  }
}
const preview = document.getElementById('preview');
const btnBack = document.getElementById('btnBack');
const btnPDF = document.getElementById('btnExportPDF');
const btnExcel = document.getElementById('btnExportExcel');
const btnWord = document.getElementById('btnExportWord');
const btnEditablePDF = document.getElementById('btnExportEditablePDF');

function syncOldDocsExportPdfButton() {
  if (!btnPDF) return;
  const hide = isOldDocsExportPdfButtonHidden();
  btnPDF.style.display = hide ? 'none' : '';
  btnPDF.hidden = hide;
}
syncOldDocsExportPdfButton();
if (typeof window !== 'undefined' && btnPDF) {
  window.addEventListener('pp:old-docs-export-pdf-hidden-changed', syncOldDocsExportPdfButton);
}
// 右侧布局按钮已移除，功能已移植到预览窗口标题栏
// const btnStyleUltraCompact = document.getElementById('btnStyleUltraCompact');
// const btnStyleCompact = document.getElementById('btnStyleCompact');
// const btnStyleStandard = document.getElementById('btnStyleStandard');
// const btnStyleWide = document.getElementById('btnStyleWide');
const zoomOutBtn = document.getElementById('zoomOut');
const zoomInBtn = document.getElementById('zoomIn');
const zoomLevelEl = document.getElementById('zoomLevel');
const fitToPageToggle = document.getElementById('fitToPageToggle');
const pageDragToggle = document.getElementById('pageDragToggle');
// 与主应用共用 foundation chunk 时会一并执行本模块；仅 docs.html 含 #preview
const isLegacyDocsHtmlPage = Boolean(preview);
// 模板表头内容配置已移除，不再使用保存模板按钮

// 单据表头内容配置 UI 已移除

let styleMode = load(KEY_DOCS_STYLE, 'compact');
let zoomLevel = 100;

// 将关键变量和函数暴露到全局作用域，供预览窗口标题栏按钮使用
// 使用 getter/setter 确保全局变量与局部变量同步
if (isLegacyDocsHtmlPage) {
  Object.defineProperty(window, 'styleMode', {
    get: function () { return styleMode; },
    set: function (value) { styleMode = value; }
  });
  Object.defineProperty(window, 'zoomLevel', {
    get: function () { return zoomLevel; },
    set: function (value) { zoomLevel = value; }
  });
}
window.save = save;
window.renderPreview = null; // 将在函数定义后赋值
window.autoFitPreviewToA4 = null; // 将在函数定义后赋值

// 不再使用模板表头内容配置

// 模板配置初始化已移除

// 解析URL参数：index 指定订单；hide=1 隐藏选择
const params = new URLSearchParams(window.location.search);
const urlIndex = params.has('index') ? Number(params.get('index')) : null;
// 支持 id 和 orderId 两种参数名（兼容旧版）
const urlId = params.has('id') ? Number(params.get('id')) : (params.has('orderId') ? Number(params.get('orderId')) : null);
const hideSelect = params.get('hide') === '1';
const urlType = params.get('type');

// 订单选择功能已移除，使用默认订单
if (urlIndex != null && !isNaN(urlIndex) && orders.length > 0) {
  currentOrderIdx = Math.max(0, Math.min(urlIndex, orders.length - 1));
}
// 若通过 URL 指定默认单据类型，则应用
if (urlType) {
  const el = document.querySelector(`input[name="docType"][value="${urlType}"]`);
  if (el) el.checked = true;
}

function currentOrderIndex() { return currentOrderIdx; }
function currentOrder() { return orders[currentOrderIndex()] || {}; }
function docType() {
  const el = document.querySelector('input[name="docType"]:checked');
  return el ? el.value : 'production';
}

function styleVars() {
  if (styleMode === 'ultra-compact') return { fontSize: 11, lineHeight: 1.1, cellPad: 3 };
  if (styleMode === 'compact') return { fontSize: 13, lineHeight: 1.3, cellPad: 6 };
  if (styleMode === 'wide') return { fontSize: 16, lineHeight: 1.6, cellPad: 10 };
  return { fontSize: 14, lineHeight: 1.5, cellPad: 8 };
}

// 生成导出文件名（根据单据类型和命名规则）
function generateFileName(fileExtension = '', orderData = null, docTypeValue = null) {
  const o = orderData || currentOrder();
  const type = docTypeValue || docType();
  const items = Array.isArray(o.items) ? o.items : [];

  // 获取合同编号
  const contractNo = o.contractNo || o.orderNo || '未填写合同号';
  const safeContractNo = String(contractNo).replace(/[\\/:*?"<>|]/g, '_');

  // 获取产品型号列表（多个产品时按顺序连接）
  const productModels = items
    .map(item => item.model || '')
    .filter(model => model.trim())
    .map(model => String(model).replace(/[\\/:*?"<>|]/g, '_'));
  const productModelStr = productModels.length > 0 ? productModels.join('_') : '未填写型号';

  // 获取目的港城市
  const destination = (o.shipTo || (o.extras && o.extras.destination)) || '';
  const destinationCity = String(destination).replace(/[\\/:*?"<>|]/g, '_') || '未填写目的港';

  let fileName = '';

  switch (type) {
    case 'production':
      // 生产通知单命名规则：${产品型号}_${合同编号}_生产通知单
      fileName = `${productModelStr}_${safeContractNo}_生产通知单`;
      break;
    case 'sales':
      // SALES CONFIRMATION命名规则：${产品型号}_${合同编号}_合同
      fileName = `${productModelStr}_${safeContractNo}_合同`;
      break;
    case 'invoice':
      // INVOICE命名规则：${合同编号}_${目的港城市}_IV
      fileName = `${safeContractNo}_${destinationCity}_IV`;
      break;
    case 'packing':
      // PACKING LIST命名规则：${合同编号}_${目的港城市}_PL
      fileName = `${safeContractNo}_${destinationCity}_PL`;
      break;
    case 'pickup':
      // 拉货通知命名规则：${合同编号}_拉货通知
      fileName = `${safeContractNo}_拉货通知`;
      break;
    default:
      fileName = `${safeContractNo}_单据`;
      break;
  }

  return fileName + fileExtension;
}

// 获取文档标题
function getDocumentTitle(type) {
  switch (type) {
    case 'production':
      return '生产通知单';
    case 'invoice':
      return 'INVOICE';
    case 'packing':
      return 'PACKING LIST';
    case 'pickup':
      return '拉货通知';
    case 'sales':
    default:
      return 'SALES CONFIRMATION';
  }
}

// 获取公司信息
function getCompanyInfo() {
  return companyCache || {};
}

// 不再支持保存或加载表头内容配置

// 辅助：规范化并渲染产品项的 extras 为内联文本
function normalizeExtrasObj(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (_) { return {}; } }
  if (typeof raw === 'object') return raw;
  return {};
}
function renderItemExtrasInline(it) {
  // 仅显示白名单中的规格信息，避免技术字段（如 sortIndex）泄露到预览
  const ex = normalizeExtrasObj(it && it.extras);
  const allowed = { size: '尺寸', color: '颜色', spec: '规格', remark: '备注' };
  const parts = [];
  Object.keys(allowed).forEach((key) => {
    const val = ex[key];
    if (val != null && String(val).trim() !== '') parts.push(`${allowed[key]}: ${val}`);
  });
  if (!parts.length) return '';
  return parts.join('；');
}

// 从后端读取公司设置（后端优先，仅内存缓存），完成后刷新预览
function syncCompanyFromServer(cb) {
  ApiService.company.get().then(company => {
    companyCache = company || {};
    if (typeof cb === 'function') cb();
  }).catch(() => { if (typeof cb === 'function') cb(); });
}

function buildCompanyBlock(customer = null) {
  const c = companyCache || {};
  const o = currentOrder();
  const type = docType();
  const cust = customer || {};
  const title = type === 'production' ? '生产通知单'
    : type === 'invoice' ? 'INVOICE'
      : type === 'packing' ? 'PACKING LIST'
        : 'SALES  CONFIRMATION';

  // 变量映射
  const vars = {
    CompanyEN: c.companyNameEN || '',
    CompanyCN: c.companyNameCN || '',
    AddressEN: c.companyAddressEN || '',
    AddressCN: c.companyAddressCN || '',
    TEL: c.companyTel || '',
    FAX: c.companyFax || '',
    TELFAX: [c.companyTel && `TEL: ${c.companyTel}`, c.companyFax && `FAX: ${c.companyFax}`].filter(Boolean).join(' / '),
    // 签署地：优先订单的 extras.signAt 或 signAt，其次订单的 shipFrom，最后公司设置 signAt
    SignAt: (o && o.extras && o.extras.signAt) ? String(o.extras.signAt) : (o && o.signAt ? String(o.signAt) : (o && o.shipFrom ? String(o.shipFrom) : (c.signAt || ''))),
    Title: title,
    AccountAndRiskOf: o.customerName || '',
    ContractNo: (() => {
      // 特殊规则：仅对 INVOICE 和 PACKING LIST，当客户为 SHIOYA CO.,LTD 时，CONTRACT No 仅显示订单号
      let contractNo = o.contractNo || o.orderNo || '';
      const customerName = o.customerName || '';
      const orderNo = (o && o.extras && o.extras.orderNo) ? String(o.extras.orderNo) : (o.orderNo || '');

      // 只在 INVOICE 和 PACKING LIST 中应用特殊规则
      if ((type === 'invoice' || type === 'packing') && customerName === 'SHIOYA CO.,LTD' && contractNo && orderNo) {
        // 检查合同号格式是否为 SC2025-228(NO.25684) 或类似格式
        const contractNoMatch = contractNo.match(/SC\d{4}-\d+\(NO\.\s*(\d+)\s*\)/i);
        if (contractNoMatch) {
          const contractOrderNo = contractNoMatch[1];
          // 如果合同号中的订单号与订单号字段匹配，则只显示订单号
          if (contractOrderNo === orderNo) {
            contractNo = orderNo;
          }
        }
      }

      return contractNo;
    })(),
    OrderNo: (o && o.extras && o.extras.orderNo) ? String(o.extras.orderNo) : (o.orderNo || ''),
    InvoiceNo: o.invoiceNo || '',
    Date: (o && o.invoiceDate) ? String(o.invoiceDate) : ((o.updatedAt || o.createdAt) ? new Date(o.updatedAt || o.createdAt).toISOString().slice(0, 10) : ''),
    From: o.shipFrom || '',
    To: o.shipTo || '',
    BLNo: o.blNo || '',
    ShippedPerSS: o.shippedPerSs || '',
    // 客户信息
    CustomerAddress: cust.address || '',
    CustomerTel: cust.tel || '',
    CustomerFax: cust.fax || '',
    // 客户电话传真组合（只有存在时才显示）
    CustomerTelFax: [cust.tel && `TEL:${cust.tel}`, cust.fax && `FAX:${cust.fax}`].filter(Boolean).join(' ')
  };

  // 模板表头配置已移除，按公司设置模板与实际数据渲染

  // 从公司设置读取模板（每行一项）；若存在模板，则按勾选过滤变量行
  const headerTpl = type === 'production' ? (c.headerProduction || '')
    : type === 'invoice' ? (c.headerInvoice || '')
      : type === 'packing' ? (c.headerPacking || '')
        : (c.headerSales || '');

  function replaceVars(s) {
    let out = String(s || '');
    const keys = ['CompanyEN', 'CompanyCN', 'AddressEN', 'AddressCN', 'TEL', 'FAX', 'TELFAX', 'SignAt', 'Title', 'AccountAndRiskOf', 'ContractNo', 'OrderNo', 'InvoiceNo', 'Date', 'From', 'To', 'BLNo', 'ShippedPerSS'];
    const keyMapLower = keys.reduce((acc, k) => { acc[k.toLowerCase()] = k; return acc; }, {});
    // 支持 {{Var}} 写法（大小写不敏感）
    out = out.replace(/\{\{(\w+)\}\}/gi, (_, k) => {
      const std = keyMapLower[String(k).toLowerCase()] || k;
      const v = vars[std];
      return v != null ? String(v) : '';
    });
    // 同时支持裸变量名（无大括号）写法，如 CompanyEN、AddressEN、TELFAX、Date、ContractNo 等（大小写不敏感）
    const re = new RegExp('\\b(' + keys.join('|') + ')\\b', 'gi');
    out = out.replace(re, (m) => {
      const std = keyMapLower[String(m).toLowerCase()] || m;
      const v = vars[std];
      return v != null ? String(v) : m;
    });
    return out;
  }
  function escRE(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function hasText(haystack, needle) {
    if (!haystack || !needle) return false;
    const norm = s => String(s).replace(/\s+/g, '').toUpperCase();
    return norm(haystack).indexOf(norm(needle)) !== -1;
  }
  function removeText(haystack, needle) {
    if (!haystack || !needle) return haystack || '';
    const pattern = new RegExp(escRE(String(needle)).replace(/\s+/g, '\\s*'), 'uig');
    return String(haystack).replace(pattern, '');
  }

  const lines = (headerTpl || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  // 生产通知单与 SALES 不使用公司模板表头；SALES 强制走专用布局
  if (lines.length && type !== 'production' && type !== 'sales') {
    const titlePattern = /(INVOICE|PACKING LIST|生产通知单|sales\s+confirmation)/i;
    function detectKeys(line) {
      const L = line.toUpperCase();
      const keys = [];
      if (titlePattern.test(line)) keys.push('Title');
      if (/\bDATE\b/.test(L) || /日期/.test(line)) keys.push('Date');
      if (/ACCOUNT AND RISK OF/.test(L) || /客户/.test(line)) keys.push('AccountAndRiskOf');
      if (/CONTRACT\s*NO/.test(L) || /合同编号/.test(line)) keys.push('ContractNo');
      if (/ORDER\s*NO/.test(L) || /订单号/.test(line)) keys.push('OrderNo');
      if (/\bFROM\b/.test(L) || /装运港/.test(line)) keys.push('From');
      if (/\bTO\b/.test(L) || /目的港/.test(line)) keys.push('To');
      if (/B\/L\s*NO/.test(L) || /提单号/.test(line)) keys.push('BLNo');
      if (/INVOICE\s*NO/.test(L) || /发票号/.test(line)) keys.push('InvoiceNo');
      if (/SHIPPED\s+PER\s+S\.S/.test(L) || /货运号/.test(line)) keys.push('ShippedPerSS');
      if (/SIGN\s+AT/.test(L)) keys.push('SignAt');
      if (/TEL|FAX/.test(L) || /电话|传真/.test(line)) keys.push('TELFAX');
      // 静态公司与地址行检测（公司设置中保存的具体文本）
      if (c.companyNameCN && hasText(line, c.companyNameCN)) keys.push('CompanyCN');
      if (c.companyNameEN && hasText(L, String(c.companyNameEN).toUpperCase())) keys.push('CompanyEN');
      if (c.companyAddressCN && hasText(line, c.companyAddressCN)) keys.push('AddressCN');
      if (c.companyAddressEN && hasText(L, String(c.companyAddressEN).toUpperCase())) keys.push('AddressEN');
      return keys;
    }
    let hasTitle = false;
    const parts = lines.map(line => {
      const varMatches = Array.from(line.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[1]);
      const staticKeys = varMatches.length ? [] : detectKeys(line);
      // 不再根据配置过滤，若替换后有内容则显示
      const isTitle = /\{\{Title\}\}/.test(line) || titlePattern.test(line);
      if (isTitle) hasTitle = true;
      // INVOICE：隐藏中文公司名、TEL/FAX、日期、ORDER NO
      if (type === 'invoice') {
        const hideSet = new Set(['CompanyCN', 'TELFAX', 'Date', 'OrderNo']);
        const hasHiddenKey = staticKeys.some(k => hideSet.has(k));
        const hasHiddenToken = /\b(TEL|FAX|DATE|ORDER\s*NO)\b/i.test(line);
        if (hasHiddenKey || hasHiddenToken) return '';
      }
      // 扩展：将模板中的 Title 变量识别为标题行；裸 CompanyEN/CompanyCN 识别为公司名行
      const isTitleLineVar = /\bTitle\b/i.test(line);
      const isCompanyLineVar = /\bCompanyEN\b|\bCompanyCN\b/i.test(line) || /\{\{CompanyEN\}\}|\{\{CompanyCN\}\}/.test(line);
      const cls = (isTitle || isTitleLineVar)
        ? 'doc-title'
        : isCompanyLineVar
          ? 'doc-company'
          : 'doc-subline';
      let contentLine = line;
      if (titlePattern.test(contentLine)) {
        contentLine = contentLine.replace(titlePattern, vars.Title);
      }
      contentLine = replaceVars(contentLine);
      // 规范斜杠分隔与多余空格，并清理首尾分隔符
      contentLine = contentLine.replace(/\s*\/\s*/g, ' / ')
        .replace(/(?:\s*\/\s*){2,}/g, ' / ')
        .replace(/(^\s*\/\s*|\s*\/\s*$)/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!contentLine) return '';
      return `<div class="${cls}">${contentLine}</div>`;
    }).filter(Boolean);
    if (!hasTitle && !parts.some(html => /class=\"doc-title\"/i.test(html))) parts.push(`<div class="doc-title">${title}</div>`);
    if (parts.length) return `<div class="doc-header">${parts.join('')}</div>`;
  }

  // 默认表头（公司信息 + 标题）：生产通知单使用中文地址与中文标签
  const isProduction = type === 'production';
  const addressEN = c.companyAddressEN || '';
  const addressCN = c.companyAddressCN || '';
  // INVOICE 地址仅显示英文，其他类型显示EN/CN合并
  const addressLine = type === 'invoice' ? (addressEN || '') : (isProduction ? (addressCN || '') : [addressEN, addressCN].filter(Boolean).join(' / '));
  const telFaxLine = (type === 'invoice') ? '' : ((c.companyTel || c.companyFax)
    ? `${c.companyTel ? ('TEL: ' + c.companyTel) : ''}${(c.companyTel && c.companyFax) ? ' / ' : ''}${c.companyFax ? ('FAX: ' + c.companyFax) : ''}`
    : '');

  const showCompanyEN = !!c.companyNameEN && !isProduction;
  const showCompanyCN = !!c.companyNameCN && !isProduction && type !== 'invoice';
  const companyLine = (showCompanyEN || showCompanyCN)
    ? `<div class="doc-company">${showCompanyEN ? (c.companyNameEN || '') : ''}${(showCompanyEN && showCompanyCN) ? ' / ' : ''}${showCompanyCN ? (c.companyNameCN || '') : ''}</div>`
    : '';

  const dateLine = (type === 'invoice') ? '' : (vars.Date ? `<div class="doc-subline" style="text-align:right">${isProduction ? '订单日期：' : 'SHIPMENT DATE: '}${vars.Date}</div>` : '');
  const accountLine = vars.AccountAndRiskOf ? `<div class="doc-subline" style="text-align:right">ACCOUNT AND RISK OF: ${vars.AccountAndRiskOf}</div>` : '';
  const contractNoLine = vars.ContractNo ? `<div class="doc-subline" style="text-align:right">${isProduction ? '合同号：' : 'CONTRACT NO: '}${vars.ContractNo}</div>` : '';
  const orderNoLine = (type === 'invoice') ? '' : (vars.OrderNo ? `<div class="doc-subline" style="text-align:right">ORDER NO: ${vars.OrderNo}</div>` : '');
  const fromLine = vars.From ? `<div class="doc-subline" style="text-align:right">FROM: ${vars.From}</div>` : '';
  const toLine = vars.To ? `<div class="doc-subline" style="text-align:right">TO: ${vars.To}</div>` : '';
  const blNoLine = vars.BLNo ? `<div class="doc-subline" style="text-align:right">B/L No: ${vars.BLNo}</div>` : '';
  const invoiceNoLine = vars.InvoiceNo ? `<div class="doc-subline" style="text-align:right">INVOICE NO: ${vars.InvoiceNo}</div>` : '';
  const shippedPerSsLine = vars.ShippedPerSS ? `<div class="doc-subline" style="text-align:right">SHIPPED PER S.S: ${vars.ShippedPerSS}</div>` : '';
  const signAtLine = vars.SignAt ? `<div class="doc-subline" style="text-align:right">Sign At: ${vars.SignAt}</div>` : '';

  // 生产通知单表头仅显示中文公司名称、合同号与订单日期
  if (isProduction) {
    // 🎯 生产通知单公司名称使用三号字体（16pt）
    const cnCompany = c.companyNameCN ? `<div class="doc-company" style="font-size:16pt; font-weight:bold; text-align:center; margin-bottom:8px;">${c.companyNameCN}</div>` : '';
    const titleBlock = `<div class="doc-title">${title}</div>`;
    const contractLine = vars.ContractNo ? `<div class="doc-subline contract-no-line" style="text-align:center;">合同号：${vars.ContractNo}</div>` : '';
    const dateLine = vars.Date ? `<div class="doc-subline" style="text-align:left">订单日期：${vars.Date}</div>` : '';
    return `
        <div class="doc-header">
          ${cnCompany}
          ${titleBlock}
          ${contractLine}
          ${dateLine}
        </div>`;
  }

  // SALES CONFIRMATION 专用表头布局（英文公司、地址、TEL/FAX，右侧合同号与日期；下方左客户，右签署地与订单号）
  if (type === 'sales') {
    const enCompany = `<div class="doc-company" style="font-size:16pt; font-weight:bold; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">QINGDAO SHENGCHI PACKAGING PRODUCT CO.,LTD</div>`;
    const addrEnLine = `<div style="font-size:10pt; margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">NO7 NUODALU AISHAN INDUSTRIAL PARK YANGHE TOWN JIAOZHOU DISTRICT QINGDAO SHANDONG CHINA</div>`;
    const leftTelFax = (c.companyTel || c.companyFax)
      ? `<div style="text-align:left; font-size:14px; font-weight:600">
             ${c.companyTel ? `<div>TEL: ${c.companyTel}</div>` : ''}
             ${c.companyFax ? `<div>FAX: ${c.companyFax}</div>` : ''}
           </div>`
      : '';
    const rightContractDate = (vars.ContractNo || vars.Date)
      ? `<div style="text-align:right">
             ${vars.ContractNo ? `<div>CONTRACT NO: ${vars.ContractNo}</div>` : ''}
             ${vars.Date ? `<div>DATE: ${vars.Date}</div>` : ''}
           </div>`
      : '';
    const topSplit = (leftTelFax || rightContractDate)
      ? `<div class="doc-subline split">${leftTelFax}${rightContractDate}</div>`
      : '';

    // SALES CONFIRMATION 标题 - 使用黑色
    const titleBlock = `<div class="doc-title" style="color: black; font-weight: bold; font-size: 16pt; text-align: center; margin: 12px 0;">${title}</div>`;

    const leftCustomer = vars.AccountAndRiskOf
      ? `<div style="text-align:left">
             <div><strong>TO MESSRS:</strong></div>
             <div style="font-weight:600">${vars.AccountAndRiskOf}</div>
           </div>`
      : '';
    const rightSignOrder = (vars.SignAt || vars.OrderNo)
      ? `<div style="text-align:right">
             ${vars.SignAt ? `<div>SIGN AT : ${vars.SignAt}</div>` : ''}
             ${vars.OrderNo ? `<div>ORDER NO: ${vars.OrderNo}</div>` : ''}
           </div>`
      : '';
    const bottomSplit = (leftCustomer || rightSignOrder)
      ? `<div class="doc-subline split">${leftCustomer}${rightSignOrder}</div>`
      : '';

    return `
        <div class="doc-header">
          ${enCompany}
          ${addrEnLine}
          ${topSplit}
          ${titleBlock}
          ${bottomSplit}
        </div>
        <div style="height:12px"></div>`;
  }

  // 其他单据类型保持原有表头显示
  // 使PACKING LIST与INVOICE使用相同的表头布局
  if (type === 'invoice' || type === 'packing') {
    const title = type === 'invoice' ? 'INVOICE' : 'PACKING LIST';
    // INVOICE和PACKING LIST的SHIPMENT DATE应显示发货日期
    const shipmentDateText = o.shipmentDate || (o.extras && o.extras.deliveryDate) || o.invoiceDate || '';
    // 自定义表头布局，按照新图片样式
    return `
        <div class="doc-header">
          <div style="font-size:16pt; font-weight:bold; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">QINGDAO SHENGCHI PACKAGING PRODUCT CO.,LTD</div>
          <div style="font-size:10pt; margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">NO7 NUODALU AISHAN INDUSTRIAL PARK YANGHE TOWN JIAOZHOU DISTRICT QINGDAO SHANDONG CHINA</div>
          <div style="font-size:14pt; font-weight:bold; color:black; text-align:center; margin-bottom:10px">${title}</div>
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <tbody>
              <tr>
                <td style="padding:2px 0; width:50%; border-bottom:1px solid #000; text-align:left;">CONTRACT No: ${vars.ContractNo}</td>
                <td style="padding:2px 0; width:50%; border-bottom:1px solid #000; text-align:left;">B/L No.: ${vars.BLNo}</td>
              </tr>
              <tr>
                <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;">INVOICE NO: ${vars.InvoiceNo}</td>
                <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;">SHIPMENT DATE: ${shipmentDateText}</td>
              </tr>
              <tr>
                <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;">FROM: ${vars.From}</td>
                <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;">TO: ${vars.To}</td>
              </tr>
              <tr>
                <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;" colspan="2">SHIPPED PER S.S.: ${vars.ShippedPerSS}</td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top:10px; font-size:12px; font-weight:bold; text-align:left;">ACCOUNT AND RISK OF: ${vars.AccountAndRiskOf}</div>
          ${vars.CustomerAddress ? `<div style="margin-top:3px; font-size:11px; text-align:left;">${vars.CustomerAddress}</div>` : ''}
          ${vars.CustomerTelFax ? `<div style="margin-top:3px; font-size:11px; text-align:left;">${vars.CustomerTelFax}</div>` : ''}
        </div>`;
  }

  return `
      <div class="doc-header">
        ${companyLine}
        ${addressLine ? `<div class="doc-subline ${type === 'invoice' ? 'doc-address-en' : ''}" style="white-space:nowrap; font-size:11px; overflow:hidden; text-overflow:ellipsis; width:100%; display:block">${addressLine}</div>` : ''}
        ${telFaxLine ? `<div class="doc-subline" style="white-space:nowrap">${telFaxLine}</div>` : ''}
        <div class="doc-title">${title}</div>
        ${dateLine}
        ${accountLine}
        ${contractNoLine}
        ${orderNoLine}
        ${fromLine}
        ${toLine}
        ${blNoLine}
        ${invoiceNoLine}
        ${shippedPerSsLine}
        ${signAtLine}
      </div>`;
}

// 四种模板渲染
function tplProduction(o, items, sv) {
  const ex = o.extras || {};
  // 检查订单产品类型
  const productType = (o.productType ?? o.product_type) || 1;
  const isTemplate2 = productType === 2;
  const isTemplate3 = productType === 3;
  const isTemplate1 = !isTemplate2 && !isTemplate3;
  // 统计：数量总和与件数按单位后缀分别相加
  const totals = (() => {
    let totalQty = 0;
    const suffixCounts = {};
    (Array.isArray(items) ? items : []).forEach(it => {
      const qty = Number(it && it.quantity || 0);
      const pkgs = Number(it && it.packages || 0);
      const suffix = (it && it.unit === '托盘') ? '托盘' : ((it && it.unit === '捆包') ? '捆包' : ((it && it.unit) || '件'));
      if (Number.isFinite(qty)) totalQty += qty;
      if (Number.isFinite(pkgs)) suffixCounts[suffix] = (suffixCounts[suffix] || 0) + pkgs;
    });
    const suffixOrder = ['托盘', '捆包', '件'];
    const parts = [];
    suffixOrder.forEach(s => { const n = suffixCounts[s]; if (n > 0) parts.push(`${n}${s}`); delete suffixCounts[s]; });
    Object.keys(suffixCounts).sort().forEach(s => { const n = suffixCounts[s]; if (n > 0) parts.push(`${n}${s}`); });
    return { totalQty, pieceSummary: parts.join(' + ') };
  })();

  // 根据模板类型确定列数和列内容
  // 模板3：显示包皮布列，不显示清洁度列，有8列（产品型号、数量、包装件数、重量、包装、包皮布、唛头、标签说明）
  // 模板1和2：显示清洁度列，不显示包皮布列，有8列（产品型号、数量、包装件数、重量、包装、标签重量/标签批号、安全系数/标签说明、清洁度）
  const colCount = 8;

  // 表头第6列：模板1显示"标签重量"，模板2显示"标签批号"，模板3显示"包皮布"
  const col6Header = isTemplate2 ? '标签<br/>批号' : (isTemplate3 ? '包皮布' : '标签<br/>重量 (kg)');
  // 表头第7列：模板1显示"安全系数"，模板2和3显示"唛头"（模板3）或"标签说明"（模板2）
  const col7Header = isTemplate1 ? '安全<br/>系数' : (isTemplate3 ? '唛头' : '标签<br/>说明');
  // 表头第8列：模板1和2显示"清洁度"，模板3显示"标签说明"
  const col8Header = isTemplate3 ? '标签<br/>说明' : '清洁度';

  // 构建colgroup - 根据模板类型调整列宽
  let colgroupCols;
  if (isTemplate3) {
    // 模板C：缩小产品型号和标签说明列，增大唛头列
    colgroupCols = [
      `<col style="width:${styleMode === 'wide' ? '28%' : '25%'}">`, // 产品型号（缩小）
      `<col style="width:${styleMode === 'wide' ? '9%' : '10%'}">`, // 数量
      `<col style="width:${styleMode === 'wide' ? '10%' : '12%'}">`, // 包装件数
      `<col style="width:${styleMode === 'wide' ? '7%' : '8%'}">`, // 重量
      `<col style="width:${styleMode === 'wide' ? '9%' : '10%'}">`, // 包装
      `<col style="width:${styleMode === 'wide' ? '9%' : '8%'}">`, // 包皮布
      `<col style="width:${styleMode === 'wide' ? '16%' : '18%'}">`, // 唛头（增大）
      `<col style="width:${styleMode === 'wide' ? '12%' : '13%'}">`, // 标签说明（缩小）
    ];
  } else {
    // 模板1和2：保持原有列宽
    colgroupCols = [
      `<col style="width:${styleMode === 'wide' ? '32%' : '29%'}">`, // 产品型号
      `<col style="width:${styleMode === 'wide' ? '9%' : '10%'}">`, // 数量
      `<col style="width:${styleMode === 'wide' ? '12%' : '14%'}">`, // 包装件数
      `<col style="width:${styleMode === 'wide' ? '9%' : '10%'}">`, // 重量
      `<col style="width:${styleMode === 'wide' ? '12%' : '13%'}">`, // 包装
      `<col style="width:${styleMode === 'wide' ? '9%' : '8%'}">`, // 第6列
      `<col style="width:${styleMode === 'wide' ? '9%' : '8%'}">`, // 第7列
      `<col style="width:${styleMode === 'wide' ? '8%' : '8%'}">`, // 第8列
    ];
  }

  const table = `
      <table class="table" style="margin-top:8px; border-collapse:collapse; width:100%; border:1px solid #333; table-layout:fixed; font-size:${sv.fontSize}px; line-height:${sv.lineHeight}">
        <colgroup>
          ${colgroupCols.join('\n          ')}
        </colgroup>
        <thead><tr>
          <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all; font-weight:bold; background-color:#f8f9fa">产品型号</th>
          <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all; font-weight:bold; background-color:#f8f9fa">数量</th>
          <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:normal; font-weight:bold; background-color:#f8f9fa">包装<br/>件数</th>
          <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:normal; font-weight:bold; background-color:#f8f9fa">重量<br/>(kg)</th>
          <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all; font-weight:bold; background-color:#f8f9fa">包装</th>
          <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:normal; font-weight:bold; background-color:#f8f9fa">${col6Header}</th>
          <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:normal; word-break:break-word; font-weight:bold; background-color:#f8f9fa; ${styleMode === 'wide' ? 'line-height:1.4; min-width:60px;' : ''}">${col7Header}</th>
          <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all; font-weight:bold; background-color:#f8f9fa">${col8Header}</th>
        </tr></thead>
        <tbody>
          ${items.map(it => {
    const u = it && it.unit === '托盘' ? '托盘' : ((it && it.unit === '捆包') ? '捆包' : ((it && it.unit) || '件'));
    const packagesDisplay = (it && it.packages) ? `${it.packages}${u}` : '';
    const q = Number(it && it.quantity || 0);
    const p = Number(it && it.packages || 0);
    const packingDisplay = (Number.isFinite(q) && Number.isFinite(p) && p > 0) ? `${Math.round((q / p) * 100) / 100}条/${u}` : '';
    const extrasText = renderItemExtrasInline(it);
    // 从extras中提取字段（如果主字段中没有）
    const itemExtras = (it && it.extras) || {};

    // 根据模板类型显示不同的字段
    // 第6列：模板1显示标签重量，模板2显示标签批号，模板3显示包皮布
    // 包皮布字段可能存储在 it.wrappingCloth 或 it.extras.wrappingCloth 中
    const wrappingClothValue = isTemplate3
      ? (it.wrappingCloth || itemExtras.wrappingCloth || itemExtras.wrapping_cloth || '')
      : '';
    const col6Content = isTemplate2 ? (it.labelBatchNo || '') : (isTemplate3 ? wrappingClothValue : (it.labelWeight ? Math.floor(Number(it.labelWeight)) : ''));

    // 第7列：模板1显示安全系数，模板2显示标签说明，模板3显示唛头（与订单预览、编辑共用 order-item-marks）
    let col7Content;
    if (isTemplate3) {
      col7Content = formatCClassMarksPlainText(it, o.contractNo || '').replace(/\n/g, '<br/>');
    } else {
      col7Content = isTemplate1 ? (it.safetyFactor || '') : (it.label || '');
    }

    // 第8列：模板1和2显示清洁度，模板3显示标签说明
    const col8Content = isTemplate3 ? (it.label || '') : (it.cleanliness || '');

    // B类品（模板2）和C类品（模板3）的第7列需要支持自动换行
    const col7Style = (isTemplate2 || isTemplate3)
      ? `padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:normal; word-break:break-word; line-height:1.4`
      : `padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all`;

    return `<tr>
                <td style=\"padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all\">${it.model || ''}</td>
                <td style=\"padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all\">${it.quantity || ''}</td>
                <td style=\"padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all\">${packagesDisplay}</td>
                <td style=\"padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all\">${it.weight ? Number(it.weight).toFixed(2) : ''}</td>
                <td style=\"padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all\">${packingDisplay}</td>
                <td style=\"padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all\">${col6Content}</td>
                <td style=\"${col7Style}\">${col7Content}</td>
                <td style=\"padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; word-break:keep-all\">${col8Content}</td>
              </tr>`;
  }).join('')}
          <tr>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"><strong>合计</strong></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center">${totals.totalQty ? (totals.totalQty + '条') : ''}</td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:normal; word-break:break-word; overflow-wrap:anywhere; line-height:1.3">${totals.pieceSummary ? totals.pieceSummary.replace(/\s*\+\s*/g, '<br/>') : ''}</td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"></td>
          </tr>
        </tbody>
      </table>`;
  const tradeTerm = ex.tradeTerm || 'CIF'; // 获取贸易术语，如果没有则默认为CIF

  // 创建底部三栏：箱型、目的港、交货期（按图示对齐显示）
  const boxText = ex.boxType ? `以上货物装入 ${String(ex.boxType)} 集装箱` : '-';
  const destText = o.shipTo ? `${tradeTerm} ${String(o.shipTo)}` : '-';
  // 交货期：发货日期的前2天
  const dateText = (function () {
    const shipmentDate = o.shipmentDate || ex.deliveryDate || o.invoiceDate;
    if (!shipmentDate) return '-';

    try {
      // 解析发货日期
      let processedDate = String(shipmentDate);
      // 移除汉字
      processedDate = processedDate.replace(/[年月日号]/g, '');

      // 处理纯数字格式 YYYYMMDD
      const numericDateMatch = processedDate.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (numericDateMatch) {
        const [, year, month, day] = numericDateMatch;
        processedDate = `${year}-${month}-${day}`;
      }

      const shipDate = new Date(processedDate);
      if (!isNaN(shipDate.getTime())) {
        // 减去2天
        const deliveryDate = new Date(shipDate);
        deliveryDate.setDate(shipDate.getDate() - 2);

        const y = deliveryDate.getFullYear();
        const m = String(deliveryDate.getMonth() + 1).padStart(2, '0');
        const d = String(deliveryDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch (_) { }

    return shipmentDate; // 如果解析失败，返回原始值
  })();

  // 唛头说明与生产通知备注支持多行
  // 注意：ex.marks 是产品明细中的唛头，ex.marksNote 是生产通知信息中的唛头说明
  let marksNoteContent = ex.marksNote ? String(ex.marksNote).replace(/\n/g, '<br/>') : '';
  // 当唛头说明内容为空时，显示空白而不是默认值
  if (!marksNoteContent) {
    marksNoteContent = '';
  }
  // 生产通知备注：优先使用订单中的实际备注内容，确保数据实时同步
  let noteText = '';
  if (ex.prodNote && String(ex.prodNote).trim()) {
    // 如果订单中有生产通知备注，使用实际内容并转换换行符
    noteText = String(ex.prodNote).replace(/\n/g, '<br/>');
  } else {
    // 如果订单中没有备注内容，显示空白（不使用默认模板）
    noteText = '';
  }

  return `
      ${table}
      <div class="doc-footer production-footer">
        <div class="footer-line-single">
          <span class="footer-label">箱型：</span><span class="footer-content">${boxText}</span>
        </div>
        <div class="footer-line-double">
          <div class="footer-item">
            <span class="footer-label">目的港：</span><span class="footer-content">${destText}</span>
          </div>
          <div class="footer-item">
            <span class="footer-label">交货期：</span><span class="footer-content">${dateText}</span>
          </div>
        </div>
        <div class="footer-line-single">
          <span class="footer-label">唛头说明：</span><span class="footer-content">${marksNoteContent}</span>
        </div>
        <div class="footer-line-single">
          <span class="footer-label">生产通知备注：</span><span class="footer-content">${noteText}</span>
        </div>
      </div>
    `;
}

function tplInvoice(o, items, sv, customer) {
  const ex = o.extras || {};

  const totalAmount = items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unitPrice || it.price || 0), 0);
  const totalPackages = items.reduce((sum, it) => sum + Number(it.packages || 0), 0);
  const totalPieces = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

  // 检查所有产品的件数单位是否一致
  const units = items.map(it => it.unit || '').filter(unit => unit);
  const uniqueUnits = [...new Set(units)];
  let packageUnitDisplay = 'PACKAGES';

  // 如果所有产品的件数单位相同，则使用对应的英文单位
  if (uniqueUnits.length === 1 && uniqueUnits[0]) {
    const unit = uniqueUnits[0];
    if (unit === '托盘') {
      packageUnitDisplay = getPluralUnit(totalPackages, 'PALLET');
    } else if (unit === '捆包') {
      packageUnitDisplay = getPluralUnit(totalPackages, 'SACK');
    } else if (unit === '件') {
      packageUnitDisplay = getPluralUnit(totalPackages, 'BALE');
    }
  }

  const pkgLine = `${totalPackages || 0}${packageUnitDisplay}----------${totalPieces || 0}PCS`;

  // 构建总值栏显示内容：Trade Term + 目的港城市
  const tradeTerm = ex.tradeTerm || o.tradeTerm || '';
  const shipTo = o.shipTo || '';
  // 从目的港中提取城市名（取逗号前的部分，如果没有逗号则使用整个字符串）
  const destinationCity = shipTo ? (shipTo.includes(',') ? shipTo.split(',')[0].trim() : shipTo.trim()) : '';
  // 组合显示：Trade Term + 城市名，如果Trade Term存在则显示"Trade Term 城市名"，否则只显示城市名
  const amountHeaderText = tradeTerm && destinationCity
    ? `${tradeTerm} ${destinationCity}`
    : (tradeTerm || destinationCity || '');

  const table = `
      <table class="table" style="margin-top:8px; border-collapse:collapse; width:100%; border:1px solid #333; table-layout:fixed;">
        <colgroup>
          <col style="width:14%">
          <col style="width:48%">
          <col style="width:16%">
          <col style="width:22%">
        </colgroup>
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;">唛头<br/>MARKS & NOS.</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;">货物描述及数量<br/>DESCRIPTION & QUANTITY</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;">单 价<br/>UNIT PRICE</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;">总 值<br/>AMOUNT</th>
          </tr>
          <tr>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;"></th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;">PP CONTAINER BAG</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;">PER PC</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;">${amountHeaderText}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it, idx) => {
    const qty = Number(it.quantity || 0);
    let unit = it.unit || '';
    if (unit === '托盘') unit = '托盘';
    const price = Number(it.unitPrice || it.price || 0);
    const amount = qty * price;
    const extrasText = renderItemExtrasInline(it);
    const qtyStr = `${qty || 0}PCS`;
    const desc = it.model || '';
    const packages = Number(it.packages || 0);
    const packageUnit = it.packageUnit || (unit === '托盘' ? getPluralUnit(packages, 'PALLET') : (unit === '捆包' ? getPluralUnit(packages, 'SACK') : getPluralUnit(packages, 'BALE')));

    return `<tr>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center"></td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:left; word-wrap: break-word; white-space: normal;">${idx + 1})${desc}<br/>${packages}${packageUnit} ----------${qtyStr}</td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap;">USD${price ? price.toFixed(2) : '0.00'}</td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap;">USD${amount ? amount.toFixed(2) : '0.00'}</td>
            </tr>`;
  }).join('')}
          <tr>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;"></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:left;">${pkgLine.replace('PCS', 'PCS')}</td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;"></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center;"></td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; font-weight:600; vertical-align: middle;">总计 TOTAL：</td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; font-weight:600; vertical-align: middle; white-space:nowrap;">USD${totalAmount.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>`;

  return `
        ${table}
        <div class="doc-footer" style="text-align: right; margin-top: 16px;">
          <div class="signature-container" data-doc-type="invoice"></div>
        </div>
      `;
}

function tplPickup(o, items, sv) {
  const ex = o.extras || {};

  // 获取订单信息 - 从订单字段直接读取
  const productionNo = o.contractNo || o.orderNumber || 'SC2025/175';  // 生产单号 = 合同号
  const blNo = o.blNo || '';  // 提单号
  const vesselVoyage = o.shippedPerSs || '';  // 船名/航次 = 货运号
  const pickupDate = ex.pickupDate || o.pickupDate || '';  // 拉货日期 - 从extras中读取
  const pickupTime = ex.pickupTime || o.pickupTime || '';  // 拉货时间 - 从extras中读取
  const containerPosition = ex.containerPosition || '';  // 箱位：如果为空则不显示
  const photoRequirement = ex.photoRemark || '';  // 拍照备注 - 从拉货通知信息中的"拍照备注"字段读取，如果为空则不显示
  const pickupRemark = ex.pickupNote || '';  // 拉货备注 - 从拉货通知信息中的"拉货备注"字段读取

  // 目的港 - 转换为中文
  const destinationRaw = o.shipTo || '';
  const destinationMap = {
    'KOBE': '神户',
    'OSAKA': '大阪',
    'TOKYO': '东京',
    'YOKOHAMA': '横滨',
    'NAGOYA': '名古屋',
    'BUSAN': '釜山',
    'INCHEON': '仁川',
    'SHANGHAI': '上海',
    'NINGBO': '宁波',
    'QINGDAO': '青岛',
    'TIANJIN': '天津',
    'DALIAN': '大连',
    'XIAMEN': '厦门',
    'SHENZHEN': '深圳',
    'GUANGZHOU': '广州',
    'HONG KONG': '香港',
    'SINGAPORE': '新加坡',
    'BANGKOK': '曼谷',
    'HO CHI MINH': '胡志明市',
    'MANILA': '马尼拉',
    'JAKARTA': '雅加达'
  };
  const destination = destinationMap[destinationRaw.toUpperCase()] || destinationRaw;

  // 尺码 - 从订单箱型体积字段读取
  const volumeText = ex.boxVolume || '';

  // 计算PACKING LIST的统计数据（用于总件数和毛重）
  // 检查所有产品的件数单位是否一致
  const units = items.map(it => it.unit || '').filter(unit => unit);
  const uniqueUnits = [...new Set(units)];
  let packageUnitDisplay = 'PACKAGES';
  let packageUnitChinese = '件';

  // 如果所有产品的件数单位相同，则使用对应的英文和中文单位
  if (uniqueUnits.length === 1 && uniqueUnits[0]) {
    const unit = uniqueUnits[0];
    if (unit === '托盘') {
      packageUnitDisplay = 'PALLETS';
      packageUnitChinese = '托盘';
    } else if (unit === '捆包') {
      packageUnitDisplay = 'SACK';
      packageUnitChinese = '捆包';
    } else if (unit === '件') {
      packageUnitDisplay = 'BALES';
      packageUnitChinese = '件';
    } else if (unit === '托') {
      packageUnitDisplay = 'PALLETS';
      packageUnitChinese = '托';
    }
  }

  // 计算总件数和总数量
  const totalPackages = items.reduce((sum, it) => sum + Number(it.packages || 0), 0);
  const totalQuantity = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

  // 计算毛重（GROSS WEIGHT）- 与PACKING LIST保持一致
  // 获取产品类型（从订单或产品项）
  const productType = (o.productType ?? o.product_type) || 1;
  const totalGrossWeight = items.reduce((sum, it) => {
    const qty = Number(it.quantity || 0);
    const actualWeight = it.actualWeight ? Number(it.actualWeight) : null;
    if (actualWeight !== null && !isNaN(actualWeight) && actualWeight > 0) {
      const netWeight = Math.round(actualWeight * qty);
      let tareWeight = 0;
      const packages = Number(it.packages || 0);
      // 获取包皮布字段（可能存储在 it.wrappingCloth 或 it.extras.wrappingCloth 中）
      const wrappingCloth = it.wrappingCloth || (it.extras && it.extras.wrappingCloth) || '';
      // C类品（productType === 3）且包皮布为"不要"且件数单位为"件"时，使用0.045系数
      if (productType === 3 && wrappingCloth === '不要' && it.unit === '件') {
        tareWeight = 0.045 * packages;
      } else if (it.unit === '件') {
        tareWeight = 0.25 * packages;
      } else if (it.unit === '托盘' || it.unit === '托') {
        tareWeight = 15 * packages;
      } else if (it.unit === '捆包') {
        tareWeight = 10 * packages;
      }
      return sum + Math.round(netWeight + tareWeight);
    }
    return sum;
  }, 0);

  // 计算货物信息（用于显示）
  let productRows = '';
  if (items && items.length > 0) {
    items.forEach((item, index) => {
      const qty = Number(item.quantity || 0);
      const packages = Number(item.packages || 0);
      const model = item.model || '';
      const unit = item.unit || '托';
      productRows += `
          <div style="margin-bottom: 4px; line-height: 1.6;">
            <span style="font-weight: bold; display: inline-block; width: 28px;">${index + 1})</span>
            <span style="font-weight: bold; display: inline-block; min-width: 170px;">${model}</span>
            <span style="font-weight: bold; margin-left: 18px;">${packages} ${unit} ────── ${qty} 条</span>
          </div>
        `;
    });
  }

  // 格式化拉货日期时间 - 格式：2025年10月12日 13:00
  let pickupDateTime = '';
  if (pickupDate) {
    const date = new Date(pickupDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    pickupDateTime = `${year}年${month}月${day}日`;
    if (pickupTime) {
      pickupDateTime += ` ${pickupTime}`;  // 添加空格分隔日期和时间
    }
  }

  // 获取当前日期用于签名
  const today = new Date();
  const currentDate = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  return `
      <div style="font-family: 'Times New Roman', SimSun, serif; font-size: 13px; line-height: 1.5; padding: 20px 25px; max-width: 794px; margin: 0 auto; background: #fff; box-sizing: border-box;">
        
        <!-- 标题区域 -->
        <div style="text-align: center; margin-bottom: 18px; border-bottom: 2px solid #333; padding-bottom: 10px;">
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin-bottom: 6px; color: #000;">
            拉货通知
          </div>
          <div style="font-size: 12px; color: #666; letter-spacing: 1px;">PICKUP NOTIFICATION</div>
        </div>
        
        <!-- 收件人和拍照要求区域 -->
        <div style="margin-bottom: 15px; padding: 10px 12px; background: #f8f9fa; border-left: 4px solid #333;">
          <div style="${photoRequirement ? 'margin-bottom: 8px;' : ''} font-size: 14px;">
            <span style="font-weight: bold; color: #000;">收件部门：</span>
            <span style="font-size: 15px; font-weight: 600;">包装</span>
          </div>
          ${photoRequirement ? `<div style="font-size: 13px; color: #d9534f;">
            <span style="font-weight: bold;">★ 拍照要求：</span>
            <span style="color: #333; font-weight: bold;">${photoRequirement}</span>
          </div>` : ''}
        </div>
        
        <!-- 订单基本信息区域 -->
        <div style="margin-bottom: 15px; padding: 12px; border: 1px solid #ddd; background: #fafafa;">
          <div style="margin-bottom: 10px; font-size: 15px; display: flex; align-items: center;">
            <span style="font-weight: bold; color: #000; min-width: 85px;">生产单号：</span>
            <span style="font-size: 16px; font-weight: 600; color: #0066cc;">${productionNo}</span>
            ${containerPosition ? `<span style="background-color: #FFEB3B; padding: 3px 12px; margin-left: 25px; font-weight: bold; border-radius: 3px; font-size: 14px; border: 1px solid #FBC02D;">${containerPosition}</span>` : ''}
          </div>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 5px 0; width: 50%;">
                <span style="font-weight: bold; color: #000;">提单号：</span>${blNo || '<span style="color: #999;">待填写</span>'}
              </td>
              <td style="padding: 5px 0; width: 50%;">
                <span style="font-weight: bold; color: #000;">船名/航次：</span>${vesselVoyage || '<span style="color: #999;">待填写</span>'}
              </td>
            </tr>
            <tr>
              <td style="padding: 5px 0;">
                <span style="font-weight: bold; color: #000;">尺码/体积：</span>${volumeText || '<span style="color: #999;">待填写</span>'}
              </td>
              <td style="padding: 5px 0;">
                <span style="font-weight: bold; color: #000;">目的港：</span><span style="font-weight: 600;">${destination || '<span style="color: #999;">待填写</span>'}</span>
              </td>
            </tr>
          </table>
        </div>
        
        <!-- 货物明细区域 -->
        <div style="margin-bottom: 15px;">
          <div style="font-size: 15px; font-weight: bold; margin-bottom: 10px; color: #000; border-bottom: 2px solid #e0e0e0; padding-bottom: 6px;">
            货物明细
          </div>
          <div style="margin-left: 10px; background: #fff; padding: 10px 12px; border: 1px solid #e0e0e0;">
            ${productRows || `
              <div style="margin-bottom: 4px; line-height: 1.6;"><span style="font-weight: bold; display: inline-block; width: 28px;">1)</span><span style="font-weight: bold; display: inline-block; min-width: 170px;">D#319-II</span><span style="font-weight: bold; margin-left: 18px;">6 托 ────── 960 条</span></div>
              <div style="margin-bottom: 4px; line-height: 1.6;"><span style="font-weight: bold; display: inline-block; width: 28px;">2)</span><span style="font-weight: bold; display: inline-block; min-width: 170px;">D#66(5)JB</span><span style="font-weight: bold; margin-left: 18px;">30 件 ────── 300 条</span></div>
              <div style="margin-bottom: 4px; line-height: 1.6;"><span style="font-weight: bold; display: inline-block; width: 28px;">3)</span><span style="font-weight: bold; display: inline-block; min-width: 170px;">CMT-250LAMI</span><span style="font-weight: bold; margin-left: 18px;">5 托 ────── 1000 条</span></div>
              <div style="margin-bottom: 4px; line-height: 1.6;"><span style="font-weight: bold; display: inline-block; width: 28px;">4)</span><span style="font-weight: bold; display: inline-block; min-width: 170px;">TN-800L(BBL)</span><span style="font-weight: bold; margin-left: 18px;">100 件 ────── 1000 条</span></div>
              <div style="margin-bottom: 4px; line-height: 1.6;"><span style="font-weight: bold; display: inline-block; width: 28px;">5)</span><span style="font-weight: bold; display: inline-block; min-width: 170px;">DNS-TRK1250H-HA</span><span style="font-weight: bold; margin-left: 18px;">30 件 ────── 300 条</span></div>
            `}
          </div>
          
          <!-- 统计汇总 -->
          <div style="margin-top: 10px; padding: 10px 12px; background: #f0f0f0; border: 1px solid #d0d0d0; font-size: 14px;">
            <span style="font-weight: bold; color: #000;">总件数：</span><span style="font-weight: 600; color: #0066cc;">${totalPackages} ${packageUnitChinese}</span>
            <span style="margin-left: 15px;">共</span>
            <span style="font-weight: 600; color: #0066cc;">${totalQuantity} 条</span>
            <span style="margin-left: 35px; font-weight: bold; color: #000;">毛重：</span><span style="font-weight: 600; color: #0066cc;">${totalGrossWeight} KGS</span>
          </div>
        </div>
        
        <!-- 拉货时间区域 -->
        <div style="margin-bottom: 15px; padding: 12px; border: 2px solid #ff9800; background: #fff8e1; border-radius: 4px;">
          <div style="font-size: 16px; font-weight: bold; color: #e65100;">
            <span style="margin-right: 10px;">📅</span>拉货时间：<span style="font-size: 17px; margin-left: 10px; color: #d84315;">${pickupDateTime || '<span style="color: #999;">待确认</span>'}</span>
          </div>
        </div>
        
        ${pickupRemark ? `
        <!-- 拉货备注区域 -->
        <div style="margin-bottom: 15px; padding: 10px 12px; background: #e3f2fd; border-left: 4px solid #1976d2;">
          <div style="font-weight: bold; margin-bottom: 6px; color: #1565c0; font-size: 14px;">拉货备注：</div>
          <div style="font-size: 13px; line-height: 1.6; color: #333; white-space: pre-wrap;">${pickupRemark.replace(/\n/g, '<br/>')}</div>
        </div>
        ` : ''}
        
        <!-- 签名区域 -->
        <div style="margin-top: 25px; text-align: right; padding-right: 25px;">
          <div style="font-size: 14px; line-height: 2.2;">
            <span style="font-weight: bold; margin-right: 15px;">签字：</span>
            <span style="font-size: 15px; font-weight: 600; border-bottom: 1px solid #333; padding-bottom: 2px; display: inline-block; min-width: 90px; text-align: center;">刘萍萍</span>
          </div>
        </div>
      </div>
    `;
}

function tplPacking(o, items, sv) {
  // 根据货柜类型计算VOLUME
  const ex = o.extras || {};
  const boxType = ex.boxType || '';
  // 直接调用生产通知单信息页面中的"箱型体积"字段值
  let volumeText = ex.boxVolume || '';

  // 如果没有箱型体积字段值，则根据箱型计算默认值
  if (!volumeText) {
    if (boxType === '20GP') {
      volumeText = '28CBM';
    } else if (boxType === '40GP') {
      volumeText = '56CBM';
    } else if (boxType === '40HC') {
      volumeText = '64CBM';
    } else if (boxType === '45HQ') {
      volumeText = '86CBM';
    } else if (boxType === 'L-107') {
      volumeText = '107CBM';
    } else if (boxType === '其他') {
      volumeText = '待确认';
    } else {
      // 当箱型为空或未知时，显示"未填写"
      volumeText = '<span style="color: red; background-color: yellow; padding: 2px 4px;">未填写</span>';
    }
  }

  // 计算总件数
  const totalPackages = items.reduce((sum, it) => sum + Number(it.packages || 0), 0);

  // 获取样式模式
  const styleMode = localStorage.getItem('docStyleMode') || 'normal';

  // 检查所有产品的件数单位是否一致
  const units = items.map(it => it.unit || '').filter(unit => unit);
  const uniqueUnits = [...new Set(units)];
  let packageUnitDisplay = 'PACKAGES';

  // 如果所有产品的件数单位相同，则使用对应的英文单位
  if (uniqueUnits.length === 1 && uniqueUnits[0]) {
    const unit = uniqueUnits[0];
    if (unit === '托盘') {
      packageUnitDisplay = getPluralUnit(totalPackages, 'PALLET');
    } else if (unit === '捆包') {
      packageUnitDisplay = getPluralUnit(totalPackages, 'SACK');
    } else if (unit === '件') {
      packageUnitDisplay = getPluralUnit(totalPackages, 'BALE');
    }
  }

  const table = `      <table class="table" style="margin-top:8px; border-collapse:collapse; width:100%; border:1px solid #333; font-size:${sv.fontSize}px; line-height:${sv.lineHeight}">
        <colgroup>
          <col style="width:${styleMode === 'wide' ? '10%' : styleMode === 'compact' ? '8%' : '9%'}">
          <col style="width:${styleMode === 'wide' ? '46%' : styleMode === 'compact' ? '50%' : '48%'}">
          <col style="width:${styleMode === 'wide' ? '15%' : styleMode === 'compact' ? '14%' : '15%'}">
          <col style="width:${styleMode === 'wide' ? '15%' : styleMode === 'compact' ? '14%' : '15%'}">
          <col style="width:${styleMode === 'wide' ? '14%' : styleMode === 'compact' ? '14%' : '13%'}">
        </colgroup>
        <thead>
          <tr>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;">Shipping<br>Marks</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;">Product Name & Part No.</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;">NET<br>WEIGHT</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;">GROSS<br>WEIGHT</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;">VOLUME</th>
          </tr>
          <tr>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;"></th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;">PP CONTAINER BAG</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;"></th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;"></th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; font-weight:bold; background-color:#f8f9fa; white-space:nowrap; word-break:keep-all;"></th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it, idx) => {
    const qty = Number(it.quantity || 0);
    let unit = it.unit || '';
    if (unit === '托盘') unit = '托盘';
    const packages = Number(it.packages || 0);
    const packageUnit = it.packageUnit || (unit === '托盘' ? getPluralUnit(packages, 'PALLET') : (unit === '捆包' ? getPluralUnit(packages, 'SACK') : getPluralUnit(packages, 'BALE')));

    // 计算NET WEIGHT：只使用实际重量 × 数量，实际重量为空时不计算
    const actualWeight = it.actualWeight ? Number(it.actualWeight) : null;
    let netWeight = null;
    let netWeightDisplay = '';

    if (actualWeight !== null && !isNaN(actualWeight) && actualWeight > 0) {
      netWeight = Math.round(actualWeight * qty);
      netWeightDisplay = `${netWeight} KGS`;
    }

    // 计算皮重：根据件数单位、产品类型和包皮布选择计算
    // 获取产品类型（从订单或产品项）
    const productType = (o.productType ?? o.product_type) || (it.productType ?? it.product_type) || 1;
    // 获取包皮布字段（可能存储在 it.wrappingCloth 或 it.extras.wrappingCloth 中）
    const wrappingCloth = it.wrappingCloth || (it.extras && it.extras.wrappingCloth) || '';
    let tareWeight = 0;
    // C类品（productType === 3）且包皮布为"不要"且件数单位为"件"时，使用0.045系数
    if (productType === 3 && wrappingCloth === '不要' && it.unit === '件') {
      tareWeight = 0.045 * packages;
    } else if (it.unit === '件') {
      tareWeight = 0.25 * packages;
    } else if (it.unit === '托盘') {
      tareWeight = 15 * packages;
    } else if (it.unit === '捆包') {
      tareWeight = 10 * packages;
    }

    // 计算GROSS WEIGHT：只有NET WEIGHT存在时才计算GROSS WEIGHT
    let grossWeightDisplay = '';
    if (netWeight !== null) {
      const grossWeight = Math.round(netWeight + tareWeight);
      grossWeightDisplay = `${grossWeight} KGS`;
    }

    const desc = it.model || '';

    return `<tr>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap; word-break:keep-all;"></td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:left; white-space:nowrap; word-break:keep-all;">${idx + 1})${desc}<br/>${packages}${packageUnit} ----------${qty}PCS @${Math.round(qty / packages)}PCS</td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap; word-break:keep-all; min-height:${sv.fontSize * sv.lineHeight + sv.cellPad * 2}px; display:table-cell;">${netWeightDisplay}</td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap; word-break:keep-all; min-height:${sv.fontSize * sv.lineHeight + sv.cellPad * 2}px; display:table-cell;">${grossWeightDisplay}</td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap; word-break:keep-all;"></td>
            </tr>`;
  }).join('')}
          <tr>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap; word-break:keep-all;"><strong>TOTAL:</strong></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:left; white-space:nowrap; word-break:keep-all;"><strong>${items.reduce((sum, it) => sum + Number(it.packages || 0), 0)}${packageUnitDisplay} / ${items.reduce((sum, it) => sum + Number(it.quantity || 0), 0)}PCS</strong></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap; word-break:keep-all; min-height:${sv.fontSize * sv.lineHeight + sv.cellPad * 2}px; display:table-cell;"><strong>${items.reduce((sum, it) => {
    const qty = Number(it.quantity || 0);
    const actualWeight = it.actualWeight ? Number(it.actualWeight) : null;
    if (actualWeight !== null && !isNaN(actualWeight) && actualWeight > 0) {
      return sum + Math.round(actualWeight * qty);
    }
    return sum;
  }, 0)} KGS</strong></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap; word-break:keep-all; min-height:${sv.fontSize * sv.lineHeight + sv.cellPad * 2}px; display:table-cell;"><strong>${items.reduce((sum, it) => {
    const qty = Number(it.quantity || 0);
    const actualWeight = it.actualWeight ? Number(it.actualWeight) : null;
    if (actualWeight !== null && !isNaN(actualWeight) && actualWeight > 0) {
      const netWeight = Math.round(actualWeight * qty);
      let tareWeight = 0;
      const packages = Number(it.packages || 0);
      // 获取产品类型（从订单或产品项）
      const productType = (o.productType ?? o.product_type) || (it.productType ?? it.product_type) || 1;
      // 获取包皮布字段（可能存储在 it.wrappingCloth 或 it.extras.wrappingCloth 中）
      const wrappingCloth = it.wrappingCloth || (it.extras && it.extras.wrappingCloth) || '';
      // C类品（productType === 3）且包皮布为"不要"且件数单位为"件"时，使用0.045系数
      if (productType === 3 && wrappingCloth === '不要' && it.unit === '件') {
        tareWeight = 0.045 * packages;
      } else if (it.unit === '件') {
        tareWeight = 0.25 * packages;
      } else if (it.unit === '托盘') {
        tareWeight = 15 * packages;
      } else if (it.unit === '捆包') {
        tareWeight = 10 * packages;
      }
      return sum + Math.round(netWeight + tareWeight);
    }
    return sum;
  }, 0)} KGS</strong></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap; word-break:keep-all;"><strong>${volumeText}</strong></td>
          </tr>
        </tbody>
      </table>`;

  return `
    ${table}
    <div class="doc-footer" style="text-align: right; margin-top: 16px;">
      <div class="signature-container" data-doc-type="packing"></div>
    </div>
  `;
}
function tplSales(o, items, sv) {
  const currency = (o && o.extras && (o.extras.currency || o.extras.unitPriceCurrency)) ? String(o.extras.currency || o.extras.unitPriceCurrency).toUpperCase() : 'USD';
  const terms = (o && o.extras && (o.extras.terms || o.extras.priceTerms || o.extras.incoterms)) ? String(o.extras.terms || o.extras.priceTerms || o.extras.incoterms) : '';
  const boxType = (o && o.extras && o.extras.boxType) ? String(o.extras.boxType) : '';
  const insuranceText = (o && o.extras && o.extras.insurance) ? String(o.extras.insurance) : 'TO BE COVERED\nBY THE SELLER';
  const paymentText = (o && o.extras && (o.extras.payment || o.extras.paymentTerms)) ? String(o.extras.payment || o.extras.paymentTerms) : 'BY T/T WITHIN 15 DAYS AFTER B/L DATE';
  const remarksText = (o && o.extras && o.extras.remarks) ? String(o.extras.remarks) : '';
  const destinationText = (function () {
    const incoterm = terms ? terms.trim().split(/\s+/)[0].toUpperCase() : '';
    const to = (o && (o.shipTo || (o.extras && o.extras.destination))) ? String(o.shipTo || (o.extras && o.extras.destination)) : '';
    if (incoterm && to) return `${incoterm} ${to}`;
    return to || incoterm || '';
  })();
  const shipDateText = (function () {
    // 优先使用订单的shipmentDate字段，然后是extras.deliveryDate，最后是invoiceDate
    const raw = (o && o.shipmentDate) ? String(o.shipmentDate) :
      ((o && o.extras && o.extras.deliveryDate) ? String(o.extras.deliveryDate) :
        (o && o.invoiceDate ? String(o.invoiceDate) : ''));
    // 期望格式：YYYY-MM-DD（例如：2025-09-27）
    try {
      // 先处理可能包含汉字的日期格式，如 "2025年09月25号"
      let processedDate = raw;
      // 移除所有汉字
      processedDate = processedDate.replace(/[年月日号]/g, '');

      // 处理纯数字格式 YYYYMMDD（例如：20250925）
      const numericDateMatch = processedDate.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (numericDateMatch) {
        const [, year, month, day] = numericDateMatch;
        // 验证日期有效性
        const validDate = new Date(`${year}-${month}-${day}`);
        if (!isNaN(validDate.getTime())) {
          return `${year}-${month}-${day}`;
        }
      }

      // 尝试正常解析日期
      const dt = new Date(processedDate);
      if (!isNaN(dt.getTime())) {
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        const y = dt.getFullYear();
        return `${y}-${m}-${d}`;
      }
    } catch (_) { }

    // 如果无法解析，尝试格式化纯数字日期
    const lastResortMatch = raw.replace(/[年月日号]/g, '').match(/^(\d{4})(\d{2})(\d{2})$/);
    if (lastResortMatch) {
      const [, year, month, day] = lastResortMatch;
      return `${year}-${month}-${day}`;
    }

    // 原样返回但移除汉字
    return raw.replace(/[年月日号]/g, '');
  })();
  // 优先使用订单的totalUSD字段，如果没有则计算产品明细总额
  const totalAmount = (o && o.totalUSD != null) ? Number(o.totalUSD) :
    items.reduce((sum, it) => sum + Number((it && it.quantity) || 0) * Number((it && (it.unitPrice || it.price)) || 0), 0);
  const totalPieces = items.reduce((sum, it) => sum + Number((it && it.quantity) || 0), 0);

  const table = `
      <table class="table" style="margin-top:8px; border-collapse:collapse; width:100%; border:1px solid #333; text-align:center; table-layout:fixed;">
        <colgroup>
          <col style="width:40%">
          <col style="width:18%">
          <col style="width:20%">
          <col style="width:22%">
        </colgroup>
        <thead>
          <tr>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center">COMMODITY AND SPECIFICATION</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center">QUANTITY</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center">UNIT PRICE<br/>& TERMS</th>
            <th style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${(() => {
      // 先生成PP CONTAINER BAG行
      const ppContainerRow = `<tr>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:left">PP CONTAINER BAG</td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"></td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"></td>
              <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"></td>
            </tr>`;

      // 然后生成所有产品行
      const productRows = items.map((it, idx) => {
        // 基本字段与容错
        const qty = Number((it && it.quantity) || 0);
        // QUANTITY 列统一显示为 PCS
        const qtyStr = `${qty || 0}PCS`;
        const price = Number((it && (it.unitPrice || it.price)) || 0);
        const amount = qty * price;
        const extrasText = renderItemExtrasInline(it);
        const modelText = (it && it.model) ? it.model : '';
        const specLines = [];
        // 规格：型号（加粗）
        if (modelText) {
          let modelLine = `${idx + 1}) ${modelText}`;
          specLines.push(`<div><strong>${modelLine}</strong></div>`);
        }
        // 包装方式与清洁度等
        // 包装显示：将数值与单位组合为英文格式，如 160PCS/PALLET 或 160PCS/BALE
        // 优先使用 it.packing（数量/件数计算结果）；若缺失则尝试由 quantity 与 packages 计算
        // 注意：it.packing 可能是 "220条/捆包" 格式，需要解析数字部分
        const packValRaw = (function () {
          // 如果 packing 是字符串格式（如 "220条/捆包"），尝试提取数字
          if (it && it.packing != null && it.packing !== '') {
            const packingStr = String(it.packing);
            // 尝试匹配 "数字条/单位" 格式，提取数字部分
            const match = packingStr.match(/^(\d+(?:\.\d+)?)/);
            if (match) {
              const num = Number(match[1]);
              if (Number.isFinite(num) && num > 0) {
                return num;
              }
            }
            // 如果匹配失败，尝试直接转换为数字
            const num = Number(packingStr);
            if (Number.isFinite(num) && num > 0) {
              return num;
            }
          }
          // 如果 packing 不可用，从 quantity 和 packages 计算
          const q = Number((it && it.quantity) || 0);
          const p = Number((it && it.packages) || 0);
          if (Number.isFinite(q) && Number.isFinite(p) && p > 0) {
            return Math.round((q / p) * 100) / 100;
          }
          return NaN;
        })();
        let packLine = '';
        if (Number.isFinite(packValRaw) && packValRaw > 0) {
          // 去除无意义的尾部零，例如 160.00 -> 160，160.50 -> 160.5
          const packNumStr = String(packValRaw.toFixed(2)).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
          const unitEng = (it && it.unit === '托盘') ? getPluralUnit(packValRaw, 'PALLET') : ((it && it.unit === '捆包') ? getPluralUnit(packValRaw, 'SACK') : ((it && it.unit === '件') ? getPluralUnit(packValRaw, 'BALE') : ''));
          const packText = unitEng ? `${packNumStr}PCS/${unitEng}` : `${packNumStr}PCS`;
          // 如果订单使用B类品且有标签批号，使用flex布局让批号右对齐
          const orderProductType = (o.productType ?? o.product_type) || 1;
          if (orderProductType === 2 && it.labelBatchNo) {
            packLine = `<div style="display: flex; justify-content: space-between; align-items: center;"><span>${packText}</span><span style="font-weight: 600;">SC:${it.labelBatchNo}</span></div>`;
          } else {
            packLine = packText;
          }
        }
        const cleanLine = (it && it.cleanliness) ? `清洁度 ${it.cleanliness}` : '';
        const specTail = [packLine, cleanLine].filter(Boolean).join('  ');
        if (specTail) specLines.push(`<div>${specTail}</div>`);
        // 额外规格文本
        if (extrasText) specLines.push(`<div style="font-size:${Math.max(11, sv.fontSize - 2)}px; color:#555; margin-top:4px">${extrasText}</div>`);

        const priceCell = `<div>${currency}${price ? price.toFixed(2) : '0.00'}</div>${terms ? `<div style="margin-top:4px">${terms}</div>` : ''}`;
        const amountCell = `${currency}${amount ? amount.toFixed(2) : '0.00'}`;
        return `<tr>
                <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:left">${specLines.join('')}</td>
                <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center">${qtyStr}</td>
                <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center">${priceCell}</td>
                <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; vertical-align:middle;">${amountCell}</td>
              </tr>`;
      }).join('');

      // 返回PP CONTAINER BAG行 + 所有产品行
      return ppContainerRow + productRows;
    })()}
          <tr>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:left">${boxType && boxType !== '其他' ? `SHIPMENT BY ${boxType.replace('GP', '')}'FCL` : ''}</td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center">${totalPieces}PCS</td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center"></td>
            <td style="padding:${sv.cellPad}px; border:1px solid #333; text-align:center; white-space:nowrap; vertical-align:middle;">${currency}${totalAmount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>`;
  const footer = `
      <div class="doc-footer" style="margin-top:4px">
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="width:48%; vertical-align:top; padding-right:12px">
              <div style="margin-bottom:8px"><span style="font-weight:600; text-decoration:underline">TOTAL VALUE:</span></div>
              <div style="margin-bottom:8px"><span style="font-weight:600; text-decoration:underline">SHIPMENT DATE:</span> ${shipDateText || ''}</div>
              <div style="margin-bottom:8px; ${styleMode === 'wide' ? '' : 'white-space:nowrap;'}"><span style="font-weight:600; text-decoration:underline">PAYMENT:</span> ${paymentText}</div>
              <div style="margin-bottom:24px"><span style="font-weight:600; text-decoration:underline">SPECIAL CLAUSE:</span></div>
              <div style="height:120px"></div>
            </td>
            <td style="width:52%; vertical-align:top; padding-left:20px">
              <div style="margin-bottom:8px"><span style="font-weight:600; text-decoration:underline">TOTAL AMOUNT:</span> ${currency}${totalAmount.toFixed(2)}</div>
              <div style="margin-bottom:8px"><span style="font-weight:600; text-decoration:underline">DESTINATION:</span> ${destinationText || ''}</div>
              <div style="margin-bottom:8px"><span style="font-weight:600; text-decoration:underline">INSURANCE:</span>${insuranceText.replace(/\n/g, '<br/>')}</div>
              <div style="margin-bottom:12px"><span style="font-weight:600; text-decoration:underline">REMARKS:</span>${remarksText ? `<div>${remarksText.replace(/\n/g, '<br/>')}</div>` : ''}</div>
              <div style="height:120px; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-end">
                <div class="signature-container" data-doc-type="sales"></div>
              </div>
            </td>
          </tr>
        </table>
        <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:flex-end">
          <div style="border-top:1px dashed #333; padding-top:6px; width:280px; text-align:center">THE BUYER</div>
          <div style="border-top:1px dashed #333; padding-top:6px; width:280px; text-align:center">THE SELLER</div>
        </div>
      </div>`;

  return `${table}${footer}`;
}

async function renderPreview(skipAutoFit = false) {
  // 显示加载状态
  if (preview) {
    preview.innerHTML = '<div style="padding:30px; color:#666; text-align:center; font-size:14px;"><i class="fa fa-spinner fa-spin"></i> 正在加载预览...</div>';
  }

  // 获取公司信息，确保表头内容配置能正确显示
  if (!companyCache) {
    try {
      if (window.ApiService && ApiService.company && typeof ApiService.company.get === 'function') {
        companyCache = await ApiService.company.get();
      }
    } catch (err) {
      console.error('获取公司信息失败:', err);
    }
  }

  let o = currentOrder();
  // 若通过 URL 提供了 id，则优先按需拉取该订单详情，避免先拉整表
  if (urlId != null && Number.isFinite(urlId)) {
    try {
      // 使用 ApiService 获取订单，会自动处理 Tauri 环境下的 URL 和协议
      const full = await window.ApiService.orders.get(urlId);
      if (full) {
        o = full || o;
        // 将该订单放入列表（避免全量拉取）
        if (!orders.find(x => Number(x.id) === Number(full.id))) {
          orders = [full];
          currentOrderIdx = 0;
        }
      }
    } catch (err) {
      console.error('获取订单详情失败:', err);
      if (preview) {
        preview.innerHTML = '<div style="padding:30px; color:#f56c6c; text-align:center; font-size:14px;">获取订单详情失败，请重试</div>';
      }
      return;
    }
  }
  // 若无明细但存在 id，则按需拉取完整订单详情（包含 items）
  if ((!o.items || !Array.isArray(o.items) || o.items.length === 0) && o.id) {
    try {
      // 使用 ApiService 获取订单，自动处理 Tauri 环境
      const full = await window.ApiService.orders.get(o.id);
      if (full) {
        o = full || o;
        // 更新在列表中的引用（后端优先，不再写入本地存储）
        const idx = currentOrderIndex();
        orders[idx] = o;
      }
    } catch (e) {
      console.error('获取订单明细失败:', e);
      console.warn('获取订单明细失败，将使用现有数据渲染');
    }
  }

  // 如果没有订单数据，仍按当前类型渲染空布局以便预览
  if (!o || !o.id) {
    o = o || {};
  }
  const type = docType();
  const sv = styleVars();
  const items = Array.isArray(o.items) ? o.items : [];

  let body = '';
  if (type === 'production') { body = tplProduction(o, items, sv); }
  if (type === 'invoice') {
    let customer = null;
    try {
      if (o && o.customerId != null) {
        customer = await ApiService.customers.get(o.customerId);
      }
    } catch (_) { }
    body = tplInvoice(o, items, sv, customer);
  }
  if (type === 'packing') { body = tplPacking(o, items, sv); }
  if (type === 'pickup') { body = tplPickup(o, items, sv); }
  if (type === 'sales') { body = tplSales(o, items, sv); }

  // 拉货通知不显示公司信息头部
  if (type === 'pickup') {
    preview.innerHTML = `
        <div style="font-size:${sv.fontSize}px; line-height:${sv.lineHeight}">${body}</div>
        <div class="margin-mark-bottom-left"></div>
        <div class="margin-mark-bottom-right"></div>
      `;
  } else {
    // 获取客户信息并传递给buildCompanyBlock
    let customer = null;
    if (o && o.customerId) {
      customer = await getCustomerInfo(o.customerId);
    }
    preview.innerHTML = `
        ${buildCompanyBlock(customer)}
        <div style="font-size:${sv.fontSize}px; line-height:${sv.lineHeight}">${body}</div>
        <div class="margin-mark-bottom-left"></div>
        <div class="margin-mark-bottom-right"></div>
      `;
  }

  // 缩放与适配（A4一页）- 可通过参数跳过
  // 使用requestAnimationFrame确保DOM完全更新后再执行缩放
  if (!skipAutoFit) {
    requestAnimationFrame(() => {
      autoFitPreviewToA4();
      // 移除滚动条后，内容通过 flexbox 居中显示，无需滚动相关逻辑
    });
  }

  // 初始化签名图片显示 - 延迟执行确保DOM完全渲染
  setTimeout(() => {
    initializeSignatureImages();
  }, 100);

  // INVOICE 英文地址单行自适配：若溢出则逐步缩小字体到最小 9px
  try {
    if (type === 'invoice') {
      const addrEl = preview.querySelector('.doc-header .doc-address-en');
      if (addrEl) {
        const containerWidth = addrEl.parentElement ? addrEl.parentElement.clientWidth : preview.clientWidth;
        let size = parseFloat(window.getComputedStyle(addrEl).fontSize) || 11;
        while (addrEl.scrollWidth > containerWidth && size > 8) {
          size -= 0.5;
          addrEl.style.fontSize = `${size}px`;
        }
        // 去掉省略号，确保完整显示（仍保持 nowrap）
        addrEl.style.textOverflow = 'clip';
        addrEl.style.overflow = 'visible';
      }
    }
  } catch (_) { }

  // 更新风格按钮状态 - 现在使用预览窗口标题栏按钮和通用选择器
  try {
    // 使用通用选择器更新所有布局按钮状态
    const allStyleButtons = document.querySelectorAll('.style-btn');
    const styleValues = ['ultra-compact', 'compact', 'standard', 'wide'];

    allStyleButtons.forEach((btn) => {
      if (btn && btn.dataset.style) {
        if (styleMode === btn.dataset.style) {
          btn.classList.add('active');
          btn.style.background = 'var(--primary)';
          btn.style.color = '#fff';
        } else {
          btn.classList.remove('active');
          btn.style.background = '';
          btn.style.color = '';
        }
      }
    });
  } catch (_) { }

  // 更新表头信息汇总
  updateDocHeaderInfoAfterRender();

  // 移除滚动条后，内容通过缩放适配显示，使用 flexbox 居中
  // 由于移除了滚动条，内容通过 flexbox 的 align-items: center 和 justify-content: center 自动居中
  // 缩放原点设置为 center center 确保缩放时也保持居中
}

// 将renderPreview函数暴露到全局作用域
window.renderPreview = renderPreview;

// 在renderPreview完成后更新表头信息汇总
function updateDocHeaderInfoAfterRender() {
  setTimeout(() => {
    const currentType = docType();
    showDocHeaderInfo(currentType);
  }, 50);
}

// 校验必要字段函数
function validateRequiredFields(order, docType) {
  const missingFields = [];

  // 检查合同号/订单号
  if (!order.contractNo && !order.orderNo) {
    missingFields.push('合同号/订单号');
  }

  // 检查客户名称
  if (!order.customerName || order.customerName.trim() === '') {
    missingFields.push('客户名称');
  }

  // 根据单据类型检查特定字段
  if (docType === 'invoice' || docType === 'packing') {
    // INVOICE和PACKING LIST需要目的港
    if (!order.shipTo && !(order.extras && order.extras.destination)) {
      missingFields.push('目的港');
    }
  }

  // 检查产品信息
  if (!order.items || order.items.length === 0) {
    missingFields.push('产品信息');
  } else {
    // 检查产品是否有必要的型号信息
    const hasValidProducts = order.items.some(item => item.model && item.model.trim() !== '');
    if (!hasValidProducts) {
      missingFields.push('产品型号');
    }
  }

  return missingFields;
}

// 导出PDF：优化版 - 提高速度与清晰度
async function exportPDF() {
  if (isOldDocsExportPdfButtonHidden()) {
    window.NotificationSystem?.toast('已在系统设置 → 导出设置中关闭「导出 PDF」', 'info', 3500);
    return;
  }
  // 校验必要字段
  const order = currentOrder();
  if (!order || Object.keys(order).length === 0) {
    window.NotificationSystem?.toast('未找到订单数据，无法导出。', 'warning');
    return;
  }

  const type = docType();
  const missingFields = validateRequiredFields(order, type);

  if (missingFields.length > 0) {
    window.NotificationSystem?.toast(`缺少必要信息，请重新录入：\n\n• ${missingFields.join('\n• ')}\n\n请在新建订单页面完善相关信息后再导出。`, 'warning');
    return;
  }

  // 在导出期间禁用按钮，避免重复点击
  try { if (btnPDF) btnPDF.disabled = true; } catch (_) { }
  try { if (typeof window.NotificationSystem?.toast === "function") window.NotificationSystem?.toast('正在生成PDF，请稍候…', 'info', 1500); } catch (_) { }

  // 使用缓存机制优化库加载
  try {
    // 预加载检查 - 优化二次导出速度
    if (!window.html2canvas || !window.jspdf) {
      // 并行加载两个库以提高首次加载速度
      const loadPromises = [];

      if (!window.html2canvas) {
        loadPromises.push(new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
        }));
      }

      if (!window.jspdf) {
        loadPromises.push(new Promise((resolve, reject) => {
          const s = document.createElement('script');
          // 使用最新稳定版本，并开启gzip压缩支持
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
        }));
      }

      // 并行加载提高速度
      await Promise.all(loadPromises);
    }
  } catch (e) {
    console.error('导出库加载失败:', e);
    window.NotificationSystem?.toast('导出失败：网络连接异常', 'error');
    try { if (btnPDF) btnPDF.disabled = false; } catch (_) { }
    return;
  }

  // 所见即所得：将预览区域渲染为图片并按A4插入PDF
  try {
    if (!preview) {
      window.NotificationSystem?.toast('预览区域未初始化，无法导出。', 'error');
      return;
    }

    // 确保公司信息已加载
    if (!companyCache && window.ApiService && ApiService.company && typeof ApiService.company.get === 'function') {
      companyCache = await ApiService.company.get();
    }

    // 先适配一页，确保与预览一致
    autoFitPreviewToA4();

    // 优化canvas配置，平衡速度与清晰度
    const canvas = await html2canvas(preview, {
      scale: 2.5, // 略微降低缩放比例，但保持良好清晰度
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false, // 禁用日志以提高性能
      allowTaint: true, // 允许跨域图片
      imageTimeout: 2000, // 图片加载超时设置
      removeContainer: true // 渲染后移除临时容器
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 优化图片处理
    const imgData = canvas.toDataURL('image/jpeg', 0.95); // 使用JPEG格式并设置适当压缩质量
    const imgWidthMm = pageWidth;
    const imgHeightMm = (canvas.height * pageWidth) / canvas.width;
    const y = imgHeightMm > pageHeight ? 0 : (pageHeight - imgHeightMm) / 2;

    // 优化图片添加方式
    doc.addImage(imgData, 'JPEG', 0, y, imgWidthMm, Math.min(imgHeightMm, pageHeight), undefined, 'FAST');

    // 保存PDF文件
    const fileName = generateFileName('.pdf');
    doc.save(fileName);

    // 自动更新订单状态
    await updateOrderStatusAfterExport(order, type);

    try { if (typeof window.NotificationSystem?.toast === "function") window.NotificationSystem?.toast('PDF已生成并开始下载', 'success', 2000); } catch (_) { }
  } catch (err) {
    console.error('PDF导出失败:', err);
    alert('PDF导出失败，请重试或检查浏览器支持。');
  } finally {
    try { if (btnPDF) btnPDF.disabled = false; } catch (_) { }
  }
}

// ========== 导出辅助函数 ==========

// 📌 辅助函数：等待图片加载
function waitForImagesToLoad() {
  const images = preview.querySelectorAll('img');
  if (images.length === 0) return Promise.resolve();

  const promises = Array.from(images).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; // 即使加载失败也继续
      setTimeout(resolve, 5000); // 5秒超时
    });
  });
  return Promise.all(promises);
}

// 📌 辅助函数：临时重置缩放执行操作（确保所见即所得）
async function executeWithoutZoom(callback) {
  const zoomWrapper = document.querySelector('.preview-zoom-wrapper');
  if (!zoomWrapper) return callback();

  const currentTransform = zoomWrapper.style.transform;
  zoomWrapper.style.transform = 'scale(1)';

  // 双重等待，确保浏览器完成重新布局和渲染
  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => requestAnimationFrame(resolve));

  try {
    return await callback();
  } finally {
    // 恢复原有缩放
    zoomWrapper.style.transform = currentTransform;
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
}

// 📌 辅助函数：从预览提取字体大小（所见即所得）
function getPreviewFontSize(element) {
  const computedStyle = window.getComputedStyle(element);
  const fontSizePx = parseFloat(computedStyle.fontSize);

  // 转换为pt（点）: 1pt = 1.333px（96 DPI标准）
  const fontSizePt = fontSizePx / 1.333;

  // 转换为Excel size单位: 1 size ≈ 1pt
  const excelSize = Math.round(fontSizePt);

  return { px: fontSizePx, pt: fontSizePt, excelSize };
}

// ========== 导出功能 ==========

async function exportExcel() {
  // 动态加载 ExcelJS，使用本地安装的版本（避免CDN连接失败）
  if (!window.ExcelJS) {
    try {
      // 尝试从本地模块导入
      const ExcelJSModule = await import('exceljs');
      window.ExcelJS = ExcelJSModule.default || ExcelJSModule;
      console.log('[Excel导出] 已从本地模块加载ExcelJS');
    } catch (importError) {
      console.warn('[Excel导出] 本地模块导入失败，尝试CDN加载:', importError);
      // 如果本地导入失败，尝试CDN（作为备用方案）
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
        s.onload = resolve;
        s.onerror = (err) => {
          console.error('[Excel导出] CDN加载也失败:', err);
          reject(new Error('无法加载ExcelJS库，请检查网络连接或安装npm依赖: npm install exceljs'));
        };
        document.head.appendChild(s);
      });
    }
  }

  // 可编辑 XLSX：解析预览 DOM，构建Excel可编辑单元格并应用样式
  try {
    if (!preview) { alert('预览区域未初始化'); return; }

    // 🎯 提前获取必要的数据，避免在executeWithoutZoom中访问外部函数
    const order = currentOrder();
    if (!order || Object.keys(order).length === 0) {
      alert('未找到订单数据，无法导出。');
      return;
    }

    const type = docType();
    const missingFields = validateRequiredFields(order, type);

    if (missingFields.length > 0) {
      alert(`缺少必要信息，请重新录入：\n\n• ${missingFields.join('\n• ')}\n\n请在新建订单页面完善相关信息后再导出。`);
      return;
    }

    const o = order;  // 使用同一个order对象
    const ex = o.extras || {};

    console.log('[Excel导出] 🎯 开始导出（所见即所得模式）');
    console.log('[Excel导出] 订单ID:', o.id, '单据类型:', type);

    // 🎯 提前生成文件名，避免在回调中调用外部函数
    const fileName = generateFileName('.xlsx', o, type);
    console.log('[Excel导出] 文件名:', fileName);

    // 🎯 关键优化：在无缩放状态下创建Excel，确保所见即所得
    const executeResult = await executeWithoutZoom(async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('单据');

      // 列数：按预览表格列数（默认8列）
      const tableEl = preview.querySelector('table.table');
      if (!tableEl) {
        throw new Error('未找到预览表格');
      }

      const headCells = Array.from(tableEl.querySelectorAll('thead th'));
      // 对于INVOICE和PACKING LIST，需要获取第一行表头的列数（因为有两行表头）
      let nCols = headCells.length || 8;
      if (type === 'invoice' || type === 'packing') {
        const firstHeadRow = tableEl.querySelector('thead tr');
        if (firstHeadRow) {
          const firstRowCells = Array.from(firstHeadRow.querySelectorAll('th'));
          nCols = firstRowCells.length || nCols;
        }
      }
      console.log('[Excel导出] 表格列数:', nCols, '类型:', type);

      // 📌 从预览提取字体大小（所见即所得）
      const tableFontSize = getPreviewFontSize(tableEl);
      console.log('[Excel导出] 预览字体大小:', tableFontSize.pt.toFixed(1) + 'pt', '→', tableFontSize.excelSize + 'size');

      // 列宽：根据单据类型设置专用列宽
      if (type === 'production') {
        // 生产通知单专用列宽设置，优化A4打印效果，确保长产品型号完整显示
        // 根据订单产品类型确定列内容：C类品显示包皮布、唛头、标签说明（不显示清洁度），A类品和B类品显示标签重量/标签批号、安全系数/标签说明、清洁度
        const orderProductType = (o.productType ?? o.product_type) || 1;
        const isTemplate3 = (orderProductType === 3);
        if (isTemplate3) {
          // C类品：8列（产品型号、数量、包装件数、重量、包装、包皮布、唛头、标签说明）
          // 缩小产品型号和标签说明列，增大唛头列
          ws.columns = [
            { width: 30 }, // 产品型号（缩小）
            { width: 8 },  // 数量
            { width: 9 },  // 包装件数
            { width: 8 },  // 重量(kg)
            { width: 10 }, // 包装
            { width: 10 }, // 包皮布
            { width: 20 }, // 唛头（增大）
            { width: 15 }  // 标签说明（缩小）
          ];
          console.log('[Excel导出] 使用生产通知单模板3专用列宽（8列：缩小产品型号和标签说明，增大唛头列）');
        } else {
          // 模板1和2：8列（产品型号、数量、包装件数、重量、包装、标签重量/标签批号、安全系数/标签说明、清洁度）
          const isTemplate2 = (orderProductType === 2);
          // B类品（模板2）的标签说明列需要更宽以支持自动换行
          const col7Width = isTemplate2 ? 18 : 8; // B类品标签说明列加宽，A类品安全系数列保持原宽
          ws.columns = [
            { width: 35 }, // 产品型号 - 加宽以确保长产品型号如S1L-KAEC1050B8-80V-N-80V可以完整显示
            { width: 8 },  // 数量
            { width: 10 }, // 包装件数
            { width: 10 }, // 重量(kg)
            { width: 12 }, // 包装
            { width: 10 }, // 标签重量(kg) 或 标签批号
            { width: col7Width },  // 安全系数 或 标签说明（B类品加宽）
            { width: 10 }  // 清洁度
          ];
          console.log('[Excel导出] 使用生产通知单模板1/2专用列宽（8列：标签重量/标签批号、安全系数/标签说明、清洁度）', isTemplate2 ? 'B类品标签说明列已加宽' : '');
        }
      } else if (type === 'invoice') {
        // INVOICE专用列宽设置（4列）：优化列宽确保内容完整显示
        // 列1：唛头（14%）- 通常内容较少，但需要足够宽度以容纳地址行（地址行合并所有列）
        // 列2：货物描述及数量（48%）- 内容最多，需要足够宽度
        // 列3：单价（16%）- 内容较少
        // 列4：总值（22%）- 内容较少
        // 注意：地址行会合并所有列，所以总宽度需要足够容纳长地址（约90字符）
        ws.columns = [
          { width: 25 },  // 唛头 - 增大宽度以确保地址行有足够空间（地址行从第1列开始合并）
          { width: 50 },  // 货物描述及数量 - 加宽以确保产品型号和数量信息完整显示
          { width: 18 },   // 单价 - 确保USD价格完整显示
          { width: 20 }   // 总值 - 确保USD金额完整显示
        ];
        // 总宽度：25+50+18+20=113字符，足够容纳地址行（约90字符）
        console.log('[Excel导出] 使用INVOICE专用列宽（4列：优化货物描述列宽度，增大第一列以容纳地址行）');
      } else if (type === 'packing') {
        // PACKING LIST专用列宽设置（5列）：优化列宽确保内容完整显示
        // 列1：Shipping Marks（9%）- 内容较少
        // 列2：Product Name & Part No.（48%）- 内容最多，需要足够宽度
        // 列3：NET WEIGHT（15%）- 内容较少
        // 列4：GROSS WEIGHT（15%）- 内容较少
        // 列5：VOLUME（13%）- 内容较少
        ws.columns = [
          { width: 12 },  // Shipping Marks - 确保有足够空间
          { width: 50 },  // Product Name & Part No. - 加宽以确保产品信息完整显示
          { width: 18 },  // NET WEIGHT - 确保重量值完整显示
          { width: 18 },  // GROSS WEIGHT - 确保重量值完整显示
          { width: 16 }   // VOLUME - 确保体积值完整显示
        ];
        console.log('[Excel导出] 使用PACKING LIST专用列宽（5列：优化产品名称列宽度）');
      } else {
        // 其他单据类型：🎯 从预览获取真实列宽（无缩放影响）
        const pxToChar = 7; // 经验值：约每个字符宽度对应7像素

        // 尝试从colgroup获取百分比宽度
        const colgroup = tableEl.querySelector('colgroup');
        let colWidths = null;
        if (colgroup) {
          const cols = Array.from(colgroup.querySelectorAll('col'));
          if (cols.length === nCols) {
            colWidths = cols.map(col => {
              const style = col.getAttribute('style') || '';
              const widthMatch = style.match(/width:\s*([\d.]+)%/);
              if (widthMatch) {
                return parseFloat(widthMatch[1]);
              }
              return null;
            });
          }
        }

        if (headCells.length === nCols) {
          // 获取表格总宽度
          const tableWidth = tableEl.getBoundingClientRect().width || 800;

          ws.columns = headCells.map((th, idx) => {
            let wpx;
            if (colWidths && colWidths[idx] !== null) {
              // 使用colgroup的百分比宽度
              wpx = (tableWidth * colWidths[idx]) / 100;
            } else {
              // 回退到从th元素获取实际宽度
              wpx = th.getBoundingClientRect().width || 80;
            }
            const wch = Math.max(6, Math.round(wpx / pxToChar));
            console.log(`[Excel导出] 列${idx + 1}宽度: ${wpx.toFixed(1)}px (${colWidths && colWidths[idx] ? colWidths[idx] + '%' : 'auto'}) → ${wch}字符`);
            return { width: wch };
          });
        } else {
          ws.columns = new Array(nCols).fill(1).map(() => ({ width: 12 }));
        }
      }

      // 打印与页面设置：A4纵向，优化打印效果
      ws.pageSetup.paperSize = 9; // A4
      ws.pageSetup.orientation = 'portrait';
      ws.pageSetup.fitToPage = true;
      ws.pageSetup.fitToWidth = 1;
      ws.pageSetup.fitToHeight = 0; // 不限制高度，允许多页
      ws.pageSetup.scale = 100; // 设置打印缩放比例为100%，确保与软件预览一致

      // 优化页边距，与软件预览保持一致
      if (type === 'production') {
        ws.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.25, footer: 0.25 };
      } else {
        ws.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.3, footer: 0.3 };
      }

      let rowIndex = 1;
      function applyStyle(cell, style) {
        if (!style) return;
        if (style.font) cell.font = style.font;
        if (style.alignment) {
          // 保存原有的 indent 设置（如果有）
          const existingIndent = cell.alignment && cell.alignment.indent;
          cell.alignment = style.alignment;
          // 如果原有 indent 存在且新样式没有指定 indent，则保留原有 indent
          if (existingIndent !== undefined && style.alignment.indent === undefined) {
            cell.alignment.indent = existingIndent;
          } else if (!cell.alignment.indent) {
            // 如果新样式没有指定 indent，设置默认值
            cell.alignment.indent = 0.5;
          }
        }
        if (style.border) cell.border = style.border;
        if (style.fill) cell.fill = style.fill;

        // 统一单元格内边距设置，与软件预览保持一致（仅在 alignment 未设置时）
        if (!cell.alignment) {
          cell.alignment = { indent: 0.5 };
        } else if (!cell.alignment.indent) {
          cell.alignment.indent = 0.5;
        }
      }
      function addRow(values, style) {
        const row = ws.getRow(rowIndex);
        values.forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v;
          applyStyle(cell, style);
        });
        row.commit();
        rowIndex++;
      }

      // 头部：公司名、标题、地址等（合并为整行）
      const headerEl = preview.querySelector('.doc-header');
      if (headerEl) {
        Array.from(headerEl.children).forEach(el => {
          // 特殊处理：如果是表格元素（INVOICE和PACKING LIST的表头信息表格），需要按表格结构处理
          if (el.tagName === 'TABLE') {
            const tableRows = Array.from(el.querySelectorAll('tbody tr, thead tr'));
            tableRows.forEach(tr => {
              const cells = Array.from(tr.querySelectorAll('td, th'));
              const cellTexts = cells.map(cell => (cell.innerText || cell.textContent || '').trim());
              const cellColspans = cells.map(cell => {
                const colspan = cell.getAttribute('colspan');
                return colspan ? parseInt(colspan, 10) : 1;
              });

              // 对于INVOICE和PACKING LIST，表头信息表格只有2列
              // 优化列分配：对于PACKING LIST（5列），第一列占用前2列，第二列占用后3列
              // 对于INVOICE（4列），第一列占用前2列，第二列占用后2列
              const row = ws.getRow(rowIndex);
              let colIndex = 1;
              const headerTableCols = 2; // 表头信息表格有2列

              // 根据单据类型和总列数优化列分配
              let colsPerCell;
              if (type === 'packing' && nCols === 5) {
                // PACKING LIST（5列）：第一列占用前2列（A-B），第二列占用后3列（C-E）
                colsPerCell = idx => idx === 0 ? 2 : 3;
              } else if (type === 'invoice' && nCols === 4) {
                // INVOICE（4列）：第一列占用前2列（A-B），第二列占用后2列（C-D）
                colsPerCell = idx => 2;
              } else {
                // 其他情况：均匀分配
                colsPerCell = idx => Math.floor(nCols / headerTableCols);
              }

              cellTexts.forEach((text, idx) => {
                const colspan = cellColspans[idx] || 1;
                const startCol = colIndex;
                let endCol;

                // 如果colspan=2，说明该单元格应该跨越整行（所有列）
                if (colspan === 2) {
                  endCol = nCols; // 跨越整行
                } else {
                  // 根据优化后的列分配计算结束列
                  const cellCols = typeof colsPerCell === 'function' ? colsPerCell(idx) : colsPerCell;
                  endCol = Math.min(nCols, colIndex + cellCols * colspan - 1);
                }

                const cell = row.getCell(startCol);
                cell.value = text;
                const cellStyle = {
                  font: { size: 12, name: 'SimSun' },
                  alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
                  border: {
                    bottom: { style: 'thin', color: { argb: 'FF000000' } }
                  }
                };
                applyStyle(cell, cellStyle);

                if (endCol > startCol) {
                  ws.mergeCells(rowIndex, startCol, rowIndex, endCol);
                }

                colIndex = endCol + 1;
              });

              // 确保整行（包括E列）都有底部边框，特别是对于PACKING LIST的5列
              // 为剩余的列（如果有）也设置底部边框
              for (let col = colIndex; col <= nCols; col++) {
                const cell = row.getCell(col);
                const cellStyle = {
                  border: {
                    bottom: { style: 'thin', color: { argb: 'FF000000' } }
                  }
                };
                applyStyle(cell, cellStyle);
              }

              row.height = 20;
              row.commit();
              rowIndex++;
            });
            return;
          }

          const text = (el.innerText || el.textContent || '').trim();
          if (!text) return;
          const isTitle = /INVOICE|PACKING LIST|生产通知单|sales\s+confirmation/i.test(text);

          // 判断是否是公司名称（包含"QINGDAO SHENGCHI"或"PACKAGING PRODUCT"等关键词，且不包含地址信息）
          const isCompanyName = /QINGDAO SHENGCHI|PACKAGING PRODUCT|CO\.\s*LTD/i.test(text) &&
            !text.includes('NO7') && !text.includes('INDUSTRIAL PARK') &&
            !text.includes('NUODALU') && !text.includes('AISHAN') &&
            !text.includes('YANGHE') && !text.includes('JIAOZHOU') &&
            !text.includes('DISTRICT') && !text.includes('TOWN');

          // 判断是否是地址行（包含地址关键词）
          const isAddress = /NO7|INDUSTRIAL PARK|DISTRICT|TOWN|CHINA/i.test(text) &&
            (text.includes('NUODALU') || text.includes('AISHAN') || text.includes('YANGHE') || text.includes('JIAOZHOU'));

          // 判断是否是"ACCOUNT AND RISK OF:"行（包含客户名称）
          const isAccountAndRiskOf = /ACCOUNT AND RISK OF/i.test(text);

          // 检查元素的内联样式，判断是否应该加粗
          const inlineStyle = el.getAttribute('style') || '';
          const shouldBoldFromStyle = inlineStyle.includes('font-weight:bold') || inlineStyle.includes('font-weight: bold');

          // 根据内容和样式确定对齐方式
          let horizontalAlign = 'left';
          if (isTitle || el.classList.contains('doc-company') || isCompanyName || isAddress) {
            // 标题、公司名称和地址行都居中显示
            horizontalAlign = 'center';
          } else if (text.includes('合同号') || text.includes('CONTRACT NO')) {
            // 检查内联样式，如果为center则居中，否则右对齐（兼容旧逻辑）
            horizontalAlign = inlineStyle.includes('text-align:center') ? 'center' : 'right';
          } else if (text.includes('订单日期')) {
            horizontalAlign = 'left';
          } else {
            // 检查元素的内联样式
            if (inlineStyle.includes('text-align:right')) {
              horizontalAlign = 'right';
            } else if (inlineStyle.includes('text-align:center')) {
              horizontalAlign = 'center';
            }
          }

          // 对于地址行，不换行以确保显示在一行
          const shouldWrapText = !isAddress;

          const style = {
            // 公司名字号大于标题，并居中，统一字体为宋体
            font: {
              bold: isCompanyName || el.classList.contains('doc-company') || isTitle || isAccountAndRiskOf || shouldBoldFromStyle, // 公司名称、标题、ACCOUNT AND RISK OF行都加粗，或根据样式加粗
              size: el.classList.contains('doc-company') || isCompanyName ? 18 : (isTitle ? 14 : (isAddress ? 10 : (isAccountAndRiskOf ? 12 : 12))),
              name: 'SimSun' // 统一使用宋体，与软件预览保持一致
            },
            alignment: { vertical: 'middle', horizontal: horizontalAlign, wrapText: shouldWrapText }
          };
          addRow([text], style);
          // 设置标题行更高一些，与软件预览保持一致
          const r = ws.getRow(rowIndex - 1);
          r.height = isTitle ? 32 : (el.classList.contains('doc-company') || isCompanyName ? 36 : (isAddress ? 20 : 25));
          ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);

          // 对于地址行，需要增大列宽以确保不换行
          if (isAddress && type === 'invoice') {
            // 设置第一列的宽度足够大以容纳地址（地址行合并了所有列）
            // 由于已经合并了所有列，我们需要确保合并后的单元格宽度足够
            // 通过设置列宽来实现（但这里已经合并了，所以需要在合并前设置列宽）
            // 实际上，由于地址行已经合并了所有列，我们需要确保这些列的宽度总和足够
            // 但列宽已经在前面设置了，这里我们可以通过调整行高来适应，或者确保列宽足够
            // 由于地址行合并了所有列，合并后的宽度是各列宽度之和
            // 我们已经在前面为INVOICE设置了列宽，但可能需要进一步增大
            // 实际上，由于地址行已经合并了所有列，合并后的宽度应该是足够的
            // 但为了确保不换行，我们需要确保wrapText为false（已经在上面设置了）
          }
        });
        // 空行分隔
        rowIndex++;
      }

      // 基本信息行（doc-body）：模拟 flex-wrap，将块按占用像素宽度跨列合并
      const bodyEl = preview.querySelector('.doc-body');
      if (bodyEl) {
        const style = {
          alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
          font: { size: 12, name: 'SimSun' } // 统一字体为宋体
        };
        const blocks = Array.from(bodyEl.children).map(el => (el.innerText || el.textContent || '').trim()).filter(Boolean);
        if (type === 'production') {
          // 行1：客户信息独占一整行
          const rowCust = ws.getRow(rowIndex);
          const cellCust = rowCust.getCell(1);
          cellCust.value = (blocks[0] && /^客户/.test(blocks[0])) ? blocks[0] : `客户：${o.customerName || '-'}`;
          applyStyle(cellCust, style);
          ws.mergeCells(rowIndex, 1, rowIndex, nCols);
          rowCust.height = 25; // 增加行高与软件预览一致
          rowCust.commit();
          rowIndex++;

          // 行2：合同号独立占一行，居中对齐
          const contractText = (blocks[1] && /^合同号/.test(blocks[1])) ? blocks[1] : `合同号：${o.contractNo || o.orderNo || '-'}`;
          const rowContract = ws.getRow(rowIndex);
          // 先设置值和样式，再合并单元格
          const cellContract = rowContract.getCell(1);
          cellContract.value = contractText;
          // 设置居中对齐（不设置indent，确保对齐正确）
          cellContract.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true
          };
          // 应用字体样式
          if (style.font) {
            cellContract.font = style.font;
          }
          // 合并单元格
          ws.mergeCells(rowIndex, 1, rowIndex, nCols);
          // 合并后重新获取主单元格并再次确认对齐方式
          const mergedCell = ws.getCell(rowIndex, 1);
          mergedCell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true
          };
          rowContract.height = 25; // 增加行高与软件预览一致
          rowContract.commit();
          rowIndex++;

          // 行3：订单日期独立占一行，左对齐
          const orderDateText = (blocks[2] && /^订单日期/.test(blocks[2])) ? blocks[2] : `订单日期：${o.invoiceDate || '-'}`;
          const rowDate = ws.getRow(rowIndex);
          const cellDate = rowDate.getCell(1);
          cellDate.value = orderDateText;
          const dateStyle = { ...style, alignment: { horizontal: 'left', vertical: 'middle', wrapText: true } };
          applyStyle(cellDate, dateStyle);
          ws.mergeCells(rowIndex, 1, rowIndex, nCols);
          rowDate.height = 25; // 增加行高与软件预览一致
          rowDate.commit();
          rowIndex++;
        } else {
          // 其他类型：顺序填充，必要时自动换行
          const tableWidthPx = tableEl ? tableEl.getBoundingClientRect().width : (preview.getBoundingClientRect().width);
          let colCursor = 1;
          const gapCols = 1;
          blocks.forEach((text, idx) => {
            const span = Math.max(1, Math.floor(nCols / Math.max(1, blocks.length)));
            if (colCursor + span - 1 > nCols) {
              ws.getRow(rowIndex).commit();
              rowIndex++;
              colCursor = 1;
            }
            const startCol = colCursor;
            const endCol = Math.min(nCols, startCol + span - 1);
            const row = ws.getRow(rowIndex);
            const cell = row.getCell(startCol);
            cell.value = text;
            applyStyle(cell, style);
            if (endCol > startCol) ws.mergeCells(rowIndex, startCol, rowIndex, endCol);
            colCursor = endCol + gapCols + 1;
          });
          ws.getRow(rowIndex).commit();
          rowIndex++;
        }
      }

      // 表格头 - 处理多行表头（INVOICE和PACKING LIST有两行表头）
      if (tableEl) {
        const headRows = Array.from(tableEl.querySelectorAll('thead tr'));

        // 处理每一行表头
        headRows.forEach((headRow, headRowIndex) => {
          const headCells = Array.from(headRow.querySelectorAll('th'));
          const headTexts = headCells.map(th => {
            // 获取文本内容，规范化换行符并去掉多余的空白行
            let text = th.innerText || th.textContent || '';
            // 规范化换行符：将多个连续的空白字符和换行符替换为单个换行符
            text = text.replace(/[ \t]*\n[ \t]*/g, '\n');
            // 去掉连续的多个换行符（只保留一个）
            text = text.replace(/\n{2,}/g, '\n');
            // 去掉开头和结尾的换行符和空白字符
            text = text.replace(/^\n+|\n+$/g, '').trim();
            return text;
          });

          // 获取每个单元格的对齐方式（从样式或内联样式）
          const headAlignments = headCells.map(th => {
            const style = window.getComputedStyle(th);
            const inlineStyle = th.getAttribute('style') || '';
            // 检查内联样式或计算样式
            if (inlineStyle.includes('text-align:left') || style.textAlign === 'left') {
              return 'left';
            } else if (inlineStyle.includes('text-align:right') || style.textAlign === 'right') {
              return 'right';
            }
            return 'center'; // 默认居中
          });

          const headStyle = {
            font: { bold: true, size: 12, name: 'SimSun' }, // 统一字体为宋体
            alignment: { vertical: 'middle', wrapText: true },
            border: {
              top: { style: headRowIndex === 0 ? 'medium' : 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: headRowIndex === headRows.length - 1 ? 'medium' : 'thin', color: { argb: 'FF000000' } }
            },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } } // 浅灰色背景，与预览窗口一致
          };

          // 添加表头行
          const row = ws.getRow(rowIndex);
          headTexts.forEach((text, i) => {
            const cell = row.getCell(i + 1);
            cell.value = text;
            // 应用样式，并根据每个单元格的对齐方式设置
            const cellStyle = {
              ...headStyle,
              alignment: {
                horizontal: headAlignments[i] || 'center',
                vertical: 'middle',
                wrapText: true
              }
            };
            applyStyle(cell, cellStyle);
          });

          // 设置表格头部行高
          row.height = type === 'production' ? 65 : (headRowIndex === 0 ? 35 : 25); // 第一行表头稍高，第二行稍低
          row.commit();
          rowIndex++;
        });

        // 表格体
        const trs = Array.from(tableEl.querySelectorAll('tbody tr'));
        trs.forEach((tr, trIndex) => {
          const tds = Array.from(tr.querySelectorAll('td'));
          // 处理文本：规范化换行符，去掉多余的空白行和末尾的换行符
          const texts = tds.map(td => {
            let text = td.innerText || td.textContent || '';
            // 规范化换行符：将多个连续的空白字符和换行符替换为单个换行符
            text = text.replace(/[ \t]*\n[ \t]*/g, '\n');
            // 去掉连续的多个换行符（只保留一个）
            text = text.replace(/\n{2,}/g, '\n');
            // 去掉开头和结尾的换行符和空白字符
            text = text.replace(/^\n+|\n+$/g, '').trim();
            return text;
          });

          // 检查是否为空行：如果所有单元格都为空，则跳过这一行
          const isEmptyRow = texts.every(text => !text || text.trim() === '');
          if (isEmptyRow) {
            return; // 跳过空行
          }

          const row = ws.getRow(rowIndex);

          // 检查是否为合计行（通常是最后一行或包含"合计"、"SHIPMENT BY"等关键词）
          const isLastRow = trIndex === trs.length - 1;
          const isTotalRow = texts.some(text => /合计|SHIPMENT BY|总计|TOTAL|FCL|PCS/i.test(text));

          // 获取原始td元素以获取对齐方式
          const originalTds = Array.from(tr.querySelectorAll('td'));

          texts.forEach((text, i) => {
            const cell = row.getCell(i + 1);
            const stripped = String(text).trim();
            // 仅当单元格为纯数字时写入数值类型，带单位的保留为文本
            if (/^-?\d+(\.\d+)?$/.test(stripped)) {
              cell.value = Number(stripped);
            } else {
              // 使用处理后的文本（已去掉末尾换行符）
              cell.value = text;
            }

            // 从原始td元素获取对齐方式
            let cellAlign = 'center'; // 默认居中
            if (originalTds[i]) {
              const tdStyle = window.getComputedStyle(originalTds[i]);
              const inlineStyle = originalTds[i].getAttribute('style') || '';
              if (inlineStyle.includes('text-align:left') || tdStyle.textAlign === 'left') {
                cellAlign = 'left';
              } else if (inlineStyle.includes('text-align:right') || tdStyle.textAlign === 'right') {
                cellAlign = 'right';
              } else if (inlineStyle.includes('text-align:center') || tdStyle.textAlign === 'center') {
                cellAlign = 'center';
              }
            }

            applyStyle(cell, {
              font: { size: 12, name: 'SimSun' }, // 统一字体为宋体
              alignment: { horizontal: cellAlign, vertical: 'middle', wrapText: true },
              border: {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } }
              }
            });
          });

          // 设置表格行高度，合计行显著增加高度确保文字完整显示
          if (type === 'production' && (isLastRow || isTotalRow)) {
            row.height = 42; // 合计行进一步增加高度，与软件预览一致
          } else if (type === 'invoice' || type === 'packing') {
            // INVOICE和PACKING LIST：根据内容动态调整行高
            let rowHeight = 30; // 默认行高度（比普通行稍高）

            // 检查货物描述列（第2列）是否包含换行符或多行内容
            const descriptionCellText = texts[1] || '';
            if (descriptionCellText.includes('\n') || descriptionCellText.length > 30) {
              // 如果包含换行符或内容较长，增加行高以确保完整显示
              rowHeight = 45; // 增加行高以容纳多行内容
            }

            // 如果是合计行，进一步增加高度
            if (isTotalRow || isLastRow) {
              rowHeight = Math.max(rowHeight, 35);
            }

            row.height = rowHeight;
          } else {
            // C类品生产通知单：增大产品内容行行高，确保唛头的2行内容不被遮挡
            const orderProductType = (o.productType ?? o.product_type) || 1;
            const isTemplate3 = (orderProductType === 3);
            let rowHeight = 28; // 默认普通行高度

            if (isTemplate3 && type === 'production' && !isTotalRow && texts.length >= 7) {
              // C类品的唛头列（第7列）：若包皮布为"要"，则第一行显示产品型号，第二行显示唛头信息
              // 检查唛头列是否包含换行符（当包皮布为"要"时，会包含产品型号和唛头信息两行）
              const marksCellText = texts[6] || '';
              if (marksCellText.includes('\n')) {
                // 唛头列包含换行符，说明有多行内容（产品型号+唛头信息，或唛头本身多行）
                // 增大行高，确保多行内容完整显示不被遮挡
                rowHeight = 40; // 从28增加到40，提供足够空间显示多行内容
              }
            }

            row.height = rowHeight;
          }
          row.commit();
          rowIndex++;
        });

        // 处理表格底部（tfoot）- INVOICE有tfoot显示总计
        const tfootRows = Array.from(tableEl.querySelectorAll('tfoot tr'));
        if (tfootRows.length > 0) {
          tfootRows.forEach((tfootRow) => {
            const tfootCells = Array.from(tfootRow.querySelectorAll('td, th'));
            const tfootTexts = tfootCells.map(td => {
              let text = td.innerText || td.textContent || '';
              // 规范化换行符：将多个连续的空白字符和换行符替换为单个换行符
              text = text.replace(/[ \t]*\n[ \t]*/g, '\n');
              // 去掉连续的多个换行符（只保留一个）
              text = text.replace(/\n{2,}/g, '\n');
              // 去掉开头和结尾的换行符和空白字符
              text = text.replace(/^\n+|\n+$/g, '').trim();
              return text;
            });

            // 获取每个单元格的对齐方式和colspan
            const tfootAlignments = tfootCells.map(td => {
              const style = window.getComputedStyle(td);
              const inlineStyle = td.getAttribute('style') || '';
              if (inlineStyle.includes('text-align:left') || style.textAlign === 'left') {
                return 'left';
              } else if (inlineStyle.includes('text-align:right') || style.textAlign === 'right') {
                return 'right';
              }
              return 'center';
            });

            const tfootColspans = tfootCells.map(td => {
              const colspan = td.getAttribute('colspan');
              return colspan ? parseInt(colspan, 10) : 1;
            });

            const row = ws.getRow(rowIndex);
            let colIndex = 1;

            tfootTexts.forEach((text, i) => {
              const colspan = tfootColspans[i] || 1;
              const startCol = colIndex;
              const endCol = colIndex + colspan - 1;

              const cell = row.getCell(startCol);
              cell.value = text;

              // 应用样式（tfoot通常使用粗体）
              applyStyle(cell, {
                font: { bold: true, size: 12, name: 'SimSun' },
                alignment: {
                  horizontal: tfootAlignments[i] || 'center',
                  vertical: 'middle',
                  wrapText: true
                },
                border: {
                  top: { style: 'medium', color: { argb: 'FF000000' } },
                  left: { style: 'thin', color: { argb: 'FF000000' } },
                  right: { style: 'thin', color: { argb: 'FF000000' } },
                  bottom: { style: 'medium', color: { argb: 'FF000000' } }
                }
              });

              // 合并单元格
              if (colspan > 1) {
                ws.mergeCells(rowIndex, startCol, rowIndex, endCol);
              }

              colIndex = endCol + 1;
            });

            row.height = 30; // tfoot行高
            row.commit();
            rowIndex++;
          });
        }

        // 在产品表格与后续"箱型"等信息之间插入一条空行用于视觉分隔
        // 对于INVOICE和PACKING LIST，完全不需要这个空行（交货期和签章图片会紧跟在tfoot之后）
        if (type !== 'invoice' && type !== 'packing') {
          addRow([' '], { alignment: { horizontal: 'left', vertical: 'middle' }, font: { size: 1 } });
          ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);
          const gapRow = ws.getRow(rowIndex - 1);
          gapRow.height = 15; // 增加间距行高度
        }
      }

      // 处理签章图片（仅INVOICE和PACKING LIST）- 在表格下方，紧跟在tfoot之后
      if (type === 'invoice' || type === 'packing') {
        const signatureContainer = preview.querySelector('.signature-container');
        if (signatureContainer) {
          const signatureImg = signatureContainer.querySelector('img');
          if (signatureImg && signatureImg.src && !signatureImg.src.includes('data:image/svg') && signatureImg.complete) {
            try {
              console.log('[Excel导出] 开始处理签章图片...');

              // 将图片转换为ArrayBuffer（浏览器兼容方式）
              let imageArrayBuffer;
              if (signatureImg.src.startsWith('data:')) {
                // base64图片
                const base64Data = signatureImg.src.split(',')[1];
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                imageArrayBuffer = bytes.buffer;
              } else {
                // 网络图片，需要先获取
                const absoluteUrl = signatureImg.src.startsWith('http')
                  ? signatureImg.src
                  : new URL(signatureImg.src, window.location.origin).href;
                const response = await fetch(absoluteUrl);
                if (response.ok) {
                  imageArrayBuffer = await response.arrayBuffer();
                } else {
                  console.warn('[Excel导出] 签章图片获取失败:', response.status);
                }
              }

              if (imageArrayBuffer) {
                // 添加空行用于放置图片（紧跟在tfoot之后）
                addRow([''], { alignment: { horizontal: 'left', vertical: 'middle' } });
                ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);

                const imageRowObj = ws.getRow(rowIndex - 1);
                const imageRowIndex = rowIndex - 1; // 记录行索引，用于失败时调整

                // 定位到表格下方，第3列（C列）开始的位置（对应C14-E16区域）
                // 对于INVOICE和PACKING LIST，表格从第1列开始，签章应该在第3列（索引2）开始
                // 如果表格列数>=3，使用第3列；否则使用第1列
                const anchorCol = Math.max(0, Math.min(2, nCols - 1)); // 第3列（C列，索引2，0-based）
                const anchorRow = Math.max(0, imageRowIndex); // 当前行（0-based，确保不超出范围）

                // 计算图片跨列数（覆盖C14-E16，即3列）
                // 但不超过表格总列数
                const imageColSpan = Math.min(3, nCols - anchorCol);

                // 添加图片到Excel
                // ExcelJS的正确用法：先添加到workbook，再添加到worksheet
                let imageAdded = false;
                try {
                  // 方法：先添加到workbook获取imageId（如果workbook有addImage方法）
                  // 否则直接使用worksheet.addImage
                  let imageId;
                  if (typeof wb.addImage === 'function') {
                    imageId = wb.addImage({
                      buffer: imageArrayBuffer,
                      extension: 'png'
                    });
                    // 使用twoCellAnchor方式，使图片跨多列
                    ws.addImage(imageId, {
                      tl: { col: anchorCol, row: anchorRow },
                      ext: { width: 257, height: 100 }
                    });
                  } else {
                    // 直接使用worksheet.addImage
                    ws.addImage(imageArrayBuffer, {
                      tl: { col: anchorCol, row: anchorRow },
                      ext: { width: 257, height: 100 }
                    });
                  }

                  imageAdded = true;
                  // 设置行高以容纳图片（缩小行高以改善观感）
                  imageRowObj.height = 30;
                  console.log('[Excel导出] ✅ 签章图片已添加，位置：行', anchorRow + 1, '，列', anchorCol + 1, '（表格下方）');
                } catch (imgError) {
                  console.error('[Excel导出] 添加签章图片时出错:', imgError);
                  console.error('[Excel导出] 错误详情:', {
                    anchorCol,
                    anchorRow,
                    nCols,
                    rowIndex,
                    error: imgError.message,
                    stack: imgError.stack
                  });
                  // 如果添加图片失败，将空行高度设置为很小，使其几乎不可见
                  imageRowObj.height = 1; // 设置为很小的行高，使空行几乎不可见
                  // 清除该行的内容
                  for (let col = 1; col <= nCols; col++) {
                    const cell = imageRowObj.getCell(col);
                    cell.value = null;
                  }
                  imageRowObj.commit();
                }
              }
            } catch (err) {
              console.error('[Excel导出] 添加签章图片失败:', err);
            }
          } else {
            console.log('[Excel导出] 签章图片未找到或未加载完成');
          }
        }

        // 处理交货期（在签章图片之后）
        // 已移除：INVOICE和PACKING LIST不需要显示交货期
        // const footerEl = preview.querySelector('.doc-footer');
        // if (footerEl) {
        //   const ex = o.extras || {};
        //   const delivery = ex.deliveryDate || o.invoiceDate;
        //   if (delivery) {
        //     // 计算交货期（发货日期前2天）
        //     const dateText = (function(){
        //       const shipmentDate = o.shipmentDate || ex.deliveryDate || o.invoiceDate;
        //       if (!shipmentDate) return '';
        //       
        //       try {
        //         let processedDate = String(shipmentDate);
        //         processedDate = processedDate.replace(/[年月日号]/g, '');
        //         
        //         const numericDateMatch = processedDate.match(/^(\d{4})(\d{2})(\d{2})$/);
        //         if (numericDateMatch) {
        //           const [, year, month, day] = numericDateMatch;
        //           processedDate = `${year}-${month}-${day}`;
        //         }
        //         
        //         const shipDate = new Date(processedDate);
        //         if (!isNaN(shipDate.getTime())) {
        //           const deliveryDate = new Date(shipDate);
        //           deliveryDate.setDate(shipDate.getDate() - 2);
        //           
        //           const y = deliveryDate.getFullYear();
        //           const m = String(deliveryDate.getMonth() + 1).padStart(2, '0');
        //           const d = String(deliveryDate.getDate()).padStart(2, '0');
        //           return `${y}-${m}-${d}`;
        //         }
        //       } catch(_) {}
        //       
        //       return String(shipmentDate);
        //     })();
        //     
        //     if (dateText) {
        //       const text = `交货期：${dateText}`;
        //       const style = { alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }, font: { size: 12, name: 'SimSun' } };
        //       addRow([text], style);
        //       ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);
        //       ws.getRow(rowIndex - 1).height = 25; // 设置行高
        //     }
        //   }
        // }
      }

      // 页脚：备注类信息（整行合并）
      const footerEl = preview.querySelector('.doc-footer');
      if (footerEl) {
        let prodNoteAdded = false;

        if (type === 'production') {
          // 生产通知单特殊处理：按新的四行布局格式导出
          const ex = o.extras || {};

          // 第一行：箱型信息
          const boxText = ex.boxType ? `箱型：以上货物装入 ${String(ex.boxType)} 集装箱` : '箱型：-';
          const boxStyle = {
            alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
            font: { size: 12, name: 'SimSun' } // 统一字体为宋体
          };
          addRow([boxText], boxStyle);
          ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);
          ws.getRow(rowIndex - 1).height = 25; // 增加行高与软件预览一致

          // 第二行：目的港和交货期（同行显示，用制表符分隔）
          const tradeTerm = ex.tradeTerm || 'CIF';
          const destText = o.shipTo ? `目的港：${tradeTerm} ${String(o.shipTo)}` : '目的港：-';

          const dateText = (function () {
            const shipmentDate = o.shipmentDate || ex.deliveryDate || o.invoiceDate;
            if (!shipmentDate) return '交货期：-';

            try {
              let processedDate = String(shipmentDate);
              processedDate = processedDate.replace(/[年月日号]/g, '');

              const numericDateMatch = processedDate.match(/^(\d{4})(\d{2})(\d{2})$/);
              if (numericDateMatch) {
                const [, year, month, day] = numericDateMatch;
                processedDate = `${year}-${month}-${day}`;
              }

              const shipDate = new Date(processedDate);
              if (!isNaN(shipDate.getTime())) {
                const deliveryDate = new Date(shipDate);
                deliveryDate.setDate(shipDate.getDate() - 2);

                const y = deliveryDate.getFullYear();
                const m = String(deliveryDate.getMonth() + 1).padStart(2, '0');
                const d = String(deliveryDate.getDate()).padStart(2, '0');
                return `交货期：${y}-${m}-${d}`;
              }
            } catch (_) { }

            return `交货期：${shipmentDate}`;
          })();

          const destDateText = `${destText}    ${dateText}`; // 使用多个空格分隔，增加间距
          const destDateStyle = {
            alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
            font: { size: 12, name: 'SimSun' } // 统一字体为宋体
          };
          addRow([destDateText], destDateStyle);
          ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);
          ws.getRow(rowIndex - 1).height = 25; // 增加行高与软件预览一致

          // 唛头说明信息（整行）- 与预览窗口保持一致，始终显示唛头说明标签
          // 注意：ex.marks 是产品明细中的唛头，ex.marksNote 是生产通知信息中的唛头说明
          let marksNoteContent = ex.marksNote ? String(ex.marksNote).replace(/<br\/>/g, '\n') : '';
          // 始终添加唛头说明行，与预览窗口显示保持一致
          const marksNoteText = marksNoteContent ? `唛头说明：${marksNoteContent}` : '唛头说明：';
          const marksStyle = {
            alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
            font: { size: 12, name: 'SimSun' } // 统一字体为宋体
          };
          addRow([marksNoteText], marksStyle);
          ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);

          const marksLines = marksNoteText.split(/\r?\n/).length;
          const marksRow = ws.getRow(rowIndex - 1);
          marksRow.height = Math.min(300, 25 * Math.max(1, marksLines)); // 调整行高基数

          // 生产通知备注（整行）- 始终显示标题，与预览窗口保持一致
          let noteText = '';
          if (ex.prodNote && String(ex.prodNote).trim()) {
            // 如果订单中有生产通知备注，使用实际内容并转换换行符
            noteText = String(ex.prodNote).replace(/<br\/>/g, '\n');
          }

          // 始终添加生产通知备注行，与预览窗口显示保持一致
          const prodNoteText = noteText ? `生产通知备注：\n${noteText}` : '生产通知备注：';
          const noteStyle = {
            alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
            font: { size: 12, name: 'SimSun' } // 统一字体为宋体
          };
          addRow([prodNoteText], noteStyle);
          ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);

          const prodNoteLines = prodNoteText.split(/\r?\n/).length;
          const prodNoteRow = ws.getRow(rowIndex - 1);
          prodNoteRow.height = Math.min(300, 25 * Math.max(1, prodNoteLines)); // 调整行高基数
        } else {
          // 其他单据类型的原有处理逻辑
          Array.from(footerEl.children).forEach(el => {
            const text = (el.innerText || el.textContent || '').trim();
            if (!text) return;
            const style = { alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, font: { size: 12 } };
            addRow([text], style);
            ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);
            // 根据列总宽度估算自动换行行数，增大备注行高，避免遮挡
            const totalChars = (ws.columns || []).reduce((s, c) => s + (c && c.width ? c.width : 10), 0);
            const plain = text.replace(/\r?\n/g, '');
            const wrapLines = Math.max(0, Math.ceil(plain.length / Math.max(1, totalChars)) - 1);
            const lines = text.split(/\r?\n/).length + wrapLines;
            const footerRow = ws.getRow(rowIndex - 1);
            footerRow.height = Math.min(300, 18 * Math.max(1, lines));
            if (/生产通知备注/.test(text)) prodNoteAdded = true;
          });

          // 若未包含交货期块，补充写入于箱型之后
          // 对于INVOICE和PACKING LIST，交货期已经在签章图片处理之前添加，这里跳过
          if (type !== 'invoice' && type !== 'packing') {
            const delivery = ex.deliveryDate || o.invoiceDate;
            if (delivery) {
              const text = `交货期： ${delivery}`;
              const style = { alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }, font: { size: 12 } };
              addRow([text], style);
              ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);
            }
          }

          // 兜底：如预览结构异常导致未解析备注，这里强制写入
          if (type === 'production' && ex.prodNote && !prodNoteAdded) {
            const text = `生产通知备注：\n${String(ex.prodNote)}`;
            const style = { alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, font: { size: 12 } };
            addRow([text], style);
            ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, nCols);
            const totalChars = (ws.columns || []).reduce((s, c) => s + (c && c.width ? c.width : 10), 0);
            const plain = text.replace(/\r?\n/g, '');
            const wrapLines = Math.max(0, Math.ceil(plain.length / Math.max(1, totalChars)) - 1);
            const lines = text.split(/\r?\n/).length + wrapLines;
            const backupRow = ws.getRow(rowIndex - 1);
            backupRow.height = Math.min(300, 18 * Math.max(1, lines));
          }
        }
      }

      // 生成Excel buffer（文件名已在外部生成）
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // 使用统一文件导出服务（支持 Tauri 文件对话框）
      const { FileExportService } = await import('../../services/file-export-service.js');
      await FileExportService.exportExcel(blob, fileName);

      console.log('[Excel导出] ✅ Excel导出成功:', fileName);

      // 返回订单信息用于后续状态更新
      return { order: o, type };
    }); // executeWithoutZoom结束

    // 自动更新订单状态
    const { order: orderData, type: exportedType } = await executeResult || {};
    if (orderData && exportedType) {
      await updateOrderStatusAfterExport(orderData, exportedType);
    }

  } catch (err) {
    console.error('[Excel导出] 失败:', err);
    alert('Excel导出失败，请重试或检查浏览器支持。');
  }
}

// Word导出功能
async function exportWord() {
  // 🔧 确保后端服务已启动（备用检查，正常情况下页面加载时已启动）
  try {
    const { backendManager } = await import('../../utils/backend-manager.js');
    await backendManager.ensureBackendWithNotification();
  } catch (backendErr) {
    console.error('[Word导出] 后端服务启动失败:', backendErr);
    window.NotificationSystem?.toast('导出服务启动失败，请稍后重试', 'error');
    return;
  }

  // 校验必要字段
  const order = currentOrder();
  if (!order || Object.keys(order).length === 0) {
    alert('未找到订单数据，无法导出。');
    return;
  }

  const type = docType();
  const missingFields = validateRequiredFields(order, type);

  if (missingFields.length > 0) {
    alert(`缺少必要信息，请重新录入：\n\n• ${missingFields.join('\n• ')}\n\n请在新建订单页面完善相关信息后再导出。`);
    return;
  }

  // 显示加载状态
  if (btnWord) {
    btnWord.disabled = true;
    btnWord.textContent = '导出中...';
  }

  try {
    if (!preview) {
      alert('预览区域未初始化');
      return;
    }

    console.log('[Word导出] 🎯 开始导出（所见即所得模式）');

    // 🎯 关键优化：在无缩放状态下获取内容，确保所见即所得
    let previewContent = await executeWithoutZoom(async () => {
      // 等待所有图片加载完成
      console.log('[Word导出] 等待图片加载...');
      await waitForImagesToLoad();
      console.log('[Word导出] ✓ 图片加载完成');

      // 获取HTML内容（此时zoom=1，尺寸准确，所见即所得）
      const html = preview.innerHTML;
      console.log('[Word导出] ✓ 获取到未缩放的预览内容');
      return html;
    });

    console.log('[Word导出] 原始HTML长度:', previewContent.length);

    // ========== 彻底清理策略（确保XML兼容性）==========

    // 使用DOM解析器来彻底清理无效属性
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = previewContent;

    // 移除所有以 @ 开头的属性和包含 @ 的属性
    const allElements = tempDiv.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = Array.from(el.attributes);
      attrs.forEach(attr => {
        // 移除所有以 @ 开头的属性（如 @w, @click 等）
        if (attr.name.startsWith('@') || attr.name.includes('@')) {
          el.removeAttribute(attr.name);
        }
        // 移除所有 data- 属性（可选）
        if (attr.name.startsWith('data-')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    // 移除signature容器
    const signatureContainers = tempDiv.querySelectorAll('.signature-container');
    signatureContainers.forEach(container => container.remove());

    // 获取清理后的HTML
    previewContent = tempDiv.innerHTML;

    // 额外的字符串清理（作为备用，处理可能遗漏的情况）
    // 使用更强大的正则表达式，匹配所有可能的 @ 属性格式
    previewContent = previewContent
      .replace(/\s+@[\w-]+(?:="[^"]*")?/gi, '')  // 移除 @属性名="值"
      .replace(/\s+@[\w-]+(?:='[^']*')?/gi, '')  // 移除 @属性名='值'
      .replace(/\s+@[\w-]+/gi, '')  // 移除单独的 @属性名（无引号）
      .replace(/\s+[a-zA-Z-]*@[a-zA-Z-]*="[^"]*"/gi, '')  // 移除属性名中包含@的属性
      .replace(/\s+[a-zA-Z-]*@[a-zA-Z-]*='[^']*'/gi, '')  // 移除属性名中包含@的属性（单引号）
      .replace(/\s+data-[a-z-]+="[^"]*"/gi, '')  // 移除 data- 属性
      .replace(/@[\w-]+/g, '');  // 最后一遍：移除所有剩余的 @属性（更激进）

    // 检查是否还有 @ 属性残留
    if (previewContent.includes('@')) {
      console.warn('[Word导出] ⚠️ 检测到仍有 @ 属性残留，进行二次清理');
      // 更激进的清理：移除所有包含 @ 的标签属性
      previewContent = previewContent.replace(/<([^>]+@[^>]*)>/gi, (match, attrs) => {
        // 移除所有包含 @ 的属性
        const cleaned = attrs.replace(/\s*@[\w-]+(?:="[^"]*"|='[^']*'|=\S+)?/gi, '')
          .replace(/\s*[a-zA-Z-]*@[a-zA-Z-]*(?:="[^"]*"|='[^']*'|=\S+)?/gi, '');
        return `<${cleaned}>`;
      });
    }

    console.log('[Word导出] 清理完成，HTML长度:', previewContent.length);
    console.log('[Word导出] 是否包含 @ 属性:', previewContent.includes('@') ? '是（警告）' : '否（正常）');

    // 在构建完整HTML前，最后一次清理（确保万无一失）
    previewContent = previewContent.replace(/@[\w-]+(?:="[^"]*"|='[^']*'|=\S+)?/gi, '');

    // 构建完整的HTML文档 - 使用完整的CSS样式确保所见即所得
    const completeHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* 全局样式 */
    body { 
      font-family: Arial, 'Times New Roman', sans-serif; 
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
    }
    
    /* 表格样式 */
    table { 
      border-collapse: collapse; 
      width: 100%; 
      border: 1px solid #333;
    }
    td, th { 
      border: 1px solid #333; 
      padding: 8px;
      vertical-align: middle;
    }
    th {
      background-color: #f8f9fa;
      font-weight: bold;
      text-align: center;
    }
    
    /* 文档头部样式 */
    .doc-header { 
      text-align: center;
      margin-bottom: 16px;
    }
    
    /* 标题样式 - SALES CONFIRMATION红色标题 */
    .doc-title { 
      font-size: 16pt; 
      font-weight: bold;
      text-align: center;
      margin: 12px 0;
    }
    .doc-title[style*="color: red"],
    .doc-title[style*="color:red"] {
      color: #DC143C !important; /* 红色 */
    }
    
    /* 公司名称样式 */
    .doc-company { 
      font-size: 14pt; 
      font-weight: bold;
      text-align: center;
      margin: 8px 0;
    }
    
    /* 副标题行样式 */
    .doc-subline {
      font-size: 10pt;
      margin: 4px 0;
    }
    
    /* 分栏布局 */
    .split {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    
    /* 加粗样式 */
    .fw-bold, strong, b { 
      font-weight: bold; 
    }
    
    /* 下划线样式 */
    [style*="text-decoration: underline"],
    [style*="text-decoration:underline"] {
      text-decoration: underline;
    }
    
    /* 文本对齐 */
    [style*="text-align: left"],
    [style*="text-align:left"] {
      text-align: left;
    }
    [style*="text-align: center"],
    [style*="text-align:center"] {
      text-align: center;
    }
    [style*="text-align: right"],
    [style*="text-align:right"] {
      text-align: right;
    }
    
    /* 页脚样式 */
    .doc-footer {
      margin-top: 16px;
    }
  </style>
</head>
<body>
  ${previewContent}
</body>
</html>`;

    console.log('[Word导出] 最终HTML长度:', completeHtml.length);

    // 获取CSRF token
    // 调用后端API生成Word文档
    console.log('[Word导出] 正在发送请求到后端...');
    // 使用 ApiService.request 以自动处理 Tauri URL 和 Auth Headers
    const response = await window.ApiService.request('/api/export/word', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // ApiService.request 会自动处理 credentials 和 CSRF
      body: JSON.stringify({
        html: completeHtml,  // 使用清理后的HTML
        fileName: fileName,
        docType: type  // 传递单据类型
      })
    });

    if (!response.ok) {
      let errorMessage = 'Word导出失败';
      try {
        const errorData = await response.json();
        console.error('服务器返回错误:', errorData);
        errorMessage = errorData.message || errorData.error || errorMessage;

        // 如果有详细的错误信息，记录到控制台
        if (errorData.type) {
          console.error('错误类型:', errorData.type);
        }
        if (errorData.stack) {
          console.error('错误堆栈:', errorData.stack);
        }
      } catch (e) {
        console.error('无法解析错误响应:', e);
      }
      throw new Error(errorMessage);
    }

    console.log('收到Word文档响应，开始下载...');

    // 获取返回的Word文档blob
    const blob = await response.blob();

    if (blob.size === 0) {
      throw new Error('生成的Word文档为空');
    }

    console.log('Word文档大小:', blob.size, 'bytes');

    // 使用统一文件导出服务（支持 Tauri 文件对话框）
    const fileName = generateFileName('.docx', order, type);
    const { FileExportService } = await import('../../services/file-export-service.js');
    await FileExportService.exportWord(blob, fileName);

    console.log('Word文档下载成功:', fileName);

    // 自动更新订单状态
    await updateOrderStatusAfterExport(order, type);

  } catch (err) {
    console.error('Word导出失败 - 完整错误:', err);
    console.error('错误消息:', err.message);
    console.error('错误堆栈:', err.stack);

    // 显示更友好的错误提示
    const errorMsg = err.message || '未知错误';
    alert(`Word导出失败\n\n错误信息：${errorMsg}\n\n请查看浏览器控制台了解详细信息，或联系技术支持。`);
  } finally {
    // 恢复按钮状态
    if (btnWord) {
      btnWord.disabled = false;
      btnWord.textContent = '导出 Word';
    }
  }
}

// 加载中文字体到jsPDF（仅本地加载）
async function loadChineseFont() {
  try {
    console.log('[中文字体] 从本地加载字体文件...');

    const localResponse = await fetch('/fonts/chinese.ttf');

    if (!localResponse.ok) {
      throw new Error('本地字体文件不存在或无法访问');
    }

    console.log('[中文字体] 本地字体文件找到，开始处理...');
    await processFont(localResponse);
    console.log('[中文字体] ✅ 本地字体加载成功');

  } catch (error) {
    console.error('[中文字体] ❌ 加载失败:', error.message);
    console.error('[中文字体] ⚠️ 无法加载本地字体文件');
    console.log('[中文字体] 💡 解决方法：');
    console.log('   1. 确认字体文件已存在: frontend/fonts/chinese.ttf');
    console.log('   2. 检查文件权限');
    console.log('   3. 刷新页面重试');
    console.log('');
    console.log('[中文字体] ℹ️ 当前将使用内置字体（中文会显示为方框）');
    window.chineseFontData = null;
  }
}

// 处理字体文件
async function processFont(response) {
  try {
    // 获取字体文件的ArrayBuffer
    const fontData = await response.arrayBuffer();

    if (!fontData || fontData.byteLength === 0) {
      throw new Error('字体文件为空');
    }

    console.log('[中文字体] 字体文件大小:', (fontData.byteLength / 1024 / 1024).toFixed(2), 'MB');

    // 转换为base64（分块处理避免栈溢出）
    const uint8Array = new Uint8Array(fontData);
    const chunkSize = 0x8000; // 32KB chunks
    let binary = '';

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    const base64Font = btoa(binary);
    console.log('[中文字体] Base64编码完成');

    // 将字体信息保存到全局（先保存，供后续使用）
    window.chineseFontData = {
      name: 'ChineseFont',
      file: 'ChineseFont.ttf',
      base64: base64Font
    };

    console.log('[中文字体] 字体数据已缓存到全局变量');

    // 测试注册字体（创建临时文档测试）
    try {
      const { jsPDF } = window.jspdf;
      const testDoc = new jsPDF();
      testDoc.addFileToVFS('ChineseFont.ttf', base64Font);
      testDoc.addFont('ChineseFont.ttf', 'ChineseFont', 'normal');
      console.log('[中文字体] 字体注册测试成功');
    } catch (testError) {
      console.warn('[中文字体] 字体注册测试失败（这不影响使用）:', testError.message);
    }

    console.log('[中文字体] 字体处理完成');

  } catch (error) {
    console.error('[中文字体] 处理字体文件时出错:', error);
    throw error;
  }
}

// 导出可编辑PDF功能 - 使用后端Puppeteer生成PDF
async function exportEditablePDF() {
  // 🔧 确保后端服务已启动（备用检查，正常情况下页面加载时已启动）
  try {
    const { backendManager } = await import('../../utils/backend-manager.js');
    await backendManager.ensureBackendWithNotification();
  } catch (backendErr) {
    console.error('[可编辑PDF] 后端服务启动失败:', backendErr);
    window.NotificationSystem?.toast('导出服务启动失败，请稍后重试', 'error');
    return;
  }

  // 校验必要字段
  const order = currentOrder();
  if (!order || Object.keys(order).length === 0) {
    window.NotificationSystem?.toast('未找到订单数据，无法导出。', 'warning');
    return;
  }

  const type = docType();
  const missingFields = validateRequiredFields(order, type);

  // 🎨 获取当前的间距模式
  const currentStyleMode = styleMode || 'standard';
  console.log('[可编辑PDF] 当前间距模式:', currentStyleMode);

  if (missingFields.length > 0) {
    window.NotificationSystem?.toast(`缺少必要信息，请重新录入：\n\n• ${missingFields.join('\n• ')}\n\n请在新建订单页面完善相关信息后再导出。`, 'warning');
    return;
  }

  // 显示加载状态
  if (btnEditablePDF) {
    btnEditablePDF.disabled = true;
    btnEditablePDF.textContent = '生成中...';
  }

  try {
    console.log('[可编辑PDF] 开始准备PDF内容...');

    // 确保公司信息已加载
    if (!companyCache && window.ApiService && ApiService.company && typeof ApiService.company.get === 'function') {
      companyCache = await ApiService.company.get();
    }

    // 获取预览内容
    const preview = document.getElementById('preview');
    if (!preview || !preview.innerHTML) {
      throw new Error('预览内容为空');
    }

    // 克隆预览内容以避免修改原始DOM
    const previewClone = preview.cloneNode(true);

    // 🔧 移除预览界面的装饰性边框（这些是为了美观添加的，不应出现在PDF中）
    previewClone.style.border = 'none';
    previewClone.style.boxShadow = 'none';
    previewClone.style.margin = '0';
    
    // 移除L型角标记元素
    previewClone.querySelectorAll('.margin-mark-bottom-left, .margin-mark-bottom-right').forEach(el => el.remove());

    // 🚀 优化：快速转换图片为base64
    console.log('[可编辑PDF] 开始转换图片...');
    const images = previewClone.querySelectorAll('img');

    // 使用Promise.allSettled以避免单个图片失败导致整体失败
    const imagePromises = Array.from(images).map(async (img) => {
      try {
        const src = img.src;
        // 跳过已经是base64的图片
        if (src.startsWith('data:')) return;

        const absoluteUrl = src.startsWith('http') ? src : new URL(src, window.location.origin).href;
        const response = await fetch(absoluteUrl);
        if (response.ok) {
          const blob = await response.blob();
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          img.src = base64;
        } else {
          img.remove();
        }
      } catch (error) {
        img.remove();
      }
    });

    await Promise.allSettled(imagePromises);
    console.log('[可编辑PDF] 图片处理完成');

    // 🔧 处理签名容器：移除loading状态或删除空容器
    const signatureContainers = previewClone.querySelectorAll('.signature-container');
    const originalSignatures = preview.querySelectorAll('.signature-container');

    signatureContainers.forEach((container, idx) => {
      const originalContainer = originalSignatures[idx];

      // 移除loading和error类
      container.classList.remove('loading', 'error');

      // 检查容器内是否有有效的图片
      const img = container.querySelector('img');
      const originalImg = originalContainer ? originalContainer.querySelector('img') : null;

      if (!img || !img.src || img.src.includes('data:') === false) {
        // 如果没有图片或图片未转为base64，完全移除这个容器
        console.log('[可编辑PDF] 移除空的签名容器');
        container.remove();
      } else {
        // 🚀 关键修复：显式写入图片尺寸，防止在PDF生成时恢复为原始大小
        if (originalImg) {
          const rect = originalImg.getBoundingClientRect();
          // 使用 offsetWidth/Height 或 getBoundingClientRect 确保获取到显示尺寸
          const width = originalImg.offsetWidth || rect.width;
          const height = originalImg.offsetHeight || rect.height;

          if (width > 0 && height > 0) {
            img.style.width = width + 'px';
            img.style.height = height + 'px';
            img.style.objectFit = 'contain';
            console.log(`[可编辑PDF] 设置签名尺寸: ${width}x${height}`);
          }
        }

        // 确保图片可见
        img.style.display = 'block';
        img.style.opacity = '1';
        container.style.background = 'transparent';
        container.style.border = 'none';
      }
    });
    console.log('[可编辑PDF] 已处理', signatureContainers.length, '个签名容器');

    // 🚀 优化：快速收集CSS样式
    let allCSS = '';
    try {
      const styleSheets = Array.from(document.styleSheets);
      allCSS = styleSheets
        .map(sheet => {
          try {
            // 改进：在 Tauri 环境下，href 可能以 tauri: 或 http://tauri.localhost 开头
            // 或者根本没有 href (内联样式)
            const isLocal = !sheet.href ||
              sheet.href.startsWith(window.location.origin) ||
              sheet.href.startsWith('tauri:') ||
              sheet.href.startsWith('http://tauri.localhost') ||
              sheet.href.startsWith('blob:');

            if (!isLocal) return '';

            return Array.from(sheet.cssRules || sheet.rules || [])
              .map(rule => rule.cssText).join('\n');
          } catch (e) {
            // 忽略跨域样式表错误
            return '';
          }
        })
        .join('\n');
    } catch (e) {
      console.warn('[可编辑PDF] CSS收集失败:', e);
    }

    // 🚀 优化：只复制关键元素的必要样式
    console.log('[可编辑PDF] 处理关键样式...');

    const copyKeyStyles = (selector, styles) => {
      const originalEls = preview.querySelectorAll(selector);
      const cloneEls = previewClone.querySelectorAll(selector);
      originalEls.forEach((el, i) => {
        if (cloneEls[i]) {
          const computed = window.getComputedStyle(el);
          styles.forEach(prop => {
            const value = computed[prop];
            if (value && value !== 'normal' && value !== 'none') {
              cloneEls[i].style[prop] = value;
            }
          });
        }
      });
    };

    // 增强：复制更多关键样式以确保布局稳定
    copyKeyStyles('.doc-company', ['fontSize', 'fontWeight', 'whiteSpace', 'textAlign', 'marginBottom']);
    copyKeyStyles('.doc-title', ['fontSize', 'fontWeight', 'color', 'textAlign', 'margin', 'padding']);
    copyKeyStyles('table', ['width', 'borderCollapse', 'border', 'marginTop', 'marginBottom']);
    copyKeyStyles('table th', ['fontSize', 'fontWeight', 'padding', 'backgroundColor', 'border', 'textAlign']);
    copyKeyStyles('table td', ['fontSize', 'padding', 'border', 'lineHeight', 'textAlign', 'verticalAlign']);
    copyKeyStyles('.signature-container', ['width', 'height', 'marginTop', 'display', 'justifyContent', 'alignItems']);
    copyKeyStyles('.doc-footer', ['marginTop', 'paddingTop', 'borderTop']);

    // 确保公司名称单行显示
    previewClone.querySelectorAll('.doc-company').forEach(el => {
      el.style.whiteSpace = 'nowrap';
      el.style.overflow = 'hidden';
      el.style.textOverflow = 'ellipsis';
    });

    console.log('[可编辑PDF] 样式处理完成');

    // 🎯 新方案：预览窗口已经是真实A4尺寸，无需处理缩放
    console.log('[可编辑PDF] 预览窗口使用真实A4尺寸，无需缩放转换');

    // 🎯 新方案：预览窗口已经包含所有最终样式，无需配置
    console.log('[可编辑PDF] 使用预览窗口原样式，无需间距配置');

    // 生成文件名
    const fileName = generateFileName('.pdf');
    const pdfTitle = fileName.replace(/\.[^/.]+$/, ''); // 移除扩展名，用于PDF标题

    // 🎯 直接使用预览窗口的HTML，无需任何缩放包裹
    const scaledContent = previewClone.outerHTML;

    const completeHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${pdfTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    /* 🔧 强制覆盖body背景色（避免紫色渐变背景） */
    html, body { 
      font-family: Arial, "Microsoft YaHei", sans-serif; 
      background: white !important; 
      background-color: white !important;
      background-image: none !important;
    }
    ${allCSS}
    /* 🎯 A4真实尺寸预览方案 - PDF导出专用样式 */
    #preview { 
      width: 210mm !important; 
      min-height: 297mm !important;
      padding: 10mm !important; 
      background: white !important; 
      box-sizing: border-box !important;
      /* 🔧 移除预览界面的装饰性边框和阴影 */
      border: none !important;
      box-shadow: none !important;
      margin: 0 !important;
    }
    /* 🔧 移除预览界面的L型角标记 */
    #preview::before,
    #preview::after {
      display: none !important;
      content: none !important;
    }
    /* 🔧 移除底部L型角标记 */
    #preview .margin-mark-bottom-left,
    #preview .margin-mark-bottom-right,
    .margin-mark-bottom-left,
    .margin-mark-bottom-right {
      display: none !important;
    }
    .doc-company { 
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* 隐藏所有loading相关样式 */
    .loading, .signature-loading, .loading::before, .loading::after { display: none !important; }
    .signature-container { background: transparent !important; border: none !important; }
    /* 🔧 强制所有容器背景为白色或透明 */
    .container, .invoice-preview, div[id*="preview"] { 
      background: white !important; 
      background-image: none !important;
    }
  </style>
</head>
<body>
  ${scaledContent}
</body>
</html>`;

    console.log('[可编辑PDF] 发送到后端生成PDF...');
    console.log('[可编辑PDF] HTML内容长度:', completeHtml.length);
    console.log('[可编辑PDF] 文件名:', fileName);

    // 检查 ApiService 是否可用
    if (!window.ApiService || typeof window.ApiService.request !== 'function') {
      console.error('[可编辑PDF] ApiService 不可用!', {
        ApiService: window.ApiService,
        requestType: typeof window.ApiService?.request
      });
      throw new Error('API服务未初始化，请刷新页面重试');
    }

    // 使用 ApiService.request 以自动处理 Tauri URL 和 Auth Headers
    console.log('[可编辑PDF] 正在发送请求到 /api/export/editable-pdf ...');
    const response = await window.ApiService.request('/api/export/editable-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // ApiService.request 会自动处理 credentials 和 CSRF
      body: JSON.stringify({
        html: completeHtml,
        fileName: fileName,
        spacingMode: currentStyleMode  // 传递间距模式给后端
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[可编辑PDF] API请求失败:', errorData);

      // 提取详细的错误信息
      const needInstall = errorData.needInstall || errorData.details?.needInstall;
      const chromeMissing = errorData.chromeMissing || errorData.details?.chromeMissing;
      const installMessage = errorData.message || errorData.details?.message || errorData.error || '服务器内部错误';

      // 处理浏览器相关错误（包括找不到、启动失败等）
      const isBrowserError = needInstall || chromeMissing || 
        errorData.error === 'CHROME_NOT_FOUND' || 
        errorData.error === 'PUPPETEER_NOT_INSTALLED' ||
        errorData.error === 'BROWSER_LAUNCH_FAILED';
      
      if (isBrowserError) {
        console.error('[可编辑PDF] 浏览器相关错误:', errorData.error, installMessage);
        
        // 显示具体的错误原因，并引导用户到“导出设置”配置浏览器路径
        try {
          const goSettings = await window.ModalDialog?.confirm?.(
            `PDF导出失败：${installMessage}\n\n建议：进入【系统设置 → 导出设置】手动指定 Edge (msedge.exe) 路径后重试。\n\n是否立即打开导出设置？`,
            { title: '可编辑PDF导出失败', icon: '⚠️', confirmText: '打开导出设置', cancelText: '稍后再说', width: '520px' }
          );
          if (goSettings) {
            // docs.html 是独立页面，直接跳转到主应用的设置页
            const isDocsPage = /\/docs\.html(\?|#|$)/i.test(String(window.location?.pathname || ''));
            if (isDocsPage) {
              window.location.href = 'index.html#/settings/export';
            } else {
              window.location.hash = '#/settings/export';
            }
          }
        } catch (_) { }

        window.NotificationSystem?.toast(
          `PDF导出失败: ${installMessage}`,
          'error',
          { duration: 15000 }
        );

        return; 
      }

      throw new Error(installMessage);
    }

    // 获取PDF blob
    const pdfBlob = await response.blob();

    console.log('[可编辑PDF] PDF生成成功，大小:', (pdfBlob.size / 1024).toFixed(2), 'KB');

    // 使用统一文件导出服务（支持 Tauri 文件对话框）
    const { FileExportService } = await import('../../services/file-export-service.js');
    await FileExportService.exportPDF(pdfBlob, fileName);

    // 自动更新订单状态
    await updateOrderStatusAfterExport(order, type);

  } catch (err) {
    console.error('[可编辑PDF] 导出失败:', err);
    window.NotificationSystem?.toast('可编辑PDF导出失败: ' + err.message, 'error');
  } finally {
    // 恢复按钮状态
    if (btnEditablePDF) {
      btnEditablePDF.disabled = false;
      btnEditablePDF.textContent = '导出可编辑PDF';
    }
  }
}

// 缓存客户信息
let customerCache = {};

// 获取客户信息
async function getCustomerInfo(customerId) {
  if (!customerId) return null;

  // 如果已缓存，直接返回
  if (customerCache[customerId]) {
    return customerCache[customerId];
  }

  try {
    const customer = await ApiService.customers.get(customerId);
    if (customer) {
      customerCache[customerId] = customer;
      return customer;
    }
  } catch (error) {
    console.error('获取客户信息失败:', error);
  }

  return null;
}

// 获取模板变量
function getTemplateVars(order, extras, customer, docType = null) {
  const o = order || {};
  const c = companyCache || {};
  const cust = customer || {};

  return {
    CompanyEN: c.companyNameEn || 'QINGDAO SHENGCHI PACKAGING PRODUCT CO.,LTD',
    CompanyCN: c.companyNameCn || '青岛盛驰包装制品有限公司',
    AddressEN: c.companyAddressEn || 'NO7 JIAODALU JISHAN INDUSTRIAL PARK YANGHE TOWN JIAOZHOU DISTRICT QINGDAO SHANDONG CHINA',
    AddressCN: c.companyAddressCn || '中国山东省青岛市胶州市洋河镇吉山工业园胶大路7号',
    TEL: c.companyTel || '',
    FAX: c.companyFax || '',
    TELFAX: [c.companyTel && `TEL: ${c.companyTel}`, c.companyFax && `FAX: ${c.companyFax}`].filter(Boolean).join(' / '),
    SignAt: (o && o.extras && o.extras.signAt) ? String(o.extras.signAt) : (o && o.signAt ? String(o.signAt) : (o && o.shipFrom ? String(o.shipFrom) : (c.signAt || ''))),
    AccountAndRiskOf: o.customerName || '',
    ContractNo: (() => {
      // 特殊规则：仅对 INVOICE 和 PACKING LIST，当客户为 SHIOYA CO.,LTD 时，CONTRACT No 仅显示订单号
      let contractNo = o.contractNo || o.orderNo || '';
      const customerName = o.customerName || '';
      const orderNo = (o && o.extras && o.extras.orderNo) ? String(o.extras.orderNo) : (o.orderNo || '');

      // 只在 INVOICE 和 PACKING LIST 中应用特殊规则
      if ((docType === 'invoice' || docType === 'packing') && customerName === 'SHIOYA CO.,LTD' && contractNo && orderNo) {
        // 检查合同号格式是否为 SC2025-228(NO.25684) 或类似格式
        const contractNoMatch = contractNo.match(/SC\d{4}-\d+\(NO\.\s*(\d+)\s*\)/i);
        if (contractNoMatch) {
          const contractOrderNo = contractNoMatch[1];
          // 如果合同号中的订单号与订单号字段匹配，则只显示订单号
          if (contractOrderNo === orderNo) {
            contractNo = orderNo;
          }
        }
      }

      return contractNo;
    })(),
    OrderNo: (o && o.extras && o.extras.orderNo) ? String(o.extras.orderNo) : (o.orderNo || ''),
    InvoiceNo: o.invoiceNo || '',
    Date: (o && o.invoiceDate) ? String(o.invoiceDate) : ((o.updatedAt || o.createdAt) ? new Date(o.updatedAt || o.createdAt).toISOString().slice(0, 10) : ''),
    From: o.shipFrom || '',
    To: o.shipTo || '',
    BLNo: o.blNo || '',
    ShippedPerSs: o.shippedPerSs || '',
    ShipFrom: o.shipFrom || '',
    ShipTo: o.shipTo || '',
    ShipmentDate: (o && o.invoiceDate) ? String(o.invoiceDate) : ((o.updatedAt || o.createdAt) ? new Date(o.updatedAt || o.createdAt).toISOString().slice(0, 10) : ''),
    CustomerName: o.customerName || '',
    // 客户信息
    CustomerAddress: cust.address || '',
    CustomerTel: cust.tel || '',
    CustomerFax: cust.fax || '',
    // 客户电话传真组合（只有存在时才显示）
    CustomerTelFax: [cust.tel && `TEL:${cust.tel}`, cust.fax && `FAX:${cust.fax}`].filter(Boolean).join(' ')
  };
}

// 生成Word文档内容
async function generateWordContent(order, extras, docType) {
  // 确保docx库已加载并可用
  if (!window.docx) {
    throw new Error('docx库未加载');
  }

  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, VerticalAlign } = window.docx;

  const content = [];

  // 获取客户信息
  let customer = null;
  if (order && order.customerId) {
    customer = await getCustomerInfo(order.customerId);
  }

  const vars = getTemplateVars(order, extras, customer, docType);

  // 添加公司信息表头 - 与预览窗口完全一致
  content.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "QINGDAO SHENGCHI PACKAGING PRODUCT CO.,LTD",
          bold: true,
          size: 28, // 14pt，与预览窗口一致
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "NO7 JIAODALU JISHAN INDUSTRIAL PARK YANGHE TOWN JIAOZHOU DISTRICT QINGDAO SHANDONG CHINA",
          size: 18, // 9pt，与预览窗口一致
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "TEL: 0532-83161772",
          size: 20, // 10pt，与预览窗口一致
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "FAX: 0532-83161772",
          size: 20, // 10pt，与预览窗口一致
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "DATE: 2025-08-08",
          size: 20, // 10pt，与预览窗口一致
        }),
      ],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
    })
  );

  // 添加单据标题 - 与预览窗口完全一致
  const titleMap = {
    'production': '生产通知单',
    'sales': 'SALES CONFIRMATION',
    'invoice': 'INVOICE',
    'packing': 'PACKING LIST',
    'pickup': '拉货通知'
  };

  content.push(
    new Paragraph({
      children: [
        new TextRun({
          text: titleMap[docType] || '单据',
          bold: true,
          size: 32, // 16pt，与预览窗口一致
          color: (docType === 'invoice' || docType === 'packing') ? 'FF0000' : '000000',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // SALES CONFIRMATION特有的表头信息
  if (docType === 'sales') {
    // 添加右上角的合同号和日期信息表格
    const topRightTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "", size: 20 })],
              })],
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: {},
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: `CONTRACT NO: ${vars.ContractNo || 'SC2025/154'}`, size: 20 })],
                alignment: AlignmentType.RIGHT,
              })],
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: {},
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "", size: 20 })],
              })],
              borders: {},
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: `DATE: ${order.orderDate || '2025-08-08'}`, size: 20 })],
                alignment: AlignmentType.RIGHT,
              })],
              borders: {},
            }),
          ],
        }),
      ],
    });
    content.push(topRightTable);
    content.push(new Paragraph({ text: "", spacing: { after: 200 } }));

    // 添加TO MESSRS和其他表头信息
    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "TO MESSRS:", bold: true, size: 20 })],
              })],
              width: { size: 25, type: WidthType.PERCENTAGE },
              borders: {},
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "SIGN AT : QINGDAO, CHINA", size: 20 })],
                alignment: AlignmentType.RIGHT,
              })],
              width: { size: 75, type: WidthType.PERCENTAGE },
              borders: {},
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: `${order.customerName || 'DAINEN TRADING CO.,LTD'}`, size: 20 })],
              })],
              borders: {},
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: `ORDER NO: ${order.orderNo || 'DKBQDSCO807L-250927NHA'}`, size: 20 })],
                alignment: AlignmentType.RIGHT,
              })],
              borders: {},
            }),
          ],
        }),
      ],
    });
    content.push(headerTable);
    content.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  // 添加表头信息表格 - 仅适用于INVOICE和PACKING LIST
  if (docType === 'invoice' || docType === 'packing') {
    const shipmentDateText = order.shipmentDate || (order.extras && order.extras.deliveryDate) || order.invoiceDate || '';

    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: `CONTRACT No: ${vars.ContractNo}`, size: 24 })] })],
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: `B/L No.: ${vars.BLNo}`, size: 24 })] })],
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: `INVOICE NO: ${vars.InvoiceNo}`, size: 24 })] })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: `SHIPMENT DATE: ${shipmentDateText}`, size: 24 })] })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: `FROM: ${vars.From}`, size: 24 })] })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: `TO: ${vars.To}`, size: 24 })] })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: `SHIPPED PER S.S.: ${vars.ShippedPerSs}`, size: 24 })] })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
              columnSpan: 2,
            }),
          ],
        }),
      ],
    });
    content.push(headerTable);

    // 添加客户信息和联系方式 - 与预览窗口完全一致
    const customerParagraphs = [
      new Paragraph({ text: "", spacing: { after: 200 } }),
      new Paragraph({
        children: [
          new TextRun({
            text: `ACCOUNT AND RISK OF: ${vars.AccountAndRiskOf}`,
            bold: true,
            size: 24,
          }),
        ],
        spacing: { after: 60 },
      })
    ];

    // 如果有客户地址，添加地址段落
    if (vars.CustomerAddress) {
      customerParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: vars.CustomerAddress,
              size: 22,
            }),
          ],
          spacing: { after: 60 },
        })
      );
    }

    // 如果有客户电话或传真，添加联系方式段落
    if (vars.CustomerTelFax) {
      customerParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: vars.CustomerTelFax,
              size: 22,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    } else {
      // 如果没有联系方式，最后一个段落的间距仍然设置为200
      if (customerParagraphs.length > 1) {
        customerParagraphs[customerParagraphs.length - 1].spacing = { after: 200 };
      }
    }

    content.push(...customerParagraphs);
  }

  // 添加产品信息表格
  if (docType === 'sales') {
    // SALES CONFIRMATION特有的产品表格结构
    const productTableRows = [
      // 表头
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: "COMMODITY AND SPECIFICATION", bold: true, size: 18 })],
              alignment: AlignmentType.CENTER,
            })],
            shading: { fill: "F0F0F0" },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: "QUANTITY", bold: true, size: 18 })],
              alignment: AlignmentType.CENTER,
            })],
            shading: { fill: "F0F0F0" },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: "UNIT PRICE & TERMS", bold: true, size: 18 })],
              alignment: AlignmentType.CENTER,
            })],
            shading: { fill: "F0F0F0" },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: "AMOUNT", bold: true, size: 18 })],
              alignment: AlignmentType.CENTER,
            })],
            shading: { fill: "F0F0F0" },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      }),
      // PP CONTAINER BAG行
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: "PP CONTAINER BAG", size: 16 })],
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: "", size: 16 })],
              alignment: AlignmentType.CENTER,
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: "", size: 16 })],
              alignment: AlignmentType.CENTER,
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: "", size: 16 })],
              alignment: AlignmentType.CENTER,
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      }),
    ];

    // 获取货币和贸易条款 - 与HTML预览保持一致
    const currency = (order && order.extras && (order.extras.currency || order.extras.unitPriceCurrency)) ? String(order.extras.currency || order.extras.unitPriceCurrency).toUpperCase() : 'USD';
    const terms = (order && order.extras && (order.extras.terms || order.extras.priceTerms || order.extras.incoterms)) ? String(order.extras.terms || order.extras.priceTerms || order.extras.incoterms) : '';

    // 添加订单中的产品数据 - 与HTML预览保持完全一致
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach((item, idx) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || item.price || 0);
        const amount = qty * price;

        // 构建产品规格文本 - 完全按照HTML预览的逻辑
        const specTextParts = [];

        // 1) 型号（加粗） - 编号 + 型号
        const modelText = item.model || '';
        if (modelText) {
          specTextParts.push(new TextRun({
            text: `${idx + 1}) ${modelText}`,
            bold: true,
            size: 22
          }));
          specTextParts.push(new TextRun({ text: '\n', size: 22 }));
        }

        // 2) 包装信息 - 与HTML预览完全一致的计算逻辑
        // 注意：item.packing 可能是 "220条/捆包" 格式，需要解析数字部分
        const packValRaw = (function () {
          // 如果 packing 是字符串格式（如 "220条/捆包"），尝试提取数字
          if (item.packing != null && item.packing !== '') {
            const packingStr = String(item.packing);
            // 尝试匹配 "数字条/单位" 格式，提取数字部分
            const match = packingStr.match(/^(\d+(?:\.\d+)?)/);
            if (match) {
              const num = Number(match[1]);
              if (Number.isFinite(num) && num > 0) {
                return num;
              }
            }
            // 如果匹配失败，尝试直接转换为数字
            const num = Number(packingStr);
            if (Number.isFinite(num) && num > 0) {
              return num;
            }
          }
          // 如果 packing 不可用，从 quantity 和 packages 计算
          const q = Number(item.quantity || 0);
          const p = Number(item.packages || 0);
          if (Number.isFinite(q) && Number.isFinite(p) && p > 0) {
            return Math.round((q / p) * 100) / 100;
          }
          return NaN;
        })();

        if (Number.isFinite(packValRaw) && packValRaw > 0) {
          const packNumStr = String(packValRaw.toFixed(2)).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
          // 判断包装单位
          const getPluralUnit = (val, singular) => {
            if (val > 1) {
              return singular === 'PALLET' ? 'PALLETS' :
                singular === 'SACK' ? 'SACKS' :
                  singular === 'BALE' ? 'BALES' : singular;
            }
            return singular;
          };
          const unitEng = (item.unit === '托盘') ? getPluralUnit(packValRaw, 'PALLET') :
            ((item.unit === '捆包') ? getPluralUnit(packValRaw, 'SACK') :
              ((item.unit === '件') ? getPluralUnit(packValRaw, 'BALE') : ''));
          const packText = unitEng ? `${packNumStr}PCS/${unitEng}` : `${packNumStr}PCS`;

          // 组合包装信息和批号（同一行）
          const orderProductType = (order.productType ?? order.product_type) || 1;
          if (orderProductType === 2 && item.labelBatchNo) {
            // B类品：包装 + 空格 + 批号
            specTextParts.push(new TextRun({ text: packText, size: 22 }));
            specTextParts.push(new TextRun({ text: '                    ', size: 22 })); // 空格分隔
            specTextParts.push(new TextRun({ text: `SC:${item.labelBatchNo}`, bold: true, size: 22 }));
          } else {
            // 非B类品：只有包装
            specTextParts.push(new TextRun({ text: packText, size: 22 }));
          }

          // 3) 清洁度（新的一行）
          if (item.cleanliness) {
            specTextParts.push(new TextRun({ text: '\n', size: 22 })); // 换行
            specTextParts.push(new TextRun({ text: `清洁度 ${item.cleanliness}`, size: 22 }));
          }
        }

        // 构建UNIT PRICE & TERMS列的内容
        const priceParts = [
          new TextRun({ text: `${currency}${price ? price.toFixed(2) : '0.00'}`, size: 22 })
        ];
        if (terms) {
          priceParts.push(new TextRun({ text: '\n', size: 22 }));
          priceParts.push(new TextRun({ text: terms, size: 20 }));
        }

        productTableRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  children: specTextParts,
                })],
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
                },
                verticalAlign: VerticalAlign.CENTER,
              }),
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: `${qty || 0}PCS`, size: 22 })],
                  alignment: AlignmentType.CENTER,
                })],
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
                },
                verticalAlign: VerticalAlign.CENTER,
              }),
              new TableCell({
                children: [new Paragraph({
                  children: priceParts,
                  alignment: AlignmentType.CENTER,
                })],
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
                },
                verticalAlign: VerticalAlign.CENTER,
              }),
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: `${currency}${amount ? amount.toFixed(2) : '0.00'}`, size: 22 })],
                  alignment: AlignmentType.CENTER,
                })],
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
                },
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
          })
        );
      });
    }

    // 添加合计行 - SHIPMENT BY FCL
    const boxType = (order && order.extras && order.extras.boxType) ? String(order.extras.boxType) : '';
    const totalPieces = order.items ? order.items.reduce((sum, it) => sum + Number(it.quantity || 0), 0) : 0;
    const totalAmount = order.items ? order.items.reduce((sum, it) => {
      const qty = Number(it.quantity || 0);
      const price = Number(it.unitPrice || it.price || 0);
      return sum + (qty * price);
    }, 0) : 0;

    productTableRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: boxType && boxType !== '其他' ? `SHIPMENT BY ${boxType.replace('GP', '')}'FCL` : '', size: 22 })],
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: `${totalPieces}PCS`, size: 22 })],
              alignment: AlignmentType.CENTER,
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: '', size: 22 })],
              alignment: AlignmentType.CENTER,
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: `${currency}${totalAmount.toFixed(2)}`, size: 22 })],
              alignment: AlignmentType.CENTER,
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
            },
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      })
    );

    const productTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [5500, 2000, 2000, 2000], // 设置列宽：规格列更宽，其他列适中
      rows: productTableRows,
    });
    content.push(productTable);
  } else {
    // 其他单据类型的产品表格
    const tableEl = preview.querySelector('table.table');
    if (tableEl) {
      const headerCells = Array.from(tableEl.querySelectorAll('thead th'));
      const bodyRows = Array.from(tableEl.querySelectorAll('tbody tr'));

      const tableRows = [];

      // 表头
      if (headerCells.length > 0) {
        tableRows.push(
          new TableRow({
            children: headerCells.map(th =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: th.textContent.trim(), bold: true, size: 20 })],
                  alignment: AlignmentType.CENTER,
                })],
                shading: { fill: "F0F0F0" },
              })
            ),
          })
        );
      }

      // 表格内容
      bodyRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length > 0) {
          tableRows.push(
            new TableRow({
              children: cells.map(td =>
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: td.textContent.trim(), size: 18 })],
                  })],
                })
              ),
            })
          );
        }
      });

      if (tableRows.length > 0) {
        const productTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows,
        });
        content.push(productTable);
      }
    }
  }

  // 拉货通知特有的内容
  if (docType === 'pickup') {
    content.push(new Paragraph({ text: "", spacing: { after: 200 } }));

    // 添加TO信息
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `TO: ${extras.toRecipient || '包装'}`,
            size: 24,
          }),
        ],
        spacing: { after: 200 },
      })
    );

    // 添加拍照要求（仅在有内容时显示）
    const photoReq = extras.pickupPhotoNote || extras.photoRequirement || extras.photoRemark || '';
    if (photoReq) {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `* 拍照：${photoReq}`,
              size: 22,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }

    // 添加生产单号 + 箱位
    const containerPositionText = extras.containerPosition || '';
    const productionNoChildren = [
      new TextRun({
        text: `生产单号：${order.contractNo || order.orderNumber || 'SC2025/175'}`,
        size: 24,
      })
    ];

    if (containerPositionText) {
      productionNoChildren.push(
        new TextRun({
          text: `        ${containerPositionText}`,
          size: 24,
          bold: true,
          highlight: 'yellow',
        })
      );
    }

    content.push(
      new Paragraph({
        children: productionNoChildren,
        spacing: { after: 250 },
      })
    );

    // 添加货物品名标题
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "货物品名：",
            size: 24,
            bold: true,
          }),
        ],
        spacing: { after: 150 },
      })
    );

    // 添加产品信息列表
    // 计算PACKING LIST的统计数据（用于总件数和毛重）
    const items = order.items || [];
    const units = items.map(it => it.unit || '').filter(unit => unit);
    const uniqueUnits = [...new Set(units)];
    let packageUnitChinese = '件';

    // 如果所有产品的件数单位相同，则使用对应的中文单位
    if (uniqueUnits.length === 1 && uniqueUnits[0]) {
      const unit = uniqueUnits[0];
      if (unit === '托盘') {
        packageUnitChinese = '托盘';
      } else if (unit === '捆包') {
        packageUnitChinese = '捆包';
      } else if (unit === '件') {
        packageUnitChinese = '件';
      } else if (unit === '托') {
        packageUnitChinese = '托';
      }
    }

    const totalPackages = items.reduce((sum, it) => sum + Number(it.packages || 0), 0);
    const totalQuantity = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

    // 计算毛重（GROSS WEIGHT）- 与PACKING LIST保持一致
    // 获取产品类型（从订单或产品项）
    const productType = (o.productType ?? o.product_type) || 1;
    const totalGrossWeight = items.reduce((sum, it) => {
      const qty = Number(it.quantity || 0);
      const actualWeight = it.actualWeight ? Number(it.actualWeight) : null;
      if (actualWeight !== null && !isNaN(actualWeight) && actualWeight > 0) {
        const netWeight = Math.round(actualWeight * qty);
        let tareWeight = 0;
        const packages = Number(it.packages || 0);
        // 获取包皮布字段（可能存储在 it.wrappingCloth 或 it.extras.wrappingCloth 中）
        const wrappingCloth = it.wrappingCloth || (it.extras && it.extras.wrappingCloth) || '';
        // C类品（productType === 3）且包皮布为"不要"且件数单位为"件"时，使用0.045系数
        if (productType === 3 && wrappingCloth === '不要' && it.unit === '件') {
          tareWeight = 0.045 * packages;
        } else if (it.unit === '件') {
          tareWeight = 0.25 * packages;
        } else if (it.unit === '托盘' || it.unit === '托') {
          tareWeight = 15 * packages;
        } else if (it.unit === '捆包') {
          tareWeight = 10 * packages;
        }
        return sum + Math.round(netWeight + tareWeight);
      }
      return sum;
    }, 0);

    if (order.items && order.items.length > 0) {
      order.items.forEach((item, index) => {
        const packages = Number(item.packages || 0);
        const qty = Number(item.quantity || 0);

        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${index + 1})`,
                size: 22,
                bold: true,
              }),
              new TextRun({
                text: `        ${item.model || ''}`,
                size: 22,
              }),
              new TextRun({
                text: `        ${packages} ${item.unit || '托'}-------------${qty} 条`,
                size: 22,
              }),
            ],
            spacing: { after: 120 },
          })
        );
      });
    }

    content.push(new Paragraph({ text: "", spacing: { after: 100 } }));

    // 添加总件数和毛重
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `总件数：${totalPackages} ${packageUnitChinese} ，${totalQuantity} 条`,
            size: 22,
          }),
          new TextRun({
            text: `        毛重：${totalGrossWeight}KGS`,
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      })
    );

    // 添加提单号
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `提单号：${order.blNo || ''}`,
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      })
    );

    // 添加船名/航次
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `船名/航次：${order.shippedPerSs || ''}`,
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      })
    );

    // 添加尺码 + 目的港
    const volumeText = extras.boxVolume || '';

    // 目的港转换为中文
    const destinationRaw = order.shipTo || '';
    const destinationMap = {
      'KOBE': '神户',
      'OSAKA': '大阪',
      'TOKYO': '东京',
      'YOKOHAMA': '横滨',
      'NAGOYA': '名古屋',
      'BUSAN': '釜山',
      'INCHEON': '仁川',
      'SHANGHAI': '上海',
      'NINGBO': '宁波',
      'QINGDAO': '青岛',
      'TIANJIN': '天津',
      'DALIAN': '大连',
      'XIAMEN': '厦门',
      'SHENZHEN': '深圳',
      'GUANGZHOU': '广州',
      'HONG KONG': '香港',
      'SINGAPORE': '新加坡',
      'BANGKOK': '曼谷',
      'HO CHI MINH': '胡志明市',
      'MANILA': '马尼拉',
      'JAKARTA': '雅加达'
    };
    const destination = destinationMap[destinationRaw.toUpperCase()] || destinationRaw;

    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `尺码：${volumeText}`,
            size: 22,
          }),
          new TextRun({
            text: `        目的港：${destination}`,
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      })
    );

    // 添加拉货日期
    let pickupDateTime = '';
    if (order.pickupDate) {
      const date = new Date(order.pickupDate);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      pickupDateTime = `${year}年${month}月${day}日`;
      if (order.pickupTime) {
        pickupDateTime += `${order.pickupTime}`;
      }
    }

    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `拉货日：${pickupDateTime}`,
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      })
    );

    // 添加拉货备注
    const pickupRemark = extras.pickupRemark || '';
    if (pickupRemark) {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `拉货备注：${pickupRemark}`,
              size: 22,
            }),
          ],
          spacing: { after: 400 },
        })
      );
    } else {
      content.push(new Paragraph({ text: "", spacing: { after: 400 } }));
    }

    // 添加签名
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "刘萍萍",
            size: 22,
          }),
        ],
        alignment: AlignmentType.RIGHT,
      })
    );
  }

  // SALES CONFIRMATION特有的底部信息
  if (docType === 'sales') {
    content.push(new Paragraph({ text: "", spacing: { after: 200 } }));

    // 计算总金额
    let totalAmount = 0;
    if (order.items && Array.isArray(order.items)) {
      totalAmount = order.items.reduce((sum, item) => {
        return sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0));
      }, 0);
    }

    // 添加底部信息表格
    const bottomTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "TOTAL VALUE:", bold: true, size: 20 })],
              })],
              width: { size: 30, type: WidthType.PERCENTAGE },
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: `USD${totalAmount.toFixed(2)}`, size: 20 })],
              })],
              width: { size: 70, type: WidthType.PERCENTAGE },
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "SHIPMENT DATE:", bold: true, size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: order.deliveryDate || "TBD", size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "DESTINATION:", bold: true, size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: order.destination || "CIF JAPAN", size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "PAYMENT:", bold: true, size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: order.paymentTerms || "BY T/T WITHIN 15 DAYS AFTER B/L DATE", size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "SPECIAL CLAUSE:", bold: true, size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: order.specialClause || "INSURANCE TO BE COVERED BY BUYER", size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: "", size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: `REMARKS: ${order.remarks || ""}`, size: 20 })],
              })],
              borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' } },
            }),
          ],
        }),
      ],
    });
    content.push(bottomTable);

    // 添加签名区域
    content.push(
      new Paragraph({ text: "", spacing: { after: 300 } }),
      new Paragraph({
        children: [
          new TextRun({
            text: "青岛盛驰包装制品有限公司",
            size: 20,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "THE BUYER                                    THE SELLER",
            size: 20,
          }),
        ],
        alignment: AlignmentType.CENTER,
      })
    );
  } else {
    // 其他单据类型的签名区域
    content.push(
      new Paragraph({ text: "", spacing: { after: 480 } }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Authorized Signature: _________________________",
            size: 20,
          }),
        ],
        alignment: AlignmentType.RIGHT,
      })
    );
  }

  return content;
}

// 显示单据表头信息汇总
function showDocHeaderInfo(type) {
  const docHeaderInfo = document.getElementById('docHeaderInfo');
  const docHeaderContent = document.getElementById('docHeaderContent');

  if (!docHeaderInfo || !docHeaderContent) return;

  // 获取当前订单数据
  const o = currentOrder();
  const c = getCompanyInfo();
  const ex = (o && o.extras && typeof o.extras === 'object') ? o.extras : {};

  // 辅助函数：检查值是否为空并返回带样式的HTML
  function formatField(label, value, isRequired = false) {
    const isEmpty = !value || String(value).trim() === '';
    const displayValue = isEmpty ? '未填写' : String(value);
    const style = isEmpty ? 'color: #e74c3c; font-weight: bold;' : 'color: #2c3e50;';
    const requiredMark = isRequired ? '<span style="color: #e74c3c;">*</span>' : '';
    return `<div style="margin-bottom: 6px; padding: 4px 8px; border-radius: 4px; background: ${isEmpty ? '#ffeaea' : '#f8f9fa'};">
        <span style="font-weight: 600;">${label}${requiredMark}：</span>
        <span style="${style}">${displayValue}</span>
      </div>`;
  }

  // 计算合计金额
  const totalAmount = (() => {
    if (o.totalUSD && !isNaN(parseFloat(o.totalUSD))) {
      return parseFloat(o.totalUSD).toFixed(2) + ' USD';
    }
    // 如果没有总金额，尝试从产品明细计算
    const items = Array.isArray(o.items) ? o.items : [];
    let total = 0;
    items.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      total += qty * price;
    });
    return total > 0 ? total.toFixed(2) + ' USD' : '';
  })();

  let headerInfo = '';

  switch (type) {
    case 'sales':
      // CONFIRMATION单据表头信息汇总：客户名称、合同号、订单号、发货时间、合计金额
      headerInfo = `
          <div style="margin-bottom: 12px; padding: 8px; background: #e3f2fd; border-radius: 6px;">
            <strong style="color: #1976d2;">SALES CONFIRMATION 表头信息汇总</strong>
          </div>
          ${formatField('客户名称', o.customerName, true)}
          ${formatField('合同号', o.contractNo || o.orderNo)}
          ${formatField('订单号', (ex.orderNo || o.orderNo))}
          ${formatField('发货时间', o.shipmentDate)}
          ${formatField('合计金额', totalAmount)}
          <div style="color: #666; font-size: 12px; margin-top: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
            <i>💡 红色显示的字段表示内容为空，导出前请及时填写</i>
          </div>
        `;
      break;
    case 'production':
      // 生产通知单表头信息汇总：合同号、箱型、目的港、交货期
      const deliveryDate = (() => {
        const shipmentDate = o.shipmentDate || ex.deliveryDate || o.invoiceDate;
        if (!shipmentDate) return '';

        try {
          let processedDate = String(shipmentDate);
          processedDate = processedDate.replace(/[年月日号]/g, '');

          const numericDateMatch = processedDate.match(/^(\d{4})(\d{2})(\d{2})$/);
          if (numericDateMatch) {
            const [, year, month, day] = numericDateMatch;
            processedDate = `${year}-${month}-${day}`;
          }

          const shipDate = new Date(processedDate);
          if (!isNaN(shipDate.getTime())) {
            const deliveryDate = new Date(shipDate);
            deliveryDate.setDate(shipDate.getDate() - 2);

            const y = deliveryDate.getFullYear();
            const m = String(deliveryDate.getMonth() + 1).padStart(2, '0');
            const d = String(deliveryDate.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
          }
        } catch (_) { }

        return shipmentDate;
      })();

      headerInfo = `
          <div style="margin-bottom: 12px; padding: 8px; background: #e3f2fd; border-radius: 6px;">
            <strong style="color: #1976d2;">生产通知单 表头信息汇总</strong>
          </div>
          ${formatField('合同号', o.contractNo || o.orderNo)}
          ${formatField('箱型', ex.boxType)}
          ${formatField('目的港', o.shipTo)}
          ${formatField('交货期', deliveryDate)}
          <div style="color: #666; font-size: 12px; margin-top: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
            <i>💡 红色显示的字段表示内容为空，导出前请及时填写</i>
          </div>
        `;
      break;
    case 'invoice':
      // INVOICE单据表头信息汇总：客户名称、合同号、提单号、发票号、发货日期、发货港、到达港、合计金额
      headerInfo = `
          <div style="margin-bottom: 12px; padding: 8px; background: #e3f2fd; border-radius: 6px;">
            <strong style="color: #1976d2;">INVOICE 表头信息汇总</strong>
          </div>
          ${formatField('客户名称', o.customerName, true)}
          ${formatField('合同号', o.contractNo || o.orderNo)}
          ${formatField('提单号', o.blNo)}
          ${formatField('发票号', o.invoiceNo)}
          ${formatField('发货日期', o.shipmentDate || o.invoiceDate)}
          ${formatField('发货港', o.shipFrom)}
          ${formatField('到达港', o.shipTo)}
          ${formatField('合计金额', totalAmount)}
          <div style="color: #666; font-size: 12px; margin-top: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
            <i>💡 红色显示的字段表示内容为空，导出前请及时填写</i>
          </div>
        `;
      break;
    case 'packing':
      // PACKING LIST单据表头信息汇总：客户名称、合同号、提单号、发票号、发货日期、发货港、到达港、货运号、箱型、箱型体积、净重、毛重
      const extras = o.extras || {};

      // 计算NET WEIGHT和GROSS WEIGHT合计
      const items = Array.isArray(o.items) ? o.items : [];
      let totalNetWeight = 0;
      let totalGrossWeight = 0;

      items.forEach(it => {
        const qty = Number(it.quantity || 0);
        const packages = Number(it.packages || 0);

        // 计算NET WEIGHT：实际重量 × 数量
        const actualWeight = it.actualWeight ? Number(it.actualWeight) : 0;
        if (actualWeight > 0) {
          totalNetWeight += Math.round(actualWeight * qty);
        }

        // 计算GROSS WEIGHT：净重 + 皮重
        const unit = it.unit || '';
        let tareWeight = 0;

        // 计算皮重：根据件数单位、产品类型和包皮布选择计算
        // 获取产品类型（从订单或产品项）
        const productType = (o.productType ?? o.product_type) || (it.productType ?? it.product_type) || 1;
        // 获取包皮布字段（可能存储在 it.wrappingCloth 或 it.extras.wrappingCloth 中）
        const wrappingCloth = it.wrappingCloth || (it.extras && it.extras.wrappingCloth) || '';
        // C类品（productType === 3）且包皮布为"不要"且件数单位为"件"时，使用0.045系数
        if (productType === 3 && wrappingCloth === '不要' && unit === '件') {
          tareWeight = Math.round(0.045 * packages);
        } else if (unit === '件') {
          tareWeight = Math.round(0.25 * packages);
        } else if (unit === '托盘') {
          tareWeight = Math.round(15 * packages);
        } else if (unit === '捆包') {
          tareWeight = Math.round(10 * packages);
        }

        const netWeight = actualWeight > 0 ? Math.round(actualWeight * qty) : 0;
        const grossWeight = netWeight + tareWeight;
        totalGrossWeight += grossWeight;
      });

      // 格式化重量显示，为0时显示红色
      function formatWeight(label, weight, isRequired = false) {
        const isEmpty = weight === 0;
        const displayValue = isEmpty ? '0 KGS' : `${weight} KGS`;
        const style = isEmpty ? 'color: #e74c3c; font-weight: bold;' : 'color: #2c3e50;';
        const requiredMark = isRequired ? '<span style="color: #e74c3c;">*</span>' : '';
        return `<div style="margin-bottom: 6px; padding: 4px 8px; border-radius: 4px; background: ${isEmpty ? '#ffeaea' : '#f8f9fa'};">
            <span style="font-weight: 600;">${label}${requiredMark}：</span>
            <span style="${style}">${displayValue}</span>
          </div>`;
      }

      headerInfo = `
          <div style="margin-bottom: 12px; padding: 8px; background: #e3f2fd; border-radius: 6px;">
            <strong style="color: #1976d2;">PACKING LIST 表头信息汇总</strong>
          </div>
          ${formatField('客户名称', o.customerName, true)}
          ${formatField('合同号', o.contractNo || o.orderNo)}
          ${formatField('提单号', o.blNo)}
          ${formatField('发票号', o.invoiceNo)}
          ${formatField('发货日期', o.shipmentDate || o.invoiceDate)}
          ${formatField('发货港', o.shipFrom)}
          ${formatField('到达港', o.shipTo)}
          ${formatField('货运号', o.shippedPerSs)}
          ${formatField('箱型', extras.boxType)}
          ${formatField('箱型体积', extras.boxVolume)}
          ${formatWeight('NET WEIGHT合计', totalNetWeight)}
          ${formatWeight('GROSS WEIGHT合计', totalGrossWeight)}
          <div style="color: #666; font-size: 12px; margin-top: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
            <i>💡 红色显示的字段表示内容为空或为0，导出前请及时填写</i>
          </div>
        `;
      break;
    case 'pickup':
      // 拉货通知单据表头信息汇总：合同号、拉货日期、拉货时间、总件数、总数量
      const pickupExtras = o.extras || {};
      const pickupDate = pickupExtras.pickupDate || '';
      const pickupTime = pickupExtras.pickupTime || '';
      const truckNumber = pickupExtras.truckNumber || '';
      const driverName = pickupExtras.driverName || '';
      const driverPhone = pickupExtras.driverPhone || '';
      const pickupAddress = pickupExtras.pickupAddress || '';

      // 计算总件数和总数量
      const pickupItems = Array.isArray(o.items) ? o.items : [];
      let totalPackages = 0;
      let totalQuantity = 0;

      pickupItems.forEach(it => {
        totalPackages += Number(it.packages || 0);
        totalQuantity += Number(it.quantity || 0);
      });

      headerInfo = `
          <div style="margin-bottom: 12px; padding: 8px; background: #e3f2fd; border-radius: 6px;">
            <strong style="color: #1976d2;">拉货通知 表头信息汇总</strong>
          </div>
          ${formatField('合同号', o.contractNo || o.orderNo)}
          ${formatField('拉货日期', pickupDate, true)}
          ${formatField('拉货时间', pickupTime)}
          <div style="margin-bottom: 6px; padding: 4px 8px; border-radius: 4px; background: #f8f9fa;">
            <span style="font-weight: 600;">总件数：</span>
            <span style="color: #2c3e50;">${totalPackages} 件</span>
          </div>
          <div style="margin-bottom: 6px; padding: 4px 8px; border-radius: 4px; background: #f8f9fa;">
            <span style="font-weight: 600;">总数量：</span>
            <span style="color: #2c3e50;">${totalQuantity} 条</span>
          </div>
          <div style="color: #666; font-size: 12px; margin-top: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
            <i>💡 红色显示的字段表示内容为空，导出前请及时填写</i>
          </div>
        `;
      break;
    default:
      headerInfo = '<div>请选择单据类型以查看表头信息</div>';
  }

  docHeaderContent.innerHTML = headerInfo;
  docHeaderInfo.style.display = 'block';
}

// 页面加载完成后初始化（仅独立 docs.html，避免在 SPA 主入口误跑）
if (isLegacyDocsHtmlPage) {
  document.addEventListener('DOMContentLoaded', function () {
    // 延迟显示表头信息，等待订单数据加载完成
    setTimeout(() => {
      const defaultType = docType();
      showDocHeaderInfo(defaultType);
    }, 100);

    // 🚀 预启动后端服务（Tauri 打包环境需要）
    // 在页面加载时就启动后端，确保用户点击导出时能立即响应
    (async () => {
      try {
        const { backendManager } = await import('../../utils/backend-manager.js');
        console.log('[单据生成] 页面加载，预启动后端服务...');
        await backendManager.ensureBackendWithNotification();
        console.log('[单据生成] 后端服务已就绪，导出功能可用');
      } catch (err) {
        // 预启动失败不阻塞页面，用户点击导出时会再次尝试
        console.warn('[单据生成] 后端服务预启动失败（将在导出时重试）:', err.message);
      }
    })();
  });
}

// 订单选择已移除，不需要绑定事件
// 保存当前缩放比例，切换单据类型时保持不变
let savedZoomLevel = zoomLevel;
document.querySelectorAll('input[name="docType"]').forEach(r => r.addEventListener('change', function () {
  const type = docType();
  // 保存当前的缩放比例
  savedZoomLevel = zoomLevel;
  console.log('切换单据类型前的缩放比例:', savedZoomLevel);

  // 渲染预览，跳过自动适配
  renderPreview(true).then(() => {
    // 渲染完成后，恢复之前的缩放比例
    requestAnimationFrame(() => {
      const zoomWrapper = document.querySelector('.preview-zoom-wrapper');
      if (zoomWrapper) {
        const scale = savedZoomLevel / 100;
        // 保持当前的 translate 值
        const currentTransform = zoomWrapper.style.transform || '';
        const translateMatch = currentTransform.match(/translate\(([^)]+)\)/);
        const currentTranslate = translateMatch ? translateMatch[1].split(',').map(v => parseFloat(v.trim())) : [0, 0];
        const translateX = currentTranslate[0] || 0;
        const translateY = currentTranslate[1] || 0;

        zoomWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        if (zoomLevelEl) {
          zoomLevelEl.textContent = `${savedZoomLevel}%`;
        }
        zoomLevel = savedZoomLevel;
        console.log('已恢复缩放比例:', savedZoomLevel);
      }
    });
  });

  showDocHeaderInfo(type); // 显示表头信息
  console.log('单据类型已切换为:', type);
}));
if (btnBack) btnBack.addEventListener('click', () => goto('/index.html#/orders'));
if (btnPDF) {
  btnPDF.addEventListener('click', async () => {
    if (isOldDocsExportPdfButtonHidden()) return;
    await exportPDF();
  });
}
if (btnExcel) btnExcel.addEventListener('click', exportExcel);
if (btnWord) btnWord.addEventListener('click', exportWord);
if (btnEditablePDF) btnEditablePDF.addEventListener('click', exportEditablePDF);

// 右侧布局按钮事件监听器已移除，功能已移植到预览窗口标题栏
// if (btnStyleUltraCompact) btnStyleUltraCompact.addEventListener('click', () => { styleMode = 'ultra-compact'; save(KEY_DOCS_STYLE, styleMode); renderPreview(); });
// if (btnStyleCompact) btnStyleCompact.addEventListener('click', () => { styleMode = 'compact'; save(KEY_DOCS_STYLE, styleMode); renderPreview(); });
// if (btnStyleStandard) btnStyleStandard.addEventListener('click', () => { styleMode = 'standard'; save(KEY_DOCS_STYLE, styleMode); renderPreview(); });
// if (btnStyleWide) btnStyleWide.addEventListener('click', () => { styleMode = 'wide'; save(KEY_DOCS_STYLE, styleMode); renderPreview(); });

// 🔍 缩放控制 - 参考WPS/Word的交互逻辑

// 放大按钮：WPS/Word风格，支持预设缩放级别
if (zoomInBtn) zoomInBtn.addEventListener('click', () => {
  // 取消适配模式，切换到手动缩放
  if (fitToPageToggle) fitToPageToggle.checked = false;

  // WPS/Word风格的预设缩放级别：增加更多中间档位，平滑过渡
  const presetLevels = [30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200];

  // 如果当前缩放级别不在预设列表中，先对齐到最接近的预设值
  // 这样可以确保缩放操作始终基于预设值，避免跳过某些值（如60%）
  // 查找最接近的预设值（向上或向下）
  let currentPreset = presetLevels.find(level => level === zoomLevel);

  // 如果当前值不在预设列表中，找到最接近的预设值
  if (!currentPreset) {
    currentPreset = presetLevels.reduce((prev, curr) => {
      return Math.abs(curr - zoomLevel) < Math.abs(prev - zoomLevel) ? curr : prev;
    });
  }

  // 找到下一个更大的预设级别
  let nextLevel = presetLevels.find(level => level > currentPreset);

  if (!nextLevel) {
    // 如果已经超过最大预设值，每次增加10%
    nextLevel = Math.min(200, zoomLevel + 10);
  }

  zoomLevel = nextLevel;
  autoFitPreviewToA4();
});

// 缩小按钮：WPS/Word风格，支持预设缩放级别
if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => {
  // 取消适配模式，切换到手动缩放
  if (fitToPageToggle) fitToPageToggle.checked = false;

  // WPS/Word风格的预设缩放级别（降序）- 增加更多中间档位
  const presetLevels = [200, 175, 150, 125, 110, 100, 90, 80, 70, 60, 50, 40, 30];

  // 如果当前缩放级别不在预设列表中，先对齐到最接近的预设值
  // 这样可以确保缩放操作始终基于预设值，避免跳过某些值（如60%）
  // 查找最接近的预设值（向上或向下）
  let currentPreset = presetLevels.find(level => level === zoomLevel);

  // 如果当前值不在预设列表中，找到最接近的预设值
  if (!currentPreset) {
    currentPreset = presetLevels.reduce((prev, curr) => {
      return Math.abs(curr - zoomLevel) < Math.abs(prev - zoomLevel) ? curr : prev;
    });
  }

  // 找到下一个更小的预设级别
  let nextLevel = presetLevels.find(level => level < currentPreset);

  if (!nextLevel) {
    // 如果已经低于最小预设值，每次减少10%
    nextLevel = Math.max(30, zoomLevel - 10);
  }

  zoomLevel = nextLevel;
  autoFitPreviewToA4();
});

// 适配切换按钮：WPS/Word的"适合页面"功能
if (fitToPageToggle) fitToPageToggle.addEventListener('change', () => {
  if (fitToPageToggle.checked) {
    console.log('✅ 已启用自动适配模式');
  } else {
    console.log('🔧 已切换到手动缩放模式');
  }
  autoFitPreviewToA4();
});

// 🔍 响应式适配：窗口大小变化时自动重新计算
// 使用防抖优化性能，避免频繁计算
let resizeTimer = null;
if (isLegacyDocsHtmlPage) {
  window.addEventListener('resize', () => {
    // 清除之前的定时器
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }

    // 300ms后执行，避免resize过程中频繁计算
    resizeTimer = setTimeout(() => {
      if (fitToPageToggle && fitToPageToggle.checked) {
        console.log('🔄 窗口大小变化，重新计算适配比例');
        autoFitPreviewToA4();
      }
    }, 300);
  });
}

// 默认勾选适配复选框
if (fitToPageToggle) {
  fitToPageToggle.checked = true;
  console.log('✅ 默认启用自动适配模式');
}

// 移除滚动条后，内容通过 flexbox 居中显示，无需滚动相关逻辑

// 🖱️ 鼠标拖动和滚轮缩放功能
(function initDragAndZoom() {
  const previewContainer = document.querySelector('.preview-container');
  const zoomWrapper = document.querySelector('.preview-zoom-wrapper');

  if (!previewContainer || !zoomWrapper) return;

  let dragEnabled = !pageDragToggle || pageDragToggle.checked;
  // 拖动状态
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let currentTranslateX = 0;
  let currentTranslateY = 0;

  if (pageDragToggle) {
    pageDragToggle.addEventListener('change', () => {
      dragEnabled = pageDragToggle.checked;
      if (!dragEnabled) {
        isDragging = false;
        previewContainer.style.cursor = '';
        previewContainer.style.userSelect = '';
      } else {
        previewContainer.style.cursor = 'grab';
      }
    });
  }

  // 获取当前的 transform 值
  function getCurrentTransform() {
    const transform = zoomWrapper.style.transform || '';
    const scaleMatch = transform.match(/scale\(([^)]+)\)/);
    const translateMatch = transform.match(/translate\(([^)]+)\)/);

    const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
    const translate = translateMatch ? translateMatch[1].split(',').map(v => parseFloat(v.trim())) : [0, 0];

    return { scale, translateX: translate[0] || 0, translateY: translate[1] || 0 };
  }

  // 应用 transform
  function applyTransform(scale, translateX, translateY) {
    zoomWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    zoomWrapper.style.transformOrigin = 'center center';
  }

  // 鼠标按下 - 开始拖动
  previewContainer.addEventListener('mousedown', (e) => {
    // 只响应左键
    if (e.button !== 0) return;

    // 如果点击的是按钮或输入框，不触发拖动
    if (e.target.closest('button, input, select, a')) return;
    if (!dragEnabled) return;

    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const current = getCurrentTransform();
    currentTranslateX = current.translateX;
    currentTranslateY = current.translateY;

    previewContainer.style.cursor = 'grabbing';
    previewContainer.style.userSelect = 'none';

    e.preventDefault();
  });

  // 鼠标移动 - 拖动中
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    const newTranslateX = currentTranslateX + deltaX;
    const newTranslateY = currentTranslateY + deltaY;

    const current = getCurrentTransform();
    applyTransform(current.scale, newTranslateX, newTranslateY);

    e.preventDefault();
  });

  // 鼠标释放 - 结束拖动
  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;

    isDragging = false;
    previewContainer.style.cursor = '';
    previewContainer.style.userSelect = '';

    const current = getCurrentTransform();
    currentTranslateX = current.translateX;
    currentTranslateY = current.translateY;
  });

  // 鼠标离开窗口 - 结束拖动
  document.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      previewContainer.style.cursor = '';
      previewContainer.style.userSelect = '';
    }
  });

  // 鼠标滚轮缩放 - 以鼠标位置为中心缩放
  previewContainer.addEventListener('wheel', (e) => {
    // 如果按住 Ctrl 键，使用浏览器默认缩放，否则使用自定义缩放
    if (e.ctrlKey || e.metaKey) {
      return; // 让浏览器处理 Ctrl+滚轮
    }

    e.preventDefault();

    // 取消适配模式
    if (fitToPageToggle) {
      fitToPageToggle.checked = false;
    }

    const current = getCurrentTransform();
    let newScale = current.scale;

    // 计算缩放增量（向下滚动缩小，向上滚动放大）
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    newScale = Math.max(0.25, Math.min(2.0, newScale + delta));

    // 对齐到常用比例
    const commonScales = [0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];
    const threshold = 0.05;
    for (const scale of commonScales) {
      if (Math.abs(newScale - scale) < threshold) {
        newScale = scale;
        break;
      }
    }

    // 获取鼠标在容器中的位置（相对于容器）
    const containerRect = previewContainer.getBoundingClientRect();
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;

    // 获取缩放元素的位置和尺寸（已考虑当前的transform）
    const wrapperRect = zoomWrapper.getBoundingClientRect();
    const wrapperLeft = wrapperRect.left - containerRect.left;
    const wrapperTop = wrapperRect.top - containerRect.top;

    // 计算缩放元素的中心位置（在容器坐标系中，已考虑translate和scale）
    const wrapperCenterX = wrapperLeft + wrapperRect.width / 2;
    const wrapperCenterY = wrapperTop + wrapperRect.height / 2;

    // 计算鼠标相对于缩放元素中心的偏移（在已缩放坐标系中）
    const offsetX = mouseX - wrapperCenterX;
    const offsetY = mouseY - wrapperCenterY;

    // 将偏移转换为未缩放坐标系中的相对位置
    const relativeX = offsetX / current.scale;
    const relativeY = offsetY / current.scale;

    // 计算新的中心位置，使得鼠标指向的点在缩放后仍然在鼠标位置
    // 新中心位置 = 鼠标位置 - 相对位置 * 新缩放比例
    const newCenterX = mouseX - relativeX * newScale;
    const newCenterY = mouseY - relativeY * newScale;

    // 计算新的translate（相对于当前中心位置的偏移）
    const newTranslateX = current.translateX + (newCenterX - wrapperCenterX);
    const newTranslateY = current.translateY + (newCenterY - wrapperCenterY);

    // 更新缩放级别
    zoomLevel = Math.round(newScale * 100);
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${zoomLevel}%`;
    }

    // 应用新的缩放和偏移
    applyTransform(newScale, newTranslateX, newTranslateY);
  });

  // 鼠标悬停时显示可拖动提示
  previewContainer.addEventListener('mouseenter', () => {
    if (!isDragging && dragEnabled) {
      previewContainer.style.cursor = 'grab';
    }
  });

  previewContainer.addEventListener('mouseleave', () => {
    if (!isDragging) {
      previewContainer.style.cursor = '';
    }
  });
})();

// 初始渲染（仅 docs.html；SPA 主入口无 #preview，不能执行）
if (isLegacyDocsHtmlPage) {
  syncCompanyFromServer(renderPreview);
  // 再次渲染以确保无网络时也有本地预览
  renderPreview();

  // 启动后刷新订单列表：若提供了 id 则按需加载该订单，否则才拉取全量列表
  (function refreshOrdersFromServer() {
    try {
      if (urlId != null && Number.isFinite(urlId)) {
        // 已在 renderPreview 中按需拉取详情并填充选择，这里不再拉取列表
        return;
      }
      ApiService.orders.list().then(rows => {
        if (Array.isArray(rows)) {
          orders = rows;
          // 刷新订单选择并保持当前索引或URL索引
          renderOrderSelect(currentOrderIndex());
          renderPreview();
        }
      }).catch(() => { });
    } catch (e) { }
  })();
}

// 🔍 视觉缩放功能 - 参考WPS/Word打印预览的智能适配算法
function autoFitPreviewToA4() {
  if (!preview) return;

  const previewContainer = document.querySelector('.preview-container');
  const zoomWrapper = document.querySelector('.preview-zoom-wrapper');

  if (!previewContainer || !zoomWrapper) return;

  // 检查是否启用适配模式
  const useFit = fitToPageToggle && fitToPageToggle.checked;

  // 将适配逻辑提取为独立函数，以便在requestAnimationFrame中调用
  function performFit(a4Width, a4Height) {
    const previewContainer = document.querySelector('.preview-container');
    const zoomWrapper = document.querySelector('.preview-zoom-wrapper');

    if (!previewContainer || !zoomWrapper) return;

    // 获取容器的实际可视区域尺寸
    const containerWidth = previewContainer.clientWidth;
    const containerHeight = previewContainer.clientHeight;

    // 获取容器的padding值（不会被缩放，更新默认值为15px，与新页面一致）
    const containerStyle = window.getComputedStyle(previewContainer);
    const containerPaddingTop = parseFloat(containerStyle.paddingTop) || 15;
    const containerPaddingLeft = parseFloat(containerStyle.paddingLeft) || 15;
    const containerPaddingRight = parseFloat(containerStyle.paddingRight) || 15;

    // 🎯 新的适配逻辑：同时考虑宽度和高度，确保内容完整显示在预览窗口中
    // 计算可用宽度和高度：容器尺寸 - padding - 安全边距
    const safetyMargin = 20; // 安全边距，确保内容不会紧贴边缘
    const availableWidth = containerWidth - containerPaddingLeft - containerPaddingRight - safetyMargin;
    const containerPaddingBottom = parseFloat(containerStyle.paddingBottom) || 15;
    const availableHeight = containerHeight - containerPaddingTop - containerPaddingBottom - safetyMargin;

    // 步骤5：计算最佳缩放比例
    // 🎯 核心原则：同时考虑宽度和高度，取较小值确保内容完整显示
    // 由于移除了滚动条，必须确保内容能够完整显示在预览窗口中
    const scaleByWidth = availableWidth / a4Width;
    const scaleByHeight = availableHeight / a4Height;

    // 取较小的缩放比例，确保内容完整显示
    let autoScale = Math.min(scaleByWidth, scaleByHeight);

    // 步骤6：限制缩放范围
    // 最大缩放不超过100%（实际大小），最小25%（确保小屏幕也能看到内容）
    autoScale = Math.max(0.25, Math.min(autoScale, 1.0));

    // 步骤7：可选的微调 - 只在非常接近时对齐到常用比例
    // 避免出现 49% 这样的奇怪数值，对齐到 50%
    // 扩展常用比例列表，包含更多预设值，确保60%等常用值能被对齐
    const commonScales = [0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1.0];
    const threshold = 0.03; // 3%的容差（稍微放宽，确保60%等值能被正确对齐）
    for (const scale of commonScales) {
      if (Math.abs(autoScale - scale) < threshold) {
        autoScale = scale;
        break;
      }
    }

    // 步骤8：应用缩放变换
    // 关键：适配模式下重置 translate，让内容重新居中
    zoomWrapper.style.transform = `translate(0px, 0px) scale(${autoScale})`;
    zoomWrapper.style.transformOrigin = 'center center';

    // 移除滚动条后，内容通过 flexbox 居中显示，无需底部margin调整

    // 步骤9：更新缩放百分比显示和zoomLevel变量
    const scaledPercentage = Math.round(autoScale * 100);
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${scaledPercentage}%`;
    }
    // 同步更新zoomLevel变量，确保切换回手动模式时有正确的起点
    zoomLevel = scaledPercentage;

    // 步骤10：移除滚动条后，内容通过 flexbox 居中显示，无需滚动相关逻辑

    // 步骤11：调试信息输出
    const scaledWidth = a4Width * autoScale;
    const scaledHeight = a4Height * autoScale;
    const fitsWidth = scaledWidth <= availableWidth;
    const fitsHeight = scaledHeight <= availableHeight;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📐 优化的智能适配算法（宽度和高度同时考虑）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 容器尺寸: ${Math.round(containerWidth)}×${Math.round(containerHeight)}px`);
    console.log(`📄 A4原始尺寸: ${Math.round(a4Width)}×${Math.round(a4Height)}px`);
    console.log(`📏 容器内边距: 上${containerPaddingTop}px, 下${containerPaddingBottom}px, 左${containerPaddingLeft}px, 右${containerPaddingRight}px`);
    console.log(`✨ 可用空间: ${Math.round(availableWidth)}×${Math.round(availableHeight)}px`);
    console.log(`🔍 宽度缩放比例: ${Math.round(scaleByWidth * 100)}%`);
    console.log(`🔍 高度缩放比例: ${Math.round(scaleByHeight * 100)}%`);
    console.log(`🔍 最终缩放比例: ${Math.round(autoScale * 100)}%`);
    console.log(`📐 缩放后尺寸: ${Math.round(scaledWidth)}×${Math.round(scaledHeight)}px`);
    console.log(`✅ 宽度适配: ${fitsWidth ? '通过' : '超出'}`);
    console.log(`✅ 高度适配: ${fitsHeight ? '通过' : '超出'}`);
    console.log(`🎯 适配策略: ✅ 同时考虑宽度和高度，取较小值确保内容完整显示`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  if (useFit) {
    // 🎯 WPS/Word风格的智能适配算法

    // 步骤1：获取容器的实际可视区域尺寸
    const containerWidth = previewContainer.clientWidth;
    const containerHeight = previewContainer.clientHeight;

    // 步骤2：获取A4纸张的原始尺寸（未缩放状态）
    // 临时重置缩放以获取真实尺寸，并确保DOM已完全渲染
    const currentTransform = zoomWrapper.style.transform;
    zoomWrapper.style.transform = 'scale(1)';

    // 等待DOM更新后再获取尺寸
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const a4Rect = preview.getBoundingClientRect();
        const a4Width = a4Rect.width;
        // 使用实际内容高度，而不是min-height
        // 如果内容超出min-height，scrollHeight会反映实际高度
        const a4Height = Math.max(a4Rect.height, preview.scrollHeight);

        // 恢复原有缩放
        zoomWrapper.style.transform = currentTransform;

        // 继续执行适配计算
        performFit(a4Width, a4Height);
      });
    });

    return; // 提前返回，等待requestAnimationFrame完成
  } else {
    // 📏 手动缩放模式：使用用户指定的缩放级别
    const manualScale = zoomLevel / 100;

    // 获取A4纸张的原始尺寸（未缩放状态）
    const currentTransform = zoomWrapper.style.transform;
    zoomWrapper.style.transform = 'scale(1)';

    // 等待DOM更新后再获取尺寸并应用缩放
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const a4Rect = preview.getBoundingClientRect();
        const a4Width = a4Rect.width;
        const a4Height = Math.max(a4Rect.height, preview.scrollHeight);

        // 应用缩放变换
        // 关键：使用 translate 和 scale 的组合，支持拖动功能
        // 获取当前的 translate 值，保持拖动位置
        const currentTransform = zoomWrapper.style.transform || '';
        const translateMatch = currentTransform.match(/translate\(([^)]+)\)/);
        const currentTranslate = translateMatch ? translateMatch[1].split(',').map(v => parseFloat(v.trim())) : [0, 0];
        const translateX = currentTranslate[0] || 0;
        const translateY = currentTranslate[1] || 0;

        zoomWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${manualScale})`;
        zoomWrapper.style.transformOrigin = 'center center';

        // 移除滚动条后，内容通过 flexbox 居中显示，无需底部margin调整

        if (zoomLevelEl) {
          zoomLevelEl.textContent = `${zoomLevel}%`;
        }

        console.log(`🔧 手动缩放模式: ${zoomLevel}%`);
      });
    });
  }
}

// 将autoFitPreviewToA4函数暴露到全局作用域
window.autoFitPreviewToA4 = autoFitPreviewToA4;

/**
 * 签名图片管理器 - 重构版本
 * 负责初始化和管理所有单据中的签名图片显示
 */
function initializeSignatureImages() {
  if (!preview) {
    console.warn('预览容器不存在，跳过签名图片初始化');
    return;
  }

  // 查找所有签名图片容器
  const signatureContainers = preview.querySelectorAll('.signature-container');

  if (signatureContainers.length === 0) {
    console.log('未找到签名图片容器');
    return;
  }

  console.log(`开始初始化 ${signatureContainers.length} 个签名图片容器`);

  signatureContainers.forEach((container, index) => {
    const docType = container.getAttribute('data-doc-type') || 'unknown';
    console.log(`初始化签名图片容器 ${index + 1}，类型: ${docType}`);

    // 设置加载状态
    container.classList.add('loading');

    // 创建图片元素
    const img = document.createElement('img');
    img.alt = 'Authorized Signature';
    img.style.display = 'none'; // 初始隐藏

    // 图片加载成功处理
    img.onload = function () {
      console.log(`签名图片 ${index + 1} (${docType}) 加载成功`);
      container.classList.remove('loading', 'error');
      this.style.display = 'block';
      this.style.opacity = '1';
    };

    // 图片加载失败处理
    img.onerror = function () {
      console.error(`签名图片 ${index + 1} (${docType}) 加载失败，URL: ${this.src}`);
      container.classList.remove('loading');
      container.classList.add('error');
      this.style.display = 'none';

      // 显示错误信息
      container.innerHTML = '<div style="color: #999; font-size: 12px; text-align: center;">签名图片加载失败</div>';
    };

    // 清空容器并添加图片
    container.innerHTML = '';
    container.appendChild(img);

    // 设置图片源，触发加载 - 添加时间戳避免缓存问题
    const timestamp = new Date().getTime();
    img.src = `/images/AuthSig.png?t=${timestamp}`;

    console.log(`设置签名图片源: ${img.src}`);
  });
}
