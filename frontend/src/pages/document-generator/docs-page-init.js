/**
 * 文档生成器页面初始化脚本（docs.html）
 * 
 * 功能说明：
 * - 这是 docs.html 页面的初始化脚本
 * - 从 docs.html 中提取的内联脚本（预览窗口按钮事件绑定）
 * - 这是一个独立的单页面应用，只有一个页面
 * 
 * 注意：单据中心（document-center）是一个多页面功能模块，包含三个二级页面
 * 
 * ES6 模块化版本
 */

/**
 * 初始化单据中心页面预览窗口按钮事件
 */
let buttonsBound = false; // 防止重复绑定

export function initDocsPagePreviewButtons() {
  // 如果已经绑定过，不再重复绑定
  if (buttonsBound) {
    return;
  }
  
  // 等待DOM和主脚本都加载完成
  function tryBindButtons() {
    const btnStyleUltraCompactHeader = document.getElementById('btnStyleUltraCompactHeader');
    const btnStyleCompactHeader = document.getElementById('btnStyleCompactHeader');
    const btnStyleStandardHeader = document.getElementById('btnStyleStandardHeader');
    const btnStyleWideHeader = document.getElementById('btnStyleWideHeader');
    
    // 检查按钮是否存在
    if (!btnStyleUltraCompactHeader && !btnStyleCompactHeader && !btnStyleStandardHeader && !btnStyleWideHeader) {
      // 按钮还未加载，延迟重试
      setTimeout(tryBindButtons, 100);
      return;
    }
    
    // 检查全局变量是否可用
    if (typeof window.styleMode === 'undefined' || typeof window.save !== 'function' || typeof window.renderPreview !== 'function') {
      // 全局变量还未准备好，延迟重试
      setTimeout(tryBindButtons, 100);
      return;
    }
    
    // 标记为已绑定，防止重复绑定
    buttonsBound = true;
    console.log('开始绑定预览窗口标题栏按钮事件');
    
    // 为预览窗口表头按钮添加事件监听器，与右侧按钮功能完全一致
    if (btnStyleUltraCompactHeader) {
      btnStyleUltraCompactHeader.addEventListener('click', () => {
        console.log('超紧按钮被点击');
        if (typeof window.styleMode !== 'undefined' && typeof window.save === 'function' && typeof window.renderPreview === 'function') {
          console.log('执行超紧布局切换');
          window.styleMode = 'ultra-compact';
          window.save('erp.docs.style', window.styleMode);
          window.renderPreview(true);  // 跳过自动缩放，只改变内容间距
          // 同步按钮状态
          document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.style === 'ultra-compact') {
              btn.classList.add('active');
            }
          });
        } else {
          console.error('全局变量不可用:', {
            styleMode: typeof window.styleMode,
            save: typeof window.save,
            renderPreview: typeof window.renderPreview
          });
        }
      });
    }
    
    if (btnStyleCompactHeader) {
      btnStyleCompactHeader.addEventListener('click', () => {
        console.log('紧凑按钮被点击');
        if (typeof window.styleMode !== 'undefined' && typeof window.save === 'function' && typeof window.renderPreview === 'function') {
          console.log('执行紧凑布局切换');
          window.styleMode = 'compact';
          window.save('erp.docs.style', window.styleMode);
          window.renderPreview(true);  // 跳过自动缩放，只改变内容间距
          document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.style === 'compact') {
              btn.classList.add('active');
            }
          });
        } else {
          console.error('全局变量不可用:', {
            styleMode: typeof window.styleMode,
            save: typeof window.save,
            renderPreview: typeof window.renderPreview
          });
        }
      });
    }
    
    if (btnStyleStandardHeader) {
      btnStyleStandardHeader.addEventListener('click', () => {
        console.log('标准按钮被点击');
        if (typeof window.styleMode !== 'undefined' && typeof window.save === 'function' && typeof window.renderPreview === 'function') {
          console.log('执行标准布局切换');
          window.styleMode = 'standard';
          window.save('erp.docs.style', window.styleMode);
          window.renderPreview(true);  // 跳过自动缩放，只改变内容间距
          document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.style === 'standard') {
              btn.classList.add('active');
            }
          });
        } else {
          console.error('全局变量不可用:', {
            styleMode: typeof window.styleMode,
            save: typeof window.save,
            renderPreview: typeof window.renderPreview
          });
        }
      });
    }
    
    if (btnStyleWideHeader) {
      btnStyleWideHeader.addEventListener('click', () => {
        console.log('宽松按钮被点击');
        if (typeof window.styleMode !== 'undefined' && typeof window.save === 'function' && typeof window.renderPreview === 'function') {
          console.log('执行宽松布局切换');
          window.styleMode = 'wide';
          window.save('erp.docs.style', window.styleMode);
          window.renderPreview(true);  // 跳过自动缩放，只改变内容间距
          document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.style === 'wide') {
              btn.classList.add('active');
            }
          });
        } else {
          console.error('全局变量不可用:', {
            styleMode: typeof window.styleMode,
            save: typeof window.save,
            renderPreview: typeof window.renderPreview
          });
        }
      });
    }
    
    // 添加缩放按钮的事件监听器
    const zoomOutBtn = document.getElementById('zoomOut');
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomLevelEl = document.getElementById('zoomLevel');
    const fitToPageToggle = document.getElementById('fitToPageToggle');
    
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        console.log('点击缩小按钮');
        if (typeof window.zoomLevel !== 'undefined' && typeof window.renderPreview === 'function') {
          window.zoomLevel = Math.max(50, window.zoomLevel - 10);
          if (zoomLevelEl) zoomLevelEl.textContent = `${window.zoomLevel}%`;
          window.renderPreview();
          console.log('缩放级别:', window.zoomLevel);
        } else {
          console.error('缩放功能不可用:', {
            zoomLevel: typeof window.zoomLevel,
            renderPreview: typeof window.renderPreview
          });
        }
      });
    }
    
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        console.log('点击放大按钮');
        if (typeof window.zoomLevel !== 'undefined' && typeof window.renderPreview === 'function') {
          window.zoomLevel = Math.min(150, window.zoomLevel + 10);
          if (zoomLevelEl) zoomLevelEl.textContent = `${window.zoomLevel}%`;
          window.renderPreview();
          console.log('缩放级别:', window.zoomLevel);
        } else {
          console.error('缩放功能不可用:', {
            zoomLevel: typeof window.zoomLevel,
            renderPreview: typeof window.renderPreview
          });
        }
      });
    }
    
    if (fitToPageToggle) {
      fitToPageToggle.addEventListener('change', () => {
        console.log('切换适配模式:', fitToPageToggle.checked);
        if (typeof window.renderPreview === 'function') {
          window.renderPreview();
        } else {
          console.error('renderPreview函数不可用');
        }
      });
    }
    
    // 初始化缩放级别显示
    if (zoomLevelEl && typeof window.zoomLevel !== 'undefined') {
      zoomLevelEl.textContent = `${window.zoomLevel}%`;
    }

    // 预热导出服务：进入单据生成页面时，立即在后台启动浏览器实例
    // 这样用户在点击“导出PDF”时，浏览器已经就绪，无需等待启动
    if (window.ApiService && typeof window.ApiService.json === 'function') {
      console.log('[PDF导出] 正在后台预热浏览器实例...');
      window.ApiService.json('/api/export/warmup', { method: 'POST' }).catch(err => {
        console.warn('[PDF导出] 浏览器预热失败（非关键错误）:', err.message);
      });
    }
  }
  
  // 开始尝试绑定按钮
  tryBindButtons();
}

// DOM 加载完成后自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDocsPagePreviewButtons);
} else {
  // DOM 已经加载完成，立即执行
  initDocsPagePreviewButtons();
}

