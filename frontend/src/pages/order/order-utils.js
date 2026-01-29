/**
 * 订单编辑页面 - 工具函数模块
 * 提供通用的工具函数
 */

/**
 * HTML转义函数
 * @param {string} str - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 日期文本规范化为ISO格式 (YYYY-MM-DD)
 * @param {string} text - 日期文本（支持YYYYMMDD格式）
 * @returns {string} ISO格式日期字符串
 */
export function normalizeDateTextToISO(text) {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (!trimmed) return '';
  
  // 提取所有数字
  const digits = trimmed.replace(/[^0-9]/g, '');
  
  // 处理8位数字格式（YYYYMMDD）
  if (digits.length === 8) {
    const y = digits.slice(0, 4);
    const m = digits.slice(4, 6);
    const d = digits.slice(6, 8);
    const iso = `${y}-${m}-${d}`;
    // 验证日期有效性
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) {
      // 验证年月日是否匹配（防止日期溢出，如 20251301 被解析为 2026-01-01）
      const year = dt.getFullYear();
      const month = dt.getMonth() + 1;
      const day = dt.getDate();
      if (String(year) === y && 
          String(month).padStart(2, '0') === m && 
          String(day).padStart(2, '0') === d) {
        return iso;
      }
    }
  }
  
  // 若已是YYYY-MM-DD格式则直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // 验证日期有效性
    const dt = new Date(trimmed);
    if (!isNaN(dt.getTime())) {
      return trimmed;
    }
  }
  
  // 尝试解析其他格式（如 YYYY/MM/DD, YYYY.MM.DD 等）
  const dateMatch = trimmed.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    const month = m.padStart(2, '0');
    const day = d.padStart(2, '0');
    const iso = `${y}-${month}-${day}`;
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) {
      return iso;
    }
  }
  
  return trimmed; // 其他情况保持原样
}

/**
 * 时间文本规范化为HH:MM格式
 * @param {string} text - 时间文本（支持HHMM格式）
 * @returns {string} HH:MM格式时间字符串
 */
export function normalizeTimeTextToHHMM(text) {
  if (!text) return '';
  const digits = String(text).replace(/[^0-9]/g, '');
  if (digits.length === 4) {
    const h = digits.slice(0, 2);
    const m = digits.slice(2, 4);
    if (parseInt(h) <= 23 && parseInt(m) <= 59) {
      return `${h}:${m}`;
    }
  }
  // 若已是HH:MM格式则直接返回
  if (/^\d{2}:\d{2}$/.test(text)) return text;
  return text; // 其他情况保持原样
}

/**
 * 从合同编号中提取订单号
 * 支持格式：SC2025-215(NO.25669) 或 SC2025-215(25669)
 * @param {string} contractNo - 合同编号
 * @returns {string|null} 订单号或null
 */
export function extractOrderNoFromContractNo(contractNo) {
  if (!contractNo || !contractNo.trim()) {
    return null;
  }
  // 匹配格式：(NO.数字) 或 (数字)
  const match = contractNo.match(/\(NO\.\s*(\d+)\s*\)|\((\d+)\)/i);
  if (match) {
    // 优先使用第一个捕获组（NO.数字），如果没有则使用第二个（纯数字）
    return match[1] || match[2];
  }
  return null;
}

/**
 * 本地存储读取工具
 * @param {string} key - 存储键
 * @param {any} fallback - 默认值
 * @returns {any} 存储的值或默认值
 */
export function loadLocalStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

/**
 * 本地存储保存工具
 * @param {string} key - 存储键
 * @param {any} value - 要保存的值
 */
export function saveLocalStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

