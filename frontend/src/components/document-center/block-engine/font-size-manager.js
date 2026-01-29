/**
 * 字号管理器
 * 统一管理模板中的字号，确保各导出格式一致
 */
export class FontSizeManager {
  // 预设字号规范
  static PRESETS = {
    'company-name': { name: '特大标题', pt: 22, desc: '用于公司名称' },
    'doc-title': { name: '大标题', pt: 18, desc: '用于单据标题' },
    'section-title': { name: '中标题', pt: 14, desc: '用于区块标题' },
    'table-header': { name: '正文大', pt: 12, desc: '用于表头、重要信息' },
    'body-large': { name: '正文大', pt: 12, desc: '用于重要正文' },
    'body': { name: '正文', pt: 11, desc: '用于普通内容' },
    'body-small': { name: '正文小', pt: 10, desc: '用于次要信息' },
    'footnote': { name: '小字', pt: 9, desc: '用于页脚、辅助信息' }
  };
  
  /**
   * 获取预设字号列表（用于下拉选择）
   * @returns {Array}
   */
  static getPresetOptions() {
    return Object.entries(this.PRESETS).map(([key, preset]) => ({
      value: preset.pt,
      label: `${preset.name} (${preset.pt}pt)`,
      description: preset.desc,
      key
    }));
  }
  
  /**
   * pt转Excel字号
   * Excel字号与pt基本对应，但需要确保数值正确
   * @param {number} pt - pt值
   * @returns {number}
   */
  static ptToExcel(pt) {
    return Number(pt) || 11;
  }
  
  /**
   * pt转Word字号（半点单位）
   * Word的size属性使用半点单位
   * @param {number} pt - pt值
   * @returns {number}
   */
  static ptToWord(pt) {
    return (Number(pt) || 11) * 2;
  }
  
  /**
   * pt转CSS像素（用于屏幕预览）
   * 通常 1pt ≈ 1.333px (96dpi屏幕)
   * @param {number} pt - pt值
   * @returns {number}
   */
  static ptToPixel(pt) {
    return Math.round((Number(pt) || 11) * 1.333);
  }
  
  /**
   * 获取用于HTML/CSS的字号字符串
   * @param {number} pt - pt值
   * @returns {string}
   */
  static toCSSFontSize(pt) {
    return `${pt}pt`;
  }

  /**
   * 验证字号值是否有效
   * @param {*} value - 字号值
   * @returns {boolean}
   */
  static isValid(value) {
    const num = Number(value);
    return !isNaN(num) && num > 0 && num <= 72;
  }

  /**
   * 规范化字号值
   * @param {*} value - 字号值
   * @param {number} defaultValue - 默认值
   * @returns {number}
   */
  static normalize(value, defaultValue = 11) {
    const num = Number(value);
    if (isNaN(num) || num <= 0 || num > 72) {
      return defaultValue;
    }
    return num;
  }

  /**
   * 规范化字号（别名方法，与normalize相同）
   * @param {number} pt - 原始字号
   * @returns {number} 规范化后的字号
   */
  static normalizeFontSize(pt) {
    return this.normalize(pt, this.defaultFontSize);
  }

  /**
   * 默认字号
   */
  static defaultFontSize = 11;
}

