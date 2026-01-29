/**
 * 模板解析器（Template Parser）
 * 将模板字符串解析为抽象语法树（AST）
 */

import { Tokenizer } from './tokenizer.js';
import { ASTBuilder } from './ast-builder.js';

export class TemplateParser {
  /**
   * 解析模板字符串
   * @param {string} template - 模板字符串
   * @returns {ASTNode} 抽象语法树根节点
   */
  static parse(template) {
    if (typeof template !== 'string') {
      throw new TypeError('模板必须是字符串');
    }

    // 1. 词法分析：将字符串分解为标记
    const tokens = Tokenizer.tokenize(template);

    // 2. 语法分析：从标记构建AST
    const ast = ASTBuilder.build(tokens);

    return ast;
  }

  /**
   * 验证模板语法
   * @param {string} template - 模板字符串
   * @returns {Object} 验证结果
   */
  static validate(template) {
    const result = {
      valid: true,
      ast: null,
      errors: [],
      warnings: []
    };

    try {
      // 1. 词法验证
      const tokenValidation = Tokenizer.validate(template);
      if (!tokenValidation.valid) {
        result.valid = false;
        result.errors.push(...tokenValidation.errors);
        return result;
      }

      // 2. 语法验证
      const ast = this.parse(template);
      result.ast = ast;

      // 3. 结构验证
      const structureValidation = this.validateStructure(ast);
      if (!structureValidation.valid) {
        result.valid = false;
        result.errors.push(...structureValidation.errors);
      }
      result.warnings.push(...structureValidation.warnings);

    } catch (error) {
      result.valid = false;
      result.errors.push({
        message: error.message,
        position: error.position || 0,
        type: 'SYNTAX_ERROR'
      });
    }

    return result;
  }

  /**
   * 验证AST结构
   */
  static validateStructure(ast) {
    const errors = [];
    const warnings = [];

    // 验证所有指令都有对应的结束标记
    this.validateDirectives(ast, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证指令结构
   */
  static validateDirectives(node, errors, warnings) {
    if (node.type === 'LOOP') {
      if (!node.source || node.source.trim() === '') {
        errors.push({
          message: '循环指令缺少数据源',
          position: node.start,
          type: 'STRUCTURE_ERROR'
        });
      }
    }

    if (node.type === 'CONDITION') {
      if (!node.test || node.test.trim() === '') {
        errors.push({
          message: '条件指令缺少测试表达式',
          position: node.start,
          type: 'STRUCTURE_ERROR'
        });
      }
    }

    // 递归验证子节点
    if (node.children) {
      node.children.forEach(child => {
        this.validateDirectives(child, errors, warnings);
      });
    }
  }

  /**
   * 获取模板中的所有变量
   * @param {ASTNode} ast - AST节点
   * @returns {Array<string>} 变量列表
   */
  static extractVariables(ast) {
    const variables = [];

    const traverse = (node) => {
      if (node.type === 'VARIABLE') {
        variables.push(node.raw);
      }

      if (node.children) {
        node.children.forEach(child => traverse(child));
      }
    };

    traverse(ast);
    return variables;
  }

  /**
   * 获取模板中的所有循环
   * @param {ASTNode} ast - AST节点
   * @returns {Array<Object>} 循环列表
   */
  static extractLoops(ast) {
    const loops = [];

    const traverse = (node) => {
      if (node.type === 'LOOP') {
        loops.push({
          source: node.source,
          start: node.start,
          end: node.end
        });
      }

      if (node.children) {
        node.children.forEach(child => traverse(child));
      }
    };

    traverse(ast);
    return loops;
  }
}

