/**
 * 订单参数配置页面管理器
 * 负责管理订单编辑页面中各种下拉选框的候选内容
 */

import { ApiService } from '../../api/api.js';

export class OrderConfigManager {
  constructor() {
    this.container = document.getElementById('view-orders-config');
    this.configs = [];
    this.categories = [
      'trade_term', 'destination_port', 'unit', 'cleanliness', 'safety_factor',
      'label_b', 'label_c', 'wrapping_cloth', 'box_type', 'box_quantity'
    ];
  }

  /**
   * 初始化页面
   */
  async init() {
    if (!this.container) return;

    await this.loadConfigs();
    this.bindEvents();
  }

  /**
   * 从后端加载所有配置
   */
  async loadConfigs() {
    try {
      const data = await ApiService.orderConfigs.list();
      // API 现在直接返回数组
      if (Array.isArray(data)) {
        this.configs = data;
        this.renderAll();
      } else {
        console.error('[OrderConfigManager] API 返回数据格式错误:', data);
      }
    } catch (error) {
      console.error('[OrderConfigManager] 加载配置失败:', error);
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('加载配置失败', 'error');
      }
    }
  }

  /**
   * 渲染所有分类的配置项
   */
  renderAll() {
    this.categories.forEach(category => {
      this.renderCategory(category);
    });
  }

  /**
   * 渲染特定分类的配置项
   * @param {string} category 
   */
  renderCategory(category) {
    const listEl = document.getElementById(`list-${category}`);
    if (!listEl) return;

    const categoryConfigs = this.configs.filter(c => c.category === category)
      .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));

    if (categoryConfigs.length === 0) {
      listEl.innerHTML = '<span class="empty-tip">暂无候选内容</span>';
      return;
    }

    listEl.innerHTML = categoryConfigs.map((config, index) => `
      <div class="config-tag" data-id="${config.id}" data-category="${category}">
        <div class="config-tag-sort">
          <button class="sort-btn sort-up" data-action="move-up" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="sort-btn sort-down" data-action="move-down" title="下移" ${index === categoryConfigs.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <div class="config-tag-text">${this.escapeHtml(config.value)}</div>
        <div class="config-tag-actions">
          <span class="config-tag-delete" data-action="delete" title="删除">×</span>
        </div>
      </div>
    `).join('');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 监听添加按钮点击
    this.container.querySelectorAll('.config-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const section = e.target.closest('.config-section');
        const category = section.dataset.category;
        const title = section.querySelector('.config-section-title').textContent;
        this.handleAdd(category, title);
      });
    });

    // 监听删除和排序按钮点击（使用事件委托）
    this.container.addEventListener('click', (e) => {
      // 删除按钮
      const deleteBtn = e.target.closest('[data-action="delete"]');
      if (deleteBtn) {
        const tag = deleteBtn.closest('.config-tag');
        const id = tag.dataset.id;
        const value = tag.querySelector('.config-tag-text').textContent;
        this.handleDelete(id, value);
        return;
      }

      // 排序按钮
      const sortBtn = e.target.closest('.sort-btn');
      if (sortBtn) {
        const tag = sortBtn.closest('.config-tag');
        if (!tag) return;

        const category = tag.dataset.category;
        const listEl = document.getElementById(`list-${category}`);
        if (!listEl) return;

        const action = sortBtn.dataset.action;
        const tags = Array.from(listEl.querySelectorAll('.config-tag'));
        const currentIndex = tags.indexOf(tag);

        if (action === 'move-up' && currentIndex > 0) {
          // 上移
          listEl.insertBefore(tag, tags[currentIndex - 1]);
          this.updateSortOrder(listEl, category);
        } else if (action === 'move-down' && currentIndex < tags.length - 1) {
          // 下移
          listEl.insertBefore(tag, tags[currentIndex + 1].nextSibling);
          this.updateSortOrder(listEl, category);
        }
      }
    });
  }

  /**
   * 绑定拖拽排序功能（保留作为备选方案）
   * @param {HTMLElement} listEl - 配置项列表容器
   * @param {string} category - 配置分类
   */
  bindDragSort(listEl, category) {
    let draggingTag = null;
    let dragIndicatorTarget = null;

    // 清除拖拽指示器
    const clearDragOverIndicator = () => {
      listEl.querySelectorAll('.config-tag').forEach(tag => {
        tag.classList.remove('drag-over-before', 'drag-over-after');
      });
      dragIndicatorTarget = null;
    };

    // 应用拖拽指示器
    const applyDragOverIndicator = (tag, before) => {
      if (!tag) return;
      if (dragIndicatorTarget && dragIndicatorTarget !== tag) {
        dragIndicatorTarget.classList.remove('drag-over-before', 'drag-over-after');
      }
      dragIndicatorTarget = tag;
      if (before) {
        tag.classList.add('drag-over-before');
        tag.classList.remove('drag-over-after');
      } else {
        tag.classList.add('drag-over-after');
        tag.classList.remove('drag-over-before');
      }
    };

    // 绑定每个标签的拖拽功能
    listEl.querySelectorAll('.config-tag').forEach(tag => {
      // 整个标签都可以拖拽，不仅仅是句柄
      tag.draggable = true;

      // 桌面：原生拖拽
      tag.addEventListener('dragstart', (e) => {
        draggingTag = tag;
        tag.classList.add('dragging');
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', '');
          // 设置拖拽图像
          e.dataTransfer.setDragImage(tag, 0, 0);
        } catch (_) { }
      });

      tag.addEventListener('dragend', () => {
        if (draggingTag) {
          draggingTag.classList.remove('dragging');
          if (draggingTag !== tag) {
            // 只有在实际移动了位置时才更新排序
            this.updateSortOrder(listEl, category);
          }
        }
        draggingTag = null;
        clearDragOverIndicator();
      });

      tag.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!draggingTag || draggingTag === tag) return;
        const rect = tag.getBoundingClientRect();
        const before = e.clientY < (rect.top + rect.height / 2);
        applyDragOverIndicator(tag, before);
      });

      tag.addEventListener('dragleave', () => {
        // 延迟清除，避免闪烁
        setTimeout(() => {
          if (dragIndicatorTarget === tag) {
            tag.classList.remove('drag-over-before', 'drag-over-after');
          }
        }, 50);
      });

      tag.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggingTag || draggingTag === tag) return;

        const rect = tag.getBoundingClientRect();
        const before = e.clientY < (rect.top + rect.height / 2);

        if (before) {
          listEl.insertBefore(draggingTag, tag);
        } else {
          listEl.insertBefore(draggingTag, tag.nextSibling);
        }

        clearDragOverIndicator();
      });

      // 触摸/指针设备：Pointer 事件回退（整个标签都可以拖拽）
      let pointerDragging = null;
      let pointerStartY = 0;
      let pointerStartX = 0;

      const onPointerMove = (e) => {
        if (!pointerDragging) return;

        // 计算移动距离，只有移动超过阈值才开始拖拽
        const deltaY = Math.abs(e.clientY - pointerStartY);
        const deltaX = Math.abs(e.clientX - pointerStartX);

        if (deltaY < 5 && deltaX < 5) return; // 移动阈值

        const el = document.elementFromPoint(e.clientX, e.clientY);
        const targetTag = el ? el.closest('.config-tag') : null;
        if (!targetTag || targetTag === pointerDragging || !listEl.contains(targetTag)) {
          // 如果不在其他标签上，清除指示器
          clearDragOverIndicator();
          return;
        }

        const rect = targetTag.getBoundingClientRect();
        const before = e.clientY < (rect.top + rect.height / 2);

        if (before) {
          listEl.insertBefore(pointerDragging, targetTag);
        } else {
          listEl.insertBefore(pointerDragging, targetTag.nextSibling);
        }

        applyDragOverIndicator(targetTag, before);
      };

      const endPointerDrag = () => {
        if (pointerDragging) {
          pointerDragging.classList.remove('dragging');
          this.updateSortOrder(listEl, category);
        }
        pointerDragging = null;
        listEl.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('touchmove', preventScrollDuringDrag);
        clearDragOverIndicator();
      };

      const preventScrollDuringDrag = (e) => {
        if (pointerDragging) {
          e.preventDefault();
        }
      };

      // 整个标签都可以通过触摸拖拽
      tag.addEventListener('pointerdown', (e) => {
        // 如果点击的是删除按钮，不触发拖拽
        if (e.target.closest('.config-tag-delete')) return;

        if (e.button !== 0) return; // 只处理主按钮
        pointerDragging = tag;
        pointerStartY = e.clientY;
        pointerStartX = e.clientX;
        tag.classList.add('dragging');
        listEl.addEventListener('pointermove', onPointerMove);
        document.addEventListener('touchmove', preventScrollDuringDrag, { passive: false });
        tag.setPointerCapture(e.pointerId);
        e.preventDefault();
      });

      tag.addEventListener('pointerup', endPointerDrag);
      tag.addEventListener('pointercancel', endPointerDrag);
    });
  }

  /**
   * 更新排序顺序
   * @param {HTMLElement} listEl - 配置项列表容器
   * @param {string} category - 配置分类
   */
  async updateSortOrder(listEl, category) {
    const tags = Array.from(listEl.querySelectorAll('.config-tag'));
    const updates = [];

    tags.forEach((tag, index) => {
      const id = tag.dataset.id;
      const config = this.configs.find(c => String(c.id) === String(id));
      if (config && config.sortIndex !== index + 1) {
        updates.push({
          id,
          sortIndex: index + 1
        });
      }
    });

    if (updates.length === 0) return;

    // 批量更新 sortIndex
    try {
      const updatePromises = updates.map(update => {
        const config = this.configs.find(c => String(c.id) === String(update.id));
        console.log('[OrderConfigManager] 更新排序:', {
          id: update.id,
          oldSort: config?.sortIndex,
          newSort: update.sortIndex,
          value: config?.value
        });

        return ApiService.orderConfigs.update({
          id: update.id,
          value: config?.value || '', // Ensure value is not undefined
          sortIndex: update.sortIndex
        });
      });

      await Promise.all(updatePromises);

      // 更新本地配置的 sortIndex
      updates.forEach(update => {
        const config = this.configs.find(c => String(c.id) === String(update.id));
        if (config) {
          config.sortIndex = update.sortIndex;
        }
      });

      // 重新渲染以更新按钮状态
      this.renderCategory(category);
    } catch (error) {
      console.error('[OrderConfigManager] 更新排序失败:', error);
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('更新排序失败', 'error');
      }
      // 重新加载配置以恢复正确顺序
      await this.loadConfigs();
    }
  }

  /**
   * 处理添加逻辑
   */
  async handleAdd(category, title) {
    if (!window.ModalDialog) {
      console.error('[OrderConfigManager] ModalDialog 未加载');
      return;
    }

    const value = await window.ModalDialog.prompt(`添加候选内容 - ${title} `, {
      placeholder: '请输入新的内容：',
      defaultValue: ''
    });

    if (!value || !value.trim()) return;

    try {
      // 获取当前分类最大的 sortIndex
      const categoryConfigs = this.configs.filter(c => c.category === category);
      const maxSortIndex = categoryConfigs.reduce((max, c) => Math.max(max, c.sortIndex || 0), 0);

      const newConfig = await ApiService.orderConfigs.create({
        category,
        value: value.trim(),
        sortIndex: maxSortIndex + 1
      });

      if (newConfig) {
        if (window.NotificationSystem) {
          window.NotificationSystem.toast('添加成功', 'success');
        }
        // 重新加载所有配置以确保数据同步和UI一致性
        await this.loadConfigs();
      }
    } catch (error) {
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('添加失败: ' + (error.message || String(error)), 'error');
      }
    }
  }

  /**
   * 处理删除逻辑
   */
  async handleDelete(id, value) {
    if (!window.ModalDialog) {
      console.error('[OrderConfigManager] ModalDialog 未加载');
      return;
    }

    const confirmed = await window.ModalDialog.confirm(
      `确定要删除 "${value}" 吗？此操作不可撤销。`,
      {
        title: '确认删除',
        icon: '⚠️'
      }
    );

    if (!confirmed) return;

    try {
      const res = await ApiService.orderConfigs.remove(id);

      if (res && res.success) {
        if (window.NotificationSystem) {
          window.NotificationSystem.toast('已删除', 'success');
        }
        const index = this.configs.findIndex(c => String(c.id) === String(id));
        if (index !== -1) {
          const category = this.configs[index].category;
          this.configs.splice(index, 1);
          this.renderCategory(category);
        }
      }
    } catch (error) {
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('删除失败: ' + (error.message || String(error)), 'error');
      }
    }
  }

  /**
   * HTML转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * 路由初始化回调
 */
export async function initOrderConfigPage() {
  const manager = new OrderConfigManager();
  await manager.init();
}
