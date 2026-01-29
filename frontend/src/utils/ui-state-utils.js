/**
 * UI状态更新工具模块
 * 负责更新各种UI元素的状态
 */

/**
 * 更新批量删除按钮显示状态
 * @param {string} checkboxSelector - 复选框选择器，默认为 '.order-checkbox'
 * @param {string} buttonId - 按钮ID，默认为 'btnDeleteSelectedOrders'
 * @param {string} buttonTextPrefix - 按钮文本前缀，默认为 '删除订单'
 */
export function updateBatchDeleteButton(
  checkboxSelector = '.order-checkbox',
  buttonId = 'btnDeleteSelectedOrders',
  buttonTextPrefix = '删除订单'
) {
  const selectedCheckboxes = document.querySelectorAll(`${checkboxSelector}:checked`);
  const btnDeleteSelected = document.getElementById(buttonId);
  if (btnDeleteSelected) {
    if (selectedCheckboxes.length > 0) {
      btnDeleteSelected.style.display = 'inline-block';
      btnDeleteSelected.textContent = `${buttonTextPrefix} (${selectedCheckboxes.length})`;
    } else {
      btnDeleteSelected.style.display = 'none';
    }
  }
}

/**
 * 更新全选复选框状态
 * @param {string} checkboxSelector - 复选框选择器，默认为 '.order-checkbox'
 * @param {string} selectAllId - 全选复选框ID，默认为 'selectAllOrders'
 */
export function updateSelectAllState(
  checkboxSelector = '.order-checkbox',
  selectAllId = 'selectAllOrders'
) {
  const allCheckboxes = document.querySelectorAll(checkboxSelector);
  const checkedCheckboxes = document.querySelectorAll(`${checkboxSelector}:checked`);
  const selectAllCheckbox = document.getElementById(selectAllId);
  
  if (selectAllCheckbox && allCheckboxes.length > 0) {
    if (checkedCheckboxes.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (checkedCheckboxes.length === allCheckboxes.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }
}

/**
 * 更新活跃筛选条件计数
 * @param {Array<string>} filterFieldIds - 筛选字段ID数组
 * @param {string} countElementId - 计数显示元素ID，默认为 'activeFiltersCount'
 */
export function updateActiveFiltersCount(
  filterFieldIds = [
    'fltOrderNo',
    'fltCustomer',
    'fltStatus',
    'fltDate',
    'fltDestination',
    'fltProductModel'
  ],
  countElementId = 'activeFiltersCount'
) {
  const activeFiltersCountEl = document.getElementById(countElementId);
  if (!activeFiltersCountEl) return;

  let count = 0;
  filterFieldIds.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field && field.value.trim()) {
      count++;
    }
  });

  activeFiltersCountEl.textContent = count > 0 ? `(${count}个条件)` : '(0个条件)';
  
  if (count > 0) {
    activeFiltersCountEl.classList.add('has-filters');
  } else {
    activeFiltersCountEl.classList.remove('has-filters');
  }
}

