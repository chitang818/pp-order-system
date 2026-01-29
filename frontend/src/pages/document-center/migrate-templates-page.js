/**
 * 模板迁移页面
 * 提供UI界面来执行模板迁移
 */

import { migrateTemplates } from '../../components/document-center/migration/migrate-templates-browser.js';

let migrationInProgress = false;

/**
 * 初始化迁移页面
 */
export async function initMigrateTemplatesPage() {
  console.log('[MigrateTemplatesPage] 初始化迁移页面');
  
  // 创建UI
  createMigrationUI();
  
  // 绑定事件
  bindEvents();
}

/**
 * 创建迁移UI
 */
function createMigrationUI() {
  const container = document.getElementById('migrateTemplatesContainer');
  if (!container) {
    console.error('[MigrateTemplatesPage] 未找到容器元素');
    return;
  }

  container.innerHTML = `
    <div class="migration-panel">
      <h2>模板迁移工具</h2>
      <p class="migration-description">
        此工具将帮助您将旧格式模板转换为新格式。
        建议先使用预览模式检查转换结果。
      </p>
      
      <div class="migration-options">
        <label>
          <input type="checkbox" id="dryRunCheckbox" checked>
          预览模式（不会实际更新数据库）
        </label>
        <label>
          <input type="text" id="templateIdInput" placeholder="模板ID（可选，留空则迁移所有模板）">
        </label>
      </div>
      
      <div class="migration-actions">
        <button id="startMigrationBtn" class="btn primary">开始迁移</button>
        <button id="checkTemplatesBtn" class="btn secondary">检查模板</button>
      </div>
      
      <div id="migrationProgress" class="migration-progress" style="display: none;">
        <div class="progress-bar">
          <div class="progress-fill" id="progressFill"></div>
        </div>
        <div class="progress-text" id="progressText">准备中...</div>
      </div>
      
      <div id="migrationResults" class="migration-results" style="display: none;">
        <h3>迁移结果</h3>
        <div id="resultsContent"></div>
      </div>
    </div>
    
    <style>
      .migration-panel {
        max-width: 800px;
        margin: 20px auto;
        padding: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      
      .migration-description {
        color: #666;
        margin-bottom: 20px;
      }
      
      .migration-options {
        margin-bottom: 20px;
      }
      
      .migration-options label {
        display: block;
        margin-bottom: 10px;
      }
      
      .migration-options input[type="text"] {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-top: 5px;
      }
      
      .migration-actions {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
      }
      
      .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }
      
      .btn.primary {
        background: #3b82f6;
        color: white;
      }
      
      .btn.primary:hover {
        background: #2563eb;
      }
      
      .btn.secondary {
        background: #6b7280;
        color: white;
      }
      
      .btn.secondary:hover {
        background: #4b5563;
      }
      
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .migration-progress {
        margin-top: 20px;
      }
      
      .progress-bar {
        width: 100%;
        height: 20px;
        background: #e5e7eb;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 10px;
      }
      
      .progress-fill {
        height: 100%;
        background: #3b82f6;
        transition: width 0.3s;
        width: 0%;
      }
      
      .progress-text {
        text-align: center;
        color: #666;
      }
      
      .migration-results {
        margin-top: 20px;
        padding: 15px;
        background: #f9fafb;
        border-radius: 4px;
      }
      
      .migration-results h3 {
        margin-top: 0;
      }
      
      .result-item {
        padding: 10px;
        margin-bottom: 10px;
        border-radius: 4px;
      }
      
      .result-item.success {
        background: #d1fae5;
        color: #065f46;
      }
      
      .result-item.error {
        background: #fee2e2;
        color: #991b1b;
      }
      
      .result-item.info {
        background: #dbeafe;
        color: #1e40af;
      }
    </style>
  `;
}

/**
 * 绑定事件
 */
function bindEvents() {
  const startBtn = document.getElementById('startMigrationBtn');
  const checkBtn = document.getElementById('checkTemplatesBtn');
  
  if (startBtn) {
    startBtn.addEventListener('click', handleStartMigration);
  }
  
  if (checkBtn) {
    checkBtn.addEventListener('click', handleCheckTemplates);
  }
}

/**
 * 处理开始迁移
 */
async function handleStartMigration() {
  if (migrationInProgress) {
    window.NotificationSystem?.toast('迁移正在进行中，请稍候...', 'warning');
    return;
  }

  const dryRunCheckbox = document.getElementById('dryRunCheckbox');
  const templateIdInput = document.getElementById('templateIdInput');
  const progressDiv = document.getElementById('migrationProgress');
  const resultsDiv = document.getElementById('migrationResults');
  const startBtn = document.getElementById('startMigrationBtn');
  const checkBtn = document.getElementById('checkTemplatesBtn');
  
  const dryRun = dryRunCheckbox?.checked ?? true;
  const templateId = templateIdInput?.value?.trim() || null;
  
  migrationInProgress = true;
  startBtn.disabled = true;
  checkBtn.disabled = true;
  
  // 显示进度
  progressDiv.style.display = 'block';
  resultsDiv.style.display = 'none';
  updateProgress(0, '开始迁移...');
  
  try {
    // 执行迁移
    const result = await migrateTemplates({
      dryRun,
      templateId: templateId ? parseInt(templateId) : null
    });
    
    // 显示结果
    displayResults(result, dryRun);
    
    updateProgress(100, '迁移完成！');
    
    // 显示通知
    if (window.NotificationSystem) {
      const message = dryRun 
        ? `预览完成：${result.success} 个模板需要转换`
        : `迁移完成：成功 ${result.success}，失败 ${result.error}`;
      window.NotificationSystem.toast(message, 'success');
    }
  } catch (error) {
    console.error('[MigrateTemplatesPage] 迁移失败:', error);
    updateProgress(0, '迁移失败');
    
    if (window.NotificationSystem) {
      window.NotificationSystem.toast('迁移失败: ' + error.message, 'error');
    }
    
    displayError(error);
  } finally {
    migrationInProgress = false;
    startBtn.disabled = false;
    checkBtn.disabled = false;
  }
}

/**
 * 处理检查模板
 */
async function handleCheckTemplates() {
  try {
    const { TemplateConverter } = await import('../../components/document-center/migration/template-converter.js');
    const DocumentCenterService = (await import('../../services/document-center-service.js')).default;
    
    const templates = await DocumentCenterService.listTemplates();
    
    let needsConversionCount = 0;
    const needsConversion = [];
    
    for (const template of templates) {
      let html = '';
      if (template.html !== undefined) {
        html = template.html || '';
      } else if (template.config?.html !== undefined) {
        html = template.config.html || '';
      } else if (template.config?.canvas?.components) {
        html = template.config.canvas.components || '';
      }
      
      if (TemplateConverter.needsConversion(html)) {
        needsConversionCount++;
        needsConversion.push({
          id: template.id,
          name: template.name,
          type: template.type
        });
      }
    }
    
    const resultsDiv = document.getElementById('migrationResults');
    const resultsContent = document.getElementById('resultsContent');
    
    if (needsConversionCount === 0) {
      resultsContent.innerHTML = `
        <div class="result-item success">
          ✅ 所有模板都是新格式，无需迁移
        </div>
      `;
    } else {
      resultsContent.innerHTML = `
        <div class="result-item info">
          <strong>发现 ${needsConversionCount} 个需要转换的模板：</strong>
          <ul style="margin-top: 10px;">
            ${needsConversion.map(t => `
              <li>${t.name} (ID: ${t.id}, 类型: ${t.type})</li>
            `).join('')}
          </ul>
        </div>
      `;
    }
    
    resultsDiv.style.display = 'block';
    
    if (window.NotificationSystem) {
      window.NotificationSystem.toast(
        `检查完成：${needsConversionCount} 个模板需要转换`,
        needsConversionCount > 0 ? 'warning' : 'success'
      );
    }
  } catch (error) {
    console.error('[MigrateTemplatesPage] 检查模板失败:', error);
    if (window.NotificationSystem) {
      window.NotificationSystem.toast('检查失败: ' + error.message, 'error');
    }
  }
}

/**
 * 更新进度
 */
function updateProgress(percent, text) {
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  
  if (progressText) {
    progressText.textContent = text;
  }
}

/**
 * 显示结果
 */
function displayResults(result, dryRun) {
  const resultsDiv = document.getElementById('migrationResults');
  const resultsContent = document.getElementById('resultsContent');
  
  let html = `
    <div class="result-item ${result.error > 0 ? 'error' : 'success'}">
      <strong>迁移${dryRun ? '预览' : ''}完成</strong>
      <ul style="margin-top: 10px;">
        <li>成功: ${result.success}</li>
        <li>跳过: ${result.skipped}</li>
        <li>失败: ${result.error}</li>
      </ul>
    </div>
  `;
  
  if (result.errors && result.errors.length > 0) {
    html += `
      <div class="result-item error">
        <strong>错误详情：</strong>
        <ul style="margin-top: 10px;">
          ${result.errors.map(err => `
            <li>${err.templateName} (ID: ${err.templateId}): ${err.error}</li>
          `).join('')}
        </ul>
      </div>
    `;
  }
  
  if (dryRun) {
    html += `
      <div class="result-item info">
        <strong>注意：</strong>这是预览模式，未实际更新数据库。
        要实际执行迁移，请取消勾选"预览模式"后再次点击"开始迁移"。
      </div>
    `;
  }
  
  resultsContent.innerHTML = html;
  resultsDiv.style.display = 'block';
}

/**
 * 显示错误
 */
function displayError(error) {
  const resultsDiv = document.getElementById('migrationResults');
  const resultsContent = document.getElementById('resultsContent');
  
  resultsContent.innerHTML = `
    <div class="result-item error">
      <strong>迁移失败</strong>
      <p>${error.message || '未知错误'}</p>
    </div>
  `;
  
  resultsDiv.style.display = 'block';
}

