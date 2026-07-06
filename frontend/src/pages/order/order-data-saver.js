/**
 * 订单编辑页面 - 数据保存模块
 * 负责订单数据的序列化、保存和草稿管理
 */

import { ApiService } from '../../api/api.js';
import { StorageService } from '../../utils/storage.js';
import { normalizeDateTextToISO } from './order-utils.js';
import { resolveOrderEditRoot } from '../../utils/dom-utils.js';

const KEY_ORDER_DRAFT = 'erp.order_draft';

function normalizeOrderProductType(raw) {
  const t = Number(raw);
  if (t === 2 || t === 3) return t;
  return 1;
}

/**
 * 校验产品表格每行的 data-line-template 是否与当前订单类品一致（防止表头/行模板混用）
 * @param {HTMLElement|null} prodTbody
 * @param {number} expectedProductType
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateProductRowsMatchOrderType(prodTbody, expectedProductType) {
  const expected = normalizeOrderProductType(expectedProductType);
  if (!prodTbody) return { ok: true };
  const rows = Array.from(prodTbody.querySelectorAll('tr'));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const attr = r.getAttribute('data-line-template');
    if (attr == null || String(attr).trim() === '') continue;
    const lineType = normalizeOrderProductType(attr);
    if (lineType !== expected) {
      return {
        ok: false,
        message: `第 ${i + 1} 行产品明细与当前订单类品（${expected === 1 ? 'A' : expected === 2 ? 'B' : 'C'}类品）模板不一致，请切换类品或删除该行后重新添加。`
      };
    }
  }
  return { ok: true };
}

/**
 * 收集产品明细数据
 * @param {HTMLElement} prodTbody - 产品表格tbody元素
 * @returns {Array} 产品明细数组
 */
export function collectProducts(prodTbody) {
  const rows = Array.from(prodTbody.querySelectorAll('tr'));
  // 先按 DOM 顺序临时生成，包含初始索引
  let items = rows.map((r, idx) => {
    const unitSel = r.querySelector('select[data-field="unit"]');
    const getVal = (sel) => {
      const el = r.querySelector(sel);
      return el ? el.value : '';
    };
    const it = {
      // 保存拖拽排序位置，用于后端持久化
      sortIndex: idx,
      model: getVal('[data-field="model"]').trim(),
      // 保留用户原始输入（字符串），避免小数或特殊格式被丢弃
      quantity: getVal('input[data-field="quantity"]').trim(),
      packages: getVal('input[data-field="packages"]').trim(),
      unit: unitSel ? unitSel.value : '',
      weight: getVal('input[data-field="estimatedWeightInput"]').trim(),
      actualWeight: getVal('input[data-field="actualWeight"]').trim(),
      packing: getVal('input[data-field="packing"]').trim(),
      wrappingCloth: getVal('[data-field="wrappingCloth"]').trim(), // 包皮布字段
      labelWeight: (function () {
        const val = getVal('input[data-field="labelWeight"]').trim();
        // 标签重量保存为整数
        if (val) {
          const num = parseFloat(val);
          return isNaN(num) ? val : Math.round(num).toString();
        }
        return val;
      })(),
      safetyFactor: getVal('select[data-field="safetyFactor"]').trim(),
      cleanliness: getVal('select[data-field="cleanliness"]').trim(),
      estimatedWeight: getVal('input[data-field="estimatedWeight"]').trim(),
      unitPrice: getVal('input[data-field="unitPrice"]').trim(),
      labelBatchNo: getVal('input[data-field="labelBatchNo"]').trim(), // B类品的标签批号字段
      label: getVal('select[data-field="label"]').trim(), // B类品/C类品的标签说明字段（均为select下拉选择）
      marks: getVal('input[data-field="marks"]').trim(), // C类品的唛头字段
      enabled: (function () {
        // 查找Switch开关中的checkbox
        const enabledInput = r.querySelector('.switch input[data-field="enabled"]') || r.querySelector('input[data-field="enabled"]');
        const isEnabled = enabledInput ? enabledInput.checked : true;
        return String(isEnabled); // 转换为 "true" 或 "false"
      })(),
      // 预留扩展：采集该行中除标准字段外的所有 data-field 作为 extras
      extras: (function () {
        const known = new Set(['model', 'quantity', 'packages', 'unit', 'weight', 'packing', 'wrappingCloth', 'labelWeight', 'safetyFactor', 'cleanliness', 'estimatedWeight', 'unitPrice', 'labelBatchNo', 'label', 'marks', 'actualWeight', 'estimatedWeightInput', 'enabled']);
        const obj = {};
        const fields = Array.from(r.querySelectorAll('[data-field]'));
        fields.forEach(el => {
          const k = el.getAttribute('data-field');
          if (!known.has(k)) obj[k] = el.value;
        });
        // 若当前行没有额外输入字段，尝试合并保存在行上的原始 extras，避免编辑后丢失
        if (!Object.keys(obj).length) {
          const raw = r.dataset.itemExtras || '{}';
          try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') return parsed; } catch (_) { }
        }
        // 双保险：将包皮布写入 extras，兼容后端从 extras 读取的情况
        if ((it.wrappingCloth || '').trim() !== '') {
          obj.wrappingCloth = (it.wrappingCloth || '').trim();
        }
        return obj;
      })()
    };
    return it;
  }).filter(it => {
    // 过滤空白行：任一文本字段非空，或任一数字字段有输入（包括0），或单位非默认"件"则保留
    const hasText = [it.model, it.packing, it.wrappingCloth, it.safetyFactor, it.cleanliness, it.labelBatchNo, it.label, it.marks].some(v => (v || '').trim() !== '');
    const hasNumberInput = [it.quantity, it.packages, it.weight, it.actualWeight, it.labelWeight, it.unitPrice].some(v => (v || '').trim() !== '');
    const unitSelected = !!it.unit && it.unit !== '';
    return hasText || hasNumberInput || unitSelected;
  });
  // 过滤后重新归一化 sortIndex，保证连续且与当前顺序一致
  items = items.map((it, i) => ({ ...it, sortIndex: i }));
  return items;
}

/**
 * 收集额外字段数据
 * @returns {Object} 额外字段对象
 */
export function collectExtras() {
  const extras = {};

  // 首先特别处理生产通知信息区域的字段，确保优先级最高
  // 特别处理生产通知信息区域的唛头说明字段（与产品明细中的唛头字段区分开）
  const marksNoteTextarea = document.querySelector('.marks-note-textarea[data-field="marksNote"]');
  if (marksNoteTextarea) {
    const marksNoteValue = (marksNoteTextarea.value || '').trim();
    extras.marksNote = marksNoteValue;
  }

  // 特别处理其他生产通知信息区域的字段，确保使用正确的元素
  const prodNoteTextarea = document.querySelector('.production-notes-textarea[data-field="prodNote"]');
  if (prodNoteTextarea) {
    extras.prodNote = (prodNoteTextarea.value || '').trim();
  }
  const boxTypeSelect = document.querySelector('.box-type-select[data-field="boxType"]');
  if (boxTypeSelect) {
    extras.boxType = (boxTypeSelect.value || '').trim();
  }
  const boxQuantitySelect = document.querySelector('.box-quantity-select[data-field="boxQuantity"]');
  if (boxQuantitySelect) {
    extras.boxQuantity = (boxQuantitySelect.value || '').trim();
  }
  const boxVolumeInput = document.querySelector('.box-volume-input[data-field="boxVolume"]');
  if (boxVolumeInput) {
    extras.boxVolume = (boxVolumeInput.value || '').trim();
  }
  const boxTypeNoteInput = document.querySelector('.box-type-note-input[data-field="boxTypeNote"]');
  if (boxTypeNoteInput) {
    extras.boxTypeNote = (boxTypeNoteInput.value || '').trim();
  }

  // 然后收集其他不在产品表格内的字段（但不会覆盖已经特别处理的字段）
  // 使用更高效的选择器，一次性获取所有需要的元素
  // 排除所有产品表格内的字段（包括 #prodTable 和 #prodTablePPBags）
  const elements = document.querySelectorAll('[data-field]:not(#prodTable [data-field]):not(#prodTablePPBags [data-field])');
  elements.forEach(el => {
    const k = el.getAttribute('data-field');
    if (k) {
      // 跳过已经特别处理的字段，避免覆盖
      // 注意：marks字段保留给产品明细使用，marksNote是生产通知信息中的唛头说明
      if (['marksNote', 'prodNote', 'boxType', 'boxQuantity', 'boxVolume', 'boxTypeNote'].includes(k)) {
        return;
      }
      // 对于 textarea 和 input，都使用 .value 获取值
      const value = (el.value || '').trim();
      // 如果字段已存在，且当前值为空，保留原值（避免覆盖）
      if (!extras[k] || value) {
        extras[k] = value;
      }
    }
  });

  return extras;
}

/**
 * 序列化订单表单数据
 * @param {Object} options - 选项对象
 * @param {HTMLElement} options.customerSelect - 客户选择框
 * @param {HTMLElement} options.contractNoInput - 合同编号输入框
 * @param {HTMLElement} options.dateInput - 日期输入框
 * @param {HTMLElement} options.shipmentDateInput - 发货日期输入框
 * @param {HTMLElement} options.prodTbody - 产品表格tbody
 * @param {Array} options.customers - 客户数组
 * @param {number} options.currentProductType - 当前产品类型
 * @param {string} options.today - 今天的日期字符串
 * @returns {Object|null} 序列化后的订单数据或null
 */
export function serializeOrderForm(options = {}) {
  const {
    customerSelect,
    contractNoInput,
    dateInput,
    shipmentDateInput,
    prodTbody,
    customers,
    currentProductType,
    today
  } = options;

  // 批量获取常用元素，减少重复查询
  const blNoInput = document.getElementById('blNo');
  const invoiceNoInput = document.getElementById('invoiceNo');
  const shippedPerSsInput = document.getElementById('shippedPerSs');
  const forwarderInput = document.getElementById('forwarder');
  const shipFromInput = document.getElementById('shipFrom');
  const shipToInput = document.getElementById('shipTo');
  const ordAmountInput = document.getElementById('ordAmount');

  // 添加空值检查，防止访问 null 元素的属性
  if (!customerSelect || !contractNoInput || !invoiceNoInput || !ordAmountInput) {
    // 静默返回，不输出警告（可能是页面已跳转，这是正常情况）
    return null;
  }

  const customerKey = customerSelect.value;
  const c = customers.find(x => String(x.id) === customerKey) || customers.find(x => String(x.name) === customerKey) || null;
  const normalizedDate = normalizeDateTextToISO(dateInput.value || today) || today;

  // 预先计算总金额
  // 优先使用 ordAmount 输入框的值，如果为空或0则从产品明细计算
  const totalUSD = (() => {
    // 优先从输入框读取
    const v = ordAmountInput ? ordAmountInput.value : '';
    const inputValue = parseFloat(v);
    console.log('[serializeOrderForm] ordAmount input value:', v, '-> parsed:', inputValue);

    if (!isNaN(inputValue) && inputValue > 0) {
      console.log('[serializeOrderForm] Using ordAmount input value:', inputValue);
      return inputValue;
    }

    // 如果输入框为空或0，从产品明细计算
    const items = collectProducts(prodTbody);
    let calculatedTotal = 0;
    items.forEach(item => {
      const qty = parseFloat(item.quantity || '0');
      const price = parseFloat(item.unitPrice || '0');
      if (!isNaN(qty) && !isNaN(price)) {
        calculatedTotal += qty * price;
      }
    });
    console.log('[serializeOrderForm] Calculated from items:', calculatedTotal, '(', items.length, 'items)');
    return calculatedTotal;
  })();

  // 优先从当前编辑视图内查找，避免 SPA 隐藏视图干扰
  const orderEditRoot = resolveOrderEditRoot(prodTbody);
  const orderStatusSelect = orderEditRoot
    ? orderEditRoot.querySelector('#orderStatus')
    : document.getElementById('orderStatus');
  const orderStatus = orderStatusSelect ? orderStatusSelect.value : '已创建';

  // 通过 DOM class 对产品类型做最终确认，防止闭包状态过期
  let actualProductType = currentProductType;
  const sectionProducts = orderEditRoot
    ? orderEditRoot.querySelector('#section-products')
    : document.getElementById('section-products');
  if (sectionProducts) {
    if (sectionProducts.classList.contains('template-3')) {
      actualProductType = 3;
    } else if (sectionProducts.classList.contains('template-2')) {
      actualProductType = 2;
    } else if (sectionProducts.classList.contains('template-1')) {
      actualProductType = 1;
    }
  }

  return {
    orderNo: invoiceNoInput.value.trim() || contractNoInput.value.trim(),
    customerId: c ? c.id : ((/^\d+$/.test(String(customerKey)) ? Number(customerKey) : null)),
    customerName: (c && c.name) || customerKey || '未指定客户',
    totalUSD,
    status: orderStatus, // 添加订单状态字段
    productType: actualProductType, // 使用通过UI修正过的真实产品类型
    contractNo: contractNoInput.value.trim(),
    blNo: blNoInput ? blNoInput.value.trim() : '',
    invoiceNo: invoiceNoInput.value.trim(),
    invoiceDate: normalizedDate,
    shipmentDate: normalizeDateTextToISO(shipmentDateInput.value || '') || '',
    shippedPerSs: shippedPerSsInput ? shippedPerSsInput.value.trim() : '',
    forwarder: forwarderInput ? forwarderInput.value.trim() : '',
    shipFrom: shipFromInput ? shipFromInput.value.trim() : '',
    shipTo: shipToInput ? shipToInput.value.trim() : '',
    items: collectProducts(prodTbody),
    extras: collectExtras(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 收集草稿数据
 * @param {Function} serializeOrderForm - 序列化订单表单的函数
 * @returns {Object|null} 草稿数据或null
 */
export function collectDraft(serializeOrderForm) {
  const d = serializeOrderForm();
  // 如果序列化失败，返回 null
  if (!d) return null;
  // 草稿不强制状态为编辑原状态
  return { ...d, customerName: d.customerName || '' };
}

/**
 * 计划保存草稿（防抖处理）
 * @param {boolean} isEdit - 是否为编辑模式
 * @param {Function} collectDraft - 收集草稿的函数
 * @returns {Function} 返回一个函数，用于触发草稿保存
 */
export function createScheduleSaveDraft(isEdit, collectDraft) {
  let draftTimer = null;

  return function scheduleSaveDraft() {
    if (isEdit) return; // 编辑模式不保存草稿

    // 检查表单元素是否存在，如果不存在说明页面已跳转，不执行草稿保存
    const customerSelect = document.getElementById('ordCustomerSelect');
    const contractNoInput = document.getElementById('contractNo');
    if (!customerSelect || !contractNoInput) {
      // 页面已跳转，清除定时器并返回
      if (draftTimer) {
        clearTimeout(draftTimer);
        draftTimer = null;
      }
      return;
    }

    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try {
        // 再次检查表单元素是否存在（防止在延迟期间页面跳转）
        const customerSelect = document.getElementById('ordCustomerSelect');
        const contractNoInput = document.getElementById('contractNo');
        if (!customerSelect || !contractNoInput) {
          // 页面已跳转，不执行草稿保存
          return;
        }

        const draft = collectDraft();
        if (draft) {
          StorageService.set(KEY_ORDER_DRAFT, draft);
        }
      } catch (e) {
        // 静默处理草稿保存错误，不影响主流程
      }
    }, 500); // 增加防抖延迟，减少频繁调用
  };
}

/**
 * 保存订单
 * @param {Object} options - 选项对象
 * @param {boolean} options.isEdit - 是否为编辑模式
 * @param {string|number} options.editId - 编辑模式下的订单ID
 * @param {Function} options.serializeOrderForm - 序列化订单表单的函数
 * @param {Array} options.customers - 客户数组
 * @returns {Promise<Object>} 保存结果
 */
export async function saveOrder(options = {}) {
  const { isEdit, editId, serializeOrderForm, customers } = options;

  // 立即显示保存中状态，提升用户体验
  const saveBtn = document.getElementById('btnSaveOrderNew');
  const originalText = saveBtn ? saveBtn.textContent : '保存订单';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    saveBtn.style.opacity = '0.6';
    // 防止双重提交的额外保护
    if (saveBtn.dataset.submitting === 'true') return;
    saveBtn.dataset.submitting = 'true';
  }

  try {
    // 在收集数据前，立即同步 textarea 的值（确保获取到最新输入）
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        // 强制同步 textarea 的值（唛头说明字段）
        const marksNoteTextarea = document.querySelector('.marks-note-textarea[data-field="marksNote"]');
        if (marksNoteTextarea) {
          // 触发 input 事件以确保值同步
          marksNoteTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        setTimeout(resolve, 0);
      });
    });

    const customerSelEl = document.getElementById('ordCustomerSelect');
    const customerSelVal = customerSelEl ? customerSelEl.value : '';

    // 异步数据采集和预处理
    const payload = await Promise.resolve(serializeOrderForm());

    if (!payload) {
      throw new Error('订单数据序列化失败');
    }

    // 并行处理数据规范化和验证
    const [processedPayload, validationResult] = await Promise.all([
      // 数据规范化处理
      new Promise(resolve => {
        try {
          if (typeof payload.items === 'string') {
            try { payload.items = JSON.parse(payload.items); } catch (_) { payload.items = []; }
          }
          if (!Array.isArray(payload.items)) payload.items = [];
          payload.items = payload.items.filter(it => {
            if (!it || typeof it !== 'object') return false;
            const hasText = [it.model, it.packing, it.safetyFactor, it.cleanliness, it.labelBatchNo, it.label].some(v => (v || '').trim() !== '');
            const hasNum = [it.quantity, it.packages, it.weight, it.actualWeight, it.labelWeight, it.unitPrice, it.amount].some(v => String(v || '').trim() !== '');
            const unitChanged = !!it.unit && it.unit !== '件';
            return hasText || hasNum || unitChanged;
          });
        } catch (_) { payload.items = Array.isArray(payload.items) ? payload.items : []; }
        resolve(payload);
      }),

      // 快速验证
      new Promise(async resolve => {
        const errors = [];

        // 检查箱型体积是否为空
        const boxTypeSelect = document.querySelector('.box-type-select[data-field="boxType"]');
        const boxVolumeInput = document.querySelector('.box-volume-input[data-field="boxVolume"]');

        if (boxTypeSelect && boxVolumeInput) {
          const boxTypeValue = boxTypeSelect.value;
          const boxVolumeValue = (boxVolumeInput.value || '').trim();

          // 如果箱型选择为"其他"，则不要求填写箱型体积和货箱数量
          // 如果选择了其他箱型但箱型体积为空，则报错
          if (boxTypeValue && boxTypeValue !== '其他' && !boxVolumeValue) {
            errors.push('箱型体积不能为空');
          }
        }

        // 验证贸易术语是否已选择
        const tradeTermSelect = document.querySelector('select[data-field="tradeTerm"]');
        if (tradeTermSelect) {
          const tradeTermValue = (tradeTermSelect.value || '').trim();
          if (!tradeTermValue || tradeTermValue === '') {
            errors.push('请选择贸易术语');
          }
        }

        if (!payload.items || payload.items.length === 0) {
          errors.push('请至少填写一条产品明细');
        }

        const prodTbodyEl = document.getElementById('prodTbody');
        if (prodTbodyEl) {
          const lineCheck = validateProductRowsMatchOrderType(
            prodTbodyEl,
            Number(payload.productType) || 1
          );
          if (!lineCheck.ok) {
            errors.push(lineCheck.message);
          }
        }

        // 验证产品明细的选择字段
        if (payload.items && payload.items.length > 0) {
          // 【思考】将 payload.productType 稳健转为 Number 类型
          const currentProductType = Number(payload.productType) || 1; // 默认为A类品

          payload.items.forEach((item, index) => {
            const rowNumber = index + 1;

            // 所有产品类型都需要选择的字段
            if (!item.unit || item.unit.trim() === '') {
              errors.push(`第${rowNumber}行：请选择件数单位`);
            }

            if (!item.cleanliness || item.cleanliness.trim() === '') {
              errors.push(`第${rowNumber}行：请选择清洁度`);
            }

            // 根据产品类型验证特定字段
            if (currentProductType === 1) {
              // A类品：需要选择安全系数（包皮布字段在A类品中被隐藏，不需要验证）
              if (!item.safetyFactor || item.safetyFactor.trim() === '') {
                errors.push(`第${rowNumber}行：请选择安全系数`);
              }
            } else if (currentProductType === 2) {
              // B类品：标签说明为下拉选择，需要验证
              // 包皮布字段在B类品中被隐藏，不需要验证
              // 标签说明验证
              if (!item.label || item.label.trim() === '') {
                errors.push(`第${rowNumber}行：请选择标签说明`);
              }
            } else if (currentProductType === 3) {
              // C类品：包皮布为必选项
              const wrappingCloth = (item.wrappingCloth || '').trim();
              if (!wrappingCloth || wrappingCloth === '') {
                errors.push(`第${rowNumber}行：包皮布为必选项，请选择包皮布`);
              }
              // 标签说明验证
              if (!item.label || item.label.trim() === '') {
                errors.push(`第${rowNumber}行：请选择标签说明`);
              }
            }
          });
        }

        // 检查合同编号是否重复（仅新建订单时检查）
        if (!isEdit && payload.contractNo && payload.contractNo.trim()) {
          try {
            const orders = await ApiService.orders.list();
            if (Array.isArray(orders)) {
              const contractNo = payload.contractNo.trim();
              const existingOrder = orders.find(order => {
                const orderContractNo = (order.contractNo || '').trim();
                return orderContractNo === contractNo;
              });
              if (existingOrder) {
                errors.push(`合同编号 "${contractNo}" 已存在，请使用其他编号`);
              }
            }
          } catch (error) {
            console.warn('[保存订单] 检查合同编号重复失败:', error);
            // 检查失败不阻止保存，让后端再次检查
          }
        }

        resolve(errors);
      })
    ]);

    // 快速验证失败处理
    if (validationResult.length > 0) {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
        saveBtn.style.opacity = '1';
        delete saveBtn.dataset.submitting;
      }
      // 显示所有验证错误
      const errorMessage = validationResult.length === 1
        ? validationResult[0]
        : validationResult.join('\n');
      throw new Error(errorMessage);
    }

    // 异步处理客户信息
    const customerInfo = await new Promise(resolve => {
      const matched = customers.find(c => String(c.id) === String(customerSelVal));
      const fallbackId = (/^\d+$/.test(String(customerSelVal))) ? Number(customerSelVal) : null;
      const customerId = matched ? matched.id : fallbackId;
      const selectedOption = customerSelEl && customerSelEl.options && customerSelEl.selectedIndex >= 0 ? customerSelEl.options[customerSelEl.selectedIndex] : null;
      const customerNameDisplay = selectedOption ? selectedOption.text : (processedPayload.customerName || '');

      // 确保 customerName 是纯名称，不包含格式化的后缀（如 " (grade)"）
      const finalCustomerName = matched ? matched.name : (customerNameDisplay ? customerNameDisplay.split(' (')[0].trim() : '');

      resolve({
        ...processedPayload,
        customerId: customerId || processedPayload.customerId,
        customerName: finalCustomerName || processedPayload.customerName || ''
      });
    });

    // 并行处理保存操作和清理任务
    const [result] = await Promise.all([
      // 主保存操作
      !isEdit || !editId
        ? ApiService.orders.create(customerInfo)
        : ApiService.orders.update(editId, customerInfo),

      // 异步清理草稿（不阻塞主流程）
      new Promise(resolve => {
        setTimeout(() => {
          try {
            if (!isEdit) StorageService.remove(KEY_ORDER_DRAFT);
          } catch (e) { }
          resolve();
        }, 0);
      })
    ]);

    if (!isEdit && (!result || !result.id)) {
      throw new Error('服务器未返回新订单ID');
    }

    // 恢复按钮状态
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
      saveBtn.style.opacity = '1';
    }

    return result;
  } catch (error) {
    // 恢复按钮状态
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
      saveBtn.style.opacity = '1';
      delete saveBtn.dataset.submitting;
    }
    throw error;
  }
}

