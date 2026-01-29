/**
 * 用户管理模块
 * ES6 模块化版本
 */
import { ApiService } from '../../api/api.js';

let users = [];
let currentEditingUserId = null;
let isEventBound = false; // 标记事件是否已绑定，防止重复绑定

async function invokeIfTauri(cmd, payload) {
  try {
    console.log(`[invokeIfTauri] 尝试调用命令: ${cmd}`, payload);
    const core = await import('@tauri-apps/api/core');
    console.log('[invokeIfTauri] core模块已导入:', core);

    if (!core?.invoke) {
      console.warn('[invokeIfTauri] core.invoke不存在，返回null');
      return null;
    }

    console.log(`[invokeIfTauri] 调用 ${cmd}...`);
    const result = await core.invoke(cmd, payload);
    console.log(`[invokeIfTauri] ${cmd} 返回结果:`, result);
    return result;
  } catch (err) {
    console.error(`[invokeIfTauri] ${cmd} 调用失败:`, err);
    return null;
  }
}

// 获取Token
function getToken() {
  return localStorage.getItem('token');
}

// 获取CSRF Token
function getCsrfToken() {
  try {
    // 方法1: 使用正则表达式匹配
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }

    // 方法2: 如果正则匹配失败，尝试直接解析所有cookie
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrf_token' && value) {
        return decodeURIComponent(value);
      }
    }

    console.warn('[用户管理] 未找到CSRF token，cookie内容:', document.cookie);
    return null;
  } catch (error) {
    console.error('[用户管理] 获取CSRF token失败:', error);
    return null;
  }
}

// Toast提示
function showToast(message, type = 'info') {
  if (typeof window.NotificationSystem?.toast === "function") {
    window.NotificationSystem?.toast(message, type);
  } else {
    alert(message);
  }
}

// 加载用户列表
async function loadUsers() {
  const token = getToken();
  if (!token) {
    showToast('请先登录', 'warning');
    window.location.href = 'login.html';
    return;
  }

  try {
    // 桌面端优先走 Rust command
    const ipc = await invokeIfTauri('users_list', { token });
    const result = ipc || await ApiService.json('/api/users');

    if (result.success) {
      users = result.data || [];
      renderUsers();
      updateUserCount();
    } else {
      showToast(result.message || '加载用户列表失败', 'error');
    }
  } catch (error) {
    console.error('加载用户列表失败:', error);
    showToast('网络错误', 'error');
  }
}

// 渲染用户列表
function renderUsers() {
  const container = document.getElementById('usersTableContainer');
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #9ca3af;">
          <div style="font-size: 48px; margin-bottom: 12px;">👥</div>
          <div style="font-size: 16px;">暂无用户</div>
      </div>
  `;
    return;
  }

  const tableHTML = `
  <table class="table users-table" style="width: 100%; table-layout: fixed;">
      <thead>
          <tr>
      <th style="width: 12%; text-align: center;">用户名</th>
      <th style="width: 12%; text-align: center;">显示名称</th>
      <th style="width: 10%; text-align: center;">角色</th>
      <th style="width: 10%; text-align: center;">状态</th>
      <th style="width: 16%; text-align: center;">最后登录</th>
      <th style="width: 16%; text-align: center;">创建时间</th>
      <th style="width: 24%; text-align: center; min-width: 240px;">操作</th>
          </tr>
      </thead>
      <tbody>
          ${users.map(user => `
      <tr>
              <td style="text-align: center;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                  ${user.avatar ? `
          <img src="${user.avatar}" alt="" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                  ` : `
          <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px;">
                      ${(user.username || 'U').charAt(0).toUpperCase()}
          </div>
                  `}
                  <strong>${escapeHtml(user.username)}</strong>
        </div>
              </td>
              <td style="text-align: center;">${escapeHtml(user.displayName || '')}</td>
              <td style="text-align: center;">
        <span style="padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; display: inline-block; ${user.role === 'admin' ? 'background: #fef3c7; color: #92400e;' : 'background: #e0e7ff; color: #3730a3;'}">
                  ${user.role === 'admin' ? '管理员' : '普通用户'}
        </span>
              </td>
              <td style="text-align: center;">
        <span style="padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; display: inline-block; ${user.status === 'active' ? 'background: #d1fae5; color: #065f46;' : 'background: #fee2e2; color: #991b1b;'}">
                  ${user.status === 'active' ? '正常' : '禁用'}
        </span>
              </td>
              <td style="text-align: center;">${user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '-'}</td>
              <td style="text-align: center;">${formatDateTime(user.createdAt)}</td>
              <td style="text-align: center;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: nowrap;">
                  <button class="btn secondary small" data-action="edit" data-user-id="${user.id}" style="white-space: nowrap;">编辑</button>
                  <button class="btn secondary small" data-action="reset-password" data-user-id="${user.id}" style="white-space: nowrap;">重置密码</button>
                  ${user.username !== 'admin' ? `
          <button class="btn danger small" data-action="delete" data-user-id="${user.id}" data-username="${escapeHtml(user.username)}" style="white-space: nowrap;">删除</button>
                  ` : ''}
        </div>
              </td>
      </tr>
          `).join('')}
      </tbody>
  </table>
  `;

  container.innerHTML = tableHTML;
}

// 更新用户计数
function updateUserCount() {
  const countEl = document.getElementById('usersTotalCount');
  if (countEl) {
    countEl.textContent = users.length;
  }
}

// HTML转义
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 格式化时间
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 添加用户对话框 - 使用统一弹窗模块
async function showAddUserDialog() {
  const formHTML = `
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">👤</span>
              用户名
              <span class="settings-label-required">*</span>
      </label>
      <input type="text" class="settings-input" id="newUsername" placeholder="请输入用户名（3-20位字符）" maxlength="20">
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">📝</span>
              显示名称
      </label>
      <input type="text" class="settings-input" id="newDisplayName" placeholder="请输入显示名称">
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">🔑</span>
              密码
              <span class="settings-label-required">*</span>
      </label>
      <input type="password" class="settings-input" id="newPassword" placeholder="请输入密码（至少6位）" autocomplete="new-password">
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">🔑</span>
              确认密码
              <span class="settings-label-required">*</span>
      </label>
      <input type="password" class="settings-input" id="newPasswordConfirm" placeholder="请再次输入密码" autocomplete="new-password">
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">🎭</span>
              角色
      </label>
      <select class="settings-input" id="newRole">
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
      </select>
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">🖼️</span>
              头像URL
      </label>
      <input type="text" class="settings-input" id="newAvatar" placeholder="请输入头像图片URL（可选）">
  </div>
  `;

  const footerHTML = `
      <button class="settings-btn secondary" data-action="cancel">取消</button>
      <button class="settings-btn primary" data-action="confirm">添加</button>
  `;

  await window.ModalDialog.custom(formHTML, {
    title: '添加用户',
    footer: footerHTML,
    size: 'medium',
    onConfirm: async () => {
      const username = document.getElementById('newUsername').value.trim();
      const displayName = document.getElementById('newDisplayName').value.trim();
      const password = document.getElementById('newPassword').value;
      const passwordConfirm = document.getElementById('newPasswordConfirm').value;
      const role = document.getElementById('newRole').value;
      const avatar = document.getElementById('newAvatar').value.trim();

      // 验证
      if (!username) {
        showToast('请输入用户名', 'warning');
        return false;
      }

      if (username.length < 3) {
        showToast('用户名至少3位字符', 'warning');
        return false;
      }

      if (!password) {
        showToast('请输入密码', 'warning');
        return false;
      }

      if (password.length < 6) {
        showToast('密码至少6位', 'warning');
        return false;
      }

      if (password !== passwordConfirm) {
        showToast('两次输入的密码不一致', 'warning');
        return false;
      }

      const token = getToken();
      if (!token) {
        showToast('请先登录', 'warning');
        window.location.href = '/login.html';
        return false;
      }

      const loading = window.ModalDialog.loading('正在添加用户...');

      try {
        const ipc = await invokeIfTauri('users_create', {
          payload: {
            token,
            username,
            password,
            displayName: displayName || username,
            role,
            avatar: avatar || null
          }
        });
        const result = ipc || await ApiService.json('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username,
            displayName: displayName || username,
            password,
            role,
            avatar: avatar || null
          })
        });
        loading.close();

        if (result.success) {
          showToast('添加成功', 'success');
          loadUsers();
          return true; // 关闭弹窗
        } else {
          showToast(result.message || '添加失败', 'error');
          return false; // 不关闭弹窗
        }
      } catch (error) {
        console.error('添加用户失败:', error);
        loading.close();
        showToast('网络错误', 'error');
        return false; // 不关闭弹窗
      }
    }
  });
}

// 编辑用户 - 使用统一弹窗模块
async function editUser(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  currentEditingUserId = userId;

  const formHTML = `
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">👤</span>
              用户名
      </label>
      <input type="text" class="settings-input" value="${escapeHtml(user.username)}" disabled>
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">📝</span>
              显示名称
      </label>
      <input type="text" class="settings-input" id="editDisplayName" value="${escapeHtml(user.displayName || '')}" placeholder="请输入显示名称">
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">🎭</span>
              角色
      </label>
      <select class="settings-input" id="editRole">
              <option value="user" ${user.role === 'user' ? 'selected' : ''}>普通用户</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
      </select>
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">📊</span>
              状态
      </label>
      <select class="settings-input" id="editStatus">
              <option value="active" ${user.status === 'active' ? 'selected' : ''}>正常</option>
              <option value="disabled" ${user.status === 'disabled' ? 'selected' : ''}>禁用</option>
      </select>
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">🖼️</span>
              头像URL
      </label>
      <input type="text" class="settings-input" id="editAvatar" value="${escapeHtml(user.avatar || '')}" placeholder="请输入头像图片URL（可选）">
  </div>
  `;

  const footerHTML = `
      <button class="settings-btn secondary" data-action="cancel">取消</button>
      <button class="settings-btn primary" data-action="confirm">保存</button>
  `;

  await window.ModalDialog.custom(formHTML, {
    title: '编辑用户',
    footer: footerHTML,
    size: 'medium',
    onConfirm: async () => {
      const displayName = document.getElementById('editDisplayName').value.trim();
      const role = document.getElementById('editRole').value;
      const status = document.getElementById('editStatus').value;
      const avatar = document.getElementById('editAvatar').value.trim();

      const token = getToken();
      if (!token) {
        showToast('请先登录', 'warning');
        window.location.href = 'login.html';
        return false;
      }

      const loading = window.ModalDialog.loading('正在保存...');

      try {
        const ipc = await invokeIfTauri('users_update', {
          payload: {
            token,
            id: userId,
            displayName,
            role,
            status,
            avatar: avatar || null
          }
        });
        const result = ipc || await ApiService.json(`/api/users/${userId}`, {
          method: 'PUT',
          body: JSON.stringify({
            displayName,
            role,
            status,
            avatar: avatar || null
          })
        });
        loading.close();

        if (result && result.success) {
          showToast('更新成功', 'success');
          // 重新加载用户列表
          setTimeout(() => {
            loadUsers();
          }, 300);
          return true; // 关闭弹窗
        } else {
          const errorMsg = (result && (result.message || result.error)) || '更新失败';
          showToast(errorMsg, 'error');
          return false; // 不关闭弹窗
        }
      } catch (error) {
        console.error('[用户管理] 更新用户异常:', error);
        loading.close();
        const errorMsg = error.message || '网络错误，请检查网络连接';
        showToast(errorMsg, 'error');
        return false; // 不关闭弹窗
      }
    }
  });
}

// 重置密码 - 使用统一弹窗模块
async function resetPassword(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  const formHTML = `
          <p style="margin-bottom: 16px; color: #6b7280;">
      将为用户 <strong>${escapeHtml(user.username)}</strong> 重置密码
          </p>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">🔑</span>
              新密码
              <span class="settings-label-required">*</span>
      </label>
      <input type="password" class="settings-input" id="resetPassword" placeholder="请输入新密码（至少6位）" autocomplete="new-password">
          </div>
          <div class="settings-form-group">
      <label class="settings-label">
              <span class="settings-label-icon">🔑</span>
              确认密码
              <span class="settings-label-required">*</span>
      </label>
      <input type="password" class="settings-input" id="resetPasswordConfirm" placeholder="请再次输入新密码" autocomplete="new-password">
  </div>
  `;

  const footerHTML = `
      <button class="settings-btn secondary" data-action="cancel">取消</button>
      <button class="settings-btn primary" data-action="confirm">确认重置</button>
  `;

  await window.ModalDialog.custom(formHTML, {
    title: '重置密码',
    footer: footerHTML,
    size: 'small',
    onConfirm: async () => {
      const newPassword = document.getElementById('resetPassword').value;
      const confirmPassword = document.getElementById('resetPasswordConfirm').value;

      // 验证
      if (!newPassword) {
        showToast('请输入新密码', 'warning');
        return false;
      }

      if (newPassword.length < 6) {
        showToast('密码至少6位', 'warning');
        return false;
      }

      if (newPassword !== confirmPassword) {
        showToast('两次输入的密码不一致', 'warning');
        return false;
      }

      const token = getToken();
      if (!token) {
        showToast('请先登录', 'warning');
        window.location.href = 'login.html';
        return false;
      }


      const loading = window.ModalDialog.loading('正在重置密码...');

      try {
        // 优先使用 Tauri Command
        let result = await invokeIfTauri('users_reset_password', {
          payload: {
            token,
            id: userId,
            newPassword: newPassword
          }
        });

        if (!result) {
          // 回退到 HTTP API
          result = await ApiService.json(`/api/users/${userId}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ newPassword })
          });
        }

        loading.close();

        if (result.success) {
          showToast('密码重置成功', 'success');

          // 如果重置的是当前登录用户的密码，则自动退出
          try {
            const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
            // 使用字符串比较以防类型不一致 (比如 number vs string)
            if (currentUser && currentUser.id && String(currentUser.id) === String(userId)) {
              console.log('[用户管理] 检测到重置当前用户密码，准备登出...');
              setTimeout(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = 'login.html';
              }, 1500);
            }
          } catch (e) {
            console.error('检查当前用户失败:', e);
          }

          return true; // 关闭弹窗
        } else {
          showToast(result.message || '重置失败', 'error');
          return false; // 不关闭弹窗
        }
      } catch (error) {
        console.error('重置密码失败:', error);
        loading.close();
        showToast('网络错误', 'error');
        return false; // 不关闭弹窗
      }
    }
  });
}

// 删除用户
function deleteUser(userId, username) {
  // 防止重复调用：检查是否已经有弹窗打开
  const existingModal = document.querySelector('.modal-dialog-overlay');
  if (existingModal) {
    console.log('[用户管理] 删除用户：已有弹窗打开，忽略重复调用');
    return;
  }

  // 使用统一弹窗模块的确认对话框
  // 设置 preventDuplicate: true 防止重复弹窗
  window.ModalDialog.confirm(
    `确定要删除用户"${username}"吗？此操作不可恢复！`,
    {
      title: '确认删除用户',
      icon: '⚠️',
      confirmText: '确认删除',
      cancelText: '取消',
      preventDuplicate: true // 防止重复弹窗
    }
  ).then(async (confirmed) => {
    if (!confirmed) {
      return;
    }

    const token = getToken();
    if (!token) {
      showToast('请先登录', 'warning');
      window.location.href = 'login.html';
      return;
    }

    (async () => {
      const ipc = await invokeIfTauri('users_delete', { token, id: userId });
      if (ipc) return ipc;
      return ApiService.json(`/api/users/${userId}`, { method: 'DELETE' });
    })()
      .then(result => {
        if (result.success) {
          showToast('删除成功', 'success');
          loadUsers();
        } else {
          showToast(result.message || '删除失败', 'error');
        }
      })
      .catch(error => {
        console.error('删除用户失败:', error);
        showToast('网络错误', 'error');
      });
  });
}

// 初始化
function init() {
  console.log('[用户管理] 初始化开始');

  // 检查用户管理页面是否存在
  const usersPage = document.getElementById('settingsUsersPage');
  if (!usersPage) {
    // 在SPA模式下，如果页面元素不存在，可能是还没有切换到用户管理页面
    // 这种情况下不应该报错，而是静默返回，等待页面切换时再初始化
    if (window.isSPA) {
      // SPA模式下，页面元素不存在是正常的，静默返回，不输出警告
      return;
    }
    // 非SPA模式下，延迟重试
    console.warn('[用户管理] 未找到用户管理页面元素，延迟重试');
    setTimeout(() => {
      const retryPage = document.getElementById('settingsUsersPage');
      if (retryPage) {
        init();
      } else {
        // 非SPA模式下，如果重试失败，才输出警告
        console.warn('[用户管理] 重试失败，用户管理页面元素仍未找到（可能是页面尚未访问）');
      }
    }, 200);
    return;
  }

  // 监听页面切换（SPA模式）
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const usersPage = document.getElementById('settingsUsersPage');
      if (usersPage && usersPage.style.display !== 'none') {
        console.log('[用户管理] 页面显示，加载用户列表');
        loadUsers();
      }
    });
  });

  if (usersPage) {
    observer.observe(usersPage, { attributes: true, attributeFilter: ['style'] });
    console.log('[用户管理] 页面监听器已设置');

    // 如果页面当前可见，立即加载用户列表
    if (usersPage.style.display !== 'none') {
      console.log('[用户管理] 页面当前可见，立即加载用户列表');
      loadUsers();
    }
  }

  // 添加用户按钮 - 使用延迟绑定确保DOM已加载
  setTimeout(() => {
    const btnAddUser = document.getElementById('btnAddUser');
    if (btnAddUser) {
      // 移除可能存在的旧监听器（通过克隆节点）
      const newBtn = btnAddUser.cloneNode(true);
      btnAddUser.parentNode.replaceChild(newBtn, btnAddUser);
      newBtn.addEventListener('click', showAddUserDialog);
      console.log('[用户管理] 添加用户按钮事件已绑定');
    } else {
      console.warn('[用户管理] 未找到添加用户按钮');
      // 重试一次
      setTimeout(() => {
        const retryBtn = document.getElementById('btnAddUser');
        if (retryBtn) {
          const newBtn = retryBtn.cloneNode(true);
          retryBtn.parentNode.replaceChild(newBtn, retryBtn);
          newBtn.addEventListener('click', showAddUserDialog);
          console.log('[用户管理] 重试成功，添加用户按钮事件已绑定');
        }
      }, 200);
    }
  }, 100);

  // 使用事件委托处理表格中的按钮点击
  // 防止重复绑定事件：检查是否已经绑定过
  if (!isEventBound) {
    isEventBound = true;

    document.addEventListener('click', function (e) {
      // 如果点击的是模态框内的元素，不处理
      if (e.target.closest('.modal-dialog-overlay')) {
        return;
      }

      const button = e.target.closest('button[data-action]');

      // 检查是否是用户管理相关的按钮
      if (button && button.closest('#usersTableContainer')) {
        const action = button.getAttribute('data-action');

        // 防止重复点击：检查是否已经有弹窗打开（适用于所有操作）
        const existingModal = document.querySelector('.modal-dialog-overlay');
        if (existingModal) {
          console.log('[用户管理] 已有弹窗打开，忽略重复点击', action);
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 检查按钮是否被禁用（防止快速重复点击）
        if (button.disabled) {
          console.log('[用户管理] 按钮已禁用，忽略点击', action);
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 对于编辑操作，防止重复点击
        if (action === 'edit') {
          // 临时禁用按钮，防止快速重复点击
          button.disabled = true;
          setTimeout(() => {
            button.disabled = false;
          }, 500);
        }

        // 对于删除操作，防止重复点击
        if (action === 'delete') {
          // 临时禁用按钮，防止快速重复点击
          button.disabled = true;
          setTimeout(() => {
            button.disabled = false;
          }, 500);
        }

        e.preventDefault();
        e.stopPropagation();

        const userId = parseInt(button.getAttribute('data-user-id'));
        const username = button.getAttribute('data-username');

        console.log('[用户管理] 按钮点击:', action, userId);

        switch (action) {
          case 'edit':
            editUser(userId);
            break;
          case 'reset-password':
            resetPassword(userId);
            break;
          case 'delete':
            deleteUser(userId, username);
            break;
        }
      }
    });
  } else {
    console.log('[用户管理] 事件委托已绑定，跳过重复绑定');
  }

  console.log('[用户管理] 初始化完成');
}

// 页面加载时初始化（仅在非SPA模式下）
// 在SPA模式下，由spa.js调用init函数
// 延迟检查，确保 window.isSPA 已被设置
// 检查是否在浏览器环境中（避免服务器端执行时出错）
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setTimeout(() => {
    if (!window.isSPA) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    } else {
      // SPA模式下，不自动初始化，等待spa.js调用
      console.log('[用户管理] SPA模式，等待路由切换时初始化');
    }
  }, 100);
}

// 导出模块
const UserManagement = {
  loadUsers,
  editUser,
  resetPassword,
  deleteUser,
  init // 导出init函数供SPA调用
};
export { UserManagement, init };

// 暴露到全局（保持向后兼容）
if (typeof window !== 'undefined') {
  window.UserManagement = UserManagement;
}
