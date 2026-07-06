/**
 * 导出功能路由
 * 处理 Word 和 PDF 导出请求
 */

const express = require('express');
const router = express.Router();
const WordExportService = require('../services/WordExportService');
const PdfExportService = require('../services/PdfExportService');
const { asyncHandler } = require('../middleware/errorHandler');
const fs = require('fs');
const BrowserFinder = require('../utils/browser-finder');
const AppConfig = require('../utils/app-config');

/**
 * 获取“可编辑PDF”浏览器配置（手动路径 / 自动探测 / 实际生效）
 * GET /api/export/browser
 */
router.get('/browser', (req, res) => {
  const cfg = AppConfig.readConfig();
  const manualPath = typeof cfg.pdfBrowserPath === 'string' ? cfg.pdfBrowserPath.trim() : '';
  const manualOk = manualPath && fs.existsSync(manualPath);

  // 自动探测（不包含手动路径优先逻辑，便于 UI 展示“系统检测到什么”）
  const detectedPath = (process.platform === 'win32')
    ? (BrowserFinder.findWindowsBrowserFromRegistry?.() || '')
    : (BrowserFinder.findSystemBrowser?.() || '');

  // 实际生效：复用 BrowserFinder 的优先级（手动 > 注册表 > 扫描 > where）
  const effectivePath = BrowserFinder.findSystemBrowser?.() || '';

  res.json({
    success: true,
    manualPath: manualPath,
    manualOk: !!manualOk,
    detectedPath: detectedPath || '',
    effectivePath: effectivePath || '',
    configPath: AppConfig.getConfigPath()
  });
});

/**
 * 保存/清除“可编辑PDF”浏览器路径（手动指定）
 * PUT /api/export/browser
 * body: { path: string }  // 传空字符串表示清除
 */
router.put('/browser', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const p = String(body.path || '').trim();

  if (!p) {
    // 清除手动配置
    AppConfig.updateConfig({ pdfBrowserPath: '' });
  } else {
    // 基础校验：必须存在
    if (!fs.existsSync(p)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '指定的浏览器路径不存在，请重新选择'
      });
    }
    // Windows 下建议是 exe
    if (process.platform === 'win32' && !/\.exe$/i.test(p)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Windows 下请选择浏览器可执行文件（例如 msedge.exe / chrome.exe）'
      });
    }
    AppConfig.updateConfig({ pdfBrowserPath: p });
  }

  // 使新配置立即生效：关闭已启动的 Puppeteer 浏览器实例，让下次导出重新按配置启动
  try {
    if (PdfExportService.browserInstance) {
      await PdfExportService.browserInstance.close();
      PdfExportService.browserInstance = null;
    }
  } catch (_) { }

  const info = AppConfig.readConfig();
  res.json({
    success: true,
    manualPath: String(info.pdfBrowserPath || '').trim(),
    effectivePath: BrowserFinder.findSystemBrowser?.() || '',
    message: '已保存。下次导出将使用新的浏览器路径。'
  });
}));

/**
 * Word 导出
 * POST /api/export/word
 */
router.post('/word', asyncHandler(async (req, res) => {
  const { html, fileName, docType } = req.body;

  if (!html) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'HTML内容不能为空'
    });
  }

  // 拉货通知使用 Puppeteer + HTML内嵌方案，确保与预览窗口完全一致
  let docxBuffer;
  if (docType === 'pickup') {
    console.log('[Word导出] 检测到拉货通知，使用 Puppeteer + HTML内嵌方案导出');
    docxBuffer = await WordExportService.htmlToWordWithPuppeteer(html, fileName);
  } else {
    // 其他单据类型使用原有的 docx 库直接构建
    docxBuffer = await WordExportService.htmlToWord(html, fileName);
  }

  const finalFileName = (fileName || 'document').replace(/\.docx?$/, '') + '.docx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);
  res.setHeader('Content-Length', docxBuffer.length);
  res.send(docxBuffer);
}));


/**
 * 预热浏览器
 * POST /api/export/warmup
 */
router.post('/warmup', asyncHandler(async (req, res) => {
  // 异步触发预热，不等待完成，直接返回成功
  PdfExportService.warmup().catch(err => {
    console.error('[预热失败]', err.message);
  });

  res.json({
    success: true,
    message: 'Browser warming up...'
  });
}));

/**
 * PDF 导出
 * POST /api/export/editable-pdf
 */
router.post('/editable-pdf', asyncHandler(async (req, res) => {
  const { html, fileName, spacingMode } = req.body;

  if (!html) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'HTML内容不能为空'
    });
  }

  try {
    const pdfBuffer = await PdfExportService.htmlToPdf(html, {
      fileName: fileName || 'document.pdf',
      spacingMode: spacingMode || 'standard'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName || 'document.pdf')}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    // 处理 Puppeteer 相关的特殊错误
    if (error.code === 'PUPPETEER_NOT_INSTALLED' || error.code === 'CHROME_NOT_FOUND' || error.code === 'BROWSER_LAUNCH_FAILED') {
      // 扁平化错误响应，方便前端处理
      const details = error.details || {};
      return res.status(500).json({
        success: false,
        error: error.code,
        message: details.message || error.message,
        needInstall: details.needInstall || false,
        chromeMissing: details.chromeMissing || false,
        fallback: details.fallback || false,
        executablePath: details.executablePath,
        userDataDir: details.userDataDir,
        originalError: details.originalError
      });
    }
    throw error;
  }
}));

module.exports = router;

