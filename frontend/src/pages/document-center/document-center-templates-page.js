/**
 * 单据中心 - 单据模版页面逻辑
 * 
 * 功能说明：
 * - 这是单据中心（document-center）的三个二级页面之一
 * - 负责模板列表的显示和管理
 * 
 * 单据中心包含三个二级页面：
 *   1. 单据生成（document-center-generate-page.js）
 *   2. 单据模版（本文件）
 *   3. 模板编辑（document-center-template-editor-v2-page.js）
 * 
 * 注意：文档生成器（document-generator/docs.html）是独立的单页面应用
 */

import DocumentCenterService from '../../services/document-center-service.js';
import { TemplateService } from '../../components/document-center/template-service.js';
import { debounce, throttle } from '../../utils/binding-utils.js';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_NAMES, DEBOUNCE_DELAY } from '../../constants/document-center.js';
import { getUser } from '../../utils/auth.js';
// 导入优化后的模块
import { renderTemplateList as renderTemplateListNew } from './template-list-renderer.js';
import { EventBinder, createTemplateListEventConfig, createFilterEventConfig } from './event-binder.js';
import { DocumentCenterUtils } from '../../utils/document-center-utils.js';
import { DocumentCenterErrorHandler } from '../../utils/document-center-error-handler.js';

/**
 * 获取模板验证状态
 * @param {Object} template - 模板对象
 * @returns {Promise<Object>} 验证状态对象 { icon, text, color }
 */
async function getTemplateValidationStatus(template) {
  try {
    // 获取模板的HTML内容
    let html = '';
    if (template.html !== undefined) {
      html = template.html;
    } else if (template.config?.html !== undefined) {
      html = template.config.html;
    } else if (template.config?.canvas?.components) {
      html = template.config.canvas.components;
    }
    
    if (!html || html.trim() === '') {
      return {
        icon: '⚠️',
        text: '无内容',
        color: '#f59e0b',
        errors: [],
        warnings: []
      };
    }
    
    // 动态导入TemplateValidator
    const { TemplateValidator } = await import('../../components/document-center/validator/template-validator.js');
    const validation = await TemplateValidator.validate(html);
    
    if (validation.errors && validation.errors.length > 0) {
      return {
        icon: '❌',
        text: `${validation.errors.length} 个错误`,
        color: '#ef4444',
        errors: validation.errors || [],
        warnings: validation.warnings || [],
        hasDetails: true
      };
    }
    
    if (validation.warnings && validation.warnings.length > 0) {
      const importantWarnings = validation.warnings.filter(w => 
        w.type === 'UNKNOWN_NAMESPACE' || 
        w.type === 'UNCLOSED_LOOP' || 
        w.type === 'UNCLOSED_CONDITION'
      );
      
      if (importantWarnings.length > 0) {
        return {
          icon: '⚠️',
          text: `${importantWarnings.length} 个警告`,
          color: '#f59e0b',
          errors: [],
          warnings: validation.warnings || [],
          hasDetails: true
        };
      }
      
      return {
        icon: '✓',
        text: '有警告',
        color: '#3b82f6',
        errors: [],
        warnings: validation.warnings || [],
        hasDetails: true
      };
    }
    
    return {
      icon: '✓',
      text: '验证通过',
      color: '#10b981',
      errors: [],
      warnings: []
    };
  } catch (error) {
    console.error('[DocumentCenterTemplatesPage] 验证模板失败:', error);
    return {
      icon: '❓',
      text: '验证失败',
      color: '#6b7280',
      errors: [],
      warnings: []
    };
  }
}

/** @type {Array<Object>} 所有模板列表 */
let templates = [];
/** @type {Array<Object>} 筛选后的模板列表 */
let filteredTemplates = [];
/** @type {Function|null} 防抖筛选函数 */
let debouncedFilter = null;

// 统一的操作处理函数
function handleTemplateAction(action, id) {
  console.log('[DocumentCenterTemplatesPage] 处理操作，action:', action, 'id:', id);
  
  switch (action) {
    case 'edit':
      // 导航到模板编辑页面，并传递模板ID
      if (!id) {
        console.error('[DocumentCenterTemplatesPage] 编辑操作：模板ID为空');
        window.NotificationSystem?.toast('无法编辑：模板ID无效', 'error');
        return;
      }
      console.log('[DocumentCenterTemplatesPage] 编辑模板，ID:', id);
      window.location.hash = `#/document-center/template-editor?id=${encodeURIComponent(id)}`;
      break;
    case 'delete':
      deleteTemplate(id);
      break;
    case 'copy':
      copyTemplate(id);
      break;
    case 'export':
      exportTemplate(id);
      break;
    case 'setDefault':
      setDefaultTemplate(id);
      break;
    default:
      console.warn('[DocumentCenterTemplatesPage] 未知的操作类型:', action);
  }
}

// 事件处理函数（提升到模块级别，以便在renderTemplateList中也能使用）
const handleTemplateListClick = (e) => {
  // 检查是否点击了模板名称（用于复制）
  const templateName = e.target.closest('.template-card-title, .template-name-copyable');
  if (templateName && templateName.dataset.templateName) {
    const name = templateName.dataset.templateName;
    // 如果用户选中了文本，不触发复制（让用户正常复制）
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      return; // 用户正在选择文本，不干扰
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    // 复制模板名称到剪贴板
    navigator.clipboard.writeText(name).then(() => {
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('已复制到剪贴板', 'success', 2000);
      }
    }).catch(err => {
      console.error('复制失败:', err);
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('复制失败，请手动复制', 'error');
      }
    });
    return;
  }
  
  // 检查是否点击了验证状态
  const validationStatus = e.target.closest('.validation-status-clickable');
  if (validationStatus) {
    e.preventDefault();
    e.stopPropagation();
    const templateId = validationStatus.dataset.templateId;
    const template = templates.find(t => t.id == templateId);
    if (template) {
      showValidationDetails(template);
    }
    return;
  }

  // 查找最近的带有 data-action 属性的按钮
  const btn = e.target.closest('button[data-action]');
  if (!btn) {
    return; // 点击的不是操作按钮，忽略
  }

  // 阻止默认行为和事件冒泡
  e.preventDefault();
  e.stopPropagation();

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  console.log('[DocumentCenterTemplatesPage] 点击操作按钮，action:', action, 'id:', id, 'button:', btn);

  handleTemplateAction(action, id);
};

// 注意：已移除立即执行的全局事件监听器，改为在bindEvents中统一处理

/**
 * 初始化模板页面
 * @description 初始化单据模板列表页面，包括事件绑定、模板加载等
 * @returns {Promise<void>}
 */
/**
 * 创建 Invoice 模板（自动执行）
 */
async function createInvoiceTemplateIfNeeded() {
  try {
    // 检查是否已有 Invoice 模板
    const templates = await DocumentCenterService.listTemplates('invoice');
    const existingInvoiceTemplate = templates.find(t => t.name && t.name.includes('INVOICE'));
    
    if (existingInvoiceTemplate) {
      console.log('[TemplatesPage] Invoice 模板已存在，跳过创建');
      // 如果模板已存在，直接返回，不进行任何操作（包括更新）
      // 这样可以避免用户删除模板后，因为其他模板存在而重新创建
      return;
    }
    
    console.log('[TemplatesPage] 未找到 Invoice 模板，开始创建...');
    
    // 获取当前登录用户
    const { getUser } = await import('../../utils/auth.js');
    const user = getUser();
    const userId = user?.id || 1;
    
    // Invoice 模板配置
    const invoiceHtml = `<!-- 表头部分 -->
<div class="doc-header">
  <div class="doc-company">{{company.companyNameEN}}</div>
  <div class="doc-subline doc-address-en" style="white-space:nowrap; font-size:11px; overflow:hidden; text-overflow:ellipsis; width:100%; display:block">{{company.companyAddressEN}}</div>
  <div class="doc-title">INVOICE</div>
  <div class="doc-subline" style="text-align:right">INVOICE NO: {{order.invoiceNo}}</div>
  <div class="doc-subline" style="text-align:right">CONTRACT NO: {{order.contractNo}}</div>
  <div class="doc-subline" style="text-align:right">ACCOUNT AND RISK OF: {{order.customerName}}</div>
  <div class="doc-subline" style="text-align:left; margin-top:3px; font-size:11px;">{{customer.address}}</div>
  <div class="doc-subline" style="text-align:left; margin-top:3px; font-size:11px;">TEL:{{customer.tel}} FAX:{{customer.fax}}</div>
  <div class="doc-subline" style="text-align:right">FROM: {{order.shipFrom}}</div>
  <div class="doc-subline" style="text-align:right">TO: {{order.shipTo}}</div>
  <div class="doc-subline" style="text-align:right">B/L NO: {{order.blNo}}</div>
  <div class="doc-subline" style="text-align:right">SHIPPED PER S.S: {{order.shippedPerSs}}</div>
</div>

<!-- 表格部分 -->
<table class="table" style="margin-top:8px; border-collapse:collapse; width:100%; border:1px solid #333; table-layout:fixed;">
  <colgroup>
    <col style="width:14%">
    <col style="width:48%">
    <col style="width:16%">
    <col style="width:22%">
  </colgroup>
  <thead>
    <tr style="background:#f1f5f9">
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">唛头<br/>MARKS & NOS.</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">货物描述及数量<br/>DESCRIPTION & QUANTITY</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">单 价<br/>UNIT PRICE</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">总 值<br/>AMOUNT</th>
    </tr>
    <tr>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;"></th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">PP CONTAINER BAG</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">PER PC</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">{{calc.amountHeaderText}}</th>
    </tr>
  </thead>
  <tbody>
    {{#each order.items}}
    <tr>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;"></td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:left; word-wrap: break-word; white-space: normal;">{{@index}}){{model}}<br/>{{packages}}{{packageUnit}} ----------{{quantity}}PCS</td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap;">USD{{unitPrice}}</td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center; white-space:nowrap;">USD{{amount}}</td>
    </tr>
    {{/each}}
    <tr>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;"></td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:left;">{{calc.totalPackages}}{{calc.packageUnit}}----------{{calc.totalQuantity}}PCS</td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;"></td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;"></td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3" style="padding:8px; border:1px solid #333; text-align:center; font-weight:600; vertical-align: middle;">总计 TOTAL：</td>
      <td style="padding:8px; border:1px solid #333; text-align:center; font-weight:600; vertical-align: middle; white-space:nowrap;">USD{{calc.totalAmount}}</td>
    </tr>
  </tfoot>
</table>

<!-- 页脚签名 -->
<div class="doc-footer" style="text-align: right; margin-top: 16px;">
  <div class="signature-container" data-doc-type="invoice"></div>
</div>`;
    
    const invoiceStyles = `<style>
.doc-header {
  margin-bottom: 8px;
}
.doc-company {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}
.doc-title {
  font-size: 18px;
  font-weight: 700;
  text-align: center;
  margin: 8px 0;
  color: #111827;
}
.doc-subline {
  font-size: 11px;
  color: #374151;
  margin: 2px 0;
}
.doc-address-en {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.table {
  border-collapse: collapse;
  width: 100%;
  border: 1px solid #333;
  table-layout: fixed;
}
.table th,
.table td {
  padding: 8px;
  border: 1px solid #333;
  vertical-align: middle;
}
.table thead tr:first-child {
  background: #f1f5f9;
}
.table tbody td {
  word-wrap: break-word;
  white-space: normal;
}
.table tfoot td {
  font-weight: 600;
}
.doc-footer {
  margin-top: 16px;
  text-align: right;
}
</style>`;
    
    // Invoice 模板配置（同时设置新格式和旧格式以兼容）
    const invoiceTemplate = {
      name: 'INVOICE',
      type: 'invoice',
      isDefault: true,
      createdBy: userId,
      config: {
        // 新格式：直接使用 config.html
        html: invoiceHtml,
        styles: invoiceStyles,
        margin: {
          top: 20,
          bottom: 20,
          left: 20,
          right: 20
        },
        calculations: [
          {
            name: 'totalAmount',
            type: 'sum',
            field: 'items',
            formula: 'sum + (item.quantity * item.unitPrice)',
            initial: 0,
            description: '总金额 = 所有产品的数量 × 单价之和'
          },
          {
            name: 'totalPackages',
            type: 'sum',
            field: 'items',
            formula: 'sum + item.packages',
            initial: 0,
            description: '总包装数 = 所有产品的包装数之和'
          },
          {
            name: 'totalQuantity',
            type: 'sum',
            field: 'items',
            formula: 'sum + item.quantity',
            initial: 0,
            description: '总数量 = 所有产品的数量之和'
          },
          {
            name: 'packageUnit',
            type: 'custom',
            function: 'getPackageUnitForInvoice',
            scope: 'items',
            description: '包装单位（根据产品单位转换：托盘→PALLET，捆包→SACK，件→BALE）'
          },
          {
            name: 'amountHeaderText',
            type: 'custom',
            function: 'getAmountHeaderText',
            scope: 'order',
            description: '总值栏标题 = Trade Term + 目的港城市'
          }
        ],
        conditions: {},
        // 旧格式：同时设置 canvas.components 以兼容旧代码
        canvas: {
          components: invoiceHtml,
          styles: invoiceStyles
        }
      }
    };
    
    // 如果模板已存在，更新它；否则创建新模板
    if (existingInvoiceTemplate) {
      // 获取完整模板数据
      const fullTemplate = await DocumentCenterService.getTemplate(existingInvoiceTemplate.id);
      
      // 更新配置（保留原有配置，只更新HTML）
      const updatedConfig = {
        ...fullTemplate.config,
        html: invoiceHtml,
        styles: invoiceStyles
      };
      
      // 如果存在 canvas.components，也更新它
      if (updatedConfig.canvas) {
        updatedConfig.canvas.components = invoiceHtml;
        updatedConfig.canvas.styles = invoiceStyles;
      } else {
        updatedConfig.canvas = {
          components: invoiceHtml,
          styles: invoiceStyles
        };
      }
      
      const result = await DocumentCenterService.updateTemplate(existingInvoiceTemplate.id, {
        name: fullTemplate.name,
        type: fullTemplate.type,
        config: updatedConfig,
        isDefault: fullTemplate.isDefault
      });
      
      console.log('✅ Invoice 模板已成功更新！', result);
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('Invoice 模板已更新', 'success');
      }
      
      return result;
    } else {
      const result = await DocumentCenterService.createTemplate(invoiceTemplate);
      
      console.log('✅ Invoice 模板已成功创建并保存！', result);
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('Invoice 模板已成功创建', 'success');
      }
      
      return result;
    }
  } catch (error) {
    console.error('❌ 创建 Invoice 模板失败:', error);
    // 不显示错误提示，避免干扰用户
    return null;
  }
}

/**
 * 更新 INVOICE (new) 模板
 */
async function updateInvoiceNewTemplate() {
  try {
    console.log('[DocumentCenterTemplatesPage] 开始更新 INVOICE (new) 模板...');
    
    // 获取所有 invoice 模板
    const templates = await DocumentCenterService.listTemplates('invoice');
    
    // 查找 "INVOICE (new)" 模板
    const invoiceNewTemplate = templates.find(t => 
      t.name && (t.name.includes('INVOICE (new)') || t.name === 'INVOICE (new)')
    );
    
    if (!invoiceNewTemplate) {
      console.log('[DocumentCenterTemplatesPage] 未找到 INVOICE (new) 模板');
      return null;
    }
    
    // 获取当前登录用户
    const { getUser } = await import('../../utils/auth.js');
    const user = getUser();
    const userId = user?.id || 1;
    
    // 新的 INVOICE (new) 模板 HTML - 基于 Image 2 的布局
    const invoiceNewHtml = `<!-- 表头部分 -->
<div class="doc-header">
  <div class="doc-company" style="text-align:center; font-size:16pt; font-weight:bold; margin-bottom:3px;">{{company.companyNameEN}}</div>
  <div class="doc-subline doc-address-en" style="text-align:center; font-size:10pt; margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{company.companyAddressEN}}</div>
  <div class="doc-title" style="font-size:14pt; font-weight:bold; color:black; text-align:center; margin-bottom:10px;">INVOICE</div>
  
  <!-- 两列布局的发票详情 -->
  <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;">
    <tbody>
      <tr>
        <td style="padding:2px 0; width:50%; border-bottom:1px solid #000; text-align:left;">CONTRACT No: {{order.contractNo}}</td>
        <td style="padding:2px 0; width:50%; border-bottom:1px solid #000; text-align:left;">B/L No.: {{order.blNo}}</td>
      </tr>
      <tr>
        <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;">INVOICE NO: {{order.invoiceNo}}</td>
        <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;">SHIPMENT DATE: {{order.shipmentDate}}</td>
      </tr>
      <tr>
        <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;">FROM: {{order.shipFrom}}</td>
        <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;">TO: {{order.shipTo}}</td>
      </tr>
      <tr>
        <td style="padding:2px 0; border-bottom:1px solid #000; text-align:left;" colspan="2">SHIPPED PER S.S.: {{order.shippedPerSs}}</td>
      </tr>
    </tbody>
  </table>
  
  <!-- ACCOUNT AND RISK OF 部分 -->
  <div style="margin-top:10px; font-size:12px; font-weight:bold; text-align:left;">ACCOUNT AND RISK OF: {{order.customerName}}</div>
  <div style="margin-top:3px; font-size:11px; text-align:left;">{{customer.address}}</div>
  <div style="margin-top:3px; font-size:11px; text-align:left;">TEL:{{customer.tel}} FAX:{{customer.fax}}</div>
</div>

<!-- 表格部分 -->
<table class="table" style="margin-top:8px; border-collapse:collapse; width:100%; border:1px solid #333; table-layout:fixed;">
  <colgroup>
    <col style="width:14%">
    <col style="width:48%">
    <col style="width:16%">
    <col style="width:22%">
  </colgroup>
  <thead>
    <tr style="background:#f1f5f9">
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">唛头<br/>MARKS & NOS.</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">货物描述及数量<br/>DESCRIPTION & QUANTITY</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">单 价<br/>UNIT PRICE</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">总 值<br/>AMOUNT</th>
    </tr>
    <tr>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;"></th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">PP CONTAINER BAG</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">PER PC</th>
      <th style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;">{{calc.amountHeaderText}}</th>
    </tr>
  </thead>
  <tbody>
    {{#each order.items}}
    <tr>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:left;">{{@index+1}}D#{{model}}<br/>{{packages}}{{calc.packageUnit}} ----------{{quantity}}PCS</td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:left; word-wrap: break-word; white-space: normal;"></td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:right; white-space:nowrap;">USD{{unitPrice}}</td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:right; white-space:nowrap;">USD{{amount}}</td>
    </tr>
    {{/each}}
    <tr>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:left;">{{calc.totalPackages}}{{calc.packageUnit}}----------{{calc.totalQuantity}}PCS</td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:right; font-weight:600;">总计 TOTAL：</td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:center;"></td>
      <td style="padding:8px; border:1px solid #333; vertical-align: middle; text-align:right; font-weight:600; white-space:nowrap;">USD{{calc.totalAmount}}</td>
    </tr>
  </tbody>
</table>

<!-- 页脚签名 -->
<div class="doc-footer" style="text-align: right; margin-top: 16px;">
  <div class="signature-container" data-doc-type="invoice"></div>
</div>`;
    
    const invoiceNewStyles = `<style>
.doc-header {
  margin-bottom: 8px;
}
.doc-company {
  font-size: 16pt;
  font-weight: bold;
  color: #1e293b;
  margin-bottom: 3px;
  text-align: center;
}
.doc-title {
  font-size: 14pt;
  font-weight: bold;
  text-align: center;
  margin: 8px 0 10px 0;
  color: #111827;
}
.doc-subline {
  font-size: 11px;
  color: #374151;
  margin: 2px 0;
}
.doc-address-en {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}
.table {
  border-collapse: collapse;
  width: 100%;
  border: 1px solid #333;
  table-layout: fixed;
}
.table th,
.table td {
  padding: 8px;
  border: 1px solid #333;
  vertical-align: middle;
}
.table thead tr:first-child {
  background: #f1f5f9;
}
.table tbody td {
  word-wrap: break-word;
  white-space: normal;
}
.table tfoot td {
  font-weight: 600;
}
.doc-footer {
  margin-top: 16px;
  text-align: right;
}
</style>`;
    
    // 获取完整模板数据
    const fullTemplate = await DocumentCenterService.getTemplate(invoiceNewTemplate.id);
    
    // 更新配置（保留原有配置，只更新HTML和样式）
    const updatedConfig = {
      ...fullTemplate.config,
      html: invoiceNewHtml,
      styles: invoiceNewStyles
    };
    
    // 如果存在 canvas.components，也更新它
    if (updatedConfig.canvas) {
      updatedConfig.canvas.components = invoiceNewHtml;
      updatedConfig.canvas.styles = invoiceNewStyles;
    } else {
      updatedConfig.canvas = {
        components: invoiceNewHtml,
        styles: invoiceNewStyles
      };
    }
    
    const result = await DocumentCenterService.updateTemplate(invoiceNewTemplate.id, {
      name: fullTemplate.name,
      type: fullTemplate.type,
      config: updatedConfig,
      isDefault: fullTemplate.isDefault
    });
    
    console.log('✅ INVOICE (new) 模板已成功更新！', result);
    if (window.NotificationSystem) {
      window.NotificationSystem.toast('INVOICE (new) 模板已更新', 'success');
    }
    
    return result;
  } catch (error) {
    console.error('❌ 更新 INVOICE (new) 模板失败:', error);
    if (window.NotificationSystem) {
      window.NotificationSystem.toast('更新 INVOICE (new) 模板失败: ' + error.message, 'error');
    }
    return null;
  }
}

export async function initDocumentCenterTemplatesPage() {
  console.log('[DocumentCenterTemplatesPage] ========== 初始化模板页面 ==========')
  
  // 等待DOM完全加载
  await waitForDOM();
  
  // 验证按钮是否存在
  const btnNewTemplate = document.getElementById('btnNewTemplate');
  const btnImportTemplate = document.getElementById('btnImportTemplate');
  const btnDeleteAllTemplates = document.getElementById('btnDeleteAllTemplates');
  const panelActions = document.querySelector('#view-document-center-templates .panel-actions');
  
  console.log('[DocumentCenterTemplatesPage] DOM元素检查:', {
    btnNewTemplate: !!btnNewTemplate,
    btnImportTemplate: !!btnImportTemplate,
    btnDeleteAllTemplates: !!btnDeleteAllTemplates,
    panelActions: !!panelActions
  });
  
  // 绑定事件
  bindEvents();
  
  // 再次验证事件是否绑定成功
  if (btnNewTemplate) {
    const hasListener = btnNewTemplate._clickHandler !== undefined;
    console.log('[DocumentCenterTemplatesPage] 新建模板按钮事件绑定状态:', hasListener);
    console.log('[DocumentCenterTemplatesPage] 新建模板按钮元素:', btnNewTemplate);
    console.log('[DocumentCenterTemplatesPage] 新建模板按钮是否禁用:', btnNewTemplate.disabled);
    console.log('[DocumentCenterTemplatesPage] 新建模板按钮样式:', {
      display: window.getComputedStyle(btnNewTemplate).display,
      visibility: window.getComputedStyle(btnNewTemplate).visibility,
      pointerEvents: window.getComputedStyle(btnNewTemplate).pointerEvents,
      zIndex: window.getComputedStyle(btnNewTemplate).zIndex
    });
  }
  if (btnImportTemplate) {
    const hasListener = btnImportTemplate._clickHandler !== undefined;
    console.log('[DocumentCenterTemplatesPage] 导入按钮事件绑定状态:', hasListener);
  }
  
  // 加载模板列表
  await loadTemplates();
  
  // 不再自动创建或更新任何模板，完全由用户手动管理
  // 如果需要创建默认模板，可以通过导入模板文件或手动创建
  
  console.log('[DocumentCenterTemplatesPage] ========== 初始化完成 ==========');
  
  // 将 openTemplateEditor 导出到全局
  window.openDocumentTemplateEditor = openTemplateEditor;
}

// 注意：已移除setupGlobalEventListener函数，改为在bindEvents中统一处理

/**
 * 等待DOM元素加载完成
 */
function waitForDOM() {
  return new Promise((resolve) => {
    const checkDOM = () => {
      const btnNewTemplate = document.getElementById('btnNewTemplate');
      const btnImportTemplate = document.getElementById('btnImportTemplate');
      const panelActions = document.querySelector('#view-document-center-templates .panel-actions');
      
      if (btnNewTemplate && btnImportTemplate && panelActions) {
        console.log('[DocumentCenterTemplatesPage] DOM已加载，所有按钮已找到');
        resolve();
      } else {
        console.log('[DocumentCenterTemplatesPage] 等待DOM加载...', {
          btnNewTemplate: !!btnNewTemplate,
          btnImportTemplate: !!btnImportTemplate,
          panelActions: !!panelActions
        });
        setTimeout(checkDOM, 50);
      }
    };
    checkDOM();
  });
}

/**
 * 绑定事件
 * 优化：统一使用事件委托，避免重复绑定
 */
function bindEvents() {
  console.log('[DocumentCenterTemplatesPage] ========== 开始绑定事件 ==========');
  
  // 清除之前的绑定标记，允许重新绑定（确保事件总是能正确绑定）
  if (window._documentCenterTemplatesEventsBound) {
    console.log('[DocumentCenterTemplatesPage] 检测到之前的绑定，清除旧绑定后重新绑定');
    // 清除标记，继续执行绑定逻辑
    window._documentCenterTemplatesEventsBound = false;
  }
  
  // 使用事件委托统一处理所有按钮点击
  const panelActions = document.querySelector('#view-document-center-templates .panel-actions');
  if (panelActions) {
    console.log('[DocumentCenterTemplatesPage] 找到 panel-actions 元素，使用事件委托');
    
    // 移除可能存在的旧监听器
    if (panelActions._boundHandler) {
      panelActions.removeEventListener('click', panelActions._boundHandler, true);
    }
    
    const handlePanelClick = async (e) => {
      // 检查点击的元素是否是按钮或其子元素
      let btn = e.target.closest('button');
      
      // 如果点击的不是按钮，尝试从点击的元素向上查找按钮
      if (!btn) {
        // 检查点击的元素本身是否是按钮
        if (e.target.tagName === 'BUTTON') {
          btn = e.target;
        } else {
          // 向上查找最近的按钮父元素
          let element = e.target;
          while (element && element !== panelActions) {
            if (element.tagName === 'BUTTON') {
              btn = element;
              break;
            }
            element = element.parentElement;
          }
        }
      }
      
      if (!btn) {
        console.log('[DocumentCenterTemplatesPage] 点击的不是按钮元素，target:', e.target);
        return;
      }
      
      // 检查按钮是否有ID
      if (!btn.id) {
        console.log('[DocumentCenterTemplatesPage] 按钮没有ID，跳过处理');
        return;
      }
      
      console.log('[DocumentCenterTemplatesPage] 按钮被点击，ID:', btn.id, '按钮元素:', btn);
      
      // 新建模板按钮
      if (btn.id === 'btnNewTemplate') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[DocumentCenterTemplatesPage] ✅ 新建模板按钮被点击（事件委托）', e);
        try {
          window.location.hash = '#/document-center/template-editor';
          console.log('[DocumentCenterTemplatesPage] 已设置路由跳转（事件委托）');
        } catch (error) {
          console.error('[DocumentCenterTemplatesPage] 路由跳转失败（事件委托）:', error);
          window.NotificationSystem?.toast('打开模板编辑器失败: ' + (error.message || String(error)), 'error');
        }
        return;
      }
      
      // 导入模板按钮
      if (btn.id === 'btnImportTemplate') {
        e.preventDefault();
        e.stopPropagation();
        console.log('[DocumentCenterTemplatesPage] ✅ 导入模板按钮被点击');
        await handleImportTemplate(e);
        return;
      }
      
      // 删除所有模板按钮
      if (btn.id === 'btnDeleteAllTemplates') {
        e.preventDefault();
        e.stopPropagation();
        console.log('[DocumentCenterTemplatesPage] ✅ 删除所有模板按钮被点击');
        await deleteAllTemplates();
        return;
      }
    };
    
    // 使用capture阶段确保能捕获到事件
    panelActions.addEventListener('click', handlePanelClick, { capture: true });
    panelActions._boundHandler = handlePanelClick;
    console.log('[DocumentCenterTemplatesPage] 事件委托已绑定到 panel-actions');
    
    // 同时直接绑定到按钮上作为备用方案
    const btnNewTemplate = document.getElementById('btnNewTemplate');
    const btnImportTemplate = document.getElementById('btnImportTemplate');
    const btnDeleteAllTemplates = document.getElementById('btnDeleteAllTemplates');
    
    // 移除可能存在的旧监听器，防止重复绑定
    if (btnNewTemplate) {
      // 移除所有可能的事件监听器
      if (btnNewTemplate._clickHandler) {
        btnNewTemplate.removeEventListener('click', btnNewTemplate._clickHandler, true);
        btnNewTemplate.removeEventListener('click', btnNewTemplate._clickHandler, false);
      }
      
      // 创建新的事件处理函数
      btnNewTemplate._clickHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[DocumentCenterTemplatesPage] ✅ 新建模板按钮（直接绑定）被点击', e);
        try {
          window.location.hash = '#/document-center/template-editor';
          console.log('[DocumentCenterTemplatesPage] 已设置路由跳转');
        } catch (error) {
          console.error('[DocumentCenterTemplatesPage] 路由跳转失败:', error);
          window.NotificationSystem?.toast('打开模板编辑器失败: ' + (error.message || String(error)), 'error');
        }
      };
      
      // 同时使用 capture 和 bubble 阶段绑定，确保能捕获到事件
      btnNewTemplate.addEventListener('click', btnNewTemplate._clickHandler, { capture: true });
      btnNewTemplate.addEventListener('click', btnNewTemplate._clickHandler, { capture: false });
      
      // 添加备用方案：直接在按钮上设置 onclick 属性（最可靠的方式）
      btnNewTemplate.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[DocumentCenterTemplatesPage] ✅ 新建模板按钮（onclick属性）被点击', e);
        try {
          window.location.hash = '#/document-center/template-editor';
          console.log('[DocumentCenterTemplatesPage] 已设置路由跳转（onclick属性）');
        } catch (error) {
          console.error('[DocumentCenterTemplatesPage] 路由跳转失败（onclick属性）:', error);
          window.NotificationSystem?.toast('打开模板编辑器失败: ' + (error.message || String(error)), 'error');
        }
      };
      
      console.log('[DocumentCenterTemplatesPage] 新建模板按钮直接绑定完成（capture + bubble + onclick）');
      
      // 验证按钮是否可点击
      if (btnNewTemplate.disabled) {
        console.warn('[DocumentCenterTemplatesPage] ⚠️ 新建模板按钮被禁用');
      }
      if (btnNewTemplate.style.pointerEvents === 'none') {
        console.warn('[DocumentCenterTemplatesPage] ⚠️ 新建模板按钮 pointer-events 为 none');
      }
      
      // 测试按钮是否真的可以点击（添加一个测试监听器）
      btnNewTemplate.addEventListener('mousedown', () => {
        console.log('[DocumentCenterTemplatesPage] 新建模板按钮 mousedown 事件触发');
      }, { once: true });
    } else {
      console.warn('[DocumentCenterTemplatesPage] ⚠️ 新建模板按钮未找到');
    }
    
    if (btnImportTemplate) {
      if (btnImportTemplate._clickHandler) {
        btnImportTemplate.removeEventListener('click', btnImportTemplate._clickHandler);
      }
      btnImportTemplate._clickHandler = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[DocumentCenterTemplatesPage] ✅ 导入模板按钮（直接绑定）被点击', e);
        try {
          await handleImportTemplate(e);
        } catch (error) {
          console.error('[DocumentCenterTemplatesPage] 导入模板失败:', error);
          window.NotificationSystem?.toast('导入模板失败: ' + (error.message || String(error)), 'error');
        }
      };
      // 使用capture阶段确保能捕获到事件
      btnImportTemplate.addEventListener('click', btnImportTemplate._clickHandler, { capture: true });
      // 同时使用bubble阶段作为备用
      btnImportTemplate.addEventListener('click', btnImportTemplate._clickHandler, { capture: false });
      console.log('[DocumentCenterTemplatesPage] 导入模板按钮直接绑定完成（capture + bubble）');
    } else {
      console.warn('[DocumentCenterTemplatesPage] ⚠️ 导入模板按钮未找到');
    }
    
    if (btnDeleteAllTemplates) {
      if (btnDeleteAllTemplates._clickHandler) {
        btnDeleteAllTemplates.removeEventListener('click', btnDeleteAllTemplates._clickHandler);
      }
      btnDeleteAllTemplates._clickHandler = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[DocumentCenterTemplatesPage] ✅ 删除所有模板按钮（直接绑定）被点击');
        await deleteAllTemplates();
      };
      btnDeleteAllTemplates.addEventListener('click', btnDeleteAllTemplates._clickHandler);
      console.log('[DocumentCenterTemplatesPage] 删除所有模板按钮直接绑定完成');
    } else {
      console.warn('[DocumentCenterTemplatesPage] ⚠️ 删除所有模板按钮未找到');
    }
    
    // 标记已绑定
    window._documentCenterTemplatesEventsBound = true;
    console.log('[DocumentCenterTemplatesPage] 事件委托已绑定到 panel-actions，直接绑定也已完成');
  } else {
    console.warn('[DocumentCenterTemplatesPage] ⚠️ panel-actions 未找到，延迟重试');
    // 延迟重试（DOM可能还未加载完成）
    setTimeout(() => {
      if (!window._documentCenterTemplatesEventsBound) {
        bindEvents();
      }
    }, 100);
  }

  // 绑定筛选事件
  bindFilterEvents();

  // 设置快速筛选标签
  setupQuickFilters();

  // 设置筛选折叠功能
  setupFilterToggle();
  
  // 模板列表事件委托（同时支持表格和卡片布局）
  // 使用事件委托在容器和tbody上监听，确保能捕获到所有点击事件
  const bindTemplateListEvents = () => {
    const container = document.querySelector('.template-list-container');
    const tbody = document.getElementById('templateListBody');
    
    // 在容器上绑定事件（用于卡片布局）
    if (container) {
      // 移除可能存在的旧监听器
      if (container._templateListHandler) {
        container.removeEventListener('click', container._templateListHandler, true);
      }
      // 使用capture阶段确保能捕获到事件
      container.addEventListener('click', handleTemplateListClick, { capture: true });
      container._templateListHandler = handleTemplateListClick;
      console.log('[DocumentCenterTemplatesPage] 容器事件委托已绑定');
    } else {
      console.warn('[DocumentCenterTemplatesPage] ⚠️ template-list-container 未找到，延迟重试');
      setTimeout(bindTemplateListEvents, 100);
    }
    
    // 在tbody上绑定事件（用于表格布局，更直接可靠）
    if (tbody) {
      // 移除可能存在的旧监听器
      if (tbody._templateListHandler) {
        tbody.removeEventListener('click', tbody._templateListHandler, true);
      }
      // 使用capture阶段确保能捕获到事件
      tbody.addEventListener('click', handleTemplateListClick, { capture: true });
      tbody._templateListHandler = handleTemplateListClick;
      console.log('[DocumentCenterTemplatesPage] tbody事件委托已绑定');
    } else {
      console.warn('[DocumentCenterTemplatesPage] ⚠️ templateListBody 未找到，延迟重试');
      setTimeout(bindTemplateListEvents, 100);
    }
  };
  
  // 立即尝试绑定，如果失败则延迟重试
  bindTemplateListEvents();
  
  // 添加窗口大小改变监听器，使用节流优化性能
  const throttledResize = throttle(async () => {
    await renderTemplateList();
  }, DEBOUNCE_DELAY.RESIZE);
  
  window.addEventListener('resize', throttledResize);
  
  console.log('[DocumentCenterTemplatesPage] ========== 事件绑定完成 ==========');
}

/**
 * 加载模板列表
 */
async function loadTemplates() {
  try {
    templates = await DocumentCenterService.listTemplates();
    filteredTemplates = templates;
    await renderTemplateList(); // 使用 await 因为新函数是异步的
    updateActiveFiltersCount();
  } catch (error) {
    DocumentCenterErrorHandler.handle(error, 'loadTemplates');
  }
}

/**
 * 获取当前筛选条件
 */
function getFilters() {
  const templateSearch = document.getElementById('templateSearch');
  const templateTypeFilter = document.getElementById('templateTypeFilter');
  const templateCreatorFilter = document.getElementById('templateCreatorFilter');
  
  return {
    search: templateSearch?.value?.trim() || '',
    type: templateTypeFilter?.value || '',
    creator: templateCreatorFilter?.value?.trim() || ''
  };
}

/**
 * 筛选模板
 * @description 根据当前筛选条件筛选模板列表
 * @returns {void}
 */
async function filterTemplates() {
  const filters = getFilters();
  
  filteredTemplates = templates.filter(template => {
    const matchSearch = !filters.search || 
      template.name.toLowerCase().includes(filters.search.toLowerCase());
    const matchType = !filters.type || template.type === filters.type;
    const matchCreator = !filters.creator || 
      (template.createdBy && template.createdBy.toString().toLowerCase().includes(filters.creator.toLowerCase()));
    
    return matchSearch && matchType && matchCreator;
  });
  
  await renderTemplateList(); // 使用 await 因为新函数是异步的
  updateActiveFiltersCount();
}

/**
 * 初始化防抖筛选函数
 */
/**
 * 初始化防抖筛选函数
 * @returns {Function} 防抖后的筛选函数
 */
function initDebouncedFilter() {
  if (!debouncedFilter) {
    debouncedFilter = debounce(async () => {
      await filterTemplates();
    }, DEBOUNCE_DELAY.FILTER);
  }
  return debouncedFilter;
}

/**
 * 更新活跃筛选条件计数
 */
function updateActiveFiltersCount() {
  const activeFiltersCountEl = document.getElementById('activeFiltersCount');
  if (!activeFiltersCountEl) return;
  
  const filters = getFilters();
  const count = Object.values(filters).filter(v => v).length;
  
  activeFiltersCountEl.textContent = count > 0 ? `(${count}个条件)` : '(0个条件)';
  
  if (count > 0) {
    activeFiltersCountEl.classList.add('has-filters');
  } else {
    activeFiltersCountEl.classList.remove('has-filters');
  }
}

/**
 * 绑定筛选事件
 */
function bindFilterEvents() {
  // 初始化防抖函数
  const debouncedFilterFn = initDebouncedFilter();
  
  // 输入框字段 - 使用防抖优化性能
  const inputFields = ['templateSearch', 'templateCreatorFilter'];
  inputFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field && !field.hasAttribute('data-filter-bound')) {
      field.setAttribute('data-filter-bound', 'true');
      field.addEventListener('input', debouncedFilterFn);
    }
  });
  
  // 下拉选择字段
  const selectFields = ['templateTypeFilter'];
  selectFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field && !field.hasAttribute('data-filter-bound')) {
      field.setAttribute('data-filter-bound', 'true');
      field.addEventListener('change', async () => {
        await filterTemplates();
        updateActiveFiltersCount();
      });
    }
  });
  
  // 清空筛选按钮
  const btnClearFilters = document.getElementById('btnClearTemplateFilters');
  if (btnClearFilters && !btnClearFilters.hasAttribute('data-filter-bound')) {
    btnClearFilters.setAttribute('data-filter-bound', 'true');
    btnClearFilters.addEventListener('click', async () => {
      const fields = ['templateSearch', 'templateTypeFilter', 'templateCreatorFilter'];
      fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
      });
      
      // 重置快速筛选标签
      const filterTags = document.querySelectorAll('.filter-tag');
      filterTags.forEach(tag => {
        tag.classList.toggle('active', tag.getAttribute('data-filter') === 'all');
      });
      
      await filterTemplates();
    });
  }
}

/**
 * 设置快速筛选标签
 */
function setupQuickFilters() {
  const filterTags = document.querySelectorAll('.filter-tag');
  const templateTypeFilter = document.getElementById('templateTypeFilter');
  
  if (!filterTags.length || !templateTypeFilter) return;
  
  filterTags.forEach(tag => {
    if (!tag.hasAttribute('data-quick-filter-bound')) {
      tag.setAttribute('data-quick-filter-bound', 'true');
      tag.addEventListener('click', async () => {
        const filter = tag.getAttribute('data-filter');
        
        // 更新标签状态
        filterTags.forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        
        // 更新筛选条件
        if (filter === 'all') {
          templateTypeFilter.value = '';
        } else {
          templateTypeFilter.value = filter;
        }
        
        await filterTemplates();
        updateActiveFiltersCount();
      });
    }
  });
}

/**
 * 设置筛选折叠功能
 */
function setupFilterToggle() {
  const filterToggleHeader = document.getElementById('filterToggleHeader');
  const filterBody = document.getElementById('filterBody');
  const filterToggleIcon = document.getElementById('filterToggleIcon');
  
  if (!filterToggleHeader || !filterBody || !filterToggleIcon) return;
  
  // 默认折叠
  filterBody.classList.add('collapsed');
  filterToggleIcon.classList.remove('rotated');
  
  if (!filterToggleHeader.hasAttribute('data-toggle-bound')) {
    filterToggleHeader.setAttribute('data-toggle-bound', 'true');
    filterToggleHeader.addEventListener('click', (e) => {
      // 如果点击的是清空筛选按钮，不触发折叠
      if (e.target.closest('#btnClearTemplateFilters')) return;
      
      filterBody.classList.toggle('collapsed');
      filterToggleIcon.classList.toggle('rotated');
      
      if (!filterBody.classList.contains('collapsed')) {
        setTimeout(() => {
          filterBody.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    });
  }
}

/**
 * 检查模板格式（已废弃：系统只支持新格式）
 * @param {Object} template - 模板对象
 * @returns {Object} { isNewFormat: boolean, formatText: string, formatClass: string }
 * @deprecated 系统只支持新格式，不再需要格式检查
 */
function checkTemplateFormat(template) {
  // 系统只支持新格式，不再显示格式标签
  // 返回空格式信息，不显示任何格式标签
  return {
    isNewFormat: true,
    formatText: '',
    formatClass: '',
    formatIcon: ''
  };
}

/**
 * 渲染模板列表（使用优化后的渲染器）
 * @description 使用新的模板列表渲染器，提供更好的性能和设备适配
 */
async function renderTemplateList() {
  // 使用新的模板列表渲染器
  await renderTemplateListNew({
    templates: filteredTemplates,
    getValidationStatus: getTemplateValidationStatus,
    onProgress: (current, total) => {
      // 可选：显示加载进度
      if (current < total) {
        console.log(`[DocumentCenterTemplatesPage] 加载验证状态: ${current}/${total}`);
      }
    },
    ensureEventBinding: () => {
      // 确保事件绑定
      bindTemplateListEvents();
    }
  });
}

/**
 * 绑定模板列表事件（用于事件委托）
 */
function bindTemplateListEvents() {
  const container = document.querySelector('.template-list-container');
  const tbody = document.getElementById('templateListBody');
  
  // 在容器上绑定事件（用于卡片布局）
  if (container) {
    if (container._templateListHandler) {
      container.removeEventListener('click', container._templateListHandler, true);
    }
    container.addEventListener('click', handleTemplateListClick, { capture: true });
    container._templateListHandler = handleTemplateListClick;
  }
  
  // 在tbody上绑定事件（用于表格布局）
  if (tbody) {
    if (tbody._templateListHandler) {
      tbody.removeEventListener('click', tbody._templateListHandler, true);
    }
    tbody.addEventListener('click', handleTemplateListClick, { capture: true });
    tbody._templateListHandler = handleTemplateListClick;
  }
}

/**
 * 渲染模板列表（旧版本，保留作为备用）
 * @deprecated 已使用新的模板列表渲染器，此函数保留作为备用
 */
function renderTemplateListOld() {
  const tbody = document.getElementById('templateListBody');
  const container = document.querySelector('.template-list-container');
  if (!tbody || !container) return;
  
  // 确保事件委托已绑定（在渲染后重新检查并绑定）
  setTimeout(() => {
    const tbodyEl = document.getElementById('templateListBody');
    const containerEl = document.querySelector('.template-list-container');
    
    // 确保tbody事件已绑定
    if (tbodyEl && !tbodyEl._templateListHandler) {
      console.log('[DocumentCenterTemplatesPage] 渲染后检测到tbody事件未绑定，重新绑定');
      tbodyEl.addEventListener('click', handleTemplateListClick, { capture: true });
      tbodyEl._templateListHandler = handleTemplateListClick;
    }
    
    // 确保容器事件已绑定（用于卡片布局）
    if (containerEl && !containerEl._templateListHandler) {
      console.log('[DocumentCenterTemplatesPage] 渲染后检测到容器事件未绑定，重新绑定');
      containerEl.addEventListener('click', handleTemplateListClick, { capture: true });
      containerEl._templateListHandler = handleTemplateListClick;
    }
  }, 50);

  // 检测是否为移动端（768px以下）
  const isMobile = DocumentCenterUtils.isMobile();
  
  if (filteredTemplates.length === 0) {
    if (isMobile) {
      // 移动端显示空状态
      const cardsContainer = container.querySelector('.template-cards-container');
      if (cardsContainer) {
        cardsContainer.innerHTML = '<div style="text-align:center; padding:40px 20px; color:#999; font-size:14px;">暂无模板</div>';
      } else {
        container.innerHTML = '<div class="template-cards-container"><div style="text-align:center; padding:40px 20px; color:#999; font-size:14px;">暂无模板</div></div>';
      }
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">暂无模板</td></tr>';
    }
    return;
  }

  // 使用常量中的类型名称映射

  if (isMobile) {
    // 移动端：卡片布局
    let cardsContainer = container.querySelector('.template-cards-container');
    if (!cardsContainer) {
      // 隐藏表格，创建卡片容器
      const table = container.querySelector('#templateListTable');
      if (table) {
        table.style.display = 'none';
      }
      cardsContainer = document.createElement('div');
      cardsContainer.className = 'template-cards-container';
      container.appendChild(cardsContainer);
    }
    
    // 异步加载验证状态（移动端卡片视图）
    const validationPromises = filteredTemplates.map(template => 
      getTemplateValidationStatus(template).then(status => ({ template, status }))
    );
    
    Promise.all(validationPromises).then(results => {
      cardsContainer.innerHTML = results.map(({ template, status }) => {
        const formatInfo = checkTemplateFormat(template);
        return `
          <div class="template-card">
            <div class="template-card-header">
              <h3 class="template-card-title" data-template-name="${escapeHtml(template.name)}" style="cursor: pointer; user-select: text;" title="点击复制模板名称">${escapeHtml(template.name)}</h3>
            <div class="template-card-actions">
              ${!template.isDefault ? `<button class="btn secondary" data-action="setDefault" data-id="${template.id}" title="设为默认">⭐</button>` : '<span title="默认模板" style="font-size:18px;">⭐</span>'}
            </div>
          </div>
          <div class="template-card-content">
            <div class="template-card-item">
              <div class="template-card-label">✓ 验证状态</div>
              <div class="template-card-value" style="color: ${status.color};">
                ${status.hasDetails ? `
                  <span class="validation-status-clickable" data-template-id="${template.id}" style="cursor: pointer; text-decoration: underline; text-decoration-style: dotted;" title="点击查看详情">
                    ${status.icon} ${status.text}
                  </span>
                ` : `
                  <span>${status.icon} ${status.text}</span>
                `}
              </div>
            </div>
            <div class="template-card-item">
              <div class="template-card-label">📑 类型</div>
              <div class="template-card-value">${DOCUMENT_TYPE_NAMES[template.type] || template.type}</div>
            </div>
            <div class="template-card-item">
              <div class="template-card-label">📅 创建时间</div>
              <div class="template-card-value">${formatDate(template.createdAt)}</div>
            </div>
            <div class="template-card-item">
              <div class="template-card-label">👤 创建人</div>
              <div class="template-card-value">${template.createdBy || '-'}</div>
            </div>
            <div class="template-card-item">
              <div class="template-card-label">🔄 最后修改</div>
              <div class="template-card-value">${formatDate(template.updatedAt)}</div>
            </div>
          </div>
          <div class="template-card-footer">
            <button class="btn secondary" data-action="edit" data-id="${template.id}" title="编辑">✏️ 编辑</button>
            <button class="btn secondary" data-action="copy" data-id="${template.id}" title="复制">📋 复制</button>
            <button class="btn secondary" data-action="export" data-id="${template.id}" title="导出">📤 导出</button>
            <button class="btn danger" data-action="delete" data-id="${template.id}" title="删除">🗑️ 删除</button>
          </div>
        </div>
      `;
      }).join('');
    }).catch(error => {
      console.error('[DocumentCenterTemplatesPage] 加载验证状态失败:', error);
      // 如果验证失败，仍然显示模板列表
      cardsContainer.innerHTML = filteredTemplates.map(template => {
        const formatInfo = checkTemplateFormat(template);
        return `
          <div class="template-card">
            <div class="template-card-header">
              <h3 class="template-card-title" data-template-name="${escapeHtml(template.name)}" style="cursor: pointer; user-select: text;" title="点击复制模板名称">${escapeHtml(template.name)}</h3>
              <div class="template-card-actions">
                ${!template.isDefault ? `<button class="btn secondary" data-action="setDefault" data-id="${template.id}" title="设为默认">⭐</button>` : '<span title="默认模板" style="font-size:18px;">⭐</span>'}
              </div>
            </div>
            <div class="template-card-content">
              <div class="template-card-item">
                <div class="template-card-label">✓ 验证状态</div>
                <div class="template-card-value" style="color: #64748b;">⏳ 验证中...</div>
              </div>
              <div class="template-card-item">
                <div class="template-card-label">📑 类型</div>
                <div class="template-card-value">${DOCUMENT_TYPE_NAMES[template.type] || template.type}</div>
              </div>
              <div class="template-card-item">
                <div class="template-card-label">📅 创建时间</div>
                <div class="template-card-value">${formatDate(template.createdAt)}</div>
              </div>
              <div class="template-card-item">
                <div class="template-card-label">👤 创建人</div>
                <div class="template-card-value">${template.createdBy || '-'}</div>
              </div>
              <div class="template-card-item">
                <div class="template-card-label">🔄 最后修改</div>
                <div class="template-card-value">${formatDate(template.updatedAt)}</div>
              </div>
            </div>
            <div class="template-card-footer">
              <button class="btn secondary" data-action="edit" data-id="${template.id}" title="编辑">✏️ 编辑</button>
              <button class="btn secondary" data-action="copy" data-id="${template.id}" title="复制">📋 复制</button>
              <button class="btn secondary" data-action="export" data-id="${template.id}" title="导出">📤 导出</button>
              <button class="btn danger" data-action="delete" data-id="${template.id}" title="删除">🗑️ 删除</button>
            </div>
          </div>
        `;
      }).join('');
    });
  } else {
    // 桌面端：表格布局
    const cardsContainer = container.querySelector('.template-cards-container');
    if (cardsContainer) {
      cardsContainer.remove();
    }
    const table = container.querySelector('#templateListTable');
    if (table) {
      table.style.display = '';
    }
    
    // 异步加载验证状态（桌面端表格视图）
    const validationPromises = filteredTemplates.map(template => 
      getTemplateValidationStatus(template).then(status => ({ template, status }))
    );
    
    Promise.all(validationPromises).then(results => {
      tbody.innerHTML = results.map(({ template, status }) => {
        const formatInfo = checkTemplateFormat(template);
        return `
          <tr>
            <td style="padding: 12px; text-align: center; font-size: 13px;"><span class="template-name-copyable" data-template-name="${escapeHtml(template.name)}" style="cursor: pointer; user-select: text;" title="点击复制模板名称">${escapeHtml(template.name)}</span></td>
            <td style="padding: 12px; text-align: center; font-size: 13px;">${DOCUMENT_TYPE_NAMES[template.type] || template.type}</td>
            <td style="padding: 12px; text-align: center;">
              ${status.hasDetails ? `
                <span class="validation-status-clickable" data-template-id="${template.id}" style="color: ${status.color}; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; cursor: pointer; text-decoration: underline; text-decoration-style: dotted;" title="点击查看详情">
                  ${status.icon} ${status.text}
                </span>
              ` : `
                <span style="color: ${status.color}; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;" title="${status.tooltip || ''}">
                  ${status.icon} ${status.text}
                </span>
              `}
            </td>
            <td style="padding: 12px; text-align: center; font-size: 13px; white-space: nowrap;">${formatDate(template.createdAt)}</td>
            <td style="padding: 12px; text-align: center; font-size: 13px; white-space: nowrap;">${formatDate(template.updatedAt)}</td>
            <td style="padding: 12px; text-align: center; font-size: 13px;">${template.createdBy || '-'}</td>
            <td style="padding: 6px 4px; text-align: center; overflow: visible; position: relative; z-index: 10;">
              <div style="display: flex; gap: 4px; flex-wrap: nowrap; justify-content: center; align-items: center; overflow: visible; position: relative; z-index: 11;">
                <button class="btn secondary" data-action="edit" data-id="${template.id}" title="编辑" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">✏️</button>
                <button class="btn secondary" data-action="copy" data-id="${template.id}" title="复制" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">📋</button>
                <button class="btn secondary" data-action="export" data-id="${template.id}" title="导出" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">📤</button>
                ${!template.isDefault ? `<button class="btn secondary" data-action="setDefault" data-id="${template.id}" title="设为默认" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">⭐</button>` : '<span title="默认模板" style="flex-shrink: 0; display: inline-block; min-width: 32px; text-align: center; font-size: 16px;">⭐</span>'}
                <button class="btn danger" data-action="delete" data-id="${template.id}" title="删除" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }).catch(error => {
      console.error('[DocumentCenterTemplatesPage] 加载验证状态失败:', error);
      // 如果验证失败，仍然显示模板列表，但不显示验证状态
      tbody.innerHTML = filteredTemplates.map(template => {
        const formatInfo = checkTemplateFormat(template);
        return `
          <tr>
            <td style="padding: 12px; text-align: center; font-size: 13px;"><span class="template-name-copyable" data-template-name="${escapeHtml(template.name)}" style="cursor: pointer; user-select: text;" title="点击复制模板名称">${escapeHtml(template.name)}</span></td>
            <td style="padding: 12px; text-align: center; font-size: 13px;">${DOCUMENT_TYPE_NAMES[template.type] || template.type}</td>
            <td style="padding: 12px; text-align: center;">
              <span style="color: #64748b; font-size: 13px; white-space: nowrap;">⏳ 验证中...</span>
            </td>
            <td style="padding: 12px; text-align: center; font-size: 13px; white-space: nowrap;">${formatDate(template.createdAt)}</td>
            <td style="padding: 12px; text-align: center; font-size: 13px; white-space: nowrap;">${formatDate(template.updatedAt)}</td>
            <td style="padding: 12px; text-align: center; font-size: 13px;">${template.createdBy || '-'}</td>
            <td style="padding: 6px 4px; text-align: center; overflow: visible; position: relative; z-index: 10;">
              <div style="display: flex; gap: 4px; flex-wrap: nowrap; justify-content: center; align-items: center; overflow: visible; position: relative; z-index: 11;">
                <button class="btn secondary" data-action="edit" data-id="${template.id}" title="编辑" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">✏️</button>
                <button class="btn secondary" data-action="copy" data-id="${template.id}" title="复制" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">📋</button>
                <button class="btn secondary" data-action="export" data-id="${template.id}" title="导出" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">📤</button>
                ${!template.isDefault ? `<button class="btn secondary" data-action="setDefault" data-id="${template.id}" title="设为默认" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">⭐</button>` : '<span title="默认模板" style="flex-shrink: 0; display: inline-block; min-width: 32px; text-align: center; font-size: 16px;">⭐</span>'}
                <button class="btn danger" data-action="delete" data-id="${template.id}" title="删除" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px; font-size: 13px; line-height: 1.2;">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    });
  }
}

/**
 * 打开模板编辑器
 * @description 使用路由跳转方式打开模板编辑器，简化逻辑，提高可靠性
 * @param {string|number|null} templateId - 模板ID，如果为null则创建新模板
 * @returns {Promise<void>}
 */
export async function openTemplateEditor(templateId = null) {
  try {
    console.log('[DocumentCenterTemplatesPage] 打开模板编辑器，templateId:', templateId);
    
    // 直接使用路由跳转，避免复杂的Modal显示逻辑
    if (templateId) {
      window.location.hash = `#/document-center/template-editor?id=${encodeURIComponent(templateId)}`;
    } else {
      window.location.hash = '#/document-center/template-editor';
    }
    
    console.log('[DocumentCenterTemplatesPage] 已导航到模板编辑页面');
  } catch (error) {
    console.error('[DocumentCenterTemplatesPage] 打开编辑器失败:', error);
    window.NotificationSystem?.toast('打开编辑器失败: ' + (error.message || String(error)), 'error');
  }
}

/**
 * 显示模板验证详情
 * @param {Object} template - 模板对象
 */
async function showValidationDetails(template) {
  try {
    // 获取模板的HTML内容
    let html = '';
    if (template.html !== undefined) {
      html = template.html;
    } else if (template.config?.html !== undefined) {
      html = template.config.html;
    } else if (template.config?.canvas?.components) {
      html = template.config.canvas.components;
    }
    
    if (!html || html.trim() === '') {
      window.NotificationSystem?.toast('模板内容为空', 'warning');
      return;
    }
    
    // 动态导入TemplateValidator
    const { TemplateValidator } = await import('../../components/document-center/validator/template-validator.js');
    const validation = await TemplateValidator.validate(html);
    
    // 构建详情内容
    let detailsHtml = `<div style="max-width: 600px; max-height: 500px; overflow-y: auto;">`;
    detailsHtml += `<h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b;">模板验证详情：${escapeHtml(template.name)}</h3>`;
    
    // 显示错误
    if (validation.errors && validation.errors.length > 0) {
      detailsHtml += `<div style="margin-bottom: 20px;">`;
      detailsHtml += `<h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #ef4444;">❌ 错误 (${validation.errors.length})</h4>`;
      detailsHtml += `<ul style="margin: 0; padding-left: 20px; list-style: disc;">`;
      validation.errors.forEach((error, index) => {
        detailsHtml += `<li style="margin-bottom: 8px; font-size: 13px; color: #1e293b; line-height: 1.5;">`;
        detailsHtml += `<strong>${error.type || 'ERROR'}:</strong> ${escapeHtml(error.message || '未知错误')}`;
        if (error.position !== undefined) {
          detailsHtml += ` <span style="color: #64748b;">(位置: ${error.position})</span>`;
        }
        detailsHtml += `</li>`;
      });
      detailsHtml += `</ul></div>`;
    }
    
    // 显示警告
    if (validation.warnings && validation.warnings.length > 0) {
      detailsHtml += `<div style="margin-bottom: 20px;">`;
      detailsHtml += `<h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #f59e0b;">⚠️ 警告 (${validation.warnings.length})</h4>`;
      detailsHtml += `<ul style="margin: 0; padding-left: 20px; list-style: disc;">`;
      validation.warnings.forEach((warning, index) => {
        detailsHtml += `<li style="margin-bottom: 8px; font-size: 13px; color: #1e293b; line-height: 1.5;">`;
        detailsHtml += `<strong>${warning.type || 'WARNING'}:</strong> ${escapeHtml(warning.message || '未知警告')}`;
        if (warning.position !== undefined) {
          detailsHtml += ` <span style="color: #64748b;">(位置: ${warning.position})</span>`;
        }
        if (warning.variable) {
          detailsHtml += ` <span style="color: #64748b;">变量: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${escapeHtml(warning.variable)}</code></span>`;
        }
        detailsHtml += `</li>`;
      });
      detailsHtml += `</ul></div>`;
    }
    
    // 如果没有错误和警告
    if ((!validation.errors || validation.errors.length === 0) && 
        (!validation.warnings || validation.warnings.length === 0)) {
      detailsHtml += `<div style="padding: 20px; text-align: center; color: #10b981;">`;
      detailsHtml += `<div style="font-size: 48px; margin-bottom: 8px;">✓</div>`;
      detailsHtml += `<div style="font-size: 14px; font-weight: 600;">模板验证通过</div>`;
      detailsHtml += `</div>`;
    }
    
    detailsHtml += `</div>`;
    
    // 使用 ModalDialog.custom 显示详情
    if (window.ModalDialog) {
      const footerHtml = `
        <button class="btn primary" data-action="confirm" type="button">关闭</button>
      `;
      
      await window.ModalDialog.custom(detailsHtml, {
        title: '模板验证详情',
        footer: footerHtml,
        size: 'medium',
        closable: true,
        clickOutsideToClose: true,
        onConfirm: () => {
          return true; // 关闭弹窗
        }
      });
    } else {
      // 如果没有 ModalDialog，使用 alert
      alert('模板验证详情:\n\n' + 
        (validation.errors && validation.errors.length > 0 ? 
          '错误:\n' + validation.errors.map(e => `- ${e.type}: ${e.message}`).join('\n') + '\n\n' : '') +
        (validation.warnings && validation.warnings.length > 0 ? 
          '警告:\n' + validation.warnings.map(w => `- ${w.type}: ${w.message}`).join('\n') : ''));
    }
  } catch (error) {
    console.error('[DocumentCenterTemplatesPage] 显示验证详情失败:', error);
    window.NotificationSystem?.toast('显示验证详情失败: ' + (error.message || '未知错误'), 'error');
  }
}

/**
 * 删除模板
 */
async function deleteTemplate(id) {
  const template = templates.find(t => t.id == id);
  if (!template) return;

  const confirmed = await window.ModalDialog?.confirm(
    `确定要删除模板"${template.name}"吗？此操作不可恢复！`,
    {
      title: '确认删除',
      icon: '⚠️',
      confirmText: '确认删除',
      cancelText: '取消'
    }
  );

  if (!confirmed) return;

  try {
    await DocumentCenterService.deleteTemplate(id);
    window.NotificationSystem?.toast('模板已删除', 'success');
    await loadTemplates();
  } catch (error) {
    console.error('[DocumentCenterTemplatesPage] 删除模板失败:', error);
    window.NotificationSystem?.toast('删除模板失败: ' + error.message, 'error');
  }
}

/**
 * 处理导入模板
 */
async function handleImportTemplate(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  console.log('[DocumentCenterTemplatesPage] 开始导入模板，事件对象:', e);
  
  // 创建文件输入元素
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  
  // 清理文件输入元素的辅助函数
  const cleanupFileInput = () => {
    try {
      if (fileInput && fileInput.parentNode) {
        fileInput.parentNode.removeChild(fileInput);
      }
    } catch (error) {
      console.warn('[DocumentCenterTemplatesPage] 清理文件输入元素时出错:', error);
    }
  };
  
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) {
      console.log('[DocumentCenterTemplatesPage] 未选择文件');
      cleanupFileInput();
      return;
    }
    
    console.log('[DocumentCenterTemplatesPage] 选择的文件:', file.name);
    
    try {
      // 读取文件内容
      const text = await file.text();
      console.log('[DocumentCenterTemplatesPage] 文件内容长度:', text.length);
      
      // 解析JSON
      let templateData;
      try {
        templateData = JSON.parse(text);
      } catch (parseError) {
        throw new Error('JSON格式错误: ' + parseError.message);
      }
      
      // 验证模板格式
      const validationResult = validateTemplateFormat(templateData);
      if (!validationResult.valid) {
        throw new Error('模板格式验证失败: ' + validationResult.errors.join(', '));
      }
      
      // 转换模板格式（从新格式转换为数据库格式）
      const convertedTemplate = convertTemplateFormat(templateData);
      
      // 检查是否存在同名模板
      const existingTemplate = templates.find(t => t.name === convertedTemplate.name);
      if (existingTemplate) {
        const confirmed = await window.ModalDialog?.confirm(
          `模板"${convertedTemplate.name}"已存在，是否覆盖？`,
          {
            title: '模板冲突',
            icon: '⚠️',
            confirmText: '覆盖',
            cancelText: '取消'
          }
        );
        
        if (!confirmed) {
          console.log('[DocumentCenterTemplatesPage] 用户取消覆盖');
          cleanupFileInput();
          return;
        }
        
        // 更新现有模板
        try {
          await DocumentCenterService.updateTemplate(existingTemplate.id, convertedTemplate);
          window.NotificationSystem?.toast('模板导入成功（已覆盖）', 'success');
          await loadTemplates();
        } catch (error) {
          console.error('[DocumentCenterTemplatesPage] 更新模板失败:', error);
          throw new Error('更新模板失败: ' + error.message);
        }
      } else {
        // 创建新模板
        try {
          // 获取当前登录用户
          const currentUser = getUser();
          if (currentUser) {
            // 注意：后端会使用 req.user.id，但这里也设置一下以防万一
            convertedTemplate.createdBy = currentUser.username || currentUser.displayName || currentUser.id;
          }
          await DocumentCenterService.createTemplate(convertedTemplate);
          window.NotificationSystem?.toast('模板导入成功', 'success');
          await loadTemplates();
        } catch (error) {
          console.error('[DocumentCenterTemplatesPage] 创建模板失败:', error);
          throw new Error('创建模板失败: ' + error.message);
        }
      }
    } catch (error) {
      console.error('[DocumentCenterTemplatesPage] 导入模板失败:', error);
      window.NotificationSystem?.toast('导入失败: ' + error.message, 'error');
    } finally {
      // 清理文件输入
      cleanupFileInput();
    }
  });
  
  // 监听取消操作（当用户关闭文件选择对话框时）
  fileInput.addEventListener('cancel', () => {
    console.log('[DocumentCenterTemplatesPage] 用户取消文件选择');
    cleanupFileInput();
  });
  
  // 添加到DOM并触发点击
  document.body.appendChild(fileInput);
  
  // 使用 setTimeout 确保文件输入已添加到 DOM
  setTimeout(() => {
    try {
  fileInput.click();
    } catch (error) {
      console.error('[DocumentCenterTemplatesPage] 触发文件选择对话框失败:', error);
      cleanupFileInput();
      window.NotificationSystem?.toast('无法打开文件选择对话框', 'error');
    }
  }, 0);
}

/**
 * 验证模板格式
 */
function validateTemplateFormat(template) {
  const errors = [];
  
  // 检查必需字段
  if (!template.name && !template.type) {
    errors.push('缺少模板名称或类型');
  }
  
  // 检查类型是否有效
  const validTypes = Object.values(DOCUMENT_TYPES);
  if (template.type && !validTypes.includes(template.type)) {
    errors.push(`无效的模板类型: ${template.type}`);
  }
  
  // 检查是否有HTML内容或config
  if (!template.html && !template.config) {
    errors.push('缺少模板内容（html或config）');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 转换模板格式（从新格式转换为数据库格式）
 */
function convertTemplateFormat(template) {
  // 如果已经是数据库格式（有config字段），直接返回
  if (template.config) {
    return template;
  }
  
  // 转换新格式（从第一阶段提取的格式）为数据库格式
  // 保留新格式的字段在config中，以便TemplateRenderer能识别
  const converted = {
    name: template.name || '未命名模板',
    type: template.type || 'custom',
    isDefault: template.isDefault || false,
    config: {
      // 保留新格式字段，以便TemplateRenderer能正确识别
      html: template.html || '',
      styles: template.styles || '',
      // 同时保留在canvas中，以兼容旧格式
      canvas: {
        components: template.html || '',
        styles: template.styles || ''
      },
      margin: template.margin || { top: 20, bottom: 20, left: 20, right: 20 },
      calculations: template.calculations || [],
      conditions: template.conditions || {}
    }
  };
  
  // 保留其他字段（如description, version等）
  if (template.description) {
    converted.description = template.description;
  }
  if (template.version) {
    converted.version = template.version;
  }
  if (template.variables) {
    converted.config.variables = template.variables;
  }
  if (template.metadata) {
    converted.metadata = template.metadata;
  }
  
  return converted;
}

/**
 * 复制模板
 */
async function copyTemplate(id) {
  try {
    const template = await DocumentCenterService.getTemplate(id);
    if (!template) {
      window.NotificationSystem?.toast('模板不存在', 'error');
      return;
    }

    const newName = `${template.name}_副本`;
    // 获取当前登录用户
    const currentUser = getUser();
    const templateData = {
      name: newName,
      type: template.type,
      config: template.config,
      isDefault: false
    };
    if (currentUser) {
      templateData.createdBy = currentUser.username || currentUser.displayName || currentUser.id;
    }
    const newTemplate = await DocumentCenterService.createTemplate(templateData);

    window.NotificationSystem?.toast('模板已复制', 'success');
    await loadTemplates();
  } catch (error) {
    console.error('[DocumentCenterTemplatesPage] 复制模板失败:', error);
    window.NotificationSystem?.toast('复制模板失败: ' + error.message, 'error');
  }
}

/**
 * 导出模板
 */
async function exportTemplate(id) {
  try {
    const template = await DocumentCenterService.getTemplate(id);
    if (!template) {
      window.NotificationSystem?.toast('模板不存在', 'error');
      return;
    }

    const dataStr = JSON.stringify(template, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    window.NotificationSystem?.toast('模板已导出', 'success');
  } catch (error) {
    console.error('[DocumentCenterTemplatesPage] 导出模板失败:', error);
    window.NotificationSystem?.toast('导出模板失败: ' + error.message, 'error');
  }
}

/**
 * 删除所有模板
 */
async function deleteAllTemplates() {
  // 确认对话框
  const confirmed = confirm('⚠️ 警告：此操作将删除数据库中的所有模板，且无法恢复！\n\n确定要继续吗？');
  if (!confirmed) {
    return;
  }
  
  // 二次确认
  const doubleConfirmed = confirm('⚠️ 最后确认：您真的要删除所有模板吗？\n\n此操作不可撤销！');
  if (!doubleConfirmed) {
    return;
  }
  
  try {
    const deletedCount = await DocumentCenterService.deleteAllTemplates();
    window.NotificationSystem?.toast(`已成功删除所有模板，共 ${deletedCount} 个`, 'success');
    // 重新加载模板列表
    await loadTemplates();
  } catch (error) {
    console.error('[DocumentCenterTemplatesPage] 删除所有模板失败:', error);
    window.NotificationSystem?.toast('删除所有模板失败: ' + (error.message || '未知错误'), 'error');
  }
}

/**
 * 导入模板
 */
async function importTemplate() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const template = JSON.parse(text);
      
      // 验证模板数据
      if (!template.name || !template.type || !template.config) {
        window.NotificationSystem?.toast('模板文件格式不正确', 'error');
        return;
      }

      // 创建新模板
      // 获取当前登录用户
      const currentUser = getUser();
      const templateData = {
        name: template.name,
        type: template.type,
        config: template.config,
        isDefault: false
      };
      if (currentUser) {
        templateData.createdBy = currentUser.username || currentUser.displayName || currentUser.id;
      }
      await DocumentCenterService.createTemplate(templateData);

      window.NotificationSystem?.toast('模板已导入', 'success');
      await loadTemplates();
    } catch (error) {
      console.error('[DocumentCenterTemplatesPage] 导入模板失败:', error);
      window.NotificationSystem?.toast('导入模板失败: ' + error.message, 'error');
    }
  };
  input.click();
}

/**
 * 设为默认模板
 */
async function setDefaultTemplate(id) {
  try {
    const template = templates.find(t => t.id == id);
    if (!template) return;

    await DocumentCenterService.updateTemplate(id, {
      name: template.name,
      type: template.type,
      config: template.config,
      isDefault: true
    });

    window.NotificationSystem?.toast('已设为默认模板', 'success');
    await loadTemplates();
  } catch (error) {
    console.error('[DocumentCenterTemplatesPage] 设置默认模板失败:', error);
    window.NotificationSystem?.toast('设置默认模板失败: ' + error.message, 'error');
  }
}

/**
 * 工具函数：转义HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 工具函数：格式化日期
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return dateString;
  }
}

