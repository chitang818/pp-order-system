/**
 * 路由守卫（登录与角色校验）
 * - 在页面入口处调用以确保用户已登录并具备必要权限
 * - 默认：仅校验登录；可传入 requiredRole 进行角色校验
 * - 优化：复用 initAuth 缓存的认证结果（window.__authReady），避免重复 IPC
 */
import { getUser, getToken, checkAuth } from './auth.js';

const AUTH_CACHE_TTL = 120000; // 2 分钟，与 Router._authCache.ttl 保持一致

export async function guard(requiredRole) {
  try {
    let ok;
    if (
      typeof window.__authReady === 'boolean' &&
      window.__authReadyTimestamp &&
      (Date.now() - window.__authReadyTimestamp) < AUTH_CACHE_TTL
    ) {
      ok = window.__authReady;
    } else {
      ok = await checkAuth();
      window.__authReady = ok;
      window.__authReadyTimestamp = Date.now();
    }

    if (!ok) {
      const token = getToken();
      const user = getUser();
      if (!token || !user) {
        window.location.href = 'login.html';
        return false;
      }
      return true;
    }
    const user = getUser();
    if (requiredRole && user?.role !== requiredRole) {
      alert('权限不足');
      return false;
    }
    return true;
  } catch (e) {
    console.error('[RouteGuard] 登录校验失败：', e);
    const token = getToken();
    const user = getUser();
    if (!token || !user) {
      window.location.href = 'login.html';
      return false;
    }
    return false;
  }
}

// 向后兼容导出到全局（旧脚本可能直接使用）
if (typeof window !== 'undefined') {
  window.RouteGuard = { guard };
}
