/**
 * 模板服务
 * 统一管理模板的加载、转换、验证和渲染
 */

import DocumentCenterService from '../../services/document-center-service.js';
import { DataBinderV2 } from './template-engine/binder/data-binder-v2.js';
// TemplateValidator 使用动态导入，避免加载时错误
import { TemplateRenderer } from './template-renderer.js';
import { TemplateConverter } from './migration/template-converter.js';
// BlockRenderer 使用动态导入，避免循环依赖和加载时错误

export class TemplateService {
  /**
   * 修复模板中的变量名（将简写形式统一为完整形式）
   * @param {string} html - HTML字符串
   * @returns {string} 修复后的HTML
   */
  static fixVariableNames(html) {
    if (!html || typeof html !== 'string') {
      return { html: html || '', hasChanges: false };
    }

    // 变量名映射表（简写形式 -> 完整形式）
    const VARIABLE_MAPPING = {
      'company.nameEN': 'company.companyNameEN',
      'company.nameCN': 'company.companyNameCN',
      'company.addressEN': 'company.companyAddressEN',
      'company.addressCN': 'company.companyAddressCN',
      'company.tel': 'company.companyTel',
      'company.fax': 'company.companyFax',
      // 修复 order.extras.signAt 为 order.signAt（因为 signAt 已添加到 order 对象）
      'order.extras.signAt': 'order.signAt',
    };

    let fixedHtml = html;
    let hasChanges = false;
    const replacements = [];

    // 替换所有简写形式的变量名
    for (const [oldVar, newVar] of Object.entries(VARIABLE_MAPPING)) {
      const regex = new RegExp(`\\{\\{${oldVar.replace(/\./g, '\\.')}\\}\\}`, 'g');
      const matches = fixedHtml.match(regex);
      if (matches && matches.length > 0) {
        fixedHtml = fixedHtml.replace(regex, `{{${newVar}}}`);
        hasChanges = true;
        replacements.push({ old: oldVar, new: newVar, count: matches.length });
      }
    }

    if (hasChanges) {
      console.log('[TemplateService] 修复变量名:', replacements);
    }

    return { html: fixedHtml, hasChanges };
  }

  /**
   * 加载模板
   * @param {string} templateId - 模板ID
   * @param {Object} options - 选项
   * @param {boolean} options.autoConvert - 是否自动转换旧格式（默认true）
   * @param {boolean} options.autoSave - 转换后是否自动保存（默认true）
   * @param {boolean} options.validate - 是否验证模板（默认true）
   * @param {boolean} options.fixVariableNames - 是否自动修复变量名（默认true）
   * @returns {Promise<Object>} 模板对象
   */
  static async loadTemplate(templateId, options = {}) {
    const {
      autoConvert = true,
      autoSave = true,
      validate = true,
      fixVariableNames = true
    } = options;

    try {
      // 1. 从服务加载模板
      const template = await DocumentCenterService.getTemplate(templateId);
      
      if (!template) {
        throw new Error('模板不存在');
      }

      // 2. 修复变量名（如果需要）
      if (fixVariableNames) {
        let html = template.html || template.config?.html || template.config?.canvas?.components || '';
        if (html) {
          const fixed = this.fixVariableNames(html);
          if (fixed.hasChanges) {
            // 更新模板对象
            if (template.html !== undefined) {
              template.html = fixed.html;
            }
            if (template.config?.html !== undefined) {
              template.config.html = fixed.html;
            }
            if (template.config?.canvas?.components) {
              template.config.canvas.components = fixed.html;
            }
            
            // 自动保存修复后的模板
            if (autoSave) {
              try {
                const templateData = {
                  name: template.name,
                  type: template.type,
                  isDefault: template.isDefault || false
                };
                
                if (template.html !== undefined) {
                  templateData.config = {
                    html: template.html,
                    styles: template.styles || template.config?.styles || '',
                    margin: template.margin || template.config?.margin || { top: 20, bottom: 20, left: 20, right: 20 },
                    calculations: template.calculations || template.config?.calculations || [],
                    conditions: template.conditions || template.config?.conditions || {}
                  };
                } else if (template.config) {
                  templateData.config = template.config;
                }
                
                await DocumentCenterService.updateTemplate(template.id, templateData);
                console.log('[TemplateService] ✅ 模板变量名已自动修复并保存到数据库');
              } catch (saveError) {
                console.warn('[TemplateService] 保存修复后的模板失败（不影响使用）:', saveError);
              }
            }
          }
        }
      }

      // 3. 转换旧格式（如果需要）
      if (autoConvert) {
        const converted = this.convertTemplateFormat(template);
        
        if (converted && autoSave) {
          try {
            await this.saveConvertedTemplate(template);
            console.log('[TemplateService] ✅ 模板格式已自动更新到数据库');
          } catch (saveError) {
            console.warn('[TemplateService] 保存转换后的模板失败（不影响使用）:', saveError);
          }
        }
      }

      // 4. 验证模板（如果需要，但不阻塞加载）
      if (validate) {
        // 异步验证，不阻塞模板加载
        this.validateTemplate(template).then(validation => {
          if (validation && !validation.valid && validation.errors && validation.errors.length > 0) {
            console.warn('[TemplateService] 模板验证失败:', validation.errors);
            // 不抛出错误，只记录警告，允许继续使用
          }
        }).catch(error => {
          console.warn('[TemplateService] 模板验证过程出错（不影响使用）:', error);
        });
      }

      return template;
    } catch (error) {
      console.error('[TemplateService] 加载模板失败:', error);
      throw error;
    }
  }

  /**
   * 转换模板格式（旧格式 -> 新格式）
   * @param {Object} template - 模板对象
   * @returns {boolean} 是否进行了转换
   */
  static convertTemplateFormat(template) {
    // 获取HTML内容
    let html = '';
    if (template.html !== undefined) {
      html = template.html || '';
    } else if (template.config?.html !== undefined) {
      html = template.config.html || '';
    } else if (template.config?.canvas?.components) {
      html = template.config.canvas.components || '';
    }

    if (!html) {
      return false;
    }

    // 检查是否需要转换
    if (!TemplateConverter.needsConversion(html)) {
      return false;
    }

    console.log('[TemplateService] 检测到旧格式模板，开始转换...');
    
    // 使用TemplateConverter转换
    const convertedHtml = TemplateConverter.convert(html);
    const report = TemplateConverter.getConversionReport(html, convertedHtml);
    
    console.log('[TemplateService] 转换报告:', report);
    
    // 更新模板对象
    if (template.html !== undefined) {
      template.html = convertedHtml;
    } else if (template.config?.html !== undefined) {
      template.config.html = convertedHtml;
    } else if (template.config?.canvas?.components) {
      template.config.canvas.components = convertedHtml;
    }
    
    console.log('[TemplateService] ✅ 模板格式已转换');
    return true;
  }

  /**
   * 保存转换后的模板
   */
  static async saveConvertedTemplate(template) {
    const templateData = {
      name: template.name,
      type: template.type,
      isDefault: template.isDefault || false
    };

    // 根据模板格式构建config
    if (template.html !== undefined) {
      templateData.config = {
        html: template.html,
        styles: template.styles || '',
        margin: template.margin || { top: 20, bottom: 20, left: 20, right: 20 },
        calculations: template.calculations || [],
        conditions: template.conditions || {}
      };
    } else if (template.config) {
      templateData.config = template.config;
    }

    await DocumentCenterService.updateTemplate(template.id, templateData);
  }

  /**
   * 验证模板
   * @param {Object} template - 模板对象
   * @returns {Promise<Object>} 验证结果
   */
  static async validateTemplate(template) {
    // 获取HTML内容
    let html = '';
    if (template.html !== undefined) {
      html = template.html || '';
    } else if (template.config?.html !== undefined) {
      html = template.config.html || '';
    } else if (template.config?.canvas?.components) {
      html = template.config.canvas.components || '';
    }

    if (!html) {
      return {
        valid: false,
        errors: [{ type: 'EMPTY_TEMPLATE', message: '模板内容为空' }],
        warnings: []
      };
    }

    try {
      // 动态导入TemplateValidator，避免加载时错误
      const { TemplateValidator } = await import('./validator/template-validator.js');
      return TemplateValidator.validate(html);
    } catch (error) {
      console.warn('[TemplateService] 加载TemplateValidator失败:', error);
      // 返回一个基本的验证结果，表示验证功能不可用
      return {
        valid: true,
        errors: [],
        warnings: [{
          type: 'VALIDATOR_UNAVAILABLE',
          message: '模板验证器不可用，跳过验证'
        }]
      };
    }
  }

  /**
   * 渲染模板
   * @param {Object} template - 模板对象
   * @param {Object} data - 数据对象 { order, customer, company }
   * @param {Object} options - 选项
   * @param {boolean} options.useNewEngine - 是否使用新引擎（默认true）
   * @returns {Promise<string>} 渲染后的HTML
   */
  static async renderTemplate(template, data, options = {}) {
    const { useNewEngine = true } = options;

    try {
      console.log('[TemplateService] 开始渲染模板:', {
        templateName: template.name,
        templateId: template.id,
        hasHtml: template.html !== undefined,
        hasConfigHtml: template.config?.html !== undefined,
        hasCanvasComponents: !!template.config?.canvas?.components,
        hasBlocks: !!(template.blocks || template.config?.blocks),
        configKeys: template.config ? Object.keys(template.config) : []
      });
      
      // 检查是否是新格式（blocks格式）
      const blocks = template.blocks || template.config?.blocks;
      if (blocks && Array.isArray(blocks) && blocks.length > 0) {
        // 使用新格式的BlockRenderer渲染
        try {
          // 使用动态导入避免循环依赖
          const blockEngineModule = await import('./block-engine/index.js');
          const BlockRenderer = blockEngineModule.BlockRenderer;
          
          if (!BlockRenderer) {
            throw new Error('BlockRenderer 未找到');
          }
          
          console.log('[TemplateService] 使用新格式（blocks）渲染模板，区块数量:', blocks.length);
          
          // 确保模板结构符合BlockRenderer的要求
          // BlockRenderer期望 template.blocks 和 template.pageSettings，但可能存储在 template.config 中
          const templateForRenderer = {
            ...template,
            blocks: blocks, // 确保 blocks 在顶层
            pageSettings: template.pageSettings || template.config?.pageSettings || {
              margin: { top: 15, bottom: 15, left: 15, right: 15 }
            },
            globalStyles: template.globalStyles || template.config?.globalStyles || {
              fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
              fontSize: 12
            }
          };
          
          const html = BlockRenderer.render(templateForRenderer, data);
          return html;
        } catch (error) {
          console.error('[TemplateService] 使用BlockRenderer渲染失败:', error);
          // 如果新格式渲染失败，尝试使用旧格式（如果有的话）
          console.warn('[TemplateService] 新格式渲染失败，尝试使用旧格式');
          // 继续执行下面的旧格式渲染逻辑
        }
      }
      
      // 获取模板HTML（旧格式）
      let html = '';
      if (template.html !== undefined) {
        html = template.html || '';
        console.log('[TemplateService] 从 template.html 获取内容，长度:', html.length);
      } else if (template.config?.html !== undefined) {
        html = template.config.html || '';
        console.log('[TemplateService] 从 config.html 获取内容，长度:', html.length);
      } else if (template.config?.canvas?.components) {
        html = template.config.canvas.components || '';
        console.log('[TemplateService] 从 config.canvas.components 获取内容，长度:', html.length);
      } else {
        console.error('[TemplateService] ❌ 模板内容为空，模板结构:', {
          templateName: template.name,
          templateId: template.id,
          hasHtml: template.html !== undefined,
          hasConfig: !!template.config,
          configKeys: template.config ? Object.keys(template.config) : [],
          hasCanvas: !!template.config?.canvas,
          canvasKeys: template.config?.canvas ? Object.keys(template.config.canvas) : [],
          hasBlocks: !!(template.blocks || template.config?.blocks)
        });
      }

      if (!html || html.trim().length === 0) {
        throw new Error(`模板内容为空（模板名称: ${template.name || '未知'}）`);
      }

      // 修复变量名（统一变量名格式）
      const fixed = this.fixVariableNames(html);
      if (fixed.hasChanges) {
        html = fixed.html;
        console.log('[TemplateService] 已修复模板中的变量名（简写形式 → 完整形式）');
      }

      // 获取样式
      const styles = template.styles || 
                     template.config?.styles || 
                     template.config?.canvas?.styles || 
                     '';

      // 获取页边距
      const margin = template.margin || 
                    template.config?.margin || 
                    { top: 20, bottom: 20, left: 20, right: 20 };

      // 替换样式变量
      html = TemplateRenderer.replaceStyleVariables(html);
      
      console.log('[TemplateService] 样式变量替换后，HTML长度:', html.length);

      // 处理计算规则（在使用引擎之前执行，以便在模板中使用计算结果）
      const calculations = template.calculations || template.config?.calculations || [];
      let calculatedValues = {};
      if (calculations.length > 0) {
        console.log('[TemplateService] 执行计算规则，数量:', calculations.length);
        const { CalculationConfigManager } = await import('./calculation-config-manager.js');
        calculatedValues = CalculationConfigManager.executeCalculations(calculations, data);
        console.log('[TemplateService] 计算规则执行完成，结果:', Object.keys(calculatedValues));
        
        // 将计算结果添加到数据对象中
        data.calc = calculatedValues;
      }

      // 使用新引擎或旧引擎渲染
      if (useNewEngine) {
        // 使用新引擎（DataBinderV2）
        console.log('[TemplateService] 使用 DataBinderV2 渲染模板');
        html = DataBinderV2.bind(html, data);
        console.log('[TemplateService] DataBinderV2 渲染完成，HTML长度:', html.length);
      } else {
        // 使用旧引擎（DataBinder）- 兼容模式
        // 动态导入旧引擎（如果需要兼容旧模板）
        const { DataBinder } = await import('./data-binder.js');
        html = DataBinder.bind(html, data, calculatedValues);
      }

      // 处理条件渲染
      const conditions = template.conditions || 
                        template.config?.conditions || {};
      if (Object.keys(conditions).length > 0) {
        html = TemplateRenderer.processConditions(html, conditions, data);
      }

      // 处理计算变量替换（在使用新引擎后，确保 {{calc.xxx}} 被替换）
      // DataBinderV2 应该已经通过 data.calc 处理了，但为了确保兼容性，这里也处理一下
      if (Object.keys(calculatedValues).length > 0) {
        html = TemplateRenderer.replaceCalculationVariables(html, calculatedValues);
        console.log('[TemplateService] 计算变量替换完成，替换了', Object.keys(calculatedValues).length, '个变量');
      }

      // 包装完整HTML文档
      const fullHtml = TemplateRenderer.wrapHtml(html, styles, margin);
      
      console.log('[TemplateService] 模板渲染完成，最终HTML长度:', fullHtml?.length || 0);

      return fullHtml;
    } catch (error) {
      console.error('[TemplateService] 渲染模板失败:', error);
      throw error;
    }
  }

  /**
   * 从模板生成 Mock 数据（编辑模式用）
   * Mock 数据的值为变量路径本身，如 {{order.contractNo}}
   * @param {Object} template - 模板对象
   * @returns {Object} Mock 数据对象
   */
  static createMockDataFromTemplate(template) {
    // 收集模板中使用的所有变量路径
    const variablePaths = this.extractVariablePaths(template);
    
    // 构建 Mock 数据对象
    const mockData = {
      order: {},
      customer: {},
      company: {},
      calc: {}
    };

    // 为每个变量路径创建对应的 Mock 值
    variablePaths.forEach(path => {
      const parts = path.split('.');
      if (parts.length < 2) return;

      const root = parts[0]; // order, customer, company, calc
      const key = parts.slice(1).join('.');

      // 确保根对象存在
      if (!mockData[root]) {
        mockData[root] = {};
      }

      // 设置 Mock 值为变量占位符
      this.setNestedValue(mockData[root], key, `{{${path}}}`);
    });

    // 添加一些默认的 Mock 数据
    this.addDefaultMockData(mockData);

    return mockData;
  }

  /**
   * 从模板中提取所有变量路径
   * @param {Object} template - 模板对象
   * @returns {Set<string>} 变量路径集合
   */
  static extractVariablePaths(template) {
    const paths = new Set();
    
    // 从 blocks 中提取
    const blocks = template.blocks || template.config?.blocks || [];
    blocks.forEach(block => {
      this.extractPathsFromObject(block, paths);
    });

    // 从 HTML 内容中提取
    let html = template.html || template.config?.html || '';
    if (html) {
      const matches = html.match(/\{\{([^}]+)\}\}/g) || [];
      matches.forEach(match => {
        const path = match.replace(/\{\{|\}\}/g, '').trim();
        // 排除 Handlebars 辅助函数
        if (!path.startsWith('#') && !path.startsWith('/') && !path.startsWith('else')) {
          paths.add(path);
        }
      });
    }

    return paths;
  }

  /**
   * 从对象中递归提取变量路径
   * @param {Object} obj - 对象
   * @param {Set<string>} paths - 路径集合
   */
  static extractPathsFromObject(obj, paths) {
    if (!obj || typeof obj !== 'object') return;

    Object.values(obj).forEach(value => {
      if (typeof value === 'string') {
        // 提取字符串中的变量
        const matches = value.match(/\{\{([^}]+)\}\}/g) || [];
        matches.forEach(match => {
          const path = match.replace(/\{\{|\}\}/g, '').trim();
          if (!path.startsWith('#') && !path.startsWith('/') && !path.startsWith('else')) {
            paths.add(path);
          }
        });
        
        // 也检查是否是字段引用（如 fields.title）
        if (value.includes('.') && !value.includes('{{')) {
          // 可能是字段路径，如 "company.companyNameEN"
          if (['order', 'customer', 'company', 'calc'].some(root => value.startsWith(root + '.'))) {
            paths.add(value);
          }
        }
      } else if (typeof value === 'object') {
        this.extractPathsFromObject(value, paths);
      }
    });
  }

  /**
   * 设置嵌套对象的值
   * @param {Object} obj - 目标对象
   * @param {string} path - 路径（如 "contractNo" 或 "extras.signAt"）
   * @param {*} value - 值
   */
  static setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }

  /**
   * 添加默认的 Mock 数据
   * @param {Object} mockData - Mock 数据对象
   */
  static addDefaultMockData(mockData) {
    // 订单默认字段 - 文本字段用占位符，数值字段用示例值
    const orderDefaults = {
      contractNo: '{{order.contractNo}}',
      orderDate: '{{order.orderDate}}',
      deliveryDate: '{{order.deliveryDate}}',
      shipmentDate: '{{order.shipmentDate}}',
      paymentTerms: '{{order.paymentTerms}}',
      tradeTerms: '{{order.tradeTerms}}',
      shipFrom: '{{order.shipFrom}}',
      shipTo: '{{order.shipTo}}',
      portOfLoading: '{{order.portOfLoading}}',
      portOfDischarge: '{{order.portOfDischarge}}',
      signAt: '{{order.signAt}}',
      totalAmount: 12500.00,  // 数值类型用示例值
      items: [
        {
          model: '{{item.model}}',
          description: '{{item.description}}',
          quantity: 1000,       // 数值类型
          unit: '{{item.unit}}',
          unitPrice: 12.50,    // 数值类型
          amount: 12500.00,    // 数值类型
          packages: 50,        // 数值类型
          netWeight: 2500,     // 数值类型
          grossWeight: 2800    // 数值类型
        },
        {
          model: '{{item.model}}',
          description: '{{item.description}}',
          quantity: 500,
          unit: '{{item.unit}}',
          unitPrice: 8.00,
          amount: 4000.00,
          packages: 25,
          netWeight: 1250,
          grossWeight: 1400
        }
      ]
    };

    // 客户默认字段
    const customerDefaults = {
      name: '{{customer.name}}',
      addressEN: '{{customer.addressEN}}',
      tel: '{{customer.tel}}',
      fax: '{{customer.fax}}',
      email: '{{customer.email}}',
      contactPerson: '{{customer.contactPerson}}'
    };

    // 公司默认字段
    const companyDefaults = {
      companyNameEN: '{{company.companyNameEN}}',
      companyNameCN: '{{company.companyNameCN}}',
      companyAddressEN: '{{company.companyAddressEN}}',
      companyAddressCN: '{{company.companyAddressCN}}',
      companyTel: '{{company.companyTel}}',
      companyFax: '{{company.companyFax}}',
      signAt: '{{company.signAt}}'
    };

    // 计算字段默认值 - 数值字段使用示例值
    const calcDefaults = {
      totalQuantity: 1500,         // 数值类型
      totalAmount: 16500.00,       // 数值类型
      totalPackages: 75,           // 数值类型
      totalNetWeight: 3750,        // 数值类型
      totalGrossWeight: 4200,      // 数值类型
      totalAmountUSD: 16500.00,    // 数值类型
      totalQuantityPCS: 1500       // 数值类型
    };

    // 合并默认值（不覆盖已有值）
    mockData.order = { ...orderDefaults, ...mockData.order };
    mockData.customer = { ...customerDefaults, ...mockData.customer };
    mockData.company = { ...companyDefaults, ...mockData.company };
    mockData.calc = { ...calcDefaults, ...mockData.calc };
  }

  /**
   * 准备数据对象
   * @param {Object} order - 订单对象
   * @param {Object} customer - 客户对象
   * @param {Object} company - 公司对象（使用API字段名：companyNameEN, companyNameCN等）
   * @param {Object} calc - 计算值对象（可选）
   * @returns {Object} 数据对象
   */
  static prepareData(order, customer, company, calc = {}) {
    // 直接使用API字段，不做映射（统一使用API字段格式）
    const orderData = order || {};
    
    // 解析extras字段（可能是JSON字符串或对象）
    let extras = {};
    if (orderData.extras) {
      if (typeof orderData.extras === 'string') {
        try {
          extras = JSON.parse(orderData.extras);
        } catch (e) {
          console.warn('[TemplateService] 解析extras失败:', e);
        }
      } else if (typeof orderData.extras === 'object') {
        extras = orderData.extras;
      }
    }
    
    // SignAt 优先级：order.extras.signAt -> order.signAt -> order.shipFrom -> company.signAt
    const signAt = (extras && extras.signAt) 
      ? String(extras.signAt) 
      : (orderData.signAt ? String(orderData.signAt) : (orderData.shipFrom ? String(orderData.shipFrom) : ((company && company.signAt) ? String(company.signAt) : '')));
    
    // 添加 signAt 字段到 order 对象
    const enrichedOrder = {
      ...orderData,
      signAt: signAt,
      extras: extras
    };
    
    // 确保 signAt 字段被正确添加
    if (!enrichedOrder.signAt) {
      enrichedOrder.signAt = signAt;
    }
    
    // 处理 items 中的 extras 字段（确保是对象而不是字符串）
    if (enrichedOrder.items && Array.isArray(enrichedOrder.items)) {
      enrichedOrder.items = enrichedOrder.items.map(item => {
        if (!item || typeof item !== 'object') return item;
        if (item.extras && typeof item.extras === 'string') {
          try {
            item.extras = JSON.parse(item.extras);
          } catch (e) {
            item.extras = {};
          }
        }
        if (item.extras == null) item.extras = {};
        return item;
      });
    }
    
    return {
      order: enrichedOrder,
      customer: customer || {},
      company: company || {},
      calc: calc
    };
  }
}

