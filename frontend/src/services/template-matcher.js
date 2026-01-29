/**
 * 模板匹配服务
 * 根据订单信息自动匹配最合适的模板
 */
export class TemplateMatcher {
  
  /**
   * 匹配模板
   * @param {Object} order - 订单信息
   * @param {string} docType - 单据类型
   * @param {Array} templates - 可用模板列表
   * @returns {Object} 匹配结果 { template, reason, alternatives }
   */
  static match(order, docType, templates) {
    // 筛选出该单据类型的模板
    const candidates = templates.filter(t => t.type === docType);
    
    if (candidates.length === 0) {
      return { template: null, reason: '无可用模板', alternatives: [] };
    }
    
    // 提取订单信息
    const customerId = order.customerId || order.customer_id;
    const customerName = order.customerName || order.customer_name || '';
    const productType = this.detectProductType(order);
    
    // 计算每个模板的匹配得分
    const scored = candidates.map(template => {
      const { score, reasons } = this.calculateScore(
        template, 
        customerId, 
        customerName, 
        productType
      );
      return { template, score, reasons };
    });
    
    // 按得分排序
    scored.sort((a, b) => b.score - a.score);
    
    // 返回最佳匹配和备选
    const best = scored[0];
    const alternatives = scored.slice(1, 4).map(s => s.template);
    
    return {
      template: best.template,
      reason: best.reasons.join('; ') || '默认模板',
      alternatives
    };
  }
  
  /**
   * 计算匹配得分
   */
  static calculateScore(template, customerId, customerName, productType) {
    const rules = template.applicability || {};
    let score = rules.priority || 0;
    const reasons = [];
    
    // 客户ID匹配 +100分
    if (customerId && rules.customerIds?.includes(customerId)) {
      score += 100;
      reasons.push('客户ID匹配');
    }
    
    // 客户名称匹配 +80分（支持模糊匹配）
    if (customerName && rules.customerNames?.length > 0) {
      const matched = rules.customerNames.some(name => 
        customerName.toUpperCase().includes(name.toUpperCase()) ||
        name.toUpperCase().includes(customerName.toUpperCase())
      );
      if (matched) {
        score += 80;
        reasons.push('客户名称匹配');
      }
    }
    
    // 品类匹配 +50分
    if (productType && rules.productTypes?.length > 0) {
      if (rules.productTypes.includes(productType) || 
          rules.productTypes.includes(String(productType))) {
        score += 50;
        reasons.push(`品类匹配(${productType}类品)`);
      }
    }
    
    // 默认模板 +10分
    if (rules.isDefault) {
      score += 10;
      if (reasons.length === 0) {
        reasons.push('默认模板');
      }
    }
    
    return { score, reasons };
  }
  
  /**
   * 检测订单的产品品类
   * 根据订单产品信息判断品类
   */
  static detectProductType(order) {
    // 方式1: 直接从订单获取品类
    if (order.productType) return order.productType;
    if (order.product_type) return order.product_type;
    if (order.category) return order.category;
    
    // 方式2: 从产品列表推断
    const items = order.items || order.products || [];
    if (items.length === 0) return null;
    
    // 检查第一个产品的品类
    const firstItem = items[0];
    if (firstItem.productType) return firstItem.productType;
    if (firstItem.category) return firstItem.category;
    if (firstItem.productCategory) return firstItem.productCategory;
    
    // 方式3: 根据产品型号推断（可自定义规则）
    const model = firstItem.model || firstItem.productModel || '';
    if (model.startsWith('A-') || model.includes('TYPE-A') || model.includes('A类')) return 'A';
    if (model.startsWith('B-') || model.includes('TYPE-B') || model.includes('B类')) return 'B';
    if (model.startsWith('C-') || model.includes('TYPE-C') || model.includes('C类')) return 'C';
    
    return null;
  }
}

