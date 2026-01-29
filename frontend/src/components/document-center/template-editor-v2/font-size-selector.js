/**
 * 字号选择器组件
 * 提供统一的字号选择界面，使用pt单位
 */
import { FontSizeManager } from '../block-engine/font-size-manager.js';

export class FontSizeSelector {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.value = options.value || FontSizeManager.defaultFontSize;
  }

  /**
   * 渲染字号选择器
   */
  render() {
    if (typeof this.container === 'string') {
      this.container = document.getElementById(this.container);
    }
    if (!this.container) return;

    const presetOptions = FontSizeManager.getPresetOptions();

    this.container.innerHTML = `
      <div class="font-size-selector">
        <div class="font-size-input-wrapper">
          <input type="number" 
                 class="font-size-input" 
                 value="${this.value}"
                 min="8"
                 max="72"
                 step="0.5">
          <span class="font-size-unit">pt</span>
        </div>
        <div class="font-size-presets">
          ${presetOptions.map(opt => `
            <button type="button" 
                    class="font-size-preset-btn ${this.value === opt.value ? 'active' : ''}"
                    data-value="${opt.value}">
              ${opt.label}
            </button>
          `).join('')}
        </div>
        <div class="font-size-preview">
          <span style="font-size: ${FontSizeManager.toCSSFontSize(this.value)};">
            预览文字 Aa
          </span>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const input = this.container.querySelector('.font-size-input');
    const presetBtns = this.container.querySelectorAll('.font-size-preset-btn');
    const preview = this.container.querySelector('.font-size-preview span');

    // 输入框变更
    if (input) {
      input.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value) || FontSizeManager.defaultFontSize;
        this.value = FontSizeManager.normalizeFontSize(value);
        e.target.value = this.value;
        this.updatePreview(preview);
        this.notifyChange();
      });
    }

    // 预设按钮点击
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const value = parseFloat(btn.dataset.value);
        this.value = value;
        
        // 更新输入框
        if (input) {
          input.value = value;
        }
        
        // 更新按钮状态
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 更新预览
        this.updatePreview(preview);
        this.notifyChange();
      });
    });
  }

  /**
   * 更新预览
   */
  updatePreview(preview) {
    if (preview) {
      preview.style.fontSize = FontSizeManager.toCSSFontSize(this.value);
    }
  }

  /**
   * 通知变更
   */
  notifyChange() {
    if (this.options.onChange) {
      this.options.onChange(this.value);
    }
  }
}

