/**
 * 删除所有模板工具
 * 提供安全的删除所有模板功能，包含确认提示
 */

import DocumentCenterService from '../../../services/document-center-service.js';

/**
 * 删除所有模板（带确认）
 * @param {Object} options - 选项
 * @param {boolean} options.skipConfirm - 跳过确认（默认false）
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteAllTemplates(options = {}) {
  const { skipConfirm = false } = options;
  
  try {
    // 1. 获取所有模板
    const templates = await DocumentCenterService.listTemplates();
    const templateCount = templates.length;
    
    if (templateCount === 0) {
      console.log('没有模板需要删除');
      return { success: true, deletedCount: 0, message: '没有模板需要删除' };
    }
    
    // 2. 显示模板列表
    console.log(`\n找到 ${templateCount} 个模板:`);
    templates.forEach((t, index) => {
      console.log(`  ${index + 1}. ${t.name} (ID: ${t.id}, 类型: ${t.type})`);
    });
    
    // 3. 确认删除
    if (!skipConfirm) {
      const message = `确定要删除所有模板吗？\n\n此操作将删除 ${templateCount} 个模板，且不可恢复！\n\n模板列表：\n${templates.map(t => `- ${t.name}`).join('\n')}`;
      
      // 使用浏览器原生确认对话框
      const confirmed = window.confirm(message);
      
      if (!confirmed) {
        console.log('操作已取消');
        return { success: false, deletedCount: 0, message: '操作已取消' };
      }
      
      // 二次确认
      const doubleConfirm = window.confirm(`⚠️ 最后确认：您真的要删除所有 ${templateCount} 个模板吗？\n\n此操作不可恢复！`);
      
      if (!doubleConfirm) {
        console.log('操作已取消（二次确认）');
        return { success: false, deletedCount: 0, message: '操作已取消（二次确认）' };
      }
    }
    
    // 4. 执行删除
    console.log('\n开始删除所有模板...');
    const deletedCount = await DocumentCenterService.deleteAllTemplates();
    
    console.log('\n' + '='.repeat(50));
    console.log('删除完成！');
    console.log(`  已删除: ${deletedCount} 个模板`);
    console.log('='.repeat(50));
    
    return {
      success: true,
      deletedCount,
      message: `成功删除 ${deletedCount} 个模板`
    };
  } catch (error) {
    console.error('删除所有模板失败:', error);
    throw error;
  }
}

/**
 * 备份所有模板（导出为JSON）
 * @returns {Promise<string>} JSON字符串
 */
export async function backupAllTemplates() {
  try {
    const templates = await DocumentCenterService.listTemplates();
    
    const backup = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      templateCount: templates.length,
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        isDefault: t.isDefault,
        config: t.config,
        html: t.html,
        styles: t.styles,
        margin: t.margin,
        calculations: t.calculations,
        conditions: t.conditions,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      }))
    };
    
    const jsonString = JSON.stringify(backup, null, 2);
    
    // 创建下载链接
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `templates-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`✅ 已备份 ${templates.length} 个模板到文件: ${a.download}`);
    
    return jsonString;
  } catch (error) {
    console.error('备份模板失败:', error);
    throw error;
  }
}

/**
 * 删除所有模板（带备份）
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteAllTemplatesWithBackup(options = {}) {
  try {
    // 1. 先备份
    console.log('正在备份模板...');
    await backupAllTemplates();
    console.log('✅ 备份完成\n');
    
    // 2. 等待用户确认已保存备份
    const proceed = window.confirm('备份已完成，文件已下载到您的电脑。\n\n请确认已保存备份文件后，点击"确定"继续删除。');
    
    if (!proceed) {
      console.log('操作已取消');
      return { success: false, deletedCount: 0, message: '操作已取消' };
    }
    
    // 3. 执行删除
    return await deleteAllTemplates({ skipConfirm: true });
  } catch (error) {
    console.error('删除模板失败:', error);
    throw error;
  }
}

// 导出到全局作用域，方便在控制台中使用
if (typeof window !== 'undefined') {
  // 确保函数被正确导出
  Object.assign(window, {
    deleteAllTemplates,
    backupAllTemplates,
    deleteAllTemplatesWithBackup
  });
  console.log('🗑️ 模板删除工具已加载，使用方法:');
  console.log('  await backupAllTemplates()                    // 备份所有模板');
  console.log('  await deleteAllTemplates()                    // 删除所有模板（带确认）');
  console.log('  await deleteAllTemplatesWithBackup()          // 先备份再删除');
  console.log('\n⚠️  警告：删除操作不可恢复，请谨慎使用！');
}

