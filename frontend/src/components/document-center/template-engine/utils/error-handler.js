/**
 * 错误处理工具
 * 定义和抛出模板引擎相关的错误
 */

/**
 * 变量未找到错误
 */
export class VariableNotFoundError extends Error {
  constructor(namespace, field) {
    super(`变量未找到: ${namespace}.${field}`);
    this.name = 'VariableNotFoundError';
    this.namespace = namespace;
    this.field = field;
    this.type = 'VARIABLE_NOT_FOUND';
  }
}

/**
 * 过滤器未找到错误
 */
export class FilterNotFoundError extends Error {
  constructor(filterName) {
    super(`过滤器未找到: ${filterName}`);
    this.name = 'FilterNotFoundError';
    this.filterName = filterName;
    this.type = 'FILTER_NOT_FOUND';
  }
}

/**
 * 语法错误
 */
export class SyntaxError extends Error {
  constructor(message, position) {
    super(message);
    this.name = 'SyntaxError';
    this.position = position;
    this.type = 'SYNTAX_ERROR';
  }
}

/**
 * 结构错误
 */
export class StructureError extends Error {
  constructor(message, position) {
    super(message);
    this.name = 'StructureError';
    this.position = position;
    this.type = 'STRUCTURE_ERROR';
  }
}

/**
 * 错误格式化工具
 */
export class ErrorFormatter {
  /**
   * 格式化错误信息
   * @param {Error} error - 错误对象
   * @param {string} template - 模板字符串
   * @returns {Object} 格式化的错误信息
   */
  static format(error, template) {
    const result = {
      message: error.message,
      type: error.type || 'UNKNOWN_ERROR',
      position: error.position || 0
    };

    // 添加上下文信息
    if (template && result.position >= 0) {
      const lines = template.substring(0, result.position).split('\n');
      result.line = lines.length;
      result.column = lines[lines.length - 1].length;
      result.context = this.getContext(template, result.position);
    }

    return result;
  }

  /**
   * 获取错误位置的上下文
   */
  static getContext(template, position, contextLength = 50) {
    const start = Math.max(0, position - contextLength);
    const end = Math.min(template.length, position + contextLength);
    const context = template.substring(start, end);
    const pointer = ' '.repeat(Math.min(contextLength, position - start)) + '^';
    return `${context}\n${pointer}`;
  }
}

