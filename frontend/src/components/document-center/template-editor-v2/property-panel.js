/**
 * 属性配置面板
 * 根据选中的区块显示可配置的属性
 */
import { BlockRegistry } from '../block-engine/index.js';
import { VariableSelector } from './variable-selector.js';
import { FontSizeSelector } from './font-size-selector.js';

export class PropertyPanel {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = options;
    this.currentBlock = null;
    this.variableSelector = null;
    this.fontSizeSelector = null;
    this.showMarginSettings = false; // 是否显示页边距设置
  }

  /**
   * 设置当前区块
   */
  setBlock(block) {
    console.log('[PropertyPanel] setBlock 被调用, block:', block);
    this.currentBlock = block;
    // 如果设置了区块，确保不显示页边距设置
    if (block) {
      this.showMarginSettings = false;
    }
    this.render();
  }

  /**
   * 渲染属性面板
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('属性面板容器未找到:', this.containerId);
      return;
    }

    // 如果显示页边距设置，渲染页边距设置界面
    if (this.showMarginSettings) {
      this.renderMarginSettings(container);
      return;
    }

    if (!this.currentBlock) {
      // 没有选中区块时，显示空状态
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 48px; margin-bottom: 15px;">📝</div>
          <div style="font-size: 16px; margin-bottom: 10px;">未选择区块</div>
          <div style="font-size: 13px; color: #999;">请从左侧区块库中选择一个区块进行配置</div>
        </div>
      `;
      return;
    }

    const BlockClass = BlockRegistry.get(this.currentBlock.type);
    if (!BlockClass) {
      container.innerHTML = '<div class="empty-state">未知的区块类型</div>';
      return;
    }

    const properties = BlockClass.getPropertyDefinitions() || [];
    const blockName = BlockClass.displayName || this.currentBlock.type;

    // 获取当前区块在模板中的索引
    const template = this.options.template;
    const blockIndex = template?.blocks?.findIndex(b => b.id === this.currentBlock.id) ?? -1;
    const canMoveUp = blockIndex > 0;
    const canMoveDown = blockIndex >= 0 && blockIndex < (template?.blocks?.length ?? 0) - 1;

    let html = `
      <div class="property-panel-content">
        <div class="property-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
          <h4 style="margin: 0; font-size: 14px; font-weight: 600;">${blockName} 配置</h4>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button id="btnMoveUp" class="block-action-btn" title="上移" ${!canMoveUp ? 'disabled' : ''} style="padding: 4px 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; ${!canMoveUp ? 'opacity: 0.5; cursor: not-allowed;' : ''}">↑</button>
            <button id="btnMoveDown" class="block-action-btn" title="下移" ${!canMoveDown ? 'disabled' : ''} style="padding: 4px 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; ${!canMoveDown ? 'opacity: 0.5; cursor: not-allowed;' : ''}">↓</button>
            <button id="btnDeleteBlock" class="block-action-btn" title="删除区块" style="padding: 4px 8px; font-size: 12px; border: 1px solid #ff4d4f; border-radius: 4px; background: #ff4d4f; color: #fff; cursor: pointer;">删除</button>
          </div>
        </div>
        <div class="property-form">
    `;

    properties.forEach(prop => {
      html += this.renderPropertyField(prop);
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
    this.bindEvents();
  }

  /**
   * 渲染属性字段
   */
  renderPropertyField(prop) {
    const value = this.getNestedValue(this.currentBlock.config, prop.name);
    let input = '';

    switch (prop.type) {
      case 'text':
        input = `<input type="text" 
                        data-property="${prop.name}" 
                        value="${this.escapeHtml(value || '')}" 
                        class="property-input"
                        placeholder="${prop.placeholder || ''}">`;
        break;

      case 'number':
        input = `<input type="number" 
                        data-property="${prop.name}" 
                        value="${value !== undefined ? value : (prop.default || 0)}" 
                        min="${prop.min !== undefined ? prop.min : ''}"
                        max="${prop.max !== undefined ? prop.max : ''}"
                        step="${prop.step || 1}"
                        class="property-input">`;
        break;

      case 'boolean':
        input = `<label class="checkbox-label">
                  <input type="checkbox" 
                         data-property="${prop.name}" 
                         ${value ? 'checked' : ''}>
                  <span>${prop.checkboxLabel || '启用'}</span>
                </label>`;
        break;

      case 'select':
        input = `<select data-property="${prop.name}" class="property-select">
                  ${prop.options.map(opt => 
                    `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>
                      ${opt.label}
                    </option>`
                  ).join('')}
                </select>`;
        break;

      case 'color':
        input = `<input type="color" 
                        data-property="${prop.name}" 
                        value="${value || '#000000'}"
                        class="property-color">`;
        break;

      case 'fontSize':
        // 使用字号选择器
        input = `<div data-property="${prop.name}" class="font-size-selector-wrapper"></div>`;
        break;

      case 'variable':
        // 使用变量选择器
        input = `<div data-property="${prop.name}" class="variable-selector-wrapper"></div>`;
        break;

      case 'columns-editor':
        input = `<button type="button" 
                         data-action="edit-columns" 
                         data-property="${prop.name}"
                         class="btn-edit-columns">
                  📊 配置表格列
                </button>`;
        break;

      case 'textarea':
        // 如果是自定义文本区块的text字段，且允许数据绑定，添加变量选择器按钮
        const showVariableBtn = this.currentBlock?.type === 'custom-text' && 
                               prop.name === 'text' && 
                               this.getNestedValue(this.currentBlock.config, 'allowDataBinding');
        input = `
          <div style="position: relative;">
            <textarea data-property="${prop.name}" 
                      class="property-textarea"
                      rows="${prop.rows || 3}"
                      placeholder="${prop.placeholder || ''}"
                      id="textarea-${prop.name.replace(/\./g, '-')}">${this.escapeHtml(value || '')}</textarea>
            ${showVariableBtn ? `
              <button type="button" 
                      class="btn-insert-variable" 
                      data-textarea-id="textarea-${prop.name.replace(/\./g, '-')}"
                      title="插入变量">
                📋 插入变量
              </button>
            ` : ''}
          </div>
        `;
        break;

      default:
        input = `<input type="text" 
                        data-property="${prop.name}" 
                        value="${this.escapeHtml(value || '')}" 
                        class="property-input">`;
    }

    return `
      <div class="property-field">
        <label class="property-label">
          ${prop.label}
          ${prop.required ? '<span style="color: #ff4d4f;">*</span>' : ''}
        </label>
        ${input}
        ${prop.description ? `<div class="property-hint">${prop.description}</div>` : ''}
      </div>
    `;
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // 绑定删除按钮
    const btnDelete = container.querySelector('#btnDeleteBlock');
    if (btnDelete && this.currentBlock) {
      btnDelete.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('确定要删除这个区块吗？')) {
          if (this.options.onBlockDelete) {
            this.options.onBlockDelete(this.currentBlock.id);
          }
        }
      });
    }

    // 绑定上移按钮
    const btnMoveUp = container.querySelector('#btnMoveUp');
    if (btnMoveUp && this.currentBlock) {
      btnMoveUp.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const template = this.options.template;
        const blockIndex = template?.blocks?.findIndex(b => b.id === this.currentBlock.id) ?? -1;
        if (blockIndex > 0 && this.options.onBlockMove) {
          const prevBlock = template.blocks[blockIndex - 1];
          this.options.onBlockMove(this.currentBlock.id, prevBlock.id);
        }
      });
    }

    // 绑定下移按钮
    const btnMoveDown = container.querySelector('#btnMoveDown');
    if (btnMoveDown && this.currentBlock) {
      btnMoveDown.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const template = this.options.template;
        const blockIndex = template?.blocks?.findIndex(b => b.id === this.currentBlock.id) ?? -1;
        if (blockIndex >= 0 && blockIndex < (template?.blocks?.length ?? 0) - 1 && this.options.onBlockMove) {
          const nextBlock = template.blocks[blockIndex + 1];
          this.options.onBlockMove(this.currentBlock.id, nextBlock.id);
        }
      });
    }

    // 普通输入框变更
    container.querySelectorAll('[data-property]').forEach(input => {
      if (input.dataset.action === 'edit-columns') {
        input.addEventListener('click', () => {
          this.openColumnsEditor(input.dataset.property);
        });
      } else if (input.type === 'checkbox') {
        input.addEventListener('change', (e) => {
          this.handlePropertyChange(input.dataset.property, e.target.checked);
        });
      } else if (input.tagName === 'SELECT' || input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
        input.addEventListener('change', (e) => {
          this.handlePropertyChange(input.dataset.property, e.target.value);
        });
      }
    });

    // 初始化字号选择器
    container.querySelectorAll('.font-size-selector-wrapper').forEach(wrapper => {
      const propName = wrapper.dataset.property;
      const value = this.getNestedValue(this.currentBlock.config, propName);
      
      const fontSizeSelector = new FontSizeSelector(wrapper, {
        value: value,
        onChange: (newValue) => {
          this.handlePropertyChange(propName, newValue);
        }
      });
      fontSizeSelector.render();
    });

    // 初始化变量选择器
    container.querySelectorAll('.variable-selector-wrapper').forEach(wrapper => {
      const propName = wrapper.dataset.property;
      const value = this.getNestedValue(this.currentBlock.config, propName);
      
      const variableSelector = new VariableSelector(wrapper, {
        value: value,
        onChange: (newValue) => {
          this.handlePropertyChange(propName, newValue);
        }
      });
      variableSelector.render();
    });

    // 绑定插入变量按钮
    container.querySelectorAll('.btn-insert-variable').forEach(btn => {
      btn.addEventListener('click', () => {
        const textareaId = btn.dataset.textareaId;
        const textarea = container.querySelector(`#${textareaId}`);
        if (textarea) {
          this.openVariableSelectorForTextarea(textarea);
        }
      });
    });
  }

  /**
   * 为文本域打开变量选择器
   */
  openVariableSelectorForTextarea(textarea) {
    // 创建变量选择器弹窗
    const modal = document.createElement('div');
    modal.className = 'variable-selector-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: #fff;
      border-radius: 8px;
      padding: 20px;
      max-width: 500px;
      max-height: 600px;
      overflow: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;

    // 创建变量选择器
    const variableSelector = new VariableSelector(panel, {
      value: '',
      onChange: (variable) => {
        // 插入变量到文本域
        const cursorPos = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, cursorPos);
        const textAfter = textarea.value.substring(textarea.selectionEnd);
        const variableText = variable.startsWith('{{') ? variable : `{{${variable}}}`;
        textarea.value = textBefore + variableText + textAfter;
        textarea.focus();
        textarea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
        
        // 触发change事件
        textarea.dispatchEvent(new Event('change'));
        
        // 关闭弹窗
        modal.remove();
      }
    });
    variableSelector.render();

    // 添加关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.cssText = `
      margin-top: 15px;
      padding: 8px 16px;
      background: #1890ff;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      width: 100%;
    `;
    closeBtn.addEventListener('click', () => modal.remove());
    panel.appendChild(closeBtn);

    modal.appendChild(panel);
    document.body.appendChild(modal);

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  /**
   * 处理属性变更
   */
  handlePropertyChange(propName, value) {
    if (!this.currentBlock || !this.options.onPropertyChange) return;

    // 转换值类型
    const prop = this.getPropertyDefinition(propName);
    if (prop) {
      if (prop.type === 'number') {
        value = parseFloat(value) || 0;
      } else if (prop.type === 'boolean') {
        value = Boolean(value);
      }
    }

    this.options.onPropertyChange(this.currentBlock.id, propName, value);
  }

  /**
   * 获取属性定义
   */
  getPropertyDefinition(propName) {
    if (!this.currentBlock) return null;
    
    const BlockClass = BlockRegistry.get(this.currentBlock.type);
    const properties = BlockClass?.getPropertyDefinitions() || [];
    return properties.find(p => p.name === propName);
  }

  /**
   * 打开列编辑器
   */
  openColumnsEditor(propName) {
    // TODO: 实现列编辑器弹窗
    alert('列编辑器功能待实现');
  }

  /**
   * 获取嵌套值
   */
  getNestedValue(obj, path) {
    if (!path) return undefined;
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }


  /**
   * 渲染页边距设置
   */
  renderMarginSettings(container) {
    // 获取当前模板的页边距设置和全局样式
    const template = this.options.template || null;
    const pageSettings = template?.pageSettings || { margin: { top: 15, bottom: 15, left: 15, right: 15 } };
    const margin = pageSettings.margin || { top: 15, bottom: 15, left: 15, right: 15 };
    const globalStyles = template?.globalStyles || { 
      fontFamily: 'Arial, "Microsoft YaHei", sans-serif', 
      fontSize: 12,  // 与 BlockRenderer 默认值一致
      lineHeight: 1.4,
      color: '#000'
    };

    container.innerHTML = `
      <div class="property-panel-content">
        <div class="property-header" style="display: flex; justify-content: space-between; align-items: center;">
          <h4 style="margin: 0; font-size: 14px; font-weight: 600;">📐 页面设置</h4>
          <button id="closeMarginSettings" class="close-btn" title="关闭" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #6b7280; padding: 4px 8px; border-radius: 4px; transition: all 0.2s;">
            ✕
          </button>
        </div>
        <div class="property-form">
          <!-- 页边距设置 -->
          <div class="property-field" style="margin-bottom: 24px;">
            <label class="property-label" style="font-size: 13px; font-weight: 600; margin-bottom: 12px; display: block;">页边距设置 (mm)</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500;">上边距</label>
                <input type="number" 
                       id="marginTop" 
                       class="property-input" 
                       value="${margin.top || 15}" 
                       min="0" 
                       max="100" 
                       step="1">
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500;">下边距</label>
                <input type="number" 
                       id="marginBottom" 
                       class="property-input" 
                       value="${margin.bottom || 15}" 
                       min="0" 
                       max="100" 
                       step="1">
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500;">左边距</label>
                <input type="number" 
                       id="marginLeft" 
                       class="property-input" 
                       value="${margin.left || 15}" 
                       min="0" 
                       max="100" 
                       step="1">
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500;">右边距</label>
                <input type="number" 
                       id="marginRight" 
                       class="property-input" 
                       value="${margin.right || 15}" 
                       min="0" 
                       max="100" 
                       step="1">
              </div>
            </div>
          </div>

          <!-- 全局样式设置 -->
          <div class="property-field" style="margin-bottom: 24px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
            <label class="property-label" style="font-size: 13px; font-weight: 600; margin-bottom: 12px; display: block;">全局样式设置</label>
            
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500;">字体</label>
              <select id="globalFontFamily" class="property-input" style="width: 100%;">
                <option value="Arial, &quot;Microsoft YaHei&quot;, sans-serif" ${globalStyles.fontFamily === 'Arial, "Microsoft YaHei", sans-serif' ? 'selected' : ''}>Arial, Microsoft YaHei</option>
                <option value="&quot;Times New Roman&quot;, Times, serif" ${globalStyles.fontFamily === '"Times New Roman", Times, serif' ? 'selected' : ''}>Times New Roman</option>
                <option value="&quot;Courier New&quot;, Courier, monospace" ${globalStyles.fontFamily === '"Courier New", Courier, monospace' ? 'selected' : ''}>Courier New</option>
                <option value="Georgia, serif" ${globalStyles.fontFamily === 'Georgia, serif' ? 'selected' : ''}>Georgia</option>
                <option value="Verdana, sans-serif" ${globalStyles.fontFamily === 'Verdana, sans-serif' ? 'selected' : ''}>Verdana</option>
              </select>
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500;">字号 (px)</label>
              <input type="number" 
                     id="globalFontSize" 
                     class="property-input" 
                     value="${globalStyles.fontSize || 12}" 
                     min="8" 
                     max="72" 
                     step="1">
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500;">行高</label>
              <input type="number" 
                     id="globalLineHeight" 
                     class="property-input" 
                     value="${globalStyles.lineHeight || 1.4}" 
                     min="1" 
                     max="3" 
                     step="0.1">
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500;">文字颜色</label>
              <input type="color" 
                     id="globalColor" 
                     class="property-input" 
                     value="${globalStyles.color || '#000000'}" 
                     style="width: 100%; height: 36px; padding: 2px;">
            </div>
          </div>

          <button id="applyMarginBtn" 
                  class="property-btn-primary" 
                  style="width: 100%; padding: 10px 16px; background: #3b82f6; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; margin-top: 8px; transition: all 0.2s;">
            应用设置
          </button>
          <div class="property-hint" style="margin-top: 12px; font-size: 12px; color: #9ca3af; line-height: 1.5;">
            💡 提示：页面设置将应用到整个模板页面，影响所有区块的显示效果
          </div>
        </div>
      </div>
    `;

    // 绑定页边距设置事件
    this.bindMarginSettingsEvents(container);
  }

  /**
   * 绑定页边距设置事件
   */
  bindMarginSettingsEvents(container) {
    // 关闭按钮
    const closeBtn = container.querySelector('#closeMarginSettings');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.showMarginSettings = false;
        if (this.options.onCloseMarginSettings) {
          this.options.onCloseMarginSettings();
        }
        this.render();
      });
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = '#f3f4f6';
        closeBtn.style.color = '#111827';
      });
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'none';
        closeBtn.style.color = '#6b7280';
      });
    }

    // 应用按钮
    const applyBtn = container.querySelector('#applyMarginBtn');
    if (applyBtn) {
      applyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 获取页边距设置
        const marginTop = parseFloat(container.querySelector('#marginTop')?.value || '15');
        const marginBottom = parseFloat(container.querySelector('#marginBottom')?.value || '15');
        const marginLeft = parseFloat(container.querySelector('#marginLeft')?.value || '15');
        const marginRight = parseFloat(container.querySelector('#marginRight')?.value || '15');

        const margin = { top: marginTop, bottom: marginBottom, left: marginLeft, right: marginRight };

        // 获取全局样式设置
        const fontFamily = container.querySelector('#globalFontFamily')?.value || 'Arial, "Microsoft YaHei", sans-serif';
        const fontSize = parseFloat(container.querySelector('#globalFontSize')?.value || '12');
        const lineHeight = parseFloat(container.querySelector('#globalLineHeight')?.value || '1.4');
        const color = container.querySelector('#globalColor')?.value || '#000000';

        const globalStyles = {
          fontFamily: fontFamily,
          fontSize: fontSize,
          lineHeight: lineHeight,
          color: color
        };

        // 确保页边距设置窗口保持显示状态
        this.showMarginSettings = true;

        // 通知编辑器更新页边距和全局样式
        if (this.options.onPageSettingsChange) {
          this.options.onPageSettingsChange({ 
            margin,
            globalStyles 
          });
        }

        // 显示成功提示
        if (window.NotificationSystem) {
          window.NotificationSystem.toast('页面设置已应用', 'success');
        }

        // 确保页边距设置窗口保持显示，重新渲染以更新显示的值
        // 使用 setTimeout 确保在 updatePageSettings 完成后再渲染
        setTimeout(() => {
          // 再次确保显示状态
          this.showMarginSettings = true;
          this.render();
        }, 10);
      });
      applyBtn.addEventListener('mouseenter', () => {
        applyBtn.style.background = '#2563eb';
        applyBtn.style.transform = 'translateY(-1px)';
        applyBtn.style.boxShadow = '0 2px 4px rgba(59, 130, 246, 0.2)';
      });
      applyBtn.addEventListener('mouseleave', () => {
        applyBtn.style.background = '#3b82f6';
        applyBtn.style.transform = 'translateY(0)';
        applyBtn.style.boxShadow = 'none';
      });
    }

    // 实时更新（可选）：输入时实时预览
    ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'].forEach(id => {
      const input = container.querySelector(`#${id}`);
      if (input) {
        let timeout;
        input.addEventListener('input', () => {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            const marginTop = parseFloat(container.querySelector('#marginTop')?.value || '15');
            const marginBottom = parseFloat(container.querySelector('#marginBottom')?.value || '15');
            const marginLeft = parseFloat(container.querySelector('#marginLeft')?.value || '15');
            const marginRight = parseFloat(container.querySelector('#marginRight')?.value || '15');

            const margin = { top: marginTop, bottom: marginBottom, left: marginLeft, right: marginRight };

            // 实时更新画布（不保存）
            if (this.options.onPageSettingsPreview) {
              this.options.onPageSettingsPreview({ margin });
            }
          }, 300);
        });
      }
    });
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

