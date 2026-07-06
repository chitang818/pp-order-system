/**
 * 订单产品明细表头（A/B/C 类品）— 单一实现，供 order-new-page 占位逻辑与 order-product-manager 复用
 */

function normalizeHeaderProductType(raw) {
  const t = Number(typeof raw === 'function' ? raw() : raw);
  if (t === 2 || t === 3) return t;
  return 1;
}

/**
 * @param {Object} options
 * @param {() => number|number} options.getProductType - 当前订单类品 1|2|3
 * @param {HTMLElement|null} options.prodTbody - 用于全选联动行上的 .row-check
 */
export function mountOrderProductTableHeader(options) {
  const { getProductType, prodTbody } = options;
  const thead = document.getElementById('prodTableHead');
  const table = document.getElementById('prodTable');
  if (!thead || !table) return;

  const productType = normalizeHeaderProductType(getProductType);

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
  if (productType === 1) {
    variableSectionFields = `
        <th class="variable-section">标签<br/>重量</th>
        <th class="variable-section">安全<br/>系数</th>
      `;
  } else if (productType === 2) {
    table.classList.add('template-2');
    variableSectionFields = `
        <th class="variable-section">标签<br/>批号</th>
        <th class="variable-section">标签<br/>说明</th>
      `;
  } else {
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

  const headCk = document.getElementById('checkAllRows');
  if (headCk && prodTbody) {
    headCk.addEventListener('change', function () {
      const rows = Array.from(prodTbody.querySelectorAll('.row-check'));
      rows.forEach((ck) => {
        ck.checked = headCk.checked;
      });
    });
  }
}
