/**
 * 导出设置视图
 * - 管理“可编辑PDF”渲染引擎（Edge/Chrome）路径配置
 */
import { isTauriAvailable } from '../../core/ipc-client.js';
import { backendManager } from '../../utils/backend-manager.js';

export class ExportSettingsView {
  constructor(apiService) {
    this.apiService = apiService || window.ApiService;
    this._backendReady = false;
  }

  async render() {
    this.bindButtons();
    await this.ensureBackend();
    await this.loadConfig();
  }

  async ensureBackend() {
    // 导出设置依赖 127.0.0.1:3000（Node 后端）。若未启动会出现 ERR_CONNECTION_REFUSED。
    if (this._backendReady) return true;
    try {
      await backendManager.ensureBackendWithNotification();
      this._backendReady = true;
      return true;
    } catch (e) {
      console.error('[导出设置] 后端启动失败:', e);
      window.NotificationSystem?.toast('导出服务未启动，无法加载导出设置：' + (e.message || String(e)), 'error', 6000);
      return false;
    }
  }

  bindButtons() {
    const input = document.getElementById('pdfBrowserPathInput');
    const btnSelect = document.getElementById('btnSelectPdfBrowser');
    const btnSave = document.getElementById('btnSavePdfBrowser');
    const btnClear = document.getElementById('btnClearPdfBrowser');
    const btnTest = document.getElementById('btnTestPdfExportEngine');

    if (btnSelect) {
      btnSelect.onclick = async () => {
        try {
          const isTauri = await isTauriAvailable();
          if (!isTauri) {
            window.NotificationSystem?.toast('仅桌面版支持文件选择器，请手动粘贴浏览器路径', 'info');
            return;
          }
          const dialog = await import('@tauri-apps/plugin-dialog');
          const selected = await dialog.open({
            multiple: false,
            filters: [{ name: '浏览器可执行文件', extensions: ['exe'] }],
            title: '选择 Edge/Chrome 可执行文件（msedge.exe / chrome.exe）'
          });
          if (selected && input) {
            input.value = String(selected);
          }
        } catch (e) {
          console.error('[导出设置] 选择浏览器失败:', e);
          window.NotificationSystem?.toast('选择失败：' + (e.message || String(e)), 'error');
        }
      };
    }

    if (btnSave) {
      btnSave.onclick = async () => {
        const original = btnSave.innerHTML;
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="settings-btn-icon">⏳</span>保存中...';
        try {
          const ok = await this.ensureBackend();
          if (!ok) return;
          const p = input?.value?.trim() || '';
          const resp = await this.apiService.json('/api/export/browser', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: p })
          });
          if (resp?.success) {
            window.NotificationSystem?.toast('已保存导出引擎配置', 'success');
            await this.loadConfig();
          } else {
            window.NotificationSystem?.toast('保存失败：服务器响应异常', 'error');
          }
        } catch (e) {
          console.error('[导出设置] 保存失败:', e);
          window.NotificationSystem?.toast('保存失败：' + (e.message || String(e)), 'error', 6000);
        } finally {
          btnSave.disabled = false;
          btnSave.innerHTML = original;
        }
      };
    }

    if (btnClear) {
      btnClear.onclick = async () => {
        try {
          const okBackend = await this.ensureBackend();
          if (!okBackend) return;
          const ok = await window.ModalDialog?.confirm?.(
            '确定要清除“手动指定浏览器路径”吗？\n\n清除后将回退到自动识别（注册表/常见安装路径）。',
            { title: '清除配置', icon: '🧹', confirmText: '确定清除', cancelText: '取消' }
          );
          if (!ok) return;

          const resp = await this.apiService.json('/api/export/browser', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '' })
          });
          if (resp?.success && input) {
            input.value = '';
            window.NotificationSystem?.toast('已清除手动配置', 'success');
            await this.loadConfig();
          }
        } catch (e) {
          console.error('[导出设置] 清除失败:', e);
          window.NotificationSystem?.toast('清除失败：' + (e.message || String(e)), 'error');
        }
      };
    }

    if (btnTest) {
      btnTest.onclick = async () => {
        const original = btnTest.innerHTML;
        btnTest.disabled = true;
        btnTest.innerHTML = '<span class="settings-btn-icon">⏳</span>测试中...';
        try {
          const ok = await this.ensureBackend();
          if (!ok) return;
          await this.apiService.json('/api/export/warmup', { method: 'POST' });
          await this.loadConfig();
          window.NotificationSystem?.toast('已触发导出服务预热，请回到单据页面重试导出', 'success', 4000);
        } catch (e) {
          console.error('[导出设置] 测试失败:', e);
          window.NotificationSystem?.toast('测试失败：' + (e.message || String(e)), 'error', 6000);
        } finally {
          btnTest.disabled = false;
          btnTest.innerHTML = original;
        }
      };
    }
  }

  async loadConfig() {
    const input = document.getElementById('pdfBrowserPathInput');
    const detectedLabel = document.getElementById('pdfDetectedPathLabel');
    const effectiveLabel = document.getElementById('pdfEffectivePathLabel');
    const configPathLabel = document.getElementById('pdfConfigPathLabel');

    try {
      const ok = await this.ensureBackend();
      if (!ok) return;
      const info = await this.apiService.json('/api/export/browser');
      if (input) input.value = (info?.manualPath || '').trim();
      if (detectedLabel) detectedLabel.textContent = `系统自动识别：${info?.detectedPath || '未检测到'}`;
      if (effectiveLabel) effectiveLabel.textContent = `实际生效路径：${info?.effectivePath || '未就绪'}`;
      if (configPathLabel) configPathLabel.textContent = `配置文件：${info?.configPath || '未知'}`;
    } catch (e) {
      console.error('[导出设置] 加载配置失败:', e);
      if (detectedLabel) detectedLabel.textContent = '系统自动识别：加载失败';
      if (effectiveLabel) effectiveLabel.textContent = '实际生效路径：加载失败';
      if (configPathLabel) configPathLabel.textContent = '配置文件：加载失败';
    }
  }
}

