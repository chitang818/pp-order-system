/**
 * PP预览器 (Paper Previewer) - 统一的A4文档预览与编辑组件
 * 
 * 核心功能：
 * - 支持 edit/view 双模式
 * - A4 尺寸约束（210mm × 297mm）
 * - 统一缩放、背景、页边距标记
 * - 编辑模式下支持区块选择和高亮
 * 
 * 用于模板编辑器和单据生成页面
 */

import { A4_SIZE, MM_TO_PX, ZOOM_CONFIG, PREVIEW_CONFIG } from '../../../constants/document-center.js';
import { BlockOverlay } from './block-overlay.js';
import { BlockRenderer } from '../block-engine/block-renderer.js';

/**
 * PP预览器类
 * 统一的A4文档预览与编辑组件
 */
export class PPPreviewer {
  /**
   * 构造函数
   * @param {string|HTMLElement} containerId - 容器ID或DOM元素
   * @param {Object} options - 配置选项
   * @param {string} options.mode - 模式: 'edit' | 'view'，默认 'view'
   * @param {boolean} options.showMarginMarks - 是否显示页边距标记，默认 true
   * @param {boolean} options.multiPage - 是否支持多页，默认 false
   * @param {boolean} options.showBlockBorders - 编辑模式是否显示区块边框，默认 true
   * @param {Function} options.onBlockSelect - 区块选择回调
   * @param {Function} options.onBlockHover - 区块悬停回调
   * @param {Function} options.onZoomChange - 缩放变化回调
   */
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.mode = options.mode || 'view';
    this.options = {
      showMarginMarks: options.showMarginMarks !== false,
      multiPage: options.multiPage || false,
      showBlockBorders: options.showBlockBorders !== false,
      onBlockSelect: options.onBlockSelect || null,
      onBlockHover: options.onBlockHover || null,
      onZoomChange: options.onZoomChange || null,
      ...options
    };

    // 状态
    this.zoomLevel = ZOOM_CONFIG.DEFAULT;
    this.autoFitEnabled = false;
    this.selectedBlockId = null;
    this.hoveredBlockId = null;
    this.currentTemplate = null;
    this.currentData = null;
    this.currentMargin = { top: 15, bottom: 15, left: 15, right: 15 };

    // DOM元素
    this.container = null;
    this.zoomWrapper = null;
    this.pagesContainer = null;

    // 覆盖层管理器
    this.blockOverlay = null;

    // 事件绑定标记
    this._eventsBound = false;
    this._resizeHandler = null;

    // 渲染缓存
    this._renderCache = new Map();
    this._cacheMaxSize = 10;

    // 渲染状态
    this._isRendering = false;
    this._renderQueue = [];

    this.init();
  }

  /**
   * 初始化组件
   */
  init() {
    // 获取容器
    if (typeof this.containerId === 'string') {
      this.container = document.getElementById(this.containerId) ||
                       document.querySelector(`#${this.containerId}`) ||
                       document.querySelector(`.${this.containerId}`);
    } else {
      this.container = this.containerId;
    }

    if (!this.container) {
      console.error(`[PPPreviewer] 容器未找到: ${this.containerId}`);
      return;
    }

    // 注入样式
    this.injectStyles();

    // 创建预览结构
    this.createPreviewStructure();

    // 绑定窗口大小变化事件
    this.bindResizeEvent();

    console.log(`[PPPreviewer] 初始化完成，模式: ${this.mode}`);
  }

  /**
   * 注入PP预览器样式
   */
  injectStyles() {
    const styleId = 'pp-previewer-styles';
    if (document.getElementById(styleId)) return;

    // 尝试加载外部样式文件
    const link = document.createElement('link');
    link.id = styleId + '-link';
    link.rel = 'stylesheet';
    link.href = '/src/components/document-center/pp-viewer/styles.css';
    document.head.appendChild(link);
  }

  /**
   * 创建预览结构
   */
  createPreviewStructure() {
    // 检查是否已有现有的预览结构（兼容现有HTML）
    let existingZoomWrapper = this.container.querySelector('.preview-zoom-wrapper') ||
                              this.container.querySelector('.pp-zoom-wrapper');
    let existingPagesContainer = this.container.querySelector('.preview-pages') ||
                                 this.container.querySelector('.pp-pages');

    if (existingZoomWrapper && existingPagesContainer) {
      // 使用现有的结构
      this.zoomWrapper = existingZoomWrapper;
      this.pagesContainer = existingPagesContainer;

      // 确保样式正确
      this.zoomWrapper.classList.add('pp-zoom-wrapper');
      this.pagesContainer.classList.add('pp-pages');

      // 应用必要的样式
      if (!this.zoomWrapper.style.transformOrigin) {
        this.zoomWrapper.style.transformOrigin = 'top center';
        this.zoomWrapper.style.transition = 'transform 0.2s ease-out';
      }
    } else {
      // 创建新的预览结构
      this.container.innerHTML = '';

      // 创建缩放包装器
      this.zoomWrapper = document.createElement('div');
      this.zoomWrapper.className = 'preview-zoom-wrapper pp-zoom-wrapper';
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

      // 创建页面容器
      this.pagesContainer = document.createElement('div');
      this.pagesContainer.className = 'preview-pages pp-pages';
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

    // 设置容器样式
    this.applyContainerStyles();
  }

  /**
   * 应用容器样式
   */
  applyContainerStyles() {
    const containerStyle = window.getComputedStyle(this.container);
    if (!containerStyle.background || containerStyle.background === 'rgba(0, 0, 0, 0)' || containerStyle.background === 'none') {
      this.container.style.cssText = `
        width: 100%;
        height: 100%;
        overflow: auto;
        background: #d4d4d4;
        position: relative;
      `;
    }

    // 添加模式类
    this.container.classList.add('pp-container');
    this.container.classList.add(`pp-mode-${this.mode}`);
  }

  /**
   * 设置模式
   * @param {string} mode - 'edit' | 'view'
   */
  setMode(mode) {
    if (this.mode === mode) return;

    const oldMode = this.mode;
    this.mode = mode;

    // 更新容器类
    this.container.classList.remove(`pp-mode-${oldMode}`);
    this.container.classList.add(`pp-mode-${mode}`);

    // 切换到view模式时清除选择状态
    if (mode === 'view') {
      this.deselectBlock();
    }

    // 更新样式
    this.updateModeStyles();

    console.log(`[PPPreviewer] 模式切换: ${oldMode} -> ${mode}`);
  }

  /**
   * 获取当前模式
   * @returns {string} 'edit' | 'view'
   */
  getMode() {
    return this.mode;
  }

  /**
   * 渲染内容
   * @param {Object|string} templateOrHtml - 模板对象或HTML字符串
   * @param {Object} data - 数据对象
   * @param {Object} renderOptions - 渲染选项
   * @param {Object} renderOptions.margin - 页边距 { top, bottom, left, right }
   * @param {Object} renderOptions.pageSettings - 页面设置
   * @param {Object} renderOptions.globalStyles - 全局样式
   * @param {boolean} renderOptions.useCache - 是否使用缓存，默认 true
   */
  render(templateOrHtml, data = null, renderOptions = {}) {
    if (!this.pagesContainer) {
      console.error('[PPPreviewer] 页面容器未初始化');
      return;
    }

    // 防止重复渲染
    if (this._isRendering) {
      this._renderQueue.push({ templateOrHtml, data, renderOptions });
      console.log('[PPPreviewer] 渲染任务已加入队列');
      return;
    }

    this._isRendering = true;
    const startTime = performance.now();

    try {
      // 保存当前数据
      this.currentData = data;
      this.currentMargin = renderOptions.margin || { top: 15, bottom: 15, left: 15, right: 15 };
      const pageSettings = renderOptions.pageSettings || {};
      const globalStyles = renderOptions.globalStyles || {};
      const useCache = renderOptions.useCache !== false;

      let html = '';
      let template = null;

      // 判断输入类型
      if (typeof templateOrHtml === 'object' && templateOrHtml !== null) {
        if (templateOrHtml.blocks || templateOrHtml.config?.blocks) {
          // 是模板对象
          template = templateOrHtml;
          this.currentTemplate = template;
          
          // 动态导入 BlockRenderer（避免循环依赖）
          html = this.renderTemplateToHtml(template, data);
        } else {
          // 可能是配置对象，尝试从 config 获取
          html = templateOrHtml.html || '';
        }
      } else {
        // 是HTML字符串
        html = templateOrHtml || '';
      }

      // 检查缓存
      const cacheKey = useCache ? this._generateCacheKey(templateOrHtml, data, this.mode) : null;
      let cachedPages = cacheKey ? this._getFromCache(cacheKey) : null;

      // 清空现有页面
      this.pagesContainer.innerHTML = '';

      // 清除覆盖层
      if (this.blockOverlay) {
        this.blockOverlay.clearAll();
      }

      // 渲染页面
      if (this.options.multiPage) {
        this.renderMultiPage(html, template, this.currentMargin, pageSettings, globalStyles, cacheKey);
      } else {
        this.renderSinglePage(html, template, this.currentMargin, pageSettings, globalStyles);
      }

      // 编辑模式：添加区块交互
      if (this.mode === 'edit' && template) {
        this.setupEditModeInteractions(template);
      }

      // 应用缩放
      this.applyZoom();

      const renderTime = performance.now() - startTime;
      console.log(`[PPPreviewer] 渲染完成，模式: ${this.mode}，耗时: ${renderTime.toFixed(2)}ms`);

    } catch (error) {
      console.error('[PPPreviewer] 渲染失败:', error);
      this.showError(error);
    } finally {
      this._isRendering = false;

      // 处理队列中的下一个任务
      if (this._renderQueue.length > 0) {
        const nextTask = this._renderQueue.shift();
        // 使用 requestAnimationFrame 延迟执行，避免栈溢出
        requestAnimationFrame(() => {
          this.render(nextTask.templateOrHtml, nextTask.data, nextTask.renderOptions);
        });
      }
    }
  }

  /**
   * 使用 BlockRenderer 渲染模板为HTML
   * @param {Object} template - 模板对象
   * @param {Object} data - 数据对象
   * @returns {string} HTML字符串
   */
  renderTemplateToHtml(template, data) {
    try {
      // 使用顶部导入的 BlockRenderer
      if (BlockRenderer && typeof BlockRenderer.renderContent === 'function') {
        return BlockRenderer.renderContent(template, data, this.mode);
      } else if (BlockRenderer && typeof BlockRenderer.render === 'function') {
        // 如果只有 render 方法，提取 body 内容
        const fullHtml = BlockRenderer.render(template, data, this.mode);
        const parser = new DOMParser();
        const doc = parser.parseFromString(fullHtml, 'text/html');
        return doc.body ? doc.body.innerHTML : fullHtml;
      }
    } catch (error) {
      console.warn('[PPPreviewer] BlockRenderer 渲染失败:', error);
    }
    return '';
  }

  /**
   * 渲染单页
   */
  renderSinglePage(html, template, margin, pageSettings, globalStyles) {
    const page = this.createPageElement(margin, pageSettings, globalStyles);
    page.id = 'ppPreviewPage1';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'pp-page-content';
    contentDiv.innerHTML = html;
    page.appendChild(contentDiv);

    this.pagesContainer.appendChild(page);

    // 初始化或更新覆盖层管理器
    if (this.mode === 'edit') {
      if (this.blockOverlay) {
        this.blockOverlay.setPageContainer(page);
      } else {
        this.blockOverlay = new BlockOverlay(page);
      }
    }
  }

  /**
   * 渲染多页（自动分页）
   */
  renderMultiPage(html, template, margin, pageSettings, globalStyles) {
    // 计算分页
    const pages = this.calculatePagination(html, margin);
    
    console.log(`[PPPreviewer] 分页计算完成，共 ${pages.length} 页`);

    // 渲染每一页
    pages.forEach((pageContent, index) => {
      const page = this.createPageElement(margin, pageSettings, globalStyles);
      page.id = `ppPreviewPage${index + 1}`;
      page.setAttribute('data-page-number', index + 1);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'pp-page-content';
      contentDiv.innerHTML = pageContent;
      page.appendChild(contentDiv);

      this.pagesContainer.appendChild(page);
    });

    // 初始化或更新覆盖层管理器（仅针对第一页，或可扩展为所有页面）
    if (this.mode === 'edit') {
      const firstPage = this.pagesContainer.querySelector('.pp-paper');
      if (firstPage) {
        if (this.blockOverlay) {
          this.blockOverlay.setPageContainer(firstPage);
        } else {
          this.blockOverlay = new BlockOverlay(firstPage);
        }
      }
    }
  }

  /**
   * 计算并执行分页
   * @param {string} html - 完整HTML内容
   * @param {Object} margin - 页边距
   * @returns {Array<string>} 分页后的HTML数组
   */
  calculatePagination(html, margin) {
    // A4 内容区域高度（扣除页边距）
    const pageContentHeight = (A4_SIZE.HEIGHT - margin.top - margin.bottom) * MM_TO_PX;
    const pageContentWidth = (A4_SIZE.WIDTH - margin.left - margin.right) * MM_TO_PX;

    // 创建临时容器测量内容
    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = `
      position: absolute;
      visibility: hidden;
      width: ${A4_SIZE.WIDTH - margin.left - margin.right}mm;
      padding: 0;
      margin: 0;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      font-size: 12px;
      line-height: 1.4;
    `;
    tempContainer.innerHTML = html;
    document.body.appendChild(tempContainer);

    // 等待渲染完成
    const contentHeight = tempContainer.scrollHeight;
    
    // 判断是否需要分页
    if (contentHeight <= pageContentHeight) {
      document.body.removeChild(tempContainer);
      return [html];
    }

    console.log(`[PPPreviewer] 内容高度: ${contentHeight}px, 页面高度: ${pageContentHeight}px, 需要分页`);

    // 分页逻辑（按元素边界分割）
    const pages = this.splitContentByPage(tempContainer, pageContentHeight);

    document.body.removeChild(tempContainer);
    return pages;
  }

  /**
   * 按页面高度分割内容
   * @param {HTMLElement} container - 内容容器
   * @param {number} pageHeight - 单页高度（像素）
   * @returns {Array<string>} 分页后的HTML数组
   */
  splitContentByPage(container, pageHeight) {
    const pages = [];
    let currentPageElements = [];
    let currentHeight = 0;
    let pageBuffer = 10; // 页面缓冲区，避免贴边

    const children = Array.from(container.children);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childHeight = child.offsetHeight || 0;

      // 检查是否是表格元素
      const isTable = child.tagName === 'TABLE' || child.querySelector('table');

      if (isTable) {
        // 表格特殊处理：尽量保持完整
        const tableResult = this.handleTablePagination(child, currentHeight, pageHeight, pageBuffer);
        
        if (tableResult.needNewPage && currentPageElements.length > 0) {
          // 当前页已有内容，先保存当前页
          pages.push(this.elementsToHtml(currentPageElements));
          currentPageElements = [];
          currentHeight = 0;
        }

        if (tableResult.splitTable) {
          // 表格需要分割
          tableResult.parts.forEach((tablePart, partIndex) => {
            if (partIndex > 0 && currentPageElements.length > 0) {
              pages.push(this.elementsToHtml(currentPageElements));
              currentPageElements = [];
              currentHeight = 0;
            }
            currentPageElements.push(tablePart);
            currentHeight += tablePart.offsetHeight || 0;
          });
        } else {
          // 表格不需要分割
          currentPageElements.push(child.cloneNode(true));
          currentHeight += childHeight;
        }
      } else {
        // 非表格元素
        if (currentHeight + childHeight > pageHeight - pageBuffer && currentPageElements.length > 0) {
          // 当前元素放不下，开始新页
          pages.push(this.elementsToHtml(currentPageElements));
          currentPageElements = [];
          currentHeight = 0;
        }

        currentPageElements.push(child.cloneNode(true));
        currentHeight += childHeight;
      }
    }

    // 保存最后一页
    if (currentPageElements.length > 0) {
      pages.push(this.elementsToHtml(currentPageElements));
    }

    // 如果没有成功分页，返回原始内容
    if (pages.length === 0) {
      return [container.innerHTML];
    }

    return pages;
  }

  /**
   * 处理表格分页
   * @param {HTMLElement} table - 表格元素
   * @param {number} currentHeight - 当前页已用高度
   * @param {number} pageHeight - 页面总高度
   * @param {number} buffer - 缓冲区高度
   * @returns {Object} { needNewPage, splitTable, parts }
   */
  handleTablePagination(table, currentHeight, pageHeight, buffer) {
    const tableHeight = table.offsetHeight || 0;
    const availableHeight = pageHeight - currentHeight - buffer;

    // 表格能放入当前页
    if (tableHeight <= availableHeight) {
      return { needNewPage: false, splitTable: false, parts: [] };
    }

    // 表格放不下当前页，但能单独放入一页
    if (tableHeight <= pageHeight - buffer) {
      return { needNewPage: true, splitTable: false, parts: [] };
    }

    // 表格太大，需要分割
    const parts = this.splitTable(table, pageHeight, buffer);
    return { needNewPage: true, splitTable: true, parts };
  }

  /**
   * 分割大表格
   * @param {HTMLElement} table - 表格元素
   * @param {number} pageHeight - 页面高度
   * @param {number} buffer - 缓冲区
   * @returns {Array<HTMLElement>} 分割后的表格数组
   */
  splitTable(table, pageHeight, buffer) {
    const parts = [];
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    const tfoot = table.querySelector('tfoot');
    
    if (!tbody) {
      // 没有tbody，无法分割
      parts.push(table.cloneNode(true));
      return parts;
    }

    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 0) {
      parts.push(table.cloneNode(true));
      return parts;
    }

    // 计算表头和表尾高度
    const theadHeight = thead ? thead.offsetHeight : 0;
    const tfootHeight = tfoot ? tfoot.offsetHeight : 0;
    const maxBodyHeight = pageHeight - theadHeight - tfootHeight - buffer;

    let currentRows = [];
    let currentBodyHeight = 0;

    rows.forEach((row, index) => {
      const rowHeight = row.offsetHeight || 25; // 默认行高

      if (currentBodyHeight + rowHeight > maxBodyHeight && currentRows.length > 0) {
        // 创建分割后的表格
        const partTable = this.createTablePart(table, thead, currentRows, index === rows.length - 1 ? tfoot : null);
        parts.push(partTable);
        currentRows = [];
        currentBodyHeight = 0;
      }

      currentRows.push(row.cloneNode(true));
      currentBodyHeight += rowHeight;
    });

    // 最后一部分（包含tfoot）
    if (currentRows.length > 0) {
      const partTable = this.createTablePart(table, thead, currentRows, tfoot);
      parts.push(partTable);
    }

    return parts;
  }

  /**
   * 创建表格分割部分
   * @param {HTMLElement} originalTable - 原始表格
   * @param {HTMLElement} thead - 表头
   * @param {Array<HTMLElement>} rows - 行数组
   * @param {HTMLElement} tfoot - 表尾（可选）
   * @returns {HTMLElement} 分割后的表格
   */
  createTablePart(originalTable, thead, rows, tfoot) {
    const newTable = document.createElement('table');
    
    // 复制原表格的属性和样式
    newTable.className = originalTable.className;
    newTable.style.cssText = originalTable.style.cssText;
    
    // 复制表格属性
    Array.from(originalTable.attributes).forEach(attr => {
      if (attr.name !== 'id') {
        newTable.setAttribute(attr.name, attr.value);
      }
    });

    // 添加表头
    if (thead) {
      newTable.appendChild(thead.cloneNode(true));
    }

    // 添加tbody
    const newTbody = document.createElement('tbody');
    rows.forEach(row => {
      newTbody.appendChild(row);
    });
    newTable.appendChild(newTbody);

    // 添加表尾（仅在最后一部分）
    if (tfoot) {
      newTable.appendChild(tfoot.cloneNode(true));
    }

    return newTable;
  }

  /**
   * 将元素数组转换为HTML字符串
   * @param {Array<HTMLElement>} elements - 元素数组
   * @returns {string} HTML字符串
   */
  elementsToHtml(elements) {
    const container = document.createElement('div');
    elements.forEach(el => {
      container.appendChild(el.cloneNode ? el.cloneNode(true) : el);
    });
    return container.innerHTML;
  }

  /**
   * 创建页面元素
   */
  createPageElement(margin, pageSettings, globalStyles) {
    const page = document.createElement('div');
    page.className = 'preview-paper pp-paper';

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

      // L型标记的伪元素样式通过CSS注入
      page.appendChild(mark);
    });

    // 注入L型标记的CSS（只注入一次）
    this.injectMarginMarkStyles();
  }

  /**
   * 注入页边距标记样式
   */
  injectMarginMarkStyles() {
    const styleId = 'pp-margin-mark-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .margin-mark::before,
      .margin-mark::after {
        content: '';
        position: absolute;
        background: #9ca3af;
      }
      .margin-mark-top-left::before,
      .margin-mark-top-right::before,
      .margin-mark-bottom-left::before,
      .margin-mark-bottom-right::before {
        width: 12px;
        height: 1.5px;
        top: 0;
      }
      .margin-mark-top-left::after,
      .margin-mark-top-right::after,
      .margin-mark-bottom-left::after,
      .margin-mark-bottom-right::after {
        width: 1.5px;
        height: 12px;
        top: 0;
      }
      .margin-mark-top-left::before,
      .margin-mark-top-left::after,
      .margin-mark-bottom-left::before,
      .margin-mark-bottom-left::after {
        left: 0;
      }
      .margin-mark-top-right::before,
      .margin-mark-top-right::after,
      .margin-mark-bottom-right::before,
      .margin-mark-bottom-right::after {
        right: 0;
      }
      .margin-mark-bottom-left::before,
      .margin-mark-bottom-left::after,
      .margin-mark-bottom-right::before,
      .margin-mark-bottom-right::after {
        top: auto;
        bottom: 0;
      }
      
      /* 编辑模式下区块边框 */
      .pp-mode-edit [data-block-id] {
        outline: 1px dashed rgba(59, 130, 246, 0.3);
        outline-offset: 2px;
        transition: outline 0.15s ease-out;
      }
      .pp-mode-edit [data-block-id]:hover {
        outline: 1px dashed rgba(59, 130, 246, 0.6);
      }
      
      /* 隐藏view模式下的区块边框 */
      .pp-mode-view [data-block-id] {
        outline: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 设置编辑模式交互
   */
  setupEditModeInteractions(template) {
    // 为区块添加标识
    this.attachBlockIdentifiers(template);

    // 绑定交互事件
    this.bindBlockInteractions();
  }

  /**
   * 为区块添加 data-block-id 标识
   */
  attachBlockIdentifiers(template) {
    const blocks = template.blocks || template.config?.blocks || [];
    const page = this.pagesContainer.querySelector('.pp-paper');
    if (!page) return;

    const contentDiv = page.querySelector('.pp-page-content');
    if (!contentDiv) return;

    // 查找所有区块对应的DOM元素
    // 策略：按顺序查找具有特定类名的元素
    const blockElements = contentDiv.querySelectorAll('[class*="block-"]');
    
    blocks.forEach((block, index) => {
      const blockId = block.id || `block_${index}`;
      const blockType = block.type;

      // 尝试查找对应的DOM元素
      let element = null;

      // 方式1：通过索引匹配
      if (blockElements[index]) {
        element = blockElements[index];
      }

      // 方式2：通过类名匹配
      if (!element) {
        const className = `block-${blockType}`;
        const typeElements = contentDiv.querySelectorAll(`.${className}`);
        if (typeElements.length > 0) {
          // 找到第一个还没有 data-block-id 的元素
          element = Array.from(typeElements).find(el => !el.hasAttribute('data-block-id'));
        }
      }

      // 方式3：查找第 index 个子元素
      if (!element) {
        const children = contentDiv.children;
        if (children[index]) {
          element = children[index];
        }
      }

      if (element) {
        element.setAttribute('data-block-id', blockId);
        element.setAttribute('data-block-type', blockType);
        element.classList.add('pp-block');
      }
    });
  }

  /**
   * 绑定区块交互事件
   */
  bindBlockInteractions() {
    const page = this.pagesContainer.querySelector('.pp-paper');
    if (!page) return;

    // 使用事件委托绑定到 pagesContainer（不会因为页面重建而丢失）
    // 移除旧的事件监听器（如果存在）
    if (this._clickHandler) {
      this.pagesContainer.removeEventListener('click', this._clickHandler);
    }
    if (this._mouseoverHandler) {
      this.pagesContainer.removeEventListener('mouseover', this._mouseoverHandler);
    }
    if (this._mouseoutHandler) {
      this.pagesContainer.removeEventListener('mouseout', this._mouseoutHandler);
    }

    // 点击选择区块
    this._clickHandler = (e) => {
      if (this.mode !== 'edit') return;

      const blockElement = e.target.closest('[data-block-id]');
      if (blockElement) {
        const blockId = blockElement.getAttribute('data-block-id');
        this.selectBlock(blockId);
      } else if (e.target.closest('.pp-paper')) {
        // 点击空白处取消选择
        this.deselectBlock();
      }
    };
    this.pagesContainer.addEventListener('click', this._clickHandler);

    // 悬停高亮区块
    this._mouseoverHandler = (e) => {
      if (this.mode !== 'edit') return;

      const blockElement = e.target.closest('[data-block-id]');
      if (blockElement) {
        const blockId = blockElement.getAttribute('data-block-id');
        this.hoverBlock(blockId);
      }
    };
    this.pagesContainer.addEventListener('mouseover', this._mouseoverHandler);

    this._mouseoutHandler = (e) => {
      if (this.mode !== 'edit') return;

      const blockElement = e.target.closest('[data-block-id]');
      if (blockElement) {
        this.unhoverBlock();
      }
    };
    this.pagesContainer.addEventListener('mouseout', this._mouseoutHandler);

    console.log('[PPPreviewer] 区块交互事件已绑定');
  }

  /**
   * 选择区块
   * @param {string} blockId - 区块ID
   */
  selectBlock(blockId) {
    if (this.selectedBlockId === blockId) return;

    this.selectedBlockId = blockId;

    // 更新覆盖层
    if (this.blockOverlay) {
      this.blockOverlay.addSelectedOverlay(blockId);
    }

    // 触发回调
    if (this.options.onBlockSelect) {
      this.options.onBlockSelect(blockId);
    }

    console.log(`[PPPreviewer] 选择区块: ${blockId}`);
  }

  /**
   * 取消选择区块
   */
  deselectBlock() {
    if (!this.selectedBlockId) return;

    const blockId = this.selectedBlockId;
    this.selectedBlockId = null;

    // 移除覆盖层
    if (this.blockOverlay) {
      this.blockOverlay.removeSelectedOverlay();
    }

    // 触发回调（传 null 表示取消选择）
    if (this.options.onBlockSelect) {
      this.options.onBlockSelect(null);
    }

    console.log(`[PPPreviewer] 取消选择区块: ${blockId}`);
  }

  /**
   * 悬停区块
   * @param {string} blockId - 区块ID
   */
  hoverBlock(blockId) {
    if (this.hoveredBlockId === blockId) return;

    this.hoveredBlockId = blockId;

    // 更新覆盖层
    if (this.blockOverlay) {
      this.blockOverlay.addHoveredOverlay(blockId);
    }

    // 触发回调
    if (this.options.onBlockHover) {
      this.options.onBlockHover(blockId);
    }
  }

  /**
   * 取消悬停区块
   */
  unhoverBlock() {
    if (!this.hoveredBlockId) return;

    this.hoveredBlockId = null;

    // 移除覆盖层
    if (this.blockOverlay) {
      this.blockOverlay.removeHoveredOverlay();
    }

    // 触发回调
    if (this.options.onBlockHover) {
      this.options.onBlockHover(null);
    }
  }

  /**
   * 获取选中的区块ID
   * @returns {string|null}
   */
  getSelectedBlock() {
    return this.selectedBlockId;
  }

  /**
   * 更新模式样式
   */
  updateModeStyles() {
    const page = this.pagesContainer?.querySelector('.pp-paper');
    if (!page) return;

    if (this.mode === 'edit') {
      // 编辑模式：显示区块边框
      if (this.options.showBlockBorders) {
        page.querySelectorAll('[data-block-id]').forEach(el => {
          el.classList.add('pp-block-visible');
        });
      }
    } else {
      // 查看模式：隐藏区块边框
      page.querySelectorAll('[data-block-id]').forEach(el => {
        el.classList.remove('pp-block-visible');
      });
    }
  }

  // ========== 缩放相关方法 ==========

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

    // 更新覆盖层位置
    if (this.blockOverlay) {
      setTimeout(() => {
        this.blockOverlay.updateOverlayPositions();
      }, 200);
    }

    // 触发缩放变化事件
    if (this.options.onZoomChange) {
      this.options.onZoomChange(this.zoomLevel);
    }
  }

  /**
   * 获取当前缩放级别
   * @returns {number}
   */
  getZoomLevel() {
    return this.zoomLevel;
  }

  /**
   * 绑定窗口大小变化事件
   */
  bindResizeEvent() {
    let resizeTimer = null;
    this._resizeHandler = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.autoFitEnabled) {
          this.fitToPage();
        }
        // 更新覆盖层位置
        if (this.blockOverlay) {
          this.blockOverlay.updateOverlayPositions();
        }
      }, 250);
    };

    window.addEventListener('resize', this._resizeHandler);
  }

  /**
   * 更新内容（不重新创建页面结构）
   * @param {string} html - HTML内容
   */
  updateContent(html) {
    const contentDiv = this.pagesContainer?.querySelector('.pp-page-content');
    if (contentDiv) {
      contentDiv.innerHTML = html;
      
      // 重新设置区块标识
      if (this.mode === 'edit' && this.currentTemplate) {
        this.attachBlockIdentifiers(this.currentTemplate);
      }
    } else {
      // 如果没有内容容器，重新渲染
      this.render(html, this.currentData, { margin: this.currentMargin });
    }
  }

  /**
   * 清空预览内容
   */
  clear() {
    if (this.pagesContainer) {
      this.pagesContainer.innerHTML = '';
    }
    if (this.blockOverlay) {
      this.blockOverlay.clearAll();
    }
    this.selectedBlockId = null;
    this.hoveredBlockId = null;
    this.currentTemplate = null;
    this.currentData = null;
  }

  /**
   * 清理资源
   */
  destroy() {
    // 移除事件监听
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }

    // 清理覆盖层
    if (this.blockOverlay) {
      this.blockOverlay.destroy();
    }

    // 清空缓存
    this.clearCache();

    // 清空容器
    if (this.container) {
      this.container.innerHTML = '';
      this.container.classList.remove('pp-container', `pp-mode-${this.mode}`);
    }

    console.log('[PPPreviewer] 已销毁');
  }

  // ========== 缓存管理 ==========

  /**
   * 生成缓存键
   * @param {Object|string} templateOrHtml - 模板或HTML
   * @param {Object} data - 数据
   * @param {string} mode - 模式
   * @returns {string} 缓存键
   */
  _generateCacheKey(templateOrHtml, data, mode) {
    try {
      const templateKey = typeof templateOrHtml === 'string' 
        ? templateOrHtml.substring(0, 100) 
        : JSON.stringify(templateOrHtml?.id || templateOrHtml?.name || 'unknown');
      const dataKey = JSON.stringify(data || {});
      return `${mode}_${templateKey}_${dataKey}`.substring(0, 500);
    } catch (e) {
      return `${mode}_${Date.now()}`;
    }
  }

  /**
   * 从缓存获取渲染结果
   * @param {string} cacheKey - 缓存键
   * @returns {Array<string>|null} 分页后的HTML数组或null
   */
  _getFromCache(cacheKey) {
    if (this._renderCache.has(cacheKey)) {
      const cached = this._renderCache.get(cacheKey);
      // 更新访问时间（LRU）
      this._renderCache.delete(cacheKey);
      this._renderCache.set(cacheKey, cached);
      console.log('[PPPreviewer] 使用缓存渲染结果');
      return cached;
    }
    return null;
  }

  /**
   * 将渲染结果存入缓存
   * @param {string} cacheKey - 缓存键
   * @param {Array<string>} pages - 分页HTML数组
   */
  _setToCache(cacheKey, pages) {
    // 如果缓存已满，删除最旧的条目
    if (this._renderCache.size >= this._cacheMaxSize) {
      const firstKey = this._renderCache.keys().next().value;
      this._renderCache.delete(firstKey);
    }
    this._renderCache.set(cacheKey, pages);
  }

  /**
   * 清空渲染缓存
   */
  clearCache() {
    this._renderCache.clear();
    console.log('[PPPreviewer] 缓存已清空');
  }

  // ========== 错误处理 ==========

  /**
   * 显示错误状态
   * @param {Error|string} error - 错误对象或消息
   */
  showError(error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (this.pagesContainer) {
      const page = this.createPageElement(this.currentMargin, {}, {});
      page.id = 'ppPreviewPageError';
      
      page.innerHTML = `
        <div class="pp-error-state" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 40px;
          text-align: center;
          color: #6b7280;
        ">
          <div class="error-icon" style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #374151;">渲染出错</h3>
          <p style="margin: 0; font-size: 14px; color: #9ca3af; max-width: 300px;">${this.escapeHtml(errorMessage)}</p>
          <button class="retry-btn" style="
            margin-top: 20px;
            padding: 8px 20px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          " onclick="this.closest('.pp-container')?.dispatchEvent(new CustomEvent('pp-retry'))">
            重试
          </button>
        </div>
      `;
      
      this.pagesContainer.innerHTML = '';
      this.pagesContainer.appendChild(page);
    }

    console.error('[PPPreviewer] 渲染错误:', errorMessage);
  }

  /**
   * 显示加载状态
   * @param {string} message - 加载消息
   */
  showLoading(message = '正在加载...') {
    if (this.pagesContainer) {
      const page = this.createPageElement(this.currentMargin, {}, {});
      page.id = 'ppPreviewPageLoading';
      
      page.innerHTML = `
        <div class="pp-loading-state" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 40px;
          text-align: center;
          color: #6b7280;
        ">
          <div class="loading-spinner" style="
            width: 40px;
            height: 40px;
            border: 3px solid #e5e7eb;
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            animation: pp-spin 1s linear infinite;
            margin-bottom: 16px;
          "></div>
          <p style="margin: 0; font-size: 14px; color: #9ca3af;">${this.escapeHtml(message)}</p>
        </div>
      `;
      
      // 注入加载动画样式
      this.injectLoadingStyles();
      
      this.pagesContainer.innerHTML = '';
      this.pagesContainer.appendChild(page);
    }
  }

  /**
   * 注入加载动画样式
   */
  injectLoadingStyles() {
    const styleId = 'pp-loading-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes pp-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * HTML转义
   * @param {string} str - 原始字符串
   * @returns {string} 转义后的字符串
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========== 性能优化 ==========

  /**
   * 分帧渲染（用于长列表优化）
   * @param {Array<HTMLElement>} elements - 待渲染元素
   * @param {HTMLElement} container - 容器
   * @param {number} batchSize - 每帧处理数量
   * @returns {Promise<void>}
   */
  async renderInFrames(elements, container, batchSize = 10) {
    return new Promise((resolve) => {
      let index = 0;

      const renderBatch = () => {
        const batch = elements.slice(index, index + batchSize);
        
        batch.forEach(el => {
          container.appendChild(el);
        });

        index += batchSize;

        if (index < elements.length) {
          // 使用 requestIdleCallback 或 requestAnimationFrame
          if ('requestIdleCallback' in window) {
            requestIdleCallback(renderBatch, { timeout: 100 });
          } else {
            requestAnimationFrame(renderBatch);
          }
        } else {
          resolve();
        }
      };

      renderBatch();
    });
  }

  /**
   * 获取渲染性能统计
   * @returns {Object} 性能统计信息
   */
  getPerformanceStats() {
    return {
      cacheSize: this._renderCache.size,
      cacheMaxSize: this._cacheMaxSize,
      isRendering: this._isRendering,
      queueLength: this._renderQueue.length,
      mode: this.mode,
      zoomLevel: this.zoomLevel,
      pageCount: this.pagesContainer?.querySelectorAll('.pp-paper').length || 0
    };
  }
}

