/**
 * 订单快速预览功能
 * ES6 模块化版本
 */
import { isOrderPreviewNewDocsButtonEnabled } from '../../utils/ui-preferences.js';
import { formatOrderQuickPreviewMarksCellInnerHtml, normalizeOrderItem } from './order-item-marks.js';
/**
   * 显示订单预览弹窗
   * @param {number} orderIndex - 订单在state.orders数组中的索引
   * @description 在弹窗中显示订单的详细信息，包括基本信息、物流信息、客户信息、产品列表和统计数据
   * @example
   * showOrderPreview(0); // 预览第一个订单
   */
/**
   * 显示订单预览弹窗
   * @param {number|object|string} orderOrIndex - 订单索引、订单对象或订单ID
   */
async function showOrderPreview(orderOrIndex) {
    let order = null;

    // 1.解析参数获取订单对象
    if (typeof orderOrIndex === 'number') {
        // 索引
        order = window.state?.orders?.[orderOrIndex];
    } else if (typeof orderOrIndex === 'object' && orderOrIndex !== null) {
        // 对象
        order = orderOrIndex;
    } else if (typeof orderOrIndex === 'string' || typeof orderOrIndex === 'bigint') {
        // ID (尝试从 state 查找)
        order = window.state?.orders?.find(o => o.id == orderOrIndex || o.rowid == orderOrIndex);
    }

    console.log('[DEBUG] showOrderPreview called with:', orderOrIndex, 'Resolved order:', order);

    if (!order) {
        console.error('[Preview] 无法找到订单数据');
        if (typeof window.NotificationSystem?.toast === "function") {
            window.NotificationSystem?.toast('订单不存在或数据异常', 'error');
        }
        return;
    }

    // 2. 检查 ID 是否存在
    const orderId = order.id || order.rowid;
    if (!orderId) {
        console.error('[Preview] 订单 ID 缺失, 无法获取详情:', order);
        if (typeof window.NotificationSystem?.toast === "function") {
            window.NotificationSystem?.toast('订单数据不完整(ID缺失)，请刷新后重试', 'error');
        }
        return;
    }

    // 准备标题和footer（提前准备，不等待数据加载）
    const orderTitle = escapeHtml(order.contractNo || order.orderNo || '未命名订单');
    const newDocsBtnHtml = isOrderPreviewNewDocsButtonEnabled()
      ? '<button class="btn-success" id="btnDocsFromPreview" type="button">📄 生成单据（new）</button>'
      : '';
    const footerHTML = `
      <div class="footer-left">
      <button class="btn-secondary" id="btnClosePreview" data-action="cancel" type="button">关闭</button>
          </div>
          <div class="footer-right">
      <button class="btn-primary" id="btnEditFromPreview" type="button">✏️ 编辑订单</button>
      <button class="btn-success" id="btnDocsOldFromPreview" type="button">📄 生成单据</button>
      ${newDocsBtnHtml}
          </div>
  `;

    // 始终拉取详情，避免列表缓存/不完整 items 与编辑页 orders.get 不一致
    const loading =
      window.ModalDialog && typeof window.ModalDialog.loading === 'function'
        ? window.ModalDialog.loading('正在加载订单详情...')
        : null;
    try {
        console.log('[Preview] Fetching fresh order details for ID:', orderId);
        const fullOrder = await window.ApiService.orders.get(orderId);
        if (!fullOrder) {
            throw new Error('获取到的订单数据为空');
        }
        order = fullOrder;
        if (typeof orderOrIndex === 'number' && window.state?.orders?.[orderOrIndex]) {
            window.state.orders[orderOrIndex] = fullOrder;
        } else if (window.state?.orders) {
            const idx = window.state.orders.findIndex((o) => o.id == orderId);
            if (idx !== -1) window.state.orders[idx] = fullOrder;
        }
    } catch (error) {
        console.error('获取订单详情异常:', error);
        if (typeof window.NotificationSystem?.toast === 'function') {
            window.NotificationSystem.toast('获取订单详情失败: ' + (error.message || '未知错误'), 'error');
        }
        return;
    } finally {
        if (loading && typeof loading.close === 'function') {
            loading.close();
        }
    }

    // 生成预览HTML（只包含body部分，不包含modal结构）
    // 使用 requestAnimationFrame 优化DOM操作
    const previewBodyHTML = generatePreviewHTML(order);

    // 使用统一弹窗模块
    // 保存 modalId 以便后续关闭
    let currentModalId = null;

    // 先创建弹窗，不等待 Promise resolve
    const modalPromise = window.ModalDialog.custom(previewBodyHTML, {
        title: `📋 订单预览 - ${orderTitle}`,
        footer: footerHTML,
        size: 'xlarge',
        closable: true,
        clickOutsideToClose: true,
        onClose: () => {
            // 关闭时的处理（如果需要）
            currentModalId = null;
        }
    });

    // 立即查找弹窗元素并绑定事件（不等待 Promise）
    // 使用多个延迟确保 DOM 已完全渲染
    setTimeout(() => {
        const modal = document.querySelector('.modal-dialog-overlay:last-child');
        if (modal) {
            if (modal.id) {
                currentModalId = modal.id;
            }

            // 修复样式不生效的问题：添加自定义类名
            modal.classList.add('order-preview-modal');

            // 强制修复宽度问题：确保应用xlarge样式
            const dialog = modal.querySelector('.modal-dialog');
            if (dialog) {
                dialog.classList.add('modal-dialog-xlarge');
                // 双重保险：直接设置样式
                dialog.style.maxWidth = '1400px';
                dialog.style.width = '95%';
            }

            // 强制应用5列布局
            const fiveColsGrids = modal.querySelectorAll('.info-grid.five-cols');
            fiveColsGrids.forEach(grid => {
                grid.style.setProperty('grid-template-columns', 'repeat(5, 1fr)', 'important');
            });

            // 绑定特殊事件（编辑按钮、生成单据按钮）
            // 注意：关闭按钮使用 data-action="cancel" 属性，ModalDialog 会自动处理
            bindPreviewButtons(modal, order, currentModalId);
        }
    }, 50);

    // 使用 requestAnimationFrame 作为备用方案
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const modal = document.querySelector('.modal-dialog-overlay:last-child');
            if (modal) {
                if (modal.id && !currentModalId) {
                    currentModalId = modal.id;
                }

                // 修复样式不生效的问题：再次尝试添加自定义类名
                modal.classList.add('order-preview-modal');
                const dialog = modal.querySelector('.modal-dialog');
                if (dialog) {
                    dialog.classList.add('modal-dialog-xlarge');
                    dialog.style.maxWidth = '1400px';
                    dialog.style.width = '95%';
                }

                // 再次尝试绑定事件（如果第一次失败）
                const editBtn = modal.querySelector('#btnEditFromPreview');
                const docsBtn = modal.querySelector('#btnDocsFromPreview');
                const docsOldBtn = modal.querySelector('#btnDocsOldFromPreview');
                if (editBtn || docsBtn || docsOldBtn) {
                    bindPreviewButtons(modal, order, currentModalId);
                }
            }
        });
    });

    // 等待 Promise resolve（但事件已经在上面绑定了）
    await modalPromise;
}

// 绑定预览窗口按钮事件
function bindPreviewButtons(modal, order, modalId) {
    // 增加调试日志，排查 ID 丢失问题
    console.log('[DEBUG] Preview Order Object:', order);
    const orderId = order.id || order.orderId;
    if (!orderId) {
        console.error('[ERROR] Order ID is missing!', order);
        if (typeof window.NotificationSystem?.toast === "function") {
            window.NotificationSystem.toast('无法获取订单ID，请刷新重试', 'error');
        }
    }

    // 编辑按钮事件处理函数
    const handleEditClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 关闭当前弹窗
        if (modalId && window.ModalDialogInstance) {
            try {
                window.ModalDialogInstance.closeModal(modalId);
            } catch (err) {
                const closeBtn = modal.querySelector('.modal-close');
                if (closeBtn) {
                    closeBtn.click();
                } else {
                    modal.remove();
                }
            }
        } else {
            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.click();
            } else {
                modal.remove();
            }
        }

        // 使用 requestAnimationFrame 优化跳转时机
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // 找到订单在state.orders中的索引
                const orderIndex = window.state?.orders?.findIndex(o => o.id === orderId);
                if (orderIndex !== -1) {
                    // 触发编辑订单
                    const editEvent = new CustomEvent('editOrder', { detail: { index: orderIndex } });
                    document.dispatchEvent(editEvent);
                }
                // 跳转到SPA内的订单编辑页面
                location.hash = `#/orders/edit?id=${orderId}`;
            });
        });
    };

    // 生成单据按钮事件处理函数（新版）
    const handleDocsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 关闭当前弹窗
        if (modalId && window.ModalDialogInstance) {
            try {
                window.ModalDialogInstance.closeModal(modalId);
            } catch (err) {
                const closeBtn = modal.querySelector('.modal-close');
                if (closeBtn) {
                    closeBtn.click();
                } else {
                    modal.remove();
                }
            }
        } else {
            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.click();
            } else {
                modal.remove();
            }
        }

        // 跳转到新的单据生成页面
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                location.hash = `#/document-center/generate?orderId=${orderId}`;
            });
        });
    };

    // 生成单据按钮事件处理函数（旧版）
    const handleDocsOldClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 关闭当前弹窗
        if (modalId && window.ModalDialogInstance) {
            try {
                window.ModalDialogInstance.closeModal(modalId);
            } catch (err) {
                const closeBtn = modal.querySelector('.modal-close');
                if (closeBtn) {
                    closeBtn.click();
                } else {
                    modal.remove();
                }
            }
        } else {
            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.click();
            } else {
                modal.remove();
            }
        }

        // 跳转到旧版的单据生成页面
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.location.href = `/docs.html?id=${orderId}&hide=1`;
            });
        });
    };

    // 查找按钮
    const editBtn = modal.querySelector('#btnEditFromPreview');
    const docsBtn = modal.querySelector('#btnDocsFromPreview');
    const docsOldBtn = modal.querySelector('#btnDocsOldFromPreview');

    // 绑定编辑按钮 - 使用多种方式确保事件能被捕获
    if (editBtn) {
        // 移除可能存在的旧事件监听器（通过克隆节点）
        const newEditBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newEditBtn, editBtn);

        // 使用 capture 阶段和 onclick 两种方式绑定
        newEditBtn.addEventListener('click', handleEditClick, { capture: true });
        newEditBtn.onclick = handleEditClick;
    }

    // 绑定生成单据按钮（新版）- 使用多种方式确保事件能被捕获
    if (docsBtn) {
        // 移除可能存在的旧事件监听器（通过克隆节点）
        const newDocsBtn = docsBtn.cloneNode(true);
        docsBtn.parentNode.replaceChild(newDocsBtn, docsBtn);

        // 使用 capture 阶段和 onclick 两种方式绑定
        newDocsBtn.addEventListener('click', handleDocsClick, { capture: true });
        newDocsBtn.onclick = handleDocsClick;
    }

    // 绑定生成单据按钮（旧版）- 使用多种方式确保事件能被捕获
    if (docsOldBtn) {
        // 移除可能存在的旧事件监听器（通过克隆节点）
        const newDocsOldBtn = docsOldBtn.cloneNode(true);
        docsOldBtn.parentNode.replaceChild(newDocsOldBtn, docsOldBtn);

        // 使用 capture 阶段和 onclick 两种方式绑定
        newDocsOldBtn.addEventListener('click', handleDocsOldClick, { capture: true });
        newDocsOldBtn.onclick = handleDocsOldClick;
    }

    // 在 footer 上使用事件委托作为备用方案
    const footer = modal.querySelector('.modal-footer');
    if (footer) {
        footer.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            if (button.id === 'btnEditFromPreview') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                handleEditClick(e);
            } else if (button.id === 'btnDocsFromPreview') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                handleDocsClick(e);
            } else if (button.id === 'btnDocsOldFromPreview') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                handleDocsOldClick(e);
            }
        }, { capture: true });
    }

    // 在 document 级别使用捕获阶段监听作为最后保障
    // 这确保即使在 ModalDialog 处理之后，我们也能捕获到事件
    const documentClickHandler = (e) => {
        const button = e.target.closest('button');
        if (!button || (button.id !== 'btnEditFromPreview' && button.id !== 'btnDocsFromPreview' && button.id !== 'btnDocsOldFromPreview')) {
            return;
        }

        // 检查是否在当前预览弹窗内
        const buttonModal = button.closest('.modal-dialog-overlay');
        if (!buttonModal || buttonModal !== modal) {
            return;
        }

        // 阻止事件继续传播
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (button.id === 'btnEditFromPreview') {
            handleEditClick(e);
        } else if (button.id === 'btnDocsFromPreview') {
            handleDocsClick(e);
        } else if (button.id === 'btnDocsOldFromPreview') {
            handleDocsOldClick(e);
        }
    };

    // 在捕获阶段绑定，确保优先于 ModalDialog 的处理
    document.addEventListener('click', documentClickHandler, { capture: true, passive: false });

    // 使用 MutationObserver 监听弹窗移除，自动清理事件监听器
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.removedNodes.forEach((node) => {
                if (node === modal || (node.nodeType === 1 && node.contains && node.contains(modal))) {
                    document.removeEventListener('click', documentClickHandler, { capture: true });
                    observer.disconnect();
                }
            });
        });
    });

    // 开始监听 modal-container 的变化
    const modalContainer = document.querySelector('.modal-container');
    if (modalContainer) {
        observer.observe(modalContainer, { childList: true, subtree: true });
    }
}

// 生成生产通知信息（新版）
function generateProductionInfoNew(order, extras) {
    const boxType = extras.boxType || '';
    const boxQuantity = extras.boxQuantity || '';
    const boxVolume = extras.boxVolume || '';
    const marksNote = extras.marksNote || '';
    const prodNote = extras.prodNote || '';

    // 只有当有任何生产通知相关信息时才显示该区块
    if (!boxType && !boxQuantity && !boxVolume && !marksNote && !prodNote) {
        return '';
    }

    return `
  <div class="content-section" id="preview-section-production">
      <div class="content-section-header">(3) 生产通知信息</div>
      <div class="content-section-body">
          <div class="form-grid">
              <div class="form-item">
                  <label>箱型</label>
                  <div class="preview-value">${escapeHtml(boxType) || '-'}</div>
              </div>
              <div class="form-item">
                  <label>货箱数量</label>
                  <div class="preview-value">${escapeHtml(boxQuantity) || '-'}</div>
              </div>
              <div class="form-item">
                  <label>箱型体积</label>
                  <div class="preview-value">${escapeHtml(boxVolume) || '-'}</div>
              </div>
              <div class="form-item">
                  <label>交货期</label>
                  <div class="preview-value">${formatDate(extras.deliveryDate || order.shipmentDate) || '-'}</div>
              </div>
      </div>
      ${marksNote ? `
          <div class="form-item full-width">
              <label>唛头说明</label>
              <div class="preview-textarea">${escapeHtml(marksNote).replace(/\n/g, '<br/>')}</div>
      </div>
      ` : ''}
      ${prodNote ? `
          <div class="form-item full-width">
              <label>生产通知备注</label>
              <div class="preview-textarea">${escapeHtml(prodNote).replace(/\n/g, '<br/>')}</div>
      </div>
      ` : ''}
      </div>
  </div>
  `;
}

// 生成拉货通知信息（新版）
function generatePickupInfoNew(order, extras) {
    const pickupDate = extras.pickupDate || '';
    const pickupTime = extras.pickupTime || '';
    const pickupDriver = extras.pickupDriver || '';
    const pickupPhone = extras.pickupPhone || '';
    const pickupPlate = extras.pickupPlate || '';
    const containerPosition = extras.containerPosition || '';
    const photoRemark = extras.photoRemark || '';
    const pickupNote = extras.pickupNote || '';

    // 只有当有任何拉货通知相关信息时才显示该区块
    if (!pickupDate && !pickupTime && !pickupDriver && !pickupPhone && !pickupPlate && !containerPosition && !photoRemark && !pickupNote) {
        return '';
    }

    return `
  <div class="content-section" id="preview-section-pickup">
      <div class="content-section-header">(4) 拉货通知信息</div>
      <div class="content-section-body">
          <div class="form-grid">
              ${pickupDate ? `
              <div class="form-item">
                  <label>拉货日期</label>
                  <div class="preview-value">${escapeHtml(pickupDate)}</div>
              </div>
              ` : ''}
              ${pickupTime ? `
              <div class="form-item">
                  <label>拉货时间</label>
                  <div class="preview-value">${escapeHtml(pickupTime)}</div>
              </div>
              ` : ''}
              ${pickupDriver ? `
              <div class="form-item">
                  <label>司机</label>
                  <div class="preview-value">${escapeHtml(pickupDriver)}</div>
              </div>
              ` : ''}
              ${pickupPhone ? `
              <div class="form-item">
                  <label>联系方式</label>
                  <div class="preview-value">${escapeHtml(pickupPhone)}</div>
              </div>
              ` : ''}
              ${pickupPlate ? `
              <div class="form-item">
                  <label>车牌号</label>
                  <div class="preview-value">${escapeHtml(pickupPlate)}</div>
              </div>
              ` : ''}
              ${containerPosition ? `
              <div class="form-item">
                  <label>货箱位置</label>
                  <div class="preview-value">${escapeHtml(containerPosition)}</div>
              </div>
              ` : ''}
      </div>
      ${photoRemark ? `
          <div class="form-item full-width">
              <label>拍照备注</label>
              <div class="preview-textarea">${escapeHtml(photoRemark).replace(/\n/g, '<br/>')}</div>
      </div>
      ` : ''}
      ${pickupNote ? `
          <div class="form-item full-width">
              <label>拉货备注</label>
              <div class="preview-textarea">${escapeHtml(pickupNote).replace(/\n/g, '<br/>')}</div>
      </div>
      ` : ''}
      </div>
  </div>
  `;
}

// 生成预览HTML
function generatePreviewHTML(order) {
    const items = order.items || [];
    const extras = order.extras || {};
    const productType = (order.productType ?? order.product_type) || 1; // 1=A类品, 2=B类品, 3=C类品
    const productTypeText = productType === 2 ? 'B类品' : productType === 3 ? 'C类品' : 'A类品';
    const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    // 修复订单金额计算：使用 calculatedAmount (quantity * unitPrice) 或 item.amount
    const totalAmount = items.reduce((sum, item) => {
        const calculatedAmount = (item.quantity && item.unitPrice)
            ? parseFloat(item.quantity) * parseFloat(item.unitPrice)
            : parseFloat(item.amount) || 0;
        return sum + calculatedAmount;
    }, 0);
    const totalPackages = items.reduce((sum, item) => sum + (parseFloat(item.packages) || 0), 0);

    // 格式化日期时间
    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return `
      <div class="order-preview-content">
          <!-- (1) 订单信息 -->
          <div class="content-section" id="preview-section-order-info">
              <div class="content-section-header">
                  <span>（1）订单信息</span>
                  <div style="display: flex; align-items: center; gap: 12px;">
                      <span class="status-pill ${getStatusClass(order.status)}">${order.status || '已创建'}</span>
                      <span class="product-type-badge product-type-${productType}">${productTypeText}</span>
          </div>
      </div>
              <div class="content-section-body">
                  <div class="form-grid">
                      <div class="form-item">
                          <label>DATE（订单日期）</label>
                          <div class="preview-value">${formatDate(order.invoiceDate) || '-'}</div>
                      </div>
                      <div class="form-item">
                          <label>合同编号</label>
                          <div class="preview-value highlight-value">${escapeHtml(order.contractNo || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>ACCOUNT AND RISK OF（客户）</label>
                          <div class="preview-value highlight-value">${escapeHtml(order.customerName || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>ORDER NO（订单号）</label>
                          <div class="preview-value">${escapeHtml(extras.orderNo || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>SHIPMENT DATE（发货日期）</label>
                          <div class="preview-value">${formatDate(order.shipmentDate) || '-'}</div>
                      </div>
                      <div class="form-item">
                          <label>Trade Term（贸易术语）</label>
                          <div class="preview-value">${escapeHtml(extras.tradeTerm || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>FROM（装运港）</label>
                          <div class="preview-value">${escapeHtml(order.shipFrom || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>TO（目的港）</label>
                          <div class="preview-value">${escapeHtml(order.shipTo || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>INVOICE NO（发票号）</label>
                          <div class="preview-value">${escapeHtml(order.invoiceNo || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>B/L No（提单号）</label>
                          <div class="preview-value">${escapeHtml(order.blNo || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>SHIPPED PER S.S（船名航次）</label>
                          <div class="preview-value">${escapeHtml(order.shippedPerSs || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>货代</label>
                          <div class="preview-value">${escapeHtml(order.forwarder || '-')}</div>
                      </div>
                      <div class="form-item">
                          <label>订单总金额 (USD)</label>
                          <div class="preview-value amount-highlight">$${formatNumber(totalAmount)}</div>
                      </div>
                      <div class="form-item">
                          <label>订单状态</label>
                          <div class="preview-value">${escapeHtml(order.status || '已创建')}</div>
                      </div>
                  </div>
      </div>
          </div>

          <!-- (2) 产品明细 -->
          <div class="content-section ${productType === 2 ? 'template-2' : productType === 3 ? 'template-3' : 'template-1'}" id="preview-section-products">
              <div class="content-section-header">
                  <span>（2）产品明细：PP CONTAINER BAGS</span>
              </div>
              <div class="content-section-body">
                  ${items.length > 0 ? `
                  <!-- 产品统计卡片 -->
                  <div class="product-stats-cards">
                      <div class="product-stat-card">
                          <div class="stat-card-icon">📦</div>
                          <div class="stat-card-content">
                              <div class="stat-card-label">产品种类</div>
                              <div class="stat-card-value">${items.length}</div>
                          </div>
                      </div>
                      <div class="product-stat-card">
                          <div class="stat-card-icon">📊</div>
                          <div class="stat-card-content">
                              <div class="stat-card-label">总数量</div>
                              <div class="stat-card-value">${formatNumber(totalQuantity)}</div>
                          </div>
                      </div>
                      <div class="product-stat-card">
                          <div class="stat-card-icon">📋</div>
                          <div class="stat-card-content">
                              <div class="stat-card-label">总件数</div>
                              <div class="stat-card-value">${formatNumber(totalPackages)}</div>
                          </div>
                      </div>
                      <div class="product-stat-card highlight">
                          <div class="stat-card-icon">💰</div>
                          <div class="stat-card-content">
                              <div class="stat-card-label">订单金额</div>
                              <div class="stat-card-value">$${formatNumber(totalAmount)}</div>
                          </div>
                      </div>
                  </div>
                  
                  <!-- 产品表格 -->
                  <div class="table-container">
                      <table class="product-table-preview product-table-centered">
        <thead>
                  <tr>
                                  <th class="col-no">序号</th>
                                  <th class="col-model">产品型号</th>
                                  <th class="col-quantity">数量</th>
                                  <th class="col-packages">件数</th>
                                  <th class="col-unit">单位</th>
                                  <th class="col-price">单价 (USD)</th>
                                  <th class="col-amount">金额 (USD)</th>
                                  <th class="col-packing">包装</th>
                                  <th class="col-weight">实际重量</th>
                                  <th class="col-weight">预估重量</th>
                                  ${productType === 1 ? '<th class="col-cleanliness">清洁度</th><th class="col-label-weight">标签重量</th><th class="col-safety-factor">安全系数</th>' : ''}
                                  ${productType === 2 ? '<th class="col-cleanliness">清洁度</th><th class="col-label-batch">标签批号</th><th class="col-label-desc">标签说明</th>' : ''}
                                  ${productType === 3 ? '<th class="col-wrapping-cloth">包皮布</th><th class="col-label-desc">标签说明</th><th class="col-marks">唛头</th>' : ''}
                                  <th class="col-status">启用</th>
                  </tr>
        </thead>
        <tbody>
                  ${items.map((item, index) => {
        // 计算包装：数量/件数，显示为"XX条/件数单位"
        const qty = parseFloat(item.quantity) || 0;
        const pkgs = parseFloat(item.packages) || 0;
        const unit = item.unit || '件';
        let calculatedPacking = '';
        if (qty > 0 && pkgs > 0) {
            const packingValue = Math.round((qty / pkgs) * 100) / 100;
            calculatedPacking = `${packingValue}条/${unit}`;
        }

        const calculatedAmount = (item.quantity && item.unitPrice)
            ? (parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(2)
            : (item.amount ? parseFloat(item.amount).toFixed(2) : '0.00');
        const estimatedWeight = item.weight || item.estimatedWeight || '';
        const enabled = item.enabled !== false ? '是' : '否';

        // 基础列（所有类型都有）
        let rowHTML = `
                                      <td class="col-no">${index + 1}</td>
                                      <td class="col-model"><strong>${escapeHtml(item.model || '-')}</strong></td>
                                      <td class="col-quantity"><strong>${formatNumber(item.quantity)}</strong></td>
                                      <td class="col-packages">${formatNumber(item.packages)}</td>
                                      <td class="col-unit">${escapeHtml(item.unit || '-')}</td>
                                      <td class="col-price">${item.unitPrice ? '$' + formatNumber(item.unitPrice) : '-'}</td>
                                      <td class="col-amount"><strong>${calculatedAmount ? '$' + formatNumber(calculatedAmount) : '$0'}</strong></td>
                                      <td class="col-packing">${calculatedPacking || (item.packing || '-')}</td>
                                      <td class="col-weight">${formatNumber(item.actualWeight) || '-'}</td>
                                      <td class="col-weight">${formatNumber(estimatedWeight) || '-'}</td>
                                  `;

        // 根据产品类型添加特定列
        if (productType === 1) {
            // A类品：清洁度、标签重量、安全系数
            rowHTML += `
                                          <td class="col-cleanliness">${escapeHtml(item.cleanliness || '-')}</td>
                                          <td class="col-label-weight">${item.labelWeight ? (isNaN(Number(item.labelWeight)) ? escapeHtml(String(item.labelWeight)) : Math.round(Number(item.labelWeight) || 0)) : '-'}</td>
                                          <td class="col-safety-factor">${escapeHtml(item.safetyFactor || '-')}</td>
                                      `;
        } else if (productType === 2) {
            // B类品：清洁度、标签批号、标签说明
            rowHTML += `
                                          <td class="col-cleanliness">${escapeHtml(item.cleanliness || '-')}</td>
                                          <td class="col-label-batch">${escapeHtml(item.labelBatchNo || '-')}</td>
                                          <td class="col-label-desc">${escapeHtml(item.label || '-')}</td>
                                      `;
        } else if (productType === 3) {
            // C类品：包皮布、标签说明、唛头（与编辑页、单据共用 order-item-marks 规则）
            const n = normalizeOrderItem(item);
            const marksDisplay = formatOrderQuickPreviewMarksCellInnerHtml(item, order.contractNo || '', escapeHtml);
            rowHTML += `
                                          <td class="col-wrapping-cloth">${escapeHtml(n.wrappingCloth || '-')}</td>
                                          <td class="col-label-desc">${escapeHtml(item.label || '-')}</td>
                                          <td class="col-marks">${marksDisplay}</td>
                                      `;
        }

        // 启用列
        rowHTML += `
                                      <td class="col-status">
                                          <span class="enabled-badge ${item.enabled !== false ? 'enabled' : 'disabled'}">${enabled}</span>
                                      </td>
                                  `;

        return `<tr>${rowHTML}</tr>`;
    }).join('')}
        </tbody>
        <tfoot>
                              <tr class="summary-row">
                                  <td colspan="2" class="summary-label"><strong>合计</strong></td>
                                  <td class="summary-value"><strong>${formatNumber(totalQuantity)}</strong></td>
                                  <td class="summary-value"><strong>${formatNumber(totalPackages)}</strong></td>
                                  <td colspan="2" class="summary-empty"></td>
                                  <td class="summary-value total-amount"><strong>$${formatNumber(totalAmount)}</strong></td>
                                  <td class="summary-empty"></td>
                                  <td class="summary-empty"></td>
                                  <td class="summary-empty"></td>
                                  <td colspan="${productType === 1 ? '3' : productType === 2 ? '3' : productType === 3 ? '3' : '3'}" class="summary-empty"></td>
                                  <td class="summary-empty"></td>
                  </tr>
        </tfoot>
              </table>
      </div>
      ` : `
      <div class="empty-state">
              <div class="empty-icon">📦</div>
              <div class="empty-text">暂无产品信息</div>
              <div class="empty-hint">该订单尚未添加产品明细</div>
      </div>
      `}
              </div>
          </div>

          <!-- (3) 生产通知信息 -->
          ${generateProductionInfoNew(order, extras)}

          <!-- (4) 拉货通知信息 -->
          ${generatePickupInfoNew(order, extras)}

          <!-- 订单备注 -->
          ${extras.note || extras.remark || order.note ? `
          <div class="content-section" id="preview-section-notes">
              <div class="content-section-header">订单备注</div>
              <div class="content-section-body">
                  <div class="preview-textarea">${escapeHtml(extras.note || extras.remark || order.note || '').replace(/\n/g, '<br/>')}</div>
          </div>
          </div>
          ` : ''}
  </div>
  `;
}

// 绑定模态框事件
function bindModalEvents(modal, order) {
    // 关闭按钮
    const closeBtn = modal.querySelector('.modal-close');
    const closeBtnFooter = modal.querySelector('#btnClosePreview');

    const closeModal = () => modal.remove();

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeBtnFooter) closeBtnFooter.addEventListener('click', closeModal);

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // ESC键关闭
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // 编辑按钮
    const editBtn = modal.querySelector('#btnEditFromPreview');
    if (editBtn && order) {
        editBtn.addEventListener('click', () => {
            closeModal();
            // 找到订单在state.orders中的索引
            const orderIndex = window.state?.orders?.findIndex(o => o.id === order.id);
            if (orderIndex !== -1) {
                // 触发编辑订单
                const editEvent = new CustomEvent('editOrder', { detail: { index: orderIndex } });
                document.dispatchEvent(editEvent);
                // 跳转到SPA内的订单编辑页面
                location.hash = `#/orders/edit?id=${order.id}`;
            }
        });
    }

    // 生成单据按钮
    const docsBtn = modal.querySelector('#btnDocsFromPreview');
    if (docsBtn && order) {
        docsBtn.addEventListener('click', () => {
            closeModal();
            // 跳转到新的单据生成页面
            location.hash = `#/document-center/generate?orderId=${order.id}`;
        });
    }
}

// 辅助函数
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function formatNumber(num) {
    if (num === null || num === undefined || num === '') return '-';
    const n = parseFloat(num);
    if (isNaN(n)) return '-';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getStatusClass(status) {
    switch (status) {
        case '已创建': return 'status-created';
        case '已排产': return 'status-scheduled';
        case '已发货': return 'status-shipped';
        case '已完成': return 'status-completed';
        default: return 'status-created';
    }
}

// 添加预览样式（确保样式只添加一次）
if (!document.getElementById('order-preview-styles')) {
    const style = document.createElement('style');
    style.id = 'order-preview-styles';
    style.textContent = `
  /* 模态框基础样式 */
  .order-preview-modal {
  z-index: 10000 !important;
  }

  .order-preview-modal .modal-content {
  animation: slideDown 0.3s ease-out;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  @keyframes slideDown {
  from {
      opacity: 0;
      transform: translateY(-30px);
  }
  to {
      opacity: 1;
      transform: translateY(0);
  }
  }

  /* 模态框头部 */
  .order-preview-modal .modal-header {
  background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
  color: #1e40af;
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 12px 12px 0 0;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  }

  .order-preview-modal .modal-header h3 {
  font-size: 20px;
  font-weight: 700;
  }

  .order-preview-modal .modal-close {
  background: rgba(30, 64, 175, 0.08);
  border: none;
  color: #1e40af;
  font-size: 28px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  }

  .order-preview-modal .modal-close:hover {
  background: rgba(30, 64, 175, 0.15);
  transform: rotate(90deg);
  }

  /* 订单预览内容容器 */
  .order-preview-content {
  padding: 24px;
  background: linear-gradient(180deg, #f9fafb 0%, #f1f5f9 100%);
  font-size: 14px;
  position: relative;
  }

  .order-preview-content::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b);
  opacity: 0.6;
  }

  /* 内容区块样式 - 参考编辑页面 */
  .order-preview-content .content-section {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
  margin-bottom: 24px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(226, 232, 240, 0.8);
  }

  .order-preview-content .content-section:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
  border-color: #cbd5e1;
  }

  .order-preview-content .content-section-header {
  padding: 14px 24px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(147, 197, 253, 0.25) 100%);
  color: #1e40af;
  font-size: 15px;
  font-weight: 700;
  border-bottom: 2px solid rgba(191, 219, 254, 0.6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  letter-spacing: 0.3px;
  position: relative;
  }

  .order-preview-content .content-section-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, #3b82f6, #8b5cf6);
  }

  /* A类品：浅蓝色渐变（默认） */
  .order-preview-content .content-section.template-1 .content-section-header,
  .order-preview-content .content-section:not(.template-2):not(.template-3) .content-section-header {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(147, 197, 253, 0.25) 100%);
  color: #1e40af;
  border-bottom: 2px solid rgba(191, 219, 254, 0.6);
  }

  .order-preview-content .content-section.template-1 .content-section-header::before {
  background: linear-gradient(180deg, #3b82f6, #8b5cf6);
  }

  /* B类品：浅橙色渐变 */
  .order-preview-content .content-section.template-2 .content-section-header {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(251, 191, 36, 0.25) 100%);
  color: #92400e;
  border-bottom: 2px solid rgba(253, 230, 138, 0.6);
  }

  .order-preview-content .content-section.template-2 .content-section-header::before {
  background: linear-gradient(180deg, #f59e0b, #fbbf24);
  }

  /* C类品：浅粉色渐变 */
  .order-preview-content .content-section.template-3 .content-section-header {
  background: linear-gradient(135deg, rgba(249, 168, 212, 0.25) 0%, rgba(251, 207, 232, 0.25) 100%);
  color: #9f1239;
  border-bottom: 2px solid rgba(252, 231, 243, 0.6);
  }

  .order-preview-content .content-section.template-3 .content-section-header::before {
  background: linear-gradient(180deg, #ec4899, #f472b6);
  }

  .order-preview-content .content-section-body {
  padding: 24px;
  }

  /* 表单网格布局 */
  .order-preview-content .form-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px 20px;
  }

  @media (max-width: 1600px) {
  .order-preview-content .form-grid {
      grid-template-columns: repeat(5, 1fr);
  }
  }

  @media (max-width: 1400px) {
  .order-preview-content .form-grid {
      grid-template-columns: repeat(4, 1fr);
  }
  }

  @media (max-width: 1200px) {
  .order-preview-content .form-grid {
      grid-template-columns: repeat(3, 1fr);
  }
  }

  @media (max-width: 900px) {
  .order-preview-content .form-grid {
      grid-template-columns: repeat(2, 1fr);
  }
  }

  @media (max-width: 600px) {
  .order-preview-content .form-grid {
      grid-template-columns: 1fr;
  }
  }

  /* 表单项 */
  .order-preview-content .form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  }

  .order-preview-content .form-item.full-width {
  grid-column: 1 / -1;
  }

  .order-preview-content .form-item label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
  }

  .order-preview-content .preview-value {
  font-size: 14px;
  color: #0f172a;
  font-weight: 500;
  padding: 10px 12px;
  min-height: 24px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  transition: all 0.2s ease;
  }

  .order-preview-content .form-item:hover .preview-value {
  background: #f1f5f9;
  border-color: #cbd5e1;
  }

  .order-preview-content .preview-value.highlight-value {
  font-weight: 700;
  color: #1e40af;
  font-size: 15px;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: #93c5fd;
  }

  .order-preview-content .preview-textarea {
  font-size: 13px;
  line-height: 1.8;
  color: #334155;
  padding: 14px 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  white-space: pre-wrap;
  word-wrap: break-word;
  min-height: 80px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
  }

  .order-preview-content .form-item:hover .preview-textarea {
  border-color: #cbd5e1;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.06);
  }

  /* 信息区块 - 美化样式 */
  .order-preview-modal .info-section {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 16px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  }

  .order-preview-modal .info-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899);
  opacity: 0;
  transition: opacity 0.3s ease;
  }

  .order-preview-modal .info-section:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
  border-color: #cbd5e1;
  }

  .order-preview-modal .info-section:hover::before {
  opacity: 1;
  }

  .order-preview-modal .info-section.highlight-section {
  background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%);
  border-color: #fb923c;
  box-shadow: 0 8px 24px rgba(251, 146, 60, 0.2), 0 4px 12px rgba(251, 146, 60, 0.15);
  }

  .order-preview-modal .info-section.highlight-section::before {
  background: linear-gradient(90deg, #f59e0b, #fb923c, #f97316);
  opacity: 1;
  }

  .order-preview-modal .section-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 2px solid transparent;
  border-image: linear-gradient(90deg, #3b82f6, #8b5cf6) 1;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.3px;
  }

  .order-preview-modal .section-icon {
  font-size: 18px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }

  .order-preview-modal .section-badge {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  padding: 4px 10px;
  border-radius: 12px;
  margin-left: auto;
  border: 1px solid #cbd5e1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  letter-spacing: 0.5px;
  }

  /* 信息网格 - 使用更具体的选择器确保样式生效 */
  .modal-dialog-overlay .info-grid,
  .order-preview-modal .info-grid {
  display: grid !important;
  gap: 8px;
  }

  .modal-dialog-overlay .info-grid.three-cols,
  .order-preview-modal .info-grid.three-cols {
  grid-template-columns: repeat(3, 1fr) !important;
  }

  .modal-dialog-overlay .info-grid.four-cols,
  .order-preview-modal .info-grid.four-cols {
  grid-template-columns: repeat(4, 1fr) !important;
  }

  .modal-dialog-overlay .info-grid.five-cols,
  .order-preview-modal .info-grid.five-cols {
  grid-template-columns: repeat(5, 1fr) !important;
  }

  .modal-dialog-overlay .info-grid.six-cols,
  .order-preview-modal .info-grid.six-cols {
  grid-template-columns: repeat(6, 1fr) !important;
  }

  .modal-dialog-overlay .info-grid.two-cols,
  .order-preview-modal .info-grid.two-cols {
  grid-template-columns: repeat(2, 1fr) !important;
  }

  @media (max-width: 1400px) {
  .modal-dialog-overlay .info-grid.five-cols,
  .order-preview-modal .info-grid.five-cols {
      grid-template-columns: repeat(4, 1fr) !important;
  }
  .modal-dialog-overlay .info-grid.six-cols,
  .order-preview-modal .info-grid.six-cols {
      grid-template-columns: repeat(4, 1fr) !important;
  }
  }

  @media (max-width: 1200px) {
  .modal-dialog-overlay .info-grid.three-cols,
  .modal-dialog-overlay .info-grid.four-cols,
  .modal-dialog-overlay .info-grid.five-cols,
  .modal-dialog-overlay .info-grid.six-cols,
  .order-preview-modal .info-grid.three-cols,
  .order-preview-modal .info-grid.four-cols,
  .order-preview-modal .info-grid.five-cols,
  .order-preview-modal .info-grid.six-cols {
      grid-template-columns: repeat(3, 1fr) !important;
  }
  }

  @media (max-width: 900px) {
  .modal-dialog-overlay .info-grid.three-cols,
  .modal-dialog-overlay .info-grid.four-cols,
  .modal-dialog-overlay .info-grid.five-cols,
  .modal-dialog-overlay .info-grid.six-cols,
  .order-preview-modal .info-grid.three-cols,
  .order-preview-modal .info-grid.four-cols,
  .order-preview-modal .info-grid.five-cols,
  .order-preview-modal .info-grid.six-cols {
      grid-template-columns: repeat(2, 1fr) !important;
  }
  }

  @media (max-width: 768px) {
  .modal-dialog-overlay .info-grid.three-cols,
  .modal-dialog-overlay .info-grid.four-cols,
  .modal-dialog-overlay .info-grid.five-cols,
  .modal-dialog-overlay .info-grid.six-cols,
  .modal-dialog-overlay .info-grid.two-cols,
  .order-preview-modal .info-grid.three-cols,
  .order-preview-modal .info-grid.four-cols,
  .order-preview-modal .info-grid.five-cols,
  .order-preview-modal .info-grid.six-cols,
  .order-preview-modal .info-grid.two-cols {
      grid-template-columns: 1fr !important;
  }
  }

  .order-preview-modal .info-item {
  padding: 10px 14px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 10px;
  min-height: 42px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .order-preview-modal .info-item:hover {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #cbd5e1;
  }

  .order-preview-modal .info-item.highlight-item {
  background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%);
  border: 1.5px solid #fb923c;
  box-shadow: 0 4px 12px rgba(251, 146, 60, 0.2);
  }

  .order-preview-modal .info-item.highlight-item:hover {
  background: linear-gradient(135deg, #ffedd5 0%, #fed7aa 50%, #fdba74 100%);
  box-shadow: 0 6px 16px rgba(251, 146, 60, 0.3);
  transform: translateY(-2px);
  }

  .order-preview-modal .info-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
  flex-shrink: 0;
  white-space: nowrap;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  opacity: 0.8;
  }

  .order-preview-modal .info-value {
  font-size: 14px;
  color: #0f172a;
  font-weight: 700;
  text-align: right;
  flex: 1;
  min-width: 0;
  word-break: break-word;
  letter-spacing: 0.1px;
  }

  .order-preview-modal .info-text {
  font-size: 13px;
  line-height: 1.5;
  color: #6b7280;
  font-weight: 500;
  display: inline-block;
  width: 100%;
  }

  .order-preview-modal .info-text .info-value {
  color: #1f2937;
  font-weight: 500;
  display: inline;
  margin: 0;
  padding: 0;
  }

  .order-preview-modal .info-value.strong {
  font-weight: 800;
  color: #0f172a;
  font-size: 15px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .order-preview-modal .amount-highlight {
  color: #059669;
  font-weight: 800;
  font-size: 16px;
  text-shadow: 0 1px 3px rgba(5, 150, 105, 0.2);
  }

  .order-preview-modal .product-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  }

  .order-preview-modal .product-type-badge::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
  }

  .order-preview-modal .product-type-badge:hover {
  transform: scale(1.08) translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .order-preview-modal .product-type-badge:hover::before {
  width: 300px;
  height: 300px;
  }

  .order-preview-modal .product-type-badge.product-type-1 {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  color: #991b1b;
  border: 1px solid #fca5a5;
  }

  .order-preview-modal .product-type-badge.product-type-2 {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #1e40af;
  border: 1px solid #93c5fd;
  }

  .order-preview-modal .product-type-badge.product-type-3 {
  background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%);
  color: #6b21a8;
  border: 1px solid #c084fc;
  }

  /* 全宽字段（如备注） */
  .info-field.full-width {
  margin-top: 6px;
  }

  .info-field.full-width .info-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  }

  .info-textarea {
  font-size: 13px;
  line-height: 1.8;
  padding: 12px 14px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  color: #334155;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin-top: 8px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.04);
  }

  /* 表格容器 */
  .order-preview-content .table-container {
  overflow-x: auto;
  margin: 0;
  border-radius: 8px;
  }

  .order-preview-content .table-container::-webkit-scrollbar {
  height: 8px;
  }

  .order-preview-content .table-container::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
  }

  .order-preview-content .table-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
  }

  .order-preview-content .table-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
  }

  .table-wrapper::-webkit-scrollbar {
  height: 8px;
  }

  .table-wrapper::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
  }

  .table-wrapper::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
  }

  .table-wrapper::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
  }

  /* 产品统计卡片 */
  .product-stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
  }

  @media (max-width: 1200px) {
  .product-stats-cards {
      grid-template-columns: repeat(2, 1fr);
  }
  }

  @media (max-width: 600px) {
  .product-stats-cards {
      grid-template-columns: 1fr;
  }
  }

  .product-stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .product-stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1);
  border-color: #cbd5e1;
  }

  .product-stat-card.highlight {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #bbf7d0 100%);
  border-color: #86efac;
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.25), 0 4px 12px rgba(16, 185, 129, 0.15);
  }

  .stat-card-icon {
  font-size: 28px;
  opacity: 0.9;
  flex-shrink: 0;
  }

  .stat-card-content {
  flex: 1;
  min-width: 0;
  }

  .stat-card-label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  }

  .stat-card-value {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
  }

  .product-stat-card.highlight .stat-card-value {
  color: #059669;
  font-size: 20px;
  }

  /* 重构后的预览窗口产品表格样式 */
  .order-preview-content .product-table-preview,
  .modal-dialog-overlay .product-table-preview {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  font-size: 13px;
  background: white;
  border-radius: 10px;
  overflow: hidden;
  table-layout: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .order-preview-content .product-table-preview.product-table-centered th,
  .order-preview-content .product-table-preview.product-table-centered td,
  .modal-dialog-overlay .product-table-preview.product-table-centered th,
  .modal-dialog-overlay .product-table-preview.product-table-centered td {
  text-align: center !important;
  vertical-align: middle !important;
  }

  .order-preview-content .product-table-preview.product-table-centered td strong,
  .modal-dialog-overlay .product-table-preview.product-table-centered td strong {
  display: inline-block;
  width: 100%;
  }

  /* 表头样式 */
  .order-preview-content .product-table-preview thead,
  .modal-dialog-overlay .product-table-preview thead {
  background: #f8f9fa;
  color: #495057;
  }

  .order-preview-content .product-table-preview th,
  .modal-dialog-overlay .product-table-preview th {
  padding: 14px 12px;
  font-weight: 700;
  font-size: 12px;
  text-align: center;
  white-space: nowrap;
  border-right: 1px solid #dee2e6;
  border-bottom: 2px solid #dee2e6;
  }

  .order-preview-content .product-table-preview th:last-child,
  .modal-dialog-overlay .product-table-preview th:last-child {
  border-right: none;
  }

  /* 数据行样式 */
  .order-preview-content .product-table-preview td,
  .modal-dialog-overlay .product-table-preview td {
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  border-right: 1px solid #f1f5f9;
  font-size: 13px;
  vertical-align: middle;
  }

  .order-preview-content .product-table-preview td:last-child,
  .modal-dialog-overlay .product-table-preview td:last-child {
  border-right: none;
  }

  /* 列对齐样式 */
  .order-preview-content .product-table-preview .col-no,
  .modal-dialog-overlay .product-table-preview .col-no {
  width: 50px;
  min-width: 50px;
  text-align: center;
  font-weight: 600;
  }

  .order-preview-content .product-table-preview .col-model,
  .modal-dialog-overlay .product-table-preview .col-model {
  min-width: 150px;
  text-align: center;
  }

  .order-preview-content .product-table-preview .col-quantity,
  .order-preview-content .product-table-preview .col-packages,
  .order-preview-content .product-table-preview .col-amount,
  .modal-dialog-overlay .product-table-preview .col-quantity,
  .modal-dialog-overlay .product-table-preview .col-packages,
  .modal-dialog-overlay .product-table-preview .col-amount {
  text-align: center;
  }

  .order-preview-content .product-table-preview .col-unit,
  .order-preview-content .product-table-preview .col-status,
  .modal-dialog-overlay .product-table-preview .col-unit,
  .modal-dialog-overlay .product-table-preview .col-status {
  text-align: center;
  }

  .order-preview-content .product-table-preview .col-price,
  .modal-dialog-overlay .product-table-preview .col-price {
  text-align: center;
  }

  /* 特殊列样式 */
  .order-preview-content .product-table-preview .col-model,
  .modal-dialog-overlay .product-table-preview .col-model {
  color: #1e40af;
  font-weight: 700;
  }

  .order-preview-content .product-table-preview .col-amount,
  .modal-dialog-overlay .product-table-preview .col-amount {
  color: #059669;
  font-weight: 700;
  }

  /* 行悬停效果 */
  .order-preview-content .product-table-preview tbody tr:hover,
  .modal-dialog-overlay .product-table-preview tbody tr:hover {
  background-color: #f8fafc;
  }

  /* 合计行样式 */
  .order-preview-content .product-table-preview tfoot,
  .modal-dialog-overlay .product-table-preview tfoot {
  background: #f8fafc;
  font-weight: 700;
  }

  .order-preview-content .product-table-preview .summary-label,
  .modal-dialog-overlay .product-table-preview .summary-label {
  text-align: center;
  padding-left: 20px;
  }

  .order-preview-content .product-table-preview .summary-value,
  .modal-dialog-overlay .product-table-preview .summary-value {
  text-align: center;
  }

  .order-preview-content .product-table-preview .total-amount,
  .modal-dialog-overlay .product-table-preview .total-amount {
  color: #059669;
  font-size: 16px;
  }

  /* 使用固定宽度百分比确保列对齐 - 所有产品类型 */
  /* 基础列（所有类型都有） */
  .order-preview-content .product-table th.col-no,
  .order-preview-content .product-table td.col-no,
  .modal-dialog-overlay .product-table th.col-no,
  .modal-dialog-overlay .product-table td.col-no {
  width: 4% !important;
  min-width: 50px !important;
  max-width: 60px !important;
  display: table-cell !important;
  visibility: visible !important;
  opacity: 1 !important;
  padding: 14px 10px !important;
  text-align: center !important;
  background-color: transparent !important;
  }
  
  /* 确保序号列内容可见且不被覆盖 */
  .order-preview-content .product-table td.col-no *,
  .modal-dialog-overlay .product-table td.col-no * {
  display: inline !important;
  visibility: visible !important;
  opacity: 1 !important;
  }

  .order-preview-content .product-table th.col-model,
  .order-preview-content .product-table td.col-model,
  .modal-dialog-overlay .product-table th.col-model,
  .modal-dialog-overlay .product-table td.col-model {
  width: 14% !important;
  min-width: 120px !important;
  }

  .order-preview-content .product-table th.col-quantity,
  .order-preview-content .product-table td.col-quantity,
  .modal-dialog-overlay .product-table th.col-quantity,
  .modal-dialog-overlay .product-table td.col-quantity {
  width: 6.5% !important;
  min-width: 70px !important;
  }

  .order-preview-content .product-table th.col-packages,
  .order-preview-content .product-table td.col-packages,
  .modal-dialog-overlay .product-table th.col-packages,
  .modal-dialog-overlay .product-table td.col-packages {
  width: 5.5% !important;
  min-width: 60px !important;
  }

  .order-preview-content .product-table th.col-unit,
  .order-preview-content .product-table td.col-unit,
  .modal-dialog-overlay .product-table th.col-unit,
  .modal-dialog-overlay .product-table td.col-unit {
  width: 4.5% !important;
  min-width: 50px !important;
  }

  .order-preview-content .product-table th.col-price,
  .order-preview-content .product-table td.col-price,
  .modal-dialog-overlay .product-table th.col-price,
  .modal-dialog-overlay .product-table td.col-price {
  width: 6.5% !important;
  min-width: 70px !important;
  }

  .order-preview-content .product-table th.col-amount,
  .order-preview-content .product-table td.col-amount,
  .modal-dialog-overlay .product-table th.col-amount,
  .modal-dialog-overlay .product-table td.col-amount {
  width: 7.5% !important;
  min-width: 80px !important;
  }

  .order-preview-content .product-table th.col-packing,
  .order-preview-content .product-table td.col-packing,
  .modal-dialog-overlay .product-table th.col-packing,
  .modal-dialog-overlay .product-table td.col-packing {
  width: 4.5% !important;
  min-width: 50px !important;
  }

  .order-preview-content .product-table th.col-weight,
  .order-preview-content .product-table td.col-weight,
  .modal-dialog-overlay .product-table th.col-weight,
  .modal-dialog-overlay .product-table td.col-weight {
  width: 5.5% !important;
  min-width: 60px !important;
  }

  /* 类型特定列 */
  .order-preview-content .product-table th.col-cleanliness,
  .order-preview-content .product-table td.col-cleanliness,
  .modal-dialog-overlay .product-table th.col-cleanliness,
  .modal-dialog-overlay .product-table td.col-cleanliness {
  width: 5.5% !important;
  min-width: 60px !important;
  }

  .order-preview-content .product-table th.col-wrapping-cloth,
  .order-preview-content .product-table td.col-wrapping-cloth,
  .modal-dialog-overlay .product-table th.col-wrapping-cloth,
  .modal-dialog-overlay .product-table td.col-wrapping-cloth {
  width: 5.5% !important;
  min-width: 60px !important;
  }

  .order-preview-content .product-table th.col-label-weight,
  .order-preview-content .product-table td.col-label-weight,
  .modal-dialog-overlay .product-table th.col-label-weight,
  .modal-dialog-overlay .product-table td.col-label-weight {
  width: 6.5% !important;
  min-width: 70px !important;
  }

  .order-preview-content .product-table th.col-safety-factor,
  .order-preview-content .product-table td.col-safety-factor,
  .modal-dialog-overlay .product-table th.col-safety-factor,
  .modal-dialog-overlay .product-table td.col-safety-factor {
  width: 6.5% !important;
  min-width: 70px !important;
  }

  .order-preview-content .product-table th.col-label-batch,
  .order-preview-content .product-table td.col-label-batch,
  .modal-dialog-overlay .product-table th.col-label-batch,
  .modal-dialog-overlay .product-table td.col-label-batch {
  width: 6.5% !important;
  min-width: 70px !important;
  }

  .order-preview-content .product-table th.col-label-desc,
  .order-preview-content .product-table td.col-label-desc,
  .modal-dialog-overlay .product-table th.col-label-desc,
  .modal-dialog-overlay .product-table td.col-label-desc {
  width: 7.5% !important;
  min-width: 80px !important;
  }

  .order-preview-content .product-table th.col-marks,
  .order-preview-content .product-table td.col-marks,
  .modal-dialog-overlay .product-table th.col-marks,
  .modal-dialog-overlay .product-table td.col-marks {
  width: 7.5% !important;
  min-width: 80px !important;
  }

  .order-preview-content .product-table th.col-status,
  .order-preview-content .product-table td.col-status,
  .modal-dialog-overlay .product-table th.col-status,
  .modal-dialog-overlay .product-table td.col-status {
  width: 4.5% !important;
  min-width: 50px !important;
  }

  .order-preview-content .product-table thead,
  .modal-dialog-overlay .product-table thead {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%) !important;
  color: white;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }

  .order-preview-content .product-table th,
  .modal-dialog-overlay .product-table th {
  padding: 16px 10px !important;
  font-weight: 700 !important;
  font-size: 12px !important;
  text-align: center !important;
  white-space: nowrap !important;
  position: sticky;
  top: 0;
  z-index: 10;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  border-right: 1px solid rgba(255, 255, 255, 0.2) !important;
  }

  .order-preview-content .product-table th:last-child,
  .modal-dialog-overlay .product-table th:last-child {
  border-right: none !important;
  }

  /* 列分组样式 - 基础列 */
  .order-preview-content .product-table th.col-no,
  .modal-dialog-overlay .product-table th.col-no {
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.9) 0%, rgba(124, 58, 237, 0.9) 100%) !important;
  }

  .order-preview-content .product-table th.col-model,
  .modal-dialog-overlay .product-table th.col-model {
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.95) 0%, rgba(124, 58, 237, 0.95) 100%) !important;
  border-left: 2px solid rgba(255, 255, 255, 0.3) !important;
  border-right: 2px solid rgba(255, 255, 255, 0.3) !important;
  }

  .order-preview-content .product-table th.col-amount,
  .modal-dialog-overlay .product-table th.col-amount {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.8) 0%, rgba(5, 150, 105, 0.8) 100%) !important;
  border-left: 2px solid rgba(255, 255, 255, 0.3) !important;
  }

  /* A类品专用列样式 */
  .order-preview-content .product-table th.col-label-weight,
  .order-preview-content .product-table th.col-safety-factor,
  .modal-dialog-overlay .product-table th.col-label-weight,
  .modal-dialog-overlay .product-table th.col-safety-factor {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.7) 0%, rgba(37, 99, 235, 0.7) 100%) !important;
  }

  /* B类品专用列样式 */
  .order-preview-content .product-table th.col-label-batch,
  .order-preview-content .product-table th.col-label-desc,
  .modal-dialog-overlay .product-table th.col-label-batch,
  .modal-dialog-overlay .product-table th.col-label-desc {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.7) 0%, rgba(217, 119, 6, 0.7) 100%) !important;
  }

  /* C类品专用列样式 */
  .order-preview-content .product-table th.col-wrapping-cloth,
  .order-preview-content .product-table th.col-marks,
  .modal-dialog-overlay .product-table th.col-wrapping-cloth,
  .modal-dialog-overlay .product-table th.col-marks {
  background: linear-gradient(135deg, rgba(249, 168, 212, 0.7) 0%, rgba(236, 72, 153, 0.7) 100%) !important;
  }

  .order-preview-content .product-table td,
  .modal-dialog-overlay .product-table td {
  padding: 14px 10px !important;
  border-bottom: 1px solid #e5e7eb !important;
  border-right: 1px solid #f1f5f9 !important;
  font-size: 13px !important;
  transition: all 0.2s ease;
  vertical-align: middle !important;
  text-align: inherit !important;
  }

  .order-preview-content .product-table td:last-child,
  .modal-dialog-overlay .product-table td:last-child {
  border-right: none !important;
  }

  /* 重要列样式 */
  .order-preview-content .product-table td.col-model,
  .modal-dialog-overlay .product-table td.col-model {
  border-left: 2px solid #e2e8f0 !important;
  border-right: 2px solid #e2e8f0 !important;
  background: #fafbfc !important;
  word-break: break-word !important;
  overflow-wrap: break-word !important;
  text-align: center !important;
  }

  .order-preview-content .product-table td.col-amount,
  .modal-dialog-overlay .product-table td.col-amount {
  border-left: 2px solid #d1fae5 !important;
  background: linear-gradient(90deg, #f0fdf4 0%, #ffffff 100%) !important;
  font-weight: 600 !important;
  text-align: center !important;
  }

  /* A类品专用列样式 */
  .order-preview-content .product-table td.col-label-weight,
  .order-preview-content .product-table td.col-safety-factor,
  .modal-dialog-overlay .product-table td.col-label-weight,
  .modal-dialog-overlay .product-table td.col-safety-factor {
  background: linear-gradient(90deg, #eff6ff 0%, #ffffff 100%) !important;
  border-left: 1px solid #bfdbfe !important;
  }

  /* B类品专用列样式 */
  .order-preview-content .product-table td.col-label-batch,
  .order-preview-content .product-table td.col-label-desc,
  .modal-dialog-overlay .product-table td.col-label-batch,
  .modal-dialog-overlay .product-table td.col-label-desc {
  background: linear-gradient(90deg, #fffbeb 0%, #ffffff 100%) !important;
  border-left: 1px solid #fde68a !important;
  }

  /* C类品专用列样式 */
  .order-preview-content .product-table td.col-wrapping-cloth,
  .order-preview-content .product-table td.col-marks,
  .modal-dialog-overlay .product-table td.col-wrapping-cloth,
  .modal-dialog-overlay .product-table td.col-marks {
  background: linear-gradient(90deg, #fdf2f8 0%, #ffffff 100%) !important;
  border-left: 1px solid #fbcfe8 !important;
  word-break: break-word !important;
  overflow-wrap: break-word !important;
  }

  .order-preview-content .product-table tbody tr,
  .modal-dialog-overlay .product-table tbody tr {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  }

  .order-preview-content .product-table tbody tr::before,
  .modal-dialog-overlay .product-table tbody tr::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #3b82f6, #8b5cf6);
  opacity: 0;
  transition: opacity 0.3s ease;
  }

  .order-preview-content .product-table tbody tr:hover,
  .modal-dialog-overlay .product-table tbody tr:hover {
  background: linear-gradient(90deg, #eff6ff 0%, #dbeafe 100%) !important;
  transform: translateX(2px);
  box-shadow: 0 2px 12px rgba(59, 130, 246, 0.15);
  }

  .order-preview-content .product-table tbody tr:hover::before,
  .modal-dialog-overlay .product-table tbody tr:hover::before {
  opacity: 1;
  }

  .order-preview-content .product-table tbody tr:nth-child(even),
  .modal-dialog-overlay .product-table tbody tr:nth-child(even) {
  background: linear-gradient(90deg, #fafbfc 0%, #f8fafc 100%) !important;
  }

  .order-preview-content .product-table tbody tr:nth-child(even):hover,
  .modal-dialog-overlay .product-table tbody tr:nth-child(even):hover {
  background: linear-gradient(90deg, #eff6ff 0%, #dbeafe 100%) !important;
  }

  .order-preview-content .product-table .product-model,
  .modal-dialog-overlay .product-table .product-model {
  font-weight: 700 !important;
  color: #1e40af !important;
  word-break: break-word !important;
  overflow-wrap: break-word !important;
  font-size: 14px !important;
  line-height: 1.5 !important;
  text-align: left !important;
  }

  .order-preview-content .product-table .col-quantity,
  .order-preview-content .product-table .col-amount,
  .modal-dialog-overlay .product-table .col-quantity,
  .modal-dialog-overlay .product-table .col-amount {
  font-weight: 600 !important;
  color: #0f172a !important;
  }

  .order-preview-content .product-table .text-center,
  .modal-dialog-overlay .product-table .text-center {
  text-align: center !important;
  }

  .order-preview-content .product-table .text-right,
  .modal-dialog-overlay .product-table .text-right {
  text-align: right !important;
  }

  .order-preview-content .product-table .text-left,
  .modal-dialog-overlay .product-table .text-left {
  text-align: left !important;
  }

  .order-preview-content .product-table .amount,
  .modal-dialog-overlay .product-table .amount {
  color: #059669 !important;
  font-weight: 700 !important;
  font-size: 13px !important;
  }

  .order-preview-content .product-table tfoot,
  .modal-dialog-overlay .product-table tfoot {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
  border-top: 3px solid #4f46e5 !important;
  box-shadow: 0 -2px 8px rgba(79, 70, 229, 0.1);
  }

  .order-preview-content .product-table tfoot tr.summary-row,
  .modal-dialog-overlay .product-table tfoot tr.summary-row {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
  }

  .order-preview-content .product-table tfoot td,
  .modal-dialog-overlay .product-table tfoot td {
  padding: 16px 10px !important;
  font-weight: 700 !important;
  font-size: 14px !important;
  border-right: 1px solid #e2e8f0 !important;
  }

  .order-preview-content .product-table tfoot td.summary-label,
  .modal-dialog-overlay .product-table tfoot td.summary-label {
  font-size: 15px !important;
  color: #1e40af !important;
  padding-left: 20px !important;
  text-align: left !important;
  }

  .order-preview-content .product-table tfoot td.summary-value,
  .modal-dialog-overlay .product-table tfoot td.summary-value {
  color: #0f172a !important;
  font-size: 15px !important;
  }

  .order-preview-content .product-table tfoot td.summary-empty,
  .modal-dialog-overlay .product-table tfoot td.summary-empty {
  border-right: none !important;
  }

  .order-preview-content .product-table .total-amount,
  .modal-dialog-overlay .product-table .total-amount {
  color: #059669 !important;
  font-size: 18px !important;
  font-weight: 800 !important;
  text-shadow: 0 1px 3px rgba(5, 150, 105, 0.2);
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%) !important;
  border-left: 3px solid #10b981 !important;
  text-align: center !important;
  }

  /* 统计卡片 */
  .stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 10px;
  }

  @media (max-width: 768px) {
  .stats-row {
      grid-template-columns: repeat(2, 1fr);
  }
  }

  .stat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  }

  .stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, #3b82f6, #8b5cf6);
  opacity: 0;
  transition: opacity 0.3s ease;
  }

  .stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1);
  border-color: #cbd5e1;
  }

  .stat-card:hover::before {
  opacity: 1;
  }

  .stat-card.highlight {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #bbf7d0 100%);
  border-color: #86efac;
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.25), 0 4px 12px rgba(16, 185, 129, 0.15);
  }

  .stat-card.highlight::before {
  background: linear-gradient(180deg, #10b981, #059669);
  opacity: 1;
  }

  .stat-icon {
  font-size: 20px;
  opacity: 0.9;
  flex-shrink: 0;
  }

  .stat-info {
  flex: 1;
  min-width: 0;
  }

  .stat-label {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 2px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  }

  .stat-value {
  font-size: 15px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
  }

  .stat-card.highlight .stat-value {
  color: #059669;
  font-size: 16px;
  }

  /* 空状态 - 美化样式 */
  .empty-state {
  text-align: center;
  padding: 60px 32px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 12px;
  border: 2px dashed #cbd5e1;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.04);
  position: relative;
  overflow: hidden;
  }

  .empty-state::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 70%);
  animation: pulse 3s ease-in-out infinite;
  }

  @keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.8; }
  }

  .empty-icon {
  font-size: 80px;
  opacity: 0.5;
  margin-bottom: 24px;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
  position: relative;
  z-index: 1;
  animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  }

  .empty-text {
  font-size: 18px;
  font-weight: 700;
  color: #475569;
  margin-bottom: 12px;
  letter-spacing: 0.4px;
  position: relative;
  z-index: 1;
  }

  .empty-hint {
  font-size: 14px;
  color: #64748b;
  font-weight: 500;
  position: relative;
  z-index: 1;
  }

  /* 底部按钮 */
  .modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-top: 2px solid #e5e7eb;
  background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
  border-radius: 0 0 12px 12px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.04);
  }

  .footer-left, .footer-right {
  display: flex;
  gap: 10px;
  }

  .btn-secondary, .btn-primary, .btn-success {
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.3px;
  position: relative;
  overflow: hidden;
  }

  .btn-secondary {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  color: #475569;
  border: 2px solid #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  .btn-secondary:hover {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  border-color: #94a3b8;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
  }

  .btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4), 0 2px 6px rgba(59, 130, 246, 0.3);
  }

  .btn-primary:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5), 0 4px 12px rgba(59, 130, 246, 0.4);
  transform: translateY(-2px);
  }

  .btn-primary:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  }

  .btn-success {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4), 0 2px 6px rgba(16, 185, 129, 0.3);
  }

  .btn-success:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5), 0 4px 12px rgba(16, 185, 129, 0.4);
  transform: translateY(-2px);
  }

  .btn-success:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
  }

  /* 生成单据（new）按钮的灰色样式 */
  #btnDocsFromPreview {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 50%, #374151 100%) !important;
  box-shadow: 0 4px 12px rgba(107, 114, 128, 0.4), 0 2px 6px rgba(107, 114, 128, 0.3) !important;
  }
  #btnDocsFromPreview:hover {
  background: linear-gradient(135deg, #4b5563 0%, #374151 50%, #1f2937 100%) !important;
  box-shadow: 0 6px 20px rgba(107, 114, 128, 0.5), 0 4px 12px rgba(107, 114, 128, 0.4) !important;
  transform: translateY(-2px);
  }
  #btnDocsFromPreview:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(107, 114, 128, 0.4) !important;
  }

  /* 状态徽章 - 美化样式 */
  .status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  }

  .status-pill::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
  }

  .status-pill:hover {
  transform: scale(1.08) translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .status-pill:hover::before {
  width: 300px;
  height: 300px;
  }

  .status-pill.status-created {
  background: linear-gradient(135deg, #7C9DFF 0%, #5B8FE8 100%);
  color: white;
  border: 1px solid #5B8FE8;
  }

  .status-pill.status-scheduled {
  background: linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%);
  color: white;
  border: 1px solid #8B5CF6;
  }

  .status-pill.status-shipped {
  background: linear-gradient(135deg, #818CF8 0%, #6366F1 100%);
  color: white;
  border: 1px solid #6366F1;
  }

  .status-pill.status-completed {
  background: linear-gradient(135deg, #6EE7B7 0%, #34D399 100%);
  color: white;
  border: 1px solid #34D399;
  }

  /* 启用状态徽章 */
  .enabled-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  }

  .enabled-badge.enabled {
  background: #d1fae5;
  color: #065f46;
  }

  .enabled-badge.disabled {
  background: #fee2e2;
  color: #991b1b;
  }
  `;
    document.head.appendChild(style);
}

// 注意：不再使用全局事件监听器，由 orders-list-view.js 处理点击事件
// 这样可以确保事件处理时 window.state.orders 已正确同步

// 导出函数
export { showOrderPreview };

// 暴露到全局（保持向后兼容）
if (typeof window !== 'undefined') {
    window.showOrderPreview = showOrderPreview;
}
