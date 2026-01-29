/**
 * Tauri API Global Initialization
 * This script makes Tauri API available as window.__TAURI__ in all pages
 * including standalone HTML pages like login.html
 * 
 * IMPORTANT: Only initialize in real Tauri environment, not in browser dev mode
 */

/**
 * 检测是否在真正的 Tauri 环境中
 * 不仅要检查 window.__TAURI__ 存在，还要检查底层支持是否可用
 */
function isRealTauriEnvironment() {
    if (typeof window === 'undefined') return false;

    // 检查是否有 Tauri 内部结构（只有在真正的 Tauri 应用中才存在）
    if (window.__TAURI_INTERNALS__ || window.__TAURI_METADATA__) {
        return true;
    }

    // 检查协议（只有在 Tauri 打包后的应用中才是这些协议）
    const protocol = String(window.location?.protocol || '').toLowerCase();
    if (protocol === 'tauri:') {
        return true;
    }

    return false;
}

// Only initialize in real Tauri environment
if (typeof window !== 'undefined' && isRealTauriEnvironment()) {
    // Import Tauri API from npm package for production
    import('@tauri-apps/api/core').then(({ invoke }) => {
        // Create global __TAURI__ object if it doesn't exist
        if (!window.__TAURI__) {
            window.__TAURI__ = {};
        }

        if (!window.__TAURI__.core) {
            window.__TAURI__.core = {};
        }

        // Inject invoke function safely
        try {
            if (typeof window.__TAURI__.core.invoke === 'undefined') {
                window.__TAURI__.core.invoke = invoke;
            } else if (import.meta.env.DEV) {
                console.log('[Tauri Init] invoke already exists, skipping assignment');
            }
        } catch (e) {
            if (import.meta.env.DEV) {
                console.warn('[Tauri Init] Failed to assign invoke (it might be read-only):', e);
            }
        }

        // Log for debugging (only in development)
        if (import.meta.env.DEV) {
            console.log('[Tauri Init] Global API initialization complete');
        }
    }).catch(err => {
        if (import.meta.env.DEV) {
            console.warn('[Tauri Init] Failed to load Tauri API:', err);
        }
    });
} else {
    // In browser dev mode, log that we're skipping Tauri initialization
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
        console.log('[Tauri Init] Skipping initialization - not in real Tauri environment');
    }
}

export default typeof window !== 'undefined' ? window.__TAURI__ : undefined;
