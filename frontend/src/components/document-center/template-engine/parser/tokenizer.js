/**
 * 词法分析器（Tokenizer）
 * 将模板字符串分解为标记（Token）
 * 
 * 支持的标记类型：
 * - TEXT: 普通文本
 * - VARIABLE_START: 变量开始标记 {{
 * - VARIABLE_END: 变量结束标记 }}
 * - DIRECTIVE_START: 指令开始标记 {{#
 * - DIRECTIVE_END: 指令结束标记 {{/
 * - VARIABLE: 变量内容
 * - FILTER: 过滤器
 */

export class Tokenizer {
  /**
   * 将模板字符串分解为标记
   * @param {string} template - 模板字符串
   * @returns {Array<Token>} 标记数组
   */
  static tokenize(template) {
    const tokens = [];
    let position = 0;
    let state = 'TEXT';
    let buffer = '';
    let tokenStart = 0;

    while (position < template.length) {
      const char = template[position];
      const nextChar = template[position + 1];

      switch (state) {
        case 'TEXT':
          if (char === '{' && nextChar === '{') {
            // 保存文本标记
            if (buffer.length > 0) {
              tokens.push({
                type: 'TEXT',
                value: buffer,
                start: tokenStart,
                end: position
              });
              buffer = '';
            }
            // 进入变量开始状态
            state = 'VARIABLE_START';
            tokenStart = position;
            position += 2;
          } else {
            buffer += char;
            position++;
          }
          break;

        case 'VARIABLE_START':
          if (char === '#') {
            // 指令开始 {{#
            tokens.push({
              type: 'DIRECTIVE_START',
              value: '#',
              start: tokenStart,
              end: position + 1
            });
            state = 'DIRECTIVE';
            buffer = '';
            tokenStart = position + 1;
            position++;
          } else if (char === '/') {
            // 指令结束 {{/
            tokens.push({
              type: 'DIRECTIVE_END',
              value: '/',
              start: tokenStart,
              end: position + 1
            });
            state = 'DIRECTIVE';
            buffer = '';
            tokenStart = position + 1;
            position++;
          } else {
            // 普通变量开始
            state = 'VARIABLE';
            buffer = '';
            tokenStart = position;
          }
          break;

        case 'VARIABLE':
          if (char === '}' && nextChar === '}') {
            // 变量结束
            tokens.push({
              type: 'VARIABLE',
              value: buffer.trim(),
              start: tokenStart,
              end: position
            });
            tokens.push({
              type: 'VARIABLE_END',
              value: '}}',
              start: position,
              end: position + 2
            });
            state = 'TEXT';
            buffer = '';
            tokenStart = position + 2;
            position += 2;
          } else if (char === '|') {
            // 遇到过滤器分隔符
            tokens.push({
              type: 'VARIABLE',
              value: buffer.trim(),
              start: tokenStart,
              end: position
            });
            state = 'FILTER';
            buffer = '';
            tokenStart = position + 1;
            position++;
          } else {
            buffer += char;
            position++;
          }
          break;

        case 'DIRECTIVE':
          if (char === '}' && nextChar === '}') {
            // 指令结束
            const directiveValue = buffer.trim();
            tokens.push({
              type: 'DIRECTIVE',
              value: directiveValue,
              start: tokenStart,
              end: position
            });
            tokens.push({
              type: 'DIRECTIVE_END',
              value: '}}',
              start: position,
              end: position + 2
            });
            state = 'TEXT';
            buffer = '';
            tokenStart = position + 2;
            position += 2;
          } else {
            buffer += char;
            position++;
          }
          break;

        case 'FILTER':
          if (char === '}' && nextChar === '}') {
            // 过滤器结束
            tokens.push({
              type: 'FILTER',
              value: buffer.trim(),
              start: tokenStart,
              end: position
            });
            tokens.push({
              type: 'VARIABLE_END',
              value: '}}',
              start: position,
              end: position + 2
            });
            state = 'TEXT';
            buffer = '';
            tokenStart = position + 2;
            position += 2;
          } else {
            buffer += char;
            position++;
          }
          break;

        default:
          position++;
          break;
      }
    }

    // 处理剩余的文本
    if (buffer.length > 0 && state === 'TEXT') {
      tokens.push({
        type: 'TEXT',
        value: buffer,
        start: tokenStart,
        end: position
      });
    }

    // 如果还有未关闭的标记，抛出错误
    if (state !== 'TEXT') {
      throw new SyntaxError(`模板语法错误：未关闭的标记，位置 ${tokenStart}`);
    }

    return tokens;
  }

  /**
   * 验证模板语法
   * @param {string} template - 模板字符串
   * @returns {Object} 验证结果
   */
  static validate(template) {
    try {
      const tokens = this.tokenize(template);
      return {
        valid: true,
        tokens,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        tokens: [],
        errors: [{
          message: error.message,
          position: error.position || 0
        }]
      };
    }
  }
}

