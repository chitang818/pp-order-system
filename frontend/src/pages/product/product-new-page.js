/**
 * 新增产品页面业务逻辑
 */

import { ApiService } from '../../api/api.js';

// Toast 提示函数
function toast(message, type = "info", duration = 2000) {
  if (window.NotificationSystem && window.NotificationSystem.toast) {
    return window.NotificationSystem.toast(message, type, duration);
  }
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;

  const el = document.createElement("div");
  el.className = `toast ${type} toast-enter`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");

  const content = document.createElement("div");
  content.className = "toast-content";

  const message_div = document.createElement("div");
  message_div.className = "toast-message";
  message_div.textContent = message;

  content.appendChild(message_div);
  el.appendChild(content);

  const progress = document.createElement("div");
  progress.className = "toast-progress";
  const progressBar = document.createElement("div");
  progressBar.className = "toast-progress-bar";
  progressBar.style.animationDuration = `${duration}ms`;
  progress.appendChild(progressBar);
  el.appendChild(progress);

  toastContainer.appendChild(el);

  setTimeout(() => {
    el.classList.remove('toast-enter');
    el.classList.add('toast-show');
  }, 10);

  const timer = setTimeout(() => removeToast(el), duration);
  el.addEventListener("click", () => {
    clearTimeout(timer);
    removeToast(el);
  });

  return el;
}

function removeToast(el) {
  if (!el || !el.parentNode) return;
  el.classList.remove('toast-show');
  el.classList.add('toast-exit');
  setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 200);
}

/**
 * 初始化新增产品页面
 */
export function initProductAddPage() {
  let currentProductType = 1; // 默认A类品

  // 初始化函数
  function init() {
    setupProductTypeSelector();
    setupFormHandlers();
  }

  // 设置产品类别选择器
  function setupProductTypeSelector() {
    const typeButtons = document.querySelectorAll('.product-type-btn');
    const formSections = document.querySelectorAll('.form-section');

    typeButtons.forEach(btn => {
      btn.addEventListener('click', function () {
        const type = parseInt(this.getAttribute('data-type'));
        currentProductType = type;

        // 更新按钮状态
        typeButtons.forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        // 显示对应的表单
        formSections.forEach(section => {
          section.classList.remove('active');
        });
        document.getElementById(`productFormType${type}`).classList.add('active');

        // 清除消息
        clearMessage();
      });
    });
  }

  // 设置表单处理
  function setupFormHandlers() {
    // A类品表单
    const formType1 = document.getElementById('productFormType1');
    const btnCancelType1 = document.getElementById('btnCancelType1');

    if (formType1) {
      formType1.addEventListener('submit', handleSubmit.bind(null, 1));
    }

    if (btnCancelType1) {
      btnCancelType1.addEventListener('click', handleCancel);
    }

    // B类品表单
    const formType2 = document.getElementById('productFormType2');
    const btnCancelType2 = document.getElementById('btnCancelType2');

    if (formType2) {
      formType2.addEventListener('submit', handleSubmit.bind(null, 2));
    }

    if (btnCancelType2) {
      btnCancelType2.addEventListener('click', handleCancel);
    }

    // C类品表单
    const formType3 = document.getElementById('productFormType3');
    const btnCancelType3 = document.getElementById('btnCancelType3');

    if (formType3) {
      formType3.addEventListener('submit', handleSubmit.bind(null, 3));
    }

    if (btnCancelType3) {
      btnCancelType3.addEventListener('click', handleCancel);
    }
  }

  // 处理表单提交
  async function handleSubmit(productType, event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    // 构建产品数据
    const productData = {
      model: formData.get('model')?.trim() || '',
      description: formData.get('description')?.trim() || '',
      unit: formData.get('unit') || '',
      estimatedWeight: formData.get('estimatedWeight') ? parseFloat(formData.get('estimatedWeight')) : 0,
      source: 'manual' // 来源为手动输入
    };

    // 验证产品型号
    if (!productData.model) {
      showMessage('产品型号不能为空', 'error');
      return;
    }

    // 根据产品类型添加特定字段
    if (productType === 1) {
      // A类品：标签重量、安全系数、清洁度
      productData.labelWeight = formData.get('labelWeight') ? Math.round(parseFloat(formData.get('labelWeight'))) : 1000;
      productData.safetyFactor = formData.get('safetyFactor') || null;
      productData.cleanliness = formData.get('cleanliness') || null;
    } else if (productType === 2) {
      // B类品：标签批号、标签说明、清洁度
      productData.labelBatchNo = formData.get('labelBatchNo')?.trim() || '';
      productData.label = formData.get('label')?.trim() || '';
      productData.cleanliness = formData.get('cleanliness') || null;
    } else if (productType === 3) {
      // C类品：唛头、标签说明、清洁度
      productData.marks = formData.get('marks')?.trim() || '';
      productData.label = formData.get('label')?.trim() || '';
      productData.cleanliness = formData.get('cleanliness') || null;
    }

    try {
      showMessage('正在保存产品...', 'info');

      const token = localStorage.getItem('token') || '';
      // 桌面端（Tauri）优先走 Rust command
      let result = null;
      try {
        const core = await import('@tauri-apps/api/core');
        if (core?.invoke) {
          result = await core.invoke('products_create', { ...productData, token });
        }
      } catch (_) { }

      if (!result) {
        // 回退：使用 ApiService.json 自动处理 CSRF token
        result = await ApiService.json('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(productData)
        });
      }

      if (result.success) {
        showMessage('产品保存成功', 'success');

        // 清除产品列表缓存，确保数据同步
        if (window.CacheService && window.CacheService.products) {
          // 清除所有产品搜索缓存
          try {
            // 如果缓存服务有clear方法，调用它
            if (typeof window.CacheService.products.clear === 'function') {
              window.CacheService.products.clear();
            }
          } catch (e) {
            console.warn('[产品新增] 清除缓存失败:', e);
          }
        }

        // 重置表单
        form.reset();

        // 跳转到产品列表，并添加refresh参数强制刷新
        setTimeout(() => {
          console.log('[产品新增] 保存成功，准备跳转到产品列表');
          // 使用location.hash跳转，触发路由系统重新加载
          location.hash = '#/products/list?refresh=true';
        }, 1000);
      } else {
        showMessage('保存产品失败: ' + (result.message || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('保存产品失败:', error);
      showMessage('保存产品失败: ' + error.message, 'error');
    }
  }

  // 处理取消
  function handleCancel() {
    if (confirm('确定要取消吗？未保存的数据将丢失。')) {
      window.location.href = '#/products/list';
    }
  }

  // 显示消息
  function showMessage(message, type = 'success') {
    const container = document.getElementById('messageContainer');
    if (!container) return;

    const alertClass = type === 'error' ? 'alert-error' : 'alert-success';
    container.innerHTML = `<div class="alert ${alertClass}">${escapeHtml(message)}</div>`;

    // 3秒后自动清除
    setTimeout(() => {
      clearMessage();
    }, 3000);
  }

  // 清除消息
  function clearMessage() {
    const container = document.getElementById('messageContainer');
    if (container) {
      container.innerHTML = '';
    }
  }

  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 页面加载时初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

