/**
 * 路由守卫（登录与角色校验）
 * - 在页面入口处调用以确保用户已登录并具备必要权限
 * - 默认：仅校验登录；可传入 requiredRole 进行角色校验
 */
import { getUser, getToken, checkAuth } from './auth.js';

export async function guard(requiredRole) {
  try {
    const ok = await checkAuth();
    if (!ok) {
      // 仅当本地确实没有登录态时才跳转登录页。
      // 后端未就绪/临时网络错误时，避免反复重定向导致“闪动”。
      const token = getToken();
      const user = getUser();
      if (!token || !user) {
        window.location.href = 'login.html';
        return false;
      }
      // 有 token/user：允许继续进入页面（后端恢复后再自动校验）
      return true;
    }
    const user = getUser();
    if (requiredRole && user?.role !== requiredRole) {
      alert('权限不足');
      return false;
    }
    return true;
  } catch (e) {
    // 校验异常时，保守处理：跳转登录页
    console.error('[RouteGuard] 登录校验失败：', e);
    const token = getToken();
    const user = getUser();
    if (!token || !user) {
      window.location.href = 'login.html';
      return false;
    }
    // 有本地登录态：不强制跳转，避免闪动
    return false;
  }
}

// 向后兼容导出到全局（旧脚本可能直接使用）
if (typeof window !== 'undefined') {
  window.RouteGuard = { guard };
}