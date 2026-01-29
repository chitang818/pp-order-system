/**
 * 统一通知系统 - 替换原生alert，提供更好的用户体验
 * ES6 模块化版本
 * 支持Toast提示
 * 注意：弹窗功能已迁移到 ModalDialog 模块
 */

export class NotificationSystem {
  constructor() {
    this.toastContainer = null;
    // Toast消失时间配置（毫秒）
    this.toastDurations = {
      success: 2000,  // 成功提示：2秒
      error: 3000,    // 错误提示：3秒
      warning: 2500,  // 警告提示：2.5秒
      info: 2000      // 信息提示：2秒
    };
    // 活动Toast列表
    this.activeToasts = new Set();
    // 是否有Modal弹窗显示（由ModalDialog管理）
    this.hasModalOpen = false;
    // 暂停的Toast定时器
    this.pausedTimers = new Map();
    this.init();
  }

  init() {
    // 延迟初始化，确保DOM已准备好
    const initContainers = () => {
      if (!document.body) {
        // 如果body还不存在，继续等待
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initContainers);
        } else {
          requestAnimationFrame(initContainers);
        }
        return;
      }

      // 确保Toast容器存在
      this.toastContainer = document.getElementById('toastContainer');
      if (!this.toastContainer) {
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'toastContainer';
        this.toastContainer.className = 'toast-container';
        document.body.appendChild(this.toastContainer);
      }

      // 监听ModalDialog弹窗的显示和隐藏（用于与Toast配合）
      this.setupModalWatcher();
    };

    // 立即尝试初始化
    initContainers();
  }

  /**
   * 设置ModalDialog弹窗监听器，用于与Toast弹窗配合
   */
  setupModalWatcher() {
    // 使用MutationObserver监听ModalDialog的容器变化
    const checkModalDialog = () => {
      const modalDialogContainer = document.getElementById('modalContainer');
      if (!modalDialogContainer) {
        // 如果ModalDialog容器不存在，延迟重试
        setTimeout(checkModalDialog, 100);
        return;
      }

      const observer = new MutationObserver(() => {
        // 检查ModalDialog的弹窗
        const hasModalDialog = modalDialogContainer.querySelector('.modal-dialog-overlay.show') !== null;
        
        if (hasModalDialog !== this.hasModalOpen) {
          this.hasModalOpen = hasModalDialog;
          if (hasModalDialog) {
            // Modal显示时，暂停所有Toast的自动消失
            this.pauseAllToasts();
          } else {
            // Modal关闭时，恢复所有Toast的自动消失
            this.resumeAllToasts();
          }
        }
      });

      observer.observe(modalDialogContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-hidden']
      });
    };

    checkModalDialog();
  }

  /**
   * 暂停所有Toast的自动消失
   */
  pauseAllToasts() {
    this.activeToasts.forEach((toastData) => {
      if (toastData.timeoutId) {
        clearTimeout(toastData.timeoutId);
        const remainingTime = toastData.endTime - Date.now();
        if (remainingTime > 0) {
          this.pausedTimers.set(toastData.toast, remainingTime);
        }
        toastData.timeoutId = null;
      }
      // 暂停进度条动画
      const progressBar = toastData.toast.querySelector('.toast-progress-bar');
      if (progressBar) {
        progressBar.style.animationPlayState = 'paused';
      }
    });
  }

  /**
   * 恢复所有Toast的自动消失
   */
  resumeAllToasts() {
    const now = Date.now();
    this.activeToasts.forEach((toastData) => {
      // 如果已经有定时器在运行，跳过
      if (toastData.timeoutId) {
        const progressBar = toastData.toast.querySelector('.toast-progress-bar');
        if (progressBar) {
          progressBar.style.animationPlayState = 'running';
        }
        return;
      }
      
      // 检查是否有暂停的剩余时间
      let remainingTime = this.pausedTimers.get(toastData.toast);
      if (remainingTime && remainingTime > 0) {
        // 使用暂停的剩余时间
        toastData.timeoutId = setTimeout(() => {
          this.removeToast(toastData.toast);
        }, remainingTime);
        toastData.endTime = now + remainingTime;
        this.pausedTimers.delete(toastData.toast);
      } else if (toastData.duration > 0 && !toastData.options.manualClose) {
        // 如果没有暂停时间，但是应该自动关闭，重新计算剩余时间
        if (toastData.endTime && toastData.endTime > now) {
          // 使用原本的结束时间计算剩余时间
          remainingTime = toastData.endTime - now;
        } else {
          // 如果没有有效的结束时间，使用完整的duration
          remainingTime = toastData.duration;
          toastData.endTime = now + remainingTime;
        }
        
        if (remainingTime > 0) {
          toastData.timeoutId = setTimeout(() => {
            this.removeToast(toastData.toast);
          }, remainingTime);
        }
      }
      
      // 恢复进度条动画
      const progressBar = toastData.toast.querySelector('.toast-progress-bar');
      if (progressBar) {
        progressBar.style.animationPlayState = 'running';
      }
    });
  }

  /**
   * 显示Toast提示
   * @param {string} message - 提示消息
   * @param {string} type - 类型：success, error, warning, info
   * @param {number} duration - 显示时长（毫秒），如果不提供则使用默认值
   * @param {object} options - 额外选项
   *   - manualClose: 是否手动关闭（不自动消失），默认false
   *   - clickToClose: 是否点击关闭，默认true
   */
  toast(message, type = 'info', duration = null, options = {}) {
    if (!this.toastContainer) return;

    // 如果duration为null，使用默认消失时间
    if (duration === null || duration === undefined) {
      duration = this.toastDurations[type] || 2000;
    }

    // 如果duration为0或负数，且manualClose为false，使用默认消失时间
    if (duration <= 0 && !options.manualClose) {
      duration = this.toastDurations[type] || 2000;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type} toast-enter`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    
    // 使用will-change优化动画性能
    toast.style.willChange = 'transform, opacity';

    // 添加图标和进度条
    const icon = this.getIcon(type);
    const showProgress = duration > 0 && !options.manualClose;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${this.escapeHtml(message)}</span>
        <button class="toast-close" aria-label="关闭">&times;</button>
      </div>
      ${showProgress ? `
        <div class="toast-progress">
          <div class="toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
        </div>
      ` : ''}
    `;

    // 添加关闭按钮事件
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeToast(toast);
      });
    }

    // 点击Toast关闭（如果启用）
    if (options.clickToClose !== false) {
      toast.addEventListener('click', (e) => {
        if (e.target === toast || e.target.closest('.toast-content')) {
          this.removeToast(toast);
        }
      });
    }

    this.toastContainer.appendChild(toast);

    // 使用双重requestAnimationFrame优化动画性能，立即显示
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-show');
        // 动画完成后移除will-change
        setTimeout(() => {
          toast.style.willChange = 'auto';
        }, 400);
      });
    });

    // 创建Toast数据对象
    const toastData = {
      toast,
      type,
      duration,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      timeoutId: null,
      options
    };

    // 自动移除（如果不需要手动关闭）
    if (duration > 0 && !options.manualClose) {
      // 如果当前有Modal打开，不立即启动定时器
      if (!this.hasModalOpen) {
        toastData.timeoutId = setTimeout(() => {
          this.removeToast(toast);
        }, duration);
      }
    }

    // 添加到活动Toast列表
    this.activeToasts.add(toastData);

    // 添加悬停暂停功能
    toast.addEventListener('mouseenter', () => {
      if (toastData.timeoutId) {
        clearTimeout(toastData.timeoutId);
        const remainingTime = toastData.endTime - Date.now();
        if (remainingTime > 0) {
          this.pausedTimers.set(toast, remainingTime);
        }
        toastData.timeoutId = null;
      }
      const progressBar = toast.querySelector('.toast-progress-bar');
      if (progressBar) {
        progressBar.style.animationPlayState = 'paused';
      }
    });

    toast.addEventListener('mouseleave', () => {
      // 如果当前没有Modal打开，恢复定时器
      if (!this.hasModalOpen && !options.manualClose) {
        const remainingTime = this.pausedTimers.get(toast) || (toastData.endTime - Date.now());
        if (remainingTime > 0) {
          toastData.timeoutId = setTimeout(() => {
            this.removeToast(toast);
          }, remainingTime);
          toastData.endTime = Date.now() + remainingTime;
          this.pausedTimers.delete(toast);
        }
      }
      const progressBar = toast.querySelector('.toast-progress-bar');
      if (progressBar) {
        progressBar.style.animationPlayState = 'running';
      }
    });

    return toast;
  }

  /**
   * 移除Toast
   */
  removeToast(toast) {
    if (!toast || !toast.parentNode) return;

    // 从活动Toast列表中移除
    let toastData = null;
    for (const data of this.activeToasts) {
      if (data.toast === toast) {
        toastData = data;
        break;
      }
    }
    if (toastData) {
      this.activeToasts.delete(toastData);
      // 清除定时器
      if (toastData.timeoutId) {
        clearTimeout(toastData.timeoutId);
        toastData.timeoutId = null;
      }
      // 清除暂停的定时器
      this.pausedTimers.delete(toast);
    }

    // 添加退出动画
    toast.classList.remove('toast-show');
    toast.classList.add('toast-exit');
    
    // 使用requestAnimationFrame优化动画
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300); // 与CSS动画时间匹配
    });
  }


  /**
   * 获取类型对应的图标
   */
  getIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  /**
   * HTML转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 快捷方法
   */
  success(message, duration, options) {
    return this.toast(message, 'success', duration, options);
  }

  error(message, duration, options) {
    return this.toast(message, 'error', duration, options);
  }

  warning(message, duration, options) {
    return this.toast(message, 'warning', duration, options);
  }

  info(message, duration, options) {
    return this.toast(message, 'info', duration, options);
  }
}

// 创建单例实例
const notificationInstance = new NotificationSystem();

// 默认导出实例
export default notificationInstance;

// 导出到全局命名空间（保持向后兼容）
window.notification = notificationInstance;
window.NotificationSystem = notificationInstance; // 确保两个变量都指向同一个实例

// 兼容性：保持原有的toast函数
window.toast = (message, type, duration) => {
  return notificationInstance.toast(message, type, duration);
};

// 替换原生alert/confirm/prompt
window.alert = (message) => {
  // 检查是否是系统异常消息，如果是则不显示
  if (message && message.includes('系统出现异常，请刷新页面后重试')) {
    console.warn('系统异常alert被阻止:', message);
    return;
  }
  return notificationInstance.toast(message, 'info', 2000, { clickToClose: false });
};

// 替换原生confirm/prompt为ModalDialog
window.confirm = (message) => {
  if (window.ModalDialog) {
    return window.ModalDialog.confirm(message);
  }
  // 降级到原生confirm
  return Promise.resolve(globalThis.confirm(message));
};

window.prompt = (message, defaultValue) => {
  if (window.ModalDialog) {
    return window.ModalDialog.prompt(message, { defaultValue });
  }
  // 降级到原生prompt
  return Promise.resolve(globalThis.prompt(message, defaultValue));
};
