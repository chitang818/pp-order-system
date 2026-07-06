/**
 * 认证管理模块
 * ES6 模块化版本
 */

import { isTauriLikeEnvironment, getHttpApiBase } from './tauri-env.js';

/**
 * Tauri Command 调用辅助函数
 * @param {string} cmd - 命令名
 * @param {Object} payload - 参数
 * @returns {Promise<any|null>} 成功返回结果，失败返回 null
 */
async function invokeIfTauri(cmd, payload) {
  try {
    const core = await import('@tauri-apps/api/core');
    if (!core?.invoke) return null;
    return await core.invoke(cmd, payload);
  } catch (_) {
    return null;
  }
}

const API_BASE_URL = getHttpApiBase();

export function getToken() {
  return localStorage.getItem('token');
}

/**
 * 获取用户信息
 */
export function getUser() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

/**
 * 保存用户信息
 */
export function saveUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

/**
 * 清除认证信息
 */
export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/**
 * 带超时的 fetch 函数
 * @param {string} url - 请求URL
 * @param {Object} options - fetch 选项
 * @param {number} timeout - 超时时间（毫秒），默认 10 秒
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
}

/**
 * 检查登录状态
 */
export async function checkAuth() {
  const token = getToken();
  if (!token) {
    clearAuth();
    initUserInfo();
    return false;
  }

  try {
    // 使用统一的 ApiService.auth.me()（自动处理 Tauri 环境）
    if (window.ApiService && window.ApiService.auth && window.ApiService.auth.me) {
      try {
        const result = await window.ApiService.auth.me();
        if (result) {
          saveUser(result.data || result);
          initUserInfo();
          return true;
        }
      } catch (e) {
        // ApiService 可能在浏览器/过渡期环境中失败，继续走后备逻辑
        console.warn('[Auth] ApiService.auth.me 失败，尝试后备校验:', e);
      }
    }

    // 兼容处理：如果没有 ApiService，使用旧的 invokeIfTauri 方法
    const ipc = await invokeIfTauri('auth_me', { token });
    if (ipc?.success) {
      saveUser(ipc.data);
      initUserInfo();
      return true;
    }

    // 回退到 HTTP API（仅用于非 Tauri 环境）
    const headers = { 'Authorization': `Bearer ${token}` };
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/auth/me`,
      { 
        headers,
        credentials: 'include' // 重要：携带 cookie
      },
      8000 // 8秒超时
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuth();
        initUserInfo();
      }
      return false;
    }

    const result = await response.json();
    if (result.success) {
      saveUser(result.data);
      initUserInfo();
      return true;
    } else {
      clearAuth();
      initUserInfo();
      return false;
    }
  } catch (error) {
    console.error('检查登录状态失败:', error);
    // 发生错误时（如后端未运行、DB丢失等），严格禁止自动登录
    // 用户要求：如果数据库存在但验证失败，转到登录页手动登录
    // 如果数据库不存在，checkAuth外部或下文应该处理，但在异常捕获中我们强制认为未登录

    // 清除可能无效的本地状态，强迫用户重新登录
    // NOTE: 保留 token 供用户复制或调试可能有用，但 UI 上要显示未登录
    // 为了安全和符合用户预期，此处返回 false
    return false;
  }
}

/**
 * 启动时检查：数据库是否存在、是否需要向导
 * 此函数应在 initAuth 中调用
 */
async function checkStartupState() {
  // 仅在 Tauri 环境检查
  if (isTauriLikeEnvironment()) {
    const isFirstRun = await invokeIfTauri('check_first_run');
    if (isFirstRun === true) {
      if (!window.location.pathname.includes('setup-wizard.html')) {
        console.log('[Auth] 数据库不存在，跳转到安装向导');
        window.location.href = 'setup-wizard.html';
        return true; // 阻止后续 Auth 检查
      }
    }
  }
  return false;
}

/**
 * 初始化用户信息显示
 * @param {number} retryCount - 重试次数（内部使用，避免无限递归）
 */
export function initUserInfo(retryCount = 0) {
  const user = getUser();
  const token = getToken();

  const userInfo = document.getElementById('userInfo');
  const offlineMode = document.getElementById('offlineMode');

  // 如果用户信息元素不存在，延迟重试（可能是DOM还没准备好）
  if (!userInfo) {
    // 检查当前页面是否需要用户信息元素
    // 某些页面（如 docs.html）可能不需要显示用户信息，直接返回
    const currentPage = window.location.pathname;
    const pagesWithoutUserInfo = ['/docs.html', '/docs'];
    const needsUserInfo = !pagesWithoutUserInfo.some(page => currentPage.includes(page));

    if (!needsUserInfo) {
      // 页面不需要用户信息，静默返回
      return;
    }

    // 最多重试5次，避免无限递归
    if (retryCount < 5) {
      setTimeout(() => {
        initUserInfo(retryCount + 1);
      }, 100);
    } else {
      // 重试失败，静默处理（某些页面可能确实不需要用户信息元素）
      // 避免引用 process.env（在纯浏览器/Tauri 环境下可能不存在）
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        console.debug('[initUserInfo] 用户信息元素不存在，可能是页面不需要显示用户信息');
      }
    }
    return;
  }

  if (!user || !token) {
    // 未登录，隐藏用户信息，不显示离线徽标
    userInfo.style.display = 'none';
    if (offlineMode) offlineMode.style.display = 'none';
    return;
  }

  // 已登录，显示用户信息
  userInfo.style.display = 'flex';
  if (offlineMode) offlineMode.style.display = 'none';

  // 更新用户名
  const userName = document.getElementById('userName');
  const dropdownUsername = document.getElementById('dropdownUsername');
  if (userName) userName.textContent = user.displayName || user.username;
  if (dropdownUsername) dropdownUsername.textContent = user.displayName || user.username;

  // 更新角色
  const dropdownRole = document.getElementById('dropdownRole');
  if (dropdownRole) {
    const roleText = user.role === 'admin' ? '管理员' : '普通用户';
    dropdownRole.textContent = roleText;
  }

  // 更新头像
  const userAvatarText = document.getElementById('userAvatarText');
  const dropdownAvatarText = document.getElementById('dropdownAvatarText');
  const firstLetter = (user.displayName || user.username || 'U').charAt(0).toUpperCase();
  if (userAvatarText) userAvatarText.textContent = firstLetter;
  if (dropdownAvatarText) dropdownAvatarText.textContent = firstLetter;

  // 如果有头像URL，显示头像图片
  if (user.avatar) {
    const userAvatar = document.getElementById('userAvatar');
    const dropdownAvatar = document.getElementById('dropdownAvatar');
    const userAvatarDefault = document.getElementById('userAvatarDefault');
    const dropdownAvatarDefault = document.getElementById('dropdownAvatarDefault');

    if (userAvatar) {
      userAvatar.src = user.avatar;
      userAvatar.style.display = 'block';
    }
    if (dropdownAvatar) {
      dropdownAvatar.src = user.avatar;
      dropdownAvatar.style.display = 'block';
    }
    if (userAvatarDefault) userAvatarDefault.style.display = 'none';
    if (dropdownAvatarDefault) dropdownAvatarDefault.style.display = 'none';
  }
}

/**
 * 登出
 */
export async function logout() {
  const token = getToken();

  if (token) {
    try {
      // 优先走 Tauri Command
      const ipc = await invokeIfTauri('auth_logout', { token });
      if (!ipc) {
        // 回退到 HTTP API
        const headers = { 'Authorization': `Bearer ${token}` };
        await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', headers });
      }
    } catch (error) {
      console.error('登出请求失败:', error);
    }
  }

  clearAuth();
  window.location.href = 'login.html';
}

/**
 * 修改密码对话框 - 使用统一弹窗模块
 */
export async function showChangePasswordDialog() {
  const formHTML = `
    <div class="form-group">
      <label>旧密码</label>
      <input type="password" id="oldPassword" class="form-input" placeholder="请输入旧密码" autocomplete="current-password">
    </div>
    <div class="form-group">
      <label>新密码</label>
      <input type="password" id="newPassword" class="form-input" placeholder="请输入新密码（至少6位）" autocomplete="new-password">
    </div>
    <div class="form-group">
      <label>确认新密码</label>
      <input type="password" id="confirmPassword" class="form-input" placeholder="请再次输入新密码" autocomplete="new-password">
    </div>
  `;

  const footerHTML = `
    <button class="btn secondary" data-action="cancel">取消</button>
    <button class="btn primary" data-action="confirm">确认修改</button>
  `;

  await window.ModalDialog.custom(formHTML, {
    title: '修改密码',
    footer: footerHTML,
    size: 'small',
    onConfirm: async () => {
      const oldPassword = document.getElementById('oldPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      // 验证
      if (!oldPassword || !newPassword || !confirmPassword) {
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast('请填写所有字段', 'warning');
        } else {
          alert('请填写所有字段');
        }
        return false;
      }

      if (newPassword.length < 6) {
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast('新密码长度不能少于6位', 'warning');
        } else {
          alert('新密码长度不能少于6位');
        }
        return false;
      }

      if (newPassword !== confirmPassword) {
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast('两次输入的新密码不一致', 'warning');
        } else {
          alert('两次输入的新密码不一致');
        }
        return false;
      }

      const token = getToken();
      if (!token) {
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast('请先登录', 'warning');
        } else {
          alert('请先登录');
        }
        window.location.href = 'login.html';
        return false;
      }

      const loading = window.ModalDialog.loading('正在修改密码...');

      try {
        // 优先走 Tauri Command
        let result = await invokeIfTauri('auth_change_password', { token, old_password: oldPassword, new_password: newPassword });

        if (!result) {
          // 回退到 HTTP API
          const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ oldPassword, newPassword })
          });
          result = await response.json();
        }

        loading.close();

        if (result.success) {
          // Clear auth first to ensure it happens
          clearAuth();

          if (window.NotificationSystem?.toast) {
            window.NotificationSystem.toast('密码修改成功，请重新登录', 'success');
          } else {
            alert('密码修改成功，请重新登录');
          }

          // Force redirect after a short delay to allow toast to be seen
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 1000);
          return true; // 关闭弹窗
        } else {
          if (window.NotificationSystem?.toast) {
            window.NotificationSystem.toast(result.message || '修改密码失败', 'error');
          } else {
            alert(result.message || '修改密码失败');
          }
          return false; // 不关闭弹窗
        }
      } catch (error) {
        console.error('修改密码失败:', error);
        loading.close();
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast('网络错误，请稍后重试', 'error');
        } else {
          alert('网络错误，请稍后重试');
        }
        return false; // 不关闭弹窗
      }
    }
  });
}

/**
 * 个人设置对话框 - 使用统一弹窗模块
 */
export async function showPersonalSettingsDialog() {
  const user = getUser();
  if (!user) {
    if (window.NotificationSystem?.toast) {
      window.NotificationSystem.toast('请先登录', 'warning');
    } else {
      alert('请先登录');
    }
    window.location.href = 'login.html';
    return;
  }

  // HTML转义函数
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  const formHTML = `
    <div class="form-group">
      <label>用户名</label>
      <input type="text" class="form-input" value="${escapeHtml(user.username)}" disabled>
    </div>
    <div class="form-group">
      <label>显示名称</label>
      <input type="text" id="displayName" class="form-input" value="${escapeHtml(user.displayName || '')}" placeholder="请输入显示名称">
    </div>
    <div class="form-group">
      <label>头像URL</label>
      <input type="text" id="avatarUrl" class="form-input" value="${escapeHtml(user.avatar || '')}" placeholder="请输入头像图片URL">
      <small style="color: #6b7280; font-size: 12px; margin-top: 4px; display: block;">
        支持http://或https://开头的图片链接
      </small>
    </div>
  `;

  const footerHTML = `
    <button class="btn secondary" data-action="cancel">取消</button>
    <button class="btn primary" data-action="confirm">保存</button>
  `;

  await window.ModalDialog.custom(formHTML, {
    title: '个人设置',
    footer: footerHTML,
    size: 'small',
    onConfirm: async () => {
      const displayName = document.getElementById('displayName').value.trim();
      const avatar = document.getElementById('avatarUrl').value.trim();

      const token = getToken();
      if (!token) {
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast('请先登录', 'warning');
        } else {
          alert('请先登录');
        }
        window.location.href = 'login.html';
        return false;
      }

      const loading = window.ModalDialog.loading('正在保存...');

      try {
        // 优先走 Tauri Command
        let result = await invokeIfTauri('auth_update_me', { token, display_name: displayName, avatar });

        if (!result) {
          // 回退到  HTTP API
          const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ displayName, avatar })
          });
          result = await response.json();
        }

        loading.close();

        if (result.success) {
          // 更新本地存储的用户信息
          user.displayName = displayName;
          user.avatar = avatar;
          saveUser(user);

          // 刷新显示
          initUserInfo();

          if (window.NotificationSystem?.toast) {
            window.NotificationSystem.toast('保存成功', 'success');
          } else {
            alert('保存成功');
          }
          return true; // 关闭弹窗
        } else {
          if (window.NotificationSystem?.toast) {
            window.NotificationSystem.toast(result.message || '保存失败', 'error');
          } else {
            alert(result.message || '保存失败');
          }
          return false; // 不关闭弹窗
        }
      } catch (error) {
        console.error('保存失败:', error);
        loading.close();
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast('网络错误，请稍后重试', 'error');
        } else {
          alert('网络错误，请稍后重试');
        }
        return false; // 不关闭弹窗
      }
    }
  });
}

/**
 * 初始化事件监听
 */
export function initEventListeners() {
  // 登出按钮
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('确定要退出登录吗？')) {
        logout();
      }
    });
  }

  // 修改密码按钮
  const btnChangePassword = document.getElementById('btnChangePassword');
  if (btnChangePassword) {
    btnChangePassword.addEventListener('click', (e) => {
      e.preventDefault();
      showChangePasswordDialog();
    });
  }

  // 个人设置按钮
  const btnPersonalSettings = document.getElementById('btnPersonalSettings');
  if (btnPersonalSettings) {
    btnPersonalSettings.addEventListener('click', (e) => {
      e.preventDefault();
      showPersonalSettingsDialog();
    });
  }
}

/**
 * 初始化认证模块（async，调用方可 await 拿到结果）
 * 结果会缓存到 window.__authReady，供 guard/Router 复用，消除双重 IPC
 * @returns {Promise<boolean>} 是否已登录
 */
export async function initAuth() {
  const run = async () => {
    if (await checkStartupState()) return false;

    initUserInfo();

    const isLoggedIn = await checkAuth();

    initEventListeners();

    // 缓存认证结果，供 guard() / Router._authCache 复用
    window.__authReady = isLoggedIn;
    window.__authReadyTimestamp = Date.now();

    if (!isLoggedIn) {
      const user = getUser();
      const token = getToken();
      if (!user || !token) {
        if (!window.location.pathname.includes('login.html')) {
          window.location.href = 'login.html';
        }
        return false;
      }
      if (!window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html';
      }
    }
    return isLoggedIn;
  };

  if (document.readyState === 'loading') {
    return new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', () => run().then(resolve));
    });
  }
  return run();
}

// 导出 AuthManager 对象（保持向后兼容）
export const AuthManager = {
  getToken,
  getUser,
  checkAuth,
  logout,
  initUserInfo
};

// 导出到全局作用域（保持向后兼容）
if (typeof window !== 'undefined') {
  window.AuthManager = AuthManager;
}

