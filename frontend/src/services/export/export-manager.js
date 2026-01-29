/**
 * 导出管理器
 * 统一管理所有导出格式，提供统一的导出接口
 */
import { PDFExporter } from './pdf-exporter.js';
import { ExcelExporter } from './excel-exporter.js';
import { WordExporter } from './word-exporter.js';
import { FileExportService } from '../file-export-service.js';

export class ExportManager {
  constructor() {
    this.exporters = new Map();
    this.registerDefaultExporters();
  }
  
  /**
   * 注册默认导出器
   */
  registerDefaultExporters() {
    this.register('pdf', PDFExporter);
    this.register('excel', ExcelExporter);
    this.register('word', WordExporter);
  }
  
  /**
   * 注册导出器
   * @param {string} format - 格式名称
   * @param {Class} ExporterClass - 导出器类
   */
  register(format, ExporterClass) {
    this.exporters.set(format.toLowerCase(), ExporterClass);
  }
  
  /**
   * 获取导出器
   * @param {string} format - 格式名称
   * @returns {BaseExporter} 导出器实例
   */
  getExporter(format) {
    const ExporterClass = this.exporters.get(format.toLowerCase());
    if (!ExporterClass) {
      throw new Error(`不支持的导出格式: ${format}`);
    }
    return new ExporterClass(this.options);
  }
  
  /**
   * 导出文档
   * @param {string} format - 导出格式 ('pdf' | 'excel' | 'word')
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出的文件Blob
   */
  async export(format, template, data, options = {}) {
    this.options = options;
    const exporter = this.getExporter(format);
    return await exporter.export(template, data);
  }
  
  /**
   * 导出并下载（使用统一文件保存服务，支持 Tauri 文件对话框）
   * @param {string} format - 导出格式
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @param {string} filename - 文件名（不含扩展名）
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出的文件 Blob
   */
  async exportAndDownload(format, template, data, filename, options = {}) {
    try {
      const blob = await this.export(format, template, data, options);
      
      // 获取格式扩展名
      const exporter = this.getExporter(format);
      const extension = exporter.constructor.formatExtension || 
        (format === 'excel' ? '.xlsx' : format === 'word' ? '.docx' : format === 'pdf' ? '.pdf' : '');
      const fileName = `${filename || 'document'}${extension}`;
      
      // 获取文件类型描述
      const fileTypeMap = {
        'pdf': 'PDF文件',
        'excel': 'Excel文件',
        'word': 'Word文件'
      };
      const fileType = fileTypeMap[format] || '文件';
      
      // 使用统一文件导出服务（支持 Tauri 文件对话框）
      await FileExportService.exportAndSave(blob, fileName, fileType, options);
      
      return blob;
    } catch (error) {
      console.error('导出失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取支持的格式列表
   * @returns {Array} 格式列表
   */
  getSupportedFormats() {
    return Array.from(this.exporters.keys()).map(format => {
      const ExporterClass = this.exporters.get(format);
      return {
        format,
        name: ExporterClass.formatName,
        extension: ExporterClass.formatExtension,
        mime: ExporterClass.formatMime
      };
    });
  }
}

// 创建单例
export const exportManager = new ExportManager();

