/**
 * 货款状态弹窗组件
 * 
 * 功能：
 * - 显示和编辑订单货款状态
 * - 记录货款到账时间和备注
 * - 自动更新订单状态（当设置货款到账时间时）
 */
import { escapeHtml } from '../../utils/format-utils.js';

/**
 * 格式化金额为USD格式
 * @param {number} amount - 金额
 * @returns {string} 格式化后的金额字符串
 */
function fmtMoney(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
}

/**
 * 显示货款状态弹窗
 * @param {Object} order - 订单对象
 * @param {Object} apiService - API服务（可选，如果不提供则使用 window.ApiService）
 * @returns {Promise<void>}
 */
/**
 * 获取当前日期（YYYY-MM-DD格式）
 */
function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/**
 * 初始化货款状态处理逻辑
 * @param {Object} order - 订单对象（用于检查发货日期）
 */
function initPaymentStatusHandler(order = null) {
  const statusRadios = document.querySelectorAll('input[name="paymentStatus"]');
  const paymentDueDateInput = document.getElementById('paymentDueDate');
  
  if (!statusRadios.length || !paymentDueDateInput) {
    // 如果元素还没准备好，延迟重试
    setTimeout(() => initPaymentStatusHandler(order), 50);
    return;
  }
  
  console.log('[货款状态] 初始化状态处理，找到', statusRadios.length, '个单选按钮');
  
  // 使用Set来跟踪已绑定事件的元素，避免重复绑定
  if (!initPaymentStatusHandler._boundElements) {
    initPaymentStatusHandler._boundElements = new WeakSet();
  }
  
  // 绑定状态变化事件
  statusRadios.forEach(radio => {
    // 如果已经绑定过，跳过
    if (initPaymentStatusHandler._boundElements.has(radio)) {
      return;
    }
    
    // 标记为已绑定
    initPaymentStatusHandler._boundElements.add(radio);
    
    radio.addEventListener('change', function() {
      console.log('[货款状态] 状态变化:', this.value);
      if (this.value === 'paid') {
        // 选择"已到账"，自动填充当前日期（无论当前是否有值）
        const currentDate = getCurrentDate();
        paymentDueDateInput.value = currentDate;
        console.log('[货款状态] 已自动填充当前日期:', currentDate);
        
        // 检查当前日期是否早于发货日期
        if (order && order.shipmentDate) {
          const shipmentDate = new Date(order.shipmentDate);
          const currentDateObj = new Date(currentDate);
          
          // 只比较日期部分，忽略时间
          shipmentDate.setHours(0, 0, 0, 0);
          currentDateObj.setHours(0, 0, 0, 0);
          
          if (currentDateObj < shipmentDate) {
            window.NotificationSystem?.toast('当前日期早于发货日期，不允许标记为"已到账"。请检查或修改发货时间。', 'error', 3000);
            // 自动切换回"未到账"
            const unpaidRadio = document.getElementById('statusUnpaid');
            if (unpaidRadio) {
              unpaidRadio.checked = true;
              paymentDueDateInput.value = '';
            }
            return;
          }
        }
        
        // 触发input事件，确保UI更新
        paymentDueDateInput.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (this.value === 'unpaid' || this.value === 'pending') {
        // 选择"未到账"或"即将到账"，清空到账时间
        paymentDueDateInput.value = '';
        paymentDueDateInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
  
  // 检查初始状态：如果已选中"已到账"，自动填充当前日期
  const paidRadio = document.getElementById('statusPaid');
  if (paidRadio && paidRadio.checked) {
    // 如果已选中"已到账"，无论日期是否有值，都填充当前日期
    const currentDate = getCurrentDate();
    
    // 检查当前日期是否早于发货日期
    if (order && order.shipmentDate) {
      const shipmentDate = new Date(order.shipmentDate);
      const currentDateObj = new Date(currentDate);
      
      // 只比较日期部分，忽略时间
      shipmentDate.setHours(0, 0, 0, 0);
      currentDateObj.setHours(0, 0, 0, 0);
      
      if (currentDateObj < shipmentDate) {
        window.NotificationSystem?.toast('当前日期早于发货日期，不允许标记为"已到账"。请检查或修改发货时间。', 'error', 3000);
        // 自动切换回"未到账"
        const unpaidRadio = document.getElementById('statusUnpaid');
        if (unpaidRadio) {
          unpaidRadio.checked = true;
          paymentDueDateInput.value = '';
        }
        return;
      }
    }
    
    paymentDueDateInput.value = currentDate;
    console.log('[货款状态] 初始状态为已到账，已自动填充当前日期:', currentDate);
    paymentDueDateInput.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (paymentDueDateInput && paymentDueDateInput.value) {
    // 如果到账时间有值，自动选中"已到账"
    if (paidRadio) {
      paidRadio.checked = true;
      paidRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

export async function showPaymentStatusDialog(order, apiService = null) {
  return new Promise(async (resolve) => {
    const api = apiService || window.ApiService;
    
    if (!order || !order.id) {
      window.NotificationSystem?.toast('订单数据异常', 'error');
      resolve();
      return;
    }
    
    const orderId = order.id || order.rowid;
    const totalUSD = Number(order.totalUSD || 0);
    
    // 检查订单金额
    if (totalUSD <= 0) {
      window.NotificationSystem?.toast('订单金额为0，无法设置货款状态', 'warning');
      resolve();
      return;
    }
    
    // 获取现有货款状态数据
    const paymentStatus = (order.extras && order.extras.paymentStatus) || {};
    // 根据到账时间自动判断状态：如果有到账时间，默认为已到账；否则为未到账
    const currentStatus = paymentStatus.status || (paymentStatus.paymentDueDate ? 'paid' : 'unpaid');
    const initialData = {
      status: currentStatus,
      paymentDueDate: paymentStatus.paymentDueDate || '',
      remark: paymentStatus.remark || ''
    };
    
    // 构建弹窗HTML
    const bodyHTML = `
      <div style="padding: 0; position: relative; overflow: hidden;">
        <!-- 顶部装饰性渐变背景 -->
        <div style="position: absolute; top: 0; left: 0; right: 0; height: 180px; background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%); opacity: 0.1; pointer-events: none; border-radius: 16px 16px 0 0;"></div>
        
        <!-- 主要内容区域 -->
        <div style="position: relative; padding: 24px; background: linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(255,255,255,1) 100%); backdrop-filter: blur(20px);">
          <!-- 标题区域 -->
          <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 12px; padding: 12px 16px; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5); position: relative; overflow: hidden;">
            <div style="position: absolute; top: -50%; right: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); pointer-events: none;"></div>
            <div style="display: flex; align-items: center; gap: 10px; position: relative; z-index: 1;">
              <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(16, 185, 129, 0.25); flex-shrink: 0;">
                <span style="font-size: 16px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));">💰</span>
              </div>
              <div style="flex: 1; min-width: 0;">
                <h3 style="margin: 0; font-weight: 700; font-size: 15px; color: #1f2937; letter-spacing: -0.01em; line-height: 1.3;">货款状态</h3>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #6b7280; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">订单号：${escapeHtml(order.contractNo || order.orderNo || '-')}</p>
              </div>
            </div>
          </div>
          
          <!-- 表单区域 -->
          <div style="display: grid; grid-template-columns: 1fr; gap: 16px;">
            <!-- 订单总金额（只读） -->
            <div>
              <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-weight: 600; color: #111827; font-size: 14px;">
                <span>订单总金额 (USD)</span>
              </label>
              <input type="text" 
                     id="totalAmount" 
                     readonly 
                     value="${fmtMoney(totalUSD)}"
                     style="width: 100%; padding: 12px 16px; border: 1.5px solid #d1d5db; border-radius: 12px; font-size: 14px; background: #f3f4f6; color: #6b7280; font-weight: 600; cursor: not-allowed;">
            </div>
            
            <!-- 货款状态 -->
            <div>
              <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-weight: 600; color: #111827; font-size: 14px;">
                <span>货款状态 <span style="color: #dc2626;">*</span></span>
              </label>
              <div style="display: flex; gap: 16px; padding: 12px; background: #f9fafb; border-radius: 12px; border: 1.5px solid #e5e7eb;">
                <label class="payment-status-option-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; padding: 8px; border-radius: 8px; transition: all 0.2s;">
                  <input type="radio" 
                         name="paymentStatus" 
                         value="unpaid" 
                         id="statusUnpaid"
                         ${initialData.status === 'unpaid' ? 'checked' : ''}
                         style="width: 18px; height: 18px; cursor: pointer; accent-color: #1f2937;">
                  <span style="font-size: 14px; color: #1f2937; font-weight: 500;">未到账</span>
                </label>
                <label class="payment-status-option-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; padding: 8px; border-radius: 8px; transition: all 0.2s;">
                  <input type="radio" 
                         name="paymentStatus" 
                         value="paid" 
                         id="statusPaid"
                         ${initialData.status === 'paid' ? 'checked' : ''}
                         style="width: 18px; height: 18px; cursor: pointer; accent-color: #dc2626;">
                  <span style="font-size: 14px; color: #dc2626; font-weight: 500;">已到账</span>
                </label>
                <label class="payment-status-option-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; padding: 8px; border-radius: 8px; transition: all 0.2s;">
                  <input type="radio" 
                         name="paymentStatus" 
                         value="pending" 
                         id="statusPending"
                         ${initialData.status === 'pending' ? 'checked' : ''}
                         style="width: 18px; height: 18px; cursor: pointer; accent-color: #2563eb;">
                  <span style="font-size: 14px; color: #2563eb; font-weight: 500;">即将到账</span>
                </label>
              </div>
            </div>
            
            <!-- 货款到账时间 -->
            <div>
              <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-weight: 600; color: #111827; font-size: 14px;">
                <span>货款到账时间</span>
              </label>
              <input type="date" 
                     id="paymentDueDate" 
                     value="${initialData.paymentDueDate}"
                     style="width: 100%; padding: 12px 16px; border: 1.5px solid #e5e7eb; border-radius: 12px; font-size: 14px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%); font-weight: 500; color: #1f2937; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
            </div>
            
            <!-- 备注（全宽） -->
            <div>
              <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-weight: 600; color: #111827; font-size: 14px;">
                <span>备注</span>
              </label>
              <textarea id="remark" 
                        maxlength="500" 
                        rows="3"
                        placeholder="请输入备注信息..."
                        style="width: 100%; padding: 12px 16px; border: 1.5px solid #e5e7eb; border-radius: 12px; font-size: 14px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%); font-weight: 500; color: #1f2937; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); resize: vertical; font-family: inherit;">${escapeHtml(initialData.remark)}</textarea>
              <p style="margin-top: 6px; color: #9ca3af; font-size: 12px; text-align: right;">最多500字符</p>
            </div>
          </div>
        </div>
      </div>
      <style>
        #paymentDueDate, #remark {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
        }
        #paymentDueDate:hover, #remark:hover {
          border-color: #10b981 !important;
          background: linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%) !important;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15), 0 1px 3px rgba(0, 0, 0, 0.05) !important;
          transform: translateY(-1px);
        }
        #paymentDueDate:focus, #remark:focus {
          outline: none;
          border-color: #10b981 !important;
          background: #ffffff !important;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1), 0 4px 16px rgba(16, 185, 129, 0.2) !important;
          transform: translateY(-1px);
        }
        #remark::placeholder {
          color: #9ca3af;
          font-weight: 400;
        }
        input[type="radio"][name="paymentStatus"]:checked + span {
          font-weight: 600;
        }
      </style>
    `;
    
    const footerHTML = `
      <button class="btn secondary payment-cancel-btn" data-action="cancel" style="padding: 12px 24px; border-radius: 12px; font-weight: 600; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: linear-gradient(to bottom, #ffffff 0%, #f9fafb 100%); border: 1.5px solid #e5e7eb; color: #374151; font-size: 14px; letter-spacing: 0.01em; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
        <span style="margin-right: 6px; font-size: 16px;">✕</span>取消
      </button>
      <button class="btn primary payment-save-btn" data-action="confirm" style="padding: 12px 28px; border-radius: 12px; font-weight: 600; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; color: white; font-size: 14px; letter-spacing: 0.01em; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4), 0 2px 4px rgba(16, 185, 129, 0.2); position: relative; overflow: hidden;">
        <span style="position: relative; z-index: 1; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 16px;">✓</span>
          <span>保存</span>
        </span>
        <span style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition: left 0.5s;"></span>
      </button>
      <style>
        .payment-cancel-btn:hover {
          background: linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%) !important;
          border-color: #d1d5db !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
          transform: translateY(-2px);
        }
        .payment-cancel-btn:active {
          transform: translateY(0);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1) !important;
        }
        .payment-save-btn:hover {
          background: linear-gradient(135deg, #059669 0%, #047857 100%) !important;
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5), 0 2px 6px rgba(16, 185, 129, 0.3) !important;
          transform: translateY(-2px);
        }
        .payment-save-btn:hover span:last-child {
          left: 100%;
        }
        .payment-save-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4) !important;
        }
      </style>
    `;
    
    // 显示弹窗
    const modalPromise = window.ModalDialog.custom(bodyHTML, {
      title: '',
      footer: footerHTML,
      size: 'medium',
      onConfirm: async () => {
        try {
          // 获取表单元素
          const statusRadios = document.querySelectorAll('input[name="paymentStatus"]');
          const paymentDueDateInput = document.getElementById('paymentDueDate');
          const remarkInput = document.getElementById('remark');
          
          if (!paymentDueDateInput || !remarkInput || statusRadios.length === 0) {
            window.NotificationSystem?.toast('表单元素未找到，请刷新页面重试', 'error');
            return false;
          }
          
          // 获取选中的货款状态
          let selectedStatus = 'unpaid';
          statusRadios.forEach(radio => {
            if (radio.checked) {
              selectedStatus = radio.value;
            }
          });
          
          // 获取表单数据
          let paymentDueDate = paymentDueDateInput.value || '';
          const remark = (remarkInput.value || '').trim();
          
          // 根据状态自动处理到账时间
          if (selectedStatus === 'paid') {
            // 如果选择"已到账"，自动填充当前日期（无论当前是否有值）
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            paymentDueDate = year + '-' + month + '-' + day;
            paymentDueDateInput.value = paymentDueDate;
            
            // 检查当前日期是否早于发货日期
            if (order.shipmentDate) {
              const shipmentDate = new Date(order.shipmentDate);
              const currentDateObj = new Date(paymentDueDate);
              
              // 只比较日期部分，忽略时间
              shipmentDate.setHours(0, 0, 0, 0);
              currentDateObj.setHours(0, 0, 0, 0);
              
              if (currentDateObj < shipmentDate) {
                window.NotificationSystem?.toast('当前日期早于发货日期，不允许标记为"已到账"。请检查或修改发货时间。', 'error', 3000);
                return false; // 不关闭弹窗
              }
            }
          } else if (selectedStatus === 'unpaid' || selectedStatus === 'pending') {
            // 如果选择"未到账"或"即将到账"，清空到账时间
            paymentDueDate = '';
            paymentDueDateInput.value = '';
          }
          
          // 检查是否需要更新订单状态（如果设置了货款到账时间，自动更新为已完成）
          const shouldUpdate = !!paymentDueDate;
          
          console.log('[货款状态] 保存数据:', {
            status: selectedStatus,
            paymentDueDate,
            remark,
            shouldUpdate
          });
          
          // 构建数据对象
          const paymentData = {
            status: selectedStatus,
            paymentDueDate,
            remark
          };
          
          // 构建更新数据 - 必须保留订单的所有原有数据，只更新货款状态相关字段
          const updateData = {
            // 保留订单的基本信息
            contractNo: order.contractNo,
            invoiceNo: order.invoiceNo,
            blNo: order.blNo,
            invoiceDate: order.invoiceDate,
            shipmentDate: order.shipmentDate,
            shipFrom: order.shipFrom,
            shipTo: order.shipTo,
            shippedPerSs: order.shippedPerSs,
            forwarder: order.forwarder,
            customerId: order.customerId,
            customerName: order.customerName,
            totalUSD: order.totalUSD, // 保留原有总金额
            productType: order.productType,
            // 更新 extras，只更新 paymentStatus
            extras: {
              ...(order.extras || {}),
              paymentStatus: paymentData
            },
            // 保留订单项（避免被清空）
            items: order.items || []
          };
          
          // 如果需要，更新订单状态（当设置了货款到账时间时，自动更新为已完成）
          if (shouldUpdate) {
            updateData.status = '已完成';
            console.log('[货款状态] 已设置货款到账时间，将自动更新订单状态为"已完成"');
          } else {
            // 保留原有状态
            updateData.status = order.status || '已创建';
          }
          
          console.log('[货款状态] 更新数据准备:', {
            hasItems: !!(updateData.items && updateData.items.length > 0),
            itemsCount: updateData.items?.length || 0,
            totalUSD: updateData.totalUSD,
            customerId: updateData.customerId,
            customerName: updateData.customerName,
            status: updateData.status
          });
          
          // 显示加载提示
          const saveBtn = document.querySelector('.payment-save-btn');
          if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span style="position: relative; z-index: 1;">保存中...</span>';
          }
          
          // 关键修复：如果订单对象中没有 items 字段（订单列表可能不包含订单项），
          // 需要先获取完整的订单数据，然后再保存
          let finalUpdateData = updateData;
          if (!updateData.items || updateData.items.length === 0) {
            console.log('[货款状态] 订单对象中没有订单项，重新获取完整订单数据...');
            try {
              const fullOrder = await api.orders.get(orderId);
              console.log('[货款状态] 获取到完整订单数据:', {
                hasItems: !!(fullOrder.items && fullOrder.items.length > 0),
                itemsCount: fullOrder.items?.length || 0,
                totalUSD: fullOrder.totalUSD
              });
              
              // 合并完整订单数据，只更新货款状态和状态字段
              finalUpdateData = {
                ...fullOrder, // 保留完整的订单数据
                extras: {
                  ...(fullOrder.extras || {}),
                  paymentStatus: paymentData // 只更新货款状态
                },
                status: shouldUpdate ? '已完成' : (fullOrder.status || '已创建') // 更新状态（如果需要）
              };
              
              console.log('[货款状态] 合并后的更新数据:', {
                hasItems: !!(finalUpdateData.items && finalUpdateData.items.length > 0),
                itemsCount: finalUpdateData.items?.length || 0,
                totalUSD: finalUpdateData.totalUSD,
                status: finalUpdateData.status
              });
            } catch (fetchError) {
              console.error('[货款状态] 获取完整订单数据失败:', fetchError);
              // 如果获取失败，仍然尝试保存（但可能会丢失订单项）
              window.NotificationSystem?.toast('警告：无法获取完整订单数据，保存可能不完整', 'warning');
            }
          }
          
          // 调用API更新订单
          console.log('[货款状态] 准备保存订单:', { 
            orderId, 
            updateData: {
              ...finalUpdateData,
              extras: finalUpdateData.extras ? '...' : null,
              items: finalUpdateData.items ? `${finalUpdateData.items.length} items` : 'no items'
            },
            paymentStatus: paymentData
          });
          
          try {
            const updatedOrder = await api.orders.update(orderId, finalUpdateData);
            console.log('[货款状态] 订单保存成功:', {
              id: updatedOrder?.id,
              status: updatedOrder?.status,
              hasPaymentStatus: !!(updatedOrder?.extras?.paymentStatus),
              totalUSD: updatedOrder?.totalUSD
            });
            
            // 清除订单缓存，确保列表显示最新数据
            if (window.CacheService && window.CacheService.orders) {
              // 清除该订单的缓存
              if (typeof window.CacheService.orders.clearItem === 'function') {
                window.CacheService.orders.clearItem(orderId);
              }
              // 清除订单列表缓存
              if (typeof window.CacheService.orders.clear === 'function') {
                window.CacheService.orders.clear();
              }
              console.log('[货款状态] 已清除订单缓存');
            }
            
            // 保存成功后立即触发订单列表刷新事件
            console.log('[货款状态] 触发订单列表刷新事件');
            window.dispatchEvent(new CustomEvent('refreshOrdersList', { 
              detail: { orderId } 
            }));
            
            // 延迟显示成功提示，确保在Modal关闭后再显示（避免被暂停）
            setTimeout(() => {
              if (shouldUpdate) {
                window.NotificationSystem?.toast('货款状态已保存，订单状态已自动更新为"已完成"', 'success', 1500);
              } else {
                window.NotificationSystem?.toast('货款状态已保存', 'success', 1500);
              }
            }, 300); // 延迟300ms，确保Modal已完全关闭
            
            // 返回成功，关闭弹窗
            return true;
          } catch (apiError) {
            console.error('[货款状态] API调用失败:', apiError);
            throw apiError; // 重新抛出错误，让外层catch处理
          }
        } catch (error) {
          console.error('[货款状态] 保存失败:', error);
          window.NotificationSystem?.toast('保存失败：' + (error.message || '未知错误'), 'error');
          
          // 恢复按钮状态
          const saveBtn = document.querySelector('.payment-save-btn');
          if (saveBtn) {
            saveBtn.disabled = false;
            // 恢复原始按钮HTML
            const originalBtnHTML = footerHTML.match(/<button[^>]*data-action="confirm"[^>]*>[\s\S]*?<\/button>/);
            if (originalBtnHTML && originalBtnHTML[0]) {
              saveBtn.innerHTML = originalBtnHTML[0].match(/<button[^>]*>([\s\S]*?)<\/button>/)?.[1] || '';
            }
          }
          
          return false; // 不关闭弹窗
        }
      },
      onClose: () => {
        resolve();
      }
    });
    
    // 弹窗显示后立即初始化状态处理（使用多个延迟确保DOM已完全渲染）
    setTimeout(() => {
      initPaymentStatusHandler(order);
    }, 50);
    
    // 使用 requestAnimationFrame 作为备用方案
    requestAnimationFrame(() => {
      setTimeout(() => {
        initPaymentStatusHandler(order);
      }, 50);
    });
    
    // 等待弹窗Promise完成
    await modalPromise;
  });
}
