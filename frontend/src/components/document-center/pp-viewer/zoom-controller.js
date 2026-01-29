/**
 * 统一缩放控制器
 * 提供统一的缩放按钮、级别显示和事件回调
 * 用于PP预览器的模板编辑器和单据生成页面
 */

import { ZOOM_CONFIG } from '../../../constants/document-center.js';

/**
 * 缩放控制器
 * 管理缩放按钮、级别显示和事件回调
 */
export class ZoomController {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = {
      onZoomIn: options.onZoomIn || null,
      onZoomOut: options.onZoomOut || null,
      onFitToPage: options.onFitToPage || null,
      onZoomChange: options.onZoomChange || null,
      showLevel: options.showLevel !== false, // 默认显示缩放级别
      ...options
    };
    
    this.container = null;
    this.zoomLevelEl = null;
    this.currentZoomLevel = ZOOM_CONFIG.DEFAULT;
    
    this.init();
  }

  /**
   * 初始化控制器
   */
  init() {
    // 如果容器ID是字符串，尝试查找元素
    if (typeof this.containerId === 'string') {
      this.container = document.getElementById(this.containerId) || 
                       document.querySelector(`#${this.containerId}`) ||
                       document.querySelector(`.${this.containerId.replace('#', '')}`);
    } else {
      // 如果直接传入DOM元素
      this.container = this.containerId;
    }

    if (!this.container) {
      console.warn(`[ZoomController] 容器未找到: ${this.containerId}，尝试查找现有控件`);
      // 如果容器不存在，尝试查找现有的缩放控件
      this.findExistingControls();
      return;
    }

    // 如果容器已有内容，直接绑定事件
    if (this.container.children.length > 0 || this.container.querySelector('#btnZoomIn')) {
      this.bindExistingControls();
    } else {
      // 创建缩放控件
      this.createControls();
    }
  }

  /**
   * 查找现有的缩放控件
   */
  findExistingControls() {
    // 尝试查找常见的缩放控件ID
    const zoomInBtn = document.getElementById('btnZoomIn');
    const zoomOutBtn = document.getElementById('btnZoomOut');
    const fitPageBtn = document.getElementById('btnFitPage');
    const zoomLevelEl = document.getElementById('zoomLevel');

    if (zoomInBtn || zoomOutBtn || fitPageBtn) {
      this.bindExistingControls();
    }
  }

  /**
   * 绑定现有控件的事件
   */
  bindExistingControls() {
    const zoomInBtn = document.getElementById('btnZoomIn') || 
                      this.container?.querySelector('#btnZoomIn') ||
                      this.container?.querySelector('.zoom-btn[title*="放大"]');
    const zoomOutBtn = document.getElementById('btnZoomOut') || 
                      this.container?.querySelector('#btnZoomOut') ||
                      this.container?.querySelector('.zoom-btn[title*="缩小"]');
    const fitPageBtn = document.getElementById('btnFitPage') || 
                       this.container?.querySelector('#btnFitPage') ||
                       this.container?.querySelector('.zoom-btn[title*="适应"]');
    this.zoomLevelEl = document.getElementById('zoomLevel') || 
                       this.container?.querySelector('#zoomLevel') ||
                       this.container?.querySelector('.zoom-display');

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        if (this.options.onZoomIn) {
          this.options.onZoomIn();
        }
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        if (this.options.onZoomOut) {
          this.options.onZoomOut();
        }
      });
    }

    if (fitPageBtn) {
      fitPageBtn.addEventListener('click', () => {
        if (this.options.onFitToPage) {
          this.options.onFitToPage();
        }
      });
    }
  }

  /**
   * 创建缩放控件
   */
  createControls() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="zoom-controls">
        <div class="zoom-group">
          <button class="zoom-btn" id="btnZoomOut" title="缩小">
            <span class="icon">−</span>
          </button>
          ${this.options.showLevel ? `
            <span class="zoom-display" id="zoomLevel">${this.currentZoomLevel}%</span>
          ` : ''}
          <button class="zoom-btn" id="btnZoomIn" title="放大">
            <span class="icon">+</span>
          </button>
          <button class="zoom-btn" id="btnFitPage" title="适应页面">
            <span class="icon">⤢</span>
          </button>
        </div>
      </div>
    `;

    this.bindExistingControls();
  }

  /**
   * 设置缩放级别
   * @param {number} level - 缩放级别（百分比）
   */
  setZoomLevel(level) {
    this.currentZoomLevel = level;
    if (this.zoomLevelEl) {
      this.zoomLevelEl.textContent = `${level}%`;
    }
    
    if (this.options.onZoomChange) {
      this.options.onZoomChange(level);
    }
  }

  /**
   * 获取当前缩放级别
   */
  getZoomLevel() {
    return this.currentZoomLevel;
  }

  /**
   * 放大回调
   */
  onZoomIn(callback) {
    this.options.onZoomIn = callback;
  }

  /**
   * 缩小回调
   */
  onZoomOut(callback) {
    this.options.onZoomOut = callback;
  }

  /**
   * 适应页面回调
   */
  onFitToPage(callback) {
    this.options.onFitToPage = callback;
  }

  /**
   * 缩放变化回调
   */
  onZoomChange(callback) {
    this.options.onZoomChange = callback;
  }

  /**
   * 销毁控制器
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

