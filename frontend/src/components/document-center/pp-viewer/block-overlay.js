/**
 * 区块覆盖层管理器
 * 用于在编辑模式下显示区块的选择和悬停状态
 */

/**
 * 区块覆盖层类
 * 管理区块的选择高亮、悬停高亮等视觉效果
 */
export class BlockOverlay {
  constructor(pageContainer, options = {}) {
    this.pageContainer = pageContainer;
    this.options = {
      selectedColor: options.selectedColor || '#3b82f6',      // 选中颜色（蓝色）
      hoveredColor: options.hoveredColor || '#10b981',        // 悬停颜色（绿色）
      selectedBgOpacity: options.selectedBgOpacity || 0.1,    // 选中背景透明度
      hoveredBgOpacity: options.hoveredBgOpacity || 0.05,     // 悬停背景透明度
      borderWidth: options.borderWidth || 2,                  // 边框宽度
      ...options
    };

    this.overlays = new Map(); // 存储覆盖层元素
    this.selectedBlockId = null;
    this.hoveredBlockId = null;
    this._retryCount = 0;  // 重试计数器
    this._maxRetries = 3;  // 最大重试次数
  }

  /**
   * 更新页面容器引用
   * @param {HTMLElement} pageContainer - 新的页面容器
   */
  setPageContainer(pageContainer) {
    this.pageContainer = pageContainer;
    this._retryCount = 0;  // 重置重试计数
  }

  /**
   * 添加选择覆盖层
   * @param {string} blockId - 区块ID
   */
  addSelectedOverlay(blockId) {
    this.removeOverlay(this.selectedBlockId); // 移除之前的选择
    this.selectedBlockId = blockId;
    this.createOverlay(blockId, 'selected');
  }

  /**
   * 添加悬停覆盖层
   * @param {string} blockId - 区块ID
   */
  addHoveredOverlay(blockId) {
    // 如果是已选中的区块，不显示悬停覆盖层
    if (blockId === this.selectedBlockId) return;
    
    this.removeOverlay(this.hoveredBlockId); // 移除之前的悬停
    this.hoveredBlockId = blockId;
    this.createOverlay(blockId, 'hovered');
  }

  /**
   * 移除选择覆盖层
   */
  removeSelectedOverlay() {
    this.removeOverlay(this.selectedBlockId);
    this.selectedBlockId = null;
  }

  /**
   * 移除悬停覆盖层
   */
  removeHoveredOverlay() {
    this.removeOverlay(this.hoveredBlockId);
    this.hoveredBlockId = null;
  }

  /**
   * 创建覆盖层元素
   * @param {string} blockId - 区块ID
   * @param {string} type - 类型：'selected' | 'hovered'
   * @param {number} retryCount - 当前重试次数
   */
  createOverlay(blockId, type, retryCount = 0) {
    if (!blockId) return;

    // 尝试多种方式查找区块元素
    let blockElement = null;
    
    // 方式1：在 pageContainer 中查找
    if (this.pageContainer) {
      blockElement = this.pageContainer.querySelector(`[data-block-id="${blockId}"]`);
    }
    
    // 方式2：在整个文档中查找
    if (!blockElement) {
      blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    }
    
    // 方式3：在 .pp-paper 元素中查找
    if (!blockElement) {
      const paper = document.querySelector('.pp-paper');
      if (paper) {
        blockElement = paper.querySelector(`[data-block-id="${blockId}"]`);
      }
    }
    
    // 还是找不到，延迟重试（最多重试 3 次）
    if (!blockElement) {
      if (retryCount < this._maxRetries) {
        console.log(`[BlockOverlay] 未找到区块元素: ${blockId}，重试 ${retryCount + 1}/${this._maxRetries}`);
        requestAnimationFrame(() => {
          this.createOverlay(blockId, type, retryCount + 1);
        });
      } else {
        console.warn(`[BlockOverlay] 重试次数已用尽，无法找到区块元素: ${blockId}`);
      }
      return;
    }
    
    // 更新 pageContainer 为元素的实际父容器
    const actualContainer = blockElement.closest('.pp-paper');
    if (actualContainer && actualContainer !== this.pageContainer) {
      this.pageContainer = actualContainer;
    }

    // 计算区块相对于页面容器的位置
    const blockRect = blockElement.getBoundingClientRect();
    const pageRect = this.pageContainer.getBoundingClientRect();

    const isSelected = type === 'selected';
    const color = isSelected ? this.options.selectedColor : this.options.hoveredColor;
    const bgOpacity = isSelected ? this.options.selectedBgOpacity : this.options.hoveredBgOpacity;

    // 创建覆盖层
    const overlay = document.createElement('div');
    overlay.className = `pp-block-overlay pp-block-overlay-${type}`;
    overlay.dataset.blockId = blockId;
    overlay.dataset.overlayType = type;
    overlay.style.cssText = `
      position: absolute;
      top: ${blockRect.top - pageRect.top}px;
      left: ${blockRect.left - pageRect.left}px;
      width: ${blockRect.width}px;
      height: ${blockRect.height}px;
      pointer-events: none;
      z-index: ${isSelected ? 101 : 100};
      border: ${this.options.borderWidth}px solid ${color};
      background: rgba(${this.hexToRgb(color)}, ${bgOpacity});
      box-sizing: border-box;
      transition: all 0.15s ease-out;
    `;

    // 添加选中状态的标识（如角标）
    if (isSelected) {
      const badge = document.createElement('div');
      badge.className = 'pp-block-overlay-badge';
      badge.style.cssText = `
        position: absolute;
        top: -8px;
        right: -8px;
        width: 16px;
        height: 16px;
        background: ${color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 10px;
        font-weight: bold;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      `;
      badge.innerHTML = '✓';
      overlay.appendChild(badge);
    }

    this.pageContainer.appendChild(overlay);
    this.overlays.set(`${type}-${blockId}`, overlay);
  }

  /**
   * 移除覆盖层
   * @param {string} blockId - 区块ID
   */
  removeOverlay(blockId) {
    if (!blockId) return;

    // 移除所有类型的覆盖层
    ['selected', 'hovered'].forEach(type => {
      const key = `${type}-${blockId}`;
      const overlay = this.overlays.get(key);
      if (overlay) {
        overlay.remove();
        this.overlays.delete(key);
      }
    });
  }

  /**
   * 更新覆盖层位置（当内容变化时调用）
   */
  updateOverlayPositions() {
    this.overlays.forEach((overlay, key) => {
      const blockId = overlay.dataset.blockId;
      const type = overlay.dataset.overlayType;
      
      const blockElement = this.pageContainer?.querySelector(`[data-block-id="${blockId}"]`);
      if (!blockElement) {
        overlay.remove();
        this.overlays.delete(key);
        return;
      }

      const blockRect = blockElement.getBoundingClientRect();
      const pageRect = this.pageContainer.getBoundingClientRect();

      overlay.style.top = `${blockRect.top - pageRect.top}px`;
      overlay.style.left = `${blockRect.left - pageRect.left}px`;
      overlay.style.width = `${blockRect.width}px`;
      overlay.style.height = `${blockRect.height}px`;
    });
  }

  /**
   * 清除所有覆盖层
   */
  clearAll() {
    this.overlays.forEach(overlay => overlay.remove());
    this.overlays.clear();
    this.selectedBlockId = null;
    this.hoveredBlockId = null;
  }

  /**
   * 获取选中的区块ID
   */
  getSelectedBlockId() {
    return this.selectedBlockId;
  }

  /**
   * 十六进制颜色转RGB
   * @param {string} hex - 十六进制颜色值
   * @returns {string} RGB值，如 "59, 130, 246"
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return '59, 130, 246'; // 默认蓝色
  }

  /**
   * 销毁
   */
  destroy() {
    this.clearAll();
    this.pageContainer = null;
  }
}

