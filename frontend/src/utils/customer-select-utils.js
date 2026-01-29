/**
 * 客户选择工具模块
 * 负责填充和更新客户选择下拉框
 */

/**
 * 填充订单客户选择下拉框
 * @param {Array} customers - 客户数组
 * @param {Function} escapeHtml - HTML转义函数
 * @param {Object} options - 配置选项
 * @param {string} options.orderSelectId - 订单编辑页面客户下拉ID，默认为 'ordCustomerSelect'
 * @param {string} options.filterSelectId - 订单列表筛选客户下拉ID，默认为 'fltCustomer'
 * @param {string} options.orderPlaceholder - 订单编辑页面占位符，默认为 '选择客户'
 * @param {string} options.filterPlaceholder - 筛选下拉占位符，默认为 '全部客户'
 */
export function renderCustomerSelect(
  customers = [],
  escapeHtml,
  options = {}
) {
  const {
    orderSelectId = 'ordCustomerSelect',
    filterSelectId = 'fltCustomer',
    orderPlaceholder = '选择客户',
    filterPlaceholder = '全部客户'
  } = options;

  // 更新订单编辑页面的客户下拉
  const sel = document.getElementById(orderSelectId);
  if (sel) {
    const options = [
      `<option value="">${orderPlaceholder}</option>`,
      ...customers.map((c) => 
        `<option value="${escapeHtml(String(c.id || c.name))}">${escapeHtml(c.name)}${c.grade ? ` (${escapeHtml(c.grade)})` : ""}</option>`
      ),
    ];
    const current = sel.value;
    sel.innerHTML = options.join("");
    // 保持已选择值（若仍存在）
    if (current && [...sel.options].some((o) => o.value === current)) {
      sel.value = current;
    }
  }
  
  // 更新订单列表筛选的客户下拉
  const fltCustomer = document.getElementById(filterSelectId);
  if (fltCustomer) {
    const options = [
      `<option value="">${filterPlaceholder}</option>`,
      ...customers.map((c) => 
        `<option value="${escapeHtml(String(c.id || c.name))}">${escapeHtml(c.name)}${c.grade ? ` (${escapeHtml(c.grade)})` : ""}</option>`
      ),
    ];
    const current = fltCustomer.value;
    fltCustomer.innerHTML = options.join("");
    // 保持已选择值（若仍存在）
    if (current && [...fltCustomer.options].some((o) => o.value === current)) {
      fltCustomer.value = current;
    }
  }
}

