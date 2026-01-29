/**
 * 模板验证器
 * 实时验证模板语法和变量
 */

import { TemplateParser } from '../template-engine/parser/template-parser.js';
import { VariableResolver } from '../template-engine/resolver/variable-resolver.js';

export class TemplateValidator {
  /**
   * 验证模板
   * @param {string} template - 模板字符串
   * @param {Object} options - 选项
   * @returns {Object} 验证结果 { valid, errors, warnings }
   */
  static validate(template, options = {}) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      variables: []
    };

    if (!template || typeof template !== 'string') {
      result.valid = false;
      result.errors.push({
        type: 'INVALID_INPUT',
        message: '模板必须是字符串',
        position: 0
      });
      return result;
    }

    // 1. 语法验证
    let syntaxValidation = { valid: true, ast: null, errors: [] };
    try {
      if (TemplateParser && typeof TemplateParser.validate === 'function') {
        syntaxValidation = TemplateParser.validate(template);
        if (!syntaxValidation.valid) {
          result.valid = false;
          result.errors.push(...(syntaxValidation.errors || []));
        }
      } else {
        console.warn('[TemplateValidator] TemplateParser.validate 不可用，跳过语法验证');
      }
    } catch (error) {
      console.warn('[TemplateValidator] 语法验证失败:', error);
      result.valid = false;
      result.errors.push({
        type: 'VALIDATION_ERROR',
        message: `语法验证失败: ${error.message}`,
        position: 0
      });
      syntaxValidation = { valid: false, ast: null, errors: [] };
    }

    // 2. 变量验证
    if (syntaxValidation && syntaxValidation.ast) {
      try {
        const variableValidation = this.validateVariables(syntaxValidation.ast, options);
        result.warnings.push(...(variableValidation.warnings || []));
        result.variables = variableValidation.variables || [];
      } catch (error) {
        console.warn('[TemplateValidator] 变量验证失败:', error);
        result.warnings.push({
          type: 'VARIABLE_VALIDATION_ERROR',
          message: `变量验证失败: ${error.message}`,
          position: 0
        });
      }
    }

    // 3. 结构验证
    const structureValidation = this.validateStructure(template);
    result.warnings.push(...structureValidation.warnings);

    return result;
  }

  /**
   * 验证变量
   */
  static validateVariables(ast, options = {}) {
    const warnings = [];
    const variables = [];
    const availableNamespaces = this.getAvailableNamespaces();
    
    // 循环上下文变量列表（在 {{#each order.items}} 循环内可用的变量）
    const loopContextVariables = [
      '@index', '@index+1', 'model', 'quantity', 'packages', 'packageUnit',
      'unitPrice', 'amount', 'price', 'weight', 'actualWeight', 'netWeight',
      'grossWeight', 'unit', 'packing', 'labelWeight', 'safetyFactor',
      'cleanliness', 'quantityStr', 'packagesLine', 'descriptionLine',
      'unitPriceUSD', 'amountUSD'
    ];

    // 提取所有变量
    const extractVariables = (node, inLoop = false) => {
      if (!node) return;
      
      // 检查是否是循环节点（先检查，以便在处理子节点时传递正确的 inLoop 标志）
      const sourceStr = node.source ? String(node.source).trim() : '';
      const isLoopNode = node.type === 'LOOP' && 
                        sourceStr && 
                        (sourceStr.includes('order.items') || 
                         sourceStr === 'order.items' ||
                         sourceStr.includes('items'));
      
      // 当前节点是否在循环内（如果父节点是循环，或者当前节点是循环）
      // 注意：一旦进入循环节点，所有子节点都应该在循环内
      const currentInLoop = inLoop || isLoopNode;
      
      // 调试日志
      if (isLoopNode) {
        console.log('[TemplateValidator] 🔄 检测到循环节点:', {
          source: node.source,
          start: node.start,
          inLoop: currentInLoop,
          childrenCount: node.children?.length || 0,
          childrenTypes: node.children?.map(c => c.type) || []
        });
      }
      
      if (node.type === 'VARIABLE') {
        try {
          const variableString = node.raw.replace(/[{}]/g, '').trim();
          // 在验证模式下，不传入数据对象，避免触发变量验证警告
          const resolved = VariableResolver.resolve(variableString, { 
            data: null,  // 不提供数据，避免验证警告
            context: {} 
          });
          
          variables.push({
            raw: node.raw,
            namespace: resolved.namespace,
            field: resolved.fieldPath,
            position: node.start,
            resolved,
            inLoop: currentInLoop
          });

          // 检查是否是循环上下文变量（无论是否在循环内，先检查变量名）
          // 对于 {{@index}}，resolved.namespace 是 '@index'
          // 对于 {{model}}，resolved.namespace 是 'model'
          const isLoopContextVar = loopContextVariables.includes(variableString) || 
                                  loopContextVariables.includes(resolved.namespace);
          
          // 调试：记录循环上下文变量
          if (isLoopContextVar || variableString === '@index' || variableString === '@index+1') {
            console.log('[TemplateValidator] 📝 处理循环上下文变量:', {
              variable: variableString,
              namespace: resolved.namespace,
              inLoop: currentInLoop,
              position: node.start,
              raw: node.raw
            });
          }
          
          // 如果变量是循环上下文变量，且当前在循环内，则跳过警告
          if (currentInLoop && isLoopContextVar) {
            console.log('[TemplateValidator] ✅ 跳过循环上下文变量警告:', {
              variable: variableString,
              namespace: resolved.namespace,
              inLoop: currentInLoop,
              position: node.start
            });
            return;
          }
          
          // 如果变量是 @index 或 @index+1，且当前在循环内，也不产生警告
          if (currentInLoop && (variableString === '@index' || variableString === '@index+1' ||
              resolved.namespace === '@index' || resolved.namespace === '@index+1')) {
            console.log('[TemplateValidator] ✅ 跳过 @index 变量警告:', {
              variable: variableString,
              namespace: resolved.namespace,
              position: node.start
            });
            return;
          }
          
          // 检查命名空间是否为空（无命名空间的变量）
          const hasNoNamespace = !resolved.namespace || resolved.namespace === '';
          
          // 对于空命名空间的变量
          if (hasNoNamespace) {
            // 如果在循环外，则产生警告
            if (!currentInLoop) {
              warnings.push({
                type: 'UNKNOWN_NAMESPACE',
                message: `未知的命名空间: ${variableString}`,
                variable: node.raw,
                position: node.start,
                suggestion: `可用的命名空间: ${Object.keys(availableNamespaces).join(', ')}`
              });
            }
            // 如果在循环内但不是循环上下文变量，也产生警告
            else {
              warnings.push({
                type: 'UNKNOWN_NAMESPACE',
                message: `未知的命名空间: ${variableString}`,
                variable: node.raw,
                position: node.start,
                suggestion: `在循环内，可用的变量: ${loopContextVariables.join(', ')}`
              });
            }
            return;
          }
          
          // 对于有命名空间的变量，检查是否是循环上下文变量
          // 注意：即使 currentInLoop 为 false，如果变量名在循环上下文变量列表中，
          // 且该变量在循环节点附近（通过位置判断），也应该跳过警告
          if (isLoopContextVar) {
            // 检查变量位置是否在循环节点范围内（通过查找最近的循环节点）
            // 这是一个备用检查，以防 inLoop 标志没有正确传递
            const isNearLoop = this.isVariableNearLoop(node.start, ast);
            if (isNearLoop) {
              console.log('[TemplateValidator] ✅ 通过位置检测跳过循环上下文变量警告:', {
                variable: variableString,
                namespace: resolved.namespace,
                position: node.start,
                inLoop: currentInLoop
              });
              return;
            }
          }
          
          // 对于有命名空间的变量，如果在循环内且命名空间是循环上下文变量，也不产生警告
          if (currentInLoop && loopContextVariables.includes(resolved.namespace)) {
            return;
          }

          // 验证已知命名空间
          if (!availableNamespaces[resolved.namespace]) {
            // 只对未知命名空间产生警告
            warnings.push({
              type: 'UNKNOWN_NAMESPACE',
              message: `未知的命名空间: ${resolved.namespace}`,
              variable: node.raw,
              position: node.start,
              suggestion: `可用的命名空间: ${Object.keys(availableNamespaces).join(', ')}`
            });
          }
          // 注意：对于已知命名空间的未知字段，不产生警告
          // 因为字段可能是动态的，或者不在预定义列表中但仍然存在
          // 这样可以减少误报，只在真正有问题时（未知命名空间）才警告
        } catch (error) {
          warnings.push({
            type: 'VARIABLE_PARSE_ERROR',
            message: `变量解析失败: ${error.message}`,
            variable: node.raw,
            position: node.start
          });
        }
      }

      // 递归处理子节点（传递 currentInLoop 标志）
      // 对于所有有子节点的节点类型，都需要传递 inLoop 标志
      // 特别重要：循环节点的所有子节点（包括 CONTENT、TEMPLATE 等）都应该在循环内
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child, index) => {
          // 确保所有子节点都传递 currentInLoop 标志
          // 如果当前节点是循环节点，所有子节点都必须在循环内
          // 如果父节点已经在循环内，子节点也应该在循环内
          const childInLoop = isLoopNode ? true : (currentInLoop || inLoop);
          
          // 调试：记录循环节点的子节点信息
          if (isLoopNode || currentInLoop) {
            console.log(`[TemplateValidator] 🔄 处理子节点[${index}]:`, {
              nodeType: node.type,
              childType: child.type,
              isLoopNode: isLoopNode,
              currentInLoop: currentInLoop,
              inLoop: inLoop,
              childInLoop: childInLoop,
              hasChildren: !!child.children,
              childrenCount: child.children?.length || 0
            });
          }
          
          extractVariables(child, childInLoop);
        });
      }
    };

    extractVariables(ast);
    
    // 调试：输出变量统计
    console.log('[TemplateValidator] 变量验证完成:', {
      totalVariables: variables.length,
      inLoopVariables: variables.filter(v => v.inLoop).length,
      warnings: warnings.length,
      loopContextWarnings: warnings.filter(w => w.type === 'UNKNOWN_NAMESPACE' && w.variable && 
        (w.variable.includes('model') || w.variable.includes('packages') || w.variable.includes('quantity') || 
         w.variable.includes('unitPrice') || w.variable.includes('amount'))).length
    });

    return { warnings, variables };
  }

  /**
   * 检查变量是否在循环节点附近（通过位置判断）
   * 这是一个备用检查，用于处理 inLoop 标志没有正确传递的情况
   */
  static isVariableNearLoop(variablePosition, ast) {
    let nearestLoop = null;
    let minDistance = Infinity;
    
    const findLoops = (node) => {
      if (node.type === 'LOOP' && node.source && 
          (node.source.includes('order.items') || node.source.includes('items'))) {
        const distance = Math.abs(variablePosition - node.start);
        if (distance < minDistance) {
          minDistance = distance;
          nearestLoop = node;
        }
      }
      
      if (node.children) {
        node.children.forEach(child => findLoops(child));
      }
    };
    
    findLoops(ast);
    
    // 如果变量位置在循环节点的开始和结束之间，认为它在循环内
    if (nearestLoop && variablePosition >= nearestLoop.start && variablePosition <= nearestLoop.end) {
      return true;
    }
    
    // 如果变量位置距离循环节点很近（在循环节点之后5000个字符内），也认为它在循环内
    if (nearestLoop && variablePosition > nearestLoop.start && 
        (variablePosition - nearestLoop.start) < 5000) {
      return true;
    }
    
    return false;
  }

  /**
   * 验证模板结构
   */
  static validateStructure(template) {
    const warnings = [];

    // 检查未闭合的循环
    const loopStarts = (template.match(/\{\{#each\s+[^}]+\}\}/g) || []).length;
    const loopEnds = (template.match(/\{\{\s*\/each\s*\}\}/g) || []).length;
    if (loopStarts !== loopEnds) {
      warnings.push({
        type: 'UNCLOSED_LOOP',
        message: `循环未闭合: 找到 ${loopStarts} 个开始标记，${loopEnds} 个结束标记`,
        position: 0
      });
    }

    // 检查未闭合的条件
    // 使用更精确的正则表达式匹配 {{#if ...}} 和 {{/if}}
    // 注意：{{#if}} 后面可能有条件表达式，也可能没有
    // 匹配格式：{{#if condition}} 或 {{#if}}
    // 修改正则：使用 [^}]* 而不是 [^}]+，允许空条件表达式，并且允许条件表达式包含点号等字符
    const ifStarts = (template.match(/\{\{#if\s+[^}]+\}\}/g) || []).length;
    // 匹配格式：{{/if}} 或 {{ /if }}
    const ifEnds = (template.match(/\{\{\s*\/if\s*\}\}/g) || []).length;
    
    // 如果数量不匹配，使用 AST 解析来确认是否真的未闭合
    // 如果 AST 验证通过，说明结构是正确的，不报告警告（避免误报）
    if (ifStarts !== ifEnds) {
      try {
        // 使用已经导入的 TemplateParser 进行验证
        const astValidation = TemplateParser.validate(template);
        // 如果 AST 验证通过，说明结构是正确的，不报告警告
        // 这可以避免因为正则表达式不够精确导致的误报
        if (!astValidation.valid) {
          // AST 验证失败，报告警告
          warnings.push({
            type: 'UNCLOSED_CONDITION',
            message: `条件未闭合: 找到 ${ifStarts} 个开始标记，${ifEnds} 个结束标记`,
            position: 0
          });
        }
        // 如果 AST 验证通过，不报告警告（结构是正确的）
      } catch (e) {
        // 如果 AST 解析失败，使用原始计数报告警告
        warnings.push({
          type: 'UNCLOSED_CONDITION',
          message: `条件未闭合: 找到 ${ifStarts} 个开始标记，${ifEnds} 个结束标记`,
          position: 0
        });
      }
    }

    // 检查未闭合的变量
    const varStarts = (template.match(/\{\{/g) || []).length;
    const varEnds = (template.match(/\}\}/g) || []).length;
    if (varStarts !== varEnds) {
      warnings.push({
        type: 'UNCLOSED_VARIABLE',
        message: `变量未闭合: 找到 ${varStarts} 个开始标记，${varEnds} 个结束标记`,
        position: 0
      });
    }

    return { warnings };
  }

  /**
   * 获取可用的命名空间
   */
  static getAvailableNamespaces() {
    return {
      order: {
        contractNo: 'string',
        invoiceNo: 'string',
        orderNo: 'string',
        shipmentDate: 'date',
        shipFrom: 'string',
        shipTo: 'string',
        blNo: 'string',
        shippedPerSs: 'string',
        customerName: 'string',
        totalUSD: 'number',
        totalAmount: 'number',
        items: 'array'
      },
      customer: {
        name: 'string',
        address: 'string',
        tel: 'string',
        fax: 'string',
        email: 'string'
      },
      company: {
        companyNameEN: 'string',
        companyNameCN: 'string',
        companyAddressEN: 'string',
        companyAddressCN: 'string',
        companyTel: 'string',
        companyFax: 'string'
      },
      item: {
        model: 'string',
        quantity: 'number',
        packages: 'number',
        packageUnit: 'string',
        unitPrice: 'number',
        amount: 'number',
        weight: 'number',
        packing: 'string'
      },
      meta: {
        index: 'number',
        index0: 'number',
        first: 'boolean',
        last: 'boolean',
        count: 'number'
      },
      calc: {
        totalQuantity: 'number',
        totalPackages: 'number',
        totalPieces: 'number',
        totalAmount: 'number',
        totalAmountUSD: 'string'
      },
      sv: {
        cellPad: 'number'
      }
    };
  }

  /**
   * 检查字段是否存在
   */
  static fieldExists(namespaceFields, fieldPath) {
    const parts = fieldPath.split('.');
    let current = namespaceFields;
    
    for (const part of parts) {
      if (!current || !current[part]) {
        return false;
      }
      current = current[part];
    }
    
    return true;
  }

  /**
   * 格式化验证结果
   */
  static formatResult(validation) {
    const lines = [];
    
    if (validation.valid && validation.errors.length === 0 && validation.warnings.length === 0) {
      lines.push('✅ 模板验证通过');
    } else {
      if (validation.errors.length > 0) {
        lines.push(`❌ 发现 ${validation.errors.length} 个错误:`);
        validation.errors.forEach((error, index) => {
          lines.push(`  ${index + 1}. ${error.message}`);
          if (error.position) {
            lines.push(`     位置: ${error.position}`);
          }
        });
      }
      
      if (validation.warnings.length > 0) {
        lines.push(`⚠️ 发现 ${validation.warnings.length} 个警告:`);
        validation.warnings.forEach((warning, index) => {
          lines.push(`  ${index + 1}. ${warning.message}`);
          if (warning.position) {
            lines.push(`     位置: ${warning.position}`);
          }
          if (warning.suggestion) {
            lines.push(`     建议: ${warning.suggestion}`);
          }
        });
      }
    }
    
    return lines.join('\n');
  }
}

