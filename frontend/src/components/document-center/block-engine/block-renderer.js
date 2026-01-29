import { BlockRegistry } from './block-registry.js';

/**
 * 区块渲染器
 * 负责将模板配置渲染为HTML
 * 
 * 支持两种模式：
 * - 'edit': 编辑模式，显示变量占位符（如 {{order.contractNo}}）
 * - 'view': 查看模式，显示实际数据值（如 SC2025-001）
 */
export class BlockRenderer {
  /**
   * 渲染完整模板
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象 { order, customer, company }
   * @param {string} mode - 渲染模式: 'edit' | 'view'，默认 'view'
   * @returns {string} 完整的HTML文档
   */
  static render(template, data, mode = 'view') {
    if (!template || !template.blocks) {
      throw new Error('无效的模板配置');
    }

    // 预处理数据（计算汇总值等）
    const processedData = this.preprocessData(data, template, mode);

    // 渲染所有区块
    let content = '';
    for (const blockConfig of template.blocks) {
      const block = BlockRegistry.createBlock(blockConfig);
      if (block) {
        // 传递 mode 给区块（如果区块支持）
        const blockHtml = block.render(processedData, mode);
        
        // 在编辑模式下，为区块添加 data-block-id 属性
        if (mode === 'edit') {
          const blockId = blockConfig.id || `block_${template.blocks.indexOf(blockConfig)}`;
          content += this.wrapBlockWithId(blockHtml, blockId, blockConfig.type);
        } else {
          content += blockHtml;
        }
      }
    }

    // 包装为完整HTML文档
    return this.wrapDocument(content, template, mode);
  }

  /**
   * 为区块包装 data-block-id 属性（编辑模式用）
   * @param {string} html - 区块HTML
   * @param {string} blockId - 区块ID
   * @param {string} blockType - 区块类型
   * @returns {string} 包装后的HTML
   */
  static wrapBlockWithId(html, blockId, blockType) {
    // 尝试找到第一个HTML元素并添加属性
    const trimmedHtml = html.trim();
    if (!trimmedHtml) return html;
    
    // 匹配开始标签
    const match = trimmedHtml.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
    if (match) {
      const tagName = match[1];
      const insertPos = match[0].length;
      return trimmedHtml.slice(0, insertPos) + 
             ` data-block-id="${blockId}" data-block-type="${blockType}"` + 
             trimmedHtml.slice(insertPos);
    }
    
    // 如果不是有效的HTML元素，包装一个div
    return `<div data-block-id="${blockId}" data-block-type="${blockType}" class="block-wrapper">${html}</div>`;
  }

  /**
   * 预处理数据
   * @param {Object} data - 原始数据
   * @param {Object} template - 模板配置
   * @param {string} mode - 渲染模式: 'edit' | 'view'
   * @returns {Object} 处理后的数据
   */
  static preprocessData(data, template, mode = 'view') {
    // 编辑模式：直接返回 Mock 数据（值为变量占位符）
    if (mode === 'edit') {
      return {
        ...data,
        _mode: 'edit',
        docType: template.type
      };
    }

    // 查看模式：计算实际汇总值
    const order = data.order || {};
    const items = order.items || [];

    // 计算汇总值
    const calc = {
      totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      totalPackages: items.reduce((sum, item) => sum + Number(item.packages || 0), 0),
      totalAmount: items.reduce((sum, item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || item.price || 0);
        return sum + (qty * price);
      }, 0),
      totalWeight: items.reduce((sum, item) => sum + Number(item.weight || 0), 0),
      totalNetWeight: items.reduce((sum, item) => sum + Number(item.netWeight || 0), 0),
      totalGrossWeight: items.reduce((sum, item) => sum + Number(item.grossWeight || 0), 0)
    };

    // 格式化的汇总值
    calc.totalAmountUSD = `USD${calc.totalAmount.toFixed(2)}`;
    calc.totalQuantityPCS = `${calc.totalQuantity}PCS`;

    return {
      ...data,
      calc: { ...(data.calc || {}), ...calc },
      _mode: 'view',
      docType: template.type
    };
  }

  /**
   * 包装为完整HTML文档
   * @param {string} content - 内容HTML
   * @param {Object} template - 模板配置
   * @param {string} mode - 渲染模式: 'edit' | 'view'
   * @returns {string}
   */
  static wrapDocument(content, template, mode = 'view') {
    const pageSettings = template.pageSettings || {};
    const margin = pageSettings.margin || { top: 15, bottom: 15, left: 15, right: 15 };
    const globalStyles = template.globalStyles || {};

    // 编辑模式额外样式（区块边框等）
    const editModeStyles = mode === 'edit' ? `
    /* 编辑模式样式 */
    [data-block-id] {
      outline: 1px dashed rgba(59, 130, 246, 0.3);
      outline-offset: 2px;
      transition: outline 0.15s ease-out;
      cursor: pointer;
    }
    [data-block-id]:hover {
      outline: 1px dashed rgba(59, 130, 246, 0.6);
    }
    .block-wrapper {
      display: block;
    }
    ` : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>单据预览</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    @page {
      size: A4;
      margin: 0;
    }
    
    body {
      width: 210mm;
      min-height: 297mm;
      padding: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm;
      font-family: ${globalStyles.fontFamily || 'Arial, "Microsoft YaHei", sans-serif'};
      font-size: ${globalStyles.fontSize || 12}px;
      line-height: ${globalStyles.lineHeight || 1.4};
      color: ${globalStyles.color || '#000'};
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    /* 区块通用样式 */
    .block {
      margin-bottom: 10px;
    }
    
    .block:last-child {
      margin-bottom: 0;
    }
    
    /* 表格通用样式 */
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    table th,
    table td {
      padding: 6px 8px;
      vertical-align: middle;
    }
    
    /* 打印样式 */
    @media print {
      body {
        width: 210mm;
        height: 297mm;
      }
    }
    ${editModeStyles}
  </style>
</head>
<body data-mode="${mode}">
  ${content}
</body>
</html>`;
  }

  /**
   * 渲染到DOM元素
   * @param {string} containerId - 容器ID
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   */
  static renderToElement(containerId, template, data) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`容器未找到: ${containerId}`);
      return;
    }

    try {
      const html = this.render(template, data);
      
      // 使用iframe渲染，确保样式隔离
      let iframe = container.querySelector('iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.background = '#fff';
        container.innerHTML = '';
        container.appendChild(iframe);
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();
    } catch (error) {
      console.error('渲染失败:', error);
      container.innerHTML = `<div style="padding: 20px; color: #dc3545;">渲染失败: ${error.message}</div>`;
    }
  }

  /**
   * 渲染为内容HTML（不包含完整文档结构）
   * @param {Object} template - 模板配置
   * @param {Object} data - 数据对象
   * @param {string} mode - 渲染模式: 'edit' | 'view'，默认 'view'
   * @returns {string} 内容HTML
   */
  static renderContent(template, data, mode = 'view') {
    if (!template) {
      return '';
    }

    // 获取 blocks 数组
    const blocks = template.blocks || template.config?.blocks;
    if (!blocks || !Array.isArray(blocks)) {
      return '';
    }

    const processedData = this.preprocessData(data, template, mode);
    let content = '';

    for (let i = 0; i < blocks.length; i++) {
      const blockConfig = blocks[i];
      const blockId = blockConfig.id || `block_${i}`;
      
      try {
        const block = BlockRegistry.createBlock(blockConfig);
        if (block) {
          // 传递 mode 给区块（如果区块支持）
          const blockHtml = block.render(processedData, mode);
          
          // 在编辑模式下，为区块添加 data-block-id 属性
          if (mode === 'edit') {
            content += this.wrapBlockWithId(blockHtml, blockId, blockConfig.type);
          } else {
            content += blockHtml;
          }
        }
      } catch (error) {
        console.error(`[BlockRenderer] 区块渲染失败 (${blockConfig.type}):`, error);
        // 渲染一个错误占位块
        if (mode === 'edit') {
          const errorHtml = `<div class="block-error" style="padding: 20px; background: #fee; border: 1px solid #f88; color: #c00; margin: 10px 0;">
            <strong>⚠️ 区块渲染错误</strong><br/>
            类型: ${blockConfig.type}<br/>
            错误: ${error.message}
          </div>`;
          content += this.wrapBlockWithId(errorHtml, blockId, blockConfig.type);
        }
      }
    }

    return content;
  }
}

