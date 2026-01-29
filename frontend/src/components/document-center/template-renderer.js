/**
 * 模板渲染引擎
 * 负责将模板配置渲染为HTML
 * 支持新模板格式（从第一阶段提取的JSON格式）
 */

import { DataBinder } from './data-binder.js';
import { CalculationConfigManager } from './calculation-config-manager.js';
import { logger } from './logger.js';

export class TemplateRenderer {
  /**
   * 渲染模板
   * @param {Object} template - 模板对象
   * @param {Object} data - 数据对象 { order, customer, company }
   * @returns {string} 渲染后的HTML字符串
   */
  static render(template, data) {
    if (!template) {
      throw new Error('模板配置无效');
    }

    // 支持新模板格式（第一阶段提取的格式）
    let html = '';
    let css = '';
    let margin = { top: 20, bottom: 20, left: 20, right: 20 };
    let calculations = [];
    let conditions = {};

    // 检查是否是新格式（直接从JSON文件导入的格式）
    if (template.html !== undefined) {
      // 新格式：直接从提取的JSON模板
      html = template.html || '';
      css = template.styles || '';
      calculations = template.calculations || [];
      conditions = template.conditions || {};
      
      // 如果有margin配置，使用它
      if (template.margin) {
        margin = template.margin;
      }
      logger.debug('使用新格式模板', {
        htmlLength: html.length,
        hasLoops: html.includes('{{#each')
      });
    } else if (template.config) {
      // 数据库格式：可能是从新格式转换来的，也可能是旧版编辑器保存的格式
      // 优先检查是否有新格式的字段（从导入的模板转换来的）
      if (template.config.html !== undefined) {
        // 从新格式转换来的，但存储在config中
        html = template.config.html || '';
        css = template.config.styles || '';
        calculations = template.config.calculations || [];
        conditions = template.config.conditions || {};
        margin = template.config.margin || { top: 20, bottom: 20, left: 20, right: 20 };
        logger.debug('使用config.html格式', {
          htmlLength: html.length,
          hasLoops: html.includes('{{#each')
        });
      } else if (template.config.canvas?.components) {
        // 检查canvas.components中是否包含新格式的循环语法
        const canvasHtml = template.config.canvas.components || '';
        if (canvasHtml.includes('{{#each')) {
          // 这是从新格式转换来的，HTML在canvas.components中
          html = canvasHtml;
          css = template.config.canvas?.styles || '';
          calculations = template.config?.calculations || [];
          conditions = template.config?.conditions || {};
          margin = template.config?.margin || { top: 20, bottom: 20, left: 20, right: 20 };
          logger.debug('使用canvas.components格式（包含循环）', {
            htmlLength: html.length,
            hasLoops: html.includes('{{#each')
          });
        } else {
          // 旧格式：旧版编辑器保存的格式
          html = canvasHtml;
          css = template.config.canvas?.styles || '';
          margin = template.config?.margin || { top: 20, bottom: 20, left: 20, right: 20 };
          calculations = template.config?.calculations || [];
          conditions = template.config?.conditions || {};
          logger.debug('使用旧格式（旧版编辑器）', { htmlLength: html.length });
        }
      } else {
        // 没有canvas.components，使用空内容
        html = '';
        css = '';
        margin = template.config?.margin || { top: 20, bottom: 20, left: 20, right: 20 };
        calculations = template.config?.calculations || [];
        conditions = template.config?.conditions || {};
        logger.warn('模板config中没有找到HTML内容');
      }
    } else {
      throw new Error('模板格式不支持');
    }

    // 执行计算逻辑（使用新的计算配置管理器）
    const calculatedValues = CalculationConfigManager.executeCalculations(calculations, data);

    // 执行条件渲染
    html = this.processConditions(html, conditions, data);

    // 替换样式变量 {{sv.xxx}}
    html = this.replaceStyleVariables(html);

    // 数据绑定（包含计算值）
    const dataWithCalculations = {
      ...data,
      calc: calculatedValues,
      docType: template.type // 传递单据类型，用于特殊规则判断
    };
    // 传递计算结果给 DataBinder，用于在循环中处理扩展计算字段
    const boundHtml = DataBinder.bind(html, dataWithCalculations, calculatedValues);

    // 替换计算变量 {{calc.xxx}}
    let finalHtml = this.replaceCalculationVariables(boundHtml, calculatedValues);

    // 最终验证：确保 tfoot 中的 br 标签和样式被正确保留
    const tfootMatches = finalHtml.match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/gi);
    if (tfootMatches) {
      tfootMatches.forEach((tfootMatch, index) => {
        // 检查是否包含 br 标签
        if (tfootMatch.includes('<br') || tfootMatch.includes('<br/>')) {
          logger.debug(`tfoot[${index}] 包含br标签`);
          
          // 检查样式是否正确
          if (!tfootMatch.includes('white-space: normal') && !tfootMatch.includes('white-space:normal')) {
            logger.warn(`tfoot[${index}] 包含br但缺少white-space: normal，尝试修复`);
            // 修复样式
            const fixedTfoot = tfootMatch.replace(
              /(<td[^>]*style=")([^"]*)(")/g,
              (match, styleStart, styleContent, styleEnd) => {
                if (match.includes('总计 TOTAL') || match.includes('TOTAL') || match.includes('<br')) {
                  if (!styleContent.includes('white-space')) {
                    return styleStart + styleContent + ' white-space: normal !important; word-wrap: break-word !important;' + styleEnd;
                  } else if (styleContent.includes('white-space:nowrap')) {
                    return styleStart + styleContent.replace(/white-space:\s*nowrap/gi, 'white-space: normal !important') + ' word-wrap: break-word !important;' + styleEnd;
                  }
                }
                return match;
              }
            );
            // 替换原始tfoot
            finalHtml = finalHtml.replace(tfootMatch, fixedTfoot);
            logger.debug(`修复后的tfoot[${index}]`, { preview: fixedTfoot.substring(0, 200) });
          } else {
            logger.debug(`tfoot[${index}] 样式正确`);
          }
        }
      });
    }

    // 包装完整HTML文档
    return this.wrapHtml(finalHtml, css, margin);
  }

  /**
   * 执行计算逻辑
   * @param {Array} calculations - 计算规则数组
   * @param {Object} data - 数据对象
   * @returns {Object} 计算结果对象
   */
  static executeCalculations(calculations, data) {
    const results = {};
    
    if (!calculations || !Array.isArray(calculations)) {
      return results;
    }

    const order = data?.order || {};
    const items = order.items || [];

    calculations.forEach((calc, index) => {
      try {
        let result = 0;
        
        if (calc.type === 'sum') {
          // 求和计算
          const initial = parseFloat(calc.initial || 0);
          result = items.reduce((sum, it) => {
            // 执行公式（简化版，支持基本运算）
            const formula = calc.formula || 'sum + 0';
            // 替换公式中的变量
            let evalFormula = formula
              .replace(/\bsum\b/g, String(sum))
              .replace(/\bit\.(\w+)\b/g, (match, field) => {
                const value = it[field] || 0;
                return String(value);
              });
            
            // 安全执行计算（仅支持基本数学运算）
            try {
              // 移除可能的危险代码，只保留数学表达式
              evalFormula = evalFormula.replace(/[^0-9+\-*/().\s]/g, '');
              return eval(evalFormula) || sum;
            } catch (e) {
              logger.warn(`计算公式执行失败: ${formula}`, e);
              return sum;
            }
          }, initial);
        } else if (calc.type === 'reduce') {
          // reduce计算
          const initial = parseFloat(calc.initial || 0);
          result = items.reduce((sum, it) => {
            const formula = calc.formula || 'sum + 0';
            let evalFormula = formula
              .replace(/\bsum\b/g, String(sum))
              .replace(/\bitem\.(\w+)\b/g, (match, field) => {
                const value = it[field] || 0;
                return String(value);
              });
            
            try {
              evalFormula = evalFormula.replace(/[^0-9+\-*/().\s]/g, '');
              return eval(evalFormula) || sum;
            } catch (e) {
              logger.warn(`reduce计算失败: ${formula}`, e);
              return sum;
            }
          }, initial);
        }

        // 使用target字段名、field字段名或索引作为key
        const key = calc.target || calc.field || calc.name || `calc${index}`;
        results[key] = result;
        
        // 如果field是"items"，也支持通过items作为key访问（向后兼容）
        if (calc.field === 'items' && calc.target) {
          results[calc.target] = result;
        }
      } catch (error) {
        logger.error(`计算执行失败`, { calc, error: error.message });
      }
    });

    return results;
  }

  /**
   * 处理条件渲染
   * @param {string} html - HTML字符串
   * @param {Object} conditions - 条件规则对象
   * @param {Object} data - 数据对象
   * @returns {string} 处理后的HTML
   */
  static processConditions(html, conditions, data) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return html;
    }

    // 处理条件块 {{if condition}}...{{/if}}
    // 简化实现：支持基本的条件判断
    html = html.replace(/\{\{if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
      try {
        // 评估条件表达式
        const result = this.evaluateCondition(condition, data);
        return result ? content : '';
      } catch (error) {
        logger.warn(`条件评估失败: ${condition}`, error);
        return '';
      }
    });

    return html;
  }

  /**
   * 评估条件表达式
   * @param {string} condition - 条件表达式
   * @param {Object} data - 数据对象
   * @returns {boolean} 条件结果
   */
  static evaluateCondition(condition, data) {
    // 简化实现：支持基本的比较操作
    // 例如：item.productType === 'A'
    
    // 替换变量
    let evalCondition = condition
      .replace(/\b(\w+)\.(\w+)\b/g, (match, obj, field) => {
        const value = data[obj]?.[field];
        return value !== undefined ? JSON.stringify(value) : 'undefined';
      })
      .replace(/\b(\w+)\b/g, (match, varName) => {
        // 如果是字符串字面量，保持原样
        if (match.startsWith("'") || match.startsWith('"')) {
          return match;
        }
        // 否则尝试从data中获取
        const value = data[varName];
        return value !== undefined ? JSON.stringify(value) : 'undefined';
      });

    try {
      // 安全评估（仅支持基本比较）
      return eval(evalCondition) || false;
    } catch (error) {
      logger.warn(`条件评估失败: ${condition}`, error);
      return false;
    }
  }

  /**
   * 替换样式变量 {{sv.xxx}}
   * @param {string} html - HTML字符串
   * @returns {string} 替换后的HTML
   */
  static replaceStyleVariables(html) {
    // 默认样式变量值
    const styleVars = {
      cellPad: 8,
      fontSize: 12,
      lineHeight: 1.5
    };

    // 替换 {{sv.xxx}} 格式的变量
    html = html.replace(/\{\{sv\.(\w+)\}\}/g, (match, key) => {
      const value = styleVars[key];
      return value !== undefined ? String(value) : '';
    });

    return html;
  }

  /**
   * 替换计算变量 {{calc.xxx}}
   * @param {string} html - HTML字符串
   * @param {Object} calculatedValues - 计算结果对象
   * @returns {string} 替换后的HTML
   */
  static replaceCalculationVariables(html, calculatedValues) {
    if (!calculatedValues || Object.keys(calculatedValues).length === 0) {
      return html;
    }

    // 替换 {{calc.xxx}} 格式的变量
    html = html.replace(/\{\{calc\.(\w+)\}\}/g, (match, key) => {
      const value = calculatedValues[key];
      return value !== undefined ? String(value) : '';
    });

    return html;
  }

  /**
   * 包装HTML为完整文档
   * @param {string} content - HTML内容
   * @param {string} css - CSS样式
   * @param {Object} margin - 页边距设置 { top, bottom, left, right }
   * @returns {string} 完整HTML文档
   */
  static wrapHtml(content, css = '', margin = { top: 20, bottom: 20, left: 20, right: 20 }) {
    const paddingTop = margin.top || 20;
    const paddingBottom = margin.bottom || 20;
    const paddingLeft = margin.left || 20;
    const paddingRight = margin.right || 20;
    
    return `
      <!DOCTYPE html>
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
            min-height: auto; /* 改为auto，让内容决定高度 */
            height: auto;
            padding: ${paddingTop}mm ${paddingRight}mm ${paddingBottom}mm ${paddingLeft}mm;
            font-family: Arial, "Microsoft YaHei", sans-serif;
            font-size: 12px;
            line-height: 1.5;
            color: #000;
            background: #fff;
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          /* 基础表格样式 - 只设置必要的默认值，不覆盖内联样式 */
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 0;
          }
          
          /* 重要：不设置 table th 和 table td 的默认样式，完全保留模板中的内联样式 */
          /* 模板中的所有样式都应该通过内联样式定义，确保所见即所得 */
          
          /* 确保 tfoot 中的 br 标签能正确换行 - 使用 !important 确保优先级 */
          /* 这是唯一需要强制应用的样式，用于确保 br 标签正确换行 */
          table tfoot td {
            white-space: normal !important;
            word-wrap: break-word !important;
            line-height: 1.5 !important;
          }
          
          table tfoot td br {
            display: block !important;
            content: "" !important;
            margin-top: 0 !important;
            line-height: 1.2 !important;
          }
          
          /* 确保所有内联样式都被保留 - 内联样式自动具有最高优先级 */
          /* 模板中的所有样式都应该通过内联样式定义 */
          
          img {
            max-width: 100%;
            height: auto;
          }
          
          /* 确保打印时样式一致 */
          @media print {
            body {
              width: 210mm;
              height: 297mm;
            }
          }
          
          ${css}
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;
  }

  /**
   * 渲染到DOM元素
   * @param {string} containerId - 容器ID
   * @param {Object} template - 模板对象
   * @param {Object} data - 数据对象
   */
  static renderToElement(containerId, template, data) {
    const container = document.getElementById(containerId);
    if (!container) {
      logger.error(`容器未找到: ${containerId}`);
      return;
    }

    try {
      const html = this.render(template, data);
      
      // 创建iframe来渲染HTML（避免样式冲突）
      let iframe = container.querySelector('iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        container.appendChild(iframe);
      }

      // 写入HTML内容
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();
    } catch (error) {
      logger.error('渲染失败', error);
      container.innerHTML = `<div style="padding: 20px; color: #dc3545;">渲染失败: ${error.message}</div>`;
    }
  }

  /**
   * 渲染到预览容器（使用iframe确保样式隔离和一致性）
   * @param {string} containerId - 容器ID
   * @param {Object} template - 模板对象
   * @param {Object} data - 数据对象
   */
  static renderToPreview(containerId, template, data) {
    const container = document.getElementById(containerId);
    if (!container) {
      logger.error(`容器未找到: ${containerId}`);
      return;
    }

    try {
      const html = this.render(template, data);
      
      // 使用iframe渲染，确保样式隔离和与PDF导出一致
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

      // 写入HTML内容
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // 等待iframe加载完成
      iframe.onload = () => {
        logger.debug('预览渲染完成');
      };
    } catch (error) {
      logger.error('渲染失败', error);
      container.innerHTML = `<div style="padding: 20px; color: #dc3545; text-align: center;">渲染失败: ${error.message}</div>`;
    }
  }
}

