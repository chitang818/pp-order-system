/**
 * 循环处理器（Loop Processor）
 * 处理模板中的循环节点（{{#each ...}}）
 */

import { DataAccessor } from '../resolver/data-accessor.js';

export class LoopProcessor {
  /**
   * 处理循环节点
   * @param {Object} node - 循环AST节点
   * @param {Object} data - 数据对象 { order, customer, company }
   * @param {Object} context - 上下文对象
   * @param {Function} processChildren - 处理子节点的函数
   * @returns {string} 处理后的HTML
   */
  static process(node, data, context = {}, processChildren) {
    // 1. 获取循环源数据
    const source = DataAccessor.getSourceData(node.source, data, context);
    
    // 如果没有数据或数据为空，返回空字符串
    if (!source || !Array.isArray(source) || source.length === 0) {
      return '';
    }

    // 调试日志
    console.log('[LoopProcessor] 处理循环:', {
      source: node.source,
      itemsCount: source.length,
      childrenCount: node.children?.length || 0,
      childrenTypes: node.children?.map(c => c.type) || [],
      childrenPreview: node.children?.map(c => ({ type: c.type, content: c.content?.substring(0, 50) || c.raw?.substring(0, 50) || 'N/A' })) || []
    });

    // 2. 处理每个循环项
    const processedRows = source.map((item, index) => {
      // 创建循环上下文
      const loopContext = {
        ...context,
        item: item,
        meta: {
          index: index + 1,      // 从1开始的序号
          index0: index,          // 从0开始的索引
          first: index === 0,     // 是否第一项
          last: index === source.length - 1,  // 是否最后一项
          count: source.length    // 总数量
        }
      };

      // 处理循环内容（递归处理子节点）
      const result = processChildren(node.children, data, loopContext);
      
      // 调试日志
      if (index === 0) {
        console.log('[LoopProcessor] 第一个循环项处理结果:', {
          resultLength: result.length,
          resultPreview: result.substring(0, 200),
          hasTr: result.includes('<tr'),
          trCount: (result.match(/<tr/g) || []).length,
          contextItem: loopContext.item ? Object.keys(loopContext.item) : [],
          contextMeta: loopContext.meta
        });
      }
      
      return result;
    }).join('');

    return processedRows;
  }
}

