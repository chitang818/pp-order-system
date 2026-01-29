/**
 * Tauri API 统一调用工具
 * 封装 invoke 调用，统一处理错误和日志
 */

import { isRealTauriEnvironment, getTauriInvokeAsync } from './tauri-env.js';

// 缓存 Tauri API 模块
let tauriCore = null;

/**
 * 获取 Tauri Core 模块
 */
async function getTauriCore() {
    if (tauriCore) return tauriCore;

    // 首先检查是否在真正的 Tauri 环境中
    if (!isRealTauriEnvironment()) {
        console.log('[Tauri API] Not in Tauri environment');
        return null;
    }

    if (window.__TAURI__ && window.__TAURI__.core) {
        tauriCore = window.__TAURI__.core;
        return tauriCore;
    }

    // 尝试动态导入（适配某些打包配置）
    try {
        const module = await import('@tauri-apps/api/core');
        tauriCore = module;
        return module;
    } catch (e) {
        console.warn('[Tauri API] Failed to load @tauri-apps/api/core', e);
        return null;
    }
}

/**
 * 调用 Rust Command
 * @param {string} command 命令名称
 * @param {Object} params 参数
 * @returns {Promise<any>}
 */
export async function invokeCommand(command, params = {}) {
    // 1. 环境检查
    if (!isRealTauriEnvironment()) {
        console.warn(`[Tauri API] Ignored command '${command}': Not in Tauri environment`);
        throw new Error('Not in Tauri environment');
    }

    try {
        const core = await getTauriCore();
        if (!core) {
            throw new Error('Tauri Core API not available');
        }

        // 2. 特殊处理 auth_login 命令 - 需要将参数包装在 payload 对象中
        let finalParams = { ...params };
        if (command === 'auth_login') {
            // Tauri 2.0 需要将登录参数包装在 payload 对象中
            finalParams = { payload: params };
        }

        // 3. 记录性能日志
        const startTime = performance.now();

        // 4. 执行调用
        const result = await core.invoke(command, finalParams);

        const duration = (performance.now() - startTime).toFixed(2);
        if (duration > 100) {
            console.log(`[Tauri API] ${command} took ${duration}ms`);
        }

        return result;
    } catch (error) {
        console.error(`[Tauri API] Command '${command}' failed:`, error);
        // 统一错误格式转换（如果需要）
        throw error;
    }
}

/**
 * 检查是否在 Tauri 环境中
 */
export function isTauri() {
    return isRealTauriEnvironment();
}
