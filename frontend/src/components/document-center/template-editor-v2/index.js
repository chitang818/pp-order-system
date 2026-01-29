/**
 * 新版模板编辑器
 * 傻瓜式、可视化、零代码
 */
import { BlockRegistry, BlockRenderer } from '../block-engine/index.js';
import { BlockPalette } from './block-palette.js';
import { EditorCanvas } from './editor-canvas.js';
import { PropertyPanel } from './property-panel.js';
import { ApplicabilityConfig } from './applicability-config.js';

export class TemplateEditorV2 {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = options;
    this.template = options.template || null;
    this.selectedBlockId = null;
    this.mockData = options.mockData || this.getDefaultMockData();
    
    // 子组件
    this.blockPalette = null;
    this.editorCanvas = null;
    this.propertyPanel = null;
    this.applicabilityConfig = null;
  }

  /**
   * 初始化编辑器
   */
  async init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error('编辑器容器未找到:', this.containerId);
      return;
    }

    this.render();
    await this.initComponents();
    this.bindEvents();
    
    // 如果有初始模板，加载它
    if (this.template) {
      await this.loadTemplate(this.template);
    }
  }

  /**
   * 渲染编辑器界面
   */
  render() {
    this.container.innerHTML = `
      <div class="template-editor-v2">
        <!-- 工具栏 -->
        <div class="editor-toolbar">
          <div class="toolbar-left">
            <input type="text" id="templateName" class="template-name-input" 
                   placeholder="模板名称" value="${this.template?.name || '新建模板'}">
            <select id="templateType" class="template-type-select">
              <option value="sales" ${this.template?.type === 'sales' ? 'selected' : ''}>销售确认书</option>
              <option value="production" ${this.template?.type === 'production' ? 'selected' : ''}>生产通知单</option>
              <option value="invoice" ${this.template?.type === 'invoice' ? 'selected' : ''}>商业发票</option>
              <option value="packing" ${this.template?.type === 'packing' ? 'selected' : ''}>装箱单</option>
              <option value="pickup" ${this.template?.type === 'pickup' ? 'selected' : ''}>拉货通知</option>
            </select>
          </div>
          <div class="toolbar-right">
            <button id="btnApplicability" class="toolbar-btn">📋 适用规则</button>
            <button id="btnPreview" class="toolbar-btn">👁️ 预览</button>
            <button id="btnSave" class="toolbar-btn primary">💾 保存</button>
            <button id="btnBack" class="toolbar-btn">← 返回</button>
          </div>
        </div>

        <!-- 主体区域 -->
        <div class="editor-body">
          <!-- 左侧：模板配置面板 -->
          <div class="block-palette-panel">
            <div class="panel-header">⚙️ 模板配置</div>
            <div class="panel-body">
              <!-- 画布配置区域 -->
              <div class="config-section-wrapper">
                <div class="config-section-header">
                  <span class="config-section-icon">📐</span>
                  <span class="config-section-title">画布配置</span>
                </div>
                <div class="config-section-content">
                  <button id="btnOpenMarginSettings" class="config-action-btn">
                    <span class="btn-icon">📐</span>
                    <span class="btn-text">页边距设置</span>
                  </button>
                </div>
              </div>
              
              <!-- 区块库区域 -->
              <div class="config-section-wrapper blocks-section">
                <div class="config-section-header">
                  <span class="config-section-icon">📦</span>
                  <span class="config-section-title">区块库</span>
                </div>
                <div class="config-section-content">
                  <div id="blockPalette">
                    <!-- 区块列表由 BlockPalette 组件生成 -->
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 中间：画布区域 -->
          <div class="canvas-panel">
            <div class="panel-header">📄 画布</div>
            <div class="panel-body">
              <div class="canvas-container" id="editorCanvas">
                <!-- 区块内容由 EditorCanvas 组件生成 -->
              </div>
            </div>
          </div>

          <!-- 右侧：属性面板 -->
          <div class="property-panel">
            <div class="panel-header">⚙️ 属性配置</div>
            <div class="panel-body" id="propertyPanel">
              <div class="empty-state">选择区块以编辑属性</div>
            </div>
          </div>
        </div>

        <!-- 适用规则配置弹窗 -->
        <div id="applicabilityModal" class="modal-overlay" style="display: none;">
          <div class="modal-content">
            <div class="modal-header">
              <h3>📋 模板适用规则配置</h3>
              <button class="modal-close" id="closeApplicabilityModal">✕</button>
            </div>
            <div class="modal-body" id="applicabilityConfigPanel">
              <!-- 适用规则配置内容由 ApplicabilityConfig 组件生成 -->
            </div>
            <div class="modal-footer">
              <button class="toolbar-btn" id="cancelApplicability">取消</button>
              <button class="toolbar-btn primary" id="saveApplicability">确定</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // 注入样式
    this.injectStyles();
  }

  /**
   * 注入样式
   */
  injectStyles() {
    if (document.getElementById('template-editor-v2-styles')) {
      return; // 样式已存在
    }

    // 尝试加载外部样式文件
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/src/components/document-center/template-editor-v2/styles.css';
    link.id = 'template-editor-v2-styles-link';
    document.head.appendChild(link);

    // 同时注入内联样式作为备用
    const style = document.createElement('style');
    style.id = 'template-editor-v2-styles';
    style.textContent = `
      .template-editor-v2 {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: #f5f5f7;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      }
      .editor-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 16px;
        height: 64px;
        background: #fff;
        border-bottom: 1px solid #e5e7eb;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        flex-shrink: 0;
      }
      .toolbar-left, .toolbar-right {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .template-name-input {
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        width: 200px;
      }
      .template-type-select {
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }
      .toolbar-btn {
        padding: 8px 16px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: #fff;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      }
      .toolbar-btn:hover {
        background: #f0f0f0;
      }
      .toolbar-btn.primary {
        background: #1890ff;
        color: #fff;
        border-color: #1890ff;
      }
      .toolbar-btn.primary:hover {
        background: #40a9ff;
      }
      .editor-body {
        display: flex;
        flex: 1;
        overflow: hidden;
        min-height: 0;
      }
      .block-palette-panel {
        flex: 1;
        min-width: 320px;
        background: #fff;
        border-right: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        transition: width 0.3s;
      }
      .canvas-panel {
        flex: 0 0 900px;
        display: flex;
        flex-direction: column;
        background: #f5f5f7;
        overflow: hidden;
      }
      .property-panel {
        flex: 1;
        min-width: 320px;
        background: #fff;
        border-left: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        transition: width 0.3s;
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        font-weight: 600;
        font-size: 13px;
        color: #111827;
        border-bottom: 1px solid #e5e7eb;
        background: #f9fafb;
        flex-shrink: 0;
      }
      .panel-body {
        flex: 1;
        overflow: hidden;
        padding: 16px;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
        .canvas-wrapper {
          flex: 1;
          overflow: auto;
          padding: 15px !important;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 0;
          position: relative;
          background: #d4d4d4;
          box-sizing: border-box;
        }
        .canvas-container {
          transform-origin: top center;
          transition: transform 0.2s ease-out;
          margin: 0 auto !important;
          width: fit-content;
          height: fit-content;
        }
        .canvas-paper {
          width: 210mm;
          min-height: 297mm;
          background: #fff;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          border: 1px solid #e5e7eb;
          position: relative;
          overflow: visible;
          box-sizing: border-box;
          flex-shrink: 0;
          display: block;
          margin: 0;
          transform-origin: top center;
          /* 确保内容可选择和复制 */
          user-select: text;
          -webkit-user-select: text;
          -moz-user-select: text;
          -ms-user-select: text;
        }
        /* WPS风格页边距灰色直角标记 */
        .margin-mark {
          position: absolute;
          z-index: 10;
          pointer-events: none;
        }
        .margin-mark::before,
        .margin-mark::after {
          content: '';
          position: absolute;
          background: #9ca3af;
        }
        .margin-mark-top-left::before {
          top: 0;
          left: 0;
          width: 12px;
          height: 1.5px;
        }
        .margin-mark-top-left::after {
          top: 0;
          left: 0;
          width: 1.5px;
          height: 12px;
        }
        .margin-mark-top-right::before {
          top: 0;
          right: 0;
          width: 12px;
          height: 1.5px;
        }
        .margin-mark-top-right::after {
          top: 0;
          right: 0;
          width: 1.5px;
          height: 12px;
        }
        .margin-mark-bottom-left::before {
          bottom: 0;
          left: 0;
          width: 12px;
          height: 1.5px;
        }
        .margin-mark-bottom-left::after {
          bottom: 0;
          left: 0;
          width: 1.5px;
          height: 12px;
        }
        .margin-mark-bottom-right::before {
          bottom: 0;
          right: 0;
          width: 12px;
          height: 1.5px;
        }
        .margin-mark-bottom-right::after {
          bottom: 0;
          right: 0;
          width: 1.5px;
          height: 12px;
        }
      .empty-state {
        text-align: center;
        color: #999;
        padding: 40px 20px;
      }
      /* 模板配置区域样式 */
      .config-section-wrapper {
        margin-bottom: 24px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        overflow: hidden;
        transition: all 0.2s;
      }
      .config-section-wrapper:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      }
      .config-section-wrapper.blocks-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        margin-bottom: 0;
      }
      .config-section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
        font-size: 13px;
        font-weight: 600;
        color: #111827;
      }
      .config-section-icon {
        font-size: 16px;
      }
      .config-section-content {
        padding: 16px;
      }
      .blocks-section .config-section-content {
        flex: 1;
        overflow: auto;
        min-height: 0;
        padding: 12px;
      }
      /* 画布配置按钮样式 */
      .config-action-btn {
        width: 100%;
        padding: 12px 16px;
        background: #fff;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        color: #374151;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .config-action-btn:hover {
        background: #f9fafb;
        border-color: #3b82f6;
        color: #3b82f6;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
      }
      .config-action-btn:active {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(59, 130, 246, 0.1);
      }
      .config-action-btn .btn-icon {
        font-size: 16px;
      }
      .config-action-btn .btn-text {
        font-size: 13px;
      }
      /* 区块库样式 */
      .block-category {
        margin-bottom: 15px;
      }
      .block-category-title {
        font-size: 13px;
        font-weight: 600;
        color: #333;
        margin-bottom: 10px;
        padding: 6px 0;
        border-bottom: 2px solid #e0e0e0;
      }
      .block-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        margin-bottom: 6px;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        background: #fff;
        user-select: none;
      }
      .block-item:hover {
        background: #f0f7ff;
        border-color: #1890ff;
        transform: translateX(3px);
        box-shadow: 0 2px 4px rgba(24, 144, 255, 0.1);
      }
      .block-item:active {
        transform: translateX(1px);
        box-shadow: 0 1px 2px rgba(24, 144, 255, 0.15);
      }
      .block-item-icon {
        font-size: 18px;
        flex-shrink: 0;
      }
      .block-item-name {
        font-size: 13px;
        color: #333;
        font-weight: 500;
        flex: 1;
      }
      /* 区块库滚动条样式 */
      #blockPalette {
        max-height: calc(100vh - 200px);
        overflow-y: auto;
      }
      #blockPalette::-webkit-scrollbar {
        width: 6px;
      }
      #blockPalette::-webkit-scrollbar-track {
        background: #f5f5f5;
      }
      #blockPalette::-webkit-scrollbar-thumb {
        background: #ccc;
        border-radius: 3px;
      }
      #blockPalette::-webkit-scrollbar-thumb:hover {
        background: #999;
      }
      /* 适用规则弹窗样式 */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal-content {
        background: #fff;
        border-radius: 8px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        border-bottom: 1px solid #eee;
      }
      .modal-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .modal-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #999;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal-close:hover {
        color: #333;
      }
      .modal-body {
        flex: 1;
        overflow: auto;
        padding: 20px;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 15px 20px;
        border-top: 1px solid #eee;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 初始化子组件
   */
  async initComponents() {
    // 初始化区块面板
    this.blockPalette = new BlockPalette('blockPalette', {
      onBlockClick: (type) => this.addBlock(type)
    });
    this.blockPalette.render();

    // 初始化画布（使用 PP 预览器）
    this.editorCanvas = new EditorCanvas('editorCanvas', {
      template: this.template,
      selectedBlockId: this.selectedBlockId,
      mockData: this.mockData,
      onBlockSelect: (blockId) => this.selectBlock(blockId),
      onBlockDelete: (blockId) => this.deleteBlock(blockId),
      onBlockMove: (draggedBlockId, targetBlockId) => {
        this.moveBlock(draggedBlockId, targetBlockId);
      },
      onBlockHover: (blockId) => {
        // 可选：悬停区块时的回调
      },
      onZoomChange: (level) => {
        // 可选：缩放级别变化时的回调
        console.log('[TemplateEditorV2] 缩放级别:', level);
      }
    });
    // EditorCanvas.render() 是异步的
    await this.editorCanvas.render();

    // 初始化属性面板
    this.propertyPanel = new PropertyPanel('propertyPanel', {
      template: this.template,
      onPropertyChange: (blockId, propName, value) => this.updateBlockProperty(blockId, propName, value),
      onPageSettingsChange: (pageSettings) => this.updatePageSettings(pageSettings),
      onPageSettingsPreview: (pageSettings) => this.previewPageSettings(pageSettings),
      onCloseMarginSettings: () => {
        this.showingMarginSettings = false;
        this.selectBlock(this.selectedBlockId); // 重新渲染属性面板
      },
      onBlockDelete: (blockId) => this.deleteBlock(blockId),
      onBlockMove: (draggedBlockId, targetBlockId) => this.moveBlock(draggedBlockId, targetBlockId)
    });
    
    // 初始渲染属性面板（显示页边距设置）
    if (this.propertyPanel) {
      this.propertyPanel.render();
    }

    // 初始化适用规则配置（隐藏，通过按钮打开）
    this.applicabilityConfig = new ApplicabilityConfig('applicabilityConfigPanel', {
      customers: this.options.customers || [],
      onChange: (applicability) => {
        if (this.template) {
          this.template.applicability = applicability;
        }
      }
    });
    
    // 初始化时加载适用规则
    if (this.template && this.template.applicability) {
      this.applicabilityConfig.setValue(this.template.applicability);
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 工具栏按钮
    const btnApplicability = document.getElementById('btnApplicability');
    const btnPreview = document.getElementById('btnPreview');
    const btnSave = document.getElementById('btnSave');
    const btnBack = document.getElementById('btnBack');

    if (btnApplicability) {
      btnApplicability.addEventListener('click', () => this.openApplicabilityConfig());
    }
    if (btnPreview) {
      btnPreview.addEventListener('click', () => this.preview());
    }
    if (btnSave) {
      btnSave.addEventListener('click', () => this.save());
    }
    if (btnBack) {
      btnBack.addEventListener('click', () => this.goBack());
    }

    // 适用规则弹窗按钮
    const closeModal = document.getElementById('closeApplicabilityModal');
    const cancelBtn = document.getElementById('cancelApplicability');
    const saveBtn = document.getElementById('saveApplicability');
    const modal = document.getElementById('applicabilityModal');

    if (closeModal) {
      closeModal.addEventListener('click', () => this.closeApplicabilityConfig());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeApplicabilityConfig());
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (this.applicabilityConfig) {
          const applicability = this.applicabilityConfig.getValue();
          if (this.template) {
            this.template.applicability = applicability;
          }
        }
        this.closeApplicabilityConfig();
      });
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeApplicabilityConfig();
        }
      });
    }

    // 模板名称和类型变更
    const templateName = document.getElementById('templateName');
    const templateType = document.getElementById('templateType');
    
    if (templateName) {
      templateName.addEventListener('change', () => {
        if (this.template) {
          this.template.name = templateName.value;
        }
      });
    }
    
    if (templateType) {
      templateType.addEventListener('change', () => {
        if (this.template) {
          this.template.type = templateType.value;
        }
      });
    }

    // 打开页边距设置按钮
    const btnOpenMarginSettings = document.getElementById('btnOpenMarginSettings');
    if (btnOpenMarginSettings) {
      btnOpenMarginSettings.addEventListener('click', () => {
        console.log('[TemplateEditorV2] 点击页边距设置按钮');
        this.showingMarginSettings = true;
        // 清除选中的区块，让属性面板显示页边距设置
        this.selectedBlockId = null;
        if (this.propertyPanel) {
          this.propertyPanel.showMarginSettings = true;
          this.propertyPanel.render();
        }
        // 更新画布选中状态
        if (this.editorCanvas) {
          this.editorCanvas.setSelectedBlockId(null);
          this.editorCanvas.render();
        }
      });
    }
  }


  /**
   * 加载模板
   */
  async loadTemplate(template) {
    this.template = template;
    
    // 更新UI
    const templateName = document.getElementById('templateName');
    const templateType = document.getElementById('templateType');
    
    if (templateName) templateName.value = template.name || '新建模板';
    if (templateType) templateType.value = template.type || 'sales';
    
    // 更新属性面板的模板引用
    if (this.propertyPanel) {
      this.propertyPanel.options.template = template;
      // 如果没有选中区块，重新渲染以显示页边距设置
      if (!this.selectedBlockId) {
        this.propertyPanel.render();
      }
    }
    
    // 更新画布
    if (this.editorCanvas) {
      this.editorCanvas.setTemplate(template);
      await this.editorCanvas.render();
    }
  }

  /**
   * 添加区块
   */
  async addBlock(type) {
    if (!this.template) {
      this.template = {
        id: 'new_' + Date.now(),
        name: '新建模板',
        type: document.getElementById('templateType')?.value || 'sales',
        blocks: [],
        pageSettings: { margin: { top: 15, bottom: 15, left: 15, right: 15 } },
        globalStyles: { fontFamily: 'Arial, "Microsoft YaHei", sans-serif', fontSize: 12 },
        applicability: {
          isDefault: false,
          productTypes: [],
          customerIds: [],
          customerNames: [],
          priority: 0
        }
      };
    }

    const BlockClass = BlockRegistry.get(type);
    if (!BlockClass) {
      console.error('未知的区块类型:', type);
      return;
    }

    const newBlock = {
      id: 'block_' + Date.now(),
      type: type,
      config: BlockClass.getDefaultConfig()
    };

    this.template.blocks.push(newBlock);
    
    // 更新画布（等待渲染完成）
    if (this.editorCanvas) {
      this.editorCanvas.setTemplate(this.template);
      await this.editorCanvas.render();
    }
    
    // 渲染完成后，延迟选择新添加的区块（确保DOM已更新）
    requestAnimationFrame(() => {
      this.selectBlock(newBlock.id);
    });
  }

  /**
   * 删除区块
   */
  deleteBlock(blockId) {
    if (!this.template || !this.template.blocks) return;
    
    // 过滤掉要删除的区块
    this.template.blocks = this.template.blocks.filter(block => block.id !== blockId);
    
    // 如果删除的是当前选中的区块，清空选中状态
    if (this.selectedBlockId === blockId) {
      this.selectedBlockId = null;
      if (this.propertyPanel) {
        this.propertyPanel.setBlock(null);
      }
    }
    
    // 更新画布
    if (this.editorCanvas) {
      this.editorCanvas.render();
    }
  }

  /**
   * 移动区块（拖拽排序）
   * @param {string} draggedBlockId - 被拖拽的区块ID
   * @param {string} targetBlockId - 目标区块ID
   */
  moveBlock(draggedBlockId, targetBlockId) {
    if (!this.template || !this.template.blocks) return;
    
    // 找到被拖拽区块和目标区块的索引
    const draggedIndex = this.template.blocks.findIndex(block => block.id === draggedBlockId);
    const targetIndex = this.template.blocks.findIndex(block => block.id === targetBlockId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // 移除被拖拽的区块
    const [draggedBlock] = this.template.blocks.splice(draggedIndex, 1);
    
    // 在目标位置插入被拖拽的区块
    // 如果目标索引大于被拖拽索引，由于已经移除了一个元素，目标索引不需要调整
    const insertIndex = targetIndex > draggedIndex ? targetIndex : targetIndex;
    this.template.blocks.splice(insertIndex, 0, draggedBlock);
    
    // 更新画布
    if (this.editorCanvas) {
      this.editorCanvas.render();
    }
    
    // 如果被拖拽的区块是当前选中的区块，保持选中状态并更新属性面板
    if (this.selectedBlockId === draggedBlockId) {
      if (this.editorCanvas) {
        this.editorCanvas.setSelectedBlockId(draggedBlockId);
      }
      // 重新渲染属性面板以更新上移/下移按钮状态
      if (this.propertyPanel) {
        const block = this.template?.blocks?.find(b => b.id === draggedBlockId);
        if (block) {
          this.propertyPanel.setBlock(block);
        }
      }
    }
  }

  /**
   * 选择区块
   */
  selectBlock(blockId) {
    console.log('[TemplateEditorV2] selectBlock 被调用, blockId:', blockId);
    this.selectedBlockId = blockId;
    
    // 更新画布选中状态（不重新渲染，只更新覆盖层）
    if (this.editorCanvas) {
      this.editorCanvas.setSelectedBlockId(blockId);
      // 不再调用 render()，PPPreviewer.selectBlock 会处理覆盖层
    }
    
    // 更新属性面板
    if (this.propertyPanel) {
      if (blockId) {
        const block = this.template?.blocks?.find(b => b.id === blockId);
        console.log('[TemplateEditorV2] 找到区块:', block);
        if (block) {
          this.propertyPanel.setBlock(block);
        } else {
          console.warn('[TemplateEditorV2] 未找到区块, blockId:', blockId);
          this.propertyPanel.setBlock(null);
        }
      } else {
        // 没有选中区块时，显示页边距设置
        console.log('[TemplateEditorV2] 取消选择区块');
        this.propertyPanel.setBlock(null);
      }
    } else {
      console.warn('[TemplateEditorV2] propertyPanel 未初始化');
    }
  }

  /**
   * 更新区块属性
   */
  updateBlockProperty(blockId, propName, value) {
    if (!this.template || !this.template.blocks) return;
    
    const block = this.template.blocks.find(b => b.id === blockId);
    if (!block) return;
    
    // 设置嵌套属性值
    this.setNestedValue(block.config, propName, value);
    
    // 更新画布预览
    if (this.editorCanvas) {
      this.editorCanvas.render();
    }
  }

  /**
   * 更新页面设置（页边距和全局样式）
   */
  updatePageSettings(pageSettings) {
    if (!this.template) {
      // 如果模板不存在，创建新模板
      this.template = {
        id: 'new_' + Date.now(),
        name: document.getElementById('templateName')?.value || '新建模板',
        type: document.getElementById('templateType')?.value || 'sales',
        blocks: [],
        pageSettings: { margin: pageSettings.margin || { top: 15, bottom: 15, left: 15, right: 15 } },
        globalStyles: pageSettings.globalStyles || { fontFamily: 'Arial, "Microsoft YaHei", sans-serif', fontSize: 12, lineHeight: 1.4, color: '#000' },
        applicability: {
          isDefault: false,
          productTypes: [],
          customerIds: [],
          customerNames: [],
          priority: 0
        }
      };
    } else {
      // 更新现有模板的页面设置
      if (!this.template.pageSettings) {
        this.template.pageSettings = {};
      }
      if (pageSettings.margin) {
        this.template.pageSettings.margin = pageSettings.margin;
      }
      
      // 更新全局样式
      if (pageSettings.globalStyles) {
        if (!this.template.globalStyles) {
          this.template.globalStyles = {};
        }
        Object.assign(this.template.globalStyles, pageSettings.globalStyles);
      }
    }

    // 更新属性面板的模板引用
    if (this.propertyPanel) {
      // 保存当前的显示状态
      const wasShowingMarginSettings = this.propertyPanel.showMarginSettings;
      
      this.propertyPanel.options.template = this.template;
      
      // 如果正在显示页边距设置，保持显示状态并重新渲染
      if (wasShowingMarginSettings) {
        this.propertyPanel.showMarginSettings = true;
        // 使用 setTimeout 确保在模板更新后再渲染
        setTimeout(() => {
          this.propertyPanel.showMarginSettings = true;
          this.propertyPanel.render();
        }, 0);
      }
    }

    // 更新画布以应用新的页边距
    if (this.editorCanvas) {
      this.editorCanvas.setTemplate(this.template);
      this.editorCanvas.render();
    }
  }

  /**
   * 预览页面设置（实时预览，不保存）
   */
  previewPageSettings(pageSettings) {
    // 临时更新画布的页边距，用于实时预览
    if (this.editorCanvas) {
      const tempTemplate = { ...this.template };
      if (!tempTemplate.pageSettings) {
        tempTemplate.pageSettings = {};
      }
      tempTemplate.pageSettings = { ...tempTemplate.pageSettings, ...pageSettings };
      this.editorCanvas.setTemplate(tempTemplate);
      this.editorCanvas.render();
    }
  }

  /**
   * 预览模板
   */
  preview() {
    if (!this.template || !this.template.blocks || this.template.blocks.length === 0) {
      alert('请先添加区块');
      return;
    }

    try {
      const html = BlockRenderer.render(this.template, this.mockData);
      const previewWindow = window.open('', '_blank');
      
      // 写入HTML
      previewWindow.document.write(html);
      previewWindow.document.close();
      
      // 等待DOM加载完成后添加A4边框样式
      previewWindow.addEventListener('load', () => {
        this.addA4BorderToPreview(previewWindow);
      });
      
      // 如果已经加载完成，立即执行
      if (previewWindow.document.readyState === 'complete') {
        setTimeout(() => {
          this.addA4BorderToPreview(previewWindow);
        }, 100);
      }
    } catch (error) {
      console.error('预览失败:', error);
      alert('预览失败: ' + error.message);
    }
  }

  /**
   * 在预览窗口中添加A4页面边框
   * @param {Window} previewWindow - 预览窗口对象
   */
  addA4BorderToPreview(previewWindow) {
    try {
      const doc = previewWindow.document;
      const htmlEl = doc.documentElement;
      const bodyEl = doc.body;
      
      if (!htmlEl || !bodyEl) return;
      
      // 获取body的原始padding（来自页边距设置）
      const computedStyle = previewWindow.getComputedStyle(bodyEl);
      const originalPadding = {
        top: computedStyle.paddingTop,
        right: computedStyle.paddingRight,
        bottom: computedStyle.paddingBottom,
        left: computedStyle.paddingLeft
      };
      
      // 创建A4边框包装容器
      const paperWrapper = doc.createElement('div');
      paperWrapper.className = 'preview-paper-wrapper';
      paperWrapper.style.cssText = `
        background: #d4d4d4;
        padding: 20px;
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        margin: 0;
        box-sizing: border-box;
      `;
      
      const paperContainer = doc.createElement('div');
      paperContainer.className = 'preview-paper';
      paperContainer.style.cssText = `
        width: 210mm;
        min-height: 297mm;
        background: #fff;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        border: 2px solid #3b82f6;
        position: relative;
        box-sizing: border-box;
        margin: 0;
        overflow: visible;
      `;
      
      // 创建内容容器，保留原始padding
      const contentContainer = doc.createElement('div');
      contentContainer.className = 'preview-content';
      contentContainer.style.cssText = `
        padding: ${originalPadding.top} ${originalPadding.right} ${originalPadding.bottom} ${originalPadding.left};
        box-sizing: border-box;
        width: 100%;
        min-height: calc(297mm - ${originalPadding.top} - ${originalPadding.bottom});
      `;
      
      // 将body内容移到contentContainer中
      while (bodyEl.firstChild) {
        contentContainer.appendChild(bodyEl.firstChild);
      }
      
      // 组装结构：paperWrapper > paperContainer > contentContainer > 内容
      paperContainer.appendChild(contentContainer);
      paperWrapper.appendChild(paperContainer);
      
      // 重置body样式并添加包装器
      bodyEl.style.cssText = `
        margin: 0;
        padding: 0;
        background: transparent;
        width: 100%;
        min-height: 100vh;
      `;
      bodyEl.appendChild(paperWrapper);
      
      // 设置html样式
      htmlEl.style.cssText = `
        margin: 0;
        padding: 0;
        height: 100%;
      `;
    } catch (error) {
      console.error('添加A4边框失败:', error);
    }
  }

  /**
   * 保存模板
   */
  async save() {
    if (!this.template) {
      alert('没有可保存的内容');
      return;
    }

    // 获取最新的模板数据（包含从DOM读取的最新值）
    const templateData = this.getTemplateData();
    if (!templateData) {
      alert('无法获取模板数据');
      return;
    }

    // 更新内部模板对象，保持同步
    this.template.name = templateData.name;
    this.template.type = templateData.type;
    this.template.applicability = templateData.applicability;

    // 如果有自定义保存回调，使用它
    if (this.options.onSave) {
      await this.options.onSave(templateData);
      return;
    }

    // 否则使用默认的API保存
    try {
      const response = await fetch('/api/document-center/templates', {
        method: templateData.id?.startsWith('new_') ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData)
      });

      if (response.ok) {
        const result = await response.json();
        this.template.id = result.id || templateData.id;
        // 更新内部模板对象
        Object.assign(this.template, templateData);
        alert('保存成功！');
        
        // 触发保存成功回调
        if (this.options.onSave) {
          this.options.onSave(templateData);
        }
      } else {
        const error = await response.json();
        throw new Error(error.message || '保存失败');
      }
    } catch (error) {
      console.error('保存模板失败:', error);
      alert('保存失败: ' + error.message);
    }
  }

  /**
   * 打开适用规则配置
   */
  openApplicabilityConfig() {
    const modal = document.getElementById('applicabilityModal');
    if (modal && this.applicabilityConfig) {
      // 更新适用规则数据
      if (this.template && this.template.applicability) {
        this.applicabilityConfig.setValue(this.template.applicability);
      }
      // 渲染配置界面
      this.applicabilityConfig.render();
      // 显示弹窗
      modal.style.display = 'flex';
    }
  }

  /**
   * 关闭适用规则配置
   */
  closeApplicabilityConfig() {
    const modal = document.getElementById('applicabilityModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * 返回
   */
  goBack() {
    if (this.options.onBack) {
      this.options.onBack();
    } else {
      window.location.hash = '#/document-center/templates';
    }
  }

  /**
   * 获取模板数据
   */
  getTemplate() {
    return this.template;
  }

  /**
   * 获取用于保存的模板数据
   * 返回格式化的模板数据对象，符合后端API格式
   */
  getTemplateData() {
    if (!this.template) {
      return null;
    }

    // 更新模板基本信息
    const templateName = document.getElementById('templateName');
    const templateType = document.getElementById('templateType');
    
    // 获取适用规则
    let applicability = this.template.applicability || {
      isDefault: false,
      productTypes: [],
      customerIds: [],
      customerNames: [],
      priority: 0
    };
    
    // 从适用规则配置组件获取最新值（如果存在）
    if (this.applicabilityConfig) {
      applicability = this.applicabilityConfig.getValue();
    }
    
    // 构建完整的模板配置对象（包含所有模板数据）
    const config = {
      blocks: this.template.blocks || [],
      pageSettings: this.template.pageSettings || { 
        margin: { top: 15, bottom: 15, left: 15, right: 15 } 
      },
      globalStyles: this.template.globalStyles || { 
        fontFamily: 'Arial, "Microsoft YaHei", sans-serif', 
        fontSize: 12 
      },
      applicability: applicability
    };
    
    // 构建符合后端API格式的模板数据对象
    const templateData = {
      id: this.template.id,
      name: templateName?.value || this.template.name || '未命名模板',
      type: templateType?.value || this.template.type || 'sales',
      config: config,
      isDefault: applicability?.isDefault || false
    };

    return templateData;
  }

  // 工具方法
  getNestedValue(obj, path) {
    if (!path) return undefined;
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  setNestedValue(obj, path, value) {
    if (!path) return;
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((o, k) => {
      if (!o[k]) o[k] = {};
      return o[k];
    }, obj);
    target[last] = value;
  }

  getDefaultMockData() {
    return {
      order: {
        contractNo: 'SC2025-001',
        invoiceNo: 'IV2025-001',
        invoiceDate: '2025-12-09',
        shipmentDate: '2025-12-25',
        destination: 'KOBE, JAPAN',
        payment: 'T/T',
        insurance: 'BY BUYER',
        totalValue: 'USD16643.60',
        specialClause: 'N/A',
        remarks: 'Please confirm',
        items: [
          { 
            model: 'D#319-II', 
            quantity: 960, 
            packages: 6, 
            unit: '托盘',
            unitPrice: 4.96, 
            price: 4.96,
            packing: '160条/托盘',
            amount: 4761.60
          },
          { 
            model: 'D#66(5)JB', 
            quantity: 300, 
            packages: 30, 
            unit: '件',
            unitPrice: 3.69, 
            price: 3.69,
            packing: '10条/件',
            amount: 1107.00
          }
        ]
      },
      customer: {
        name: 'DAINEN TRADING CO.,LTD',
        address: '123 Sample Street, Tokyo, Japan',
        tel: '03-1234-5678',
        fax: '03-1234-5679'
      },
      company: {
        companyNameEN: 'QINGDAO SHENGCHI PACKAGING PRODUCT CO.,LTD',
        companyNameCN: '青岛盛驰包装制品有限公司',
        companyAddressEN: 'NO7 NUODALU AISHAN INDUSTRIAL PARK, QINGDAO, CHINA',
        companyAddressCN: '青岛市崂山区工业园7号',
        companyTel: '0532-83161609',
        companyFax: '0532-83161772'
      }
    };
  }
}

