/**
 * 单据中心数据验证工具
 * 提供数据验证和格式化功能
 */

export class DocumentCenterValidator {
  /**
   * 验证订单数据
   * @param {Object} order - 订单对象
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validateOrder(order) {
    const errors = [];

    if (!order) {
      errors.push('订单数据不能为空');
      return { valid: false, errors };
    }

    if (!order.id) {
      errors.push('订单ID不能为空');
    }

    if (!order.contractNo && !order.invoiceNo) {
      errors.push('订单必须包含合同号或发票号');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证模板数据
   * @param {Object} template - 模板对象
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validateTemplate(template) {
    const errors = [];

    if (!template) {
      errors.push('模板数据不能为空');
      return { valid: false, errors };
    }

    if (!template.id) {
      errors.push('模板ID不能为空');
    }

    if (!template.config) {
      errors.push('模板配置不能为空');
    } else {
      // 兼容多种格式：
      // 1. 新格式V2（config.blocks）- 区块编辑器格式
      // 2. 新格式（config.html）- 新HTML格式
      // 3. 旧格式（config.canvas.components）- 旧编辑器格式
      // 4. 直接HTML（template.html）- 兼容格式
      const hasBlocks = template.blocks !== undefined || 
                       template.config.blocks !== undefined ||
                       (Array.isArray(template.config.blocks) && template.config.blocks.length > 0);
      const hasHtml = template.html !== undefined || 
                     template.config.html !== undefined || 
                     template.config.canvas?.components !== undefined;
      
      if (!hasBlocks && !hasHtml) {
        errors.push('模板画布配置不能为空（需要 config.blocks、config.html 或 config.canvas.components）');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证导出参数
   * @param {Object} params - 导出参数 { order, template, format }
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validateExportParams(params) {
    const errors = [];

    if (!params.order) {
      errors.push('请先选择订单');
    } else {
      const orderValidation = this.validateOrder(params.order);
      if (!orderValidation.valid) {
        errors.push(...orderValidation.errors);
      }
    }

    if (params.format === 'excel') {
      // Excel导出只需要订单
      return {
        valid: errors.length === 0,
        errors
      };
    }

    if (!params.template) {
      errors.push('请先选择模板');
    } else {
      const templateValidation = this.validateTemplate(params.template);
      if (!templateValidation.valid) {
        errors.push(...templateValidation.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证预览参数
   * @param {Object} params - 预览参数 { order, template }
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validatePreviewParams(params) {
    const errors = [];

    if (!params.order) {
      errors.push('请先选择订单');
    } else {
      const orderValidation = this.validateOrder(params.order);
      if (!orderValidation.valid) {
        errors.push(...orderValidation.errors);
      }
    }

    if (!params.template) {
      errors.push('请先选择模板');
    } else {
      const templateValidation = this.validateTemplate(params.template);
      if (!templateValidation.valid) {
        errors.push(...templateValidation.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证模板内容
   * @param {Object} template - 模板对象
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validateTemplateContent(template) {
    const errors = [];

    if (!template) {
      errors.push('模板数据不能为空');
      return { valid: false, errors };
    }

    // 检查模板内容
    const html = template.config?.canvas?.components || template.config?.html || template.html || '';
    if (!html || html.trim().length === 0) {
      errors.push('模板内容不能为空');
    }

    // 检查模板配置
    if (!template.config) {
      errors.push('模板配置不能为空');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

