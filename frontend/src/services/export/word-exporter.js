/**
 * Word导出模块
 * 使用后端docx库生成Word文件
 */
import { BaseExporter } from './base-exporter.js';

export class WordExporter extends BaseExporter {
  static formatName = 'word';
  static formatExtension = '.docx';
  static formatMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  
  /**
   * 导出为Word
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @returns {Promise<Blob>}
   */
  async export(template, data) {
    const parsedTemplate = this.parseTemplate(template);
    const boundData = this.bindData(parsedTemplate, data);
    
    // 使用后端导出（推荐，支持字号统一）
    return await this.exportViaBackend(parsedTemplate, boundData);
  }
  
  /**
   * 通过后端导出Word
   */
  async exportViaBackend(template, data) {
    // 先渲染HTML（前端渲染确保样式一致）
    const { BlockRenderer } = await import('../../components/document-center/block-engine/block-renderer.js');
    const html = BlockRenderer.render(template, data);
    
    // 将渲染好的HTML附加到template对象中，供后端使用
    const templateWithHtml = { ...template, html };
    
    const response = await fetch('/api/document-center/export/word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, template: templateWithHtml, data })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error('Word导出失败: ' + (error.message || response.statusText));
    }
    
    return await response.blob();
  }
}

