/**
 * 模板导出服务
 * 基于新的区块引擎模板进行导出，支持统一字号
 * 
 * 重要：导出服务需与 PP 预览器保持一致
 * - A4 尺寸：210mm × 297mm
 * - 默认边距：15mm
 * - 字体样式：Arial, "Microsoft YaHei", sans-serif
 */
const FontSizeManager = require('../utils/font-size-manager');
const config = require('../config');
const PdfExportService = require('./PdfExportService');
const BrowserFinder = require('../utils/browser-finder');

// 重型依赖延迟加载（首次调用对应导出方法时才 require，加速 Node 启动）
let _ExcelJS = null;
let _docx = null;
let _puppeteer = null;

function getExcelJS() {
  if (!_ExcelJS) _ExcelJS = require('exceljs');
  return _ExcelJS;
}
function getDocx() {
  if (!_docx) _docx = require('docx');
  return _docx;
}
function getPuppeteer() {
  if (!_puppeteer) _puppeteer = require('puppeteer-core');
  return _puppeteer;
}

// A4 标准尺寸（与 PP 预览器一致）
const A4_SIZE = {
  WIDTH: 210,   // mm
  HEIGHT: 297   // mm
};

// 默认边距（与 PP 预览器一致）
const DEFAULT_MARGIN = {
  top: 15,
  bottom: 15,
  left: 15,
  right: 15
};

class TemplateExportService {
  /**
   * 导出为PDF
   * 使用与 PP 预览器一致的 A4 尺寸和边距
   * 
   * @param {Object} template - 模板配置（可能包含已渲染的html）
   * @param {Object} data - 数据对象
   * @returns {Promise<Buffer>}
   */
  async exportToPDF(template, data) {
    try {
      // 如果模板中已有渲染好的HTML，直接使用；否则使用简化渲染
      // 重要：前端应使用 PPPreviewer 渲染后传入 html，确保显示一致性
      const html = template.html || this.renderTemplateToHTML(template, data);

      // 获取页边距设置（优先使用模板设置，否则使用默认值）
      const pageSettings = template.pageSettings || template.config?.pageSettings || {};
      const margin = pageSettings.margin || template.margin || DEFAULT_MARGIN;

      console.log('[TemplateExportService] PDF 导出配置:', {
        hasRenderedHtml: !!template.html,
        margin,
        a4Size: A4_SIZE
      });

      // 尝试使用 PdfExportService（支持更多配置）
      try {
        const pdfBuffer = await PdfExportService.htmlToPdf(html, {
          fileName: template.name || 'document.pdf'
        });
        console.log('[TemplateExportService] PDF 导出成功（使用 PdfExportService）');
        return pdfBuffer;
      } catch (pdfServiceError) {
        console.warn('[TemplateExportService] PdfExportService 失败，使用备用方案:', pdfServiceError.message);
      }

      // 备用方案：直接使用 Puppeteer
      const launchOptions = BrowserFinder.getBrowserLaunchOptions();
      const browser = await getPuppeteer().launch(launchOptions);

      const page = await browser.newPage();

      // 设置视口为 A4 尺寸（96 DPI）
      await page.setViewport({
        width: Math.round(A4_SIZE.WIDTH * 3.78), // mm to px at 96 DPI
        height: Math.round(A4_SIZE.HEIGHT * 3.78)
      });

      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      // 生成 PDF，使用 preferCSSPageSize 确保与预览一致
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,  // 使用 CSS 定义的页面尺寸
        margin: {
          top: `${margin.top}mm`,
          bottom: `${margin.bottom}mm`,
          left: `${margin.left}mm`,
          right: `${margin.right}mm`
        }
      });

      await browser.close();

      console.log('[TemplateExportService] PDF 导出成功，大小:', (pdfBuffer.length / 1024).toFixed(2), 'KB');
      return pdfBuffer;
    } catch (error) {
      console.error('[TemplateExportService] PDF导出失败:', error);
      throw new Error('PDF导出失败: ' + error.message);
    }
  }

  /**
   * 导出为Excel
   * 使用与 PP 预览器一致的 A4 打印区域
   * 
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @returns {Promise<Buffer>}
   */
  async exportToExcel(template, data) {
    try {
      const ExcelJS = getExcelJS();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('单据');

      // 获取页边距设置
      const pageSettings = template.pageSettings || template.config?.pageSettings || {};
      const margin = pageSettings.margin || template.margin || DEFAULT_MARGIN;

      // 设置打印区域为 A4
      worksheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0, // 自动高度
        margins: {
          left: margin.left / 25.4,  // mm to inches
          right: margin.right / 25.4,
          top: margin.top / 25.4,
          bottom: margin.bottom / 25.4,
          header: 0.3,
          footer: 0.3
        },
        horizontalCentered: true
      };

      // 设置默认列宽（适配 A4 宽度减去边距）
      const contentWidthMM = A4_SIZE.WIDTH - margin.left - margin.right;
      const defaultColumnCount = 6;
      const columnWidthChars = Math.floor((contentWidthMM / defaultColumnCount) * 0.5); // 粗略转换

      for (let i = 1; i <= defaultColumnCount; i++) {
        worksheet.getColumn(i).width = columnWidthChars;
      }

      let currentRow = 1;

      // 处理每个区块
      for (const block of (template.blocks || [])) {
        currentRow = await this.renderBlockToExcel(worksheet, block, data, template, currentRow);
      }

      console.log('[TemplateExportService] Excel 导出成功，总行数:', currentRow - 1);

      // 生成Buffer
      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      console.error('[TemplateExportService] Excel导出失败:', error);
      throw new Error('Excel导出失败: ' + error.message);
    }
  }

  /**
   * 导出为Word
   * 使用与 PP 预览器一致的 A4 尺寸和边距
   * 
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @returns {Promise<Buffer>}
   */
  async exportToWord(template, data) {
    try {
      const children = [];

      // 处理每个区块
      for (const block of (template.blocks || [])) {
        const elements = this.renderBlockToWord(block, data, template);
        children.push(...elements);
      }

      // 获取页边距设置
      const pageSettings = template.pageSettings || template.config?.pageSettings || {};
      const margin = pageSettings.margin || template.margin || DEFAULT_MARGIN;

      // 使用 convertMillimetersToTwip 函数（如果可用）或手动转换
      // 1mm = 56.7 twips (20 twips = 1 point, 72 points = 1 inch, 1 inch = 25.4 mm)
      const mmToTwip = (mm) => Math.round(mm * 56.7);

      const { Document, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, WidthType, Packer, convertMillimetersToTwip } = getDocx();

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              size: {
                width: mmToTwip(A4_SIZE.WIDTH),  // A4 宽度
                height: mmToTwip(A4_SIZE.HEIGHT)  // A4 高度
              },
              margin: {
                top: mmToTwip(margin.top),
                bottom: mmToTwip(margin.bottom),
                left: mmToTwip(margin.left),
                right: mmToTwip(margin.right)
              }
            }
          },
          children
        }]
      });

      const buffer = await Packer.toBuffer(doc);
      console.log('[TemplateExportService] Word 导出成功，大小:', (buffer.length / 1024).toFixed(2), 'KB');

      return buffer;
    } catch (error) {
      console.error('[TemplateExportService] Word导出失败:', error);
      throw new Error('Word导出失败: ' + error.message);
    }
  }

  /**
   * 渲染模板为HTML
   * 注意：如果前端已经渲染了HTML，直接使用；否则需要前端先渲染
   */
  renderTemplateToHTML(template, data) {
    // 如果已经提供了渲染好的HTML，直接使用
    if (template.html) {
      return template.html;
    }

    // 否则，返回一个基础HTML结构
    // 实际使用时，前端应该先使用BlockRenderer渲染HTML，然后传给后端
    // 这样可以确保渲染逻辑一致
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <title>单据预览</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 210mm;
            min-height: 297mm;
            font-family: Arial, "Microsoft YaHei", sans-serif;
            font-size: 11pt;
            padding: 15mm;
          }
        </style>
      </head>
      <body>
        <p>请使用前端BlockRenderer渲染HTML后再导出</p>
      </body>
      </html>
    `;
  }

  /**
   * 渲染区块到Excel
   */
  async renderBlockToExcel(worksheet, block, data, template, startRow) {
    const config = block.config || {};
    let currentRow = startRow;

    switch (block.type) {
      case 'company-header':
        const companyName = data.company?.companyNameEN || '';
        const companyAddress = data.company?.companyAddressEN || '';
        const titleFontSize = FontSizeManager.ptToExcel(config.style?.titleFontSize || 22);

        worksheet.getCell(currentRow, 1).value = companyName;
        worksheet.getCell(currentRow, 1).font = { size: titleFontSize, bold: true };
        worksheet.mergeCells(currentRow, 1, currentRow, 5);
        currentRow++;

        worksheet.getCell(currentRow, 1).value = companyAddress;
        worksheet.getCell(currentRow, 1).font = { size: FontSizeManager.ptToExcel(11) };
        worksheet.mergeCells(currentRow, 1, currentRow, 5);
        currentRow += 2;
        break;

      case 'document-title':
        const title = config.text || '';
        const titleFontSizeExcel = FontSizeManager.ptToExcel(config.style?.fontSize || 18);

        worksheet.getCell(currentRow, 1).value = title;
        worksheet.getCell(currentRow, 1).font = { size: titleFontSizeExcel, bold: true };
        worksheet.getCell(currentRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.mergeCells(currentRow, 1, currentRow, 5);
        currentRow += 2;
        break;

      case 'product-table':
        const columns = config.columns || [];
        const headerFontSize = FontSizeManager.ptToExcel(config.headerStyle?.fontSize || 12);
        const bodyFontSize = FontSizeManager.ptToExcel(config.rowStyle?.fontSize || 11);

        // 表头
        columns.forEach((col, colIndex) => {
          const cell = worksheet.getCell(currentRow, colIndex + 1);
          cell.value = col.header || '';
          cell.font = { size: headerFontSize, bold: true };
          cell.alignment = {
            horizontal: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
            vertical: 'middle'
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }
          };
        });
        currentRow++;

        // 数据行
        const items = data.order?.items || [];
        items.forEach((item, itemIndex) => {
          columns.forEach((col, colIndex) => {
            const cell = worksheet.getCell(currentRow, colIndex + 1);
            let value = this.resolveBinding(col.binding, data, { ...item, _index: itemIndex });

            // 计算金额
            if (col.binding === 'amount' && !value) {
              value = Number(item.quantity || 0) * Number(item.unitPrice || 0);
            }

            // 格式化
            if (col.format === 'currency') {
              value = Number(value).toFixed(2);
            }
            if (col.prefix) value = col.prefix + value;
            if (col.suffix) value = value + col.suffix;

            cell.value = value;
            cell.font = { size: bodyFontSize };
            cell.alignment = {
              horizontal: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
              vertical: 'middle'
            };
          });
          currentRow++;
        });

        // 汇总行
        if (config.showFooter) {
          const footerRow = new Array(columns.length).fill('');
          footerRow[0] = `${data.calc?.totalPackages || 0}PACKAGES----${data.calc?.totalQuantity || 0}PCS`;
          footerRow[footerRow.length - 1] = `USD${(data.calc?.totalAmount || 0).toFixed(2)}`;

          footerRow.forEach((value, colIndex) => {
            const cell = worksheet.getCell(currentRow, colIndex + 1);
            cell.value = value;
            cell.font = { size: bodyFontSize, bold: true };
          });
          currentRow++;
        }
        currentRow++;
        break;

      default:
        currentRow++;
    }

    return currentRow;
  }

  /**
   * 渲染区块到Word
   */
  renderBlockToWord(block, data, template) {
    const { Paragraph, TextRun, Table, TableRow, TableCell,
      AlignmentType, WidthType } = getDocx();
    const config = block.config || {};
    const elements = [];

    switch (block.type) {
      case 'company-header': {
        const companyName = data.company?.companyNameEN || '';
        const companyAddress = data.company?.companyAddressEN || '';
        const companyTitleFontSizeWord = FontSizeManager.ptToWord(config.style?.titleFontSize || 22);

        elements.push(new Paragraph({
          children: [new TextRun({
            text: companyName,
            size: companyTitleFontSizeWord,
            bold: true
          })],
          alignment: AlignmentType.CENTER
        }));

        elements.push(new Paragraph({
          children: [new TextRun({
            text: companyAddress,
            size: FontSizeManager.ptToWord(11)
          })],
          alignment: AlignmentType.CENTER
        }));

        elements.push(new Paragraph({ children: [] }));
        break;
      }

      case 'document-title': {
        const title = config.text || '';
        const docTitleFontSizeWord = FontSizeManager.ptToWord(config.style?.fontSize || 18);

        elements.push(new Paragraph({
          children: [new TextRun({
            text: title,
            size: docTitleFontSizeWord,
            bold: true
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 }
        }));
        break;
      }

      case 'product-table':
        const columns = config.columns || [];
        const headerFontSize = FontSizeManager.ptToWord(config.headerStyle?.fontSize || 12);
        const bodyFontSize = FontSizeManager.ptToWord(config.rowStyle?.fontSize || 11);

        const tableRows = [];

        // 表头
        const headerCells = columns.map(col => new TableCell({
          children: [new Paragraph({
            children: [new TextRun({
              text: col.header || '',
              size: headerFontSize,
              bold: true
            })],
            alignment: this.mapAlignment(col.align)
          })],
          shading: { fill: 'F0F0F0' }
        }));
        tableRows.push(new TableRow({ children: headerCells }));

        // 数据行
        const items = data.order?.items || [];
        items.forEach((item, itemIndex) => {
          const cells = columns.map(col => {
            let value = this.resolveBinding(col.binding, data, { ...item, _index: itemIndex });

            // 计算金额
            if (col.binding === 'amount' && !value) {
              value = Number(item.quantity || 0) * Number(item.unitPrice || 0);
            }

            // 格式化
            if (col.format === 'currency') {
              value = Number(value).toFixed(2);
            }
            if (col.prefix) value = col.prefix + value;
            if (col.suffix) value = value + col.suffix;

            return new TableCell({
              children: [new Paragraph({
                children: [new TextRun({
                  text: String(value),
                  size: bodyFontSize
                })],
                alignment: this.mapAlignment(col.align)
              })]
            });
          });
          tableRows.push(new TableRow({ children: cells }));
        });

        // 汇总行
        if (config.showFooter) {
          const footerCells = columns.map((col, colIndex) => {
            let value = '';
            if (colIndex === 0) {
              value = `${data.calc?.totalPackages || 0}PACKAGES----${data.calc?.totalQuantity || 0}PCS`;
            } else if (colIndex === columns.length - 1) {
              value = `USD${(data.calc?.totalAmount || 0).toFixed(2)}`;
            }

            return new TableCell({
              children: [new Paragraph({
                children: [new TextRun({
                  text: value,
                  size: bodyFontSize,
                  bold: true
                })],
                alignment: this.mapAlignment(col.align)
              })]
            });
          });
          tableRows.push(new TableRow({ children: footerCells }));
        }

        elements.push(new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE }
        }));

        elements.push(new Paragraph({ children: [] }));
        break;

      default:
        elements.push(new Paragraph({ children: [] }));
    }

    return elements;
  }

  /**
   * 解析数据绑定
   */
  resolveBinding(binding, data, item = null) {
    if (!binding) return '';

    if (binding === '@index' && item !== null) {
      return item._index !== undefined ? item._index + 1 : '';
    }

    if (item !== null && !binding.includes('.')) {
      if (item.hasOwnProperty(binding)) {
        return item[binding] !== null && item[binding] !== undefined ? item[binding] : '';
      }
    }

    const parts = binding.split('.');
    let value = data;

    for (const part of parts) {
      if (value === null || value === undefined) return '';
      value = value[part];
    }

    return value !== null && value !== undefined ? value : '';
  }

  /**
   * 映射对齐方式
   */
  mapAlignment(align) {
    const { AlignmentType } = getDocx();
    switch (align) {
      case 'center': return AlignmentType.CENTER;
      case 'right': return AlignmentType.RIGHT;
      default: return AlignmentType.LEFT;
    }
  }
}

module.exports = new TemplateExportService();

