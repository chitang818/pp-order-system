/**
 * 统计工具模块
 * 负责更新各种统计信息的显示
 */

import { animateNumber } from './format-utils.js';
import { timerManager } from './timer-manager.js';

/**
 * 规范化订单状态文本，去除乱码字符和 emoji 图标
 * 注意：图标应该通过 CSS 的 ::after 伪元素显示，而不是在文本中
 * @param {string} status - 原始状态文本
 * @returns {string} 规范化后的状态文本（纯文本，不包含 emoji）
 */
function normalizeStatus(status) {
  if (!status || typeof status !== 'string') {
    return '已创建';
  }
  
  // 去除首尾空白
  let trimmed = status.trim();
  
  // 移除所有 emoji 和特殊 Unicode 字符（保留中文字符）
  // 匹配中文字符（Unicode 范围：\u4e00-\u9fa5）
  // 同时移除所有非中文字符（包括 emoji、乱码等）
  const chineseOnly = trimmed.match(/[\u4e00-\u9fa5]+/g);
  if (chineseOnly && chineseOnly.length > 0) {
    trimmed = chineseOnly.join('');
  } else {
    // 如果没有中文字符，尝试直接匹配标准状态
    trimmed = trimmed.replace(/[^\u4e00-\u9fa5]/g, '');
  }
  
  // 检查是否匹配标准状态值
  if (trimmed.includes('已创建')) {
    return '已创建';
  }
  if (trimmed.includes('已排产')) {
    return '已排产';
  }
  if (trimmed.includes('已发货')) {
    return '已发货';
  }
  if (trimmed.includes('已完成')) {
    return '已完成';
  }
  
  // 如果提取的中文字符看起来像状态，返回它
  if (trimmed.length > 0 && trimmed.length <= 6) {
    return trimmed;
  }
  
  // 如果无法识别，返回默认值
  return '已创建';
}

/**
 * 更新订单统计卡片
 * @param {Array} orders - 订单数组（应该是所有订单，不是筛选后的）
 */
export function updateOrderStats(orders = []) {
  const totalOrdersCountEl = document.getElementById('totalOrdersCount');
  const pendingShipmentCountEl = document.getElementById('pendingShipmentCount');
  const shippedOrdersCountEl = document.getElementById('shippedOrdersCount');
  const completedOrdersCountEl = document.getElementById('completedOrdersCount');

  if (!totalOrdersCountEl) return;

  // 总订单数
  const totalCount = orders.length;
  
  // 待发货订单数（已创建 + 已排产）- 使用规范化状态
  const pendingCount = orders.filter(o => {
    const normalizedStatus = normalizeStatus(o.status || '');
    return normalizedStatus === '已创建' || normalizedStatus === '已排产';
  }).length;
  
  // 已发货订单数 - 使用规范化状态
  const shippedCount = orders.filter(o => {
    const normalizedStatus = normalizeStatus(o.status || '');
    return normalizedStatus === '已发货';
  }).length;
  
  // 已完成订单数 - 使用规范化状态
  const completedCount = orders.filter(o => {
    const normalizedStatus = normalizeStatus(o.status || '');
    return normalizedStatus === '已完成';
  }).length;

  // 动画更新数字
  animateNumber(totalOrdersCountEl, totalCount, {}, timerManager);
  if (pendingShipmentCountEl) {
    animateNumber(pendingShipmentCountEl, pendingCount, {}, timerManager);
  }
  if (shippedOrdersCountEl) {
    animateNumber(shippedOrdersCountEl, shippedCount, {}, timerManager);
  }
  if (completedOrdersCountEl) {
    animateNumber(completedOrdersCountEl, completedCount, {}, timerManager);
  }
}

/**
 * 更新客户统计信息
 * @param {Array} customers - 客户数组
 * @param {Function} fmtMoney - 金额格式化函数
 */
export function updateCustomerStats(customers = [], fmtMoney) {
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.totalUSD > 0).length;
  const totalTradeAmount = customers.reduce((sum, c) => sum + (c.totalUSD || 0), 0);
  
  const totalCustomersCountEl = document.getElementById("totalCustomersCount");
  const activeCustomersCountEl = document.getElementById("activeCustomersCount");
  const totalTradeAmountEl = document.getElementById("totalTradeAmount");
  
  if (totalCustomersCountEl) {
    totalCustomersCountEl.textContent = totalCustomers;
  }
  if (activeCustomersCountEl) {
    activeCustomersCountEl.textContent = activeCustomers;
  }
  if (totalTradeAmountEl && fmtMoney) {
    totalTradeAmountEl.textContent = `$${fmtMoney(totalTradeAmount)}`;
  }
}

