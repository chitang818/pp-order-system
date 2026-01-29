/**
 * 格式化工具函数
 * 提供通用的格式化功能：日期、货币、HTML转义等
 * ES6 模块化版本
 */

/**
 * HTML转义函数：防止XSS攻击
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的HTML字符串
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 格式化货币
 * @param {number|string} v - 金额值
 * @param {Object} options - 格式化选项
 * @param {number} options.minimumFractionDigits - 最小小数位数
 * @param {number} options.maximumFractionDigits - 最大小数位数
 * @returns {string} 格式化后的货币字符串
 */
export function fmtMoney(v, options = {}) {
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2
  } = options;
  
  const n = Number(v || 0);
  return n.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits
  });
}

/**
 * 格式化日期（包含时间）
 * @param {string|Date} iso - ISO日期字符串或Date对象
 * @returns {string} 格式化后的日期时间字符串 (YYYY-MM-DD HH:mm)
 */
export function fmtDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    
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
 * @param {string|Date} iso - ISO日期字符串或Date对象
 * @returns {string} 格式化后的日期字符串 (YYYY-MM-DD)
 */
export function fmtDateYMD(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}

/**
 * 格式化日期时间为ISO字符串
 * @param {Date|string|number} date - 日期
 * @returns {string} ISO日期时间字符串
 */
export function toISOString(date) {
  if (!date) return new Date().toISOString();
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

/**
 * 格式化客户联系方式
 * @param {Object} customer - 客户对象
 * @returns {string} 格式化后的联系方式字符串
 */
export function formatContact(customer) {
  if (!customer) return "-";
  
  const parts = [];
  if (customer.tel) parts.push(`Tel:${customer.tel}`);
  if (customer.fax) parts.push(`FAX:${customer.fax}`);
  
  const s = parts.join(" / ");
  return s || "-";
}

/**
 * 获取订单状态样式类
 * @param {string} status - 订单状态
 * @returns {string} CSS类名
 */
export function getOrderStatusClass(status) {
  switch (status) {
    case '已创建':
      return 'status-created';
    case '已排产':
      return 'status-scheduled';
    case '已发货':
      return 'status-shipped';
    case '已完成':
      return 'status-completed';
    default:
      return 'status-created';
  }
}

/**
 * 数字动画效果
 * @param {HTMLElement} element - 目标元素
 * @param {number} targetNumber - 目标数字
 * @param {Object} options - 动画选项
 * @param {number} options.duration - 动画持续时间（毫秒）
 * @param {number} options.steps - 动画步数
 * @param {Function} options.timerManager - 定时器管理器
 */
export function animateNumber(element, targetNumber, options = {}) {
  if (!element) return;
  
  const {
    duration = 500,
    steps = 20,
    timerManager = null
  } = options;
  
  const currentNumber = parseInt(element.textContent) || 0;
  const increment = (targetNumber - currentNumber) / steps;
  let current = currentNumber;
  let step = 0;
  
  const setInterval = timerManager?.setInterval || window.setInterval;
  const clearInterval = timerManager?.clearInterval || window.clearInterval;
  
  const timer = setInterval(() => {
    step++;
    current += increment;
    element.textContent = Math.round(current);
    
    if (step >= steps) {
      element.textContent = targetNumber;
      clearInterval(timer);
    }
  }, duration / steps);
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的文件大小字符串
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 格式化百分比
 * @param {number} value - 数值（0-1之间的小数）
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的百分比字符串
 */
export function formatPercent(value, decimals = 2) {
  const n = Number(value || 0) * 100;
  return n.toFixed(decimals) + '%';
}

/**
 * 截断字符串
 * @param {string} str - 要截断的字符串
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 后缀（默认'...'）
 * @returns {string} 截断后的字符串
 */
export function truncate(str, maxLength, suffix = '...') {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

