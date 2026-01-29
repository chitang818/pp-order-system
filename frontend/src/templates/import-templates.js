/**
 * 模板导入脚本
 * 用于将模板JSON文件导入到数据库
 */

/**
 * 导入所有模板
 */
export async function importAllTemplates() {
  const templates = [];
  
  // 导入默认模板
  templates.push(
    await import('./defaults/sales-default.json'),
    await import('./defaults/production-default.json'),
    await import('./defaults/invoice-default.json'),
    await import('./defaults/packing-default.json'),
    await import('./defaults/pickup-default.json')
  );
  
  // 导入品类专用模板
  templates.push(
    await import('./product-types/production-type-a.json'),
    await import('./product-types/production-type-b.json'),
    await import('./product-types/production-type-c.json')
  );
  
  // 导入客户专用模板
  templates.push(
    await import('./customers/invoice-dainen.json'),
    await import('./customers/packing-dainen.json')
  );
  
  // 保存到数据库
  for (const template of templates) {
    try {
      const response = await fetch('/api/document-center/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          type: template.type,
          config: template,
          applicability: template.applicability
        })
      });
      
      if (response.ok) {
        console.log(`✅ 模板导入成功: ${template.name}`);
      } else {
        const error = await response.json();
        console.error(`❌ 模板导入失败: ${template.name}`, error);
      }
    } catch (error) {
      console.error(`❌ 模板导入错误: ${template.name}`, error);
    }
  }
  
  return templates;
}

/**
 * 导入单个模板
 */
export async function importTemplate(templatePath) {
  try {
    const template = await import(templatePath);
    const response = await fetch('/api/document-center/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: template.name,
        type: template.type,
        config: template,
        applicability: template.applicability
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ 模板导入成功: ${template.name}`, result);
      return result;
    } else {
      const error = await response.json();
      throw new Error(error.message || '导入失败');
    }
  } catch (error) {
    console.error(`❌ 模板导入错误:`, error);
    throw error;
  }
}

