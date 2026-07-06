/**
 * 数据绑定引擎
 * 负责将订单数据、客户数据、公司数据绑定到模板变量
 * 支持动态计算逻辑和可配置的计算规则
 */

import { CalculationFunctions } from './calculation-functions.js';
import { logger } from './logger.js';

export class DataBinder {
  /**
   * 绑定数据到模板
   * @param {string} template - 模板HTML字符串
   * @param {Object} data - 数据对象 { order, customer, company, docType?, calc? }
   * @param {Object} templateCalculations - 模板配置的计算结果（可选）
   * @returns {string} 绑定后的HTML字符串
   */
  static bind(template, data, templateCalculations = {}) {
    let html = template;

    // 1. 替换订单变量
    html = this.replaceOrderVariables(html, data.order, data.docType);

    // 2. 替换客户变量
    html = this.replaceCustomerVariables(html, data.customer);

    // 3. 替换公司变量
    html = this.replaceCompanyVariables(html, data.company);

    // 4. 替换计算变量
    html = this.replaceCalculatedVariables(html, data.order);

    // 5. 处理循环（产品列表），传递模板计算结果
    html = this.processLoops(html, data.order, templateCalculations);

    // 6. 最终验证和修复tfoot（确保tfoot存在且变量已替换）
    html = this.validateAndFixTfoot(html, data.order);

    return html;
  }

  /**
   * 验证和修复tfoot（仅替换变量，不修改模板结构）
   * 
   * 注意：此函数只替换已存在的 tfoot 中的变量，不会自动添加 tfoot
   * 这确保了预览内容和模板内容完全一致
   * 
   * @param {string} html - HTML字符串
   * @param {Object} order - 订单对象
   * @returns {string} 修复后的HTML
   */
  static validateAndFixTfoot(html, order) {
    if (!order || !order.items || order.items.length === 0) {
      return html;
    }

    // 只处理已存在的 tfoot，不自动添加
    // 变量替换已经在 replaceCalculatedVariables 和 processLoops 中完成
    // 这里只做最后的检查和日志记录
    
    const tfootMatches = html.match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/gi);
    if (!tfootMatches) {
      // 模板没有 tfoot，保持原样，不添加
      logger.debug('模板中没有 tfoot，保持原样');
      return html;
    }

    // 检查 tfoot 中是否还有未替换的变量（仅用于日志记录）
    tfootMatches.forEach((tfootMatch, index) => {
      if (tfootMatch.includes('{{')) {
        const unreplacedVars = tfootMatch.match(/\{\{[^}]+\}\}/g);
        logger.warn(`tfoot[${index}] 中仍有未替换的变量（变量替换应在 replaceCalculatedVariables 中完成）`, unreplacedVars);
        } else {
        logger.debug(`tfoot[${index}] 变量已正确替换`);
      }
    });

    return html;
  }

  /**
   * 替换订单变量
   * @param {string} html - HTML字符串
   * @param {Object} order - 订单对象
   * @param {string} docType - 单据类型（可选）
   * @returns {string}
   */
  static replaceOrderVariables(html, order, docType = null) {
    if (!order) return html;

    // 特殊规则：仅对 INVOICE 和 PACKING LIST，当客户为 SHIOYA CO.,LTD 时，CONTRACT No 仅显示订单号
    let contractNo = order.contractNo || '';
    const customerName = order.customerName || '';
    const orderNo = (order.extras && order.extras.orderNo) ? String(order.extras.orderNo) : (order.orderNo || '');
    
    // 只在 INVOICE 和 PACKING LIST 中应用特殊规则
    if ((docType === 'invoice' || docType === 'packing') && customerName === 'SHIOYA CO.,LTD' && contractNo && orderNo) {
      // 检查合同号格式是否为 SC2025-228(NO.25684) 或类似格式
      const contractNoMatch = contractNo.match(/SC\d{4}-\d+\(NO\.\s*(\d+)\s*\)/i);
      if (contractNoMatch) {
        const contractOrderNo = contractNoMatch[1];
        // 如果合同号中的订单号与订单号字段匹配，则只显示订单号
        if (contractOrderNo === orderNo) {
          contractNo = orderNo;
        }
      }
    }

    const orderFields = {
      contractNo: contractNo,
      invoiceNo: order.invoiceNo || '',
      blNo: order.blNo || '',
      invoiceDate: order.invoiceDate || '',
      shipmentDate: order.shipmentDate || '',
      shipFrom: order.shipFrom || '',
      shipTo: order.shipTo || '',
      shippedPerSs: order.shippedPerSs || '',
      forwarder: order.forwarder || '',
      customerName: order.customerName || '',
      totalUSD: this.formatNumber(order.totalUSD || 0),
      status: order.status || ''
    };

    // 替换 {{order.xxx}} 格式的变量
    html = html.replace(/\{\{order\.(\w+)\}\}/g, (match, field) => {
      return orderFields[field] !== undefined ? String(orderFields[field]) : '';
    });

    // 替换 {{order.extras.xxx}} 格式的嵌套变量
    // 支持常见的 extras 字段
    if (order.extras) {
      const extrasFields = {
        signAt: order.extras.signAt || order.signAt || order.shipFrom || '',
        orderNo: order.extras.orderNo || order.orderNo || '',
        terms: order.extras.terms || order.extras.priceTerms || order.extras.incoterms || '',
        payment: order.extras.payment || order.extras.paymentTerms || '',
        insurance: order.extras.insurance || '',
        remarks: order.extras.remarks || '',
        boxType: order.extras.boxType || '',
        tradeTerm: order.extras.tradeTerm || order.tradeTerm || '',
        currency: order.extras.currency || order.extras.unitPriceCurrency || 'USD'
      };

      html = html.replace(/\{\{order\.extras\.(\w+)\}\}/g, (match, field) => {
        return extrasFields[field] !== undefined ? String(extrasFields[field]) : '';
      });
    }

    return html;
  }

  /**
   * 替换客户变量
   * @param {string} html - HTML字符串
   * @param {Object} customer - 客户对象
   * @returns {string}
   */
  static replaceCustomerVariables(html, customer) {
    if (!customer) return html;

    const customerFields = {
      name: customer.name || '',
      address: customer.address || '',
      tel: customer.tel || '',
      fax: customer.fax || '',
      contact: customer.contact || ''
    };

    // 替换 {{customer.xxx}} 格式的变量
    html = html.replace(/\{\{customer\.(\w+)\}\}/g, (match, field) => {
      return customerFields[field] !== undefined ? String(customerFields[field]) : '';
    });

    return html;
  }

  /**
   * 替换公司变量
   * @param {string} html - HTML字符串
   * @param {Object} company - 公司对象
   * @returns {string}
   */
  static replaceCompanyVariables(html, company) {
    if (!company) return html;

    // 统一使用API字段格式，不再支持旧格式映射
    const companyFields = {
      companyNameCN: company.companyNameCN || '',
      companyNameEN: company.companyNameEN || '',
      companyAddressCN: company.companyAddressCN || '',
      companyAddressEN: company.companyAddressEN || '',
      companyTel: company.companyTel || '',
      companyFax: company.companyFax || ''
    };

    // 替换 {{company.xxx}} 格式的变量（仅支持API字段格式）
    html = html.replace(/\{\{company\.(\w+)\}\}/g, (match, field) => {
      return companyFields[field] !== undefined ? String(companyFields[field]) : '';
    });

    return html;
  }

  /**
   * 替换计算变量
   * @param {string} html - HTML字符串
   * @param {Object} order - 订单对象
   * @returns {string}
   */
  static replaceCalculatedVariables(html, order) {
    if (!order) return html;

    // 构建总值栏显示内容：Trade Term + 目的港城市（无论是否有items都需要处理）
    // 尝试从多个位置获取tradeTerm：order.extras.tradeTerm 或 order.tradeTerm
    const tradeTerm = (order.extras && order.extras.tradeTerm) 
      ? String(order.extras.tradeTerm).trim() 
      : (order.tradeTerm ? String(order.tradeTerm).trim() : '');
    const shipTo = order.shipTo || '';
    // 从目的港中提取城市名（取逗号前的部分，如果没有逗号则使用整个字符串）
    const destinationCity = shipTo ? (shipTo.includes(',') ? shipTo.split(',')[0].trim() : shipTo.trim()) : '';
    // 组合显示：Trade Term + 城市名，如果Trade Term存在则显示"Trade Term 城市名"，否则只显示城市名
    const amountHeaderText = tradeTerm && destinationCity 
      ? `${tradeTerm} ${destinationCity}` 
      : (tradeTerm || destinationCity || '');
    
    // 调试日志
    logger.debug('amountHeaderText 计算', {
      orderExtras: order.extras,
      orderTradeTerm: order.tradeTerm,
      tradeTerm,
      shipTo,
      destinationCity,
      amountHeaderText
    });
    
    html = html.replace(/\{\{amountHeaderText\}\}/g, amountHeaderText);

    // 如果订单没有items，只处理amountHeaderText后返回
    if (!order.items) return html;

    const totalQuantity = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalPackages = (order.items || []).reduce((sum, item) => sum + (item.packages || 0), 0);
    const totalPieces = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const totalWeight = (order.items || []).reduce((sum, item) => sum + (item.weight || 0), 0);
    // 计算总金额：优先使用order.totalUSD，如果不存在则计算items的总金额
    const totalAmount = order.totalUSD || (order.items || []).reduce((sum, item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || item.price || 0);
      return sum + (quantity * unitPrice);
    }, 0);
    
    // 计算包装单位显示（用于统计行）
    let packageUnitDisplay = 'PACKAGES';
    const units = (order.items || []).map(it => it.unit || '').filter(unit => unit);
    const uniqueUnits = [...new Set(units)];
    if (uniqueUnits.length === 1 && uniqueUnits[0]) {
      const unit = uniqueUnits[0];
      if (unit === '托盘') {
        packageUnitDisplay = this.getPluralUnit(totalPackages, 'PALLET');
      } else if (unit === '捆包') {
        packageUnitDisplay = this.getPluralUnit(totalPackages, 'SACK');
      } else if (unit === '件') {
        packageUnitDisplay = this.getPluralUnit(totalPackages, 'BALE');
      }
    }

    html = html.replace(/\{\{totalQuantity\}\}/g, String(totalQuantity));
    html = html.replace(/\{\{totalPackages\}\}/g, String(totalPackages));
    html = html.replace(/\{\{totalPieces\}\}/g, String(totalPieces));
    html = html.replace(/\{\{totalWeight\}\}/g, String(totalWeight));
    html = html.replace(/\{\{packageUnitDisplay\}\}/g, packageUnitDisplay);
    html = html.replace(/\{\{totalAmount\}\}/g, this.formatNumber(totalAmount));
    html = html.replace(/\{\{totalAmountUSD\}\}/g, `USD${this.formatNumber(totalAmount)}`);
    // 支持 calc.totalAmount 格式（兼容旧模板）
    html = html.replace(/\{\{calc\.totalAmount\}\}/g, this.formatNumber(totalAmount));

    return html;
  }

  /**
   * 获取单位复数形式
   * @param {number} count - 数量
   * @param {string} singular - 单数形式
   * @returns {string}
   */
  static getPluralUnit(count, singular) {
    return count === 1 ? singular : (singular + 'S');
  }

  /**
   * 获取包装单位显示文本
   * 使用计算函数库中的函数
   * @param {Object} item - 产品项
   * @returns {string}
   */
  static getPackageUnitDisplay(item) {
    return CalculationFunctions.executeFunction('getPackageUnitDisplay', item) || 'PACKAGES';
  }

  /**
   * 计算单个产品的净重和毛重（用于装箱单）
   * 使用计算函数库中的函数
   * @param {Object} item - 产品项
   * @param {Object} order - 订单对象（可选，用于获取产品类型）
   * @returns {Object} { netWeight, grossWeight, netWeightDisplay, grossWeightDisplay }
   */
  static calculateItemWeights(item, order) {
    return CalculationFunctions.executeFunction('calculateItemWeights', item, order) || {
      netWeight: null,
      grossWeight: null,
      netWeightDisplay: '',
      grossWeightDisplay: ''
    };
  }

  /**
   * 处理循环（产品列表）
   * @param {string} html - HTML字符串
   * @param {Object} order - 订单对象
   * @param {Object} templateCalculations - 模板配置的计算结果（可选）
   * @returns {string}
   * 
   * 优化方案：严格按照模板结构处理循环，只替换变量，不改变任何HTML结构
   * 确保预览内容与模板完全一致
   * 支持动态字段和可配置的计算逻辑
   * 
        * 循环格式：统一使用 {{#each order.items}}...{{/each}}
   * - 明确数据源，与数据结构 { order, customer, company } 一致
   * - 与后端服务格式保持一致
   */
  static processLoops(html, order, templateCalculations = {}) {
    logger.time('processLoops');
    logger.debug('processLoops 开始处理', {
      htmlLength: html.length,
      itemsCount: order?.items?.length || 0
    });
    
    if (!order || !order.items || order.items.length === 0) {
      logger.warn('订单没有产品项，移除循环内容');
      // 如果没有产品，移除循环内容（支持新旧两种格式，统一处理）
      // 先转换旧格式
      html = html.replace(/\{\{#each\s+items\s*\}\}/g, '{{#each order.items}}');
      // 然后移除循环内容
      html = html.replace(/\{\{#each\s+order\.items\s*\}\}([\s\S]*?)\{\{\s*\/each\s*\}\}/g, '');
      logger.timeEnd('processLoops');
      return html;
    }

    logger.debug('产品数量', order.items.length);
    
    // 计算总件数和总数量
    const totalPackages = order.items.reduce((sum, item) => sum + Number(item.packages || 0), 0);
    const totalPieces = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    
    // 计算总净重和总毛重（用于装箱单）
    let totalNetWeight = 0;
    let totalGrossWeight = 0;
    order.items.forEach(item => {
      const weights = this.calculateItemWeights(item, order);
      if (weights.netWeight !== null) {
        totalNetWeight += weights.netWeight;
      }
      if (weights.grossWeight !== null) {
        totalGrossWeight += weights.grossWeight;
      }
    });
    
    // 检查所有产品的件数单位是否一致
    const units = order.items.map(it => it.unit || '').filter(unit => unit);
    const uniqueUnits = [...new Set(units)];
    let packageUnitDisplay = 'PACKAGES';
    
    // 如果所有产品的件数单位相同，则使用对应的英文单位
    if (uniqueUnits.length === 1 && uniqueUnits[0]) {
      const unit = uniqueUnits[0];
      if (unit === '托盘') {
        packageUnitDisplay = this.getPluralUnit(totalPackages, 'PALLET');
      } else if (unit === '捆包') {
        packageUnitDisplay = this.getPluralUnit(totalPackages, 'SACK');
      } else if (unit === '件') {
        packageUnitDisplay = this.getPluralUnit(totalPackages, 'BALE');
      }
    }

    // 替换总件数行变量
    const pkgLine = `${totalPackages || 0}${packageUnitDisplay}----------${totalPieces || 0}PCS`;
    html = html.replace(/\{\{pkgLine\}\}/g, pkgLine);
    html = html.replace(/\{\{totalPackages\}\}/g, String(totalPackages));
    html = html.replace(/\{\{totalPieces\}\}/g, String(totalPieces));
    html = html.replace(/\{\{packageUnitDisplay\}\}/g, packageUnitDisplay);
    html = html.replace(/\{\{totalNetWeight\}\}/g, totalNetWeight > 0 ? `${totalNetWeight} KGS` : '');
    html = html.replace(/\{\{totalGrossWeight\}\}/g, totalGrossWeight > 0 ? `${totalGrossWeight} KGS` : '');
    
    // 计算总金额（用于统计行）
    const totalAmount = order.items.reduce((sum, item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || item.price || 0);
      return sum + (quantity * unitPrice);
    }, 0);
    
    // 替换总金额变量（如果模板中直接使用）
    html = html.replace(/\{\{totalAmount\}\}/g, this.formatNumber(totalAmount));
    html = html.replace(/\{\{totalAmountUSD\}\}/g, `USD${this.formatNumber(totalAmount)}`);
    // 支持 calc.totalAmount 格式（兼容旧模板）
    html = html.replace(/\{\{calc\.totalAmount\}\}/g, this.formatNumber(totalAmount));

    // 优化方案：使用简单的正则表达式直接处理循环
    // 严格按照模板结构，只替换变量，不改变任何HTML结构
    // 统一使用 {{#each order.items}} 格式（明确数据源，与数据结构一致）
    // 支持 {{/each}} 和 {{ /each }} 两种结束标记
    
    // 检查模板中实际使用的循环格式
    const hasOrderItemsLoop = html.includes('{{#each order.items');
    const hasItemsLoop = html.includes('{{#each items');
    
    logger.debug('使用优化的循环处理方案', {
      hasLoopMarkers: html.includes('{{#each'),
      hasEndMarkers: html.includes('{{/each}}'),
      hasOrderItemsLoop,
      hasItemsLoop,
      htmlPreview: html.substring(0, 500)
    });
    
    // 检查是否包含循环标记
    if (!html.includes('{{#each')) {
      logger.warn('模板中没有找到循环标记 {{#each');
      logger.timeEnd('processLoops');
      return html;
    }
    
    // 如果模板使用的是旧格式 {{#each items}}，先转换为新格式
    // 这样可以统一处理，避免格式不一致的问题
    if (hasItemsLoop && !hasOrderItemsLoop) {
      logger.warn('检测到旧格式 {{#each items}}，自动转换为 {{#each order.items}}');
      html = html.replace(/\{\{#each\s+items\s*\}\}/g, '{{#each order.items}}');
    }
    
    // 统一使用 {{#each order.items}} 格式的正则表达式
    // 使用更智能的匹配方式：找到 {{#each order.items}} 后，匹配到对应的 {{/each}}
    // 注意：需要处理可能的嵌套情况，但通常不会有嵌套的 order.items 循环
    
    // 先查找所有循环开始标记的位置
    const loopStartPattern = /\{\{#each\s+order\.items\s*\}\}/g;
    const loopStarts = [];
    let startMatch;
    while ((startMatch = loopStartPattern.exec(html)) !== null) {
      loopStarts.push(startMatch.index);
    }
    
    if (loopStarts.length === 0) {
      logger.warn('未找到 {{#each order.items}} 循环标记');
      logger.timeEnd('processLoops');
      return html;
    }
    
    // 查找所有结束标记的位置
    const loopEndPattern = /\{\{\s*\/each\s*\}\}/g;
    const loopEnds = [];
    let endMatch;
    while ((endMatch = loopEndPattern.exec(html)) !== null) {
      loopEnds.push(endMatch.index);
    }
    
    logger.debug('循环标记位置分析', {
      loopStarts: loopStarts.length,
      loopEnds: loopEnds.length,
      startPositions: loopStarts,
      endPositions: loopEnds,
      // 显示每个结束标记周围的内容，帮助判断是否正确
      endMarkersContext: loopEnds.map((endIndex, idx) => {
        const contextStart = Math.max(0, endIndex - 100);
        const contextEnd = Math.min(html.length, endIndex + 20);
        return {
          index: endIndex,
          position: idx + 1,
          context: html.substring(contextStart, contextEnd),
          marker: html.substring(endIndex, endIndex + 10)
        };
      })
    });
    
    // 从后往前处理，避免位置偏移问题
    let matchCount = 0;
    for (let i = loopStarts.length - 1; i >= 0; i--) {
      const startIndex = loopStarts[i];
      
      // 找到对应的结束标记（应该是最近的，且在开始标记之后）
      const possibleEnds = loopEnds.filter(endIndex => endIndex > startIndex);
      if (possibleEnds.length === 0) {
        logger.warn(`循环 #${i + 1} 未找到对应的结束标记`);
        continue;
      }
      
      // 找到最近的结束标记
      let correspondingEnd = Math.min(...possibleEnds);
      
      // 提取循环开始标记
      const loopStartTag = html.substring(startIndex).match(/^\{\{#each\s+order\.items\s*\}\}/)[0];
      const startContentIndex = startIndex + loopStartTag.length;
      
      // 检查循环内容：如果内容太短（小于50个字符），可能是匹配到了错误的结束标记
      // 尝试找到包含 <tr> 或 <td> 的结束标记
      const initialContent = html.substring(startContentIndex, correspondingEnd);
      
      // 如果初始内容太短且不包含 <tr>，尝试找下一个结束标记
      if (initialContent.length < 50 && !initialContent.includes('<tr') && possibleEnds.length > 1) {
        logger.warn(`循环 #${i + 1} 初始匹配的内容太短且不包含 <tr>，尝试找下一个结束标记`, {
          initialContentLength: initialContent.length,
          initialContent: initialContent,
          possibleEndsCount: possibleEnds.length
        });
        
        // 按距离排序，找到第一个包含 <tr> 的结束标记
        const sortedEnds = possibleEnds.sort((a, b) => a - b);
        for (const endIdx of sortedEnds) {
          const testContent = html.substring(startContentIndex, endIdx);
          if (testContent.includes('<tr') || testContent.length > 100) {
            correspondingEnd = endIdx;
            logger.debug(`找到更合适的结束标记`, {
              newEndIndex: correspondingEnd,
              contentLength: testContent.length,
              hasTr: testContent.includes('<tr')
            });
            break;
          }
        }
      }
      
      // 提取循环内容
      const loopContent = html.substring(startContentIndex, correspondingEnd);
      
      // 显示实际的HTML片段，帮助调试
      const contextBefore = html.substring(Math.max(0, startIndex - 50), startIndex);
      const contextAfter = html.substring(correspondingEnd, Math.min(html.length, correspondingEnd + 50));
      const actualMatch = html.substring(startIndex, correspondingEnd + html.substring(correspondingEnd).match(/^\{\{\s*\/each\s*\}\}/)?.[0]?.length || 0);
      
      matchCount++;
      logger.debug(`找到循环 #${matchCount}`, {
        startIndex,
        endIndex: correspondingEnd,
        startTag: loopStartTag,
        contentLength: loopContent.length,
        preview: loopContent.substring(0, 200),
        fullContent: loopContent, // 显示完整内容以便调试
        actualMatch: actualMatch, // 显示实际匹配到的完整片段
        contextBefore: contextBefore, // 显示循环开始标记前的内容
        contextAfter: contextAfter, // 显示循环结束标记后的内容
        itemsCount: order.items.length,
        hasNewlines: loopContent.includes('\n'),
        hasVariables: /\{\{[^}]+\}\}/.test(loopContent),
        hasTrTags: loopContent.includes('<tr'),
        hasTdTags: loopContent.includes('<td')
      });
      
      // 检查循环内容是否包含变量
      const hasVariables = /\{\{[^}]+\}\}/.test(loopContent);
      const allVariables = loopContent.match(/\{\{[^}]+\}\}/g) || [];
      logger.debug(`循环内容包含变量: ${hasVariables}`, {
        variableCount: allVariables.length,
        sampleVariables: allVariables.slice(0, 10),
        uniqueVariables: [...new Set(allVariables)].slice(0, 10)
      });
      
      // 为每个item处理循环内容
      const processedRows = order.items.map((item, index) => {
        // 完全复制模板内容，不改变任何结构
                    let itemHtml = loopContent;
                    
        logger.debug(`处理产品项 #${index + 1}`, {
          model: item.model,
          quantity: item.quantity,
          packages: item.packages,
          unitPrice: item.unitPrice
        });
                    
        // === 1. 默认计算变量（始终计算，所有模板可用）===
                    const packageUnit = this.getPackageUnitDisplay(item);
                    const packages = Number(item.packages || 0);
                    const quantity = Number(item.quantity || 0);
                    const qtyStr = `${quantity || 0}PCS`;
                    const desc = item.model || '';
                    const price = Number(item.unitPrice || item.price || 0);
        const amount = CalculationFunctions.executeFunction('calculateItemAmount', item) || (quantity * price);
        
        // 计算净重和毛重（用于装箱单）
        const weights = this.calculateItemWeights(item, order);
        
        // 计算packingText（用于销售确认书）- 基于docs.js的tplSales实现
        let packingText = '';
        const packValRaw = (function(){
          // 如果 packing 是字符串格式（如 "220条/捆包"），尝试提取数字
          if (item && item.packing != null && item.packing !== '') {
            const packingStr = String(item.packing);
            // 尝试匹配 "数字条/单位" 格式，提取数字部分
            const match = packingStr.match(/^(\d+(?:\.\d+)?)/);
            if (match) {
              const num = Number(match[1]);
              if (Number.isFinite(num) && num > 0) {
                return num;
              }
            }
            // 如果匹配失败，尝试直接转换为数字
            const num = Number(packingStr);
            if (Number.isFinite(num) && num > 0) {
              return num;
            }
          }
          // 如果 packing 不可用，从 quantity 和 packages 计算
          const q = Number((item && item.quantity) || 0);
          const p = Number((item && item.packages) || 0);
          if (Number.isFinite(q) && Number.isFinite(p) && p > 0) {
            return Math.round((q/p) * 100) / 100;
          }
          return NaN;
        })();
        if (Number.isFinite(packValRaw) && packValRaw > 0) {
          // 去除无意义的尾部零，例如 160.00 -> 160，160.50 -> 160.5
          const packNumStr = String(packValRaw.toFixed(2)).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
          const getPluralUnit = (val, singular) => {
            if (val > 1) {
              return singular === 'PALLET' ? 'PALLETS' : 
                     singular === 'SACK' ? 'SACKS' : 
                     singular === 'BALE' ? 'BALES' : singular;
            }
            return singular;
          };
          const unitEng = (item && item.unit === '托盘') ? getPluralUnit(packValRaw, 'PALLET') : ((item && item.unit === '捆包') ? getPluralUnit(packValRaw, 'SACK') : ((item && item.unit === '件') ? getPluralUnit(packValRaw, 'BALE') : ''));
          const packText = unitEng ? `${packNumStr}PCS/${unitEng}` : `${packNumStr}PCS`;
          // 如果订单使用B类品且有标签批号，使用flex布局让批号右对齐
          const orderProductType = (order.productType ?? order.product_type) || 1;
          if (orderProductType === 2 && item.labelBatchNo) {
            packingText = `<div style="display: flex; justify-content: space-between; align-items: center;"><span>${packText}</span><span style="font-weight: 600;">SC:${item.labelBatchNo}</span></div>`;
          } else {
            packingText = packText;
          }
        }
        
        // 计算extrasText（用于销售确认书）- 基于docs.js的renderItemExtrasInline实现
        let extrasText = '';
        const normalizeExtrasObj = (raw) => {
          if (!raw) return {};
          if (typeof raw === 'string') { try { return JSON.parse(raw); } catch(_) { return {}; } }
          if (typeof raw === 'object') return raw;
          return {};
        };
        const renderItemExtrasInline = (it) => {
          // 仅显示白名单中的规格信息，避免技术字段（如 sortIndex）泄露到预览
          const ex = normalizeExtrasObj(it && it.extras);
          const allowed = { size: '尺寸', color: '颜色', spec: '规格', remark: '备注' };
          const parts = [];
          Object.keys(allowed).forEach((key) => {
            const val = ex[key];
            if (val != null && String(val).trim() !== '') parts.push(`${allowed[key]}: ${val}`);
          });
          if (!parts.length) return '';
          return parts.join('；');
        };
        extrasText = renderItemExtrasInline(item);
        
        // === 2. 动态字段（自动提取item中的所有字段）===
        const dynamicFields = this.extractDynamicFields(item);
        
        // === 3. 扩展计算变量（从模板配置的计算结果中获取）===
        const extendedFields = this.getExtendedItemFields(item, index, templateCalculations);
        
        // === 4. 准备所有变量值 ===
            const itemFields = {
          // 基础索引字段
              '@index': index + 1,
              '@index+1': index + 1,
          
          // 基础产品字段
            model: item.model || '',
            quantity: quantity,
            quantityStr: qtyStr,
            packages: packages,
            packageUnit: packageUnit,
            packagesLine: `${packages}${packageUnit} ----------${qtyStr}`,
            descriptionLine: `${index + 1})${desc}<br/>${packages}${packageUnit} ----------${qtyStr}`,
          
          // 默认计算变量（始终可用）
            weight: item.weight || 0,
            actualWeight: item.actualWeight || 0,
          netWeight: weights.netWeightDisplay,
          grossWeight: weights.grossWeightDisplay,
            unitPrice: this.formatNumber(price),
            unitPriceUSD: `USD${this.formatNumber(price)}`,
          price: this.formatNumber(price),
            amount: this.formatNumber(amount),
            amountUSD: `USD${this.formatNumber(amount)}`,
          
          // 其他常用字段
            unit: item.unit || '',
            packing: item.packing || '',
            labelWeight: item.labelWeight || 0,
            safetyFactor: item.safetyFactor || '',
          cleanliness: item.cleanliness || '',
          
          // 销售确认书专用字段
          packingText: packingText,
          extrasText: extrasText,
          
          // 动态字段（自动提取item中的所有字段）
          ...dynamicFields,
          
          // 扩展计算字段（从模板配置中获取）
          ...extendedFields
        };

              // 按特定顺序替换变量，确保特殊字符（如@index+1）先被替换
        // 注意：@index+1 必须最先替换，因为 + 号是正则特殊字符
          const replacementOrder = [
          '@index+1',  // 必须先替换，因为它包含特殊字符 +
            '@index',
            'model',
            'quantity',
            'packages',
            'packageUnit',
          'netWeight',
          'grossWeight',
            'unitPrice',
            'amount',
            'quantityStr',
            'packagesLine',
            'descriptionLine',
            'unitPriceUSD',
            'amountUSD',
            'price',
            'weight',
            'actualWeight',
            'unit',
            'packing',
            'labelWeight',
            'safetyFactor',
            'cleanliness',
            'packingText',
            'extrasText'
          ];
          
          // 记录替换前的状态
          const beforeReplace = itemHtml;
          const originalVars = beforeReplace.match(/\{\{[^}]+\}\}/g) || [];

        // 替换变量，保持模板结构完全不变
          replacementOrder.forEach(key => {
            if (itemFields.hasOwnProperty(key)) {
              const value = itemFields[key] !== undefined ? String(itemFields[key]) : '';
              // 转义特殊字符，确保正则表达式正确匹配
              // 特别注意：+ 号需要转义为 \+
              const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
              const beforeReplace = itemHtml;
              
              // 检查是否包含该变量
              if (itemHtml.includes(`{{${key}}}`)) {
                itemHtml = itemHtml.replace(regex, value);
                
                // 验证替换是否成功
                if (itemHtml === beforeReplace) {
                  // 替换失败，尝试更宽松的匹配
                  logger.warn(`变量替换失败，尝试更宽松的匹配: {{${key}}}`, {
                    key,
                    escapedKey,
                    regex: regex.toString(),
                    value,
                    testMatch: regex.test(`{{${key}}}`)
                  });
                  
                  // 使用更宽松的正则表达式（允许变量前后有空格）
                  const looseRegex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
                  itemHtml = itemHtml.replace(looseRegex, value);
                }
              }
            }
          });

          // 替换剩余的变量（以防有遗漏）
          Object.keys(itemFields).forEach(key => {
            if (!replacementOrder.includes(key)) {
              const value = itemFields[key] !== undefined ? String(itemFields[key]) : '';
              const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              itemHtml = itemHtml.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), value);
            }
          });
          
          // 检查是否还有未替换的变量
          const remainingVars = itemHtml.match(/\{\{[^}]+\}\}/g);
          if (remainingVars && remainingVars.length > 0) {
            logger.warn(`产品项 #${index + 1} 仍有未替换的变量:`, {
              variables: remainingVars,
              itemHtml: itemHtml.substring(0, 300),
              originalVars: originalVars
            });
            
            // 尝试强制替换剩余的变量（使用更宽松的匹配）
            remainingVars.forEach(varMatch => {
              // 提取变量名（去掉 {{ 和 }}）
              const varName = varMatch.replace(/\{\{|\}\}/g, '').trim();
              
              // 尝试从 itemFields 中查找匹配的字段
              // 支持精确匹配和部分匹配
              let matched = false;
              
              // 首先尝试精确匹配
              if (itemFields.hasOwnProperty(varName)) {
                const value = String(itemFields[varName] || '');
                const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const looseRegex = new RegExp(`\\{\\{${escapedVarName}\\}\\}`, 'g');
                itemHtml = itemHtml.replace(looseRegex, value);
                matched = true;
                logger.debug(`强制替换变量（精确匹配）: {{${varName}}} = ${value}`);
              } else {
                // 尝试部分匹配（如 @index+1 匹配 @index+1）
                for (const fieldKey in itemFields) {
                  if (varName === fieldKey || varName.includes(fieldKey) || fieldKey.includes(varName)) {
                    const value = String(itemFields[fieldKey] || '');
                    // 使用更宽松的匹配，支持变量名中的特殊字符
                    const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const looseRegex = new RegExp(`\\{\\{${escapedVarName}\\}\\}`, 'g');
                    itemHtml = itemHtml.replace(looseRegex, value);
                    matched = true;
                    logger.debug(`强制替换变量（部分匹配）: {{${varName}}} = ${value} (使用字段: ${fieldKey})`);
                    break;
                  }
                }
              }
              
              if (!matched) {
                logger.warn(`无法找到变量 {{${varName}}} 的对应值`, {
                  availableFields: Object.keys(itemFields).slice(0, 10)
                });
              }
            });
          }

          return itemHtml;
        }).join('');
      
      logger.debug('循环处理完成', {
        rowsGenerated: order.items.length,
        finalHtmlLength: processedRows.length,
        sampleOutput: processedRows.substring(0, 300)
      });
      
      // 验证处理后的结果是否还有未替换的变量
      const remainingVarsInOutput = processedRows.match(/\{\{[^}]+\}\}/g);
      if (remainingVarsInOutput && remainingVarsInOutput.length > 0) {
        logger.warn('循环处理后的结果中仍有未替换的变量:', {
          variables: remainingVarsInOutput,
          count: remainingVarsInOutput.length
        });
      }
      
      // 替换HTML中的循环内容
      const endTagLength = html.substring(correspondingEnd).match(/^\{\{\s*\/each\s*\}\}/)[0].length;
      const beforeLoop = html.substring(0, startIndex);
      const afterLoop = html.substring(correspondingEnd + endTagLength);
      html = beforeLoop + processedRows + afterLoop;
      
      logger.debug(`循环 #${matchCount} 已替换`, {
        originalLength: correspondingEnd - startContentIndex,
        newLength: processedRows.length
      });
    }
    
    // 检查是否有循环被处理
    if (matchCount === 0 && html.includes('{{#each') && html.includes('{{/each}}')) {
      // 尝试查找实际的循环格式
      const loopMatch = html.match(/\{\{#each\s+([^}]+)\}\}/);
      const actualLoopFormat = loopMatch ? loopMatch[0] : '未找到';
      
      logger.warn('未找到 {{#each order.items}} 循环标记', {
        actualLoopFormat,
        htmlPreview: html.substring(0, 1000),
        note: '请确保使用 {{#each order.items}} 格式（统一格式）'
      });
    }
    
    // 如果上面的简单方法没有匹配到，尝试更宽松的匹配
    if (matchCount === 0 && html.includes('{{#each') && html.includes('{{/each}}')) {
      logger.warn('标准匹配失败，尝试更宽松的匹配');
      
      // 尝试多种匹配模式（支持 order.items 格式，兼容旧格式 items）
      const loosePatterns = [
        /\{\{#each\s+order\.items\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,  // {{#each order.items}}...{{/each}}
        /\{\{#each\s+order\.items\s*\}\}([\s\S]*?)\{\{\s*\/each\s*\}\}/g,  // {{#each order.items}}...{{ /each }}
        // 兼容旧格式（如果还有遗留的 {{#each items}}）
        /\{\{#each\s+items\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,  // {{#each items}}...{{/each}}
        /\{\{#each\s+items\s*\}\}([\s\S]*?)\{\{\s*\/each\s*\}\}/g  // {{#each items}}...{{ /each }}
      ];
      
      for (const pattern of loosePatterns) {
        if (pattern.test(html)) {
          pattern.lastIndex = 0; // 重置正则表达式
          logger.debug('使用宽松模式找到循环');
          html = html.replace(pattern, (match, content) => {
            return order.items.map((item, index) => {
              let itemHtml = content;
              
              // 使用统一的字段准备逻辑（与上面保持一致）
              const packageUnit = this.getPackageUnitDisplay(item);
              const packages = Number(item.packages || 0);
              const quantity = Number(item.quantity || 0);
              const qtyStr = `${quantity || 0}PCS`;
              const desc = item.model || '';
              const price = Number(item.unitPrice || item.price || 0);
              const amount = CalculationFunctions.executeFunction('calculateItemAmount', item) || (quantity * price);
              
              // 计算净重和毛重
              const weights = this.calculateItemWeights(item, order);
              
              // 计算packingText和extrasText（与上面保持一致）
              let packingText = '';
              const packValRaw = (function(){
                if (item && item.packing != null && item.packing !== '') {
                  const packingStr = String(item.packing);
                  const match = packingStr.match(/^(\d+(?:\.\d+)?)/);
                  if (match) {
                    const num = Number(match[1]);
                    if (Number.isFinite(num) && num > 0) return num;
                  }
                  const num = Number(packingStr);
                  if (Number.isFinite(num) && num > 0) return num;
                }
                const q = Number((item && item.quantity) || 0);
                const p = Number((item && item.packages) || 0);
                if (Number.isFinite(q) && Number.isFinite(p) && p > 0) {
                  return Math.round((q/p) * 100) / 100;
                }
                return NaN;
              })();
              if (Number.isFinite(packValRaw) && packValRaw > 0) {
                const packNumStr = String(packValRaw.toFixed(2)).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
                const getPluralUnit = (val, singular) => {
                  if (val > 1) {
                    return singular === 'PALLET' ? 'PALLETS' : 
                           singular === 'SACK' ? 'SACKS' : 
                           singular === 'BALE' ? 'BALES' : singular;
                  }
                  return singular;
                };
                const unitEng = (item && item.unit === '托盘') ? getPluralUnit(packValRaw, 'PALLET') : ((item && item.unit === '捆包') ? getPluralUnit(packValRaw, 'SACK') : ((item && item.unit === '件') ? getPluralUnit(packValRaw, 'BALE') : ''));
                const packText = unitEng ? `${packNumStr}PCS/${unitEng}` : `${packNumStr}PCS`;
                const orderProductType = (order.productType ?? order.product_type) || 1;
                if (orderProductType === 2 && item.labelBatchNo) {
                  packingText = `<div style="display: flex; justify-content: space-between; align-items: center;"><span>${packText}</span><span style="font-weight: 600;">SC:${item.labelBatchNo}</span></div>`;
                } else {
                  packingText = packText;
                }
              }
              const normalizeExtrasObj = (raw) => {
                if (!raw) return {};
                if (typeof raw === 'string') { try { return JSON.parse(raw); } catch(_) { return {}; } }
                if (typeof raw === 'object') return raw;
                return {};
              };
              const renderItemExtrasInline = (it) => {
                const ex = normalizeExtrasObj(it && it.extras);
                const allowed = { size: '尺寸', color: '颜色', spec: '规格', remark: '备注' };
                const parts = [];
                Object.keys(allowed).forEach((key) => {
                  const val = ex[key];
                  if (val != null && String(val).trim() !== '') parts.push(`${allowed[key]}: ${val}`);
                });
                if (!parts.length) return '';
                return parts.join('；');
              };
              const extrasText = renderItemExtrasInline(item);
              
              // 动态字段和扩展字段
              const dynamicFields = this.extractDynamicFields(item);
              const extendedFields = this.getExtendedItemFields(item, index, templateCalculations);
              
              // 准备所有变量值（与上面保持一致）
              const itemFields = {
                '@index': index + 1,
                '@index+1': index + 1,
                model: item.model || '',
                quantity: quantity,
                quantityStr: qtyStr,
                packages: packages,
                packageUnit: packageUnit,
                packagesLine: `${packages}${packageUnit} ----------${qtyStr}`,
                descriptionLine: `${index + 1})${desc}<br/>${packages}${packageUnit} ----------${qtyStr}`,
                weight: item.weight || 0,
                actualWeight: item.actualWeight || 0,
                netWeight: weights.netWeightDisplay,
                grossWeight: weights.grossWeightDisplay,
                unitPrice: this.formatNumber(price),
                unitPriceUSD: `USD${this.formatNumber(price)}`,
                price: this.formatNumber(price),
                amount: this.formatNumber(amount),
                amountUSD: `USD${this.formatNumber(amount)}`,
                unit: item.unit || '',
                packing: item.packing || '',
                labelWeight: item.labelWeight || 0,
                safetyFactor: item.safetyFactor || '',
                cleanliness: item.cleanliness || '',
                packingText: packingText,
                extrasText: extrasText,
                ...dynamicFields,
                ...extendedFields
              };
              
              // 按特定顺序替换变量
              const replacementOrder = [
                '@index+1',
                '@index',
                'model',
                'quantity',
                'packages',
                'packageUnit',
                'netWeight',
                'grossWeight',
                'unitPrice',
                'amount',
                'quantityStr',
                'packagesLine',
                'descriptionLine',
                'unitPriceUSD',
                'amountUSD',
                'price',
                'weight',
                'actualWeight',
                'unit',
                'packing',
                'labelWeight',
                'safetyFactor',
                'cleanliness',
                'packingText',
                'extrasText'
              ];
              
              replacementOrder.forEach(key => {
                if (itemFields.hasOwnProperty(key)) {
                  const value = itemFields[key] !== undefined ? String(itemFields[key]) : '';
                  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  itemHtml = itemHtml.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), value);
                }
              });
              
              // 替换剩余的变量（包括动态字段和扩展字段）
              Object.keys(itemFields).forEach(key => {
                if (!replacementOrder.includes(key)) {
                  const value = itemFields[key] !== undefined ? String(itemFields[key]) : '';
                  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  itemHtml = itemHtml.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), value);
                }
              });
              
              return itemHtml;
            }).join('');
          });
          break;
        }
      }
    }
    
    logger.timeEnd('processLoops');
    logger.debug('循环处理完成', {
      finalHtmlLength: html.length
    });
    return html;
  }

  /**
   * 已处理字段列表（性能优化：避免重复处理）
   */
  static processedFields = new Set([
    'model', 'quantity', 'packages', 'unitPrice', 'price', 'amount',
    'weight', 'actualWeight', 'netWeight', 'grossWeight', 'unit',
    'packing', 'labelWeight', 'safetyFactor', 'cleanliness',
    '@index', '@index+1', 'quantityStr', 'packagesLine', 'descriptionLine',
    'packageUnit', 'unitPriceUSD', 'amountUSD'
  ]);

  /**
   * 提取动态字段（自动提取item中的所有字段）
   * 这样无论订单字段如何变化，都可以在模板中使用
   * 性能优化：使用Set快速查找已处理字段
   * @param {Object} item - 产品项
   * @returns {Object} 动态字段对象
   */
  static extractDynamicFields(item) {
    if (!item || typeof item !== 'object') {
      return {};
    }

    const dynamicFields = {};
    
    // 遍历item的所有属性
    for (const key in item) {
      // 跳过已处理的字段和特殊字段（使用Set快速查找）
      if (this.processedFields.has(key) || 
          key.startsWith('_') || 
          key.startsWith('$') ||
          Object.prototype.hasOwnProperty.call(Object.prototype, key)) {
        continue;
      }
      
      // 将字段值添加到动态字段中
      const value = item[key];
      if (value !== null && value !== undefined) {
        // 如果是数字或字符串，直接使用
        if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
          dynamicFields[key] = value;
        }
        // 如果是数组，转为字符串（保留数组结构）
        else if (Array.isArray(value)) {
          dynamicFields[key] = value.join(', ');
        }
        // 如果是对象，转为JSON字符串
        else if (typeof value === 'object') {
          try {
            dynamicFields[key] = JSON.stringify(value);
          } catch (e) {
            dynamicFields[key] = String(value);
          }
        }
        // 其他类型转为字符串
        else {
          dynamicFields[key] = String(value);
        }
      }
    }
    
    return dynamicFields;
  }
  
  /**
   * 获取扩展的item字段（从模板配置的计算中获取）
   * @param {Object} item - 产品项
   * @param {number} index - 索引
   * @param {Object} templateCalculations - 模板配置的计算结果
   * @returns {Object} 扩展字段对象
   */
  static getExtendedItemFields(item, index, templateCalculations) {
    const extendedFields = {};
    
    // 如果模板配置了针对单个item的计算，可以在这里处理
    // 例如：模板配置了 calc.itemVolume，可以通过 item.volume 访问
    // 或者通过自定义函数计算
    
    // 检查是否有map类型的计算（对每个item执行计算）
    for (const key in templateCalculations) {
      const value = templateCalculations[key];
      
      // 如果是数组（map计算的结果），取当前index的值
      if (Array.isArray(value) && value[index] !== undefined) {
        extendedFields[key] = value[index];
      }
      // 如果是对象且包含当前item的计算结果
      else if (typeof value === 'object' && value !== null && value[index] !== undefined) {
        extendedFields[key] = value[index];
      }
    }
    
    return extendedFields;
  }

  /**
   * 格式化数字（保留2位小数）
   * @param {number} num - 数字
   * @returns {string}
   */
  static formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) {
      return '0.00';
    }
    return Number(num).toFixed(2);
  }

  /**
   * 准备数据对象
   * @param {Object} order - 订单对象
   * @param {Object} customer - 客户对象
   * @param {Object} company - 公司对象
   * @returns {Object} 格式化后的数据对象
   */
  static prepareData(order, customer, company) {
    return {
      order: this.formatOrderData(order, company),
      customer: customer ? this.formatCustomerData(customer) : {},
      company: company ? this.formatCompanyData(company) : {}
    };
  }

  /**
   * 格式化订单数据
   * @param {Object} order - 订单对象
   * @returns {Object}
   */
  static formatOrderData(order, company = {}) {
    if (!order) return {};

    // 解析extras字段（可能是JSON字符串或对象）
    let extras = {};
    if (order.extras) {
      if (typeof order.extras === 'string') {
        try {
          extras = JSON.parse(order.extras);
        } catch (e) {
          logger.warn('解析extras失败', e);
        }
      } else if (typeof order.extras === 'object') {
        extras = order.extras;
      }
    }

    // SignAt 优先级：order.extras.signAt -> order.signAt -> order.shipFrom -> company.signAt
    const signAt = (extras && extras.signAt) 
      ? String(extras.signAt) 
      : (order.signAt ? String(order.signAt) : (order.shipFrom ? String(order.shipFrom) : (company.signAt || '')));

    return {
      contractNo: order.contractNo || '',
      invoiceNo: order.invoiceNo || '',
      blNo: order.blNo || '',
      invoiceDate: order.invoiceDate || '',
      shipmentDate: order.shipmentDate || '',
      shipFrom: order.shipFrom || '',
      shipTo: order.shipTo || '',
      shippedPerSs: order.shippedPerSs || '',
      forwarder: order.forwarder || '',
      customerName: order.customerName || '',
      totalUSD: order.totalUSD || 0,
      status: order.status || '',
      signAt: signAt, // 添加 signAt 字段，使用优先级逻辑
      extras: extras, // 保留extras字段，包含tradeTerm等信息
      items: (order.items || []).map(item => {
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        const amount = Number(item.amount || 0) || (quantity * unitPrice);
        return {
          model: item.model || '',
          quantity: quantity,
          packages: Number(item.packages || 0),
          weight: Number(item.weight || 0),
          actualWeight: Number(item.actualWeight || 0),
          unitPrice: unitPrice,
          amount: amount,
          unit: item.unit || '',
          packing: item.packing || '',
          labelWeight: Number(item.labelWeight || 0),
          safetyFactor: item.safetyFactor || '',
          cleanliness: item.cleanliness || ''
        };
      })
    };
  }

  /**
   * 格式化客户数据
   * @param {Object} customer - 客户对象
   * @returns {Object}
   */
  static formatCustomerData(customer) {
    if (!customer) return {};

    return {
      name: customer.name || '',
      address: customer.address || '',
      tel: customer.tel || '',
      fax: customer.fax || '',
      contact: customer.contact || ''
    };
  }

  /**
   * 格式化公司数据
   * @param {Object} company - 公司对象
   * @returns {Object}
   */
  static formatCompanyData(company) {
    if (!company) return {};

    // 统一使用API字段格式，不再支持旧格式映射
    return {
      companyNameCN: company.companyNameCN || '',
      companyNameEN: company.companyNameEN || '',
      companyAddressCN: company.companyAddressCN || '',
      companyAddressEN: company.companyAddressEN || '',
      companyTel: company.companyTel || '',
      companyFax: company.companyFax || ''
    };
  }
}

export default DataBinder;
