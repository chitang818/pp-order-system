/**
 * PDF导出模块
 * 使用HTML渲染后转换为PDF
 */
import { BaseExporter } from './base-exporter.js';
import { BlockRenderer } from '../../components/document-center/block-engine/block-renderer.js';

export class PDFExporter extends BaseExporter {
  static formatName = 'pdf';
  static formatExtension = '.pdf';
  static formatMime = 'application/pdf';
  
  /**
   * 导出为PDF
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @returns {Promise<Blob>}
   */
  async export(template, data) {
    const parsedTemplate = this.parseTemplate(template);
    const boundData = this.bindData(parsedTemplate, data);
    
    // 重要：PDF 必须由后端 Puppeteer 渲染，才能最大概率保留“可编辑文本”结构。
    // 前端 html2pdf/html2canvas 属于截图式 PDF，会导致不可编辑（且依赖外网 CDN）。
    return await this.exportViaBackend(parsedTemplate, boundData);
  }
  
  /**
   * 通过后端导出PDF（推荐）
   */
  async exportViaBackend(template, data) {
    // 先渲染HTML（前端渲染确保样式一致）
    const html = BlockRenderer.render(template, data);
    
    // 将渲染好的HTML附加到template对象中，供后端使用
    const templateWithHtml = { ...template, html };
    
    // 使用统一的 ApiService.request，确保在 Tauri/生产环境下能正确指向 http://127.0.0.1:3000
    const response = await window.ApiService.request('/api/document-center/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, template: templateWithHtml, data })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error('PDF导出失败: ' + (error.message || response.statusText));
    }
    
    return await response.blob();
  }
}

