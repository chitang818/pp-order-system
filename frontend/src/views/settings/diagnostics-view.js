import { ApiService } from '../../api/api.js';
import { SelfDiagnosisManager } from '../../utils/self-diagnosis.js';
import { renderHTML, createElement, setTextContent } from '../../utils/dom-utils.js';

export class DiagnosticsView {
    constructor() {
        this.isBound = false;
        this.diagnosisManager = new SelfDiagnosisManager();
    }

    async render() {
        console.log('[Diagnostics] 正在渲染自检页面...');
        this.bindEvents();

        // 并行加载系统信息
        await Promise.all([
            this.loadSystemInfo(),
            this.loadHealth(),
            this.loadPaths()
        ]);
    }

    bindEvents() {
        if (this.isBound) return;

        // 运行自动诊断
        const btnRunTest = document.getElementById('btnRunAutoDiagnosis');
        if (btnRunTest) {
            btnRunTest.onclick = () => this.handleRunDiagnosis();
        }

        const btnExport = document.getElementById('btnExportDiagnostics');
        if (btnExport) {
            btnExport.onclick = () => this.handleExport();
        }

        const btnOpenLogs = document.getElementById('btnOpenLogsDir');
        if (btnOpenLogs) {
            btnOpenLogs.onclick = () => this.openDir('logs');
        }

        const btnOpenAppData = document.getElementById('btnOpenAppDataDir');
        if (btnOpenAppData) {
            btnOpenAppData.onclick = () => this.openDir('app_data');
        }

        // 帮助与支持
        const btnManual = document.getElementById('btnOpenManual');
        if (btnManual) {
            btnManual.onclick = () => this.handleOpenManual();
        }

        const btnContact = document.getElementById('btnContactSupport');
        if (btnContact) {
            btnContact.onclick = () => this.handleContactSupport();
        }

        const btnOpenLast = document.getElementById('btnOpenLastDiagnostics');
        if (btnOpenLast) {
            btnOpenLast.onclick = () => {
                const path = document.getElementById('diagLastExportPath')?.value;
                if (path) {
                    if (window.__TAURI__) {
                        window.__TAURI__.core.invoke('app_open_dir', { dir: path });
                    }
                }
            };
        }

        this.isBound = true;
    }

    async handleOpenManual() {
        // 尝试打开本地 PDF 或文档
        if (window.__TAURI__) {
            try {
                // 常见的文档路径：程序目录下 docs/01软件说明文档/PP外贸订单管理系统使用手册.md
                // 我们直接调用之前实现的 app_open_external，如果能解析路径的话
                // 或者调用 app_open_dir 到 docs 目录
                await window.__TAURI__.core.invoke('app_open_dir', { dir: 'docs' });
                window.NotificationSystem?.toast('已打开文档目录，请查看使用手册', 'success');
            } catch (e) {
                window.NotificationSystem?.toast('无法打开文档目录', 'error');
            }
        } else {
            window.NotificationSystem?.toast('请查看项目根目录下的 docs 文件夹', 'info');
        }
    }

    async handleContactSupport() {
        if (window.ModalDialog) {
            await window.ModalDialog.custom(`
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 48px; margin-bottom: 15px;">💬</div>
                    <h3 style="margin-bottom: 10px;">联系技术支持</h3>
                    <p style="color: #666; margin-bottom: 20px;">如果您在使用中遇到任何问题，请通过以下方式联系我们：</p>
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; text-align: left;">
                        <p style="margin-bottom: 8px;"><strong>QQ交流群：</strong> 185034202</p>
                        <p style="margin-bottom: 8px;"><strong>技术邮箱：</strong> 185034202@qq.com</p>
                        <p style="margin-bottom: 0;"><strong>在线时间：</strong> 周一至周五 09:00 - 18:00</p>
                    </div>
                </div>
            `, {
                title: '获取支持',
                confirmText: '复制QQ号',
                onConfirm: () => {
                    navigator.clipboard.writeText('185034202');
                    window.NotificationSystem?.toast('QQ号已复制到剪贴板', 'success');
                }
            });
        }
    }

    async handleRunDiagnosis() {
        this.resetResultsContainer();
        const btn = document.getElementById('btnRunAutoDiagnosis');
        if (!btn) return;

        await this.runTestManager(this.diagnosisManager, btn, '正在自检...');
    }

    resetResultsContainer() {
        const container = document.getElementById('diagnosisResults');
        if (container) {
            container.innerHTML = '';
            const statusDiv = createElement('div', { className: 'diag-status' }, '正在初始化程序...');
            container.appendChild(statusDiv);
        }
    }

    async runTestManager(manager, btn, loadingText) {
        const container = document.getElementById('diagnosisResults');
        if (!container || !btn) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = loadingText;

        // 清空容器
        container.innerHTML = '';

        await manager.runAll((test) => {
            // 更新 UI
            this.updateTestUI(container, test);
        });

        btn.disabled = false;
        btn.textContent = originalText;
    }

    updateTestUI(container, test) {
        let row = document.getElementById(`diag-test-${test.id}`);

        // 如果是新测试项，创建行
        if (!row) {
            row = createElement('div', {
                className: 'diag-result-row running',
                id: `diag-test-${test.id}`
            });

            const leftCol = createElement('div');
            const nameSpan = createElement('span', { className: 'diag-name' }, test.name);
            const stepsDiv = createElement('div', { className: 'diag-steps', id: `diag-steps-${test.id}` });

            leftCol.appendChild(nameSpan);
            leftCol.appendChild(stepsDiv);

            const statusSpan = createElement('span', { className: 'diag-status', id: `diag-status-${test.id}` });
            // 初始状态：正在运行
            statusSpan.innerHTML = '<span class="spinner"></span> 正在运行...';

            row.appendChild(leftCol);
            row.appendChild(statusSpan);
            container.appendChild(row);
        }

        // 处理不同状态
        if (test.status === 'running') {
            // 已经在创建时处理了
        } else if (test.status === 'step') {
            // 添加步骤日志
            const stepsContainer = document.getElementById(`diag-steps-${test.id}`);
            if (stepsContainer) {
                const stepItem = createElement('div', { className: 'diag-step-item' }, test.message);
                stepsContainer.appendChild(stepItem);
            }
        } else {
            // 完成状态 (success/error)
            row.className = `diag-result-row ${test.status}`;
            const statusSpan = document.getElementById(`diag-status-${test.id}`);
            if (statusSpan) {
                const icon = test.status === 'success' ? '✅' : '❌';
                statusSpan.innerHTML = ''; // 清除 spinner

                const messageSpan = createElement('span', { className: 'diag-message' }, `${icon} ${test.message}`);
                statusSpan.appendChild(messageSpan);
            }
        }
    }

    async loadSystemInfo() {
        try {
            const info = await ApiService.diagnostics.getInfo();
            const el = document.getElementById('diagAppInfoLabel');
            if (el) {
                el.textContent = `系统版本：${info.name} v${info.version}`;
            }

            const envEl = document.getElementById('fullEnvInfo');
            if (envEl) {
                setTextContent(envEl, JSON.stringify(info, null, 2));
            }
        } catch (e) {
            console.error('加载系统信息失败', e);
        }
    }

    async loadHealth() {
        try {
            const health = await ApiService.diagnostics.checkHealth();
            const el = document.getElementById('diagHealthLabel');
            if (el) {
                const status = health.success ? '正常运行' : '部分异常';
                const color = health.success ? '#27ae60' : '#e74c3c';
                el.innerHTML = `服务状态：<span style="color:${color}; font-weight:bold;">${status}</span>`;
            }
        } catch (e) {
            console.error('加载健康状态失败', e);
        }
    }

    async loadPaths() {
        try {
            const paths = await ApiService.diagnostics.getPaths();

            this.updatePathLabel('diagAppDataLabel', paths.app_data_dir, 'AppData');
            this.updatePathLabel('diagLogsLabel', paths.logs_dir, '日志目录');
            this.updatePathLabel('diagDbLabel', paths.db_path, '数据库');

            const envEl = document.getElementById('fullEnvInfo');
            if (envEl) {
                const currentFn = (() => {
                    try { return JSON.parse(envEl.textContent); } catch (e) { return {}; }
                })();
                const current = currentFn || {};
                setTextContent(envEl, JSON.stringify({ ...current, paths }, null, 2));
            }
        } catch (e) {
            console.error('加载路径失败', e);
        }
    }

    updatePathLabel(elementId, path, label) {
        const el = document.getElementById(elementId);
        if (el && el.parentElement) {
            const parent = el.parentElement;
            const iconFn = parent.querySelector('.settings-list-icon');
            const iconHtml = iconFn ? iconFn.outerHTML : '<span>📂</span>';

            renderHTML(parent, `${iconHtml}<span class="settings-list-text" title="${path}">${label}：${this.truncatePath(path)}</span>`);
        }
    }

    truncatePath(path) {
        if (!path) return '';
        if (path.length > 40) {
            return '...' + path.substring(path.length - 35);
        }
        return path;
    }

    async handleExport() {
        const btn = document.getElementById('btnExportDiagnostics');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '导出中...';
        }
        try {
            const result = await ApiService.diagnostics.exportLogs();
            if (result.success) {
                window.NotificationSystem?.toast('诊断包导出成功', 'success');
                const input = document.getElementById('diagLastExportPath');
                if (input) input.value = result.diagnostics_dir;
            } else {
                window.NotificationSystem?.toast('导出失败: ' + result.message, 'error');
            }
        } catch (e) {
            window.NotificationSystem?.toast('导出异常: ' + e.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span class="settings-btn-icon">📦</span> 导出诊断包';
            }
        }
    }

    async openDir(type) {
        try {
            // 优先使用 Tauri API 检查目录是否存在
            if (type === 'app_data' || type === 'logs') {
                const paths = await ApiService.diagnostics.getPaths();
                const target = type === 'logs' ? paths.logs_dir : paths.app_data_dir;

                // 使用 invoke 调用后端命令
                if (window.__TAURI__) {
                    window.__TAURI__.core.invoke('app_open_dir', { dir: target })
                        .catch((err) => {
                            console.warn('Open dir failed:', err);
                            window.NotificationSystem?.toast(`路径: ${target}`, 'info');
                        });
                } else {
                    console.log('非 Tauri 环境，无法打开目录:', target);
                    window.NotificationSystem?.toast(`路径: ${target}`, 'info');
                }
            } else {
                await ApiService.storage.open();
            }
        } catch (e) {
            console.error(e);
            window.NotificationSystem?.toast('打开目录失败', 'error');
        }
    }
}
