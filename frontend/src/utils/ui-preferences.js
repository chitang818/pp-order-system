/**
 * 客户端界面偏好（localStorage，按浏览器/环境持久化）
 */

const SHOW_DOCUMENT_CENTER_KEY = 'ui_show_document_center';
const SHOW_ORDER_PREVIEW_NEW_DOCS_KEY = 'ui_show_order_preview_new_docs_button';
/** 为 true 时隐藏独立旧版单据页（docs.html）顶栏「导出 PDF」按钮 */
const HIDE_OLD_DOCS_EXPORT_PDF_KEY = 'ui_hide_old_docs_export_pdf';
/** 为 false 时关闭「交易统计 → 统计概览」子页与侧栏入口 */
const SHOW_ANALYTICS_SUMMARY_KEY = 'ui_show_analytics_summary';

export function isDocumentCenterNavEnabled() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return true;
  }
  const v = localStorage.getItem(SHOW_DOCUMENT_CENTER_KEY);
  if (v === null) {
    return true;
  }
  return v !== 'false' && v !== '0';
}

/**
 * @param {boolean} show - true 显示侧栏「单据中心」并允许对应路由
 */
export function setDocumentCenterNavEnabled(show) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  localStorage.setItem(SHOW_DOCUMENT_CENTER_KEY, show ? 'true' : 'false');
  window.dispatchEvent(
    new CustomEvent('pp:document-center-nav-changed', { detail: { enabled: show } })
  );
}

/** 订单预览弹窗是否显示「生成单据（new）」按钮，默认显示 */
export function isOrderPreviewNewDocsButtonEnabled() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return true;
  }
  const v = localStorage.getItem(SHOW_ORDER_PREVIEW_NEW_DOCS_KEY);
  if (v === null) {
    return true;
  }
  return v !== 'false' && v !== '0';
}

export function setOrderPreviewNewDocsButtonEnabled(show) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  localStorage.setItem(SHOW_ORDER_PREVIEW_NEW_DOCS_KEY, show ? 'true' : 'false');
}

/** @returns {boolean} 是否隐藏旧版单据页「导出 PDF」按钮，默认 false（显示） */
export function isOldDocsExportPdfButtonHidden() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  const v = localStorage.getItem(HIDE_OLD_DOCS_EXPORT_PDF_KEY);
  return v === 'true' || v === '1';
}

/**
 * @param {boolean} hide - true 隐藏旧版 docs 页「导出 PDF」
 */
export function setOldDocsExportPdfButtonHidden(hide) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  localStorage.setItem(HIDE_OLD_DOCS_EXPORT_PDF_KEY, hide ? 'true' : 'false');
  window.dispatchEvent(
    new CustomEvent('pp:old-docs-export-pdf-hidden-changed', { detail: { hidden: hide } })
  );
}

/** 是否启用「统计概览」页（侧栏子项与默认跳转），默认启用 */
export function isAnalyticsSummaryNavEnabled() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return true;
  }
  const v = localStorage.getItem(SHOW_ANALYTICS_SUMMARY_KEY);
  if (v === null) {
    return true;
  }
  return v !== 'false' && v !== '0';
}

/**
 * @param {boolean} show - true 显示统计概览及相关入口
 */
export function setAnalyticsSummaryNavEnabled(show) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  localStorage.setItem(SHOW_ANALYTICS_SUMMARY_KEY, show ? 'true' : 'false');
  window.dispatchEvent(
    new CustomEvent('pp:analytics-summary-nav-changed', { detail: { enabled: show } })
  );
}
