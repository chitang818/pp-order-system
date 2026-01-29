/**
 * 画布组件
 * 显示模板的区块列表，支持选择、删除、排序
 * 
 * V2 重构：使用统一的 PPPreviewer 预览器（edit 模式）
 */
import { BlockRegistry, BlockRenderer } from '../block-engine/index.js';
import { PPPreviewer, ZoomController } from '../pp-viewer/index.js';
import { TemplateService } from '../template-service.js';

export class EditorCanvas {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = options;
    this.template = options.template || null;
    this.selectedBlockId = options.selectedBlockId || null;
    this.mockData = options.mockData || {};
    this.draggedBlockId = null; // 正在拖拽的区块ID
    
    // PP预览器（统一预览组件）
    this.ppPreviewer = null;
    this.zoomController = null;
    
    // 是否使用统一预览器（默认启用）
    this.usePPPreviewer = options.usePPPreviewer !== false;
    
    // 延迟初始化预览器（等待DOM就绪）
    this._initPromise = null;
  }

  /**
   * 初始化PP预览器
   * @returns {Promise<void>}
   */
  async initPPPreviewer() {
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = new Promise((resolve) => {
      // 等待 DOM 就绪
      requestAnimationFrame(() => {
        try {
          const container = document.getElementById(this.containerId);
          if (!container) {
            console.warn('[EditorCanvas] 容器未找到:', this.containerId);
            resolve();
            return;
          }

          // 初始化 PP 预览器（edit 模式）
          this.ppPreviewer = new PPPreviewer(this.containerId, {
            mode: 'edit',
            showMarginMarks: true,
            multiPage: false,
            showBlockBorders: true,
            onBlockSelect: (blockId) => {
              this.selectedBlockId = blockId;
              // 触发外部回调
              if (this.options.onBlockSelect) {
                this.options.onBlockSelect(blockId);
              }
            },
            onBlockHover: (blockId) => {
              if (this.options.onBlockHover) {
                this.options.onBlockHover(blockId);
              }
            },
            onZoomChange: (level) => {
              if (this.zoomController) {
                this.zoomController.setZoomLevel(level);
              }
              if (this.options.onZoomChange) {
                this.options.onZoomChange(level);
              }
            }
          });

          // 初始化缩放控制器（延迟确保 DOM 元素存在）
          const zoomControlsId = this.options.zoomControlsId || 'editorZoomControls';
          this.initZoomController(zoomControlsId);

          console.log('[EditorCanvas] PP预览器初始化成功');
          resolve();
        } catch (error) {
          console.error('[EditorCanvas] PP预览器初始化失败:', error);
          this.ppPreviewer = null;
          resolve();
        }
      });
    });

    return this._initPromise;
  }

  /**
   * 设置模板
   * @param {Object} template - 模板配置
   */
  /**
   * 初始化缩放控制器（带重试机制）
   * @param {string} zoomControlsId - 缩放控件容器ID
   * @param {number} retries - 重试次数
   */
  initZoomController(zoomControlsId, retries = 5) {
    console.log(`[EditorCanvas] 初始化缩放控制器，剩余重试次数: ${retries}`);
    
    // 尝试多种方式查找容器
    let container = document.getElementById(zoomControlsId);
    console.log(`[EditorCanvas] getElementById('${zoomControlsId}'):`, !!container);
    
    // 如果直接找不到，尝试在当前视图容器内查找
    if (!container) {
      const viewContainer = document.querySelector('.view-active') || 
                           document.getElementById('view-container')?.querySelector('.view-active') ||
                           document.getElementById('view-document-center-template-editor');
      console.log('[EditorCanvas] 视图容器:', viewContainer?.id || viewContainer?.className);
      if (viewContainer) {
        container = viewContainer.querySelector(`#${zoomControlsId}`);
        console.log(`[EditorCanvas] 在视图容器内查找 #${zoomControlsId}:`, !!container);
      }
    }
    
    // 还是找不到，尝试全局查询所有可能的位置
    if (!container) {
      container = document.querySelector(`#${zoomControlsId}`) ||
                  document.querySelector(`[id="${zoomControlsId}"]`);
      console.log(`[EditorCanvas] querySelector('#${zoomControlsId}'):`, !!container);
    }

    // 最后尝试：直接在 view-container 内查找
    if (!container) {
      const viewMain = document.getElementById('view-container');
      if (viewMain) {
        container = viewMain.querySelector(`#${zoomControlsId}`);
        console.log(`[EditorCanvas] 在 view-container 内查找:`, !!container);
      }
    }
    
    if (container) {
      // 容器存在，直接初始化
      console.log('[EditorCanvas] 找到缩放控制器容器，开始初始化');
      this.zoomController = new ZoomController(container, {  // 直接传入 DOM 元素
        onZoomIn: () => {
          if (this.ppPreviewer) {
            this.ppPreviewer.zoomIn();
          }
        },
        onZoomOut: () => {
          if (this.ppPreviewer) {
            this.ppPreviewer.zoomOut();
          }
        },
        onFitToPage: () => {
          if (this.ppPreviewer) {
            this.ppPreviewer.fitToPage();
          }
        }
      });
      console.log('[EditorCanvas] 缩放控制器初始化成功');
    } else if (retries > 0) {
      // 容器不存在，延迟重试（增加延迟时间）
      console.log(`[EditorCanvas] 容器未找到，${150}ms后重试...`);
      setTimeout(() => {
        this.initZoomController(zoomControlsId, retries - 1);
      }, 150);
    } else {
      // 重试次数用尽，使用 fallback - 直接绑定按钮事件
      console.warn('[EditorCanvas] 缩放控制器容器未找到（重试次数用尽），尝试直接绑定按钮');
      this.bindZoomButtonsDirectly();
    }
  }

  /**
   * 直接绑定缩放按钮事件（fallback 方案）
   */
  bindZoomButtonsDirectly() {
    const zoomInBtn = document.getElementById('btnZoomIn') || 
                      document.querySelector('#btnZoomIn');
    const zoomOutBtn = document.getElementById('btnZoomOut') || 
                       document.querySelector('#btnZoomOut');
    const fitPageBtn = document.getElementById('btnFitPage') || 
                       document.querySelector('#btnFitPage');
    const zoomLevelEl = document.getElementById('zoomLevel') || 
                        document.querySelector('#zoomLevel');

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => this.ppPreviewer?.zoomIn());
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => this.ppPreviewer?.zoomOut());
    }
    if (fitPageBtn) {
      fitPageBtn.addEventListener('click', () => this.ppPreviewer?.fitToPage());
    }

    // 监听缩放变化更新显示
    if (zoomLevelEl && this.ppPreviewer) {
      const originalOnZoomChange = this.ppPreviewer.options.onZoomChange;
      this.ppPreviewer.options.onZoomChange = (level) => {
        zoomLevelEl.textContent = `${level}%`;
        if (originalOnZoomChange) {
          originalOnZoomChange(level);
        }
      };
    }

    console.log('[EditorCanvas] 缩放按钮直接绑定完成', {
      zoomIn: !!zoomInBtn,
      zoomOut: !!zoomOutBtn,
      fitPage: !!fitPageBtn,
      zoomLevel: !!zoomLevelEl
    });
  }

  setTemplate(template) {
    this.template = template;
    // 更新 Mock 数据
    this.updateMockData();
  }

  /**
   * 更新 Mock 数据（从模板生成）
   */
  updateMockData() {
    if (this.template) {
      try {
        this.mockData = TemplateService.createMockDataFromTemplate(this.template);
      } catch (error) {
        console.warn('[EditorCanvas] 生成 Mock 数据失败:', error);
        this.mockData = {};
      }
    }
  }

  /**
   * 设置选中的区块ID
   * @param {string|null} blockId - 区块ID
   */
  setSelectedBlockId(blockId) {
    this.selectedBlockId = blockId;
    
    // 使用 PP 预览器的区块选择
    if (this.ppPreviewer) {
      if (blockId) {
        this.ppPreviewer.selectBlock(blockId);
      } else {
        this.ppPreviewer.deselectBlock();
      }
    } else {
      // 回退到传统方式
      this.updateSelectedState();
    }
  }

  /**
   * 更新选中状态的显示（传统方式）
   */
  updateSelectedState() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    
    // 移除所有选中状态
    const allBlocks = container.querySelectorAll('.canvas-block');
    allBlocks.forEach(block => {
      block.classList.remove('selected');
    });
    
    // 添加当前选中状态
    if (this.selectedBlockId) {
      const selectedBlock = container.querySelector(`.canvas-block[data-block-id="${this.selectedBlockId}"]`);
      if (selectedBlock) {
        selectedBlock.classList.add('selected');
      }
    }
  }

  /**
   * 渲染画布
   * 优先使用 PP 预览器（edit 模式），保证与单据生成页面完全一致
   */
  async render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('[EditorCanvas] 画布容器未找到:', this.containerId);
      return;
    }
    
    // 获取页边距设置和全局样式
    const pageSettings = this.template?.pageSettings || 
                        this.template?.config?.pageSettings || 
                        { margin: { top: 15, bottom: 15, left: 15, right: 15 } };
    const margin = pageSettings.margin || { top: 15, bottom: 15, left: 15, right: 15 };
    const globalStyles = this.template?.globalStyles || 
                        this.template?.config?.globalStyles || 
                        { 
                          fontFamily: 'Arial, "Microsoft YaHei", sans-serif', 
                          fontSize: 12,
                          lineHeight: 1.4,
                          color: '#000'
                        };

    // 确保 Mock 数据已生成
    if (!this.mockData || Object.keys(this.mockData).length === 0) {
      this.updateMockData();
    }

    // 使用 PP 预览器（推荐）
    if (this.usePPPreviewer) {
      // 确保 PP 预览器已初始化
      if (!this.ppPreviewer) {
        await this.initPPPreviewer();
      }

      if (this.ppPreviewer) {
        try {
          // 检查模板是否为空
          const blocks = this.template?.blocks || this.template?.config?.blocks || [];
          if (blocks.length === 0) {
            // 显示空状态
            this.ppPreviewer.render(`
              <div class="pp-empty-state">
                <div class="empty-icon">📝</div>
                <div class="empty-text">
                  <div style="font-size: 16px; margin-bottom: 10px;">画布为空</div>
                  <div style="font-size: 13px; color: #999;">从左侧点击区块添加，或拖拽区块到这里</div>
                </div>
              </div>
            `, null, {
              margin,
              pageSettings,
              globalStyles
            });
          } else {
            // 渲染模板（使用 Mock 数据显示占位符）
            this.ppPreviewer.render(this.template, this.mockData, {
              margin,
              pageSettings,
              globalStyles
            });
          }
          
          // 绑定拖拽事件（PP 预览器已处理点击选择）
          this.bindDragEvents();
          
          console.log('[EditorCanvas] 使用 PP 预览器渲染完成');
          return;
        } catch (error) {
          console.error('[EditorCanvas] PP 预览器渲染失败，回退到传统方式:', error);
        }
      }
    }
    
    // 传统渲染方式（回退方案）
    this.renderTraditional(container, margin, globalStyles, pageSettings);
  }

  /**
   * 传统渲染方式（回退方案）
   */
  renderTraditional(container, margin, globalStyles, pageSettings) {
    if (!this.template || !this.template.blocks || this.template.blocks.length === 0) {
      container.innerHTML = `
        <div class="canvas-wrapper">
          <div class="canvas-container">
            <div class="canvas-paper" style="padding: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm; font-family: ${globalStyles.fontFamily}; font-size: ${globalStyles.fontSize}px; line-height: ${globalStyles.lineHeight}; color: ${globalStyles.color};">
              <div class="empty-state">
                <div style="font-size: 48px; margin-bottom: 15px;">📝</div>
                <div style="font-size: 16px; margin-bottom: 10px;">画布为空</div>
                <div style="font-size: 13px; color: #999;">从左侧点击区块添加，或拖拽区块到这里</div>
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    try {
      // 使用 BlockRenderer.renderContent() 直接获取内容HTML
      const contentHtml = BlockRenderer.renderContent(this.template, this.mockData);
      
      // 如果 renderContent 不可用，回退到解析完整HTML
      let finalContentHtml = contentHtml;
      if (!contentHtml || contentHtml.trim() === '') {
        try {
          const fullHtml = BlockRenderer.render(this.template, this.mockData);
          const parser = new DOMParser();
          const doc = parser.parseFromString(fullHtml, 'text/html');
          const bodyElement = doc.querySelector('body');
          finalContentHtml = bodyElement ? bodyElement.innerHTML : '';
        } catch (parseError) {
          console.error('[EditorCanvas] 解析HTML失败:', parseError);
          finalContentHtml = '';
        }
      }
      
      // 创建A4纸张容器
      container.innerHTML = `
        <div class="canvas-wrapper">
          <div class="canvas-container">
            <div class="canvas-paper">
              <!-- 页边距标记 -->
              <div class="margin-mark margin-mark-top-left" style="top: ${margin.top}mm; left: ${margin.left}mm;"></div>
              <div class="margin-mark margin-mark-top-right" style="top: ${margin.top}mm; right: ${margin.right}mm;"></div>
              <div class="margin-mark margin-mark-bottom-left" style="bottom: ${margin.bottom}mm; left: ${margin.left}mm;"></div>
              <div class="margin-mark margin-mark-bottom-right" style="bottom: ${margin.bottom}mm; right: ${margin.right}mm;"></div>
              
              <!-- 区块内容 -->
              <div class="canvas-content">
                ${finalContentHtml}
              </div>
            </div>
          </div>
        </div>
      `;
      
      // 渲染后，给每个区块添加标识
      this.attachBlockSelectors();
      this.updateSelectedState();
      
      // 应用全局样式
      const canvasPaper = container.querySelector('.canvas-paper');
      if (canvasPaper) {
        canvasPaper.style.setProperty('width', '210mm', 'important');
        canvasPaper.style.setProperty('min-height', '297mm', 'important');
        canvasPaper.style.setProperty('padding', `${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm`, 'important');
        canvasPaper.style.setProperty('font-family', globalStyles.fontFamily, 'important');
        canvasPaper.style.setProperty('font-size', `${globalStyles.fontSize}px`, 'important');
        canvasPaper.style.setProperty('line-height', globalStyles.lineHeight, 'important');
        canvasPaper.style.setProperty('color', globalStyles.color, 'important');
        canvasPaper.style.setProperty('background', '#fff', 'important');
        canvasPaper.style.setProperty('box-sizing', 'border-box', 'important');
      }
      
      const canvasContent = container.querySelector('.canvas-content');
      if (canvasContent) {
        canvasContent.style.width = '100%';
        canvasContent.style.maxWidth = '100%';
        canvasContent.style.boxSizing = 'border-box';
        canvasContent.style.overflow = 'hidden';
      }
      
    } catch (error) {
      console.error('[EditorCanvas] 渲染失败:', error);
      container.innerHTML = `
        <div class="canvas-wrapper">
          <div class="canvas-container">
            <div class="canvas-paper" style="padding: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm;">
              <div class="empty-state" style="color: #ff4d4f;">
                <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
                <div style="font-size: 16px; margin-bottom: 10px;">渲染失败</div>
                <div style="font-size: 13px; color: #999;">${error.message || '未知错误'}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
    this.bindEvents();
  }

  /**
   * 使用 BlockRenderer 渲染区块（应用样式，与单据生成页面一致）
   * @param {Object} block - 区块配置
   * @returns {string} 区块的HTML内容
   */
  renderBlockWithStyles(block) {
    try {
      // 使用 BlockRenderer 预处理数据（与单据生成页面一致）
      const processedData = BlockRenderer.preprocessData(this.mockData, this.template);
      
      // 使用 BlockRenderer 渲染单个区块（与单据生成页面使用相同的渲染引擎）
      const blockInstance = BlockRegistry.createBlock(block);
      if (blockInstance) {
        // 使用预处理后的数据渲染（与单据生成页面一致）
        const html = blockInstance.render(processedData);
        return html;
      }
    } catch (error) {
      console.warn('[EditorCanvas] 使用BlockRenderer渲染区块失败:', error);
    }
    
    // 如果渲染失败，回退到简化预览
    return this.renderBlockPreview(block);
  }

  /**
   * 给渲染后的区块添加标识，以便支持选择功能
   * BlockRenderer 按照模板blocks数组的顺序渲染，所以我们可以按顺序匹配
   */
  attachBlockSelectors() {
    const container = document.getElementById(this.containerId);
    if (!container || !this.template?.blocks) return;
    
    const canvasContent = container.querySelector('.canvas-content');
    if (!canvasContent) return;
    
    // 获取所有 .block 元素（BlockRenderer 渲染的区块）
    // BlockRenderer 按照模板blocks数组的顺序渲染，所以顺序应该一致
    const blockElements = Array.from(canvasContent.querySelectorAll('.block'));
    
    // 为每个区块添加标识和包装
    this.template.blocks.forEach((block, index) => {
      if (index < blockElements.length) {
        const blockElement = blockElements[index];
        const isSelected = block.id === this.selectedBlockId;
        
        // 检查是否已经被包装过
        if (blockElement.parentElement?.classList.contains('canvas-block')) {
          // 已经包装过，只更新选中状态
          const wrapper = blockElement.parentElement;
          wrapper.className = `canvas-block ${isSelected ? 'selected' : ''}`;
          wrapper.setAttribute('data-block-id', block.id);
          wrapper.setAttribute('data-index', index.toString());
          return;
        }
        
        // 创建包装容器
        const wrapper = document.createElement('div');
        wrapper.className = `canvas-block ${isSelected ? 'selected' : ''}`;
        wrapper.setAttribute('data-block-id', block.id);
        wrapper.setAttribute('data-index', index.toString());
        wrapper.setAttribute('draggable', 'true');
        wrapper.style.position = 'relative';
        
        // 将区块元素移动到包装容器中
        const parent = blockElement.parentNode;
        parent.insertBefore(wrapper, blockElement);
        wrapper.appendChild(blockElement);
      }
    });
  }

  /**
   * 渲染区块预览（简化版）
   */
  renderBlockPreview(block) {
    const BlockClass = BlockRegistry.get(block.type);
    if (!BlockClass) {
      return `<div style="color: #999;">未知区块类型: ${block.type}</div>`;
    }

    try {
      // 尝试渲染真实预览
      const blockInstance = BlockRegistry.createBlock(block);
      if (blockInstance) {
        const html = blockInstance.render(this.mockData);
        // 限制预览高度
        return `<div style="max-height: 200px; overflow: hidden; border: 1px solid #eee; padding: 8px; border-radius: 4px; background: #fafafa;">
          ${html}
        </div>`;
      }
    } catch (error) {
      console.warn('区块预览渲染失败:', error);
    }

    // 对于产品表格，显示列配置摘要
    if (block.type === 'product-table') {
      const columns = block.config?.columns || [];
      return `<div style="background: #f5f5f5; padding: 10px; border-radius: 4px;">
        <div style="font-weight: 600; margin-bottom: 5px;">产品表格</div>
        <div style="font-size: 12px; color: #666;">
          列数: ${columns.length} | 
          ${columns.map(c => c.header).slice(0, 3).join(', ')}${columns.length > 3 ? '...' : ''}
        </div>
      </div>`;
    }

    // 其他区块显示类型名称
    return `<div style="background: #f5f5f5; padding: 10px; border-radius: 4px; text-align: center; color: #666;">
      ${BlockClass.displayName}
    </div>`;
  }

  /**
   * 绑定拖拽事件（用于 PP 预览器模式）
   * PP 预览器已处理点击选择，这里只处理拖拽
   */
  bindDragEvents() {
    const container = document.getElementById(this.containerId);
    if (!container || this._dragEventsBound) return;

    this._dragEventsBound = true;

    // 拖拽开始事件
    container.addEventListener('dragstart', (e) => {
      const block = e.target.closest('[data-block-id]');
      if (block) {
        this.draggedBlockId = block.dataset.blockId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', block.dataset.blockId);
        // 设置拖拽视觉效果
        block.style.opacity = '0.5';
      }
    });

    // 拖拽结束事件
    container.addEventListener('dragend', (e) => {
      const block = e.target.closest('[data-block-id]');
      if (block) {
        block.style.opacity = '1';
        this.draggedBlockId = null;
      }
      // 清除所有拖拽指示器
      this.clearDragIndicators();
    });

    // 拖拽经过事件
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const block = e.target.closest('[data-block-id]');
      if (block && this.draggedBlockId && block.dataset.blockId !== this.draggedBlockId) {
        // 添加视觉指示器显示放置位置
        this.clearDragIndicators();
        block.style.borderTop = '3px solid #3b82f6';
      }
    });

    // 拖拽离开事件
    container.addEventListener('dragleave', (e) => {
      const block = e.target.closest('[data-block-id]');
      if (block) {
        block.style.borderTop = '';
      }
    });

    // 拖拽放置事件
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      this.clearDragIndicators();
      
      const targetBlock = e.target.closest('[data-block-id]');
      if (targetBlock && this.draggedBlockId && this.draggedBlockId !== targetBlock.dataset.blockId) {
        // 执行区块重新排序
        if (this.options.onBlockMove) {
          this.options.onBlockMove(this.draggedBlockId, targetBlock.dataset.blockId);
        }
      } else {
        // 检查是否是从外部拖入的新区块
        const blockType = e.dataTransfer.getData('block-type');
        if (blockType && this.options.onBlockAdd) {
          this.options.onBlockAdd(blockType);
        }
      }
      
      this.draggedBlockId = null;
    });
  }

  /**
   * 清除所有拖拽指示器
   */
  clearDragIndicators() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    
    const allBlocks = container.querySelectorAll('[data-block-id]');
    allBlocks.forEach(b => {
      b.style.borderTop = '';
    });
  }

  /**
   * 绑定事件（传统方式，用于回退方案）
   */
  bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // 移除旧的事件监听器（如果存在）
    if (this._clickHandler) {
      container.removeEventListener('click', this._clickHandler);
    }

    // 点击选择区块
    this._clickHandler = (e) => {
      // 查找点击的区块（支持点击区块本身或区块内的元素）
      const block = e.target.closest('.canvas-block');
      if (block) {
        e.stopPropagation();
        const blockId = block.dataset.blockId;
        if (blockId && this.options.onBlockSelect) {
          console.log('[EditorCanvas] 选择区块:', blockId);
          this.options.onBlockSelect(blockId);
        }
      } else {
        // 点击空白处，取消选中
        if (this.options.onBlockSelect) {
          this.options.onBlockSelect(null);
        }
      }
    };

    container.addEventListener('click', this._clickHandler);

    // 拖拽开始事件
    container.addEventListener('dragstart', (e) => {
      const block = e.target.closest('.canvas-block');
      if (block) {
        this.draggedBlockId = block.dataset.blockId;
        e.dataTransfer.effectAllowed = 'move';
        // 设置拖拽视觉效果
        block.style.opacity = '0.5';
      }
    });

    // 拖拽结束事件
    container.addEventListener('dragend', (e) => {
      const block = e.target.closest('.canvas-block');
      if (block) {
        // 恢复视觉效果
        block.style.opacity = '1';
        this.draggedBlockId = null;
      }
    });

    // 拖拽经过事件
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const block = e.target.closest('.canvas-block');
      if (block && this.draggedBlockId) {
        // 添加视觉指示器显示放置位置
        block.style.borderTop = '2px solid #1890ff';
      }
    });

    // 拖拽离开事件
    container.addEventListener('dragleave', (e) => {
      const block = e.target.closest('.canvas-block');
      if (block) {
        // 移除视觉指示器
        block.style.borderTop = '';
      }
      container.style.backgroundColor = '';
    });

    // 拖拽放置事件
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      container.style.backgroundColor = '';
      
      // 移除所有视觉指示器
      const allBlocks = container.querySelectorAll('.canvas-block');
      allBlocks.forEach(b => {
        b.style.borderTop = '';
      });
      
      const targetBlock = e.target.closest('.canvas-block');
      if (targetBlock && this.draggedBlockId && this.draggedBlockId !== targetBlock.dataset.blockId) {
        // 执行区块重新排序
        if (this.options.onBlockMove) {
          this.options.onBlockMove(this.draggedBlockId, targetBlock.dataset.blockId);
        }
      } else {
        // 检查是否是从外部拖入的新区块
        const blockType = e.dataTransfer.getData('block-type');
        if (blockType && this.options.onBlockAdd) {
          this.options.onBlockAdd(blockType);
        }
      }
      
      this.draggedBlockId = null;
    });
  }

  /**
   * 缩放操作（代理到 PP 预览器）
   */
  zoomIn() {
    if (this.ppPreviewer) {
      this.ppPreviewer.zoomIn();
    }
  }

  zoomOut() {
    if (this.ppPreviewer) {
      this.ppPreviewer.zoomOut();
    }
  }

  fitToPage() {
    if (this.ppPreviewer) {
      this.ppPreviewer.fitToPage();
    }
  }

  setZoom(level) {
    if (this.ppPreviewer) {
      this.ppPreviewer.setZoom(level);
    }
  }

  getZoomLevel() {
    return this.ppPreviewer ? this.ppPreviewer.getZoomLevel() : 100;
  }

  /**
   * 获取选中的区块
   */
  getSelectedBlock() {
    return this.selectedBlockId;
  }

  /**
   * 刷新渲染
   */
  refresh() {
    this.render();
  }

  /**
   * 销毁组件
   */
  destroy() {
    if (this.ppPreviewer) {
      this.ppPreviewer.destroy();
      this.ppPreviewer = null;
    }
    if (this.zoomController) {
      this.zoomController.destroy();
      this.zoomController = null;
    }
    
    const container = document.getElementById(this.containerId);
    if (container && this._clickHandler) {
      container.removeEventListener('click', this._clickHandler);
    }
  }
}

