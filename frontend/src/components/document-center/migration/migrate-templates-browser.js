/**
 * 浏览器端批量迁移模板工具
 * 在浏览器控制台中运行，用于迁移数据库中的模板
 * 
 * 使用方法：
 * 1. 打开浏览器控制台
 * 2. 导入此模块
 * 3. 调用 migrateTemplates() 函数
 */

import DocumentCenterService from '../../../services/document-center-service.js';
import { TemplateConverter } from './template-converter.js';

/**
 * 批量迁移模板
 * @param {Object} options - 选项
 * @param {boolean} options.dryRun - 是否仅预览（默认false）
 * @param {number} options.templateId - 只迁移指定ID的模板（可选）
 * @returns {Promise<Object>} 迁移结果
 */
export async function migrateTemplates(options = {}) {
  const { dryRun = false, templateId = null } = options;
  
  console.log('开始迁移模板...');
  console.log(`模式: ${dryRun ? '预览模式（不会实际更新）' : '实际迁移模式'}`);
  
  try {
    // 获取所有模板
    let templates = await DocumentCenterService.listTemplates();
    
    // 如果指定了模板ID，只处理该模板
    if (templateId) {
      templates = templates.filter(t => t.id == templateId);
      if (templates.length === 0) {
        console.log(`未找到ID为 ${templateId} 的模板`);
        return { success: 0, skipped: 0, error: 0, errors: [] };
      }
    }
    
    console.log(`找到 ${templates.length} 个模板`);
    
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const errors = [];
    
    for (const template of templates) {
      try {
        // 获取模板HTML
        let html = '';
        if (template.html !== undefined) {
          html = template.html || '';
        } else if (template.config?.html !== undefined) {
          html = template.config.html || '';
        } else if (template.config?.canvas?.components) {
          html = template.config.canvas.components || '';
        }
        
        // 检查是否需要转换
        if (!TemplateConverter.needsConversion(html)) {
          console.log(`✓ 模板 "${template.name}" (ID: ${template.id}) 已经是新格式，跳过`);
          skippedCount++;
          continue;
        }
        
        // 转换模板
        const convertedHtml = TemplateConverter.convert(html);
        const report = TemplateConverter.getConversionReport(html, convertedHtml);
        
        console.log(`\n处理模板: "${template.name}" (ID: ${template.id})`);
        console.log(`  转换报告:`, report);
        
        if (!dryRun) {
          // 构建更新数据
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
          
          // 更新模板
          await DocumentCenterService.updateTemplate(template.id, updateData);
          console.log(`  ✓ 模板已更新`);
          successCount++;
        } else {
          console.log(`  [预览] 模板将被更新`);
          successCount++;
        }
      } catch (error) {
        console.error(`  ✗ 处理模板 "${template.name}" (ID: ${template.id}) 失败:`, error.message);
        errors.push({
          templateId: template.id,
          templateName: template.name,
          error: error.message
        });
        errorCount++;
      }
    }
    
    // 输出总结
    const result = {
      success: successCount,
      skipped: skippedCount,
      error: errorCount,
      errors: errors
    };
    
    console.log('\n' + '='.repeat(50));
    console.log('迁移完成！');
    console.log(`  成功: ${successCount}`);
    console.log(`  跳过: ${skippedCount}`);
    console.log(`  失败: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log('\n错误详情:');
      errors.forEach(err => {
        console.log(`  - ${err.templateName} (ID: ${err.templateId}): ${err.error}`);
      });
    }
    
    if (dryRun) {
      console.log('\n注意：这是预览模式，未实际更新数据库');
      console.log('要实际执行迁移，请调用: migrateTemplates({ dryRun: false })');
    }
    
    return result;
  } catch (error) {
    console.error('迁移过程出错:', error);
    throw error;
  }
}

// 导出到全局作用域，方便在控制台中使用
if (typeof window !== 'undefined') {
  window.migrateTemplates = migrateTemplates;
  console.log('迁移工具已加载，使用方法:');
  console.log('  migrateTemplates({ dryRun: true })  // 预览模式');
  console.log('  migrateTemplates({ dryRun: false })  // 实际迁移');
  console.log('  migrateTemplates({ templateId: 1 }) // 只迁移指定模板');
}

