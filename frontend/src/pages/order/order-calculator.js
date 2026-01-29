/**
 * 订单编辑页面 - 计算功能模块
 * 提供各种计算功能
 */

/**
 * 计算预估重量（数量 × 预估重量）
 * @param {HTMLInputElement} qtyInput - 数量输入框
 * @param {HTMLInputElement} estimatedWeightInput - 预估重量输入框
 * @param {HTMLInputElement} readonlyEstimatedWeightInput - 只读预估重量显示框
 * @param {Function} updateTotalRow - 更新合计行的函数
 */
export function calculateEstimatedWeight(qtyInput, estimatedWeightInput, readonlyEstimatedWeightInput, updateTotalRow) {
  const quantity = parseFloat(qtyInput.value || '0');
  const weight = parseFloat(estimatedWeightInput.value || '0');
  if (!isNaN(quantity) && !isNaN(weight)) {
    const estimatedWeight = quantity * weight;
    // 格式化显示：仅显示整数（四舍五入）
    readonlyEstimatedWeightInput.value = Math.round(estimatedWeight).toString();
  } else {
    readonlyEstimatedWeightInput.value = '';
  }
  if (updateTotalRow) {
    updateTotalRow(); // 计算完成后更新合计
  }
}

/**
 * 计算包装（数量/件数，显示为"XX条/件数单位"）
 * @param {HTMLInputElement} packingInput - 包装输入框
 * @param {HTMLInputElement} qtyInput - 数量输入框
 * @param {HTMLInputElement} pkgsInput - 件数输入框
 * @param {HTMLSelectElement} unitSel - 件数单位选择框
 * @param {Object} options - 选项对象
 * @param {boolean} options.packingDecimalWarningShown - 是否已显示小数警告
 * @param {Function} options.scheduleSaveDraft - 保存草稿的函数
 */
export function calculatePacking(packingInput, qtyInput, pkgsInput, unitSel, options = {}) {
  if (!packingInput) return;
  const quantity = parseFloat(qtyInput.value || '0');
  const packages = parseFloat(pkgsInput.value || '0');
  const unit = unitSel ? unitSel.value : '';
  
  if (quantity > 0 && packages > 0 && unit) {
    const packingValue = quantity / packages;
    
    // 校验：如果包装数量是小数，弹窗提醒（仅提醒一次）
    if (packingValue % 1 !== 0 && !options.packingDecimalWarningShown) {
      // 立即设置标志，防止重复触发
      options.packingDecimalWarningShown = true;
      
      // 清除之前的定时器（如果存在）
      if (window.packingDecimalWarningTimer) {
        clearTimeout(window.packingDecimalWarningTimer);
      }
      
      // 延迟执行，等待用户输入完成
      window.packingDecimalWarningTimer = setTimeout(async () => {
        // 再次检查，确保数值仍然有效且是小数
        const currentQuantity = parseFloat(qtyInput.value || '0');
        const currentPackages = parseFloat(pkgsInput.value || '0');
        const currentUnit = unitSel ? unitSel.value : '';
        
        if (currentQuantity > 0 && currentPackages > 0 && currentUnit) {
          const currentPackingValue = currentQuantity / currentPackages;
          // 如果当前值仍然是小数，显示弹窗
          if (currentPackingValue % 1 !== 0) {
            // 使用统一弹窗模块显示提示
            const bodyHTML = `
              <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <div style="font-size: 16px; color: #374151; line-height: 1.6;">
                  包装数量计算结果为小数（${currentPackingValue.toFixed(2)}），请检查数量和件数是否输入正确。<br/><br/>
                  数量：${currentQuantity}<br/>
                  件数：${currentPackages}
                </div>
              </div>
            `;

            const footerHTML = `
              <button class="btn btn-primary" data-action="confirm" style="width: 100%;">确定</button>
            `;

            await window.ModalDialog.custom(bodyHTML, {
              title: '包装数量校验',
              footer: footerHTML,
              size: 'small',
              closable: false,
              clickOutsideToClose: false
            });
          }
        }
        
        // 清除定时器引用
        window.packingDecimalWarningTimer = null;
      }, 500); // 延迟500ms，等待用户输入完成
    }
    
    // 如果结果是整数，显示整数，否则显示1位小数
    const packingText = packingValue % 1 === 0 ? packingValue.toString() : packingValue.toFixed(1);
    packingInput.value = `${packingText}条/${unit}`;
  } else {
    packingInput.value = '';
  }
  // 保存草稿
  if (options.scheduleSaveDraft) {
    try {
      options.scheduleSaveDraft();
    } catch (_) {}
  }
}

/**
 * 计算并更新总金额
 * @param {HTMLElement} prodTbody - 产品表格tbody元素
 */
export function calculateTotalAmount(prodTbody) {
  const rows = Array.from(prodTbody.querySelectorAll('tr'));
  let totalAmount = 0;
  
  rows.forEach(row => {
    const qtyInput = row.querySelector('input[data-field="quantity"]');
    const priceInput = row.querySelector('input[data-field="unitPrice"]');
    if (qtyInput && priceInput) {
      const qty = parseFloat(qtyInput.value || '0');
      const price = parseFloat(priceInput.value || '0');
      if (!isNaN(qty) && !isNaN(price)) {
        totalAmount += qty * price;
      }
    }
  });
  
  const ordAmountInput = document.getElementById('ordAmount');
  if (ordAmountInput) {
    ordAmountInput.value = totalAmount.toFixed(2);
  }
}

/**
 * 更新合计行
 * @param {HTMLElement} prodTbody - 产品表格tbody元素
 * @param {Function} addTotalRow - 添加合计行的函数
 */
export function updateTotalRow(prodTbody, addTotalRow) {
  if (addTotalRow) {
    addTotalRow(); // 确保合计行存在
  }
  
  const rows = Array.from(prodTbody.querySelectorAll('tr:not(.total-row)'));
  let totalEstimatedWeight = 0;
  let totalQuantity = 0;
  let totalPackages = 0;
  
  rows.forEach(row => {
    // 计算预估总净重
    const estimatedWeightInput = row.querySelector('input[data-field="estimatedWeight"]');
    if (estimatedWeightInput && estimatedWeightInput.value) {
      const weight = parseFloat(estimatedWeightInput.value);
      if (!isNaN(weight)) {
        totalEstimatedWeight += weight;
      }
    }
    
    // 计算数量合计
    const quantityInput = row.querySelector('input[data-field="quantity"]');
    if (quantityInput && quantityInput.value) {
      const quantity = parseFloat(quantityInput.value);
      if (!isNaN(quantity)) {
        totalQuantity += quantity;
      }
    }
    
    // 计算件数合计
    const packagesInput = row.querySelector('input[data-field="packages"]');
    if (packagesInput && packagesInput.value) {
      const packages = parseFloat(packagesInput.value);
      if (!isNaN(packages)) {
        totalPackages += packages;
      }
    }
  });
  
  // 更新预估总净重
  const totalWeightInput = document.querySelector('.total-weight');
  if (totalWeightInput) {
    // 格式化显示：仅显示整数（四舍五入）
    totalWeightInput.value = Math.round(totalEstimatedWeight).toString();
  }
  
  // 更新数量合计
  const totalQuantityInput = document.querySelector('.total-quantity');
  if (totalQuantityInput) {
    // 格式化显示：去掉不必要的小数位
    totalQuantityInput.value = totalQuantity % 1 === 0 ? totalQuantity.toString() : totalQuantity.toFixed(1);
  }
  
  // 更新件数合计
  const totalPackagesInput = document.querySelector('.total-packages');
  if (totalPackagesInput) {
    // 格式化显示：去掉不必要的小数位
    totalPackagesInput.value = totalPackages % 1 === 0 ? totalPackages.toString() : totalPackages.toFixed(1);
  }
}

