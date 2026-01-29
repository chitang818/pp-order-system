/**
 * 模板转换器
 * 将旧格式模板转换为新格式
 */

export class TemplateConverter {
  /**
   * 转换模板
   * @param {string} templateHtml - 模板HTML字符串
   * @returns {string} 转换后的模板HTML
   */
  static convert(templateHtml) {
    if (!templateHtml || typeof templateHtml !== 'string') {
      return templateHtml;
    }

    let converted = templateHtml;

    // 1. 先转换变量格式（@index等），避免在循环转换时被误判为计算表达式
    converted = this.convertVariables(converted);

    // 2. 转换循环格式
    converted = this.convertLoops(converted);

    // 3. 转换特殊变量
    converted = this.convertSpecialVariables(converted);

    return converted;
  }

  /**
   * 转换循环格式
   * {{#each items}} -> {{#each order.items}}
   * 同时转换循环内的裸变量引用
   */
  static convertLoops(template) {
    // 首先转换循环开始标记
    let converted = template.replace(
      /\{\{#each\s+items\s*\}\}/gi,
      '{{#each order.items}}'
    );

    // 转换循环内的裸变量引用
    // 匹配 {{#each order.items}}...{{/each}} 之间的内容
    converted = converted.replace(
      /\{\{#each\s+order\.items\s*\}\}([\s\S]*?)\{\{\s*\/each\s*\}\}/gi,
      (match, content) => {
        // 在循环内容中，将裸变量转换为 item.变量
        // 但排除已有命名空间的变量和特殊变量
        const convertedContent = content.replace(
          /\{\{([^}]+)\}\}/g,
          (varMatch, varExpr) => {
            const trimmed = varExpr.trim();
            
            // 排除已有命名空间的变量（order., customer., company., item., meta., calc., sv.）
            if (/^(order|customer|company|item|meta|calc|sv)\./.test(trimmed)) {
              return varMatch;
            }
            
            // 排除已有命名空间的变量（meta., calc., sv. 等）
            if (/^(meta|calc|sv)\./.test(trimmed)) {
              return varMatch;
            }
            
            // 排除过滤器表达式（包含 |）
            if (trimmed.includes('|')) {
              // 只转换变量部分，保留过滤器
              const parts = trimmed.split('|');
              const varPart = parts[0].trim();
              const filters = parts.slice(1).join('|');
              
              // 如果变量部分没有命名空间，添加 item.
              if (!/^(order|customer|company|item|meta|calc|sv)\./.test(varPart)) {
                return `{{item.${varPart}|${filters}}}`;
              }
              return varMatch;
            }
            
            // 排除计算表达式（包含 +, -, *, /, ()），但 meta.index 等已转换的变量应该保留
            // 注意：此时 @index 应该已经被转换为 meta.index，所以这里只排除真正的计算表达式
            if (/[+\-*/(]/.test(trimmed) && !trimmed.startsWith('meta.')) {
              return varMatch;
            }
            
            // 转换裸变量为 item.变量
            return `{{item.${trimmed}}}`;
          }
        );
        
        return `{{#each order.items}}${convertedContent}{{/each}}`;
      }
    );

    return converted;
  }

  /**
   * 转换变量格式
   * {{@index+1}} -> {{meta.index}}
   * {{@index}} -> {{meta.index0}}
   */
  static convertVariables(template) {
    // 转换 @index+1 为 meta.index
    template = template.replace(/\{\{@index\s*\+\s*1\}\}/gi, '{{meta.index}}');
    
    // 转换 @index 为 meta.index0
    template = template.replace(/\{\{@index\}\}/gi, '{{meta.index0}}');
    
    // 转换其他可能的 @ 变量
    template = template.replace(/\{\{@first\}\}/gi, '{{meta.first}}');
    template = template.replace(/\{\{@last\}\}/gi, '{{meta.last}}');
    template = template.replace(/\{\{@count\}\}/gi, '{{meta.count}}');

    return template;
  }

  /**
   * 转换特殊变量
   * 保持 sv. 和 calc. 格式不变
   */
  static convertSpecialVariables(template) {
    // sv. 和 calc. 变量保持不变
    // 这里可以添加其他特殊转换逻辑
    
    return template;
  }

  /**
   * 检查模板是否需要转换
   * @param {string} templateHtml - 模板HTML字符串
   * @returns {boolean} 是否需要转换
   */
  static needsConversion(templateHtml) {
    if (!templateHtml || typeof templateHtml !== 'string') {
      return false;
    }

    // 检查是否包含旧格式循环
    const hasOldLoop = /\{\{#each\s+items\s*\}\}/gi.test(templateHtml);
    
    // 检查是否包含旧格式变量（@index, @index+1等）
    const hasOldVariable = /\{\{@index/.test(templateHtml);
    
    // 检查是否包含裸变量（在循环中，没有 item. 前缀）
    // 匹配 {{#each order.items}}...{{变量名}}...{{/each}} 中的裸变量
    const loopPattern = /\{\{#each\s+order\.items\s*\}\}([\s\S]*?)\{\{\s*\/each\s*\}\}/gi;
    let hasNakedVariable = false;
    let match;
    
    while ((match = loopPattern.exec(templateHtml)) !== null) {
      const loopContent = match[1];
      // 查找循环内的变量，排除已有命名空间的变量
      const variablePattern = /\{\{([^}]+)\}\}/g;
      let varMatch;
      
      while ((varMatch = variablePattern.exec(loopContent)) !== null) {
        const varExpr = varMatch[1].trim();
        // 如果变量没有命名空间前缀，且不是特殊变量（meta., calc., sv.等），则需要转换
        if (!/^(order|customer|company|item|meta|calc|sv)\./.test(varExpr) && 
            !varExpr.startsWith('@') && 
            !/[+\-*/(]/.test(varExpr) && 
            !varExpr.includes('|')) {
          hasNakedVariable = true;
          break;
        }
      }
      
      if (hasNakedVariable) break;
    }

    return hasOldLoop || hasOldVariable || hasNakedVariable;
  }

  /**
   * 获取转换报告
   * @param {string} originalHtml - 原始模板HTML
   * @param {string} convertedHtml - 转换后的模板HTML
   * @returns {Object} 转换报告
   */
  static getConversionReport(originalHtml, convertedHtml) {
    const report = {
      converted: originalHtml !== convertedHtml,
      changes: []
    };

    if (!report.converted) {
      return report;
    }

    // 检测循环转换
    const oldLoopCount = (originalHtml.match(/\{\{#each\s+items\s*\}\}/gi) || []).length;
    if (oldLoopCount > 0) {
      report.changes.push({
        type: 'loop',
        description: `转换了 ${oldLoopCount} 个旧格式循环`,
        oldFormat: '{{#each items}}',
        newFormat: '{{#each order.items}}'
      });
    }

    // 检测变量转换
    const oldVarCount = (originalHtml.match(/\{\{@index/) || []).length;
    if (oldVarCount > 0) {
      report.changes.push({
        type: 'variable',
        description: `转换了 ${oldVarCount} 个旧格式变量`,
        oldFormat: '{{@index+1}} / {{@index}}',
        newFormat: '{{meta.index}} / {{meta.index0}}'
      });
    }

    return report;
  }
}

