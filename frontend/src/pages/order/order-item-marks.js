/**
 * C 类品唛头：归一化 order item、与预览/编辑/单据共用的展示与默认值规则
 */
import { extractOrderNoFromContractNo } from './order-utils.js';

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
  return typeof ex === 'object' ? ex : {};
}

/**
 * 合并 extras 与后端可能返回的顶层 marks / wrappingCloth
 * @param {object} item
 * @returns {object} 新对象（浅拷贝 item + 规范字段）
 */
export function normalizeOrderItem(item) {
  if (!item || typeof item !== 'object') return {};
  const ex = normalizeExtrasObj(item.extras);
  const fromTopMarks = item.marks != null && String(item.marks).trim() !== '' ? String(item.marks).trim() : '';
  const fromExMarks = ex.marks != null && String(ex.marks).trim() !== '' ? String(ex.marks).trim() : '';
  const marks = fromTopMarks || fromExMarks;
  const wrappingCloth =
    (item.wrappingCloth && String(item.wrappingCloth).trim()) ||
    (ex.wrappingCloth && String(ex.wrappingCloth).trim()) ||
    (ex.wrapping_cloth && String(ex.wrapping_cloth).trim()) ||
    '';
  return { ...item, extras: ex, marks, wrappingCloth };
}

/**
 * 持久化唛头为空时的「有效第二行」：与编辑页包皮布联动规则一致
 * @param {object} item 已 normalize 或未 normalize 均可
 * @param {string} contractNo 当前合同编号全文
 * @returns {string}
 */
export function resolveCClassMarksSecondLine(item, contractNo) {
  const n = normalizeOrderItem(item);
  if (n.marks) return n.marks;
  const w = n.wrappingCloth || '';
  if (w === '要') {
    const orderNo = extractOrderNoFromContractNo(contractNo || '');
    return orderNo ? `${orderNo} QS` : '';
  }
  if (w === '不要') return '无';
  return '';
}

/**
 * 订单列表「快速预览」弹窗的唛头列：单行，与编辑页唛头输入框一致（不拼接产品型号）。
 * 生成通知单等单据仍用 formatCClassMarksCellInnerHtml / formatCClassMarksPlainText。
 */
export function formatOrderQuickPreviewMarksCellInnerHtml(item, contractNo, escapeHtmlFn) {
  const text = resolveCClassMarksSecondLine(item, contractNo) || '';
  return escapeHtmlFn(text === '' ? '-' : text);
}

/**
 * C 类品表格「唛头」列 innerHTML（不含 td）
 * @param {object} item
 * @param {string} contractNo
 * @param {(s: string) => string} escapeHtmlFn
 */
export function formatCClassMarksCellInnerHtml(item, contractNo, escapeHtmlFn) {
  const n = normalizeOrderItem(item);
  const wrapping = n.wrappingCloth || '';
  const secondResolved = resolveCClassMarksSecondLine(n, contractNo);

  if (wrapping === '要' && n.model) {
    const m = escapeHtmlFn(String(n.model));
    const s = secondResolved ? escapeHtmlFn(secondResolved) : '';
    return s ? `${m}<br/>${s}` : m;
  }
  const text = secondResolved || n.marks || '-';
  return escapeHtmlFn(text === '' || text === '-' ? '-' : text);
}

/**
 * 纯文本场景（如 Excel 导出拼接）：与 formatCClassMarksCellInnerHtml 语义一致，无 HTML
 */
export function formatCClassMarksPlainText(item, contractNo) {
  const n = normalizeOrderItem(item);
  const wrapping = n.wrappingCloth || '';
  const secondResolved = resolveCClassMarksSecondLine(n, contractNo);
  if (wrapping === '要' && n.model) {
    return secondResolved ? `${n.model}\n${secondResolved}` : String(n.model);
  }
  const text = secondResolved || n.marks || '-';
  return text === '' ? '-' : text;
}
