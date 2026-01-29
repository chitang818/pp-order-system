/**
 * 单据中心路由（新版）
 * 处理单据模板和单据生成相关的所有 API 请求
 */

const express = require('express');
const router = express.Router();
const DocumentTemplateService = require('../services/DocumentTemplateService');
const DocumentGenerateService = require('../services/DocumentGenerateService');
const ExcelExportService = require('../services/ExcelExportService');
const PdfExportService = require('../services/PdfExportService');
const WordExportService = require('../services/WordExportService');
const TemplateExportService = require('../services/TemplateExportService');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

// 所有路由需要认证
router.use(authenticate);

/**
 * 获取模板列表
 * GET /api/document-center/templates
 * Query: type (可选) - 模板类型筛选
 */
router.get('/templates', asyncHandler(async (req, res) => {
  const { type } = req.query;
  const templates = await DocumentTemplateService.listTemplates(type);
  res.json({ success: true, data: templates });
}));

/**
 * 获取单个模板
 * GET /api/document-center/templates/:id
 */
router.get('/templates/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const template = await DocumentTemplateService.getTemplate(id);
  if (!template) {
    return res.status(404).json({ success: false, message: '模板不存在' });
  }
  res.json({ success: true, data: template });
}));

/**
 * 创建模板
 * POST /api/document-center/templates
 * Body: { name, type, config, isDefault }
 */
router.post('/templates', asyncHandler(async (req, res) => {
  const { name, type, config, isDefault } = req.body;
  const userId = req.user.id;
  
  const template = await DocumentTemplateService.createTemplate({
    name,
    type,
    config,
    isDefault: isDefault || false,
    createdBy: userId
  });
  
  res.json({ success: true, data: template });
}));

/**
 * 更新模板
 * PUT /api/document-center/templates/:id
 * Body: { name, type, config, isDefault }
 */
router.put('/templates/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, type, config, isDefault } = req.body;
  
  const template = await DocumentTemplateService.updateTemplate(id, {
    name,
    type,
    config,
    isDefault: isDefault || false
  });
  
  res.json({ success: true, data: template });
}));

/**
 * 删除模板
 * DELETE /api/document-center/templates/:id
 */
router.delete('/templates/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  await DocumentTemplateService.deleteTemplate(id);
  res.json({ success: true, message: '模板已删除' });
}));

/**
 * 删除所有模板
 * DELETE /api/document-center/templates
 */
router.delete('/templates', asyncHandler(async (req, res) => {
  const deletedCount = await DocumentTemplateService.deleteAllTemplates();
  res.json({ success: true, message: `已删除所有模板，共 ${deletedCount} 个`, deletedCount });
}));

/**
 * 获取默认模板
 * GET /api/document-center/templates/default/:type
 */
router.get('/templates/default/:type', asyncHandler(async (req, res) => {
  const { type } = req.params;
  const template = await DocumentTemplateService.getDefaultTemplate(type);
  if (!template) {
    return res.status(404).json({ success: false, message: '未找到默认模板' });
  }
  res.json({ success: true, data: template });
}));

/**
 * 生成单据HTML
 * POST /api/document-center/generate
 * Body: { orderId, templateId }
 */
router.post('/generate', asyncHandler(async (req, res) => {
  const { orderId, templateId } = req.body;
  
  if (!orderId || !templateId) {
    return res.status(400).json({ 
      success: false, 
      message: '订单ID和模板ID不能为空' 
    });
  }
  
  const html = await DocumentGenerateService.generateDocument(orderId, templateId);
  
  res.json({ success: true, data: { html } });
}));

/**
 * 导出PDF
 * POST /api/document-center/export/pdf
 * Body: { html, fileName } 或 { template, data, fileName }
 */
router.post('/export/pdf', asyncHandler(async (req, res) => {
  const { html, fileName, template, data } = req.body;
  
  let pdfBuffer;
  
  // 新方式：基于模板导出（推荐，支持统一字号）
  // 注意：如果提供了html，说明前端已经渲染，直接使用；否则需要前端先渲染
  if (template && data) {
    // 如果前端已经渲染了HTML，直接使用
    if (html) {
      template.html = html;
    }
    pdfBuffer = await TemplateExportService.exportToPDF(template, data);
  }
  // 旧方式：基于HTML导出（向后兼容）
  else if (html) {
    pdfBuffer = await PdfExportService.htmlToPdf(html, {
      fileName: fileName || 'document.pdf'
    });
  } else {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: '请提供模板和数据，或HTML内容'
    });
  }
  
  const finalFileName = (fileName || 'document').replace(/\.pdf$/, '') + '.pdf';
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * 导出Word
 * POST /api/document-center/export/word
 * Body: { html, fileName } 或 { template, data, fileName }
 */
router.post('/export/word', asyncHandler(async (req, res) => {
  const { html, fileName, template, data } = req.body;
  
  let docxBuffer;
  
  // 新方式：基于模板导出（推荐，支持统一字号）
  if (template && data) {
    docxBuffer = await TemplateExportService.exportToWord(template, data);
  }
  // 旧方式：基于HTML导出（向后兼容）
  else if (html) {
    docxBuffer = await WordExportService.htmlToWord(html, fileName);
  } else {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: '请提供模板和数据，或HTML内容'
    });
  }
  
  const finalFileName = (fileName || 'document').replace(/\.docx?$/, '') + '.docx';
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);
  res.setHeader('Content-Length', docxBuffer.length);
  res.send(docxBuffer);
}));

/**
 * 导出Excel
 * POST /api/document-center/export/excel
 * Body: { orderId, templateId (可选), fileName } 或 { template, data, fileName }
 */
router.post('/export/excel', asyncHandler(async (req, res) => {
  const { orderId, templateId, fileName, template, data } = req.body;
  
  let excelBuffer;
  
  // 新方式：基于模板导出（推荐）
  if (template && data) {
    excelBuffer = await TemplateExportService.exportToExcel(template, data);
  } 
  // 旧方式：基于订单ID导出（向后兼容）
  else if (orderId) {
    excelBuffer = await ExcelExportService.generateExcel(orderId, templateId);
  } else {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: '请提供模板和数据，或订单ID'
    });
  }
  
  const finalFileName = (fileName || 'document').replace(/\.xlsx?$/, '') + '.xlsx';
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);
  res.setHeader('Content-Length', excelBuffer.length);
  res.send(excelBuffer);
}));

module.exports = router;

