/**
 * 订单编辑页面 - 数据加载模块
 * 负责订单数据、客户数据等的加载和回填
 */

import { ApiService } from '../../api/api.js';
import { normalizeDateTextToISO } from './order-utils.js';

/**
 * 加载客户列表
 * @param {HTMLElement} customerSelectEl - 客户选择框元素
 * @param {Array} customers - 客户数组（引用传递，会被更新）
 * @param {Object} origOrder - 原始订单数据（编辑模式）
 * @returns {Promise<void>}
 */
export async function loadCustomers(customerSelectEl, customers, origOrder = null) {
  try {
    customers.length = 0; // 清空数组
    const list = await ApiService.customers.list();
    customers.push(...list);
  } catch (e) {
    console.error('加载客户列表失败:', e);
    customers.length = 0;
  }

  if (!customerSelectEl) return;

  // 记录刷新前的选择值（可能是编辑模式预设的 id 或用户已选择的值）
  const prev = customerSelectEl.value;
  customerSelectEl.innerHTML = [
    '<option value="">请选择客户（必选）</option>',
    ...customers.map(c => `<option value="${c.id}">${c.name}${c.grade ? ` (${c.grade})` : ''}</option>`)
  ].join('');

  // 优先使用编辑模式的客户 id 回填；否则保持刷新前的选择值
  const targetVal = (origOrder && origOrder.customerId != null) ? String(origOrder.customerId) : prev;
  if (targetVal) {
    try {
      customerSelectEl.value = String(targetVal);
    } catch (_) { }
  }
}

/**
 * 加载货代列表
 * @param {HTMLElement} forwarderSelectEl - 货代选择框元素
 * @param {Array} forwarders - 货代数组（引用传递，会被更新）
 * @param {Object} origOrder - 原始订单数据（编辑模式）
 * @returns {Promise<void>}
 */
export async function loadForwarders(forwarderSelectEl, forwarders, origOrder = null) {
  try {
    forwarders.length = 0; // 清空数组
    // 支持分页API，这里传入较大pageSize以获取所有
    const result = await ApiService.forwarders.list({ page: 1, pageSize: 100 });
    // 兼容返回格式：可能是 { data: [], ... } 或直接是 []
    const list = Array.isArray(result) ? result : (result.data || []);
    forwarders.push(...list);
  } catch (e) {
    console.error('加载货代列表失败:', e);
    forwarders.length = 0;
  }

  if (!forwarderSelectEl) return;

  // 记录刷新前的选择值
  const prev = forwarderSelectEl.value;
  forwarderSelectEl.innerHTML = [
    '<option value="">请选择货代</option>',
    ...forwarders.map(f => `<option value="${f.name}">${f.name}</option>`)
  ].join('');

  // 回填逻辑：
  // 1. 编辑模式下，使用 origOrder.forwarder
  // 2. 否则使用之前的选择值 prev
  const targetVal = (origOrder && origOrder.forwarder) ? String(origOrder.forwarder) : prev;
  
  if (targetVal) {
    try {
      // 检查是否存在
      const exists = Array.from(forwarderSelectEl.options).some(opt => opt.value === targetVal);
      if (!exists) {
         // 如果是历史遗留数据（列表中不存在的货代），创建一个选项并选中
         const opt = document.createElement('option');
         opt.value = targetVal;
         opt.text = targetVal + ' (历史记录)';
         forwarderSelectEl.add(opt);
      }
      forwarderSelectEl.value = targetVal;
    } catch (_) { }
  }
}

/**
 * 加载下一个合同编号
 * @param {HTMLElement} contractNoInput - 合同编号输入框
 * @param {Function} updateContractNoDisplay - 更新合同编号显示的函数
 * @param {Function} checkContractNoAndSwitchToC - 检查合同编号并切换到C类品的函数
 * @returns {Promise<void>}
 */
export async function loadNextContractNo(contractNoInput, updateContractNoDisplay, checkContractNoAndSwitchToC) {
  console.log('[DataLoader] loadNextContractNo called');
  try {
    const result = await ApiService.orders.nextContractNo();
    console.log('[DataLoader] nextContractNo result:', result);

    if (result && result.nextContractNo) {
      if (contractNoInput) {
        console.log('[DataLoader] Setting contractNo to:', result.nextContractNo);
        // If input is empty, set it
        if (!contractNoInput.value.trim()) {
          contractNoInput.value = result.nextContractNo;
          console.log('自动填充合同编号:', result.data.nextContractNo);
          if (updateContractNoDisplay) {
            updateContractNoDisplay(); // 更新表头显示
          }
          // 检查合同编号格式，如果匹配SC2025-220(NO.28888)格式，自动切换到C类品
          if (checkContractNoAndSwitchToC) {
            setTimeout(() => {
              checkContractNoAndSwitchToC();
            }, 50);
          }
        } else {
          console.log('[DataLoader] ContractNo input already has value:', contractNoInput.value);
        }
      } else {
        console.warn('[DataLoader] contractNoInput element is missing!');
      }
    } else {
      console.warn('[DataLoader] nextContractNo returned success=false or no data', result);
    }
  } catch (error) {
    console.error('获取合同编号失败:', error);
  }
}

/**
 * 加载订单数据（编辑模式）
 * @param {string|number} orderId - 订单ID
 * @returns {Promise<Object|null>} 订单数据或null
 */
export async function loadOrderData(orderId) {
  try {
    const order = await ApiService.orders.get(orderId);
    return order;
  } catch (error) {
    console.error('加载订单数据失败:', error);
    return null;
  }
}

/**
 * 回填订单数据到表单
 * @param {Object} order - 订单数据
 * @param {Object} options - 选项对象
 * @param {HTMLElement} options.contractNoInput - 合同编号输入框
 * @param {HTMLElement} options.dateInput - 日期输入框
 * @param {HTMLElement} options.shipmentDateInput - 发货日期输入框
 * @param {Function} options.updateContractNoDisplay - 更新合同编号显示的函数
 * @param {Function} options.addProdRow - 添加产品行的函数
 * @param {Function} options.updateTotalRow - 更新合计行的函数
 * @param {Function} options.calculateTotalAmount - 计算总金额的函数
 */
export function fillOrderForm(order, options = {}) {
  const {
    contractNoInput,
    dateInput,
    shipmentDateInput,
    updateContractNoDisplay,
    addProdRow,
    updateTotalRow,
    calculateTotalAmount
  } = options;

  if (!order) return;

  // 回填合同编号
  if (contractNoInput && order.contractNo) {
    contractNoInput.value = order.contractNo;
    if (updateContractNoDisplay) {
      updateContractNoDisplay();
    }
  }

  // 回填日期
  if (dateInput && order.invoiceDate) {
    dateInput.value = normalizeDateTextToISO(order.invoiceDate);
  }

  // 回填发货日期
  if (shipmentDateInput && order.shipmentDate) {
    shipmentDateInput.value = normalizeDateTextToISO(order.shipmentDate);
  }

  // 回填其他字段
  const fieldMappings = {
    'blNo': order.blNo,
    'invoiceNo': order.invoiceNo,
    'shippedPerSs': order.shippedPerSs,
    'shipFrom': order.shipFrom,
    'shipTo': order.shipTo,
    'ordAmount': order.totalUSD,
    'orderStatus': order.status
  };

  Object.entries(fieldMappings).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) {
      el.value = String(value);
    }
  });

  // 回填产品明细
  if (order.items && Array.isArray(order.items) && order.items.length > 0) {
    if (addProdRow) {
      order.items.forEach((item, index) => {
        addProdRow(item, index === 0);
      });
    }
  }

  // 更新合计和总金额
  if (updateTotalRow) {
    setTimeout(() => {
      updateTotalRow();
    }, 100);
  }

  if (calculateTotalAmount) {
    setTimeout(() => {
      calculateTotalAmount();
    }, 100);
  }
}

