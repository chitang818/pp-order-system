/**
 * 单据中心 - 模板编辑器V2页面
 * 使用新的区块引擎和可视化编辑器
 */
import { TemplateEditorV2 } from '../../components/document-center/template-editor-v2/index.js';
import DocumentCenterService from '../../services/document-center-service.js';

let editorInstance = null;

/**
 * 初始化模板编辑器V2页面
 */
export async function initDocumentCenterTemplateEditorV2Page() {
  console.log('[TemplateEditorV2] 初始化模板编辑器V2页面');
  
  // 获取视图容器
  const viewContainer = document.getElementById('view-document-center-template-editor');
  if (!viewContainer) {
    console.error('[TemplateEditorV2] 视图容器未找到');
    return;
  }

  // 解析URL参数
  let templateId = null;
  let templateType = null;
  const hash = location.hash || '';
  if (hash.includes('?')) {
    const hashParams = hash.split('?')[1];
    const params = new URLSearchParams(hashParams);
    templateId = params.get('id');
    templateType = params.get('type');
  }

  if (!templateId && !templateType) {
    const params = new URLSearchParams(window.location.search);
    templateId = params.get('id');
    templateType = params.get('type');
  }

  console.log('[TemplateEditorV2] 解析到的模板ID:', templateId, '类型:', templateType);

  // 清空容器，准备渲染新编辑器
  viewContainer.innerHTML = '<div id="template-editor-v2-container"></div>';

  // 加载模板数据（如果有）
  let template = null;
  if (templateId) {
    try {
      const backendTemplate = await DocumentCenterService.getTemplate(templateId);
      console.log('[TemplateEditorV2] 加载模板:', backendTemplate);
      
      // 将后端格式转换为编辑器内部格式
      // 后端格式: { id, name, type, config: { blocks, pageSettings, globalStyles, applicability }, isDefault }
      // 编辑器格式: { id, name, type, blocks, pageSettings, globalStyles, applicability }
      if (backendTemplate) {
        template = {
          id: backendTemplate.id,
          name: backendTemplate.name,
          type: backendTemplate.type,
          blocks: backendTemplate.config?.blocks || [],
          pageSettings: backendTemplate.config?.pageSettings || { 
            margin: { top: 15, bottom: 15, left: 15, right: 15 } 
          },
          globalStyles: backendTemplate.config?.globalStyles || { 
            fontFamily: 'Arial, "Microsoft YaHei", sans-serif', 
            fontSize: 11 
          },
          applicability: backendTemplate.config?.applicability || {
            isDefault: backendTemplate.isDefault || false,
            productTypes: [],
            customerIds: [],
            customerNames: [],
            priority: 0
          }
        };
      }
    } catch (error) {
      console.error('[TemplateEditorV2] 加载模板失败:', error);
      window.NotificationSystem?.toast('加载模板失败: ' + (error.message || String(error)), 'error');
    }
  }

  // 加载真实的公司数据用于预览（与单据生成页面保持一致）
  let mockData = null;
  try {
    const company = await window.ApiService?.company?.get?.() || {};
    console.log('[TemplateEditorV2] 加载公司数据:', company);
    
    // 构建与单据生成页面一致的数据结构
    mockData = {
      order: {
        contractNo: 'SC2025-001',
        invoiceNo: 'IV2025-001',
        invoiceDate: '2025-12-09',
        shipmentDate: '2025-12-25',
        destination: 'KOBE, JAPAN',
        payment: 'T/T',
        insurance: 'BY BUYER',
        totalValue: 'USD16643.60',
        specialClause: 'N/A',
        remarks: 'Please confirm',
        items: [
          { 
            model: 'D#319-II', 
            quantity: 960, 
            packages: 6, 
            unit: '托盘',
            unitPrice: 4.96, 
            price: 4.96,
            packing: '160条/托盘',
            amount: 4761.60
          },
          { 
            model: 'D#66(5)JB', 
            quantity: 300, 
            packages: 30, 
            unit: '件',
            unitPrice: 3.69, 
            price: 3.69,
            packing: '10条/件',
            amount: 1107.00
          }
        ]
      },
      customer: {
        name: 'DAINEN TRADING CO.,LTD',
        address: '123 Sample Street, Tokyo, Japan',
        tel: '03-1234-5678',
        fax: '03-1234-5679'
      },
      company: {
        companyNameEN: company.companyNameEN || 'QINGDAO SHENGCHI PACKAGING PRODUCT CO.,LTD',
        companyNameCN: company.companyNameCN || '青岛盛驰包装制品有限公司',
        companyAddressEN: company.companyAddressEN || 'NO7 NUODALU AISHAN INDUSTRIAL PARK, QINGDAO, CHINA',
        companyAddressCN: company.companyAddressCN || '青岛市崂山区工业园7号',
        companyTel: company.companyTel || '0532-83161609',
        companyFax: company.companyFax || '0532-83161772'
      }
    };
  } catch (error) {
    console.warn('[TemplateEditorV2] 加载公司数据失败，使用默认数据:', error);
    // 如果加载失败，使用默认数据（在 TemplateEditorV2 中定义）
    mockData = null;
  }

  // 创建编辑器实例
  // 如果没有加载到模板，且没有templateId，说明是新建模板
  // 使用URL参数中的type，如果没有则默认为'sales'
  const defaultType = templateType || 'sales';
  editorInstance = new TemplateEditorV2('template-editor-v2-container', {
    template: template || {
      id: templateId ? `existing_${templateId}` : `new_${Date.now()}`,
      name: '新建模板',
      type: defaultType,
      blocks: [],
      pageSettings: {
        margin: { top: 15, bottom: 15, left: 15, right: 15 }
      },
      globalStyles: {
        fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
        fontSize: 11
      },
      applicability: {
        isDefault: false,
        productTypes: [],
        customerIds: [],
        customerNames: [],
        priority: 0
      }
    },
    mockData: mockData, // 传递真实的公司数据
    onSave: handleSave,
    onBack: handleBack
  });

  // 初始化编辑器（异步）
  await editorInstance.init();
}

/**
 * 保存模板
 */
async function handleSave(templateData) {
  try {
    console.log('[TemplateEditorV2] 保存模板:', templateData);
    
    // 判断是新建还是更新
    // 临时ID以 new_ 或 existing_ 开头，或者是字符串但不是纯数字
    const isNewTemplate = !templateData.id || 
                          typeof templateData.id === 'string' && 
                          (templateData.id.startsWith('new_') || 
                           templateData.id.startsWith('existing_') ||
                           isNaN(Number(templateData.id)));
    
    if (isNewTemplate) {
      // 创建新模板
      // 移除临时ID，让后端生成真实ID
      const dataToCreate = { ...templateData };
      delete dataToCreate.id;
      
      console.log('[TemplateEditorV2] 创建新模板，数据:', dataToCreate);
      const newTemplate = await DocumentCenterService.createTemplate(dataToCreate);
      console.log('[TemplateEditorV2] 模板创建成功，新ID:', newTemplate.id);
      
      window.NotificationSystem?.toast('模板创建成功', 'success');
      // 更新URL，包含新模板ID
      window.location.hash = `#/document-center/template-editor?id=${newTemplate.id}`;
    } else {
      // 更新现有模板
      console.log('[TemplateEditorV2] 更新现有模板，ID:', templateData.id);
      await DocumentCenterService.updateTemplate(templateData.id, templateData);
      window.NotificationSystem?.toast('模板保存成功', 'success');
    }
  } catch (error) {
    console.error('[TemplateEditorV2] 保存模板失败:', error);
    window.NotificationSystem?.toast('保存模板失败: ' + (error.message || String(error)), 'error');
  }
}

/**
 * 返回模板列表
 */
function handleBack() {
  window.location.hash = '#/document-center/templates';
}

