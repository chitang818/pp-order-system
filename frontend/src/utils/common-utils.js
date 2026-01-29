/**
 * 通用工具函数模块
 * 包含各种通用的工具函数
 */

/**
 * 统一构造同源绝对URL的跳转函数，避免 file:// 或不同端口导致的本地存储隔离
 * @param {string} pathWithQuery - 路径和查询参数
 */
export function goto(pathWithQuery) {
  try {
    const base = location.origin && location.origin !== "null" 
      ? location.origin 
      : (new URL(window.location.href)).origin;
    const url = new URL(pathWithQuery, base);
    window.location.href = url.toString();
  } catch (e) {
    // 回退：直接赋值（仍尽量保持相对路径）
    window.location.href = pathWithQuery;
  }
}

/**
 * 保存数据到本地存储
 * @param {string} key - 存储键
 * @param {*} value - 要存储的值
 */
export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('保存到本地存储失败:', e);
  }
}

/**
 * 从本地存储加载数据
 * @param {string} key - 存储键
 * @param {*} fallback - 默认值
 * @returns {*} 存储的值或默认值
 */
export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('从本地存储加载失败:', e);
    return fallback;
  }
}

