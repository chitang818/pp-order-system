/**
 * AST构建器（AST Builder）
 * 从标记序列构建抽象语法树（AST）
 */

export class ASTBuilder {
  /**
   * 从标记序列构建AST
   * @param {Array<Token>} tokens - 标记数组
   * @returns {ASTNode} AST根节点
   */
  static build(tokens) {
    const root = {
      type: 'TEMPLATE',
      children: [],
      start: 0,
      end: tokens.length > 0 ? tokens[tokens.length - 1].end : 0
    };

    const stack = [root];
    let current = root;
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      switch (token.type) {
        case 'TEXT':
          current.children.push({
            type: 'TEXT',
            content: token.value,
            start: token.start,
            end: token.end
          });
          i++;
          break;

        case 'VARIABLE':
          // 查找对应的 VARIABLE_END
          const variableEndIndex = this.findVariableEnd(tokens, i);
          const filters = this.extractFilters(tokens, i, variableEndIndex);
          
          const variableNode = {
            type: 'VARIABLE',
            raw: this.reconstructVariable(tokens, i, variableEndIndex),
            start: token.start,
            end: tokens[variableEndIndex].end,
            filters: filters
          };
          
          current.children.push(variableNode);
          i = variableEndIndex + 1;
          break;

        case 'DIRECTIVE_START':
          // 解析指令
          const directiveResult = this.parseDirective(tokens, i);
          const directiveNode = directiveResult.node;
          
          current.children.push(directiveNode);
          stack.push(directiveNode);
          current = directiveNode;
          i = directiveResult.endIndex + 1;
          break;

        case 'DIRECTIVE_END':
          // 指令结束，返回到父节点
          if (stack.length > 1) {
            stack.pop();
            current = stack[stack.length - 1];
          }
          i++;
          break;

        default:
          i++;
          break;
      }
    }

    return root;
  }

  /**
   * 查找变量结束标记
   */
  static findVariableEnd(tokens, startIndex) {
    let depth = 0;
    for (let i = startIndex; i < tokens.length; i++) {
      if (tokens[i].type === 'VARIABLE_END') {
        if (depth === 0) {
          return i;
        }
        depth--;
      } else if (tokens[i].type === 'VARIABLE_START') {
        depth++;
      }
    }
    throw new SyntaxError(`变量未关闭，位置 ${tokens[startIndex].start}`);
  }

  /**
   * 提取过滤器
   */
  static extractFilters(tokens, startIndex, endIndex) {
    const filters = [];
    for (let i = startIndex; i <= endIndex; i++) {
      if (tokens[i].type === 'FILTER') {
        filters.push(this.parseFilter(tokens[i].value));
      }
    }
    return filters;
  }

  /**
   * 解析过滤器
   */
  static parseFilter(filterString) {
    const parts = filterString.split(':');
    const name = parts[0].trim();
    const params = parts.slice(1).map(p => p.trim());
    return { name, params };
  }

  /**
   * 重构变量原始字符串
   */
  static reconstructVariable(tokens, startIndex, endIndex) {
    let result = '{{';
    for (let i = startIndex; i <= endIndex; i++) {
      if (tokens[i].type === 'VARIABLE') {
        result += tokens[i].value;
      } else if (tokens[i].type === 'FILTER') {
        result += '|' + tokens[i].value;
      } else if (tokens[i].type === 'VARIABLE_END') {
        result += '}}';
      }
    }
    return result;
  }

  /**
   * 解析指令
   */
  static parseDirective(tokens, startIndex) {
    // 查找指令内容
    let directiveIndex = startIndex + 1;
    while (directiveIndex < tokens.length && tokens[directiveIndex].type !== 'DIRECTIVE') {
      directiveIndex++;
    }

    if (directiveIndex >= tokens.length) {
      throw new SyntaxError(`指令未找到，位置 ${tokens[startIndex].start}`);
    }

    const directiveValue = tokens[directiveIndex].value;
    const directiveParts = directiveValue.split(/\s+/);
    const directiveName = directiveParts[0];

    // 查找对应的结束标记
    const endIndex = this.findDirectiveEnd(tokens, startIndex);

    // 创建指令节点
    let node;
    switch (directiveName) {
      case 'each':
        node = {
          type: 'LOOP',
          source: directiveParts.slice(1).join(' '),
          children: [],
          start: tokens[startIndex].start,
          end: tokens[endIndex].end
        };
        break;

      case 'if':
        node = {
          type: 'CONDITION',
          test: directiveParts.slice(1).join(' '),
          then: [],
          else: [],
          start: tokens[startIndex].start,
          end: tokens[endIndex].end
        };
        break;

      default:
        throw new SyntaxError(`未知的指令: ${directiveName}`);
    }

    // 解析指令内容（在开始和结束标记之间的内容）
    const contentTokens = tokens.slice(directiveIndex + 1, endIndex);
    
    // 对于条件指令，需要查找 {{else}} 来分离 then 和 else 分支
    if (node.type === 'CONDITION') {
      const elseIndex = this.findElseDirective(contentTokens);
      if (elseIndex >= 0) {
        // 找到 else，分离 then 和 else 分支
        // elseIndex 是 VARIABLE 标记的索引，需要跳过 VARIABLE_END 标记
        let skipCount = 1; // 跳过 VARIABLE 标记本身
        // 查找对应的 VARIABLE_END 标记
        for (let j = elseIndex + 1; j < contentTokens.length; j++) {
          if (contentTokens[j].type === 'VARIABLE_END') {
            skipCount = j - elseIndex + 1; // 跳过 VARIABLE 和 VARIABLE_END
            break;
          }
        }
        
        const thenTokens = contentTokens.slice(0, elseIndex);
        const elseTokens = contentTokens.slice(elseIndex + skipCount);
        
        const thenAST = this.buildContent(thenTokens);
        const elseAST = this.buildContent(elseTokens);
        
        node.then = thenAST.children;
        node.else = elseAST.children;
        node.children = thenAST.children; // 保持向后兼容
      } else {
        // 没有 else 分支
        const contentAST = this.buildContent(contentTokens);
        node.then = contentAST.children;
        node.children = contentAST.children;
      }
    } else {
      // 其他指令类型，正常处理
      const contentAST = this.buildContent(contentTokens);
      node.children = contentAST.children;
    }

    return {
      node,
      endIndex
    };
  }

  /**
   * 查找 {{else}} 指令的位置（只查找当前层级的 else，不包括嵌套指令中的 else）
   * @param {Array<Token>} tokens - 标记数组
   * @returns {number} else 变量的索引，如果未找到返回 -1
   */
  static findElseDirective(tokens) {
    let depth = 0; // 指令嵌套深度（DIRECTIVE_START 和 DIRECTIVE_END 的平衡）
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // 跟踪指令嵌套深度
      // 当遇到 DIRECTIVE_START 时，深度增加（表示进入嵌套指令）
      // 当遇到 DIRECTIVE_END 时，深度减少（表示退出嵌套指令）
      if (token.type === 'DIRECTIVE_START') {
        depth++;
      } else if (token.type === 'DIRECTIVE_END' && token.value === '/') {
        depth--;
        // 如果深度变为负数，说明有未匹配的结束标记，不应该发生
        if (depth < 0) {
          return -1;
        }
      }
      
      // {{else}} 被识别为 VARIABLE 类型，值为 "else"
      // 只在顶层（depth === 0，表示没有未关闭的嵌套指令）查找 else
      // 这样可以确保找到的是当前 {{#if}} 的 else，而不是嵌套指令中的 else
      if (token.type === 'VARIABLE' && depth === 0) {
        // 检查变量值是否为 "else"
        if (token.value === 'else') {
          return i; // 返回 VARIABLE 的索引
        }
      }
    }
    return -1;
  }

  /**
   * 查找指令结束标记
   */
  static findDirectiveEnd(tokens, startIndex) {
    let depth = 1;
    for (let i = startIndex + 1; i < tokens.length; i++) {
      if (tokens[i].type === 'DIRECTIVE_START') {
        depth++;
      } else if (tokens[i].type === 'DIRECTIVE_END' && tokens[i].value === '/') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    throw new SyntaxError(`指令未关闭，位置 ${tokens[startIndex].start}`);
  }

  /**
   * 构建内容AST（用于指令内容）
   */
  static buildContent(tokens) {
    const root = {
      type: 'CONTENT',
      children: []
    };

    const stack = [root];
    let current = root;
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      switch (token.type) {
        case 'TEXT':
          current.children.push({
            type: 'TEXT',
            content: token.value,
            start: token.start,
            end: token.end
          });
          i++;
          break;

        case 'VARIABLE':
          const variableEndIndex = this.findVariableEnd(tokens, i);
          const filters = this.extractFilters(tokens, i, variableEndIndex);
          
          current.children.push({
            type: 'VARIABLE',
            raw: this.reconstructVariable(tokens, i, variableEndIndex),
            start: token.start,
            end: tokens[variableEndIndex].end,
            filters: filters
          });
          i = variableEndIndex + 1;
          break;

        case 'DIRECTIVE_START':
          const directiveResult = this.parseDirective(tokens, i);
          current.children.push(directiveResult.node);
          stack.push(directiveResult.node);
          current = directiveResult.node;
          i = directiveResult.endIndex + 1;
          break;

        case 'DIRECTIVE_END':
          if (stack.length > 1) {
            stack.pop();
            current = stack[stack.length - 1];
          }
          i++;
          break;

        default:
          i++;
          break;
      }
    }

    return root;
  }
}

