/**
 * 格式化工具函数
 * 提供各种数据格式化功能：HTML转义、金额格式化、日期格式化等
 * ES6 模块化版本
 * 
 * @module utils/format-utils
 * @example
 * ```javascript
 * import { escapeHtml, fmtMoney, fmtDate } from './utils/format-utils.js';
 * 
 * const safeHtml = escapeHtml('<script>alert("xss")</script>');
 * const money = fmtMoney(1234.56); // "1,234.56"
 * const date = fmtDate('2024-01-01T12:00:00Z'); // "2024-01-01 12:00"
 * ```
 */

/**
 * HTML 转义函数
 * 防止 XSS 攻击，将 HTML 特殊字符转义为实体
 * 
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的字符串
 * @example
 * ```javascript
 * const safe = escapeHtml('<script>alert("xss")</script>');
 * // 返回: "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
 * ```
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 格式化金额
 * 将数字格式化为带千分位分隔符的金额字符串
 * 
 * @param {number|string} v - 金额值
 * @returns {string} 格式化后的金额字符串（保留2位小数，使用千分位分隔符）
 * @example
 * ```javascript
 * fmtMoney(1234.56); // "1,234.56"
 * fmtMoney(1000000); // "1,000,000.00"
 * ```
 */
export function fmtMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
}

/**
 * 格式化日期时间
 * 将 ISO 日期字符串或 Date 对象格式化为 YYYY-MM-DD HH:mm 格式
 * 
 * @param {string|Date} iso - ISO 日期字符串或 Date 对象
 * @returns {string} 格式化后的日期时间字符串（YYYY-MM-DD HH:mm），如果输入无效则返回 "-"
 * @example
 * ```javascript
 * fmtDate('2024-01-01T12:00:00Z'); // "2024-01-01 12:00"
 * fmtDate(new Date()); // "2024-01-01 12:00"
 * ```
 */
export function fmtDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${dd} ${hh}:${mm}`;
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}

/**
 * 格式化日期（仅日期部分）
 * @param {string|Date} iso - ISO 日期字符串或 Date 对象
 * @returns {string} 格式化后的日期字符串（YYYY-MM-DD）
 */
export function fmtDateYMD(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}

/**
 * 格式化联系人信息
 * @param {Object} c - 客户对象
 * @param {string} c.tel - 电话
 * @param {string} c.fax - 传真
 * @returns {string} 格式化后的联系人信息字符串
 */
export function formatContact(c) {
  const parts = [];
  if (c.tel) parts.push(`Tel:${c.tel}`);
  if (c.fax) parts.push(`FAX:${c.fax}`);
  const s = parts.join(" / ");
  return s || "-";
}

/**
 * 格式化数字（带动画效果）
 * @param {HTMLElement} element - 目标元素
 * @param {number} targetNumber - 目标数字
 * @param {Object} options - 选项
 * @param {number} options.duration - 动画持续时间（毫秒），默认 500
 * @param {number} options.steps - 动画步数，默认 20
 * @param {Function} timerManager - 定时器管理器（可选）
 * @returns {Function} 清理函数
 */
export function animateNumber(element, targetNumber, options = {}, timerManager = null) {
  if (!element) return () => {};
  
  const duration = options.duration || 500;
  const steps = options.steps || 20;
  const currentNumber = parseInt(element.textContent) || 0;
  const increment = (targetNumber - currentNumber) / steps;
  let current = currentNumber;
  let step = 0;

  // 使用提供的 timerManager 或默认的 setInterval
  const setIntervalFn = timerManager ? 
    (fn, delay) => timerManager.setInterval(fn, delay) :
    (fn, delay) => {
      const id = setInterval(fn, delay);
      return () => clearInterval(id);
    };
  
  const clearIntervalFn = timerManager ?
    (id) => timerManager.clearInterval(id) :
    (id) => clearInterval(id);

  const timer = setIntervalFn(() => {
    step++;
    current += increment;
    element.textContent = Math.round(current);
    
    if (step >= steps) {
      element.textContent = targetNumber;
      clearIntervalFn(timer);
    }
  }, duration / steps);

  // 返回清理函数
  return () => {
    if (timerManager) {
      timerManager.clearInterval(timer);
    } else {
      clearInterval(timer);
    }
  };
}

