/**
 * 单据中心常量定义
 * 统一管理单据中心相关的常量，避免魔法数字和字符串
 */

/**
 * 单据类型常量
 */
export const DOCUMENT_TYPES = {
  INVOICE: 'invoice',
  PACKING: 'packing',
  SALES: 'sales',
  PRODUCTION: 'production',
  PICKUP: 'pickup',
  CUSTOM: 'custom'
};

/**
 * 单据类型显示名称映射
 * 统一使用标准格式
 */
export const DOCUMENT_TYPE_NAMES = {
  [DOCUMENT_TYPES.INVOICE]: '发票（IV）',
  [DOCUMENT_TYPES.PACKING]: '装箱单（PL）',
  [DOCUMENT_TYPES.SALES]: '销售确认书（S/C）',
  [DOCUMENT_TYPES.PRODUCTION]: '生产通知单',
  [DOCUMENT_TYPES.PICKUP]: '拉货通知',
  [DOCUMENT_TYPES.CUSTOM]: '自定义'
};

/**
 * 默认页边距（单位：mm）
 */
export const DEFAULT_MARGIN = {
  top: 20,
  bottom: 20,
  left: 20,
  right: 20
};

/**
 * 预览缩放相关常量
 */
export const ZOOM_CONFIG = {
  MIN: 30,
  MAX: 200,
  DEFAULT: 100,
  STEP: 10,
  PRESET_LEVELS: [30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200]
};

/**
 * A4纸张尺寸（单位：mm）
 */
export const A4_SIZE = {
  WIDTH: 210,
  HEIGHT: 297
};

/**
 * 毫米转像素的转换系数（96 DPI）
 */
export const MM_TO_PX = 3.779527559;

/**
 * 防抖/节流延迟时间（单位：毫秒）
 */
export const DEBOUNCE_DELAY = {
  SEARCH: 300,
  FILTER: 300,
  RESIZE: 250
};

/**
 * 预览容器相关常量
 */
export const PREVIEW_CONFIG = {
  WRAPPER_PADDING: 40,
  SAFETY_MARGIN: 40,
  SCROLLBAR_WIDTH: 14,
  CONTAINER_PADDING: 15
};

