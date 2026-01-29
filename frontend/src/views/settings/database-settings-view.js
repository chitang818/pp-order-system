/**
 * 数据库设置视图
 * 处理数据库备份、导入、初始化、存储路径等操作
 */
import { timerManager } from '../../utils/timer-manager.js';
import { clearAuth } from '../../utils/auth.js';
import { call, isTauriAvailable } from '../../core/ipc-client.js';

export class DatabaseSettingsView {
  constructor(apiService) {
    this.apiService = apiService || window.ApiService;
    this._lastDiagnosticsDir = '';
  }

  /**
   * 渲染数据库设置页面
   */
  async render() {
    console.log('[数据库设置] 开始渲染');

    // 1. 先绑定按钮，确保用户交互立即可用
    this.bindButtons();

    // 2. 并行执行数据加载
    const initTasks = [
      this.initStoragePath().catch(e => console.warn('[数据库设置] 加载存储路径失败:', e)),
      this.initBackupConfig().catch(e => console.warn('[数据库设置] 加载备份配置失败:', e))
    ];

    Promise.allSettled(initTasks).then(() => {
      console.log('[数据库设置] 所有初始化任务完成');
    });
  }

  /**
   * 初始化存储路径显示
   */
  async initStoragePath() {
    const storageInput = document.getElementById("storagePathInput");
    const envLabel = document.getElementById('envLabel');

    try {
      const info = await this.apiService.storage.get();

      if (storageInput) {
        storageInput.value = info && info.dbPath ? info.dbPath : '';
        console.log('[数据库设置] 已加载数据库路径:', info && info.dbPath ? info.dbPath : '未设置');
      }

      // 更新运行环境显示
      if (envLabel) {
        if (info && info.environment) {
          envLabel.textContent = `运行环境：${info.environment}`;
          console.log('[数据库设置] 已更新运行环境显示:', info.environment);
        } else {
          envLabel.textContent = '运行环境：未知';
        }
      }
    } catch (e) {
      console.error('[数据库设置] 加载数据库路径失败:', e);
      if (envLabel) {
        envLabel.textContent = '运行环境：未知';
      }
    }
  }

  /**
   * 初始化自动备份配置
   */
  async initBackupConfig() {
    const isTauri = await isTauriAvailable();
    if (!isTauri) return;

    try {
      const config = await call('db_get_backup_config');
      console.log('[数据库设置] 加载备份配置:', config);

      const enabledToggle = document.getElementById('autoBackupEnabled');
      const pathInput = document.getElementById('autoBackupPathInput');
      const intervalSelect = document.getElementById('autoBackupIntervalSelect');
      const configArea = document.getElementById('autoBackupConfigArea');

      if (enabledToggle) {
        enabledToggle.checked = !!config.enabled;
        if (configArea) {
          configArea.style.display = config.enabled ? 'block' : 'none';
        }
      }

      if (pathInput) {
        // 如果没有配置路径，默认使用 D 盘（保存时会验证是否存在）
        pathInput.value = config.path || 'D:\\PP订单管理系统数据备份\\';
      }

      if (intervalSelect) {
        intervalSelect.value = String(config.interval_hours || 24);
      }
    } catch (e) {
      console.error('[数据库设置] 加载备份配置失败:', e);
    }
  }

  /**
   * 绑定所有按钮事件
   */
  bindButtons() {
    console.log('[数据库设置] 初始化按钮事件');

    this.bindBackupButton();
    this.bindImportButton();
    this.bindResetSystemButton();
    this.bindOpenStorageButton();
    this.bindBackupSettingsButtons();
  }

  /**
   * 绑定备份设置相关按钮
   */
  bindBackupSettingsButtons() {
    const enabledToggle = document.getElementById('autoBackupEnabled');
    const configArea = document.getElementById('autoBackupConfigArea');
    const btnSelectPath = document.getElementById('btnSelectBackupPath');
    const btnSaveConfig = document.getElementById('btnSaveBackupConfig');
    const pathInput = document.getElementById('autoBackupPathInput');
    const intervalSelect = document.getElementById('autoBackupIntervalSelect');

    if (enabledToggle && configArea) {
      enabledToggle.onchange = async () => {
        if (enabledToggle.checked) {
          // 启用时，先验证当前路径是否有效
          const currentPath = pathInput?.value?.trim() || 'D:\\PP订单管理系统数据备份\\';
          
          try {
            await call('db_validate_backup_path', { path: currentPath });
            // 路径有效，显示配置区域
            configArea.style.display = 'block';
            if (pathInput && !pathInput.value) {
              pathInput.value = currentPath;
            }
          } catch (e) {
            // 路径无效，提示用户选择其他路径
            const errorMsg = String(e).replace(/^Error:\s*/i, '');
            window.NotificationSystem?.toast(errorMsg + '，请选择备份目录', 'warning', 5000);
            
            // 显示配置区域并自动打开目录选择对话框
            configArea.style.display = 'block';
            if (pathInput) {
              pathInput.value = ''; // 清空无效路径
            }
            
            // 自动触发选择目录
            setTimeout(() => {
              btnSelectPath?.click();
            }, 300);
          }
        } else {
          configArea.style.display = 'none';
        }
      };
    }

    if (btnSelectPath) {
      btnSelectPath.onclick = async () => {
        try {
          const dialog = await import('@tauri-apps/plugin-dialog');
          const selected = await dialog.open({
            directory: true,
            multiple: false,
            title: '选择备份存放目录'
          });
          if (selected && pathInput) {
            pathInput.value = selected + (selected.endsWith('\\') || selected.endsWith('/') ? '' : '\\');
          }
        } catch (e) {
          console.error('[数据库设置] 选择目录失败:', e);
        }
      };
    }

    if (btnSaveConfig) {
      btnSaveConfig.onclick = async () => {
        const originalText = btnSaveConfig.innerHTML;
        btnSaveConfig.disabled = true;
        btnSaveConfig.innerHTML = '<span class="settings-btn-icon">⏳</span>保存中...';

        try {
          const config = {
            enabled: !!enabledToggle?.checked,
            path: pathInput?.value?.trim() || '',
            interval_hours: parseInt(intervalSelect?.value || '24'),
            last_backup_time: 0 // 后端会自行管理或保留
          };

          if (config.enabled && !config.path) {
            window.NotificationSystem?.toast('启用自动备份时必须设置存放路径', 'warning');
            return;
          }

          await call('db_save_backup_config', { config });
          window.NotificationSystem?.toast('备份设置保存成功', 'success');
        } catch (e) {
          console.error('[数据库设置] 保存备份设置失败:', e);
          window.NotificationSystem?.toast('保存失败：' + String(e), 'error');
        } finally {
          btnSaveConfig.disabled = false;
          btnSaveConfig.innerHTML = originalText;
        }
      };
    }
  }

  /**
   * 绑定备份按钮
   */
  bindBackupButton() {
    const btnDbBackup = document.getElementById("btnDbBackup");
    if (!btnDbBackup) return;

    // 移除旧的事件监听器
    const newBtn = btnDbBackup.cloneNode(true);
    btnDbBackup.parentNode.replaceChild(newBtn, btnDbBackup);

    newBtn.onclick = async () => {
      // 显示加载状态
      const originalText = newBtn.innerHTML;
      newBtn.disabled = true;
      newBtn.innerHTML = '<span class="settings-btn-icon">⏳</span>备份中...';

      try {
        console.log('[数据库设置] 开始备份数据库');

        // 桌面端（Tauri）：优先走 Rust command
        try {
          const isTauri = await isTauriAvailable();
          if (isTauri) {
            // 询问是备份到默认目录还是选择新位置
            const useDefault = await window.ModalDialog.confirm(
              '是否备份到已设置的备份目录？\n\n点击"确定"立即执行自动备份任务，点击"取消"选择其他位置另存。',
              { title: '备份方式选择', confirmText: '到备份目录', cancelText: '选择位置...' }
            );

            if (useDefault) {
              const res = await call('db_perform_backup_now');
              window.NotificationSystem?.toast(`数据库备份成功！\n文件：${res}`, 'success', 5000);
              return;
            } else {
              // 原有的另存为逻辑
              const dialog = await import('@tauri-apps/plugin-dialog');
              if (typeof dialog.save === 'function') {
                const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const destPath = await dialog.save({
                  defaultPath: `erp-db-backup-${ts}.sqlite`,
                  filters: [{ name: 'SQLite数据库文件', extensions: ['sqlite'] }]
                });

                if (!destPath) {
                  window.NotificationSystem?.toast('已取消备份', 'info', 2000);
                  return;
                }

                const res = await call('db_backup', { destPath });
                window.NotificationSystem?.toast(`数据库备份成功！\n文件：${res?.destPath || destPath}`, 'success', 5000);
                return;
              }
            }
          }
        } catch (e) {
          console.log('[数据库设置] Rust 备份不可用，回退到旧接口:', e);
        }

        // 先获取统计信息
        let stats = null;
        try {
          const statsRes = await this.apiService.json('/api/storage/stats');
          if (statsRes && statsRes.success && statsRes.stats) {
            stats = statsRes.stats;
          }
        } catch (e) {
          console.warn('[数据库设置] 获取统计信息失败:', e);
        }

        // 直接使用 fetch 获取 blob（备份接口返回的是文件流，不是 JSON）
        // 使用 ApiService.json 的配置来确保包含 CSRF token 和认证信息
        const token = localStorage.getItem('token') || '';
        const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';

        const backupRes = await fetch('/api/db/backup', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
          }
        });

        if (!backupRes.ok) {
          const errorText = await backupRes.text();
          let errorMsg = '服务器返回错误状态';
          try {
            const errorObj = JSON.parse(errorText);
            errorMsg = errorObj.message || errorObj.error || errorMsg;
          } catch (e) {
            errorMsg = errorText || errorMsg;
          }
          throw new Error(errorMsg);
        }

        const blob = await backupRes.blob();
        const fileSize = blob.size;
        const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
        const backupSize = backupRes.headers.get('X-Backup-Size');
        const backupTimestamp = backupRes.headers.get('X-Backup-Timestamp');

        // 尝试使用 Tauri 文件保存对话框（如果可用）
        try {
          const { saveFile } = await import('../../utils/file-save-helper.js');
          const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const savedPath = await saveFile(blob, `erp-db-backup-${ts}.sqlite`, 'SQLite数据库文件');

          if (savedPath) {
            window.NotificationSystem?.toast(`数据库备份成功！\n文件已保存到：${savedPath}\n大小：${fileSizeMB} MB`, 'success', 5000);
            return;
          }
          // 如果用户取消了保存对话框，回退到浏览器下载
        } catch (e) {
          console.log('[数据库设置] Tauri 文件保存不可用，使用浏览器下载:', e);
        }

        // 回退到浏览器下载
        const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `erp-db-backup-${ts}.sqlite`;
        a.click();
        URL.revokeObjectURL(a.href);

        // 构建成功消息
        let successMsg = `数据库备份已下载 (${fileSizeMB} MB)`;
        if (stats) {
          successMsg += `\n包含 ${stats.totalRecords} 条记录`;
        }

        window.NotificationSystem?.toast(successMsg, 'success', 3000);
        console.log('[数据库设置] 数据库备份成功，文件大小:', fileSizeMB, 'MB');
      } catch (e) {
        console.error('[数据库设置] 备份失败:', e);
        window.NotificationSystem?.toast('下载备份失败：' + String(e), 'error', 4000);
      } finally {
        // 恢复按钮状态
        newBtn.disabled = false;
        newBtn.innerHTML = originalText;
      }
    };

    console.log('[数据库设置] 备份按钮事件已绑定');
  }

  /**
   * 绑定导入按钮
   */
  bindImportButton() {
    const btnDbImport = document.getElementById("btnDbImport");
    if (!btnDbImport) return;

    const newBtn = btnDbImport.cloneNode(true);
    btnDbImport.parentNode.replaceChild(newBtn, btnDbImport);

    newBtn.onclick = async () => {
      console.log('[数据库设置] 开始导入数据库');

      try {
        // 检查 Tauri 环境
        const isTauri = await isTauriAvailable();
        if (!isTauri) {
          window.NotificationSystem?.toast(
            '数据库导入功能仅在桌面版（Tauri）中可用',
            'warning',
            3000
          );
          return;
        }

        // 使用 Tauri 文件选择器
        const dialog = await import('@tauri-apps/plugin-dialog');
        if (typeof dialog.open !== 'function') {
          throw new Error('Tauri 文件选择器不可用');
        }

        const filePath = await dialog.open({
          multiple: false,
          filters: [{ name: 'SQLite数据库文件', extensions: ['sqlite'] }]
        });

        if (!filePath) {
          window.NotificationSystem?.toast('导入操作已取消', 'info', 2000);
          return;
        }

        // 获取文件大小信息
        let fileSizeInfo = '';
        let estimatedTime = '';
        try {
          const fs = await import('@tauri-apps/plugin-fs');
          const stat = await fs.stat(filePath);
          if (stat && stat.size) {
            const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
            fileSizeInfo = `\n文件大小：${sizeMB} MB`;
            
            // 大文件时显示预估时间提示
            if (stat.size > 50 * 1024 * 1024) { // > 50MB
              estimatedTime = '\n\n⏱️ 由于文件较大，导入过程可能需要 1-2 分钟，请耐心等待。';
            } else if (stat.size > 10 * 1024 * 1024) { // > 10MB
              estimatedTime = '\n\n⏱️ 预计导入时间：约 10-30 秒。';
            }
          }
        } catch (fsErr) {
          console.warn('[数据库设置] 获取文件大小失败:', fsErr);
        }

        // 确认导入
        const confirmed = await ModalDialog.confirm(
          `确定要导入数据库吗？\n\n文件：${filePath}${fileSizeInfo}\n\n⚠️ 警告：此操作将覆盖当前所有数据，且不可恢复！\n\n建议：导入前请先备份当前数据库。${estimatedTime}`,
          {
            title: '确认导入数据库',
            icon: '⚠️',
            confirmText: '确定导入',
            cancelText: '取消',
            width: '520px'
          }
        );

        if (!confirmed) {
          window.NotificationSystem?.toast('导入操作已取消', 'info', 2000);
          return;
        }

        // 询问是否自动备份
        const autoBackup = await ModalDialog.confirm(
          '是否在导入前自动备份当前数据库？\n\n强烈建议选择"是"，以便在导入失败时可以恢复数据。',
          {
            title: '自动备份',
            icon: '💾',
            confirmText: '是，自动备份',
            cancelText: '否，跳过备份',
            width: '450px'
          }
        );

        // 显示加载提示（根据文件大小调整提示信息）
        let loadingMsg = '正在导入数据库，请稍候...\n这可能需要一些时间，请勿关闭应用。';
        if (estimatedTime) {
          loadingMsg = `正在导入数据库（${fileSizeInfo.replace('\n文件大小：', '')}）...\n\n请耐心等待，过程中请勿关闭应用。`;
        }
        const loading = ModalDialog.loading(loadingMsg);

        try {
          // 调用 Rust 后端的 db_prepare_restore 命令
          const resp = await call('db_prepare_restore', {
            sourcePath: filePath,
            autoBackup: autoBackup !== false
          });

          loading.close();

          if (resp?.success) {
            // 清除前端缓存和服务状态
            if (window.CacheService) {
              try { window.CacheService.customers.clear(); } catch (e) { }
              try { window.CacheService.orders.clear(); } catch (e) { }
              try { window.CacheService.company.clear(); } catch (e) { }
            }
            
            // 清除 localStorage
            try {
              const keysToRemove = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('dashboard_cache_') || key === 'token' || key === 'user')) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach(key => localStorage.removeItem(key));
            } catch (e) { }

            clearAuth();

            await ModalDialog.alert(
              `数据库环境已准备就绪。\n\n系统现在将重启以完成最终的数据恢复。`,
              {
                title: '需要重启完成恢复',
                icon: '🔄',
                confirmText: '确定，立即重启'
              }
            );

            // 调用重启命令
            try {
              await call('app_restart');
            } catch (restartErr) {
              console.error('[数据库设置] 自动重启失败:', restartErr);
              await ModalDialog.alert(
                '无法自动重启应用。\n\n请手动关闭并重新打开应用以完成恢复过程。',
                {
                  title: '请手动重启',
                  icon: '⚠️',
                  confirmText: '知道了'
                }
              );
            }
            return;
          }

          // 如果返回不成功但没抛异常
          throw new Error(resp?.message || '准备恢复环境失败');

        } catch (e) {
          loading.close();
          console.error('[数据库设置] 导入准备失败:', e);

          // 格式化错误消息
          let errorMsg = e.message || String(e);
          if (errorMsg.includes('空间不足')) {
            errorMsg = '磁盘空间不足\n\n请清理磁盘空间后重试。至少需要 2 倍备份文件大小的空闲空间。';
          } else if (errorMsg.includes('权限')) {
            errorMsg = '权限不足\n\n请确保对文件和数据库目录有读写权限。';
          } else if (errorMsg.includes('不存在')) {
            errorMsg = '文件未找到\n\n请确认文件路径正确且文件存在。';
          }

          await ModalDialog.alert(
            `数据库恢复准备失败\n\n错误信息：${errorMsg}`,
            {
              title: '准备失败',
              icon: '❌',
              confirmText: '知道了'
            }
          );
        }

      } catch (e) {
        console.error('[数据库设置] 导入功能初始化失败:', e);
        window.NotificationSystem?.toast(
          `导入功能不可用：${e.message || String(e)}`,
          'error',
          4000
        );
      }
    };

    console.log('[数据库设置] 导入按钮事件已绑定（Tauri 专用版本）');
  }

  /**
   * 绑定初始化系统按钮
   */
  bindResetSystemButton() {
    const btnResetSystem = document.getElementById("btnResetSystem");
    if (!btnResetSystem) return;

    const newBtn = btnResetSystem.cloneNode(true);
    btnResetSystem.parentNode.replaceChild(newBtn, btnResetSystem);

    newBtn.onclick = async () => {
      // 第一步：确认操作
      const ok = await window.ModalDialog.confirm(
        '此操作将清空所有订单、客户及公司设置等信息，且不可恢复！确定继续吗？',
        {
          title: '确认初始化系统',
          icon: '⚠️',
          confirmText: '确定继续',
          cancelText: '取消'
        }
      );

      if (!ok) {
        window.NotificationSystem?.toast('初始化操作已取消', 'info', 2000);
        return;
      }

      // 第二步：密码输入
      const pwd = await window.ModalDialog.prompt(
        '请输入系统初始化密码：',
        {
          title: '系统初始化密码验证',
          type: 'password',
          placeholder: '请输入密码',
          required: true
        }
      );

      if (!pwd) {
        window.NotificationSystem?.toast('初始化操作已取消', 'info', 2000);
        return;
      }

      // 显示加载对话框
      const loading = window.ModalDialog.loading('正在初始化系统，请稍候...');

      try {
        console.log('[数据库设置] 开始初始化系统');

        // 桌面端（Tauri）：优先走 Rust command（不依赖 /api/CSRF/端口）
        try {
          const isTauri = await isTauriAvailable();
          if (isTauri) {
            const resp = await call('db_reset', { password: pwd });
            loading.close();

            if (resp && resp.success) {
              // 检查是否需要重启（删除重建模式）
              if (resp.requireRestart) {
                await window.ModalDialog.alert(
                  '系统初始化请求已提交。\n\n为了完成初始化（删除并重建数据库），应用需要立即重启。\n\n重启后将显示首次运行设置界面。',
                  { title: '需要重启应用', icon: '🔄', confirmText: '确定，立即重启' }
                );
                
                // 清除所有缓存服务
                if (window.CacheService) {
                  try { window.CacheService.customers.clear(); } catch (e) { }
                  try { window.CacheService.orders.clear(); } catch (e) { }
                  try { window.CacheService.company.clear(); } catch (e) { }
                }
                
                // 清除所有 localStorage 中的 dashboard 缓存
                try {
                  const keysToRemove = [];
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('dashboard_cache_')) {
                      keysToRemove.push(key);
                    }
                  }
                  keysToRemove.forEach(key => localStorage.removeItem(key));
                  console.log('[数据库设置] 已清除所有 dashboard 缓存:', keysToRemove.length, '项');
                } catch (e) {
                  console.warn('[数据库设置] 清除 dashboard 缓存失败:', e);
              }

              // 清除所有 localStorage 中的 dashboard 缓存
              try {
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key && key.startsWith('dashboard_cache_')) {
                    keysToRemove.push(key);
                  }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
                console.log('[数据库设置] 已清除所有 dashboard 缓存:', keysToRemove.length, '项');
              } catch (e) {
                console.warn('[数据库设置] 清除 dashboard 缓存失败:', e);
              }

              // 清除"记住我"的凭证
              localStorage.removeItem('rememberMe');
                localStorage.removeItem('rememberedUsername');
                localStorage.removeItem('rememberedPassword');
                
                // 清除认证信息
                clearAuth();
                
                try { await call('app_restart'); } catch (restartErr) {
                  console.error('[数据库设置] 自动重启失败:', restartErr);
                  await window.ModalDialog.alert('无法自动重启应用。\n\n请手动关闭并重新打开应用以完成初始化。',
                    { title: '请手动重启', icon: '⚠️', confirmText: '知道了' });
                }
                return;
              }
              // 清除所有缓存服务
              if (window.CacheService) {
                try { window.CacheService.customers.clear(); } catch (e) { }
                try { window.CacheService.orders.clear(); } catch (e) { }
                try { window.CacheService.company.clear(); } catch (e) { }
                console.log('[数据库设置] 已清除所有缓存');
              }

              // 清除“记住我”的凭证
              localStorage.removeItem('rememberMe');
              localStorage.removeItem('rememberedUsername');
              localStorage.removeItem('rememberedPassword');

              // 清除认证信息并退出
              clearAuth();

              window.NotificationSystem?.toast('系统初始化完成，请重新登录', 'success');
              console.log('[数据库设置] 系统初始化成功，准备跳转登录页');

              timerManager.setTimeout(() => {
                window.location.href = 'login.html';
              }, 1500);
              return;
            } else {
              throw new Error(resp?.message || '初始化失败');
            }
          }
        } catch (e) {
          // Rust command 失败，回退到旧接口
          if (e.message && e.message.includes('密码验证失败')) {
            loading.close();
            window.NotificationSystem?.toast('❌ 密码错误，无法初始化系统，请重新输入正确的初始化密码', 'error', 4000);
            return;
          }
          console.log('[数据库设置] Rust 初始化不可用，回退到旧接口:', e);
        }

        // 回退到旧接口（非 Tauri 环境或 Rust command 失败）
        const resp = await this.apiService.json('/api/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });

        loading.close();

        if (resp && resp.ok) {
          // 清空所有缓存服务
          if (window.CacheService) {
            try { window.CacheService.customers.clear(); } catch (e) { }
            try { window.CacheService.orders.clear(); } catch (e) { }
            try { window.CacheService.company.clear(); } catch (e) { }
            console.log('[数据库设置] 已清除所有缓存');
          }

          // 清除“记住我”的凭证
          localStorage.removeItem('rememberMe');
          localStorage.removeItem('rememberedUsername');
          localStorage.removeItem('rememberedPassword');

          // 清除认证信息并退出
          clearAuth();

          window.NotificationSystem?.toast('系统初始化完成，请重新登录', 'success');
          console.log('[数据库设置] 系统初始化成功，准备跳转登录页');

          timerManager.setTimeout(() => {
            window.location.href = 'login.html';
          }, 1500);
        } else {
          console.error('[数据库设置] 初始化失败:', resp);
          let errorMsg = '初始化失败';

          if (resp && resp.error) {
            if (resp.error === 'FORBIDDEN' || resp.message === '密码验证失败' ||
              (resp.error && resp.error.includes('密码')) ||
              (resp.message && resp.message.includes('密码'))) {
              errorMsg = '❌ 密码错误，无法初始化系统，请重新输入正确的初始化密码';
            } else if ((resp.error && resp.error.includes('database')) ||
              (resp.message && resp.message.includes('数据库'))) {
              errorMsg = '❌ 初始化失败：数据库操作异常\n请稍后重试或联系管理员';
            } else {
              errorMsg = `❌ 初始化失败：${resp.message || resp.error || '未知错误'}`;
            }
          } else {
            errorMsg = '❌ 初始化失败：服务器响应异常\n请检查网络连接或稍后重试';
          }

          window.NotificationSystem?.toast(errorMsg, 'error', 4000);
        }
      } catch (e) {
        loading.close();
        console.error('[数据库设置] 初始化异常:', e);

        let errorMsg = '初始化失败';
        const errorStr = String(e);

        if (errorStr.includes('403') || errorStr.includes('FORBIDDEN') ||
          errorStr.includes('密码验证失败') || errorStr.includes('密码错误')) {
          errorMsg = '❌ 密码错误，无法初始化系统，请重新输入正确的初始化密码';
        } else if (errorStr.includes('fetch') || errorStr.includes('network')) {
          errorMsg = '❌ 初始化失败：网络连接异常\n请检查服务器是否正常运行';
        } else if (errorStr.includes('timeout')) {
          errorMsg = '❌ 初始化失败：请求超时\n请稍后重试';
        } else if (errorStr.includes('database') || errorStr.includes('数据库')) {
          errorMsg = '❌ 初始化失败：数据库操作异常\n请稍后重试或联系管理员';
        } else {
          const match = errorStr.match(/HTTP \d+: (.+)/);
          if (match && match[1]) {
            errorMsg = `❌ 初始化失败：${match[1]}`;
          } else {
            errorMsg = `❌ 初始化失败：${errorStr}`;
          }
        }

        window.NotificationSystem?.toast(errorMsg, 'error', 4000);
      }
    };

    console.log('[数据库设置] 初始化系统按钮事件已绑定');
  }

  /**
   * 绑定打开存储位置按钮
   */
  bindOpenStorageButton() {
    const btnOpenStorage = document.getElementById("btnOpenStorageLocation");
    if (!btnOpenStorage) return;

    const newBtn = btnOpenStorage.cloneNode(true);
    btnOpenStorage.parentNode.replaceChild(newBtn, btnOpenStorage);

    newBtn.onclick = async () => {
      try {
        // 桌面端（Tauri）：优先走 Rust command（不依赖 /api/CSRF/端口）
        try {
          const isTauri = await isTauriAvailable();
          if (isTauri) {
            await call('storage_open_dir');
            window.NotificationSystem?.toast('已在资源管理器打开位置', 'info');
            return;
          }
        } catch (e) {
          console.log('[数据库设置] Rust 打开位置不可用，回退到旧接口:', e);
        }

        // 使用 ApiService.json 确保包含 CSRF token 和认证信息
        const resp = await this.apiService.json('/api/storage/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (resp && resp.success) {
          window.NotificationSystem?.toast('已在资源管理器打开位置', 'info');
        } else {
          window.NotificationSystem?.toast('打开失败：' + (resp && resp.error ? resp.error : '未知错误'), 'error');
        }
      } catch (e) {
        console.error('[数据库设置] 打开位置失败:', e);
        const errorMsg = e.message || String(e);
        window.NotificationSystem?.toast('打开失败：' + errorMsg, 'error');
      }
    };

    console.log('[数据库设置] 打开位置按钮事件已绑定');
  }
}

