/**
 * 订单编辑页面 - 产品明细管理模块
 * 负责产品明细行的增删改查、拖拽排序、表头更新等功能
 *
 * 使用工厂函数模式，接收依赖并返回所需函数
 */

// 导入依赖
import { extractOrderNoFromContractNo } from './order-utils.js';
import { normalizeOrderItem, resolveCClassMarksSecondLine } from './order-item-marks.js';
import {
  calculateEstimatedWeight,
  calculatePacking,
  updateTotalRow,
  calculateTotalAmount
} from './order-calculator.js';
import { mountOrderProductTableHeader } from './order-product-table-header.js';
import { resolveOrderEditRoot } from '../../utils/dom-utils.js';

/**
 * 创建产品明细管理器
 * @param {Object} dependencies - 依赖对象
 * @param {HTMLElement} dependencies.prodTbody - 产品明细表格tbody元素
 * @param {Object} dependencies.currentProductTypeRef - 当前产品类型的引用对象（{current: number}）
 * @param {Function} [dependencies.scheduleSaveDraft] - 草稿保存调度函数（可延迟，也可用 getScheduleSaveDraft）
 * @param {Function} [dependencies.getScheduleSaveDraft] - 返回草稿保存函数的 getter（支持延迟绑定）
 * @param {Function} [dependencies.updateProductTypeDisplay] - 更新产品类型显示函数（可延迟，也可用 getUpdateProductTypeDisplay）
 * @param {Function} [dependencies.getUpdateProductTypeDisplay] - 返回该函数的 getter（支持延迟绑定）
 * @param {Object} dependencies.packingDecimalWarningShown - 包装数量小数校验提醒标志对象
 * @param {Function} [dependencies.calculateTotalAmountWrapper] - 计算总金额包装函数（可延迟，也可用 getCalculateTotalAmount）
 * @param {Function} [dependencies.getCalculateTotalAmount] - 返回该函数的 getter（支持延迟绑定）
 * @param {Function} [dependencies.updateTotalRowWrapper] - 更新合计行包装函数（可延迟，也可用 getUpdateTotalRow）
 * @param {Function} [dependencies.getUpdateTotalRow] - 返回该函数的 getter（支持延迟绑定）
 * @returns {Object} 产品明细管理函数集合
 */
export function createProductManager(dependencies) {
  const {
    prodTbody,
    currentProductTypeRef,
    scheduleSaveDraft: _scheduleSaveDraft,
    getScheduleSaveDraft,
    updateProductTypeDisplay: _updateProductTypeDisplay,
    getUpdateProductTypeDisplay,
    packingDecimalWarningShown,
    calculateTotalAmountWrapper: _calculateTotalAmountWrapper,
    getCalculateTotalAmount,
    updateTotalRowWrapper: _updateTotalRowWrapper,
    getUpdateTotalRow,
    configs: _configs = {},
    getConfigs
  } = dependencies;

  // getter 辅助：优先用 getter（延迟绑定），否则用直接传入的值
  function scheduleSaveDraft(...args) {
    const fn = getScheduleSaveDraft ? getScheduleSaveDraft() : _scheduleSaveDraft;
    if (typeof fn === 'function') fn(...args);
  }
  function updateProductTypeDisplay(...args) {
    const fn = getUpdateProductTypeDisplay ? getUpdateProductTypeDisplay() : _updateProductTypeDisplay;
    if (typeof fn === 'function') fn(...args);
  }
  function calculateTotalAmountWrapper(...args) {
    const fn = getCalculateTotalAmount ? getCalculateTotalAmount() : _calculateTotalAmountWrapper;
    if (typeof fn === 'function') fn(...args);
  }
  function updateTotalRowWrapper(...args) {
    const fn = getUpdateTotalRow ? getUpdateTotalRow() : _updateTotalRowWrapper;
    if (typeof fn === 'function') fn(...args);
  }

  // configs 通过 getter 延迟获取，支持 orderConfigs 异步加载后才就绪
  function getResolvedConfigs() {
    return (getConfigs ? getConfigs() : null) || _configs || {};
  }

  // 获取当前产品类型的辅助函数（唯一真源：currentProductTypeRef，与表头、switchTemplate 一致）
  function getCurrentProductType() {
    return currentProductTypeRef.current;
  }

  /** @returns {1|2|3} */
  function normalizeLineTemplateType(raw) {
    const t = Number(raw);
    if (t === 2 || t === 3) return t;
    return 1;
  }

  /**
   * 从 DOM 读取当前可见的产品类型（供调试/紧急兜底使用）。
   * 优先级与 getEffectiveOrderProductType 保持一致：先看 .btn-template.active，再看 #section-products class。
   * 注意：正常流程中 currentProductTypeRef 是唯一真值，此函数不应在 addProdRow 中修改 ref。
   * @returns {1|2|3|null}
   */
  function resolveProductTypeFromDom() {
    let root =
      prodTbody && typeof prodTbody.closest === 'function'
        ? prodTbody.closest('#view-orders-edit')
        : null;
    if (!root) root = document.querySelector('#view-orders-edit.view-active');
    if (!root) root = document.getElementById('view-orders-edit');
    const scope = root || document;
    // 与 getEffectiveOrderProductType 保持相同优先级：先看 Tab active，再看 section class
    const activeBtn = scope.querySelector('.btn-template.active[data-template]');
    if (activeBtn) {
      return normalizeLineTemplateType(activeBtn.getAttribute('data-template'));
    }
    const section = root ? root.querySelector('#section-products') : document.getElementById('section-products');
    if (section) {
      if (section.classList.contains('template-3')) return 3;
      if (section.classList.contains('template-2')) return 2;
      if (section.classList.contains('template-1')) return 1;
    }
    return null;
  }

  // 拖拽排序相关状态
  let draggingRow = null;
  let dragIndicatorTarget = null;

  // 工具函数：规范化extras对象
  function normalizeExtrasObj(ex) {
    if (!ex) return {};
    if (typeof ex === 'string') {
      try {
        const o = JSON.parse(ex);
        return o && typeof o === 'object' ? o : {};
      } catch (_) {
        return {};
      }
    }
    return typeof ex === 'object' && ex ? ex : {};
  }

  // 工具函数：渲染extras内联文本
  function renderItemExtrasInline(ex) {
    const obj = normalizeExtrasObj(ex);
    const parts = [];
    if (obj.size) parts.push(`规格：${obj.size}`);
    if (obj.color) parts.push(`颜色：${obj.color}`);
    if (obj.spec) parts.push(`参数：${obj.spec}`);
    if (obj.remark) parts.push(`备注：${obj.remark}`);
    return parts.join('；');
  }

  // 清除拖拽指示器
  function clearDragOverIndicator() {
    if (!prodTbody) return;
    const rows = Array.from(prodTbody.querySelectorAll('tr'));
    rows.forEach((r) => {
      r.classList.remove('drag-over-before');
      r.classList.remove('drag-over-after');
    });
    dragIndicatorTarget = null;
  }

  // 应用拖拽指示器
  function applyDragOverIndicator(row, before) {
    if (!row) return;
    if (dragIndicatorTarget && dragIndicatorTarget !== row) {
      dragIndicatorTarget.classList.remove('drag-over-before');
      dragIndicatorTarget.classList.remove('drag-over-after');
    }
    dragIndicatorTarget = row;
    if (before) {
      row.classList.add('drag-over-before');
      row.classList.remove('drag-over-after');
    } else {
      row.classList.add('drag-over-after');
      row.classList.remove('drag-over-before');
    }
  }

  // 渲染行号
  function renderRowIndices() {
    const rows = Array.from(prodTbody.querySelectorAll('tr'));
    rows.forEach((r, idx) => {
      const idxEl = r.querySelector('.row-index');
      if (idxEl) idxEl.textContent = String(idx + 1);
    });
  }

  // 更新行选中高亮
  function updateRowSelectionHighlight() {
    const rows = Array.from(prodTbody.querySelectorAll('tr'));
    rows.forEach((r) => {
      const ck = r.querySelector('.row-check');
      if (ck && ck.checked) r.classList.add('selected');
      else r.classList.remove('selected');
    });
  }

  // 更新删除按钮显示状态
  function updateDeleteButtonVisibility() {
    const btnDel = document.getElementById('btnDelSelected');
    if (!btnDel) return;
    const rows = Array.from(prodTbody.querySelectorAll('tr'));
    const hasChecked = rows.some((r) => {
      const ck = r.querySelector('.row-check');
      return ck && ck.checked;
    });
    btnDel.style.display = hasChecked ? 'inline-block' : 'none';
  }

  // 渲染 select 选项的辅助函数
  // 核心原则：无论配置列表中是否包含已保存的值，都应该显示已保存的内容
  function renderOptions(category, selectedValue, placeholder = '请选择') {
    const configs = getResolvedConfigs();
    let categoryConfigs = configs[category] || [];
    
    // 如果有已保存的值，且该值不在配置列表中，将其添加到选项列表中
    // 这样可以防止配置变更或其他软件问题导致已保存内容不显示
    if (selectedValue && selectedValue.trim()) {
      const configValues = new Set(categoryConfigs.map((cfg) => cfg.value));
      if (!configValues.has(selectedValue)) {
        // 将已保存的值添加到列表开头（配置列表可能为空）
        categoryConfigs = [{ value: selectedValue }, ...categoryConfigs];
      }
    }

    let options = `<option value="">${placeholder}</option>`;
    categoryConfigs.forEach((cfg) => {
      const val = cfg.value;
      options += `<option value="${val}"${val === selectedValue ? ' selected' : ''}>${val}</option>`;
    });
    return options;
  }

  // 从行中提取数据
  function extractRowData(row) {
    const data = {};
    const fields = [
      'model',
      'quantity',
      'packages',
      'unit',
      'unitPrice',
      'actualWeight',
      'estimatedWeightInput',
      'labelWeight',
      'safetyFactor',
      'cleanliness',
      'labelBatchNo',
      'label',
      'packing',
      'wrappingCloth',
      'marks',
      'enabled'
    ];

    fields.forEach((field) => {
      const input = row.querySelector(`[data-field="${field}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          data[field] = input.checked;
        } else {
          data[field] = input.value || '';
        }
      }
    });

    // 特殊处理：estimatedWeightInput 对应 weight 字段
    if (data.estimatedWeightInput !== undefined) {
      data.weight = data.estimatedWeightInput;
    }

    // 提取 extras
    try {
      if (row.dataset.itemExtras) {
        data.extras = JSON.parse(row.dataset.itemExtras);
      }
    } catch (_) {}

    return data;
  }

  // 添加产品行
  function addProdRow(data, isNewRow = false) {
    const tr = document.createElement('tr');
    const unit = (data && data.unit) || '';

    // 如果 data 为 null 或 undefined，初始化为空对象
    if (!data) {
      data = {};
    }
    data = normalizeOrderItem(data);

    // ref 是唯一可信来源（由 switchTemplate 唯一写入）
    const currentType = normalizeLineTemplateType(getCurrentProductType());

    const contractNoForMarks =
      typeof document !== 'undefined' && document.getElementById('contractNo')
        ? String(document.getElementById('contractNo').value || '').trim()
        : '';
    let cMarksInitial = data.marks && String(data.marks).trim() ? String(data.marks).trim() : '';
    if (!isNewRow && currentType === 3 && !cMarksInitial) {
      cMarksInitial = resolveCClassMarksSecondLine(data, contractNoForMarks) || '';
    }
    const cMarksAttr = String(cMarksInitial)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
    if (currentType === 1) {
      // A类品：标签重量、安全系数
      tr.innerHTML = `
        <td class="checkbox-col">
          <span class="drag-handle" title="拖拽排序" aria-label="拖拽排序" draggable="true"></span>
          <input type="checkbox" class="row-check" />
        </td>
        <td class="common-section"><div class="model-field"><span class="row-index"></span><input class="input" data-field="model" placeholder="型号" value="${(data && data.model) || ''}" autocomplete="off" /></div></td>
        <td class="common-section"><input class="input" data-field="quantity" type="number" step="1" placeholder="数量" value="${(data && data.quantity) || ''}" /></td>
        <td class="common-section"><input class="input" data-field="packages" type="number" step="1" placeholder="件数" value="${(data && data.packages) || ''}" /></td>
        <td class="common-section">
          <select class="select" data-field="unit" style="background-color: ${unit && unit !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('unit', unit)}
          </select>
        </td>
        <td class="common-section"><input class="input" data-field="unitPrice" type="number" step="0.01" placeholder="单价" value="${data && data.unitPrice ? (isNaN(parseFloat(data.unitPrice)) ? data.unitPrice : parseFloat(data.unitPrice).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="actualWeight" type="number" step="0.01" placeholder="实际重量" value="${data && data.actualWeight ? (isNaN(parseFloat(data.actualWeight)) ? data.actualWeight : parseFloat(data.actualWeight).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="estimatedWeightInput" type="number" step="0.01" placeholder="预估重量" value="${data && data.weight ? (isNaN(parseFloat(data.weight)) ? data.weight : parseFloat(data.weight).toFixed(2)) : ''}" /></td>
        <td class="common-section">
          <select class="select" data-field="cleanliness" style="background-color: ${data && data.cleanliness && data.cleanliness !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('cleanliness', data && data.cleanliness)}
          </select>
        </td>
        <td class="common-section">
          <select class="select" data-field="wrappingCloth" style="background-color: ${data && data.wrappingCloth && data.wrappingCloth !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('wrapping_cloth', data && data.wrappingCloth)}
          </select>
        </td>
        <td class="variable-section"><input class="input" data-field="labelWeight" type="text" placeholder="标签重量" value="${isNewRow ? '1000' : data && data.labelWeight !== undefined && data.labelWeight !== null ? String(data.labelWeight) : ''}" style="background-color: #ffffff;" /></td>
        <td class="variable-section">
          <select class="select" data-field="safetyFactor" style="background-color: ${data && data.safetyFactor && data.safetyFactor !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('safety_factor', data && data.safetyFactor)}
          </select>
        </td>
        <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="packing" type="text" placeholder="包装" readonly /></td>
        <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="estimatedWeight" type="number" step="0.01" placeholder="预估重量" readonly /></td>
        <td class="calc-section">
          <label class="switch">
            <input type="checkbox" data-field="enabled" ${!data || data.enabled !== false ? 'checked' : ''} />
            <span class="switch-slider"></span>
          </label>
        </td>
      `;
    } else if (currentType === 2) {
      // B类品：标签批号、标签说明
      tr.innerHTML = `
        <td class="checkbox-col">
          <span class="drag-handle" title="拖拽排序" aria-label="拖拽排序" draggable="true"></span>
          <input type="checkbox" class="row-check" />
        </td>
        <td class="common-section"><div class="model-field"><span class="row-index"></span><input class="input" data-field="model" placeholder="型号" value="${(data && data.model) || ''}" autocomplete="off" /></div></td>
        <td class="common-section"><input class="input" data-field="quantity" type="number" step="1" placeholder="数量" value="${(data && data.quantity) || ''}" /></td>
        <td class="common-section"><input class="input" data-field="packages" type="number" step="1" placeholder="件数" value="${(data && data.packages) || ''}" /></td>
        <td class="common-section">
          <select class="select" data-field="unit" style="background-color: ${unit && unit !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('unit', unit)}
          </select>
        </td>
        <td class="common-section"><input class="input" data-field="unitPrice" type="number" step="0.01" placeholder="单价" value="${data && data.unitPrice ? (isNaN(parseFloat(data.unitPrice)) ? data.unitPrice : parseFloat(data.unitPrice).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="actualWeight" type="number" step="0.01" placeholder="实际重量" value="${data && data.actualWeight ? (isNaN(parseFloat(data.actualWeight)) ? data.actualWeight : parseFloat(data.actualWeight).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="estimatedWeightInput" type="number" step="0.01" placeholder="预估重量" value="${data && data.weight ? (isNaN(parseFloat(data.weight)) ? data.weight : parseFloat(data.weight).toFixed(2)) : ''}" /></td>
        <td class="common-section">
          <select class="select" data-field="cleanliness" style="background-color: ${data && data.cleanliness && data.cleanliness !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('cleanliness', data && data.cleanliness)}
          </select>
        </td>
        <td class="common-section">
          <select class="select" data-field="wrappingCloth">
            ${renderOptions('wrapping_cloth', data && data.wrappingCloth)}
          </select>
        </td>
        <td class="variable-section"><input class="input" data-field="labelBatchNo" type="text" placeholder="批号" value="${(data && data.labelBatchNo) || ''}" /></td>
        <td class="variable-section">
          <select class="select" data-field="label" style="background-color: ${data && data.label && data.label !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('label_b', data && data.label)}
          </select>
        </td>
        <td class="calc-section"><input class="input" data-field="packing" type="text" placeholder="包装" readonly style="background-color: #f5f5f5;" /></td>
        <td class="calc-section"><input class="input" data-field="estimatedWeight" type="number" step="0.01" placeholder="预估重量" readonly /></td>
        <td class="calc-section">
          <label class="switch">
            <input type="checkbox" data-field="enabled" ${!data || data.enabled !== false ? 'checked' : ''} />
            <span class="switch-slider"></span>
          </label>
        </td>
      `;
    } else if (currentType === 3) {
      // C类品：标签说明、唛头
      tr.innerHTML = `
        <td class="checkbox-col">
          <span class="drag-handle" title="拖拽排序" aria-label="拖拽排序" draggable="true"></span>
          <input type="checkbox" class="row-check" />
        </td>
        <td class="common-section"><div class="model-field"><span class="row-index"></span><input class="input" data-field="model" placeholder="型号" value="${(data && data.model) || ''}" autocomplete="off" /></div></td>
        <td class="common-section"><input class="input" data-field="quantity" type="number" step="1" placeholder="数量" value="${(data && data.quantity) || ''}" /></td>
        <td class="common-section"><input class="input" data-field="packages" type="number" step="1" placeholder="件数" value="${(data && data.packages) || ''}" /></td>
        <td class="common-section">
          <select class="select" data-field="unit" style="background-color: ${unit && unit !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('unit', unit)}
          </select>
        </td>
        <td class="common-section"><input class="input" data-field="unitPrice" type="number" step="0.01" placeholder="单价" value="${data && data.unitPrice ? (isNaN(parseFloat(data.unitPrice)) ? data.unitPrice : parseFloat(data.unitPrice).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="actualWeight" type="number" step="0.01" placeholder="实际重量" value="${data && data.actualWeight ? (isNaN(parseFloat(data.actualWeight)) ? data.actualWeight : parseFloat(data.actualWeight).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="estimatedWeightInput" type="number" step="0.01" placeholder="预估重量" value="${data && data.weight ? (isNaN(parseFloat(data.weight)) ? data.weight : parseFloat(data.weight).toFixed(2)) : ''}" /></td>
        <td class="common-section">
          <select class="select" data-field="cleanliness" style="background-color: ${data && data.cleanliness && data.cleanliness !== '' ? '#ffffff' : isNewRow ? '#e8f5e8' : '#ffcccc'};">
            ${renderOptions('cleanliness', data && data.cleanliness)}
          </select>
        </td>
        <td class="common-section">
          <select class="select" data-field="wrappingCloth">
            ${renderOptions('wrapping_cloth', data && data.wrappingCloth)}
          </select>
        </td>
        <td class="variable-section">
          <select class="select" data-field="label" style="background-color: ${data && data.label && data.label !== '' ? '#ffffff' : '#ffffff'};">
            ${renderOptions('label_c', data && data.label)}
          </select>
        </td>
        <td class="variable-section"><input class="input" data-field="marks" type="text" placeholder="唛头" value="${cMarksAttr}" /></td>
        <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="packing" type="text" placeholder="包装" readonly /></td>
        <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="estimatedWeight" type="number" step="0.01" placeholder="预估重量" readonly /></td>
        <td class="calc-section">
          <label class="switch">
            <input type="checkbox" data-field="enabled" ${!data || data.enabled !== false ? 'checked' : ''} />
            <span class="switch-slider"></span>
          </label>
        </td>
      `;
    }

    // 将 extras 以 JSON 挂到行上，便于保存时合并保留
    try {
      tr.dataset.itemExtras = JSON.stringify(normalizeExtrasObj((data && data.extras) || {}));
    } catch (_) {
      tr.dataset.itemExtras = '{}';
    }

    tr.setAttribute('data-line-template', String(currentType));

    prodTbody.appendChild(tr);

    // C类品：包皮布选择变化时，自动填充或清空唛头
    if (currentType === 3) {
      const wrappingClothSelect = tr.querySelector('select[data-field="wrappingCloth"]');
      const marksInput = tr.querySelector('input[data-field="marks"]');

      if (wrappingClothSelect && marksInput) {
        const handleWrappingClothChange = () => {
          const wrappingClothValue = wrappingClothSelect.value;
          // 更新背景色：有值时白色，无值时红色
          if (wrappingClothValue && wrappingClothValue !== '') {
            wrappingClothSelect.style.backgroundColor = '#ffffff';
          } else {
            wrappingClothSelect.style.backgroundColor = '#ffcccc';
          }

          const contractNoInput = document.getElementById('contractNo');

          if (wrappingClothValue === '要') {
            if (contractNoInput) {
              const contractNo = contractNoInput.value.trim();
              const orderNo = extractOrderNoFromContractNo(contractNo);
              if (orderNo) {
                marksInput.value = orderNo + ' QS';
                marksInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
          } else if (wrappingClothValue === '不要') {
            // 选择"不要"时，自动填写唛头为"无"
            marksInput.value = '无';
            marksInput.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (wrappingClothValue === '') {
            // 选择"请选择"时，清空唛头
            marksInput.value = '';
            marksInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        };

        // 初始化背景色：未选择时显示红色
        if (!wrappingClothSelect.value || wrappingClothSelect.value === '') {
          wrappingClothSelect.style.backgroundColor = '#ffcccc';
        } else {
          wrappingClothSelect.style.backgroundColor = '#ffffff';
        }

        wrappingClothSelect.addEventListener('change', handleWrappingClothChange);

        // 包皮布已选且唛头仍为空时初始化（新行、或编辑加载未带出持久化 marks 时）
        const shouldAutoMarksOnInit =
          (wrappingClothSelect.value === '要' || wrappingClothSelect.value === '不要') &&
          !String(marksInput.value || '').trim();
        if (shouldAutoMarksOnInit) {
          requestAnimationFrame(() => {
            handleWrappingClothChange();
          });
        }
      }
    }

    // 获取行内元素
    const unitSel = tr.querySelector('select[data-field="unit"]');
    const qtyInput = tr.querySelector('input[data-field="quantity"]');
    const pkgsInput = tr.querySelector('input[data-field="packages"]');
    const estimatedWeightInput = tr.querySelector('input[data-field="estimatedWeightInput"]');
    const readonlyEstimatedWeightInput = tr.querySelector('input[data-field="estimatedWeight"]');
    const packingInput = tr.querySelector('input[data-field="packing"]');
    const unitPriceField = tr.querySelector('input[data-field="unitPrice"]');

    // 计算预估重量包装函数
    function calculateEstimatedWeightWrapper() {
      calculateEstimatedWeight(qtyInput, estimatedWeightInput, readonlyEstimatedWeightInput, () =>
        updateTotalRow(prodTbody, addTotalRow)
      );
    }

    // 计算包装包装函数
    function calculatePackingWrapper() {
      calculatePacking(packingInput, qtyInput, pkgsInput, unitSel, {
        packingDecimalWarningShown,
        scheduleSaveDraft
      });
    }

    // 绑定计算事件
    qtyInput.addEventListener('input', calculateEstimatedWeightWrapper);
    estimatedWeightInput.addEventListener('input', calculateEstimatedWeightWrapper);
    qtyInput.addEventListener('input', calculatePackingWrapper);
    pkgsInput.addEventListener('input', calculatePackingWrapper);
    // 件数变化时更新合计行
    pkgsInput.addEventListener('input', updateTotalRowWrapper);
    if (unitSel) {
      unitSel.addEventListener('change', calculatePackingWrapper);
    }
    calculatePackingWrapper(); // 初始化时计算一次
    calculateEstimatedWeightWrapper(); // 初始化时计算一次预估重量（确保显示为整数）

    // 格式化处理
    const estimatedWeightInputField = tr.querySelector('input[data-field="estimatedWeightInput"]');
    const actualWeightField = tr.querySelector('input[data-field="actualWeight"]');
    [estimatedWeightInputField, actualWeightField].forEach((field) => {
      if (field) {
        field.addEventListener('blur', function () {
          const value = parseFloat(this.value);
          if (!isNaN(value)) {
            this.value = value.toFixed(2);
          }
        });
      }
    });

    // 标签重量字段处理：支持文字输入
    const labelWeightField = tr.querySelector('input[data-field="labelWeight"]');
    if (labelWeightField) {
      labelWeightField.addEventListener('input', function () {
        // 背景色始终保持白色
        this.style.backgroundColor = '#ffffff';
      });
    }

    // 单价字段格式化
    if (unitPriceField) {
      unitPriceField.addEventListener('blur', function () {
        const value = parseFloat(this.value);
        if (!isNaN(value)) {
          this.value = value.toFixed(2);
        }
      });
    }

    // 监听数量和单价变化以自动计算总金额
    qtyInput.addEventListener('input', calculateTotalAmountWrapper);
    // 数量变化时更新合计行
    qtyInput.addEventListener('input', updateTotalRowWrapper);
    if (unitPriceField) {
      unitPriceField.addEventListener('input', calculateTotalAmountWrapper);
    }

    // 初始化时计算一次
    calculateEstimatedWeightWrapper();

    // 绑定拖拽排序
    bindDragSortForRow(tr);

    // 如果是新行，自动聚焦到型号输入框
    if (isNewRow) {
      requestAnimationFrame(() => {
        const modelInput = tr.querySelector('input[data-field="model"]');
        if (modelInput) {
          modelInput.focus();
        }
      });
    }

    return tr;
  }

  // 绑定拖拽排序功能
  function bindDragSortForRow(tr) {
    const handle = tr.querySelector('.drag-handle');
    if (!handle) return;

    // 桌面：原生拖拽
    handle.addEventListener('dragstart', function (e) {
      draggingRow = tr;
      tr.classList.add('dragging');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
      } catch (_) {}
    });

    handle.addEventListener('dragend', function () {
      if (draggingRow) draggingRow.classList.remove('dragging');
      draggingRow = null;
      clearDragOverIndicator();
    });

    // 触摸/指针设备：Pointer 事件回退
    let pointerDragging = null;

    function onPointerMove(e) {
      if (!pointerDragging) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const targetRow = el ? el.closest('tr') : null;
      if (!targetRow || targetRow === pointerDragging) return;
      const rect = targetRow.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) prodTbody.insertBefore(pointerDragging, targetRow);
      else prodTbody.insertBefore(pointerDragging, targetRow.nextSibling);
      try {
        renderRowIndices();
      } catch (_) {}
      try {
        scheduleSaveDraft();
      } catch (_) {}
      applyDragOverIndicator(targetRow, before);
    }

    function endPointerDrag() {
      if (pointerDragging) pointerDragging.classList.remove('dragging');
      pointerDragging = null;
      prodTbody.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('touchmove', preventScrollDuringDrag);
      clearDragOverIndicator();
    }

    function preventScrollDuringDrag(e) {
      e.preventDefault();
    }

    handle.addEventListener('pointerdown', function (e) {
      const isTouchLike = e.pointerType && e.pointerType !== 'mouse';
      if (!isTouchLike) return;
      pointerDragging = tr;
      tr.classList.add('dragging');
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (_) {}
      prodTbody.addEventListener('pointermove', onPointerMove);
      prodTbody.addEventListener('pointerup', endPointerDrag, { once: true });
      document.addEventListener('touchmove', preventScrollDuringDrag, { passive: false });
    });
  }

  // 添加合计行
  function addTotalRow() {
    let totalRow = document.getElementById('totalRow');
    const currentProductType = getCurrentProductType();
    const calcSectionBgColor =
      currentProductType === 1 || currentProductType === 3 ? '#e8f5e8' : '';

    if (!totalRow) {
      totalRow = document.createElement('tr');
      totalRow.id = 'totalRow';
      totalRow.className = 'total-row';
      // 合计行结构：复选框列(1) + 产品型号列(1) + 数量列(1) + 件数列(1) + 其他通用区列(colspan) + 可变区(colspan=2) + 计算区(3列)
      // 通用区总列数：C类品9列，其他8列
      // 合计行需要：复选框(1) + "合计："(1) + 数量合计(1) + 件数合计(1) + 其他通用区(剩余列数) + 可变区(2) + 计算区(3)
      const commonColspan = currentProductType === 3 ? 9 : 8;
      const otherCommonColspan = commonColspan - 3; // 减去"合计："、数量、件数3列
      totalRow.innerHTML = `
        <td class="checkbox-col"></td>
        <td class="common-section" style="text-align: left; font-weight: bold;">合计：</td>
        <td class="common-section" style="text-align: center;"><input class="input total-quantity" type="text" readonly value="0" style="background-color: transparent; font-weight: bold; text-align: center;" /></td>
        <td class="common-section" style="text-align: center;"><input class="input total-packages" type="text" readonly value="0" style="background-color: transparent; font-weight: bold; text-align: center;" /></td>
        <td colspan="${otherCommonColspan}" class="common-section"></td>
        <td colspan="2" class="variable-section"></td>
        <td class="calc-section" style="background-color: ${calcSectionBgColor};"></td>
        <td class="calc-section" style="background-color: ${calcSectionBgColor};"><input class="input total-weight" type="text" readonly value="0" style="background-color: transparent; font-weight: bold;" /></td>
        <td class="calc-section"></td>
      `;
      prodTbody.parentNode.appendChild(totalRow);
    } else {
      // 如果合计行已存在，确保背景色正确（刷新页面时可能需要更新）
      const calcSectionCells = totalRow.querySelectorAll('.calc-section');
      // 包装列是第一个calc-section（在variable-section之后）
      // 预估总净重列是包含.total-weight输入框的calc-section
      calcSectionCells.forEach((cell, index) => {
        const hasTotalWeight = cell.querySelector('.total-weight');
        if (hasTotalWeight) {
          // 这是预估总净重列
          cell.style.backgroundColor = calcSectionBgColor;
          const totalWeightInput = cell.querySelector('.total-weight');
          if (totalWeightInput) {
            totalWeightInput.style.backgroundColor = 'transparent';
          }
        } else if (index === 0 && !cell.querySelector('input, select, label')) {
          // 这是包装列（第一个calc-section且没有输入框）
          cell.style.backgroundColor = calcSectionBgColor;
        }
      });
    }
    return totalRow;
  }

  // 更新合计行以适配当前模板
  function updateTotalRowColumns() {
    const totalRow = document.getElementById('totalRow');
    if (totalRow) {
      const commonColspan = getCurrentProductType() === 3 ? 9 : 8;
      const currentProductType = getCurrentProductType();
      const calcSectionBgColor =
        currentProductType === 1 || currentProductType === 3 ? '#e8f5e8' : '';
      const otherCommonColspan = commonColspan - 3; // 减去"合计："、数量、件数3列
      // 保存当前的数量和件数合计值
      const currentQuantity = totalRow.querySelector('.total-quantity')?.value || '0';
      const currentPackages = totalRow.querySelector('.total-packages')?.value || '0';
      const currentWeight = totalRow.querySelector('.total-weight')?.value || '0';
      totalRow.innerHTML = `
        <td class="checkbox-col"></td>
        <td class="common-section" style="text-align: left; font-weight: bold;">合计：</td>
        <td class="common-section" style="text-align: center;"><input class="input total-quantity" type="text" readonly value="${currentQuantity}" style="background-color: transparent; font-weight: bold; text-align: center;" /></td>
        <td class="common-section" style="text-align: center;"><input class="input total-packages" type="text" readonly value="${currentPackages}" style="background-color: transparent; font-weight: bold; text-align: center;" /></td>
        <td colspan="${otherCommonColspan}" class="common-section"></td>
        <td colspan="2" class="variable-section"></td>
        <td class="calc-section" style="background-color: ${calcSectionBgColor};"></td>
        <td class="calc-section" style="background-color: ${calcSectionBgColor};"><input class="input total-weight" type="text" readonly value="${currentWeight}" style="background-color: transparent; font-weight: bold;" /></td>
        <td class="calc-section"></td>
      `;
      updateTotalRowWrapper(); // 重新计算合计
    }
  }

  // 更新表头（与 order-new-page 占位逻辑共用 mountOrderProductTableHeader）
  function updateTableHeader() {
    mountOrderProductTableHeader({
      getProductType: getCurrentProductType,
      prodTbody
    });
  }

  // 切换产品类型模板
  function switchTemplate(templateNum) {
    templateNum = normalizeLineTemplateType(templateNum);
    // 注意：updateProductTypeDisplay 参数已通过依赖注入，无需再传递
    if (normalizeLineTemplateType(currentProductTypeRef.current) === templateNum) {
      console.log(
        '[产品类型切换] 已经是' +
          (templateNum === 1 ? 'A类品' : templateNum === 2 ? 'B类品' : 'C类品') +
          '，无需切换'
      );
      // ref 已一致但顶部 Tab / section class 可能未同步，仍刷新（与主路径保持相同写入顺序：先 section 后 Tab）
      const orderEditRoot = resolveOrderEditRoot(prodTbody);
      const sectionProducts = orderEditRoot
        ? orderEditRoot.querySelector('#section-products')
        : document.getElementById('section-products');
      if (sectionProducts) {
        sectionProducts.classList.remove('template-1', 'template-2', 'template-3');
        sectionProducts.classList.add('template-' + templateNum);
      }
      const templateBarScope =
        (orderEditRoot && orderEditRoot.querySelector('.template-switch-container')) || orderEditRoot;
      if (templateBarScope) {
        templateBarScope.querySelectorAll('.btn-template[data-template]').forEach((btn) => {
          btn.classList.remove('active');
        });
        const activeBtn = templateBarScope.querySelector(
          `.btn-template[data-template="${templateNum}"]`
        );
        if (activeBtn) activeBtn.classList.add('active');
      }
      return;
    }

    console.log(
      '[产品类型切换] 从' +
        (currentProductTypeRef.current === 1
          ? 'A类品'
          : currentProductTypeRef.current === 2
            ? 'B类品'
            : 'C类品') +
        '切换到' +
        (templateNum === 1 ? 'A类品' : templateNum === 2 ? 'B类品' : 'C类品')
    );

    const tbody = prodTbody;
    if (!tbody) {
      console.error('[产品类型切换] prodTbody元素不存在，无法切换');
      return;
    }

    // 保存当前所有行的数据
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const rowsData = rows.map((row) => extractRowData(row));

    // 更新当前产品类型
    currentProductTypeRef.current = templateNum;
    console.log('[产品类型切换] currentProductType 已更新为:', currentProductTypeRef.current);

    // 更新产品类型显示
    updateProductTypeDisplay();

    // 更新产品明细标题区域背景色
    const orderEditRoot = resolveOrderEditRoot(prodTbody);
    const sectionProducts = orderEditRoot
      ? orderEditRoot.querySelector('#section-products')
      : document.getElementById('section-products');
    if (sectionProducts) {
      sectionProducts.classList.remove('template-1', 'template-2', 'template-3');
      sectionProducts.classList.add('template-' + templateNum);
    }

    // 更新顶部 A/B/C 标签（与 section class 同步，保持 DOM 一致）
    const templateBarScope =
      (orderEditRoot && orderEditRoot.querySelector('.template-switch-container')) || orderEditRoot;
    if (templateBarScope) {
      templateBarScope.querySelectorAll('.btn-template[data-template]').forEach((btn) => {
        btn.classList.remove('active');
      });
      const activeBtn = templateBarScope.querySelector(
        `.btn-template[data-template="${templateNum}"]`
      );
      if (activeBtn) {
        activeBtn.classList.add('active');
      }
    }

    // 更新表头
    updateTableHeader();

    // 清空表格内容
    tbody.innerHTML = '';

    // 重新渲染所有行（保留相同字段的数据）
    rowsData.forEach((data) => {
      addProdRow(data);
    });

    // 更新合计行
    updateTotalRowColumns();

    console.log('[产品类型切换] 切换完成！当前产品类型:', currentProductTypeRef.current);

    // 重新渲染行号
    renderRowIndices();
  }

  // 渲染待处理的产品明细项
  function renderPendingItemsIfAny(pendingEditItems, isEdit) {
    if (!isEdit) return;
    const itemsToFill = Array.isArray(pendingEditItems) ? pendingEditItems : [];
    if (!itemsToFill.length) return;
    if (prodTbody) prodTbody.innerHTML = '';
    itemsToFill.forEach((it) => addProdRow(it));
    updateTotalRowWrapper(); // 编辑模式下渲染完成后更新合计
  }

  // 绑定容器级拖拽事件（拖拽经过时动态重排行）
  if (prodTbody) {
    prodTbody.addEventListener('dragover', function (e) {
      if (!draggingRow) return;
      e.preventDefault();
      const targetRow = e.target && e.target.closest ? e.target.closest('tr') : null;
      if (!targetRow || targetRow === draggingRow) return;
      const rect = targetRow.getBoundingClientRect();
      const before = e.clientY < (rect.top + rect.height / 2);
      if (before) prodTbody.insertBefore(draggingRow, targetRow);
      else prodTbody.insertBefore(draggingRow, targetRow.nextSibling);
      try { renderRowIndices(); } catch (_) { }
      try { scheduleSaveDraft(); } catch (_) { }
      applyDragOverIndicator(targetRow, before);
    });
    prodTbody.addEventListener('drop', function (e) {
      if (draggingRow) { e.preventDefault(); clearDragOverIndicator(); }
    });
    prodTbody.addEventListener('dragleave', function () { clearDragOverIndicator(); });
  }

  // 返回导出的函数集合
  return {
    normalizeExtrasObj,
    renderItemExtrasInline,
    clearDragOverIndicator,
    applyDragOverIndicator,
    renderRowIndices,
    updateRowSelectionHighlight,
    updateDeleteButtonVisibility,
    extractRowData,
    addProdRow,
    bindDragSortForRow,
    addTotalRow,
    updateTotalRowColumns,
    updateTableHeader,
    switchTemplate,
    renderPendingItemsIfAny
  };
}
