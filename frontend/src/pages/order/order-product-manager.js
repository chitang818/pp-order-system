/**
 * 订单编辑页面 - 产品明细管理模块
 * 负责产品明细行的增删改查、拖拽排序、表头更新等功能
 * 
 * 使用工厂函数模式，接收依赖并返回所需函数
 */

// 导入依赖
import { extractOrderNoFromContractNo } from './order-utils.js';
import { calculateEstimatedWeight, calculatePacking, updateTotalRow, calculateTotalAmount } from './order-calculator.js';

/**
 * 创建产品明细管理器
 * @param {Object} dependencies - 依赖对象
 * @param {HTMLElement} dependencies.prodTbody - 产品明细表格tbody元素
 * @param {Object} dependencies.currentProductTypeRef - 当前产品类型的引用对象（{current: number}）
 * @param {Function} dependencies.scheduleSaveDraft - 草稿保存调度函数
 * @param {Function} dependencies.updateProductTypeDisplay - 更新产品类型显示函数
 * @param {Object} dependencies.packingDecimalWarningShown - 包装数量小数校验提醒标志对象
 * @param {Function} dependencies.calculateTotalAmountWrapper - 计算总金额包装函数
 * @param {Function} dependencies.updateTotalRowWrapper - 更新合计行包装函数
 * @returns {Object} 产品明细管理函数集合
 */
export function createProductManager(dependencies) {
    const {
    prodTbody,
    currentProductTypeRef,
    scheduleSaveDraft,
    updateProductTypeDisplay,
    packingDecimalWarningShown,
    calculateTotalAmountWrapper,
    updateTotalRowWrapper,
    configs = {} // 新增配置项依赖
  } = dependencies;
  
  // 获取当前产品类型的辅助函数
  function getCurrentProductType() {
    return currentProductTypeRef.current;
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
        return (o && typeof o === 'object') ? o : {};
      } catch(_) {
        return {};
      }
    }
    return (typeof ex === 'object' && ex) ? ex : {};
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
    rows.forEach(r => {
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
    rows.forEach(r => {
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
    const hasChecked = rows.some(r => {
      const ck = r.querySelector('.row-check');
      return ck && ck.checked;
    });
    btnDel.style.display = hasChecked ? 'inline-block' : 'none';
  }

  // 渲染 select 选项的辅助函数
  function renderOptions(category, selectedValue, placeholder = '请选择') {
    let categoryConfigs = configs[category] || [];
    
    // 对于标签配置（label_b 和 label_c），如果已保存的值不在配置中，只显示该值
    if ((category === 'label_b' || category === 'label_c') && selectedValue && selectedValue.trim()) {
      const configValues = new Set(categoryConfigs.map(cfg => cfg.value));
      if (!configValues.has(selectedValue)) {
        // 只返回已保存的值（不添加到配置列表）
        categoryConfigs = [{ value: selectedValue }];
      }
    }
    
    let options = `<option value="">${placeholder}</option>`;
    categoryConfigs.forEach(cfg => {
      const val = cfg.value;
      options += `<option value="${val}"${val === selectedValue ? ' selected' : ''}>${val}</option>`;
    });
    return options;
  }

  // 从行中提取数据
  function extractRowData(row) {
    const data = {};
    const fields = [
      'model', 'quantity', 'packages', 'unit', 'unitPrice',
      'actualWeight', 'estimatedWeightInput', 'labelWeight',
      'safetyFactor', 'cleanliness', 'labelBatchNo', 'label',
      'packing', 'wrappingCloth', 'marks', 'enabled'
    ];
    
    fields.forEach(field => {
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
    } catch(_) {}
    
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
    
    // 从 extras 中提取 marks 和 wrappingCloth 字段（如果主字段中没有）
    // 这些字段存储在数据库的 extras JSON 字段中，需要在渲染前提取到主数据对象
    const itemExtras = normalizeExtrasObj((data && data.extras) || {});
    if (!data.marks && itemExtras.marks) {
      data = { ...data, marks: itemExtras.marks };
    }
    // 包皮布字段也存储在 extras 中，需要提取（修复编辑订单时包皮布不显示的BUG）
    if (!data.wrappingCloth && itemExtras.wrappingCloth) {
      data = { ...data, wrappingCloth: itemExtras.wrappingCloth };
    }
    
    // 根据当前产品类型生成不同的HTML
    const currentType = getCurrentProductType();
    if (currentType === 1) {
      // A类品：标签重量、安全系数
      tr.innerHTML = `
        <td class="checkbox-col">
          <span class="drag-handle" title="拖拽排序" aria-label="拖拽排序" draggable="true"></span>
          <input type="checkbox" class="row-check" />
        </td>
        <td class="common-section"><div class="model-field"><span class="row-index"></span><input class="input" data-field="model" placeholder="型号" value="${(data&&data.model)||''}" autocomplete="off" /></div></td>
        <td class="common-section"><input class="input" data-field="quantity" type="number" step="1" placeholder="数量" value="${(data&&data.quantity)||''}" /></td>
        <td class="common-section"><input class="input" data-field="packages" type="number" step="1" placeholder="件数" value="${(data&&data.packages)||''}" /></td>
        <td class="common-section">
          <select class="select" data-field="unit" style="background-color: ${unit && unit !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('unit', unit)}
          </select>
        </td>
        <td class="common-section"><input class="input" data-field="unitPrice" type="number" step="0.01" placeholder="单价" value="${(data&&data.unitPrice) ? (isNaN(parseFloat(data.unitPrice)) ? data.unitPrice : parseFloat(data.unitPrice).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="actualWeight" type="number" step="0.01" placeholder="实际重量" value="${(data&&data.actualWeight) ? (isNaN(parseFloat(data.actualWeight)) ? data.actualWeight : parseFloat(data.actualWeight).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="estimatedWeightInput" type="number" step="0.01" placeholder="预估重量" value="${(data&&data.weight) ? (isNaN(parseFloat(data.weight)) ? data.weight : parseFloat(data.weight).toFixed(2)) : ''}" /></td>
        <td class="common-section">
          <select class="select" data-field="cleanliness" style="background-color: ${(data&&data.cleanliness&&data.cleanliness!=='') ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('cleanliness', (data&&data.cleanliness))}
          </select>
        </td>
        <td class="common-section">
          <select class="select" data-field="wrappingCloth" style="background-color: ${(data&&data.wrappingCloth&&data.wrappingCloth!=='') ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('wrapping_cloth', (data&&data.wrappingCloth))}
          </select>
        </td>
        <td class="variable-section"><input class="input" data-field="labelWeight" type="text" placeholder="标签重量" value="${isNewRow ? '1000' : ((data&&data.labelWeight!==undefined&&data.labelWeight!==null) ? String(data.labelWeight) : '')}" style="background-color: #ffffff;" /></td>
        <td class="variable-section">
          <select class="select" data-field="safetyFactor" style="background-color: ${(data&&data.safetyFactor&&data.safetyFactor!=='') ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('safety_factor', (data&&data.safetyFactor))}
          </select>
        </td>
        <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="packing" type="text" placeholder="包装" readonly /></td>
        <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="estimatedWeight" type="number" step="0.01" placeholder="预估重量" readonly /></td>
        <td class="calc-section">
          <label class="switch">
            <input type="checkbox" data-field="enabled" ${(!data || data.enabled !== false) ? 'checked' : ''} />
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
        <td class="common-section"><div class="model-field"><span class="row-index"></span><input class="input" data-field="model" placeholder="型号" value="${(data&&data.model)||''}" autocomplete="off" /></div></td>
        <td class="common-section"><input class="input" data-field="quantity" type="number" step="1" placeholder="数量" value="${(data&&data.quantity)||''}" /></td>
        <td class="common-section"><input class="input" data-field="packages" type="number" step="1" placeholder="件数" value="${(data&&data.packages)||''}" /></td>
        <td class="common-section">
          <select class="select" data-field="unit" style="background-color: ${unit && unit !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('unit', unit)}
          </select>
        </td>
        <td class="common-section"><input class="input" data-field="unitPrice" type="number" step="0.01" placeholder="单价" value="${(data&&data.unitPrice) ? (isNaN(parseFloat(data.unitPrice)) ? data.unitPrice : parseFloat(data.unitPrice).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="actualWeight" type="number" step="0.01" placeholder="实际重量" value="${(data&&data.actualWeight) ? (isNaN(parseFloat(data.actualWeight)) ? data.actualWeight : parseFloat(data.actualWeight).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="estimatedWeightInput" type="number" step="0.01" placeholder="预估重量" value="${(data&&data.weight) ? (isNaN(parseFloat(data.weight)) ? data.weight : parseFloat(data.weight).toFixed(2)) : ''}" /></td>
        <td class="common-section">
          <select class="select" data-field="cleanliness" style="background-color: ${(data&&data.cleanliness&&data.cleanliness!=='') ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('cleanliness', (data&&data.cleanliness))}
          </select>
        </td>
        <td class="common-section">
          <select class="select" data-field="wrappingCloth">
            ${renderOptions('wrapping_cloth', (data&&data.wrappingCloth))}
          </select>
        </td>
        <td class="variable-section"><input class="input" data-field="labelBatchNo" type="text" placeholder="批号" value="${(data&&data.labelBatchNo)||''}" /></td>
        <td class="variable-section">
          <select class="select" data-field="label" style="background-color: ${(data&&data.label&&data.label!=='') ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('label_b', (data&&data.label))}
          </select>
        </td>
        <td class="calc-section"><input class="input" data-field="packing" type="text" placeholder="包装" readonly style="background-color: #f5f5f5;" /></td>
        <td class="calc-section"><input class="input" data-field="estimatedWeight" type="number" step="0.01" placeholder="预估重量" readonly /></td>
        <td class="calc-section">
          <label class="switch">
            <input type="checkbox" data-field="enabled" ${(!data || data.enabled !== false) ? 'checked' : ''} />
            <span class="switch-slider"></span>
          </label>
        </td>
      `;
    } else if (currentType === 3) {
      // C类品：唛头、标签说明
      tr.innerHTML = `
        <td class="checkbox-col">
          <span class="drag-handle" title="拖拽排序" aria-label="拖拽排序" draggable="true"></span>
          <input type="checkbox" class="row-check" />
        </td>
        <td class="common-section"><div class="model-field"><span class="row-index"></span><input class="input" data-field="model" placeholder="型号" value="${(data&&data.model)||''}" autocomplete="off" /></div></td>
        <td class="common-section"><input class="input" data-field="quantity" type="number" step="1" placeholder="数量" value="${(data&&data.quantity)||''}" /></td>
        <td class="common-section"><input class="input" data-field="packages" type="number" step="1" placeholder="件数" value="${(data&&data.packages)||''}" /></td>
        <td class="common-section">
          <select class="select" data-field="unit" style="background-color: ${unit && unit !== '' ? '#ffffff' : '#ffcccc'};">
            ${renderOptions('unit', unit)}
          </select>
        </td>
        <td class="common-section"><input class="input" data-field="unitPrice" type="number" step="0.01" placeholder="单价" value="${(data&&data.unitPrice) ? (isNaN(parseFloat(data.unitPrice)) ? data.unitPrice : parseFloat(data.unitPrice).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="actualWeight" type="number" step="0.01" placeholder="实际重量" value="${(data&&data.actualWeight) ? (isNaN(parseFloat(data.actualWeight)) ? data.actualWeight : parseFloat(data.actualWeight).toFixed(2)) : ''}" /></td>
        <td class="common-section"><input class="input" data-field="estimatedWeightInput" type="number" step="0.01" placeholder="预估重量" value="${(data&&data.weight) ? (isNaN(parseFloat(data.weight)) ? data.weight : parseFloat(data.weight).toFixed(2)) : ''}" /></td>
        <td class="common-section">
          <select class="select" data-field="cleanliness" style="background-color: ${(data&&data.cleanliness&&data.cleanliness!=='') ? '#ffffff' : (isNewRow ? '#e8f5e8' : '#ffcccc')};">
            ${renderOptions('cleanliness', (data&&data.cleanliness))}
          </select>
        </td>
        <td class="common-section">
          <select class="select" data-field="wrappingCloth">
            ${renderOptions('wrapping_cloth', (data&&data.wrappingCloth))}
          </select>
        </td>
        <td class="variable-section">
          <select class="select" data-field="label" style="background-color: ${(data&&data.label&&data.label!=='') ? '#ffffff' : '#ffffff'};">
            ${renderOptions('label_c', (data&&data.label))}
          </select>
        </td>
        <td class="variable-section"><input class="input" data-field="marks" type="text" placeholder="唛头" value="${(data&&(data.marks||(data.extras&&data.extras.marks)))||''}" /></td>
        <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="packing" type="text" placeholder="包装" readonly /></td>
        <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="estimatedWeight" type="number" step="0.01" placeholder="预估重量" readonly /></td>
        <td class="calc-section">
          <label class="switch">
            <input type="checkbox" data-field="enabled" ${(!data || data.enabled !== false) ? 'checked' : ''} />
            <span class="switch-slider"></span>
          </label>
        </td>
      `;
    }
    
    // 将 extras 以 JSON 挂到行上，便于保存时合并保留
    try {
      tr.dataset.itemExtras = JSON.stringify(normalizeExtrasObj((data && data.extras) || {}));
    } catch(_) {
      tr.dataset.itemExtras = '{}';
    }
    
    prodTbody.appendChild(tr);
    
    // C类品：包皮布选择变化时，自动填充或清空唛头
    if (getCurrentProductType() === 3) {
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
        
        // 如果是新行且包皮布已选择，立即填充唛头
        if (isNewRow && (wrappingClothSelect.value === '要' || wrappingClothSelect.value === '不要')) {
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
      calculateEstimatedWeight(
        qtyInput,
        estimatedWeightInput,
        readonlyEstimatedWeightInput,
        () => updateTotalRow(prodTbody, addTotalRow)
      );
    }
    
    // 计算包装包装函数
    function calculatePackingWrapper() {
      calculatePacking(
        packingInput,
        qtyInput,
        pkgsInput,
        unitSel,
        {
          packingDecimalWarningShown,
          scheduleSaveDraft
        }
      );
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
    [estimatedWeightInputField, actualWeightField].forEach(field => {
      if (field) {
        field.addEventListener('blur', function() {
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
      labelWeightField.addEventListener('input', function() {
        // 背景色始终保持白色
        this.style.backgroundColor = '#ffffff';
      });
    }
    
    // 单价字段格式化
    if (unitPriceField) {
      unitPriceField.addEventListener('blur', function() {
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
    handle.addEventListener('dragstart', function(e) {
      draggingRow = tr;
      tr.classList.add('dragging');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
      } catch(_) {}
    });
    
    handle.addEventListener('dragend', function() {
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
      const before = e.clientY < (rect.top + rect.height / 2);
      if (before) prodTbody.insertBefore(pointerDragging, targetRow);
      else prodTbody.insertBefore(pointerDragging, targetRow.nextSibling);
      try { renderRowIndices(); } catch(_) {}
      try { scheduleSaveDraft(); } catch(_) {}
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
    
    handle.addEventListener('pointerdown', function(e) {
      const isTouchLike = e.pointerType && e.pointerType !== 'mouse';
      if (!isTouchLike) return;
      pointerDragging = tr;
      tr.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch(_) {}
      prodTbody.addEventListener('pointermove', onPointerMove);
      prodTbody.addEventListener('pointerup', endPointerDrag, { once: true });
      document.addEventListener('touchmove', preventScrollDuringDrag, { passive: false });
    });
  }

  // 添加合计行
  function addTotalRow() {
    let totalRow = document.getElementById('totalRow');
    const currentProductType = getCurrentProductType();
    const calcSectionBgColor = (currentProductType === 1 || currentProductType === 3) ? '#e8f5e8' : '';
    
    if (!totalRow) {
      totalRow = document.createElement('tr');
      totalRow.id = 'totalRow';
      totalRow.className = 'total-row';
      // 合计行结构：复选框列(1) + 产品型号列(1) + 数量列(1) + 件数列(1) + 其他通用区列(colspan) + 可变区(colspan=2) + 计算区(3列)
      // 通用区总列数：C类品9列，其他8列
      // 合计行需要：复选框(1) + "合计："(1) + 数量合计(1) + 件数合计(1) + 其他通用区(剩余列数) + 可变区(2) + 计算区(3)
      const commonColspan = (currentProductType === 3) ? 9 : 8;
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
      const commonColspan = (getCurrentProductType() === 3) ? 9 : 8;
      const currentProductType = getCurrentProductType();
      const calcSectionBgColor = (currentProductType === 1 || currentProductType === 3) ? '#e8f5e8' : '';
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

  // 更新表头
  function updateTableHeader() {
    const thead = document.getElementById('prodTableHead');
    const table = document.getElementById('prodTable');
    if (!thead || !table) return;
    
    table.classList.remove('template-2', 'template-3');
    
    const commonSectionFields = `
      <th class="checkbox-col"><input type="checkbox" id="checkAllRows" title="全选/取消全选" /></th>
      <th class="common-section">产品型号</th>
      <th class="common-section">数量</th>
      <th class="common-section">件数</th>
      <th class="common-section">件数<br/>单位</th>
      <th class="common-section">单价<br/>(USD)</th>
      <th class="common-section">实际<br/>重量</th>
      <th class="common-section">预估<br/>重量</th>
      <th class="common-section">清洁度</th>
      <th class="common-section">包皮布</th>
    `;
    
    const calcSectionFields = `
      <th class="calc-section">包装</th>
      <th class="calc-section">预估<br/>总净重</th>
      <th class="calc-section">启用</th>
    `;
    
    let variableSectionFields;
    if (getCurrentProductType() === 1) {
      variableSectionFields = `
        <th class="variable-section">标签<br/>重量</th>
        <th class="variable-section">安全<br/>系数</th>
      `;
    } else if (getCurrentProductType() === 2) {
      table.classList.add('template-2');
      variableSectionFields = `
        <th class="variable-section">标签<br/>批号</th>
        <th class="variable-section">标签<br/>说明</th>
      `;
    } else if (getCurrentProductType() === 3) {
      table.classList.add('template-3');
      variableSectionFields = `
        <th class="variable-section">标签<br/>说明</th>
        <th class="variable-section">唛头</th>
      `;
    }
    
    thead.innerHTML = `
      <tr>
        ${commonSectionFields}
        ${variableSectionFields}
        ${calcSectionFields}
      </tr>
    `;
    
    // 重新绑定全选事件
    const headCk = document.getElementById('checkAllRows');
    if (headCk) {
      headCk.addEventListener('change', function() {
        const rows = Array.from(prodTbody.querySelectorAll('.row-check'));
        rows.forEach(ck => { ck.checked = headCk.checked; });
      });
    }
  }

  // 切换产品类型模板
  function switchTemplate(templateNum) {
    // 注意：updateProductTypeDisplay 参数已通过依赖注入，无需再传递
    if (currentProductTypeRef.current === templateNum) {
      console.log('[产品类型切换] 已经是' + (templateNum === 1 ? 'A类品' : templateNum === 2 ? 'B类品' : 'C类品') + '，无需切换');
      return;
    }
    
    console.log('[产品类型切换] 从' + (currentProductTypeRef.current === 1 ? 'A类品' : currentProductTypeRef.current === 2 ? 'B类品' : 'C类品') + '切换到' + (templateNum === 1 ? 'A类品' : templateNum === 2 ? 'B类品' : 'C类品'));
    
    const tbody = document.getElementById('prodTbody');
    if (!tbody) {
      console.error('[产品类型切换] prodTbody元素不存在，无法切换');
      return;
    }
    
    // 保存当前所有行的数据
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const rowsData = rows.map(row => extractRowData(row));
    
    // 更新当前产品类型
    currentProductTypeRef.current = templateNum;
    console.log('[产品类型切换] currentProductType 已更新为:', currentProductTypeRef.current);
    
    // 更新产品类型显示
    if (updateProductTypeDisplay) {
      updateProductTypeDisplay();
    }
    
    // 更新产品明细标题区域背景色
    const sectionProducts = document.getElementById('section-products');
    if (sectionProducts) {
      sectionProducts.classList.remove('template-1', 'template-2', 'template-3');
      sectionProducts.classList.add('template-' + templateNum);
    }
    
    // 更新表头
    updateTableHeader();
    
    // 清空表格内容
    tbody.innerHTML = '';
    
    // 重新渲染所有行（保留相同字段的数据）
    rowsData.forEach(data => {
      addProdRow(data);
    });
    
    // 更新合计行
    updateTotalRowColumns();
    
    // 更新按钮状态
    document.querySelectorAll('.btn-template').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.btn-template[data-template="${templateNum}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
    
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
    itemsToFill.forEach(it => addProdRow(it));
    updateTotalRowWrapper(); // 编辑模式下渲染完成后更新合计
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

