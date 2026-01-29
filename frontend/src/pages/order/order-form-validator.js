/**
 * 订单编辑页面 - 表单验证模块
 * 负责表单字段验证
 */

/**
 * 验证箱型体积
 * @param {HTMLElement} boxTypeSelect - 箱型选择框
 * @param {HTMLElement} boxVolumeInput - 箱型体积输入框
 * @param {HTMLElement} saveBtn - 保存按钮
 * @param {HTMLElement} validationTip - 验证提示元素
 * @returns {boolean} 验证是否通过
 */
export function validateBoxVolume(boxTypeSelect, boxVolumeInput, saveBtn, validationTip) {
  const boxTypeValue = boxTypeSelect ? boxTypeSelect.value.trim() : '';
  const boxVolumeValue = boxVolumeInput ? boxVolumeInput.value.trim() : '';
  
  // 如果箱型选择为"其他"，则不要求填写箱型体积和货箱数量
  if (boxTypeValue === '其他') {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';
      saveBtn.style.cursor = 'pointer';
    }
    if (validationTip) {
      validationTip.style.display = 'none';
    }
    return true;
  }
  
  // 如果选择了其他箱型但箱型体积为空，则禁用保存按钮并显示提示
  if (boxTypeValue && !boxVolumeValue) {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.style.opacity = '0.5';
      saveBtn.style.cursor = 'not-allowed';
    }
    if (validationTip) {
      validationTip.style.display = 'block';
    }
    return false;
  } else {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';
      saveBtn.style.cursor = 'pointer';
    }
    if (validationTip) {
      validationTip.style.display = 'none';
    }
    return true;
  }
}

/**
 * 绑定箱型体积验证
 * @param {Object} options - 选项对象
 * @param {HTMLElement} options.boxTypeSelect - 箱型选择框
 * @param {HTMLElement} options.boxVolumeInput - 箱型体积输入框
 * @param {HTMLElement} options.saveBtn - 保存按钮
 * @param {HTMLElement} options.validationTip - 验证提示元素
 */
export function bindBoxVolumeValidation(options = {}) {
  const { boxTypeSelect, boxVolumeInput, saveBtn, validationTip } = options;
  
  if (!boxTypeSelect || !boxVolumeInput || !saveBtn) {
    return;
  }
  
  // 创建验证函数
  const validate = () => validateBoxVolume(boxTypeSelect, boxVolumeInput, saveBtn, validationTip);
  
  // 监听箱型选择变化
  boxTypeSelect.addEventListener('change', validate);
  
  // 监听箱型体积输入变化
  boxVolumeInput.addEventListener('input', validate);
  boxVolumeInput.addEventListener('change', validate);
  
  // 初始验证
  validate();
}

