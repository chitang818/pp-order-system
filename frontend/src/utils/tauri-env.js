/**
 * Tauri 环境检测工具
 * 统一的 Tauri 环境检测逻辑，避免在纯浏览器模式下调用 Tauri API
 * 
 * @module utils/tauri-env
 */

/**
 * 检测是否在真正的 Tauri 环境中
 * 不仅要检查 window.__TAURI__ 存在，还要检查底层支持是否可用
 * 
 * 在以下情况下返回 true：
 * - Tauri 打包后的应用（desktop app）
 * - Tauri 开发模式（通过 cargo tauri dev 启动）
 * 
 * 在以下情况下返回 false：
 * - 纯浏览器访问（http://localhost:5173）
 * - Vite 开发服务器（npm run dev）
 * 
 * @returns {boolean} 是否在真正的 Tauri 环境中
 */
export function isRealTauriEnvironment() {
    if (typeof window === 'undefined') {
        return false;
    }

    // 检查是否有 Tauri 内部结构（只有在真正的 Tauri 应用中才存在）
    if (window.__TAURI_INTERNALS__ || window.__TAURI_METADATA__) {
        return true;
    }

    // 检查协议（只有在 Tauri 打包后的应用中才是这些协议）
    const protocol = String(window.location?.protocol || '').toLowerCase();
    if (protocol === 'tauri:') {
        return true;
    }

    // 在 Tauri 开发模式下，可能使用 http: 或 https: 协议
    // 但会有 __TAURI__ 全局对象，并且 invoke 方法可用
    if (window.__TAURI__?.core?.invoke && typeof window.__TAURI__.core.invoke === 'function') {
        // 进一步验证：尝试检查是否有 Tauri 特定的属性
        // 在纯浏览器模式下，__TAURI__ 对象可能被 polyfill，但不会有实际功能
        try {
            // 检查是否有 Tauri 特定的元数据
            if (window.__TAURI__.convertFileSrc || window.__TAURI__.transformCallback) {
                return true;
            }
        } catch (e) {
            // 忽略错误
        }
    }

    return false;
}

/**
 * 获取 Tauri invoke 函数（如果可用）
 * 只在真正的 Tauri 环境中返回 invoke 函数，否则返回 null
 * 
 * @returns {Function|null} Tauri invoke 函数或 null
 */
export function getTauriInvoke() {
    if (!isRealTauriEnvironment()) {
        return null;
    }

    // 尝试从全局对象获取
    if (window.__TAURI__?.core?.invoke) {
        return window.__TAURI__.core.invoke;
    }

    return null;
}

/**
 * 异步获取 Tauri invoke 函数（支持动态导入）
 * 
 * @returns {Promise<Function|null>} Tauri invoke 函数或 null
 */
export async function getTauriInvokeAsync() {
    if (!isRealTauriEnvironment()) {
        return null;
    }

    // 先尝试全局对象
    if (window.__TAURI__?.core?.invoke) {
        return window.__TAURI__.core.invoke;
    }

    // 尝试动态导入
    try {
        const core = await import('@tauri-apps/api/core');
        if (core?.invoke && typeof core.invoke === 'function') {
            return core.invoke;
        }
    } catch (e) {
        console.warn('[Tauri Env] 无法加载 @tauri-apps/api/core:', e);
    }

    return null;
}

/**
 * 获取当前运行模式的描述
 * @returns {string} 运行模式描述
 */
export function getEnvironmentMode() {
    if (isRealTauriEnvironment()) {
        const protocol = window.location?.protocol || '';
        if (protocol === 'tauri:') {
            return 'Tauri Desktop App (Production)';
        }
        return 'Tauri Development Mode';
    }
    return 'Web Browser Mode';
}

/**
 * 在控制台打印环境信息（调试用）
 */
export function logEnvironmentInfo() {
    const mode = getEnvironmentMode();
    const isTauri = isRealTauriEnvironment();
    
    console.log('%c[Environment Info]', 'color: #3b82f6; font-weight: bold;');
    console.log('  Mode:', mode);
    console.log('  Is Tauri:', isTauri);
    console.log('  Protocol:', window.location?.protocol);
    console.log('  Host:', window.location?.host);
    console.log('  __TAURI__:', !!window.__TAURI__);
    console.log('  __TAURI_INTERNALS__:', !!window.__TAURI_INTERNALS__);
    console.log('  __TAURI_METADATA__:', !!window.__TAURI_METADATA__);
}
