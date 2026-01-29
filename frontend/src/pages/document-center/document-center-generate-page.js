/**
 * 单据中心 - 单据生成页面逻辑
 * 
 * 功能说明：
 * - 这是单据中心（document-center）的三个二级页面之一
 * - 负责单据的生成、预览和导出
 * - 基于模板系统，功能比文档生成器（docs.html）更强大
 * 
 * 单据中心包含三个二级页面：
 *   1. 单据生成（本文件）
 *   2. 单据模版（document-center-templates-page.js）
 *   3. 模板编辑（document-center-template-editor-v2-page.js）
 * 
 * 注意：文档生成器（document-generator/docs.html）是独立的单页面应用
 */

import DocumentCenterService from '../../services/document-center-service.js';
import { TemplateRenderer } from '../../components/document-center/template-renderer.js';
import { DataBinder } from '../../components/document-center/data-binder.js';
import { TemplateService } from '../../components/document-center/template-service.js';
import { DocumentCenterValidator } from '../../utils/document-center-validator.js';
import { showFriendlyError, showLoadingState, restoreElementState } from '../../utils/document-center-error-helper.js';
import { throttle } from '../../utils/binding-utils.js';
import { 
  DOCUMENT_TYPES, 
  DOCUMENT_TYPE_NAMES, 
  DEFAULT_MARGIN, 
  ZOOM_CONFIG, 
  A4_SIZE, 
  MM_TO_PX,
  DEBOUNCE_DELAY,
  PREVIEW_CONFIG
} from '../../constants/document-center.js';
// 导入优化后的预览生成器
import { generatePreview as generatePreviewNew } from './preview-generator.js';
import { DocumentCenterUtils } from '../../utils/document-center-utils.js';
// 导入统一 PP 预览器（重构后）
import { PPPreviewer, ZoomController } from '../../components/document-center/pp-viewer/index.js';

/** @type {Object|null} 当前选中的订单 */
let currentOrder = null;
/** @type {Object|null} 当前选中的模板 */
let currentTemplate = null;
/** @type {string} 当前单据类型 */
let currentDocumentType = DOCUMENT_TYPES.SALES;
/** @type {PPPreviewer|null} PP预览器实例（view模式） */
let previewViewer = null;
/** @type {ZoomController|null} 缩放控制器实例 */
let zoomController = null;

/**
 * 初始化单据生成页面
 * @description 初始化单据生成页面的所有功能，包括事件绑定、面板折叠、预览缩放等
 * @returns {Promise<void>}
 */
export async function initDocumentCenterGeneratePage() {
  console.log('[DocumentCenterGeneratePage] 初始化单据生成页面');
  
  // 绑定事件
  bindEvents();
  
  // 初始化面板折叠功能
  initPanelToggles();
  
  // 初始化统一预览组件和缩放控制器
  initUnifiedPreview();
  
  // 加载订单列表
  await loadOrders();
  
  // 加载模板列表
  await loadTemplates();
  
  // 设置默认选中销售确认书
  setDefaultDocumentType();
  
  // 检查URL参数中是否有订单ID，如果有则自动选择
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = location.hash.includes('?') ? new URLSearchParams(location.hash.split('?')[1]) : null;
  const orderId = urlParams.get('orderId') || (hashParams ? hashParams.get('orderId') : null);
  
  if (orderId) {
    console.log('[DocumentCenterGeneratePage] 从URL参数中检测到订单ID:', orderId);
    // 等待订单列表加载完成后再选择订单
    setTimeout(async () => {
      const orderSelect = document.getElementById('orderSelect');
      if (orderSelect) {
        orderSelect.value = orderId;
        // 触发change事件以加载订单
        orderSelect.dispatchEvent(new Event('change'));
      }
    }, 100);
  }

  // 预热导出服务：进入单据中心页面时，立即在后台启动浏览器实例
  if (window.ApiService && typeof window.ApiService.json === 'function') {
    console.log('[DocumentCenterGeneratePage] 正在后台预热浏览器实例...');
    window.ApiService.json('/api/export/warmup', { method: 'POST' }).catch(err => {
      console.warn('[DocumentCenterGeneratePage] 浏览器预热失败（非关键错误）:', err.message);
    });
  }
  
  // 页面加载时滚动到顶部
  scrollToTop();
  
  // 延迟再次执行，确保所有内容都已加载
  setTimeout(() => {
    scrollToTop();
  }, 500);
  
  // 监听视图显示事件，确保在视图切换时也滚动到顶部
  const viewElement = document.getElementById('view-document-center-generate');
  if (viewElement) {
    // 使用 MutationObserver 监听视图激活状态
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.classList.contains('view-active')) {
            // 视图激活时滚动到顶部
            setTimeout(() => {
              scrollToTop();
            }, 50);
          }
        }
      });
    });
    
    observer.observe(viewElement, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  
  // 监听页面可见性变化，当页面重新可见时滚动到顶部
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // 页面重新可见时，延迟执行滚动，确保内容已渲染
      setTimeout(() => {
        scrollToTop();
      }, 100);
    }
  });
  
  // 监听窗口焦点事件，当窗口重新获得焦点时滚动到顶部
  window.addEventListener('focus', () => {
    setTimeout(() => {
      scrollToTop();
    }, 100);
  });
}

/**
 * 滚动到页面顶部
 * @description 将页面容器和预览容器的滚动位置都设置为顶部
 */
function scrollToTop() {
  // 执行滚动操作的函数
  const performScroll = () => {
    // 滚动页面容器到顶部
    const pageContainer = document.getElementById('view-document-center-generate');
    if (pageContainer) {
      pageContainer.scrollTop = 0;
    }
    
    // 滚动预览容器到顶部
    const previewContainer = document.getElementById('previewContainer');
    if (previewContainer) {
      previewContainer.scrollTop = 0;
    }
    
    // 滚动操作面板内容区域到顶部
    const actionsContent = document.getElementById('actionsContent');
    if (actionsContent) {
      actionsContent.scrollTop = 0;
    }
    
    // 滚动订单信息面板内容区域到顶部
    const orderInfoContent = document.getElementById('orderInfoContent');
    if (orderInfoContent) {
      orderInfoContent.scrollTop = 0;
    }
    
    // 滚动窗口到顶部
    window.scrollTo(0, 0);
    
    // 滚动主容器（如果有）
    const mainArea = document.querySelector('.generate-main-area');
    if (mainArea) {
      mainArea.scrollTop = 0;
    }
    
    // 滚动文档主体（如果有）
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }
  };
  
  // 立即执行一次
  performScroll();
  
  // 使用 requestAnimationFrame 确保 DOM 已渲染后再次执行
  requestAnimationFrame(() => {
    performScroll();
    
    // 延迟执行，确保所有异步内容都已加载
    setTimeout(() => {
      performScroll();
    }, 100);
    
    // 再次延迟执行，确保布局已完成
    setTimeout(() => {
      performScroll();
    }, 300);
  });
}

/**
 * 初始化面板折叠功能
 */
function initPanelToggles() {
  // 订单信息面板折叠
  const toggleOrderPanel = document.getElementById('toggleOrderPanel');
  const orderInfoPanel = document.getElementById('orderInfoPanel');
  if (toggleOrderPanel && orderInfoPanel) {
    toggleOrderPanel.addEventListener('click', () => {
      orderInfoPanel.classList.toggle('collapsed');
    });
  }

  // 操作面板折叠
  const toggleActionsPanel = document.getElementById('toggleActionsPanel');
  const actionsPanel = document.getElementById('actionsPanel');
  if (toggleActionsPanel && actionsPanel) {
    toggleActionsPanel.addEventListener('click', () => {
      actionsPanel.classList.toggle('collapsed');
    });
  }

  // 自动适配切换
  const autoFitToggle = document.getElementById('autoFitToggle');
  if (autoFitToggle) {
    autoFitToggle.addEventListener('change', (e) => {
      autoFitEnabled = e.target.checked;
      if (autoFitEnabled) {
        autoFitToPage();
      } else {
        applyZoom();
      }
    });
  }
}

/**
 * 设置默认单据类型为销售确认书
 */
function setDefaultDocumentType() {
  const documentTypeGroup = document.getElementById('documentTypeGroup');
  if (documentTypeGroup) {
    // 移除所有按钮的 active 状态
    documentTypeGroup.querySelectorAll('button').forEach(b => {
      b.classList.remove('active');
    });
    
    // 找到销售确认书按钮并设置为 active
    const salesBtn = documentTypeGroup.querySelector(`button[data-type="${DOCUMENT_TYPES.SALES}"]`);
    if (salesBtn) {
      salesBtn.classList.add('active');
      console.log('[DocumentCenterGeneratePage] 默认选中销售确认书');
    } else {
      console.warn('[DocumentCenterGeneratePage] 未找到销售确认书按钮');
    }
  }
}

/**
 * 绑定事件
 */
function bindEvents() {
  // 订单选择
  const orderSelect = document.getElementById('orderSelect');
  if (orderSelect) {
    // 修复下拉框滚动时选择跳跃的问题
    // 在下拉框打开时，阻止滚轮事件传播到预览容器
    let wheelHandler = null;
    
    orderSelect.addEventListener('focus', () => {
      // 下拉框获得焦点时（打开下拉框），阻止滚轮事件传播
      wheelHandler = (e) => {
        // 检查事件目标是否在下拉框或其下拉列表中
        const target = e.target;
        const isInSelect = orderSelect.contains(target) || target === orderSelect;
        
        if (isInSelect) {
          // 阻止事件传播到预览容器
          e.stopPropagation();
        }
      };
      
      // 在捕获阶段监听，确保能拦截事件
      document.addEventListener('wheel', wheelHandler, { capture: true, passive: false });
    });
    
    orderSelect.addEventListener('blur', () => {
      // 下拉框失去焦点时（关闭下拉框），移除事件监听器
      if (wheelHandler) {
        document.removeEventListener('wheel', wheelHandler, { capture: true });
        wheelHandler = null;
      }
    });
    
    orderSelect.addEventListener('change', async (e) => {
      const orderId = e.target.value;
      if (orderId) {
        await loadOrder(orderId);
        updateOrderInfo();
        
        // 检查模板选择框是否有值
        const templateSelect = document.getElementById('templateSelect');
        const hasTemplateSelected = templateSelect && templateSelect.value && templateSelect.value !== '';
        
        // 如果没有选择模板，自动选择默认模板
        if (!hasTemplateSelected || !currentTemplate) {
          console.log('[DocumentCenterGeneratePage] 未选择模板，开始自动选择默认模板');
          // 确保模板列表已加载
          await loadTemplates();
          // 如果加载后仍然没有选择模板，则手动选择默认模板
          const templateSelectAfter = document.getElementById('templateSelect');
          const stillNoTemplate = !templateSelectAfter || !templateSelectAfter.value || templateSelectAfter.value === '';
          if (stillNoTemplate || !currentTemplate) {
            console.log('[DocumentCenterGeneratePage] 模板列表加载后仍未选择，调用selectDefaultTemplate');
            await selectDefaultTemplate();
          }
        }
        
        // 检查是否有模板，如果有才生成预览
        if (currentTemplate) {
          await generatePreview();
        } else {
          console.warn('[DocumentCenterGeneratePage] 没有可用的模板，无法生成预览');
          // 显示友好的提示信息
          const previewContainer = document.getElementById('previewContainer');
          if (previewContainer) {
            const page1El = document.getElementById('documentPreviewPage1');
            if (page1El) {
              page1El.innerHTML = `
                <div class="preview-empty-state">
                  <div class="empty-icon">📋</div>
                  <p class="empty-text">请先选择模板以生成单据</p>
                  <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">当前单据类型没有可用的模板</p>
                </div>
              `;
            }
          }
        }
        // 订单选择后，滚动预览窗口到顶部
        setTimeout(() => {
          scrollToTop();
        }, 100);
      } else {
        currentOrder = null;
        updateOrderInfo();
        clearPreview();
      }
    });
  }

  // 模板选择
  const templateSelect = document.getElementById('templateSelect');
  if (templateSelect) {
    // 修复下拉框滚动时选择跳跃的问题（与订单选择框相同）
    let templateWheelHandler = null;
    
    templateSelect.addEventListener('focus', () => {
      // 下拉框获得焦点时（打开下拉框），阻止滚轮事件传播
      templateWheelHandler = (e) => {
        // 检查事件目标是否在下拉框或其下拉列表中
        const target = e.target;
        const isInSelect = templateSelect.contains(target) || target === templateSelect;
        
        if (isInSelect) {
          // 阻止事件传播到预览容器
          e.stopPropagation();
        }
      };
      
      // 在捕获阶段监听，确保能拦截事件
      document.addEventListener('wheel', templateWheelHandler, { capture: true, passive: false });
    });
    
    templateSelect.addEventListener('blur', () => {
      // 下拉框失去焦点时（关闭下拉框），移除事件监听器
      if (templateWheelHandler) {
        document.removeEventListener('wheel', templateWheelHandler, { capture: true });
        templateWheelHandler = null;
      }
    });
    
    templateSelect.addEventListener('change', async (e) => {
      const templateId = e.target.value;
      if (templateId) {
        await loadTemplate(templateId);
        updateTemplateInfo();
        // 检查模板是否加载成功
        if (currentTemplate) {
          await generatePreview();
          // 模板选择后，滚动预览窗口到顶部
          setTimeout(() => {
            scrollToTop();
          }, 100);
        } else {
          console.warn('[DocumentCenterGeneratePage] 模板加载失败，无法生成预览');
          clearPreview();
        }
      } else {
        currentTemplate = null;
        updateTemplateInfo();
        clearPreview();
      }
    });
  }

  // 单据类型切换
  const documentTypeGroup = document.getElementById('documentTypeGroup');
  if (documentTypeGroup) {
    documentTypeGroup.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-type]');
      if (!btn) return;

      // 更新按钮状态
      documentTypeGroup.querySelectorAll('button').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      // 更新单据类型
      const newDocumentType = btn.dataset.type;
      
      // 如果单据类型发生变化，清空当前模板
      if (newDocumentType !== currentDocumentType) {
        currentTemplate = null;
        const templateSelect = document.getElementById('templateSelect');
        if (templateSelect) {
          templateSelect.value = '';
        }
        updateTemplateInfo();
      }
      
      currentDocumentType = newDocumentType;
      
      // 重新加载模板列表
      await loadTemplates();
      
      // 自动选择默认模板
      await selectDefaultTemplate();
      
      // 如果有订单和模板，重新生成预览
      if (currentOrder && currentTemplate) {
        await generatePreview();
      } else if (currentOrder && !currentTemplate) {
        // 有订单但没有模板，显示提示
        console.warn('[DocumentCenterGeneratePage] 单据类型切换后没有可用的模板');
        const page1El = document.getElementById('documentPreviewPage1');
        if (page1El) {
          page1El.innerHTML = `
            <div class="preview-empty-state">
              <div class="empty-icon">📋</div>
              <p class="empty-text">请先选择模板以生成单据</p>
              <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">当前单据类型没有可用的模板</p>
            </div>
          `;
        }
      }
    });
  }

  // 导出按钮
  const btnExportPDF = document.getElementById('btnExportPDF');
  if (btnExportPDF) {
    btnExportPDF.addEventListener('click', async () => {
      await exportPDF();
    });
  }

  const btnExportWord = document.getElementById('btnExportWord');
  if (btnExportWord) {
    btnExportWord.addEventListener('click', async () => {
      await exportWord();
    });
  }

  const btnExportExcel = document.getElementById('btnExportExcel');
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', async () => {
      await exportExcel();
    });
  }

  // 快速导出按钮
  const quickExportBtns = document.querySelectorAll('.quick-export-btn');
  quickExportBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const format = btn.dataset.format;
      if (format === 'pdf') {
        await exportPDF();
      } else if (format === 'word') {
        await exportWord();
      } else if (format === 'excel') {
        await exportExcel();
      }
    });
  });
}

/**
 * 调整预览居中显示
 * 优化：确保缩放后内容始终居中显示
 */
function adjustPreviewCenter() {
  // 使用双重requestAnimationFrame确保DOM更新完成
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const previewContainer = document.getElementById('previewContainer') || document.querySelector('#previewContainer');
      const zoomWrapper = document.getElementById('previewZoomWrapper') || document.querySelector('.preview-zoom-wrapper');
      
      if (!previewContainer || !zoomWrapper) return;
      
      const containerRect = previewContainer.getBoundingClientRect();
      const wrapperRect = zoomWrapper.getBoundingClientRect();
      
      // 获取容器实际可用尺寸（考虑padding）
      const containerStyle = window.getComputedStyle(previewContainer);
      const paddingTop = parseFloat(containerStyle.paddingTop) || 0;
      const paddingBottom = parseFloat(containerStyle.paddingBottom) || 0;
      const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
      
      const containerHeight = previewContainer.clientHeight;
      const containerWidth = previewContainer.clientWidth;
      const availableHeight = containerHeight - paddingTop - paddingBottom;
      const availableWidth = containerWidth - paddingLeft - paddingRight;
      
      // 获取缩放后的内容尺寸
      const wrapperHeight = wrapperRect.height;
      const wrapperWidth = wrapperRect.width;
      
      // 垂直居中
      if (wrapperHeight <= availableHeight) {
        // 内容小于容器，顶部对齐
        previewContainer.classList.remove('content-overflow');
        previewContainer.scrollTop = 0;
      } else {
        // 内容大于容器，居中显示
        previewContainer.classList.add('content-overflow');
        const maxScrollTop = previewContainer.scrollHeight - previewContainer.clientHeight;
        const scrollToCenter = Math.max(0, maxScrollTop / 2);
        previewContainer.scrollTop = scrollToCenter;
      }
      
      // 水平居中
      if (wrapperWidth <= availableWidth) {
        // 内容小于容器，左对齐
        previewContainer.scrollLeft = 0;
      } else {
        // 内容大于容器，居中显示
        const maxScrollLeft = previewContainer.scrollWidth - previewContainer.clientWidth;
        const scrollToCenterLeft = Math.max(0, maxScrollLeft / 2);
        previewContainer.scrollLeft = scrollToCenterLeft;
      }
    });
  });
}

/**
 * 初始化统一 PP 预览器和缩放控制器
 * 使用 PPPreviewer 的 view 模式（单据生成页面）
 */
function initUnifiedPreview() {
  // 初始化 PP 预览器（view 模式）
  previewViewer = new PPPreviewer('previewContainer', {
    mode: 'view',  // 单据生成页面使用 view 模式
    showMarginMarks: true,
    multiPage: true,
    showBlockBorders: false,  // view 模式不显示区块边框
    onZoomChange: (level) => {
      if (zoomController) {
        zoomController.setZoomLevel(level);
      }
    }
  });

  // 初始化缩放控制器
  zoomController = new ZoomController('zoomControls', {
    onZoomIn: () => {
      if (previewViewer) {
        previewViewer.zoomIn();
      }
    },
    onZoomOut: () => {
      if (previewViewer) {
        previewViewer.zoomOut();
      }
    },
    onFitToPage: () => {
      if (previewViewer) {
        previewViewer.fitToPage();
      }
    },
    onZoomChange: (level) => {
      // 缩放级别变化时的回调
      console.log('[DocumentCenterGeneratePage] 缩放级别变化:', level);
    }
  });

  // 初始适配 - 默认使用100%缩放
  setTimeout(() => {
    if (previewViewer) {
      previewViewer.setZoom(ZOOM_CONFIG.DEFAULT);
    }
  }, 100);

  // 导出供外部调用（保持向后兼容）
  window.applyZoom = () => {
    if (previewViewer) {
      previewViewer.applyZoom();
    }
  };
  
  window.autoFitToPage = () => {
    if (previewViewer) {
      previewViewer.fitToPage();
    }
  };

  console.log('[DocumentCenterGeneratePage] PP预览器（view模式）初始化完成');
}

/**
 * 加载订单列表
 * @description 从API加载订单列表并填充到选择框中
 * @returns {Promise<void>}
 * @throws {Error} 当API调用失败时抛出错误
 */
async function loadOrders() {
  const orderSelect = document.getElementById('orderSelect');
  if (!orderSelect) return;

  try {
    // 显示加载状态
    showLoadingState(orderSelect, '加载中...');

    const orders = await window.ApiService?.orders?.list() || [];

    // 清空选项
    orderSelect.innerHTML = '<option value="">请选择订单</option>';

    // 添加订单选项
    if (orders.length === 0) {
      orderSelect.innerHTML = '<option value="">暂无订单</option>';
    } else {
      orders.forEach(order => {
        const option = document.createElement('option');
        option.value = order.id;
        const contractNo = order.contractNo || '无合同号';
        const customerName = order.customerName || '无客户';
        option.textContent = `${contractNo} - ${customerName}`;
        orderSelect.appendChild(option);
      });
    }
    
    // 清除保存的原始HTML，避免restoreElementState覆盖新内容
    delete orderSelect._originalHTML;
    // 恢复disabled状态
    orderSelect.disabled = false;
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 加载订单列表失败:', error);
    showFriendlyError(error, 'loadOrders');
    orderSelect.innerHTML = '<option value="">加载失败</option>';
    // 清除保存的原始HTML
    delete orderSelect._originalHTML;
    // 恢复disabled状态
    orderSelect.disabled = false;
  }
}

/**
 * 加载订单详情
 * @param {string|number} orderId - 订单ID
 * @returns {Promise<void>}
 * @throws {Error} 当订单不存在或加载失败时抛出错误
 */
async function loadOrder(orderId) {
  try {
    const order = await window.ApiService?.orders?.get?.(orderId);
    if (!order) {
      window.NotificationSystem?.toast('订单不存在', 'error');
      return;
    }
    currentOrder = order;
    updateOrderInfo();
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 加载订单失败:', error);
    showFriendlyError(error, 'loadOrder');
  }
}

/**
 * 更新订单信息显示
 */
function updateOrderInfo() {
  const orderInfoDetails = document.getElementById('orderInfoDetails');
  const orderInfoEmpty = document.getElementById('orderInfoEmpty');
  
  if (!orderInfoDetails || !orderInfoEmpty) return;

  if (!currentOrder) {
    orderInfoDetails.style.display = 'none';
    orderInfoEmpty.style.display = 'block';
    return;
  }

  // 获取客户信息
  let customerName = '未设置';
  if (currentOrder.customerId) {
    // 这里可以异步加载客户信息，暂时使用订单中的客户名称
    customerName = currentOrder.customerName || '未设置';
  }

  // 显示订单详细信息，隐藏空状态
  orderInfoDetails.style.display = 'block';
  orderInfoEmpty.style.display = 'none';

  orderInfoDetails.innerHTML = `
    <div class="order-info-content">
      <div class="info-card">
        <h4 class="info-card-title">基本信息</h4>
        <div class="info-row">
          <span class="info-label">合同号</span>
          <span class="info-value">${currentOrder.contractNo || '未设置'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">客户</span>
          <span class="info-value">${customerName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">订单日期</span>
          <span class="info-value">${currentOrder.orderDate ? new Date(currentOrder.orderDate).toLocaleDateString() : '未设置'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">交货日期</span>
          <span class="info-value">${currentOrder.deliveryDate ? new Date(currentOrder.deliveryDate).toLocaleDateString() : '未设置'}</span>
        </div>
      </div>
      <div class="info-card">
        <h4 class="info-card-title">金额信息</h4>
        <div class="info-row">
          <span class="info-label">总金额</span>
          <span class="info-value">${currentOrder.totalAmount ? currentOrder.totalAmount.toLocaleString() : '0'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">币种</span>
          <span class="info-value">${currentOrder.currency || 'USD'}</span>
        </div>
      </div>
      ${currentOrder.items && currentOrder.items.length > 0 ? `
      <div class="info-card">
        <h4 class="info-card-title">产品信息</h4>
        <div class="info-row">
          <span class="info-label">产品数量</span>
          <span class="info-value">${currentOrder.items.length} 项</span>
        </div>
        <div class="info-row">
          <span class="info-label">总数量</span>
          <span class="info-value">${currentOrder.items.reduce((sum, item) => sum + (item.quantity || 0), 0)}</span>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

/**
 * 加载模板列表
 * @description 根据当前单据类型加载对应的模板列表
 * @returns {Promise<void>}
 * @throws {Error} 当API调用失败时抛出错误
 */
async function loadTemplates() {
  const templateSelect = document.getElementById('templateSelect');
  if (!templateSelect) return;

  try {
    // 显示加载状态
    showLoadingState(templateSelect, '加载中...');

    const templates = await DocumentCenterService.listTemplates(currentDocumentType);

    // 清空选项
    templateSelect.innerHTML = '<option value="">请选择模板</option>';

    // 添加模板选项
    if (templates.length === 0) {
      templateSelect.innerHTML = '<option value="">暂无模板</option>';
      currentTemplate = null;
    } else {
      templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        if (template.isDefault) {
          option.textContent += ' (默认)';
        }
        templateSelect.appendChild(option);
      });

      // 如果没有当前模板，尝试选择默认模板
      if (!currentTemplate && templates.length > 0) {
        const defaultTemplate = templates.find(t => t.isDefault) || templates[0];
        if (defaultTemplate) {
          templateSelect.value = defaultTemplate.id;
          currentTemplate = defaultTemplate;
          // 加载模板详情并更新显示
          await loadTemplate(defaultTemplate.id);
          updateTemplateInfo();
        }
      }
    }
    
    // 清除保存的原始HTML，避免restoreElementState覆盖新内容
    delete templateSelect._originalHTML;
    // 恢复disabled状态
    templateSelect.disabled = false;
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 加载模板列表失败:', error);
    showFriendlyError(error, 'loadTemplates');
    templateSelect.innerHTML = '<option value="">加载失败</option>';
    currentTemplate = null;
    // 清除保存的原始HTML
    delete templateSelect._originalHTML;
    // 恢复disabled状态
    templateSelect.disabled = false;
  }
}

/**
 * 自动选择默认模板
 */
async function selectDefaultTemplate() {
  const templateSelect = document.getElementById('templateSelect');
  if (!templateSelect) {
    console.warn('[DocumentCenterGeneratePage] 模板选择框不存在');
    return;
  }

  try {
    // 先检查模板选择框中是否已经有模板被选中
    const currentValue = templateSelect.value;
    if (currentValue && currentValue !== '' && currentTemplate && currentTemplate.id === parseInt(currentValue)) {
      // 已经选择了模板，不需要再选择
      console.log('[DocumentCenterGeneratePage] 模板已选择，无需重新选择');
      return;
    }

    console.log('[DocumentCenterGeneratePage] 开始获取默认模板，单据类型:', currentDocumentType);
    // 获取默认模板
    const defaultTemplate = await DocumentCenterService.getDefaultTemplate(currentDocumentType);
    
    if (defaultTemplate) {
      console.log('[DocumentCenterGeneratePage] 找到默认模板:', defaultTemplate.name, 'ID:', defaultTemplate.id);
      // 设置模板选择框的值
      templateSelect.value = defaultTemplate.id;
      // 加载模板详情
      await loadTemplate(defaultTemplate.id);
      updateTemplateInfo();
      console.log('[DocumentCenterGeneratePage] 已自动选择默认模板:', defaultTemplate.name);
    } else {
      console.log('[DocumentCenterGeneratePage] 未找到默认模板，尝试选择第一个模板');
      // 如果没有默认模板，尝试从模板列表中选择第一个
      const templates = await DocumentCenterService.listTemplates(currentDocumentType);
      if (templates.length > 0) {
        const firstTemplate = templates[0];
        console.log('[DocumentCenterGeneratePage] 选择第一个模板:', firstTemplate.name, 'ID:', firstTemplate.id);
        templateSelect.value = firstTemplate.id;
        await loadTemplate(firstTemplate.id);
        updateTemplateInfo();
        console.log('[DocumentCenterGeneratePage] 已选择第一个模板:', firstTemplate.name);
      } else {
        console.warn('[DocumentCenterGeneratePage] 没有可用的模板');
      }
    }
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 自动选择默认模板失败:', error);
    // 不显示错误提示，因为这是自动操作
  }
}

/**
 * 转换模板中的旧格式循环语法为新格式
 * @param {Object} template - 模板对象
 * @returns {boolean} 是否进行了转换
 */
function convertTemplateLoopFormat(template) {
  let converted = false;
  let html = '';
  
  // 获取模板HTML内容
  if (template.html !== undefined) {
    html = template.html || '';
  } else if (template.config?.html !== undefined) {
    html = template.config.html || '';
  } else if (template.config?.canvas?.components) {
    html = template.config.canvas.components || '';
  }
  
  // 检查是否包含旧格式（使用正则表达式匹配，支持各种空格变体）
  const oldFormatPattern = /\{\{#each\s+items\s*\}\}/g;
  const hasOldFormat = oldFormatPattern.test(html);
  oldFormatPattern.lastIndex = 0; // 重置正则表达式
  
  const hasNewFormat = /\{\{#each\s+order\.items\s*\}\}/.test(html);
  
  if (hasOldFormat && !hasNewFormat) {
    console.log('[DocumentCenterGeneratePage] 检测到旧格式循环语法，开始转换...');
    
    // 转换旧格式为新格式（支持各种空格变体）
    const newHtml = html.replace(/\{\{#each\s+items\s*\}\}/g, '{{#each order.items}}');
    
    // 更新模板对象
    if (template.html !== undefined) {
      template.html = newHtml;
    } else if (template.config?.html !== undefined) {
      template.config.html = newHtml;
    } else if (template.config?.canvas?.components) {
      template.config.canvas.components = newHtml;
    }
    
    converted = true;
    console.log('[DocumentCenterGeneratePage] ✅ 模板循环格式已转换');
  }
  
  return converted;
}

/**
 * 加载模板详情
 */
/**
 * 加载模板详情（使用统一的模板服务）
 */
async function loadTemplate(templateId) {
  try {
    // 使用统一的模板服务加载模板
    const template = await TemplateService.loadTemplate(templateId, {
      autoConvert: true,  // 自动转换旧格式
      autoSave: true,      // 转换后自动保存
      validate: true       // 验证模板
    });
    
    currentTemplate = template;
    updateTemplateInfo();
    
    // 如果模板被转换，显示提示（异步，不阻塞）
    TemplateService.validateTemplate(template).then(validation => {
      if (validation && validation.warnings && validation.warnings.length > 0) {
        // 只显示错误级别的警告（未知命名空间等），忽略字段级别的警告
        const importantWarnings = validation.warnings.filter(w => 
          w.type === 'UNKNOWN_NAMESPACE' || 
          w.type === 'UNCLOSED_LOOP' || 
          w.type === 'UNCLOSED_CONDITION' ||
          w.type === 'UNCLOSED_VARIABLE'
        );
        if (importantWarnings.length > 0) {
          console.warn('[DocumentCenterGeneratePage] 模板有重要警告:', importantWarnings);
        }
        // 其他警告（如未知字段）不输出，避免噪音
      }
    }).catch(error => {
      console.warn('[DocumentCenterGeneratePage] 模板验证失败（不影响使用）:', error);
    });
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 加载模板失败:', error);
    showFriendlyError(error, 'loadTemplate');
    
    // 显示友好的错误提示
    if (window.NotificationSystem) {
      const errorMessage = error.message || '加载模板失败';
      window.NotificationSystem.toast(errorMessage, 'error');
    }
  }
}

/**
 * 更新模板信息显示
 */
function updateTemplateInfo() {
  const templateInfo = document.getElementById('templateInfo');
  if (!templateInfo) return;

  if (!currentTemplate) {
    templateInfo.innerHTML = `
      <div class="info-empty-small">
        <p>未选择模板</p>
      </div>
    `;
    return;
  }

  templateInfo.innerHTML = `
    <div class="template-info-item">
      <span class="template-info-label">名称:</span>
      <span>${currentTemplate.name || '未命名'}</span>
    </div>
    <div class="template-info-item">
      <span class="template-info-label">类型:</span>
      <span>${DOCUMENT_TYPE_NAMES[currentTemplate.type] || currentTemplate.type || '未知'}</span>
    </div>
    ${currentTemplate.description ? `
    <div class="template-info-item">
      <span class="template-info-label">描述:</span>
      <span>${currentTemplate.description}</span>
    </div>
    ` : ''}
    <div class="template-info-item">
      <span class="template-info-label">更新时间:</span>
      <span>${currentTemplate.updatedAt ? new Date(currentTemplate.updatedAt).toLocaleString() : '未知'}</span>
    </div>
  `;
  
  // 更新模板状态
  updateTemplateStatus();
}

/**
 * 更新模板验证状态指示器
 */
async function updateTemplateStatus() {
  const templateStatus = document.getElementById('templateStatus');
  if (!templateStatus || !currentTemplate) return;
  
  templateStatus.style.display = 'block';
  
  // 验证模板
  try {
    const validation = await TemplateService.validateTemplate(currentTemplate);
    const validationStatus = document.getElementById('templateValidationStatus');
    if (validationStatus) {
      if (validation.errors && validation.errors.length > 0) {
        validationStatus.innerHTML = `
          <span class="status-icon" style="color: #ef4444;">❌</span>
          <span class="status-text" style="color: #ef4444;">有 ${validation.errors.length} 个错误</span>
        `;
      } else if (validation.warnings && validation.warnings.length > 0) {
        const importantWarnings = validation.warnings.filter(w => 
          w.type === 'UNKNOWN_NAMESPACE' || 
          w.type === 'UNCLOSED_LOOP' || 
          w.type === 'UNCLOSED_CONDITION'
        );
        if (importantWarnings.length > 0) {
          validationStatus.innerHTML = `
            <span class="status-icon" style="color: #f59e0b;">⚠️</span>
            <span class="status-text" style="color: #f59e0b;">有 ${importantWarnings.length} 个警告</span>
          `;
        } else {
          validationStatus.innerHTML = `
            <span class="status-icon" style="color: #10b981;">✓</span>
            <span class="status-text" style="color: #10b981;">验证通过</span>
          `;
        }
      } else {
        validationStatus.innerHTML = `
          <span class="status-icon" style="color: #10b981;">✓</span>
          <span class="status-text" style="color: #10b981;">验证通过</span>
        `;
      }
    }
  } catch (error) {
    console.warn('[DocumentCenterGeneratePage] 验证模板状态失败:', error);
    const validationStatus = document.getElementById('templateValidationStatus');
    if (validationStatus) {
      validationStatus.innerHTML = `
        <span class="status-icon" style="color: #64748b;">⏳</span>
        <span class="status-text" style="color: #64748b;">验证中...</span>
      `;
    }
  }
}


/**
 * 将内容分割成两页（使用DOM操作，确保表格结构完整性）
 * @param {HTMLElement} container - 包含内容的容器
 * @param {number} pageContentHeight - 单页可用高度（像素）
 * @returns {{page1Elements: Array<HTMLElement>, page2Elements: Array<HTMLElement>}} 包含第一页和第二页元素的对象
 */
function splitContentIntoPages(container, pageContentHeight) {
  const page1Elements = [];
  const page2Elements = [];
  let currentHeight = 0;
  let isPage1 = true;
  
  // 遍历所有直接子元素
  Array.from(container.children).forEach((child) => {
    // 克隆元素（避免从原容器中移除）
    const clonedChild = child.cloneNode(true);
    const childHeight = child.offsetHeight || 0;
    
    // 检查是否是表格元素
    const isTable = clonedChild.tagName === 'TABLE' || clonedChild.querySelector('table');
    
    if (isTable) {
      // 对于表格，确保完整性（包括tfoot）
      if (isPage1 && currentHeight + childHeight > pageContentHeight && currentHeight > 0) {
        // 如果当前页已有内容，表格放到第二页
        isPage1 = false;
        currentHeight = 0;
      }
      
      if (isPage1) {
        page1Elements.push(clonedChild);
        currentHeight += childHeight;
      } else {
        page2Elements.push(clonedChild);
      }
    } else {
      // 对于非表格元素，按高度分页
      if (isPage1 && currentHeight + childHeight > pageContentHeight && currentHeight > 0) {
        // 切换到第二页
        isPage1 = false;
        currentHeight = 0;
      }
      
      if (isPage1) {
        page1Elements.push(clonedChild);
        currentHeight += childHeight;
      } else {
        page2Elements.push(clonedChild);
      }
    }
  });
  
  return { page1Elements, page2Elements };
}

/**
 * 加载模板结构（不填充数据）
 * @description 先加载模板的HTML结构，保留所有样式和格式，但不填充数据
 * @returns {Promise<string>} 返回模板的HTML结构字符串
 */
async function loadTemplateStructure() {
  if (!currentTemplate) {
    throw new Error('模板未选择');
  }

  console.log('[DocumentCenterGeneratePage] 开始加载模板结构');

  // 获取模板的原始HTML（不填充数据）
  let html = '';
  let css = '';
  let margin = { top: 20, bottom: 20, left: 20, right: 20 };

  // 检查是否是新格式（直接从JSON文件导入的格式）
  if (currentTemplate.html !== undefined) {
    html = currentTemplate.html || '';
    css = currentTemplate.styles || '';
    if (currentTemplate.margin) {
      margin = currentTemplate.margin;
    }
  } else if (currentTemplate.config) {
    if (currentTemplate.config.html !== undefined) {
      html = currentTemplate.config.html || '';
      css = currentTemplate.config.styles || '';
      margin = currentTemplate.config.margin || { top: 20, bottom: 20, left: 20, right: 20 };
    } else if (currentTemplate.config.canvas?.components) {
      html = currentTemplate.config.canvas.components || '';
      css = currentTemplate.config.canvas?.styles || '';
      margin = currentTemplate.config?.margin || { top: 20, bottom: 20, left: 20, right: 20 };
    }
  }

  // 替换样式变量 {{sv.xxx}}
  html = TemplateRenderer.replaceStyleVariables(html);

  // 包装完整HTML文档（不填充数据，保留所有变量占位符）
  const fullHtml = TemplateRenderer.wrapHtml(html, css, margin);

  console.log('[DocumentCenterGeneratePage] 模板结构加载完成，HTML长度:', fullHtml.length);
  return fullHtml;
}

/**
 * 在模板结构上填充数据
 * @description 在已加载的模板结构基础上填充订单数据
 * @param {string} templateHtml - 模板的HTML结构
 * @param {Object} data - 数据对象 { order, customer, company }
 * @returns {string} 填充数据后的HTML字符串
 */
function fillTemplateWithData(templateHtml, data) {
  console.log('[DocumentCenterGeneratePage] 开始填充模板数据');

  // 从完整HTML文档中提取body内容
  // 使用正则表达式提取body标签之间的内容（更可靠）
  let html = '';
  
  // 首先尝试使用正则表达式提取body内容
  const bodyMatch = templateHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    html = bodyMatch[1];
    console.log('[DocumentCenterGeneratePage] 使用正则表达式成功提取body内容，长度:', html.length);
  } else {
    // 如果正则表达式失败，尝试使用 DOMParser
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(templateHtml, 'text/html');
      const bodyElement = doc.querySelector('body');
      
      if (bodyElement && bodyElement.innerHTML) {
        html = bodyElement.innerHTML;
        console.log('[DocumentCenterGeneratePage] 使用DOMParser成功提取body内容，长度:', html.length);
      } else {
        throw new Error('DOMParser未找到body元素');
      }
    } catch (error) {
      console.warn('[DocumentCenterGeneratePage] DOMParser解析失败:', error);
      throw new Error('模板HTML结构无效：无法提取body内容。请确保模板包含有效的<body>标签。');
    }
  }

  if (!html || html.trim().length === 0) {
    throw new Error('模板HTML结构无效：提取的body内容为空');
  }

  // 执行计算逻辑
  const calculations = currentTemplate?.calculations || 
                      currentTemplate?.config?.calculations || [];
  const calculatedValues = TemplateRenderer.executeCalculations(calculations, data);

  // 执行条件渲染
  const conditions = currentTemplate?.conditions || 
                    currentTemplate?.config?.conditions || {};
  html = TemplateRenderer.processConditions(html, conditions, data);

  // 数据绑定（包含计算值）
  const dataWithCalculations = {
    ...data,
    calc: calculatedValues,
    docType: currentDocumentType // 传递单据类型，用于特殊规则判断
  };
  html = DataBinder.bind(html, dataWithCalculations);

  // 替换计算变量 {{calc.xxx}}
  html = TemplateRenderer.replaceCalculationVariables(html, calculatedValues);

  // 最终验证：确保所有产品表格都有tfoot，且tfoot中的变量已替换
  console.log('[DocumentCenterGeneratePage] 开始最终验证tfoot...');
  const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
  if (tableMatches) {
    tableMatches.forEach((tableHtml, index) => {
      const hasThead = tableHtml.includes('<thead');
      const hasTbody = tableHtml.includes('<tbody');
      const hasTfoot = tableHtml.includes('<tfoot');

      // 只检查产品表格（有thead和tbody的）
      if (hasThead && hasTbody) {
        console.log(`[DocumentCenterGeneratePage] 检查table ${index + 1}（产品表格）...`);
        
        if (!hasTfoot) {
          console.error(`[DocumentCenterGeneratePage] ❌ table ${index + 1}（产品表格）缺少tfoot！`);
          console.error(`[DocumentCenterGeneratePage] table ${index + 1} 内容预览:`, tableHtml.substring(0, 500));
        } else {
          const tfootMatch = tableHtml.match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/i);
          if (tfootMatch) {
            const tfootContent = tfootMatch[1];
            const hasUnreplacedVars = tfootContent.includes('{{');
            if (hasUnreplacedVars) {
              const unreplacedVars = tfootContent.match(/\{\{[^}]+\}\}/g);
              console.error(`[DocumentCenterGeneratePage] ❌ table ${index + 1} 的tfoot中仍有未替换的变量:`, unreplacedVars);
              console.error(`[DocumentCenterGeneratePage] tfoot内容:`, tfootContent.substring(0, 300));
            } else {
              console.log(`[DocumentCenterGeneratePage] ✅ table ${index + 1} 的tfoot验证通过`);
            }
          }
        }
      }
    });
  }

  // 最终验证：确保 tfoot 中的 br 标签和样式被正确保留
  const tfootMatches = html.match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/gi);
  if (tfootMatches) {
    tfootMatches.forEach((tfootMatch, index) => {
      if (tfootMatch.includes('<br') || tfootMatch.includes('<br/>')) {
        console.log(`[DocumentCenterGeneratePage] ✅ tfoot[${index}] 包含br标签`);
        
        if (!tfootMatch.includes('white-space: normal') && !tfootMatch.includes('white-space:normal')) {
          console.warn(`[DocumentCenterGeneratePage] ⚠️ tfoot[${index}] 包含br但缺少white-space: normal，尝试修复`);
          const fixedTfoot = tfootMatch.replace(
            /(<td[^>]*style=")([^"]*)(")/g,
            (match, styleStart, styleContent, styleEnd) => {
              if (match.includes('总计 TOTAL') || match.includes('TOTAL') || match.includes('<br')) {
                if (!styleContent.includes('white-space')) {
                  return styleStart + styleContent + ' white-space: normal !important; word-wrap: break-word !important;' + styleEnd;
                } else if (styleContent.includes('white-space:nowrap')) {
                  return styleStart + styleContent.replace(/white-space:\s*nowrap/gi, 'white-space: normal !important') + ' word-wrap: break-word !important;' + styleEnd;
                }
              }
              return match;
            }
          );
          html = html.replace(tfootMatch, fixedTfoot);
          console.log(`[DocumentCenterGeneratePage] ✅ 修复后的tfoot[${index}]:`, fixedTfoot.substring(0, 200));
        }
      }
    });
  }

  // 重新包装为完整HTML文档
  const css = currentTemplate?.styles || 
              currentTemplate?.config?.styles || 
              currentTemplate?.config?.canvas?.styles || '';
  const margin = currentTemplate?.margin || 
                 currentTemplate?.config?.margin || 
                 { top: 20, bottom: 20, left: 20, right: 20 };
  
  const fullHtml = TemplateRenderer.wrapHtml(html, css, margin);

  console.log('[DocumentCenterGeneratePage] 模板数据填充完成');
  return fullHtml;
}

/**
 * 生成预览（使用优化后的预览生成器）
 * @description 根据当前订单和模板生成单据预览，支持分页显示
 * 使用新的预览生成器模块，提供更好的性能、错误处理和进度反馈
 * @returns {Promise<void>}
 * @throws {Error} 当订单或模板未选择时抛出错误
 */
async function generatePreview() {
  if (!currentOrder || !currentTemplate) {
    console.warn('[DocumentCenterGeneratePage] 订单或模板未选择');
    return;
  }

  try {
    // 准备数据
    let customer = null;
    if (currentOrder.customerId) {
      customer = await window.ApiService?.customers?.get?.(currentOrder.customerId) || null;
    }
    
    let company = {};
    company = await window.ApiService?.company?.get?.() || {};
    
    const data = TemplateService.prepareData(currentOrder, customer, company);
    
    // 渲染模板HTML
    const html = await TemplateService.renderTemplate(currentTemplate, data, {
      useNewEngine: true
    });

    // 获取页边距和样式设置
    let margin = DEFAULT_MARGIN;
    if (currentTemplate?.config?.pageSettings?.margin) {
      margin = currentTemplate.config.pageSettings.margin;
    } else if (currentTemplate?.config?.margin) {
      margin = currentTemplate.config.margin;
    } else if (currentTemplate?.margin) {
      margin = currentTemplate.margin;
    }

    const pageSettings = currentTemplate?.config?.pageSettings || currentTemplate?.pageSettings || {};
    const globalStyles = currentTemplate?.config?.globalStyles || currentTemplate?.globalStyles || {};

    // 使用 PP 预览器渲染（view 模式）
    if (previewViewer) {
      // 从完整HTML中提取body内容
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const bodyContent = doc.body ? doc.body.innerHTML : html;
      
      // PPPreviewer.render(htmlOrTemplate, data, options)
      // 在 view 模式下，HTML 已经包含渲染后的数据，所以 data 参数传 null
      previewViewer.render(bodyContent, null, {
        margin,
        pageSettings,
        globalStyles
      });
    } else {
      // 如果预览组件未初始化，使用旧的预览生成器
      await generatePreviewNew({
        order: currentOrder,
        template: currentTemplate,
        onProgress: (progress, message) => {
          console.log(`[DocumentCenterGeneratePage] ${message} (${progress}%)`);
        }
      });
    }
    
    // 预览生成后，应用缩放并滚动到顶部
    requestAnimationFrame(() => {
      if (previewViewer) {
        previewViewer.fitToPage();
      }
      scrollToTop();
    });
    
    // 延迟再次执行，确保内容完全渲染后滚动到顶部
    setTimeout(() => {
      scrollToTop();
    }, 200);
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 生成预览失败:', error);
    showFriendlyError(error, 'generatePreview');
    clearPreview();
  }
}

/**
 * 生成预览（旧版本实现，保留作为备用）
 * @description 根据当前订单和模板生成单据预览，支持分页显示
 * 重构后的逻辑：先加载模板结构，再填充数据，确保预览窗口严格按照模板格式显示
 * @deprecated 已使用新的预览生成器，此函数保留作为备用
 * @returns {Promise<void>}
 * @throws {Error} 当订单或模板未选择时抛出错误
 */
async function generatePreviewOld() {
  // 数据验证
  const validation = DocumentCenterValidator.validatePreviewParams({
    order: currentOrder,
    template: currentTemplate
  });

  if (!validation.valid) {
    showFriendlyError(validation.errors.join('；'), 'generatePreview');
    clearPreview();
    return;
  }

  // 显示加载状态
  const page1El = document.getElementById('documentPreviewPage1');
  if (page1El) {
    page1El.innerHTML = `
      <div class="preview-empty-state">
        <div class="empty-icon">⏳</div>
        <p class="empty-text">正在加载模板...</p>
      </div>
    `;
  }
  const page2El = document.getElementById('documentPreviewPage2');
  if (page2El) {
    page2El.innerHTML = '';
    page2El.style.display = 'none';
  }

  try {
    // 第一步：获取数据
    console.log('[DocumentCenterGeneratePage] 步骤1: 获取订单、客户、公司数据');
    let customer = null;
    if (currentOrder.customerId) {
      try {
        customer = await window.ApiService?.customers?.get?.(currentOrder.customerId);
      } catch (err) {
        console.warn('[DocumentCenterGeneratePage] 加载客户数据失败:', err);
      }
    }

    let company = {};
    try {
      company = await window.ApiService?.company?.get?.() || {};
      console.log('[DocumentCenterGeneratePage] 公司数据加载完成:', {
        hasCompany: !!company,
        companyNameEN: company?.companyNameEN || '(空)',
        companyAddressEN: company?.companyAddressEN || '(空)',
        companyTel: company?.companyTel || '(空)',
        companyFax: company?.companyFax || '(空)',
        allKeys: Object.keys(company || {})
      });
    } catch (err) {
      console.warn('[DocumentCenterGeneratePage] 加载公司数据失败:', err);
    }

    // 准备数据
    const data = TemplateService.prepareData(currentOrder, customer, company);
    console.log('[DocumentCenterGeneratePage] 准备的数据对象:', {
      hasOrder: !!data.order,
      hasCustomer: !!data.customer,
      hasCompany: !!data.company,
      companyKeys: Object.keys(data.company || {}),
      companyNameEN: data.company?.companyNameEN || '(空)',
      companyAddressEN: data.company?.companyAddressEN || '(空)'
    });

    // 更新加载状态
    if (page1El) {
      page1El.innerHTML = `
        <div class="preview-empty-state">
          <div class="empty-icon">⏳</div>
          <p class="empty-text">正在渲染模板...</p>
        </div>
      `;
    }

    // 第二步：使用统一的模板服务渲染模板
    console.log('[DocumentCenterGeneratePage] 步骤2: 渲染模板', {
      templateName: currentTemplate?.name,
      templateId: currentTemplate?.id,
      hasOrder: !!currentOrder,
      hasCustomer: !!customer,
      hasCompany: !!company
    });
    
    const fullHtml = await TemplateService.renderTemplate(currentTemplate, data, {
      useNewEngine: true  // 使用新引擎（DataBinderV2）
    });
    
    console.log('[DocumentCenterGeneratePage] 模板渲染完成，HTML长度:', fullHtml?.length || 0);
    
    // 第四步：渲染到预览窗口
    console.log('[DocumentCenterGeneratePage] 步骤4: 渲染到预览窗口');
    
    // 从完整HTML文档中提取body内容
    const tempDoc = document.createElement('div');
    tempDoc.innerHTML = fullHtml;
    const bodyContent = tempDoc.querySelector('body');
    const contentHtml = bodyContent ? bodyContent.innerHTML : '';
    
    // 检查页面元素是否存在
    if (page1El) {
      // 创建临时iframe来正确渲染和检测内容高度
      const tempIframe = document.createElement('iframe');
      tempIframe.style.position = 'absolute';
      tempIframe.style.visibility = 'hidden';
      tempIframe.style.width = '210mm';
      tempIframe.style.height = '500mm'; // 足够大的高度以容纳内容，但不会过大
      tempIframe.style.border = 'none';
      document.body.appendChild(tempIframe);
      
      // 写入HTML内容到iframe
      const iframeDoc = tempIframe.contentDocument || tempIframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(fullHtml);
      iframeDoc.close();
      
      // 防止重复执行
      let isProcessed = false;
      
      // 清理临时iframe的辅助函数
      const cleanupIframe = () => {
        if (tempIframe && tempIframe.parentNode === document.body) {
          try {
            document.body.removeChild(tempIframe);
          } catch (e) {
            // 忽略移除失败的错误
            console.warn('[DocumentCenterGeneratePage] 清理iframe失败:', e);
          }
        }
      };
      
      // 等待iframe加载完成
      tempIframe.onload = () => {
      if (isProcessed) return;
      isProcessed = true;
      
      setTimeout(() => {
        try {
          const iframeBody = iframeDoc.body;
          if (iframeBody) {
            // 获取模板的页边距设置
            const margin = currentTemplate?.config?.margin || DEFAULT_MARGIN;
            const marginTop = margin.top || DEFAULT_MARGIN.top;
            const marginBottom = margin.bottom || DEFAULT_MARGIN.bottom;
            const marginLeft = margin.left || DEFAULT_MARGIN.left;
            const marginRight = margin.right || DEFAULT_MARGIN.right;
            
            // 应用页边距到预览页面
            page1El.style.padding = `${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm`;
            if (page2El) {
              page2El.style.padding = `${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm`;
            }
            
            // 更新L型标记位置到页边距位置
            updatePreviewMarginMarks(page1El, margin);
            if (page2El) {
              updatePreviewMarginMarks(page2El, margin);
            }
            
            // 等待内容完全渲染后再计算高度
            setTimeout(() => {
              // 获取body的实际内容高度
              // 需要排除body的padding，只计算内容区域的高度
              const bodyStyle = window.getComputedStyle(iframeBody);
              const bodyPaddingTop = parseFloat(bodyStyle.paddingTop) || 0;
              const bodyPaddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
              
              // 获取第一个子元素和最后一个子元素的位置来计算实际内容高度
              const firstChild = iframeBody.firstElementChild;
              const lastChild = iframeBody.lastElementChild;
              
              let contentHeight = iframeBody.scrollHeight;
              
              // 如果body有padding，需要减去
              if (bodyPaddingTop > 0 || bodyPaddingBottom > 0) {
                contentHeight = contentHeight - bodyPaddingTop - bodyPaddingBottom;
              }
              
              // 计算单页可用高度（A4高度减去页边距）
              const a4HeightPx = A4_SIZE.HEIGHT * MM_TO_PX;
              const pageContentHeight = a4HeightPx - ((marginTop + marginBottom) * MM_TO_PX);
              
              console.log('[DocumentCenterGeneratePage] 内容高度:', contentHeight, '单页高度:', pageContentHeight, '需要分页:', contentHeight > pageContentHeight);
              
              // 清空页面，但保留页边距标记
              page1El.innerHTML = '';
              // 重新添加WPS风格页边距L型标记
              const mark1TopLeft = document.createElement('div');
              mark1TopLeft.className = 'margin-mark margin-mark-top-left';
              const mark1TopRight = document.createElement('div');
              mark1TopRight.className = 'margin-mark margin-mark-top-right';
              const mark1BottomLeft = document.createElement('div');
              mark1BottomLeft.className = 'margin-mark margin-mark-bottom-left';
              const mark1BottomRight = document.createElement('div');
              mark1BottomRight.className = 'margin-mark margin-mark-bottom-right';
              page1El.appendChild(mark1TopLeft);
              page1El.appendChild(mark1TopRight);
              page1El.appendChild(mark1BottomLeft);
              page1El.appendChild(mark1BottomRight);
              
              if (page2El) {
                page2El.innerHTML = '';
                page2El.style.display = 'none';
                const mark2TopLeft = document.createElement('div');
                mark2TopLeft.className = 'margin-mark margin-mark-top-left';
                const mark2TopRight = document.createElement('div');
                mark2TopRight.className = 'margin-mark margin-mark-top-right';
                const mark2BottomLeft = document.createElement('div');
                mark2BottomLeft.className = 'margin-mark margin-mark-bottom-left';
                const mark2BottomRight = document.createElement('div');
                mark2BottomRight.className = 'margin-mark margin-mark-bottom-right';
                page2El.appendChild(mark2TopLeft);
                page2El.appendChild(mark2TopRight);
                page2El.appendChild(mark2BottomLeft);
                page2El.appendChild(mark2BottomRight);
              }
              
              // 更新标记位置到页边距位置
              updatePreviewMarginMarks(page1El, margin);
              if (page2El) {
                updatePreviewMarginMarks(page2El, margin);
              }
              
              // 只有当内容高度明显超过单页高度时才分页
              // 使用严格比较，只有当内容确实超过一页时才分页
              if (contentHeight <= pageContentHeight) {
                // 内容不超过一页，只显示第一页
                console.log('[DocumentCenterGeneratePage] 内容适合单页，只显示第一页');
                
                  // 检查iframe中的table是否包含tfoot
                  // 注意：table 1 通常是合同信息表，不包含tfoot；table 2 是产品表格，包含tfoot
                  const iframeTables = iframeBody.querySelectorAll('table');
                  console.log('[DocumentCenterGeneratePage] iframe中找到', iframeTables.length, '个table');
                  iframeTables.forEach((table, index) => {
                    const hasTfoot = table.querySelector('tfoot');
                    const hasThead = table.querySelector('thead');
                    const hasTbody = table.querySelector('tbody');
                    
                    // 判断是否是产品表格（通常有thead和tbody，且可能包含tfoot）
                    const isProductTable = hasThead && hasTbody;
                    
                    if (hasTfoot) {
                      const tfootHtml = hasTfoot.innerHTML;
                      console.log(`[DocumentCenterGeneratePage] table ${index + 1} 的tfoot内容:`, tfootHtml.substring(0, 300));
                      
                      // 检查tfoot中是否包含br标签
                      const hasBr = tfootHtml.includes('<br') || tfootHtml.includes('<br/>');
                      console.log(`[DocumentCenterGeneratePage] table ${index + 1} 的tfoot是否包含br标签:`, hasBr);
                      
                      // 检查tfoot中的td样式
                      const tfootTds = hasTfoot.querySelectorAll('td');
                      tfootTds.forEach((td, tdIndex) => {
                        const tdStyle = td.getAttribute('style') || '';
                        const tdContent = td.innerHTML;
                        console.log(`[DocumentCenterGeneratePage] table ${index + 1} tfoot td[${tdIndex}] 样式:`, tdStyle);
                        console.log(`[DocumentCenterGeneratePage] table ${index + 1} tfoot td[${tdIndex}] 内容:`, tdContent.substring(0, 100));
                        if (tdContent.includes('<br') || tdContent.includes('<br/>')) {
                          console.log(`[DocumentCenterGeneratePage] ⚠️ td[${tdIndex}] 包含br标签，但样式可能不正确`);
                          // 检查计算后的样式
                          const computedStyle = iframeDoc.defaultView.getComputedStyle(td);
                          console.log(`[DocumentCenterGeneratePage] td[${tdIndex}] 计算后的white-space:`, computedStyle.whiteSpace);
                        }
                      });
                    } else if (isProductTable) {
                      // 某些模板类型（如 SALES CONFIRMATION）的设计就是没有 tfoot，总计信息在 tbody 最后一行
                      // 这是正常的，不应该输出警告
                      const templateType = currentTemplate?.type || '';
                      const templateName = currentTemplate?.name || '';
                      const isSalesConfirmation = templateType === 'sales' || templateName === 'SALES CONFIRMATION';
                      
                      if (isSalesConfirmation) {
                        // SALES CONFIRMATION 模板的设计就是没有 tfoot，这是正常的
                        console.log(`[DocumentCenterGeneratePage] table ${index + 1} 不包含tfoot（SALES CONFIRMATION 模板设计如此，总计信息在 tbody 最后一行）`);
                      } else {
                        // 其他模板类型的产品表格缺少 tfoot 时才输出警告
                        console.warn(`[DocumentCenterGeneratePage] ⚠️ 产品表格（table ${index + 1}）不包含tfoot！`);
                        console.log(`[DocumentCenterGeneratePage] table ${index + 1} 的HTML:`, table.outerHTML.substring(0, 500));
                      }
                    } else {
                      // 非产品表格（如合同信息表）不包含tfoot是正常的
                      console.log(`[DocumentCenterGeneratePage] table ${index + 1} 不包含tfoot（这是正常的，可能是合同信息表）`);
                    }
                  });
                
                // 使用DocumentFragment减少重排，提升性能
                const fragment = document.createDocumentFragment();
                const contentDiv = document.createElement('div');
                
                // 重要：直接使用 innerHTML 复制内容，确保保留所有内联样式
                // iframe 中的内容已经包含了所有内联样式，直接复制即可
                contentDiv.innerHTML = iframeBody.innerHTML;
                
                // 再次检查插入后的table是否包含tfoot
                const insertedTables = contentDiv.querySelectorAll('table');
                console.log('[DocumentCenterGeneratePage] 插入后找到', insertedTables.length, '个table');
                insertedTables.forEach((table, index) => {
                  const hasTfoot = table.querySelector('tfoot');
                  console.log(`[DocumentCenterGeneratePage] 插入后 table ${index + 1} 是否包含tfoot:`, !!hasTfoot);
                  
                  // 确保 tfoot 中的 br 标签能正确显示
                  if (hasTfoot) {
                    const tfootTds = hasTfoot.querySelectorAll('td');
                    tfootTds.forEach((td, tdIndex) => {
                      const tdContent = td.innerHTML;
                      const hasBrInHtml = tdContent.includes('<br') || tdContent.includes('<br/>');
                      const hasBrInDom = td.querySelectorAll('br').length > 0;
                      const hasBr = hasBrInHtml || hasBrInDom;
                      console.log(`[DocumentCenterGeneratePage] 插入后 table ${index + 1} tfoot td[${tdIndex}] 内容:`, tdContent.substring(0, 150));
                      console.log(`[DocumentCenterGeneratePage] 插入后 table ${index + 1} tfoot td[${tdIndex}] innerHTML包含br:`, hasBrInHtml);
                      console.log(`[DocumentCenterGeneratePage] 插入后 table ${index + 1} tfoot td[${tdIndex}] DOM包含br:`, hasBrInDom);
                      console.log(`[DocumentCenterGeneratePage] 插入后 table ${index + 1} tfoot td[${tdIndex}] 是否包含br:`, hasBr);
                      
                      // 如果包含 br 标签，确保样式正确
                      if (hasBr) {
                        let currentStyle = td.getAttribute('style') || '';
                        console.log(`[DocumentCenterGeneratePage] 插入后 table ${index + 1} tfoot td[${tdIndex}] 原始样式:`, currentStyle);
                        console.log(`[DocumentCenterGeneratePage] 插入后 table ${index + 1} tfoot td[${tdIndex}] 原始内容:`, tdContent);
                        
                        // 强制设置样式，确保 br 标签能正确换行
                        // 移除所有 white-space 相关样式，然后添加 normal
                        currentStyle = currentStyle.replace(/white-space\s*:\s*[^;]+;?/gi, '');
                        currentStyle = currentStyle.replace(/word-wrap\s*:\s*[^;]+;?/gi, '');
                        // 清理多余的分号和空格
                        currentStyle = currentStyle.replace(/;\s*;/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '');
                        // 添加正确的样式
                        currentStyle = (currentStyle ? currentStyle + '; ' : '') + 'white-space: normal !important; word-wrap: break-word !important;';
                        td.setAttribute('style', currentStyle);
                        
                        // 同时通过 style 对象直接设置，确保生效
                        td.style.whiteSpace = 'normal';
                        td.style.wordWrap = 'break-word';
                        
                        // 确保 br 标签存在且正确
                        const brTags = td.querySelectorAll('br');
                        if (brTags.length === 0 && tdContent.includes('<br')) {
                          // 如果 br 标签在 innerHTML 中但不在 DOM 中，可能是被解析掉了
                          console.warn(`[DocumentCenterGeneratePage] ⚠️ td[${tdIndex}] 的innerHTML包含br但DOM中没有br标签`);
                          // 尝试重新插入 br 标签
                          const textContent = td.textContent || '';
                          if (textContent.includes('总计 TOTAL') || textContent.includes('TOTAL')) {
                            const parts = textContent.split(/总计 TOTAL[：:]\s*/i);
                            if (parts.length === 2) {
                              td.innerHTML = `总计 TOTAL：<br/>${parts[1]}`;
                              console.log(`[DocumentCenterGeneratePage] ✅ 重新插入br标签到td[${tdIndex}]`);
                            }
                          }
                        } else {
                          // 确保 br 标签的样式正确，使用更强制的方式
                          brTags.forEach(br => {
                            // 通过 setAttribute 和 style 对象双重设置，确保样式生效
                            br.setAttribute('style', 'display: block !important; content: "" !important; margin-top: 0 !important; margin-bottom: 0 !important; line-height: 1.2 !important; height: 0 !important; width: 100% !important;');
                            br.style.setProperty('display', 'block', 'important');
                            br.style.setProperty('content', '""', 'important');
                            br.style.setProperty('margin-top', '0', 'important');
                            br.style.setProperty('margin-bottom', '0', 'important');
                            br.style.setProperty('line-height', '1.2', 'important');
                            br.style.setProperty('height', '0', 'important');
                            br.style.setProperty('width', '100%', 'important');
                            console.log(`[DocumentCenterGeneratePage] ✅ 修复 br 标签样式:`, br.getAttribute('style'));
                          });
                        }
                        
                        console.log(`[DocumentCenterGeneratePage] ✅ 修复 tfoot td[${tdIndex}] 样式:`, td.getAttribute('style'));
                        console.log(`[DocumentCenterGeneratePage] ✅ 修复后 tfoot td[${tdIndex}] 内容:`, td.innerHTML.substring(0, 150));
                      }
                    });
                  }
                });
                
                fragment.appendChild(contentDiv);
                page1El.appendChild(fragment);
                
                // 确保预览内容可选择和复制
                page1El.style.userSelect = 'text';
                page1El.style.webkitUserSelect = 'text';
                page1El.style.mozUserSelect = 'text';
                page1El.style.msUserSelect = 'text';
                
                // 确保内容区域可选择
                const allElements = page1El.querySelectorAll('*');
                allElements.forEach(el => {
                  el.style.userSelect = 'text';
                  el.style.webkitUserSelect = 'text';
                  el.style.mozUserSelect = 'text';
                  el.style.msUserSelect = 'text';
                });
                
                // 立即修复样式（不等待延迟）
                const immediateTables = page1El.querySelectorAll('table');
                immediateTables.forEach((table, index) => {
                  const immediateTfoot = table.querySelector('tfoot');
                  if (immediateTfoot) {
                    const immediateTds = immediateTfoot.querySelectorAll('td');
                    immediateTds.forEach((td, tdIndex) => {
                      const hasBr = td.querySelectorAll('br').length > 0 || td.innerHTML.includes('<br');
                      if (hasBr) {
                        // 强制移除所有可能冲突的样式
                        const currentStyle = td.getAttribute('style') || '';
                        let newStyle = currentStyle
                          .replace(/white-space\s*:\s*[^;]+;?/gi, '')
                          .replace(/word-wrap\s*:\s*[^;]+;?/gi, '')
                          .replace(/overflow-wrap\s*:\s*[^;]+;?/gi, '');
                        newStyle = newStyle.replace(/;\s*;/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '');
                        newStyle = (newStyle ? newStyle + '; ' : '') + 'white-space: normal !important; word-wrap: break-word !important; overflow-wrap: break-word !important;';
                        td.setAttribute('style', newStyle);
                        
                        // 通过 style 对象直接设置，确保生效
                        td.style.setProperty('white-space', 'normal', 'important');
                        td.style.setProperty('word-wrap', 'break-word', 'important');
                        td.style.setProperty('overflow-wrap', 'break-word', 'important');
                        
                        // 确保 br 标签样式正确
                        const brs = td.querySelectorAll('br');
                        brs.forEach(br => {
                          br.setAttribute('style', 'display: block !important; content: "" !important; margin-top: 0 !important; margin-bottom: 0 !important; line-height: 1.2 !important; height: 0 !important; width: 100% !important;');
                          br.style.setProperty('display', 'block', 'important');
                          br.style.setProperty('content', '""', 'important');
                          br.style.setProperty('margin-top', '0', 'important');
                          br.style.setProperty('margin-bottom', '0', 'important');
                          br.style.setProperty('line-height', '1.2', 'important');
                          br.style.setProperty('height', '0', 'important');
                          br.style.setProperty('width', '100%', 'important');
                        });
                        
                        console.log(`[DocumentCenterGeneratePage] ✅ 立即修复 table ${index + 1} tfoot td[${tdIndex}] 完成`);
                      }
                    });
                  }
                });
                
                // 延迟再次检查并修复，确保样式在DOM完全渲染后生效
                setTimeout(() => {
                  const finalTables = page1El.querySelectorAll('table');
                  finalTables.forEach((table, index) => {
                    const finalTfoot = table.querySelector('tfoot');
                    if (finalTfoot) {
                      const finalTds = finalTfoot.querySelectorAll('td');
                      finalTds.forEach((td, tdIndex) => {
                        const hasBr = td.querySelectorAll('br').length > 0 || td.innerHTML.includes('<br');
                        if (hasBr) {
                          // 检查计算后的样式
                          const computedStyle = window.getComputedStyle(td);
                          const computedWhiteSpace = computedStyle.whiteSpace;
                          console.log(`[DocumentCenterGeneratePage] 延迟检查 table ${index + 1} tfoot td[${tdIndex}] 计算后的white-space:`, computedWhiteSpace);
                          
                          // 如果计算后的样式不是normal，再次强制设置
                          if (computedWhiteSpace !== 'normal' && computedWhiteSpace !== 'normal') {
                            console.warn(`[DocumentCenterGeneratePage] ⚠️ 计算后的white-space不是normal (${computedWhiteSpace})，再次强制修复`);
                            // 强制移除所有可能冲突的样式
                            const currentStyle = td.getAttribute('style') || '';
                            let newStyle = currentStyle
                              .replace(/white-space\s*:\s*[^;]+;?/gi, '')
                              .replace(/word-wrap\s*:\s*[^;]+;?/gi, '')
                              .replace(/overflow-wrap\s*:\s*[^;]+;?/gi, '');
                            newStyle = newStyle.replace(/;\s*;/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '');
                            newStyle = (newStyle ? newStyle + '; ' : '') + 'white-space: normal !important; word-wrap: break-word !important; overflow-wrap: break-word !important;';
                            td.setAttribute('style', newStyle);
                            
                            // 通过 style 对象直接设置，确保生效
                            td.style.setProperty('white-space', 'normal', 'important');
                            td.style.setProperty('word-wrap', 'break-word', 'important');
                            td.style.setProperty('overflow-wrap', 'break-word', 'important');
                          }
                          
                          // 确保 br 标签样式正确
                          const brs = td.querySelectorAll('br');
                          brs.forEach(br => {
                            br.setAttribute('style', 'display: block !important; content: "" !important; margin-top: 0 !important; margin-bottom: 0 !important; line-height: 1.2 !important; height: 0 !important; width: 100% !important;');
                            br.style.setProperty('display', 'block', 'important');
                            br.style.setProperty('content', '""', 'important');
                            br.style.setProperty('margin-top', '0', 'important');
                            br.style.setProperty('margin-bottom', '0', 'important');
                            br.style.setProperty('line-height', '1.2', 'important');
                            br.style.setProperty('height', '0', 'important');
                            br.style.setProperty('width', '100%', 'important');
                            
                            // 检查br的计算样式
                            const brComputedStyle = window.getComputedStyle(br);
                            const brDisplay = brComputedStyle.display;
                            console.log(`[DocumentCenterGeneratePage] br标签计算后的display:`, brDisplay);
                            if (brDisplay !== 'block') {
                              console.warn(`[DocumentCenterGeneratePage] ⚠️ br标签display不是block (${brDisplay})，再次强制修复`);
                              br.style.setProperty('display', 'block', 'important');
                            }
                          });
                          
                          console.log(`[DocumentCenterGeneratePage] ✅ 延迟修复 table ${index + 1} tfoot td[${tdIndex}] 完成`);
                        }
                      });
                    }
                  });
                }, 200);
                // 确保第二页隐藏
                if (page2El) {
                  page2El.style.display = 'none';
                }
              } else {
                // 内容超过一页，分页显示（最多2页）
                console.log('[DocumentCenterGeneratePage] 内容超过单页，分页显示');
                
                // 使用DOM操作分页，确保表格结构完整性
                const { page1Elements, page2Elements } = splitContentIntoPages(
                  iframeBody, 
                  pageContentHeight
                );
                
                // 使用DocumentFragment减少重排，提升性能
                const fragment1 = document.createDocumentFragment();
                const contentDiv1 = document.createElement('div');
                page1Elements.forEach(element => {
                  // 使用 cloneNode 深度克隆，确保保留所有样式和属性
                  contentDiv1.appendChild(element.cloneNode(true));
                });
                
                // 确保第一页中的 tfoot 样式正确
                const page1Tables = contentDiv1.querySelectorAll('table');
                page1Tables.forEach(table => {
                  const tfoot = table.querySelector('tfoot');
                  if (tfoot) {
                    const tfootTds = tfoot.querySelectorAll('td');
                    tfootTds.forEach(td => {
                      if (td.innerHTML.includes('<br') || td.innerHTML.includes('<br/>')) {
                        const currentStyle = td.getAttribute('style') || '';
                        if (!currentStyle.includes('white-space: normal') && !currentStyle.includes('white-space:normal')) {
                          td.setAttribute('style', currentStyle + ' white-space: normal !important; word-wrap: break-word !important;');
                        }
                      }
                    });
                  }
                });
                
                fragment1.appendChild(contentDiv1);
                page1El.appendChild(fragment1);
                
                // 创建第二页内容
                if (page2El && page2Elements.length > 0) {
                  const fragment2 = document.createDocumentFragment();
                  const contentDiv2 = document.createElement('div');
                  page2Elements.forEach(element => {
                    // 使用 cloneNode 深度克隆，确保保留所有样式和属性
                    contentDiv2.appendChild(element.cloneNode(true));
                  });
                  
                  // 确保第二页中的 tfoot 样式正确
                  const page2Tables = contentDiv2.querySelectorAll('table');
                  page2Tables.forEach(table => {
                    const tfoot = table.querySelector('tfoot');
                    if (tfoot) {
                      const tfootTds = tfoot.querySelectorAll('td');
                      tfootTds.forEach(td => {
                        if (td.innerHTML.includes('<br') || td.innerHTML.includes('<br/>')) {
                          const currentStyle = td.getAttribute('style') || '';
                          if (!currentStyle.includes('white-space: normal') && !currentStyle.includes('white-space:normal')) {
                            td.setAttribute('style', currentStyle + ' white-space: normal !important; word-wrap: break-word !important;');
                          }
                        }
                      });
                    }
                  });
                  
                  fragment2.appendChild(contentDiv2);
                  page2El.appendChild(fragment2);
                  
                  // 确保预览内容可选择和复制
                  page2El.style.userSelect = 'text';
                  page2El.style.webkitUserSelect = 'text';
                  page2El.style.mozUserSelect = 'text';
                  page2El.style.msUserSelect = 'text';
                  
                  // 确保内容区域可选择
                  const allElements2 = page2El.querySelectorAll('*');
                  allElements2.forEach(el => {
                    el.style.userSelect = 'text';
                    el.style.webkitUserSelect = 'text';
                    el.style.mozUserSelect = 'text';
                    el.style.msUserSelect = 'text';
                  });
                  page2El.style.display = 'block';
                }
              }
                
                // 清理临时iframe
                cleanupIframe();
                
                // 应用缩放
                requestAnimationFrame(() => {
                  if (autoFitEnabled) {
                    autoFitToPage();
                  } else {
                    applyZoom();
                  }
                });
                
                window.NotificationSystem?.toast('预览生成成功', 'success');
              }, 50);
          } else {
            throw new Error('无法获取iframe内容');
          }
        } catch (error) {
          console.error('[DocumentCenterGeneratePage] 分页处理失败:', error);
          // 如果分页失败，直接显示内容，但保留页边距标记
          page1El.innerHTML = '';
          // 添加WPS风格页边距L型标记
          const mark1TopLeft = document.createElement('div');
          mark1TopLeft.className = 'margin-mark margin-mark-top-left';
          const mark1TopRight = document.createElement('div');
          mark1TopRight.className = 'margin-mark margin-mark-top-right';
          const mark1BottomLeft = document.createElement('div');
          mark1BottomLeft.className = 'margin-mark margin-mark-bottom-left';
          const mark1BottomRight = document.createElement('div');
          mark1BottomRight.className = 'margin-mark margin-mark-bottom-right';
          page1El.appendChild(mark1TopLeft);
          page1El.appendChild(mark1TopRight);
          page1El.appendChild(mark1BottomLeft);
          page1El.appendChild(mark1BottomRight);
          
          // 获取模板的页边距设置并更新标记位置
          const margin = currentTemplate?.config?.margin || DEFAULT_MARGIN;
          updatePreviewMarginMarks(page1El, margin);
          
          const contentDiv = document.createElement('div');
          contentDiv.innerHTML = contentHtml;
          page1El.appendChild(contentDiv);
          cleanupIframe();
          window.NotificationSystem?.toast('预览生成成功', 'success');
        }
        
        // 修复：预览生成后，调整居中显示
        adjustPreviewCenter();
      }, 100);
      };
      
      // 如果iframe已经加载完成（某些情况下onload可能不会触发）
      if (tempIframe.contentDocument && tempIframe.contentDocument.readyState === 'complete') {
        tempIframe.onload();
      }
    } else {
      // 如果找不到页面元素，使用原来的方式
      const previewEl = document.getElementById('documentPreview');
      if (previewEl) {
        TemplateRenderer.renderToPreview('documentPreview', currentTemplate, data);
        window.NotificationSystem?.toast('预览生成成功', 'success');
      }
    }
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 生成预览失败:', error);
    showFriendlyError(error, 'generatePreview');
    clearPreview();
  }
}

/**
 * 更新预览页面的页边距标记位置
 */
function updatePreviewMarginMarks(pageElement, margin) {
  if (!pageElement) return;
  
  const marginTop = margin.top || 20;
  const marginBottom = margin.bottom || 20;
  const marginLeft = margin.left || 20;
  const marginRight = margin.right || 20;
  
  // 左上角标记
  const markTopLeft = pageElement.querySelector('.margin-mark-top-left');
  if (markTopLeft) {
    markTopLeft.style.top = `${marginTop}mm`;
    markTopLeft.style.left = `${marginLeft}mm`;
  }
  
  // 右上角标记
  const markTopRight = pageElement.querySelector('.margin-mark-top-right');
  if (markTopRight) {
    markTopRight.style.top = `${marginTop}mm`;
    markTopRight.style.right = `${marginRight}mm`;
  }
  
  // 左下角标记
  const markBottomLeft = pageElement.querySelector('.margin-mark-bottom-left');
  if (markBottomLeft) {
    markBottomLeft.style.bottom = `${marginBottom}mm`;
    markBottomLeft.style.left = `${marginLeft}mm`;
  }
  
  // 右下角标记
  const markBottomRight = pageElement.querySelector('.margin-mark-bottom-right');
  if (markBottomRight) {
    markBottomRight.style.bottom = `${marginBottom}mm`;
    markBottomRight.style.right = `${marginRight}mm`;
  }
}

/**
 * 清空预览
 */
function clearPreview() {
  if (previewViewer) {
    // 使用 PP 预览器清空（显示空状态）
    const emptyHtml = `
      <div class="preview-empty-state">
        <div class="empty-icon">📄</div>
        <p class="empty-text">请选择订单和模板以生成单据</p>
      </div>
    `;
    previewViewer.render(emptyHtml, null, {
      margin: DEFAULT_MARGIN,
      pageSettings: {},
      globalStyles: {}
    });
  } else {
    // 回退到旧方式
    const page1El = document.getElementById('documentPreviewPage1');
    if (page1El) {
      page1El.innerHTML = `
        <div class="preview-empty-state">
          <div class="empty-icon">📄</div>
          <p class="empty-text">请选择订单和模板以生成单据</p>
        </div>
      `;
    }
    const page2El = document.getElementById('documentPreviewPage2');
    if (page2El) {
      page2El.innerHTML = '';
      page2El.style.display = 'none';
    }
  }
}

function clearPreviewOld() {
  const page1El = document.getElementById('documentPreviewPage1');
  if (page1El) {
    page1El.innerHTML = '';
    // 保留WPS风格页边距L型标记
    const mark1TopLeft = document.createElement('div');
    mark1TopLeft.className = 'margin-mark margin-mark-top-left';
    const mark1TopRight = document.createElement('div');
    mark1TopRight.className = 'margin-mark margin-mark-top-right';
    const mark1BottomLeft = document.createElement('div');
    mark1BottomLeft.className = 'margin-mark margin-mark-bottom-left';
    const mark1BottomRight = document.createElement('div');
    mark1BottomRight.className = 'margin-mark margin-mark-bottom-right';
    page1El.appendChild(mark1TopLeft);
    page1El.appendChild(mark1TopRight);
    page1El.appendChild(mark1BottomLeft);
    page1El.appendChild(mark1BottomRight);
    
    // 更新标记位置（使用默认页边距）
    const defaultMargin = DEFAULT_MARGIN;
    updatePreviewMarginMarks(page1El, defaultMargin);
    
    const emptyState = document.createElement('div');
    emptyState.className = 'preview-empty-state';
    emptyState.innerHTML = `
      <div class="empty-icon">📄</div>
      <p class="empty-text">请选择订单和模板以生成单据</p>
    `;
    page1El.appendChild(emptyState);
  }
  const page2El = document.getElementById('documentPreviewPage2');
  if (page2El) {
    page2El.innerHTML = '';
    page2El.style.display = 'none';
    const mark2TopLeft = document.createElement('div');
    mark2TopLeft.className = 'margin-mark margin-mark-top-left';
    const mark2TopRight = document.createElement('div');
    mark2TopRight.className = 'margin-mark margin-mark-top-right';
    const mark2BottomLeft = document.createElement('div');
    mark2BottomLeft.className = 'margin-mark margin-mark-bottom-left';
    const mark2BottomRight = document.createElement('div');
    mark2BottomRight.className = 'margin-mark margin-mark-bottom-right';
    page2El.appendChild(mark2TopLeft);
    page2El.appendChild(mark2TopRight);
    page2El.appendChild(mark2BottomLeft);
    page2El.appendChild(mark2BottomRight);
    
    // 更新标记位置（使用默认页边距）
    const defaultMargin = DEFAULT_MARGIN;
    updatePreviewMarginMarks(page2El, defaultMargin);
  }
}

/**
 * 导出PDF
 * @description 将当前预览的单据导出为PDF文件
 * 重要：使用与 PP 预览器相同的渲染结果，确保导出与预览一致
 * @returns {Promise<void>}
 * @throws {Error} 当导出失败时抛出错误
 */
async function exportPDF() {
  // 数据验证
  const validation = DocumentCenterValidator.validateExportParams({
    order: currentOrder,
    template: currentTemplate,
    format: 'pdf'
  });

  if (!validation.valid) {
    window.NotificationSystem?.toast(validation.errors.join('；'), 'warning');
    return;
  }

  const btnExportPDF = document.getElementById('btnExportPDF');
  const originalText = btnExportPDF?.textContent;

  try {
    // 显示加载状态
    if (btnExportPDF) {
      btnExportPDF.disabled = true;
      btnExportPDF.textContent = '导出中...';
    }

    // 生成HTML（使用与 PP 预览器相同的渲染方法，确保一致性）
    const html = await generateDocumentHtmlForExport();
    
    // 生成文件名
    const fileName = generateFileName('.pdf');
    
    // 导出（传递完整的样式信息）
    await DocumentCenterService.exportPDF(html, fileName);
    window.NotificationSystem?.toast('PDF导出成功', 'success');
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 导出PDF失败:', error);
    
    // 如果是 Puppeteer 错误，显示详细安装说明
    if (error.message?.includes('Puppeteer') || error.message?.includes('Chrome') || error.message?.includes('Edge')) {
      window.NotificationSystem?.toast(
        `PDF导出服务未就绪\n\n原因: ${error.message}\n\n请尝试重新安装组件或重启应用。`,
        'error',
        { duration: 15000 }
      );
    } else {
      showFriendlyError(error, 'exportPDF');
    }
  } finally {
    // 恢复按钮状态
    if (btnExportPDF) {
      btnExportPDF.disabled = false;
      btnExportPDF.textContent = originalText || '📄 导出PDF';
    }
  }
}

/**
 * 导出Word
 * @description 将当前预览的单据导出为Word文件
 * 重要：使用与 PP 预览器相同的渲染结果，确保导出与预览一致
 * @returns {Promise<void>}
 * @throws {Error} 当导出失败时抛出错误
 */
async function exportWord() {
  // 数据验证
  const validation = DocumentCenterValidator.validateExportParams({
    order: currentOrder,
    template: currentTemplate,
    format: 'word'
  });

  if (!validation.valid) {
    window.NotificationSystem?.toast(validation.errors.join('；'), 'warning');
    return;
  }

  const btnExportWord = document.getElementById('btnExportWord');
  const originalText = btnExportWord?.textContent;

  try {
    // 显示加载状态
    if (btnExportWord) {
      btnExportWord.disabled = true;
      btnExportWord.textContent = '导出中...';
    }

    // 生成HTML（使用与预览相同的渲染方法，确保一致性）
    const html = await generateDocumentHtml();
    
    // 生成文件名
    const fileName = generateFileName('.docx');
    
    // 导出
    await DocumentCenterService.exportWord(html, fileName);
    window.NotificationSystem?.toast('Word导出成功', 'success');
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 导出Word失败:', error);
    showFriendlyError(error, 'exportWord');
  } finally {
    // 恢复按钮状态
    if (btnExportWord) {
      btnExportWord.disabled = false;
      btnExportWord.textContent = originalText || '📝 导出Word';
    }
  }
}

/**
 * 导出Excel
 * @description 将当前订单数据导出为Excel文件
 * @returns {Promise<void>}
 * @throws {Error} 当导出失败时抛出错误
 */
async function exportExcel() {
  // 数据验证
  const validation = DocumentCenterValidator.validateExportParams({
    order: currentOrder,
    template: currentTemplate,
    format: 'excel'
  });

  if (!validation.valid) {
    window.NotificationSystem?.toast(validation.errors.join('；'), 'warning');
    return;
  }

  const btnExportExcel = document.getElementById('btnExportExcel');
  const originalText = btnExportExcel?.textContent;

  try {
    // 显示加载状态
    if (btnExportExcel) {
      btnExportExcel.disabled = true;
      btnExportExcel.textContent = '导出中...';
    }

    // 生成文件名
    const fileName = generateFileName('.xlsx');
    
    // 导出
    await DocumentCenterService.exportExcel(
      currentOrder.id,
      currentTemplate?.id,
      fileName
    );
    window.NotificationSystem?.toast('Excel导出成功', 'success');
  } catch (error) {
    console.error('[DocumentCenterGeneratePage] 导出Excel失败:', error);
    showFriendlyError(error, 'exportExcel');
  } finally {
    // 恢复按钮状态
    if (btnExportExcel) {
      btnExportExcel.disabled = false;
      btnExportExcel.textContent = originalText || '📊 导出Excel';
    }
  }
}

/**
 * 生成单据HTML
 * @deprecated 建议使用 generateDocumentHtmlForExport，该方法使用 TemplateService 确保一致性
 */
async function generateDocumentHtml() {
  if (!currentOrder || !currentTemplate) {
    throw new Error('订单或模板未选择');
  }

  // 获取客户数据
  let customer = null;
  if (currentOrder.customerId) {
    customer = await window.ApiService?.customers?.get?.(currentOrder.customerId);
  }

  // 获取公司数据
  const company = await window.ApiService?.company?.get?.() || {};

  // 准备数据
  const data = DataBinder.prepareData(currentOrder, customer, company);

  // 渲染模板
  return TemplateRenderer.render(currentTemplate, data);
}

/**
 * 生成用于导出的单据HTML
 * 使用与 PP 预览器相同的渲染逻辑，确保导出与预览一致
 * @returns {Promise<string>} 包含完整样式的HTML文档
 */
async function generateDocumentHtmlForExport() {
  if (!currentOrder || !currentTemplate) {
    throw new Error('订单或模板未选择');
  }

  // 获取客户数据
  let customer = null;
  if (currentOrder.customerId) {
    customer = await window.ApiService?.customers?.get?.(currentOrder.customerId);
  }

  // 获取公司数据
  const company = await window.ApiService?.company?.get?.() || {};

  // 使用 TemplateService 准备数据（与预览一致）
  const data = TemplateService.prepareData(currentOrder, customer, company);

  // 使用 TemplateService 渲染模板（与预览一致）
  const html = await TemplateService.renderTemplate(currentTemplate, data, {
    useNewEngine: true,
    mode: 'view'  // 导出使用 view 模式（显示真实数据）
  });

  // 获取页边距设置
  let margin = DEFAULT_MARGIN;
  if (currentTemplate?.config?.pageSettings?.margin) {
    margin = currentTemplate.config.pageSettings.margin;
  } else if (currentTemplate?.config?.margin) {
    margin = currentTemplate.config.margin;
  } else if (currentTemplate?.margin) {
    margin = currentTemplate.margin;
  }

  // 确保 HTML 包含导出所需的完整样式
  // 如果 TemplateService.renderTemplate 已经返回完整 HTML，直接使用
  // 否则需要包装
  if (html.includes('<!DOCTYPE html>') || html.includes('<html')) {
    return html;
  }

  // 包装为完整 HTML 文档（用于导出）
  const globalStyles = currentTemplate?.config?.globalStyles || currentTemplate?.globalStyles || {};
  
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <title>单据导出</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page {
          size: A4;
          margin: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm;
        }
        body {
          width: 210mm;
          min-height: 297mm;
          font-family: ${globalStyles.fontFamily || 'Arial, "Microsoft YaHei", sans-serif'};
          font-size: ${globalStyles.fontSize || 12}px;
          line-height: ${globalStyles.lineHeight || 1.4};
          color: ${globalStyles.color || '#000'};
          padding: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        table { border-collapse: collapse; width: 100%; }
        td, th { padding: 4px 8px; }
      </style>
    </head>
    <body>
      ${html}
    </body>
    </html>
  `;
}

/**
 * 生成文件名
 * @param {string} extension - 文件扩展名（如：'.pdf', '.docx', '.xlsx'）
 * @returns {string} 生成的文件名
 */
function generateFileName(extension) {
  const typeName = DOCUMENT_TYPE_NAMES[currentDocumentType] || '单据';
  const contractNo = currentOrder?.contractNo || '无合同号';
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');

  return `${typeName}_${contractNo}_${date}${extension}`;
}
