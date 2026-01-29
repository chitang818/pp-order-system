/**
 * 统一A4预览组件
 * 提供统一的A4预览容器、缩放功能和页面操作
 * 用于模板编辑器和单据生成页面
 */

import { A4_SIZE, MM_TO_PX, ZOOM_CONFIG, PREVIEW_CONFIG } from '../../../constants/document-center.js';

/**
 * A4预览查看器
 * 统一的A4预览组件，支持缩放、适应页面等功能
 */
export class A4PreviewViewer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = {
      showMarginMarks: options.showMarginMarks !== false, // 默认显示页边距标记
      multiPage: options.multiPage || false,              // 是否支持多页
      editable: options.editable || false,                // 是否可编辑（编辑器模式）
      ...options
    };
    
    this.zoomLevel = ZOOM_CONFIG.DEFAULT;
    this.autoFitEnabled = false;
    this.container = null;
    this.zoomWrapper = null;
    this.pagesContainer = null;
    
    this.init();
  }

  /**
   * 初始化组件
   */
  init() {
    this.container = document.getElementById(this.containerId) || 
                     document.querySelector(`#${this.containerId}`) ||
                     document.querySelector(`.${this.containerId}`);
    
    if (!this.container) {
      console.error(`[A4PreviewViewer] 容器未找到: ${this.containerId}`);
      return;
    }

    // 创建预览结构
    this.createPreviewStructure();
    
    // 绑定窗口大小变化事件
    this.bindResizeEvent();
  }

  /**
   * 创建预览结构
   */
  createPreviewStructure() {
    // 检查是否已有现有的预览结构（兼容现有HTML）
    let existingZoomWrapper = this.container.querySelector('#previewZoomWrapper') || 
                              this.container.querySelector('.preview-zoom-wrapper');
    let existingPagesContainer = this.container.querySelector('#previewPages') || 
                                 this.container.querySelector('.preview-pages');
    
    if (existingZoomWrapper && existingPagesContainer) {
      // 使用现有的结构
      this.zoomWrapper = existingZoomWrapper;
      this.pagesContainer = existingPagesContainer;
      
      // 确保样式正确
      if (!this.zoomWrapper.id) {
        this.zoomWrapper.id = 'previewZoomWrapper';
      }
      if (!this.pagesContainer.id) {
        this.pagesContainer.id = 'previewPages';
      }
      
      // 应用必要的样式（如果还没有）
      if (!this.zoomWrapper.style.transformOrigin) {
        this.zoomWrapper.style.transformOrigin = 'top center';
        this.zoomWrapper.style.transition = 'transform 0.2s ease-out';
      }
    } else {
      // 创建新的预览结构
      this.container.innerHTML = '';
      
      // 创建缩放包装器（使用与现有HTML兼容的类名和ID）
      this.zoomWrapper = document.createElement('div');
      this.zoomWrapper.className = 'preview-zoom-wrapper';
      this.zoomWrapper.id = 'previewZoomWrapper';
      this.zoomWrapper.style.cssText = `
        transform-origin: top center;
        transition: transform 0.2s ease-out;
        margin: 0 auto;
        width: fit-content;
        height: fit-content;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        padding: ${PREVIEW_CONFIG.WRAPPER_PADDING}px;
        box-sizing: content-box;
      `;

      // 创建页面容器（使用与现有HTML兼容的类名和ID）
      this.pagesContainer = document.createElement('div');
      this.pagesContainer.className = 'preview-pages';
      this.pagesContainer.id = 'previewPages';
      this.pagesContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        margin: 0;
        padding: 0 0 15px 0;
      `;

      this.zoomWrapper.appendChild(this.pagesContainer);
      this.container.appendChild(this.zoomWrapper);
    }

    // 设置容器样式（如果还没有设置）
    const containerStyle = window.getComputedStyle(this.container);
    if (!containerStyle.background || containerStyle.background === 'rgba(0, 0, 0, 0)') {
      this.container.style.cssText = `
        width: 100%;
        height: 100%;
        overflow: auto;
        background: #d4d4d4;
        position: relative;
      `;
    }
  }

  /**
   * 渲染HTML内容
   * @param {string} html - HTML内容
   * @param {Object} options - 渲染选项
   */
  render(html, options = {}) {
    if (!this.pagesContainer) {
      console.error('[A4PreviewViewer] 页面容器未初始化');
      return;
    }

    const margin = options.margin || { top: 15, bottom: 15, left: 15, right: 15 };
    const pageSettings = options.pageSettings || {};
    const globalStyles = options.globalStyles || {};

    // 清空现有页面
    this.pagesContainer.innerHTML = '';

    // 创建单页或多页
    if (this.options.multiPage) {
      // 多页模式（单据生成页面）
      this.renderMultiPage(html, margin, pageSettings, globalStyles);
    } else {
      // 单页模式（模板编辑器）
      this.renderSinglePage(html, margin, pageSettings, globalStyles);
    }

    // 应用初始缩放
    this.applyZoom();
  }

  /**
   * 渲染单页
   */
  renderSinglePage(html, margin, pageSettings, globalStyles) {
    const page = this.createPageElement(margin, pageSettings, globalStyles);
    const contentDiv = document.createElement('div');
    // 不设置特定类名，直接使用内容
    contentDiv.innerHTML = html;
    page.appendChild(contentDiv);
    this.pagesContainer.appendChild(page);
  }

  /**
   * 渲染多页（简化版，完整分页逻辑需要更复杂的实现）
   */
  renderMultiPage(html, margin, pageSettings, globalStyles) {
    // 创建第一页（使用与现有HTML兼容的ID）
    const page1 = this.createPageElement(margin, pageSettings, globalStyles);
    page1.id = 'documentPreviewPage1';
    const contentDiv = document.createElement('div');
    // 不设置特定类名，直接使用内容
    contentDiv.innerHTML = html;
    page1.appendChild(contentDiv);
    this.pagesContainer.appendChild(page1);

    // 隐藏第二页（如果存在）
    const page2 = document.getElementById('documentPreviewPage2');
    if (page2) {
      page2.style.display = 'none';
    }

    // TODO: 实现完整的分页逻辑
    // 目前只显示第一页，如果内容超过一页，需要分割内容
  }

  /**
   * 创建页面元素
   */
  createPageElement(margin, pageSettings, globalStyles) {
    const page = document.createElement('div');
    // 使用与现有HTML兼容的类名
    page.className = 'preview-paper';
    
    // A4标准尺寸
    page.style.cssText = `
      width: ${A4_SIZE.WIDTH}mm;
      min-height: ${A4_SIZE.HEIGHT}mm;
      height: ${A4_SIZE.HEIGHT}mm;
      background: #fff;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
      border: 2px solid #3b82f6;
      position: relative;
      padding: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm;
      box-sizing: border-box;
      overflow: visible;
      flex-shrink: 0;
      display: block;
      page-break-after: always;
      margin: 0;
      font-family: ${globalStyles.fontFamily || 'Arial, "Microsoft YaHei", sans-serif'};
      font-size: ${globalStyles.fontSize || 12}px;
      line-height: ${globalStyles.lineHeight || 1.4};
      color: ${globalStyles.color || '#000'};
    `;

    // 添加页边距标记
    if (this.options.showMarginMarks) {
      this.addMarginMarks(page, margin);
    }

    return page;
  }

  /**
   * 添加页边距标记
   */
  addMarginMarks(page, margin) {
    const positions = [
      { name: 'top-left', top: `${margin.top}mm`, left: `${margin.left}mm` },
      { name: 'top-right', top: `${margin.top}mm`, right: `${margin.right}mm` },
      { name: 'bottom-left', bottom: `${margin.bottom}mm`, left: `${margin.left}mm` },
      { name: 'bottom-right', bottom: `${margin.bottom}mm`, right: `${margin.right}mm` }
    ];

    positions.forEach(pos => {
      const mark = document.createElement('div');
      mark.className = `margin-mark margin-mark-${pos.name}`;
      mark.style.cssText = `
        position: absolute;
        z-index: 10;
        pointer-events: none;
        top: ${pos.top || 'auto'};
        bottom: ${pos.bottom || 'auto'};
        left: ${pos.left || 'auto'};
        right: ${pos.right || 'auto'};
      `;
      
      // L型标记样式
      mark.innerHTML = `
        <style>
          .margin-mark-${pos.name}::before,
          .margin-mark-${pos.name}::after {
            content: '';
            position: absolute;
            background: #9ca3af;
          }
          .margin-mark-${pos.name}::before {
            width: 12px;
            height: 1.5px;
            top: 0;
            left: 0;
          }
          .margin-mark-${pos.name}::after {
            width: 1.5px;
            height: 12px;
            top: 0;
            left: 0;
          }
        </style>
      `;
      
      page.appendChild(mark);
    });
  }

  /**
   * 更新内容（不重新创建页面结构）
   */
  updateContent(html) {
    const contentDivs = this.pagesContainer.querySelectorAll('.a4-preview-content');
    if (contentDivs.length > 0) {
      contentDivs[0].innerHTML = html;
    } else {
      // 如果没有内容容器，重新渲染
      this.render(html);
    }
  }

  /**
   * 设置缩放级别
   * @param {number} level - 缩放级别（百分比，如100表示100%）
   */
  setZoom(level) {
    this.zoomLevel = Math.max(ZOOM_CONFIG.MIN, Math.min(ZOOM_CONFIG.MAX, level));
    this.autoFitEnabled = false;
    this.applyZoom();
  }

  /**
   * 放大
   */
  zoomIn() {
    const presetLevels = ZOOM_CONFIG.PRESET_LEVELS;
    let currentPreset = presetLevels.find(level => level === this.zoomLevel);
    if (!currentPreset) {
      currentPreset = presetLevels.reduce((prev, curr) => {
        return Math.abs(curr - this.zoomLevel) < Math.abs(prev - this.zoomLevel) ? curr : prev;
      });
    }
    let nextLevel = presetLevels.find(level => level > currentPreset);
    if (!nextLevel) {
      nextLevel = Math.min(ZOOM_CONFIG.MAX, this.zoomLevel + ZOOM_CONFIG.STEP);
    }
    this.setZoom(nextLevel);
  }

  /**
   * 缩小
   */
  zoomOut() {
    const presetLevels = [...ZOOM_CONFIG.PRESET_LEVELS].reverse();
    let currentPreset = presetLevels.find(level => level === this.zoomLevel);
    if (!currentPreset) {
      currentPreset = presetLevels.reduce((prev, curr) => {
        return Math.abs(curr - this.zoomLevel) < Math.abs(prev - this.zoomLevel) ? curr : prev;
      });
    }
    let nextLevel = presetLevels.find(level => level < currentPreset);
    if (!nextLevel) {
      nextLevel = Math.max(ZOOM_CONFIG.MIN, this.zoomLevel - ZOOM_CONFIG.STEP);
    }
    this.setZoom(nextLevel);
  }

  /**
   * 适应页面
   */
  fitToPage() {
    if (!this.container || !this.zoomWrapper) return;

    this.autoFitEnabled = true;

    // 计算A4纸张尺寸（mm转px）
    const paperWidthPx = A4_SIZE.WIDTH * MM_TO_PX;
    const paperHeightPx = A4_SIZE.HEIGHT * MM_TO_PX;

    // 获取容器实际可用尺寸
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;

    // wrapper的padding需要从可用空间中减去
    const wrapperPadding = PREVIEW_CONFIG.WRAPPER_PADDING;
    const safetyMargin = PREVIEW_CONFIG.SAFETY_MARGIN;
    const scrollbarWidth = PREVIEW_CONFIG.SCROLLBAR_WIDTH;
    const availableWidth = containerWidth - wrapperPadding * 2 - safetyMargin - scrollbarWidth;
    const availableHeight = containerHeight - wrapperPadding * 2 - safetyMargin - scrollbarWidth;

    // 根据宽度和高度计算合适的缩放比例，取较小值以确保完整显示
    const scaleByWidth = availableWidth / paperWidthPx;
    const scaleByHeight = availableHeight / paperHeightPx;
    let autoScale = Math.min(scaleByWidth, scaleByHeight);

    // 限制缩放范围
    autoScale = Math.max(0.3, Math.min(autoScale, 1.0));

    // 对齐到常用比例
    const commonScales = [0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1.0];
    const threshold = 0.05;
    for (const scale of commonScales) {
      if (Math.abs(autoScale - scale) < threshold) {
        autoScale = scale;
        break;
      }
    }

    // 应用缩放
    this.zoomLevel = Math.round(autoScale * 100);
    this.applyZoom();
  }

  /**
   * 应用缩放
   */
  applyZoom() {
    if (!this.zoomWrapper) return;

    const scale = this.zoomLevel / ZOOM_CONFIG.DEFAULT;
    
    // 使用top center作为缩放原点，确保顶部对齐
    this.zoomWrapper.style.transform = `scale(${scale})`;
    this.zoomWrapper.style.transformOrigin = 'top center';

    // 触发缩放变化事件
    if (this.options.onZoomChange) {
      this.options.onZoomChange(this.zoomLevel);
    }
  }

  /**
   * 获取当前缩放级别
   */
  getZoomLevel() {
    return this.zoomLevel;
  }

  /**
   * 绑定窗口大小变化事件
   */
  bindResizeEvent() {
    let resizeTimer = null;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.autoFitEnabled) {
          this.fitToPage();
        }
      }, 250);
    };

    window.addEventListener('resize', handleResize);
    
    // 保存清理函数
    this._cleanupResize = () => {
      window.removeEventListener('resize', handleResize);
    };
  }

  /**
   * 清理资源
   */
  destroy() {
    if (this._cleanupResize) {
      this._cleanupResize();
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

