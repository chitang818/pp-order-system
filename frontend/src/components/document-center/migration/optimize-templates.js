/**
 * 模板优化工具
 * 优化现有模板，使其符合新的变量系统
 */

import DocumentCenterService from '../../../services/document-center-service.js';
import { TemplateConverter } from './template-converter.js';
import { TemplateValidator } from '../validator/template-validator.js';

/**
 * 优化指定模板
 * @param {string|number} templateId - 模板ID
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 优化结果
 */
export async function optimizeTemplate(templateId, options = {}) {
  const { dryRun = false, autoSave = true } = options;
  
  try {
    // 1. 获取模板
    const template = await DocumentCenterService.getTemplate(templateId);
    if (!template) {
      throw new Error(`模板不存在: ${templateId}`);
    }
    
    console.log(`\n处理模板: "${template.name}" (ID: ${template.id}, 类型: ${template.type})`);
    
    // 2. 获取HTML内容
    let html = '';
    if (template.html !== undefined) {
      html = template.html || '';
    } else if (template.config?.html !== undefined) {
      html = template.config.html || '';
    } else if (template.config?.canvas?.components) {
      html = template.config.canvas.components || '';
    }
    
    if (!html) {
      console.log('  模板内容为空，跳过');
      return { optimized: false, reason: 'empty' };
    }
    
    // 3. 检查是否需要转换
    const needsConversion = TemplateConverter.needsConversion(html);
    if (!needsConversion) {
      console.log('  模板已经是新格式，无需优化');
      return { optimized: false, reason: 'already_new_format' };
    }
    
    // 4. 转换模板
    console.log('  开始转换模板格式...');
    const convertedHtml = TemplateConverter.convert(html);
    const report = TemplateConverter.getConversionReport(html, convertedHtml);
    
    console.log('  转换报告:', report);
    
    // 5. 验证转换后的模板（可选，使用动态导入避免循环依赖）
    try {
      const { TemplateValidator } = await import('../validator/template-validator.js');
      const validation = await TemplateValidator.validate(convertedHtml);
      if (validation.errors && validation.errors.length > 0) {
        console.warn('  转换后模板有错误:', validation.errors);
      }
      if (validation.warnings && validation.warnings.length > 0) {
        const importantWarnings = validation.warnings.filter(w => 
          w.type === 'UNKNOWN_NAMESPACE' || 
          w.type === 'UNCLOSED_LOOP' || 
          w.type === 'UNCLOSED_CONDITION'
        );
        if (importantWarnings.length > 0) {
          console.warn('  转换后模板有重要警告:', importantWarnings);
        }
      }
    } catch (error) {
      // 验证失败不影响优化流程
      console.warn('  验证转换后的模板失败（不影响优化）:', error.message);
    }
    
    if (dryRun) {
      console.log('  [预览] 模板将被更新');
      return { 
        optimized: true, 
        converted: true, 
        report,
        preview: convertedHtml.substring(0, 500) + '...'
      };
    }
    
    // 6. 更新模板
    if (autoSave) {
      const updateData = {
        name: template.name,
        type: template.type,
        isDefault: template.isDefault || false
      };
      
      // 根据模板格式构建config
      if (template.html !== undefined) {
        updateData.config = {
          html: convertedHtml,
          styles: template.styles || '',
          margin: template.margin || { top: 20, bottom: 20, left: 20, right: 20 },
          calculations: template.calculations || [],
          conditions: template.conditions || {}
        };
      } else if (template.config) {
        updateData.config = {
          ...template.config,
          html: template.config.html !== undefined ? convertedHtml : undefined,
          canvas: template.config.canvas ? {
            ...template.config.canvas,
            components: template.config.canvas.components ? convertedHtml : undefined
          } : undefined
        };
      }
      
      await DocumentCenterService.updateTemplate(template.id, updateData);
      console.log('  ✓ 模板已更新');
    }
    
    return { 
      optimized: true, 
      converted: true, 
      report 
    };
  } catch (error) {
    console.error(`  优化模板失败:`, error);
    throw error;
  }
}

/**
 * 优化指定名称的模板
 * @param {string} templateName - 模板名称（如 "INVOICE" 或 "PACKING LIST"）
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 优化结果
 */
export async function optimizeTemplateByName(templateName, options = {}) {
  try {
    // 获取所有模板
    const templates = await DocumentCenterService.listTemplates();
    
    // 查找匹配的模板
    const template = templates.find(t => 
      t.name === templateName || 
      t.name.includes(templateName) ||
      templateName.includes(t.name)
    );
    
    if (!template) {
      throw new Error(`未找到模板: ${templateName}`);
    }
    
    return await optimizeTemplate(template.id, options);
  } catch (error) {
    console.error(`优化模板 "${templateName}" 失败:`, error);
    throw error;
  }
}

/**
 * 批量优化模板
 * @param {Array<string>} templateNames - 模板名称数组
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 优化结果
 */
export async function optimizeTemplates(templateNames, options = {}) {
  const { dryRun = false } = options;
  
  console.log('开始批量优化模板...');
  console.log(`模式: ${dryRun ? '预览模式（不会实际更新）' : '实际优化模式'}`);
  console.log(`模板: ${templateNames.join(', ')}`);
  
  const results = {
    success: [],
    failed: [],
    skipped: []
  };
  
  for (const templateName of templateNames) {
    try {
      const result = await optimizeTemplateByName(templateName, options);
      
      if (result.optimized) {
        results.success.push({ name: templateName, result });
      } else {
        results.skipped.push({ name: templateName, reason: result.reason });
      }
    } catch (error) {
      results.failed.push({ name: templateName, error: error.message });
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('优化完成！');
  console.log(`  成功: ${results.success.length}`);
  console.log(`  跳过: ${results.skipped.length}`);
  console.log(`  失败: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n失败详情:');
    results.failed.forEach(item => {
      console.log(`  - ${item.name}: ${item.error}`);
    });
  }
  
  return results;
}

/**
 * 检查模板内容（调试用）
 * @param {string|number} templateId - 模板ID或名称
 * @returns {Promise<Object>} 模板内容信息
 */
export async function inspectTemplate(templateId) {
  try {
    let template;
    if (typeof templateId === 'string' && isNaN(templateId)) {
      // 按名称查找
      const templates = await DocumentCenterService.listTemplates();
      template = templates.find(t => 
        t.name === templateId || 
        t.name.includes(templateId) ||
        templateId.includes(t.name)
      );
    } else {
      // 按ID查找
      template = await DocumentCenterService.getTemplate(templateId);
    }
    
    if (!template) {
      throw new Error(`模板不存在: ${templateId}`);
    }
    
    // 获取HTML内容
    let html = '';
    if (template.html !== undefined) {
      html = template.html || '';
    } else if (template.config?.html !== undefined) {
      html = template.config.html || '';
    } else if (template.config?.canvas?.components) {
      html = template.config.canvas.components || '';
    }
    
    // 检查内容
    const hasOldLoop = /\{\{#each\s+items\s*\}\}/gi.test(html);
    const hasOldVariable = /\{\{@index/.test(html);
    const hasNakedVariable = /\{\{#each\s+order\.items\s*\}\}[\s\S]*?\{\{(\w+)\}\}[\s\S]*?\{\{\s*\/each\s*\}\}/.test(html);
    const needsConversion = TemplateConverter.needsConversion(html);
    
    // 提取循环内容示例
    const loopMatch = html.match(/\{\{#each\s+order\.items\s*\}\}([\s\S]{0,500})\{\{\s*\/each\s*\}\}/i);
    const loopContent = loopMatch ? loopMatch[1] : '';
    
    return {
      id: template.id,
      name: template.name,
      type: template.type,
      htmlLength: html.length,
      hasOldLoop,
      hasOldVariable,
      hasNakedVariable,
      needsConversion,
      loopContentPreview: loopContent.substring(0, 200),
      htmlPreview: html.substring(0, 500)
    };
  } catch (error) {
    console.error(`检查模板失败:`, error);
    throw error;
  }
}

// 导出到全局作用域，方便在控制台中使用
if (typeof window !== 'undefined') {
  window.optimizeTemplate = optimizeTemplate;
  window.optimizeTemplateByName = optimizeTemplateByName;
  window.optimizeTemplates = optimizeTemplates;
  window.inspectTemplate = inspectTemplate;
  console.log('模板优化工具已加载，使用方法:');
  console.log('  await inspectTemplate("INVOICE")                    // 检查模板内容');
  console.log('  await optimizeTemplateByName("INVOICE", { dryRun: true })  // 预览模式');
  console.log('  await optimizeTemplateByName("INVOICE", { dryRun: false }) // 实际优化');
  console.log('  await optimizeTemplates(["INVOICE", "PACKING LIST"])       // 批量优化');
}

