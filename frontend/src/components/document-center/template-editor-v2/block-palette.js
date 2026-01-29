/**
 * 区块面板组件
 * 显示所有可用的区块类型，支持点击添加
 */
import { BlockRegistry } from '../block-engine/index.js';

export class BlockPalette {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = options;
  }

  /**
   * 渲染区块面板
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('区块面板容器未找到:', this.containerId);
      return;
    }

    const blockTypes = BlockRegistry.getAllTypes();
    
    // 按类别分组
    const categories = {
      header: { name: '📋 标题区块', blocks: [] },
      content: { name: '📊 内容区块', blocks: [] },
      footer: { name: '✍️ 底部区块', blocks: [] },
      layout: { name: '📐 布局区块', blocks: [] },
      other: { name: '📦 其他区块', blocks: [] }
    };

    blockTypes.forEach(block => {
      const category = categories[block.category] || categories.other;
      category.blocks.push(block);
    });

    let html = '';
    Object.values(categories).forEach(category => {
      if (category.blocks.length === 0) return;
      
      html += `<div class="block-category">
        <div class="block-category-title">${category.name}</div>`;
      
      category.blocks.forEach(block => {
        html += `<div class="block-item" data-type="${block.type}" draggable="true">
          <span class="block-item-icon">${block.icon}</span>
          <span class="block-item-name">${block.name}</span>
        </div>`;
      });
      
      html += '</div>';
    });

    container.innerHTML = html;
    this.bindEvents();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // 点击添加区块
    container.addEventListener('click', (e) => {
      const blockItem = e.target.closest('.block-item');
      if (blockItem) {
        const type = blockItem.dataset.type;
        if (this.options.onBlockClick) {
          this.options.onBlockClick(type);
        }
      }
    });

    // 拖拽支持
    container.addEventListener('dragstart', (e) => {
      const blockItem = e.target.closest('.block-item');
      if (blockItem) {
        e.dataTransfer.setData('block-type', blockItem.dataset.type);
        blockItem.style.opacity = '0.5';
      }
    });

    container.addEventListener('dragend', (e) => {
      const blockItem = e.target.closest('.block-item');
      if (blockItem) {
        blockItem.style.opacity = '1';
      }
    });
  }
}

