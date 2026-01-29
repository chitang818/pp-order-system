import { apiClient } from '../core/api-client.js';
import { isRealTauriEnvironment } from './tauri-env.js';

class BackendManager {
    constructor() {
        this.startPromise = null;
        this.isReady = false;
        this.silentMode = false; // 静默模式：后台启动时不显示提示
    }

    /**
     * 确保后端服务已启动
     * @param {Object} options - 启动选项
     * @param {boolean} options.silent - 是否静默启动（不显示提示）
     * @returns {Promise<boolean>}
     */
    async ensureBackend(options = {}) {
        const { silent = false } = options;
        this.silentMode = silent;

        // 在浏览器开发模式下，后端已经通过 npm run dev:backend 启动
        // 不需要通过 Tauri 命令启动
        if (!isRealTauriEnvironment()) {
            console.log('[BackendManager] 浏览器开发模式：跳过后端启动检查（后端应该已通过脚本启动）');
            this.isReady = true;
            return true;
        }

        // 如果已经就绪，直接返回
        if (this.isReady) {
            return true;
        }

        // 如果已经有启动任务在进行中，返回该任务
        if (this.startPromise) {
            return this.startPromise;
        }

        // 检查状态
        try {
            const isRunning = await this.checkStatus();
            if (isRunning) {
                console.log('[BackendManager] 后端服务已在运行');
                this.isReady = true;
                return true;
            }
        } catch (e) {
            console.warn('[BackendManager] 状态检查失败，尝试启动:', e);
        }

        // 启动后端
        console.log('[BackendManager] 后端未运行，正在启动...');
        
        // 只在非静默模式下显示启动提示
        if (!this.silentMode && window.NotificationSystem) {
            window.NotificationSystem.toast('正在启动导出服务，首次运行可能需要几秒钟...', 'info', 5000);
        }

        this.startPromise = (async () => {
            try {
                // 调用 Tauri 命令启动
                const result = await apiClient.invoke('start_backend');
                console.log('[BackendManager] 启动结果:', result);

                if (result) {
                    this.isReady = true;
                    // 只在非静默模式下显示成功提示
                    if (!this.silentMode && window.NotificationSystem) {
                        window.NotificationSystem.toast('导出服务已就绪', 'success', 2000);
                    }
                }
                return result;
            } catch (error) {
                console.error('[BackendManager] 启动失败:', error);
                // 启动失败时总是显示错误（即使是静默模式）
                // 但不在后台预启动时显示，只在用户主动触发时显示
                if (!this.silentMode && window.NotificationSystem) {
                    window.NotificationSystem.toast('导出服务启动失败: ' + error.message, 'error');
                }
                throw error;
            } finally {
                this.startPromise = null;
                this.silentMode = false;
            }
        })();

        return this.startPromise;
    }

    /**
     * 确保后端服务已启动（用户触发的操作，显示完整提示）
     * @returns {Promise<boolean>}
     */
    async ensureBackendWithNotification() {
        return this.ensureBackend({ silent: false });
    }

    async checkStatus() {
        try {
            const result = await apiClient.invoke('check_backend_status');
            if (result) {
                this.isReady = true;
            }
            return result;
        } catch (error) {
            console.warn('[BackendManager] 检查状态失败:', error);
            return false;
        }
    }
}

export const backendManager = new BackendManager();
