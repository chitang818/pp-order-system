/**
 * 设置页面UI增强脚本
 * ES6 模块化版本
 * 提供统一的交互动效和用户体验优化
 */

// 初始化设置页面交互
function initSettingsUI() {
    // 为所有设置输入框添加焦点动画
    addInputFocusEffects();
    
    // 为设置卡片添加悬停效果
    addCardHoverEffects();
    
    // 为按钮添加点击波纹效果
    addButtonRippleEffects();
    
    // 添加保存成功反馈动画
    addSaveSuccessAnimation();
    
    // 添加输入验证反馈
    addInputValidation();
    
    // 添加自动保存提示
    addAutoSaveIndicator();
  }

// 输入框焦点效果
function addInputFocusEffects() {
    document.addEventListener('focus', function(e) {
      if (e.target.matches('.settings-input, .settings-textarea')) {
        const formGroup = e.target.closest('.settings-form-group');
        if (formGroup) {
          formGroup.classList.add('focused');
        }
      }
    }, true);

    document.addEventListener('blur', function(e) {
      if (e.target.matches('.settings-input, .settings-textarea')) {
        const formGroup = e.target.closest('.settings-form-group');
        if (formGroup) {
          formGroup.classList.remove('focused');
        }
      }
    }, true);
  }

  // 卡片悬停效果增强
  function addCardHoverEffects() {
    const cards = document.querySelectorAll('.settings-card');
    cards.forEach(card => {
      card.addEventListener('mouseenter', function() {
        this.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      });
    });
  }

  // 按钮波纹效果
  function addButtonRippleEffects() {
    document.addEventListener('click', function(e) {
      const button = e.target.closest('.settings-btn');
      if (!button) return;

      // 创建波纹元素
      const ripple = document.createElement('span');
      ripple.classList.add('settings-btn-ripple');
      
      // 计算波纹位置
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      
      button.appendChild(ripple);
      
      // 动画完成后移除
      setTimeout(() => ripple.remove(), 600);
    });
  }

  // 保存成功动画
  function addSaveSuccessAnimation() {
    // 监听保存按钮点击
    const saveButtons = document.querySelectorAll('#btnSaveCompany, #btnSaveStoragePath');
    
    saveButtons.forEach(button => {
      const originalHandler = button.onclick;
      
      button.onclick = function(e) {
        // 执行原始处理函数
        if (originalHandler) {
          const result = originalHandler.call(this, e);
          
          // 如果返回Promise,等待完成后显示动画
          if (result && typeof result.then === 'function') {
            result.then(() => {
              showSaveSuccessAnimation(this);
            }).catch(() => {
              showSaveErrorAnimation(this);
            });
          } else {
            // 延迟显示动画,给后端时间响应
            setTimeout(() => {
              // 检查是否有成功的toast消息
              const hasSuccessToast = document.querySelector('.toast.success');
              if (hasSuccessToast) {
                showSaveSuccessAnimation(this);
              }
            }, 100);
          }
        }
      };
    });
  }

  // 显示保存成功动画
  function showSaveSuccessAnimation(button) {
    const card = button.closest('.settings-card');
    if (card) {
      card.classList.add('success-feedback');
      setTimeout(() => {
        card.classList.remove('success-feedback');
      }, 1000);
    }
    
    // 按钮成功状态
    const originalHTML = button.innerHTML;
    button.innerHTML = '<span class="settings-btn-icon">✓</span>已保存';
    button.disabled = true;
    
    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.disabled = false;
    }, 2000);
  }

  // 显示保存错误动画
  function showSaveErrorAnimation(button) {
    button.classList.add('shake');
    setTimeout(() => {
      button.classList.remove('shake');
    }, 500);
  }

  // 输入验证反馈
  function addInputValidation() {
    document.addEventListener('input', function(e) {
      if (e.target.matches('.settings-input, .settings-textarea')) {
        validateInput(e.target);
      }
    });
  }

  // 验证输入
  function validateInput(input) {
    const value = input.value.trim();
    const formGroup = input.closest('.settings-form-group');
    
    if (!formGroup) return;
    
    // 移除之前的验证消息
    const oldFeedback = formGroup.querySelector('.settings-validation-feedback');
    if (oldFeedback) oldFeedback.remove();
    
    // 检查必填字段
    const label = formGroup.querySelector('.settings-label');
    const isRequired = label && label.querySelector('.settings-label-required');
    
    if (isRequired && !value) {
      input.classList.add('invalid');
      input.classList.remove('valid');
    } else if (value) {
      input.classList.remove('invalid');
      input.classList.add('valid');
    } else {
      input.classList.remove('invalid', 'valid');
    }
  }

  // 自动保存指示器
  function addAutoSaveIndicator() {
    let saveTimeout;
    let hasUnsavedChanges = false;
    
    // 监听所有输入变化
    document.addEventListener('input', function(e) {
      if (e.target.matches('.settings-input, .settings-textarea')) {
        hasUnsavedChanges = true;
        updateSaveIndicator('unsaved');
        
        // 清除之前的定时器
        clearTimeout(saveTimeout);
      }
    });
    
    // 监听保存操作
    document.addEventListener('click', function(e) {
      if (e.target.closest('.settings-btn.primary')) {
        const button = e.target.closest('.settings-btn.primary');
        if (button.id === 'btnSaveCompany' || button.id === 'btnSaveStoragePath') {
          hasUnsavedChanges = false;
          updateSaveIndicator('saved');
        }
      }
    });
  }

  // 更新保存指示器
  function updateSaveIndicator(status) {
    let indicator = document.querySelector('.settings-save-indicator');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'settings-save-indicator';
      
      const settingsContent = document.querySelector('.settings-content');
      if (settingsContent) {
        settingsContent.appendChild(indicator);
      }
    }
    
    if (status === 'unsaved') {
      indicator.textContent = '● 有未保存的更改';
      indicator.style.color = '#f39c12';
      indicator.style.display = 'block';
    } else if (status === 'saved') {
      indicator.textContent = '✓ 已保存';
      indicator.style.color = '#27ae60';
      indicator.style.display = 'block';
      
      setTimeout(() => {
        indicator.style.display = 'none';
      }, 3000);
    }
  }

  // 添加键盘快捷键支持
  function addKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      // Ctrl+S / Cmd+S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        
        const activeSection = document.querySelector('#settingsCompanyPage:not([style*="display: none"]), #settingsDbPage:not([style*="display: none"])');
        
        if (activeSection) {
          if (activeSection.id === 'settingsCompanyPage') {
            const saveBtn = document.getElementById('btnSaveCompany');
            if (saveBtn) saveBtn.click();
          }
        }
      }
    });
  }

  // 添加平滑滚动
  function addSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        e.preventDefault();
        const target = document.querySelector(href);
        
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  // 添加加载动画
  function showLoadingAnimation(button) {
    const originalHTML = button.innerHTML;
    button.innerHTML = '<span class="settings-loading">⏳</span>处理中...';
    button.disabled = true;
    
    return {
      stop: function() {
        button.innerHTML = originalHTML;
        button.disabled = false;
      }
    };
  }

  // 卡片渐入动画
  function addCardEnterAnimation() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }, index * 100);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1
    });

    document.querySelectorAll('.settings-card').forEach(card => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      observer.observe(card);
    });
  }

  // 输入框字符计数
  function addCharacterCount() {
    document.querySelectorAll('.settings-textarea').forEach(textarea => {
      const maxLength = textarea.getAttribute('maxlength');
      if (!maxLength) return;

      const counter = document.createElement('div');
      counter.className = 'settings-char-counter';
      counter.style.cssText = 'text-align: right; font-size: 12px; color: #95a5a6; margin-top: 4px;';
      
      const formGroup = textarea.closest('.settings-form-group');
      if (formGroup) {
        formGroup.appendChild(counter);
      }

      const updateCounter = () => {
        const current = textarea.value.length;
        counter.textContent = `${current} / ${maxLength}`;
        
        if (current > maxLength * 0.9) {
          counter.style.color = '#e74c3c';
        } else {
          counter.style.color = '#95a5a6';
        }
      };

      textarea.addEventListener('input', updateCounter);
      updateCounter();
    });
  }

  // 表单自动填充提示
  function addAutofillHints() {
    const inputs = document.querySelectorAll('.settings-input');
    
    inputs.forEach(input => {
      input.addEventListener('focus', function() {
        // 检查是否有历史数据
        const historicalData = localStorage.getItem(`settings_${this.id}`);
        if (historicalData && !this.value) {
          // 显示提示
          showAutofillHint(this, historicalData);
        }
      });
      
      // 保存输入数据
      input.addEventListener('change', function() {
        if (this.value.trim()) {
          localStorage.setItem(`settings_${this.id}`, this.value);
        }
      });
    });
  }

  // 显示自动填充提示
  function showAutofillHint(input, value) {
    const hint = document.createElement('div');
    hint.className = 'settings-autofill-hint';
    hint.style.cssText = `
      position: absolute;
      background: #34495e;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      cursor: pointer;
    `;
    hint.textContent = `使用之前的值: ${value}`;
    
    const rect = input.getBoundingClientRect();
    hint.style.left = rect.left + 'px';
    hint.style.top = (rect.bottom + 8) + 'px';
    
    hint.addEventListener('click', () => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      hint.remove();
    });
    
    document.body.appendChild(hint);
    
    setTimeout(() => hint.remove(), 5000);
  }

  
// 暴露API到全局
const SettingsUI = {
  init: initSettingsUI,
  showLoading: showLoadingAnimation,
  showSuccess: showSaveSuccessAnimation,
  showError: showSaveErrorAnimation
};
// 导出 API
export { SettingsUI };

// 暴露到全局（保持向后兼容）
if (typeof window !== 'undefined') {
  window.SettingsUI = SettingsUI;
  
  // 页面加载完成后自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', SettingsUI.init);
  } else {
    SettingsUI.init();
  }
  
  // 监听路由变化,重新初始化
  window.addEventListener('hashchange', function() {
    const hash = window.location.hash;
    if (hash.includes('settings')) {
      // 使用微任务队列，立即执行但不阻塞渲染
      Promise.resolve().then(() => {
        SettingsUI.init();
      });
    }
  });
}
