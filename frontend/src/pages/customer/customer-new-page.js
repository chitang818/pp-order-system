/**
 * 客户编辑页面业务逻辑
 * 从 customer-new.html 中提取的内联脚本
 */

// 导入依赖
import { ApiService } from '../../api/api.js';

/**
 * 初始化客户编辑页面
 */
export function initCustomerNewPage() {
  // 支持 SPA 模式：从 hash 参数或 search 参数中获取
  let editId = null;
  let editName = '';

  // 尝试从 hash 参数获取（SPA 模式）
  const hashMatch = location.hash.match(/[?&]id=([^&]+)/);
  const nameMatch = location.hash.match(/[?&]name=([^&]+)/);
  if (hashMatch) {
    editId = decodeURIComponent(hashMatch[1]);
  }
  if (nameMatch) {
    editName = decodeURIComponent(nameMatch[1]).trim();
  }

  // 如果没有从 hash 获取到，尝试从 search 参数获取（兼容独立页面模式）
  if (!editId && !editName) {
    const params = new URLSearchParams(location.search);
    editId = params.get('id');
    editName = String(params.get('name') || '').trim();
  }

  let resolvedId = (editId && Number.isFinite(Number(editId))) ? String(Number(editId)) : '';

  // 使用 ApiService 的 json 函数，自动处理 CSRF token


  async function init() {
    // 编辑模式：优先按ID拉取，失败则按名称列表回退匹配
    if (editId || editName) {
      let c = null;
      if (editId) {
        try {
          c = await ApiService.customers.get(editId);
        } catch (e) {
        }
      }
      if (!c && editName) {
        try {
          const list = await ApiService.customers.list();
          if (Array.isArray(list)) {
            const lower = editName.toLowerCase();
            c = list.find(x => String(x.name || '').trim().toLowerCase() === lower) || null;
          }
        } catch (e) { }
      }
      if (c) {
        if (c.id != null) {
          resolvedId = String(c.id);
        }
        document.getElementById('cusName').value = c.name || '';
        document.getElementById('cusAddress').value = c.address || '';
        document.getElementById('cusTel').value = c.tel || '';
        document.getElementById('cusFax').value = c.fax || '';
        // 编辑模式时更新按钮文案
        const btnEl = document.getElementById('btnSaveCustomer');
        if (btnEl) btnEl.textContent = '保存修改';
      } else if (editName) {
        // 未能按ID加载时，至少按名称预填，并显示提示文案
        document.getElementById('cusName').value = editName;
        const warn = document.createElement('div');
        warn.style.color = '#c00';
        warn.style.margin = '8px 0';
        warn.textContent = '未能按ID加载客户，已按名称回填，请检查后保存。';
        const panelBody = document.querySelector('.panel-body');
        if (panelBody) panelBody.insertBefore(warn, panelBody.firstChild);
        // 仍视为编辑操作，更新按钮文案
        const btnEl = document.getElementById('btnSaveCustomer');
        if (btnEl) btnEl.textContent = '保存修改';
      }
    } else {
      // 新建模式时保持默认文案
      const btnEl = document.getElementById('btnSaveCustomer');
      if (btnEl) btnEl.textContent = '保存客户';
    }
  }

  init();

  // 绑定保存按钮事件（防止重复绑定）
  const btn = document.getElementById('btnSaveCustomer');
  if (!btn) {
    console.error('[Customer Edit] 保存按钮未找到');
    return; // 如果按钮不存在，退出初始化
  }

  // 检查是否已经绑定过事件（防止重复绑定）
  if (btn.hasAttribute('data-save-bound')) {
    console.log('[Customer Edit] 保存按钮事件已绑定，跳过');
    return;
  }

  // 标记为已绑定
  btn.setAttribute('data-save-bound', 'true');

  btn.addEventListener('click', async function () {
    // 获取表单值并严格处理
    const nameInput = document.getElementById('cusName');
    const addressInput = document.getElementById('cusAddress');
    const telInput = document.getElementById('cusTel');
    const faxInput = document.getElementById('cusFax');

    if (!nameInput) {
      window.NotificationSystem.toast('找不到客户名称输入框', 'error');
      return;
    }

    // 使用更严格的 trim 处理，去除所有空白字符（包括全角空格和不可见字符）
    const nameRaw = nameInput.value || '';
    const name = String(nameRaw)
      .replace(/[\u3000\u00A0\u2000-\u200B\uFEFF]/g, ' ') // 替换全角空格和零宽字符为普通空格
      .trim();

    const address = addressInput ? String(addressInput.value || '')
      .replace(/[\u3000\u00A0\u2000-\u200B\uFEFF]/g, ' ')
      .trim() : '';
    const tel = telInput ? String(telInput.value || '').trim() : '';
    const fax = faxInput ? String(faxInput.value || '').trim() : '';

    // 客户端验证：检查名称是否为空
    if (!name || name.length === 0) {
      window.NotificationSystem.toast('请输入客户名称', 'warning');
      return;
    }

    // 构建 payload，确保所有字段都是字符串
    const payload = {
      name: name,
      address: address || '',
      tel: tel || '',
      fax: fax || ''
    };

    try {
      if (resolvedId) {
        // 编辑模式：不做同名校验，直接更新
        try {
          const response = await ApiService.customers.update(resolvedId, payload);
          console.log('[Customer Save] 更新成功:', response);
          try {
            window.NotificationSystem.toast('保存成功：已更新客户信息', 'success', 1500);
          } catch (_) { }

          // 触发客户更新事件，通知其他页面刷新
          window.dispatchEvent(new CustomEvent('customerUpdated', {
            detail: { customerId: resolvedId, customer: response }
          }));

          // 始终触发订单列表刷新事件（无论当前在哪个页面，因为订单列表可能在其他标签页打开）
          console.log('[Customer Save] 触发订单列表刷新事件');
          window.dispatchEvent(new CustomEvent('refreshOrdersList', {
            detail: { customerId: resolvedId, customerName: response?.name || name }
          }));
        } catch (e1) {
          // 404 回退：按名称重新解析ID后重试一次（当前输入名称与URL原始名称均尝试）
          if (String(e1.message || '').includes('HTTP 404') || String(e1.message || '').includes('not found')) {
            try {
              const list = await ApiService.customers.list();
              const lowerNow = name.toLowerCase();
              const lowerUrl = String(editName || '').trim().toLowerCase();
              let matched = Array.isArray(list) ? list.find(c => String(c.name || '').trim().toLowerCase() === lowerNow) : null;
              if (!matched && lowerUrl) {
                matched = Array.isArray(list) ? list.find(c => String(c.name || '').trim().toLowerCase() === lowerUrl) : null;
              }
              if (matched && matched.id != null) {
                resolvedId = String(matched.id);
                const response = await ApiService.customers.update(resolvedId, payload);
                try {
                  window.NotificationSystem.toast('保存成功：已更新客户信息', 'success', 1500);
                } catch (_) { }

                // 触发客户更新事件，通知其他页面刷新
                window.dispatchEvent(new CustomEvent('customerUpdated', {
                  detail: { customerId: resolvedId, customer: response }
                }));

                // 始终触发订单列表刷新事件（无论当前在哪个页面，因为订单列表可能在其他标签页打开）
                console.log('[Customer Save] 触发订单列表刷新事件');
                window.dispatchEvent(new CustomEvent('refreshOrdersList', {
                  detail: { customerId: resolvedId, customerName: response?.name || name }
                }));
              } else {
                // 找不到同名客户：提示并允许改为创建
                throw new Error('HTTP 404: 客户不存在');
              }
            } catch (e2) {
              // 不强制创建，提醒用户检查ID或返回列表再编辑
              window.NotificationSystem.toast('保存失败：客户不存在，请重新选择', 'error');
              return;
            }
          } else if (String(e1.message || '').includes('HTTP 400')) {
            console.error('[Customer Save] 400错误详情:', e1);
            window.NotificationSystem.toast('输入验证失败：客户名称不能为空', 'warning');
            return;
          } else {
            throw e1;
          }
        }
      } else {
        // 新建模式：仅在新建时做同名校验
        try {
          const existing = await ApiService.customers.list();
          if (Array.isArray(existing)) {
            const lower = name.toLowerCase();
            const dup = existing.find(c => String(c.name || '').toLowerCase() === lower);
            if (dup) {
              window.NotificationSystem.toast('已存在同名客户，不能重复保存', 'warning');
              return;
            }
          }
        } catch (e) { }
        try {
          const result = await ApiService.customers.create(payload);

          console.log('[Customer Save] 创建客户成功，服务器返回:', result);

          // 清除客户列表缓存，确保数据同步
          if (window.CacheService) {
            window.CacheService.customers.clear();
          }

          try {
            window.NotificationSystem.toast('保存成功：已创建新客户', 'success', 1500);
          } catch (_) { }
        } catch (e) {
          if (String(e.message || '').includes('HTTP 409') || String(e.message || '').includes('already exists')) {
            window.NotificationSystem.toast('已存在同名客户，不能重复保存', 'warning');
            return;
          }
          if (String(e.message || '').includes('HTTP 400')) {
            console.error('[Customer Save] 400错误详情:', e);
            window.NotificationSystem.toast('输入验证失败：客户名称不能为空', 'warning');
            return;
          }
          throw e;
        }
      }
    } catch (e) {
      console.error('[Customer Save] 保存失败:', e);
      window.NotificationSystem.toast('保存失败：' + e.message, 'error');
      return;
    }

    // 成功后返回客户管理页，并强制刷新客户列表
    try {
      // SPA 模式：使用 hash 路由，添加 refresh 参数触发刷新
      if (window.isSPA) {
        // 先清除缓存
        if (window.CacheService) {
          window.CacheService.customers.clear();
        }
        // 跳转到客户列表页面，并添加 refresh 参数
        location.hash = '#/customers?refresh=' + Date.now();
        console.log('[Customer Save] 已跳转到客户列表页面，等待刷新');
      } else {
        // 独立页面模式：跳转到 index.html
        const base = location.origin && location.origin !== 'null' ? location.origin : (new URL(window.location.href)).origin;
        const url = new URL('/index.html#/customers', base);
        // 添加时间戳参数强制刷新
        url.searchParams.set('refresh', Date.now());
        window.location.href = url.toString();
      }
    } catch (e) {
      console.error('[Customer Save] 跳转失败:', e);
      if (window.isSPA) {
        // 清除缓存并跳转
        if (window.CacheService) {
          window.CacheService.customers.clear();
        }
        location.hash = '#/customers?refresh=' + Date.now();
      } else {
        window.location.href = 'index.html#/customers?refresh=' + Date.now();
      }
    }
  });
}

// DOM 加载完成后自动初始化（仅在非SPA模式下）
// 在SPA模式下，由spa.js直接调用initCustomerNewPage函数
if (!window.isSPA) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomerNewPage);
  } else {
    // DOM 已经加载完成，立即执行
    initCustomerNewPage();
  }
}
