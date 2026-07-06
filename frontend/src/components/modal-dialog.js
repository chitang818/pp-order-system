/**
 * 统一弹窗模块 - ModalDialog
 * 提供美观、好用、响应迅速的弹窗功能
 * 支持确认对话框、输入对话框、自定义内容对话框、加载对话框等
 * 
 * 背景样式统一管理：
 * - 所有弹窗的背景模糊和变暗效果统一使用 CSS 变量管理
 * - CSS 变量定义在 frontend/css/modal-dialog.css 的 :root 中：
 *   - --modal-overlay-bg-opacity: 背景变暗透明度 (0-1)
 *   - --modal-overlay-blur: 背景模糊强度 (px)
 *   - --modal-overlay-bg-color: 背景变暗颜色
 * - 修改这些变量即可统一调整所有弹窗的背景效果
 */

export class ModalDialog {
  constructor() {
    this.modalContainer = null;
    this.activeModals = new Map(); // 管理活动弹窗
    this.modalStack = []; // 弹窗栈
    this.disableBackdropFilter = false;
    try {
      const ua = navigator.userAgent || '';
      const is360 = /360SE|360EE|QIHU|360Browser/i.test(ua);
      const isWin = /Windows/i.test(ua);
      this.disableBackdropFilter = !!(is360 && isWin);
    } catch (_) {}
    this.init();
  }

  init() {
    // 延迟初始化，确保DOM已准备好
    const initContainer = () => {
      if (!document.body) {
        // 如果body还不存在，继续等待
        requestAnimationFrame(initContainer);
        return;
      }

      // 检查是否已存在modalContainer
      this.modalContainer = document.getElementById('modalContainer');
      if (!this.modalContainer) {
        this.modalContainer = document.createElement('div');
        this.modalContainer.id = 'modalContainer';
        this.modalContainer.className = 'modal-container';
        document.body.appendChild(this.modalContainer);
      }
      
      // 通知NotificationSystem弹窗容器已创建（用于Toast暂停功能）
      if (window.NotificationSystem && window.NotificationSystem.setupModalWatcher) {
        window.NotificationSystem.setupModalWatcher();
      }
    };

    // 立即尝试初始化，如果失败则延迟
    if (document.body) {
      initContainer();
    } else {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initContainer);
      } else {
        requestAnimationFrame(initContainer);
      }
    }
  }

  /**
   * 显示确认对话框
   * @param {string} message - 确认消息
   * @param {object} options - 选项
   * @returns {Promise<boolean>} - 用户选择结果
   */
  static async confirm(message, options = {}) {
    const instance = ModalDialog.getInstance();
    return instance._confirm(message, options);
  }

  /**
   * 显示提示对话框（只有一个“确定”按钮）
   * @param {string} message - 提示消息
   * @param {object} options - 选项
   * @returns {Promise<boolean>} - 用户确认结果（始终为 true）
   */
  static async alert(message, options = {}) {
    const instance = ModalDialog.getInstance();
    return instance._alert(message, options);
  }

  /**
   * 显示输入对话框
   * @param {string} message - 提示消息
   * @param {object} options - 选项
   * @returns {Promise<string|null>} - 用户输入结果
   */
  static async prompt(message, options = {}) {
    const instance = ModalDialog.getInstance();
    return instance._prompt(message, options);
  }

  /**
   * 显示自定义内容对话框
   * @param {string|HTMLElement} content - 自定义内容（HTML字符串或DOM元素）
   * @param {object} options - 选项
   * @returns {Promise<any>} - 返回结果
   */
  static async custom(content, options = {}) {
    const instance = ModalDialog.getInstance();
    return instance._custom(content, options);
  }

  /**
   * 显示加载对话框
   * @param {string} message - 加载消息
   * @param {object} options - 选项
   * @returns {object} - 包含close方法的对象
   */
  static loading(message = '加载中...', options = {}) {
    const instance = ModalDialog.getInstance();
    return instance._loading(message, options);
  }

  /**
   * 获取单例实例
   */
  static getInstance() {
    if (!ModalDialog.instance) {
      ModalDialog.instance = new ModalDialog();
    }
    return ModalDialog.instance;
  }

  /**
   * 内部确认对话框实现
   */
  _confirm(message, options = {}) {
    return new Promise((resolve) => {
      // 防止重复弹窗：如果 preventDuplicate 为 true，并且已经有弹窗打开，则阻止创建新弹窗
      if (options.preventDuplicate === true) {
        // 检查是否已经有弹窗打开（通过DOM检查，更可靠）
        if (this.modalContainer) {
          const existingModals = this.modalContainer.querySelectorAll('.modal-dialog-overlay');
          if (existingModals.length > 0) {
            console.warn('[ModalDialog] 检测到重复弹窗触发（preventDuplicate=true），忽略本次调用');
            // 直接返回，不创建新弹窗
            resolve(false);
            return;
          }
        }
      }
      
      const modalId = `modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let resolved = false;
      
      const modal = this.createModal(modalId, {
        title: options.title || '确认操作',
        body: this.createConfirmBody(message, options.icon || '⚠️'),
        footer: this.createConfirmFooter(options),
        closable: options.closable !== false,
        clickOutsideToClose: options.clickOutsideToClose !== false,
        onClose: () => {
          if (!resolved) {
            resolved = true;
            this.closeModal(modalId);
            resolve(false);
          }
        },
        onConfirm: () => {
          if (!resolved) {
            resolved = true;
            this.closeModal(modalId);
            resolve(true);
          }
        }
      });

      this.showModal(modalId, modal);
    });
  }

  /**
   * 内部提示对话框实现（单按钮）
   */
  _alert(message, options = {}) {
    return new Promise((resolve) => {
      // 防止重复弹窗：如果 preventDuplicate 为 true，并且已经有弹窗打开，则阻止创建新弹窗
      if (options.preventDuplicate === true) {
        if (this.modalContainer) {
          const existingModals = this.modalContainer.querySelectorAll('.modal-dialog-overlay');
          const activeModals = Array.from(existingModals).filter(modal => modal.classList.contains('show'));
          if (activeModals.length > 0) {
            console.warn('[ModalDialog] 检测到重复弹窗触发（preventDuplicate=true），忽略本次调用');
            resolve(true);
            return;
          }
        }
      }

      const modalId = `modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let resolved = false;

      const modal = this.createModal(modalId, {
        title: options.title || '提示',
        body: this.createConfirmBody(message, options.icon || 'ℹ️'),
        footer: this.createAlertFooter(options),
        closable: options.closable !== false,
        // alert 默认不建议点击遮罩关闭，避免用户误触（可通过 options 覆盖）
        clickOutsideToClose: options.clickOutsideToClose === true,
        onClose: () => {
          if (!resolved) {
            resolved = true;
            this.closeModal(modalId);
            resolve(true);
          }
        },
        onConfirm: () => {
          if (!resolved) {
            resolved = true;
            this.closeModal(modalId);
            resolve(true);
          }
        }
      });

      this.showModal(modalId, modal);
    });
  }

  /**
   * 内部输入对话框实现
   */
  _prompt(message, options = {}) {
    return new Promise((resolve) => {
      const modalId = `modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const inputId = `input_${modalId}`;
      let resolved = false;
      
      const modal = this.createModal(modalId, {
        title: options.title || '输入信息',
        body: this.createPromptBody(message, inputId, options),
        footer: this.createPromptFooter(options),
        closable: options.closable !== false,
        clickOutsideToClose: options.clickOutsideToClose !== false,
        onClose: () => {
          if (!resolved) {
            resolved = true;
            this.closeModal(modalId);
            resolve(null);
          }
        },
        onConfirm: () => {
          if (resolved) return;
          
          const input = document.getElementById(inputId);
          const value = input ? input.value.trim() : '';
          
          if (options.required && !value) {
            // 验证失败，不关闭弹窗
            if (window.NotificationSystem) {
              window.NotificationSystem.toast('请输入必要信息', 'warning');
            }
            if (input) input.focus();
            return;
          }
          
          resolved = true;
          this.closeModal(modalId);
          resolve(value);
        }
      });

      this.showModal(modalId, modal);

      // 聚焦到输入框并绑定回车键
      setTimeout(() => {
        const input = document.getElementById(inputId);
        if (input) {
          input.focus();
          input.select();
          
          // 回车键确认
          const handleEnter = (e) => {
            if (e.key === 'Enter' && !resolved) {
              e.preventDefault();
              const value = input.value.trim();
              if (options.required && !value) {
                if (window.NotificationSystem) {
                  window.NotificationSystem.toast('请输入必要信息', 'warning');
                }
                input.focus();
                return;
              }
              resolved = true;
              this.closeModal(modalId);
              resolve(value);
              input.removeEventListener('keydown', handleEnter);
            }
          };
          input.addEventListener('keydown', handleEnter);
        }
      }, 100);
    });
  }

  /**
   * 内部自定义内容对话框实现
   */
  _custom(content, options = {}) {
    return new Promise((resolve) => {
      // 防止重复弹窗：如果 preventDuplicate 为 true，并且已经有弹窗打开，则阻止创建新弹窗
      if (options.preventDuplicate === true) {
        // 检查是否已经有弹窗打开（通过DOM检查，更可靠）
        if (this.modalContainer) {
          const existingModals = this.modalContainer.querySelectorAll('.modal-dialog-overlay');
          // 过滤掉正在关闭的弹窗（没有 show 类的弹窗）
          const activeModals = Array.from(existingModals).filter(modal => {
            return modal.classList.contains('show');
          });
          if (activeModals.length > 0) {
            console.warn('[ModalDialog] 检测到重复弹窗触发（preventDuplicate=true），忽略本次调用');
            // 直接返回，不创建新弹窗
            if (options.onClose) {
              resolve(options.onClose());
            } else {
              resolve(null);
            }
            return;
          }
        }
      }
      
      const modalId = `modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 处理内容：支持字符串和DOM元素
      let bodyContent = '';
      if (typeof content === 'string') {
        bodyContent = content;
      } else if (content instanceof HTMLElement) {
        bodyContent = content.outerHTML;
      } else {
        bodyContent = String(content);
      }

      const modal = this.createModal(modalId, {
        title: options.title || '',
        body: bodyContent,
        footer: options.footer || this.createDefaultFooter(options),
        closable: options.closable !== false,
        clickOutsideToClose: options.clickOutsideToClose !== false,
        size: options.size || 'medium', // small, medium, large, fullscreen
        onClose: () => {
          this.closeModal(modalId);
          resolve(options.onClose ? options.onClose() : null);
        },
        onConfirm: options.onConfirm ? async () => {
          try {
            const result = await Promise.resolve(options.onConfirm());
            if (result !== false) { // 返回false时不关闭
              this.closeModal(modalId);
              resolve(result);
            }
          } catch (error) {
            console.error('[ModalDialog] onConfirm执行错误:', error);
            // 出错时不关闭弹窗，让用户处理错误
            // 如果onConfirm抛出错误，通常意味着需要用户修复输入
          }
        } : null
      });

      this.showModal(modalId, modal);
    });
  }

  /**
   * 内部加载对话框实现
   */
  _loading(message, options = {}) {
    const modalId = `modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const modal = this.createModal(modalId, {
      title: '',
      body: this.createLoadingBody(message),
      footer: '',
      closable: false,
      clickOutsideToClose: false,
      showHeader: false,
      showFooter: false
    });

    this.showModal(modalId, modal);

    return {
      close: () => {
        this.closeModal(modalId);
      },
      updateMessage: (newMessage) => {
        const messageEl = document.querySelector(`#${modalId} .loading-message`);
        if (messageEl) {
          messageEl.textContent = newMessage;
        }
      }
    };
  }

  /**
   * 创建模态框DOM
   */
  createModal(modalId, options = {}) {
    const modal = document.createElement('div');
    modal.id = modalId;
    // 只使用 modal-dialog-overlay 类，避免与 notification.css 中的 modal-overlay 冲突
    modal.className = 'modal-dialog-overlay';
    if (this.disableBackdropFilter) {
      modal.className += ' no-backdrop-filter';
    }
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (options.title) {
      modal.setAttribute('aria-labelledby', `${modalId}_title`);
    }

    const sizeClass = options.size ? `modal-dialog-${options.size}` : '';
    const modalDialog = document.createElement('div');
    modalDialog.className = `modal-dialog ${sizeClass}`;
    
    // 支持自定义宽度
    if (options.width) {
      modalDialog.style.maxWidth = options.width;
      modalDialog.style.width = '95%'; // 确保在小屏幕下不会超过屏幕宽度
    }

    // 头部
    if (options.showHeader !== false && options.title) {
      const header = document.createElement('div');
      header.className = 'modal-header';
      header.innerHTML = `
        <h4 class="modal-title" id="${modalId}_title">${this.escapeHtml(options.title)}</h4>
        ${options.closable !== false ? `<button class="modal-close" type="button" aria-label="关闭">&times;</button>` : ''}
      `;
      modalDialog.appendChild(header);
    }

    // 主体
    const body = document.createElement('div');
    body.className = 'modal-body';
    if (typeof options.body === 'string') {
      body.innerHTML = options.body;
    } else if (options.body instanceof HTMLElement) {
      body.appendChild(options.body);
    }
    modalDialog.appendChild(body);

    // 底部
    if (options.showFooter !== false && options.footer) {
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      if (typeof options.footer === 'string') {
        footer.innerHTML = options.footer;
      } else if (options.footer instanceof HTMLElement) {
        footer.appendChild(options.footer);
      }
      modalDialog.appendChild(footer);
    }

    modal.appendChild(modalDialog);

    // 绑定事件
    this.bindModalEvents(modalId, modal, options);

    return modal;
  }

  /**
   * 绑定模态框事件
   */
  bindModalEvents(modalId, modal, options) {
    const modalData = {
      modal,
      options,
      isClosing: false
    };
    this.activeModals.set(modalId, modalData);
    this.modalStack.push(modalId);

    // 关闭按钮
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      const closeHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[ModalDialog] 关闭按钮被点击', { isClosing: modalData.isClosing });
        if (!modalData.isClosing) {
          // 注意：不要在这里设置 isClosing = true
          // 因为 onClose 回调会调用 closeModal，而 closeModal 会设置 isClosing
          // 如果提前设置，closeModal 会检查到 isClosing 为 true 而直接返回
          if (options.onClose) {
            try {
              options.onClose();
            } catch (err) {
              console.error('[ModalDialog] onClose执行错误:', err);
              // 如果 onClose 出错，确保弹窗仍然关闭
              this.closeModal(modalId);
            }
          } else {
            this.closeModal(modalId);
          }
        }
      };
      closeBtn.addEventListener('click', closeHandler, { capture: true });
      // 备用：直接绑定 onclick（优先级更高）
      closeBtn.onclick = closeHandler;
      console.log('[ModalDialog] 关闭按钮事件已绑定');
    }

    // 确认按钮
    const confirmBtn = modal.querySelector('[data-action="confirm"]');
    if (confirmBtn && options.onConfirm) {
      const confirmHandler = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[ModalDialog] 确认按钮被点击', { isClosing: modalData.isClosing, modalId });
        if (!modalData.isClosing) {
          // 直接调用 onConfirm，它已经是包装函数（在_custom中创建的）
          // 包装函数会处理关闭弹窗和resolve Promise
          try {
            await Promise.resolve(options.onConfirm());
          } catch (err) {
            console.error('[ModalDialog] onConfirm执行错误:', err);
            // 错误已在包装函数中处理，这里不需要额外处理
          }
        }
      };
      // 使用多种方式绑定，确保能捕获到事件
      confirmBtn.addEventListener('click', confirmHandler, { capture: true });
      // 备用：直接绑定 onclick（优先级更高）
      confirmBtn.onclick = confirmHandler;
      console.log('[ModalDialog] 确认按钮事件已绑定', { hasConfirmBtn: !!confirmBtn, hasOnConfirm: !!options.onConfirm, modalId });
    }
    // 注意：如果没有确认按钮或 onConfirm，这是正常的（比如预览窗口、loading 弹窗），不需要警告

    // 取消按钮
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      const cancelHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[ModalDialog] 取消按钮被点击', { isClosing: modalData.isClosing });
        if (!modalData.isClosing) {
          // 注意：不要在这里设置 isClosing = true
          // 因为 onClose 回调会调用 closeModal，而 closeModal 会设置 isClosing
          // 如果提前设置，closeModal 会检查到 isClosing 为 true 而直接返回
          if (options.onClose) {
            try {
              // 调用 onClose 回调，它会处理关闭弹窗的逻辑
              // 注意：在 _custom 方法中，onClose 回调已经包含了 closeModal 调用
              options.onClose();
            } catch (err) {
              console.error('[ModalDialog] onClose执行错误:', err);
              // 如果 onClose 出错，确保弹窗仍然关闭
              this.closeModal(modalId);
            }
          } else {
            // 如果没有 onClose 回调，直接关闭弹窗
            this.closeModal(modalId);
          }
        }
      };
      // 使用多种方式绑定，确保能捕获到事件
      cancelBtn.addEventListener('click', cancelHandler, { capture: true });
      // 备用：直接绑定 onclick（优先级更高）
      cancelBtn.onclick = cancelHandler;
      console.log('[ModalDialog] 取消按钮事件已绑定', { hasCancelBtn: !!cancelBtn });
    }
    // 注意：如果没有取消按钮，这是正常的（比如 loading 弹窗），不需要警告

    // 点击背景关闭
    if (options.clickOutsideToClose !== false) {
      const backgroundHandler = (e) => {
        if (e.target === modal && !modalData.isClosing) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[ModalDialog] 背景被点击，关闭弹窗');
          // 注意：不要在这里设置 isClosing = true
          // 因为 onClose 回调会调用 closeModal，而 closeModal 会设置 isClosing
          // 如果提前设置，closeModal 会检查到 isClosing 为 true 而直接返回
          if (options.onClose) {
            try {
              options.onClose();
            } catch (err) {
              console.error('[ModalDialog] onClose执行错误:', err);
              // 如果 onClose 出错，确保弹窗仍然关闭
              this.closeModal(modalId);
            }
          } else {
            this.closeModal(modalId);
          }
        }
      };
      modal.addEventListener('click', backgroundHandler);
    }
    
    // 阻止 modal-dialog 的点击事件冒泡
    const modalDialog = modal.querySelector('.modal-dialog');
    if (modalDialog) {
      modalDialog.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // ESC键关闭
    const handleKeydown = (e) => {
      // 只处理最顶层的弹窗
      if (this.modalStack[this.modalStack.length - 1] !== modalId) {
        return;
      }

      if (e.key === 'Escape' && options.closable !== false && !modalData.isClosing) {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener('keydown', handleKeydown);
        if (options.onClose) {
          options.onClose();
        } else {
          this.closeModal(modalId);
        }
      } else if (e.key === 'Enter' && confirmBtn && !modalData.isClosing && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        // Enter键确认（仅在确认对话框时，且不在输入框中）
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener('keydown', handleKeydown);
        if (options.onConfirm) {
          options.onConfirm();
        }
      }
    };
    document.addEventListener('keydown', handleKeydown);

    // 保存事件处理器，以便清理
    modalData.keydownHandler = handleKeydown;

    // 阻止body滚动
    document.body.style.overflow = 'hidden';
  }

  /**
   * 显示模态框
   */
  showModal(modalId, modal) {
    // 注意：不再在这里检查重复弹窗或输出警告，因为：
    // 1. preventDuplicate 检查已经在 _custom、_confirm 等方法中处理
    // 2. 这里检查会导致合法的多层弹窗场景（如 loading -> custom）被误报
    // 3. 关闭动画期间的弹窗（没有 show 类）不应该被计算在内
    // 4. 如果没有设置 preventDuplicate，允许多层弹窗是正常的
    
    this.modalContainer.appendChild(modal);

    // 触发动画
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.classList.add('show');
      });
    });
  }

  /**
   * 关闭模态框
   */
  closeModal(modalId) {
    const modalData = this.activeModals.get(modalId);
    if (!modalData || modalData.isClosing) {
      return;
    }

    modalData.isClosing = true;

    // 移除ESC键事件监听
    if (modalData.keydownHandler) {
      document.removeEventListener('keydown', modalData.keydownHandler);
    }

    // 移除show类，触发关闭动画
    modalData.modal.classList.remove('show');

    // 等待动画完成后移除DOM
    setTimeout(() => {
      if (modalData.modal && modalData.modal.parentNode) {
        modalData.modal.parentNode.removeChild(modalData.modal);
      }
      this.activeModals.delete(modalId);
      
      // 从栈中移除
      const index = this.modalStack.indexOf(modalId);
      if (index > -1) {
        this.modalStack.splice(index, 1);
      }

      // 如果所有弹窗都关闭了，恢复body滚动
      if (this.activeModals.size === 0) {
        document.body.style.overflow = '';
      }
    }, 200); // 动画时间
  }

  /**
   * 创建确认对话框主体
   */
  createConfirmBody(message, icon) {
    return `
      <div class="confirm-dialog-body">
        <div class="confirm-icon">${icon}</div>
        <div class="confirm-message">${this.escapeHtml(message)}</div>
      </div>
    `;
  }

  /**
   * 创建确认对话框底部
   */
  createConfirmFooter(options) {
    return `
      <button class="btn btn-secondary" data-action="cancel" type="button">
        ${options.cancelText || '取消'}
      </button>
      <button class="btn btn-primary" data-action="confirm" type="button">
        ${options.confirmText || '确定'}
      </button>
    `;
  }

  /**
   * 创建提示对话框底部（单按钮）
   */
  createAlertFooter(options) {
    return `
      <button class="btn btn-primary" data-action="confirm" type="button">
        ${options.confirmText || '确定'}
      </button>
    `;
  }

  /**
   * 创建输入对话框主体
   */
  createPromptBody(message, inputId, options) {
    return `
      <div class="prompt-dialog-body">
        <div class="prompt-message">${this.escapeHtml(message)}</div>
        <input 
          type="${options.type || 'text'}" 
          id="${inputId}"
          class="prompt-input" 
          placeholder="${options.placeholder || ''}"
          value="${options.defaultValue || ''}"
          ${options.required ? 'required' : ''}
          autocomplete="${options.autocomplete || 'off'}"
        />
      </div>
    `;
  }

  /**
   * 创建输入对话框底部
   */
  createPromptFooter(options) {
    return `
      <button class="btn btn-secondary" data-action="cancel" type="button">
        ${options.cancelText || '取消'}
      </button>
      <button class="btn btn-primary" data-action="confirm" type="button">
        ${options.confirmText || '确定'}
      </button>
    `;
  }

  /**
   * 创建默认底部
   */
  createDefaultFooter(options) {
    if (options.footer === false) {
      return '';
    }
    return `
      <button class="btn btn-secondary" data-action="cancel" type="button">
        ${options.cancelText || '关闭'}
      </button>
    `;
  }

  /**
   * 创建加载对话框主体
   */
  createLoadingBody(message) {
    return `
      <div class="loading-dialog-body">
        <div class="loading-spinner"></div>
        <div class="loading-message">${this.escapeHtml(message)}</div>
      </div>
    `;
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

// 创建单例实例
ModalDialog.instance = null;

// 导出单例实例
const modalDialogInstance = ModalDialog.getInstance();

// 导出到全局命名空间（保持向后兼容）
if (typeof window !== 'undefined') {
  window.ModalDialog = ModalDialog;
  window.ModalDialogInstance = modalDialogInstance;
}

// 默认导出
export default modalDialogInstance;

