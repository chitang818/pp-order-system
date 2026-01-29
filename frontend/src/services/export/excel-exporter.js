/**
 * Excel导出模块
 * 使用后端ExcelJS生成Excel文件
 */
import { BaseExporter } from './base-exporter.js';
import { FontSizeManager } from '../../components/document-center/block-engine/font-size-manager.js';

export class ExcelExporter extends BaseExporter {
  static formatName = 'excel';
  static formatExtension = '.xlsx';
  static formatMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  
  /**
   * 导出为Excel
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @returns {Promise<Blob>}
   */
  async export(template, data) {
    const parsedTemplate = this.parseTemplate(template);
    const boundData = this.bindData(parsedTemplate, data);
    
    // 使用后端导出（推荐，样式更完整，支持字号统一）
    return await this.exportViaBackend(parsedTemplate, boundData);
  }
  
  /**
   * 通过后端导出Excel
   */
  async exportViaBackend(template, data) {
    const response = await fetch('/api/document-center/export/excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, data })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error('Excel导出失败: ' + (error.message || response.statusText));
    }
    
    return await response.blob();
  }
  
  /**
   * 将区块转换为Excel行数据（用于前端导出，备用）
   */
  blockToExcelRows(block, data, template) {
    const rows = [];
    const config = block.config || {};
    
    switch (block.type) {
      case 'company-header':
        rows.push([data.company?.companyNameEN || '']);
        rows.push([data.company?.companyAddressEN || '']);
        rows.push(['']);  // 空行
        break;
        
      case 'document-title':
        rows.push([config.text || '']);
        rows.push(['']);
        break;
        
      case 'product-table':
        // 表头
        const headers = (config.columns || []).map(col => col.header);
        rows.push(headers);
        
        // 数据行
        const items = data.order?.items || [];
        items.forEach((item, index) => {
          const row = (config.columns || []).map(col => {
            const itemWithIndex = { ...item, _index: index };
            let value = this.resolveBinding(col.binding, data, itemWithIndex);
            
            // 计算金额
            if (col.binding === 'amount' && !value) {
              value = Number(item.quantity || 0) * Number(item.unitPrice || 0);
            }
            
            return this.formatValue(value, {
              format: col.format,
              prefix: col.prefix || '',
              suffix: col.suffix || ''
            });
          });
          rows.push(row);
        });
        
        // 汇总行
        if (config.showFooter) {
          const footerRow = new Array(headers.length).fill('');
          footerRow[0] = `${data.calc?.totalPackages || 0}PACKAGES----${data.calc?.totalQuantity || 0}PCS`;
          footerRow[footerRow.length - 1] = `USD${(data.calc?.totalAmount || 0).toFixed(2)}`;
          rows.push(footerRow);
        }
        rows.push(['']);
        break;
        
      default:
        rows.push(['']);
    }
    
    return rows;
  }
}

