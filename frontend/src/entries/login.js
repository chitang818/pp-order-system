/**
 * Login Page Entry Script
 * Handles authentication logic with dual support for Tauri (Production/Dev) and Browser modes
 */

// Import utilities
import { isRealTauriEnvironment, getTauriInvoke as getTauriInvokeUtil } from '../utils/tauri-env.js';

// Import Tauri API for production (Vite will bundle this)
// Note: This import may succeed in browser mode but won't be functional
import { invoke } from '@tauri-apps/api/core';

// API Base URL (fallback for browser mode)
const API_BASE_URL = 'http://127.0.0.1:3000';

// Helper to get Tauri invoke function with fallback
const getTauriInvoke = () => {
    // First check if we're in a real Tauri environment
    if (!isRealTauriEnvironment()) {
        console.log('[Login] Not in real Tauri environment (browser mode)');
        return null;
    }
    
    // Try to get invoke from utility first
    const invokeFromUtil = getTauriInvokeUtil();
    if (invokeFromUtil) {
        return invokeFromUtil;
    }
    
    // Fallback: Try imported module (Production Tauri 2.0)
    if (typeof invoke === 'function') {
        return invoke;
    }
    
    return null;
};

// UI Helpers
const showAlert = (message, type = 'error') => {
    const alertBox = document.getElementById('alert');
    if (alertBox) {
        alertBox.textContent = message;
        alertBox.className = 'alert ' + type + ' show';
        if (type === 'success') {
            setTimeout(() => alertBox.classList.remove('show'), 3000);
        }
    }
};

const hideAlert = () => {
    const alertBox = document.getElementById('alert');
    if (alertBox) alertBox.classList.remove('show');
};

const setLoading = (loading) => {
    const loginButton = document.getElementById('loginButton');
    if (!loginButton) return;
    if (loading) {
        loginButton.disabled = true;
        loginButton.innerHTML = '<span class="loading-spinner"></span>登录中...';
    } else {
        loginButton.disabled = false;
        loginButton.innerHTML = '登录';
    }
};

// Main Login Logic
const handleLogin = async (e) => {
    e.preventDefault();
    hideAlert();

    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('rememberMe');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

    if (!username) {
        showAlert('请输入用户名');
        usernameInput?.focus();
        return;
    }

    if (!password) {
        showAlert('请输入密码');
        passwordInput?.focus();
        return;
    }

    setLoading(true);

    // 用于捕获 Tauri 调用过程中的原始错误
    let tauriError = null;

    try {
        // Try Tauri Login first
        const tauriInvoke = getTauriInvoke();
        if (tauriInvoke) {
            console.log('[Login] Attempting Tauri login...');
            try {
                const result = await tauriInvoke('auth_login', { payload: { username, password } });
                if (result && result.success) {
                    // result.data 已经包含 { token, user, ... }
                    processLoginSuccess(result.data, username, password, rememberMe);
                    return;
                } else {
                    throw new Error(result.message || '登录失败');
                }
            } catch (err) {
                tauriError = err;
                console.error('[Login] Tauri login failed, preparing fallback:', err);
                // 记录错误但不立即抛出，继续尝试 HTTP
            }
        } else {
            console.log('[Login] Not in Tauri environment, using HTTP...');
        }

        // Fallback to HTTP
        // 如果 Tauri 登录成功会在上面 return，能走到这就说明没有 Tauri 环境或 Tauri 登录失败
        await performHttpLogin(username, password, rememberMe);

    } catch (err) {
        console.error('[Login] Fatal error:', err);
        let errorMsg = err.message || String(err);

        // 如果之前捕获了 Tauri 错误，将其附加到显示信息中，这对调试非常关键
        if (tauriError) {
            let tauriErrStr = '';
            try {
                tauriErrStr = typeof tauriError === 'object' ? JSON.stringify(tauriError) : String(tauriError);
            } catch (e) {
                tauriErrStr = String(tauriError);
            }
            errorMsg += `\n\n[Tauri Error]: ${tauriErrStr}`;
        }

        let errorDetail = '';
        try {
            errorDetail = JSON.stringify(err);
        } catch (e) { }

        // 构建综合错误报告
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
            showAlert('无法连接到服务器 (HTTP fallback failed)\n\n错误详情: ' + errorMsg);
        } else {
            showAlert('登录失败: ' + errorMsg + '\n\n详细信息: ' + errorDetail);
        }
        setLoading(false);
    }
};

// HTTP Login Fallback
async function performHttpLogin(username, password, rememberMe) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
        credentials: 'include' // 重要：携带 cookie
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (result.success) {
        // result.data 包含 { token, user, csrfToken, expiresAt }
        // 传递完整的 result.data，包含 token
        processLoginSuccess(result.data, username, password, rememberMe);
    } else {
        throw new Error(result.message || '登录失败');
    }
}

// Success Handler
function processLoginSuccess(loginData, username, password, rememberMe) {
    try {
        // loginData 可能是：
        // 1. { token, user, csrfToken, expiresAt } (完整登录数据)
        // 2. { token, id, username, ... } (直接的用户数据，兼容旧格式)
        
        const token = loginData.token;
        const user = loginData.user || loginData; // 如果有 user 字段就用，否则整个对象就是用户数据
        
        // 保存 token
        localStorage.setItem('token', token);
        // 只保存用户信息（不包含 token）
        localStorage.setItem('user', JSON.stringify(user));

        if (rememberMe) {
            const savedUsername = btoa(encodeURIComponent(username));
            const savedPassword = btoa(encodeURIComponent(password));
            localStorage.setItem('rememberedUsername', savedUsername);
            localStorage.setItem('rememberedPassword', savedPassword);
            localStorage.setItem('rememberMe', 'true');
        } else {
            localStorage.removeItem('rememberedUsername');
            localStorage.removeItem('rememberedPassword');
            localStorage.removeItem('rememberMe');
        }
    } catch (e) {
        console.error('保存登录信息失败:', e);
    }

    showAlert('登录成功，正在跳转...', 'success');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 500);
}

// 显示登录界面（隐藏启动遮罩）
const showLoginUI = () => {
    const overlay = document.getElementById('startup-overlay');
    const loginContainer = document.querySelector('.login-container');
    
    if (overlay) {
        overlay.classList.add('hidden');
        // 动画结束后移除元素
        setTimeout(() => overlay.remove(), 300);
    }
    if (loginContainer) {
        loginContainer.style.opacity = '1';
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // --- 启动检测逻辑（优先级最高，快速执行）---
    const tauriInvoke = getTauriInvoke();
    
    if (tauriInvoke) {
        try {
            // 1. 首先快速检测是否为首次运行（不等待数据库连接）
            console.log('[Login] 快速检测首次运行状态...');
            const isFirstRun = await tauriInvoke('check_first_run');
            
            if (isFirstRun) {
                // 首次运行，立即跳转到设置向导（无延迟）
                console.log('[Login] 首次运行，跳转到设置向导');
                window.location.replace('setup-wizard.html');
                return; // 停止后续逻辑
            }
            
            console.log('[Login] 非首次运行，显示登录界面');
            
            // 2. 非首次运行，显示登录界面
            showLoginUI();
            
            // 3. 异步初始化数据库连接（不阻塞UI）
            const dbBadge = document.getElementById('db-connection-badge');
            const dbPathText = document.getElementById('db-path-text');
            
            // 获取数据库信息
            tauriInvoke('db_get_connection_info')
                .then(info => {
                    if (dbPathText) dbPathText.textContent = info.path || '未设置路径';
                    if (dbBadge) {
                        dbBadge.textContent = '正在连接...';
                        dbBadge.style.background = '#e2e8f0';
                        dbBadge.style.color = '#64748b';
                    }
                    return tauriInvoke('db_init_connection');
                })
                .then(path => {
                    if (dbBadge) {
                        dbBadge.textContent = '已连接';
                        dbBadge.style.background = '#dcfce7';
                        dbBadge.style.color = '#166534';
                    }
                    if (path && dbPathText) dbPathText.textContent = path;
                })
                .catch(err => {
                    console.error('[Login] Database connection failed:', err);
                    if (dbBadge) {
                        dbBadge.textContent = '连接失败';
                        dbBadge.style.background = '#fee2e2';
                        dbBadge.style.color = '#991b1b';
                    }
                });
                
        } catch (err) {
            console.error('[Login] Startup check failed:', err);
            // 检测失败也显示登录界面，让用户可以尝试操作
            showLoginUI();
            showAlert('启动检测失败: ' + (err.message || err));
        }
    } else {
        // 浏览器开发模式：直接显示登录界面
        console.log('[Login] 浏览器模式，直接显示登录界面');
        showLoginUI();
        
        // 隐藏数据库状态
        const dbStatus = document.getElementById('db-status-container');
        if (dbStatus) dbStatus.style.display = 'none';
    }

    // Restore remembered credentials
    try {
        if (localStorage.getItem('rememberMe') === 'true') {
            const savedUsername = localStorage.getItem('rememberedUsername');
            const savedPassword = localStorage.getItem('rememberedPassword');
            if (savedUsername && savedPassword) {
                const usernameInput = document.getElementById('username');
                const passwordInput = document.getElementById('password');
                const rememberMeCheckbox = document.getElementById('rememberMe');

                if (usernameInput) usernameInput.value = decodeURIComponent(atob(savedUsername));
                if (passwordInput) passwordInput.value = decodeURIComponent(atob(savedPassword));
                if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
            }
        }
    } catch (e) {
        console.error('恢复凭证失败:', e);
    }
});
