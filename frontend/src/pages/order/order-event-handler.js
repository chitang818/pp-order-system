/**
 * 订单编辑页面 - 事件处理模块
 * 负责所有事件绑定和事件处理逻辑
 *
 * 使用工厂函数模式，接收依赖并返回绑定函数
 */

import { ApiService } from '../../api/api.js';

/**
 * 创建事件处理器
 * @param {Object} dependencies - 依赖对象
 * @param {HTMLElement} dependencies.prodTbody - 产品明细表格tbody元素
 * @param {Object} dependencies.currentProductTypeRef - 当前产品类型的引用对象（{current: number}）
 * @param {Function} dependencies.scheduleSaveDraft - 草稿保存调度函数
 * @param {Function} dependencies.updateProductTypeDisplay - 更新产品类型显示函数
 * @param {Function} dependencies.updateContractNoDisplay - 更新合同编号显示函数
 * @param {Function} dependencies.checkContractNoAndSwitchToC - 检查合同编号并切换到C类品函数
 * @param {Function} dependencies.checkContractNoExists - 检查合同编号是否重复函数
 * @param {Function} dependencies.switchTemplate - 切换产品类型模板函数
 * @param {Function} dependencies.addProdRow - 添加产品行函数
 * @param {Function} dependencies.updateTotalRowWrapper - 更新合计行包装函数
 * @param {Function} dependencies.calculateTotalAmountWrapper - 计算总金额包装函数
 * @param {Function} dependencies.updateDeleteButtonVisibility - 更新删除按钮显示状态函数
 * @param {Function} dependencies.renderRowIndices - 渲染行号函数
 * @param {Function} dependencies.updateRowSelectionHighlight - 更新行选中高亮函数
 * @param {Function} dependencies.saveOrder - 保存订单函数
 * @param {Function} dependencies.normalizeDateTextToISO - 日期格式化函数
 * @param {Function} dependencies.normalizeTimeTextToHHMM - 时间格式化函数
 * @param {Function} dependencies.extractOrderNoFromContractNo - 从合同编号提取订单号函数
 * @param {Function} dependencies.serializeOrderForm - 序列化表单函数
 * @param {Array} dependencies.customers - 客户列表
 * @param {Boolean} dependencies.isEdit - 是否编辑模式
 * @param {String} dependencies.editId - 编辑模式下的订单ID
 * @returns {Object} 事件绑定函数集合
 */
export function createEventHandler(dependencies) {
  // 移除未使用的变量，只保留需要的
  const {
    // prodTbody, // 未使用
    // currentProductTypeRef, // 未使用
    scheduleSaveDraft,
    // updateProductTypeDisplay, // 未使用
    updateContractNoDisplay,
    checkContractNoAndSwitchToC,
    checkContractNoExists,
    // switchTemplate, // 未使用
    // addProdRow, // 未使用
    // updateTotalRowWrapper, // 未使用
    // calculateTotalAmountWrapper, // 未使用
    // updateDeleteButtonVisibility, // 未使用
    // renderRowIndices, // 未使用
    // updateRowSelectionHighlight, // 未使用
    saveOrder,
    normalizeDateTextToISO,
    normalizeTimeTextToHHMM,
    extractOrderNoFromContractNo,
    serializeOrderForm,
    customers,
    isEdit,
    editId
  } = dependencies;

  // 绑定合同编号相关事件
  function bindContractNoEvents(contractNoInput, isEdit, isManuallyModifiedRef) {
    if (!contractNoInput) {
      return;
    }

    let contractNoCheckTimer = null;
    let escapeHtml; // 声明变量，解决 no-undef 问题

    // 工具函数将在需要时动态导入

    // 输入事件：实时更新显示和检查格式
    contractNoInput.addEventListener('input', function () {
      isManuallyModifiedRef.current = true;
      updateContractNoDisplay();

      // 检查合同编号并自动切换到C类品
      setTimeout(() => {
        checkContractNoAndSwitchToC();
      }, 50);

      // 防抖检查合同编号是否重复（在输入时也检查，但延迟更长）
      if (contractNoCheckTimer) {
        clearTimeout(contractNoCheckTimer);
      }
      const contractNo = this.value.trim();
      if (!contractNo) {
        return;
      }

      contractNoCheckTimer = setTimeout(async () => {
        const existingOrder = await checkContractNoExists(contractNo);

        if (existingOrder) {
          // 使用统一弹窗模块显示提示
          if (!escapeHtml) {
            const module = await import('./order-utils.js');
            escapeHtml = module.escapeHtml;
          }

          const bodyHTML = `
            <div style="text-align: center; padding: 20px;">
              <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
              <div style="font-size: 16px; color: #374151;">合同编号 "${escapeHtml(contractNo)}" 已使用，请修改。</div>
            </div>
          `;

          const footerHTML = `
            <button class="btn btn-primary" data-action="confirm" style="width: 100%;">确定</button>
          `;

          await window.ModalDialog.custom(bodyHTML, {
            title: '合同编号重复',
            footer: footerHTML,
            size: 'small',
            closable: false,
            clickOutsideToClose: false
          });

          // 确定后清空合同编号输入框
          contractNoInput.value = '';
          updateContractNoDisplay();
          contractNoInput.focus();
        }
      }, 500); // 输入时延迟更长，避免频繁检查
    });

    // 失焦事件：检查合同编号是否重复
    contractNoInput.addEventListener('blur', async function () {
      const contractNo = contractNoInput.value.trim();

      // 如果合同编号为空，不检查
      if (!contractNo) {
        return;
      }

      // 清除之前的定时器
      if (contractNoCheckTimer) {
        clearTimeout(contractNoCheckTimer);
      }

      // 使用防抖，避免频繁检查
      contractNoCheckTimer = setTimeout(async () => {
        const existingOrder = await checkContractNoExists(contractNo);

        if (existingOrder) {
          // 使用统一弹窗模块显示提示
          if (!escapeHtml) {
            const module = await import('./order-utils.js');
            escapeHtml = module.escapeHtml;
          }

          const bodyHTML = `
            <div style="text-align: center; padding: 20px;">
              <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
              <div style="font-size: 16px; color: #374151;">合同编号 "${escapeHtml(contractNo)}" 已使用，请修改。</div>
            </div>
          `;

          const footerHTML = `
            <button class="btn btn-primary" data-action="confirm" style="width: 100%;">确定</button>
          `;

          await window.ModalDialog.custom(bodyHTML, {
            title: '合同编号重复',
            footer: footerHTML,
            size: 'small',
            closable: false,
            clickOutsideToClose: false
          });

          // 确定后清空合同编号输入框
          contractNoInput.value = '';
          updateContractNoDisplay();
          contractNoInput.focus();
        }
      }, 300); // 失焦时延迟较短，快速反馈
    });
  }

  // 绑定日期选择器事件
  function bindDatePickerEvents() {
    // 导入工具函数
    if (!normalizeDateTextToISO || !normalizeTimeTextToHHMM) {
      console.warn('[事件处理] 日期/时间格式化函数未提供，跳过日期选择器事件绑定'); // eslint-disable-line no-console
      return;
    }

    // 绑定开票日期输入框
    const dateInput = document.getElementById('invoiceDate');
    if (dateInput) {
      dateInput.addEventListener('blur', function () {
        const v = this.value.trim();
        if (v) {
          const iso = normalizeDateTextToISO(v);
          if (iso && iso !== v) {
            dateInput.value = iso;
          }
        }
        scheduleSaveDraft();
      });

      dateInput.addEventListener('input', function () {
        // 实时输入8位数字后自动规范化
        const v = dateInput.value || '';
        if (/^\d{8}$/.test(v)) {
          const iso = normalizeDateTextToISO(v);
          if (iso) {
            dateInput.value = iso;
          }
        }
        scheduleSaveDraft();
      });

      // 添加回车键事件，触发格式化
      dateInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          const v = this.value.trim();
          if (v) {
            const iso = normalizeDateTextToISO(v);
            if (iso && iso !== v) {
              this.value = iso;
              // console.log('[日期输入] 回车键格式化:', v, '->', iso);
            } else if (iso === v) {
              // console.log('[日期输入] 日期已是正确格式:', iso);
            } else {
              // console.log('[日期输入] 无法格式化日期:', v);
            }
          }
          // 延迟触发blur，确保值已更新
          setTimeout(() => {
            this.blur();
          }, 0);
        }
      });
    }

    // 绑定发货日期输入框
    const shipmentDateInput = document.getElementById('shipmentDate');
    if (shipmentDateInput) {
      shipmentDateInput.addEventListener('blur', function () {
        const v = this.value.trim();
        if (v) {
          const iso = normalizeDateTextToISO(v);
          if (iso && iso !== v) {
            shipmentDateInput.value = iso;
          }
        }
        scheduleSaveDraft();
      });

      shipmentDateInput.addEventListener('input', function () {
        // 实时输入8位数字后自动规范化
        const v = shipmentDateInput.value || '';
        if (/^\d{8}$/.test(v)) {
          const iso = normalizeDateTextToISO(v);
          if (iso) {
            shipmentDateInput.value = iso;
          }
        }
        scheduleSaveDraft();
      });

      // 添加回车键事件，触发格式化
      shipmentDateInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          const v = this.value.trim();
          if (v) {
            const iso = normalizeDateTextToISO(v);
            if (iso && iso !== v) {
              this.value = iso;
              // console.log('[日期输入] 回车键格式化:', v, '->', iso);
            } else if (iso === v) {
              // console.log('[日期输入] 日期已是正确格式:', iso);
            } else {
              // console.log('[日期输入] 无法格式化日期:', v);
            }
          }
          // 延迟触发blur，确保值已更新
          setTimeout(() => {
            this.blur();
          }, 0);
        }
      });
    }

    // 绑定拉货日期输入框
    const pickupDateInput = document.querySelector('[data-field="pickupDate"]');
    if (pickupDateInput) {
      pickupDateInput.addEventListener('blur', function () {
        const v = this.value.trim();
        if (v) {
          const iso = normalizeDateTextToISO(v);
          if (iso) {
            pickupDateInput.value = iso;
          }
        }
        scheduleSaveDraft();
      });

      pickupDateInput.addEventListener('input', function () {
        // 实时输入8位数字后自动规范化
        const v = pickupDateInput.value || '';
        if (/^\d{8}$/.test(v)) {
          const iso = normalizeDateTextToISO(v);
          if (iso) {
            pickupDateInput.value = iso;
          }
        }
        scheduleSaveDraft();
      });
    }

    // 绑定拉货时间输入框
    const pickupTimeInput = document.querySelector('[data-field="pickupTime"]');
    if (pickupTimeInput) {
      pickupTimeInput.addEventListener('blur', function () {
        const v = this.value.trim();
        if (v) {
          const formatted = normalizeTimeTextToHHMM(v);
          if (formatted) {
            pickupTimeInput.value = formatted;
          }
        }
        scheduleSaveDraft();
      });

      pickupTimeInput.addEventListener('input', function () {
        // 实时输入4位数字后自动规范化
        const v = pickupTimeInput.value || '';
        if (/^\d{4}$/.test(v)) {
          const formatted = normalizeTimeTextToHHMM(v);
          if (formatted) {
            pickupTimeInput.value = formatted;
          }
        }
        scheduleSaveDraft();
      });
    }
  }

  // 绑定保存按钮事件
  function bindSaveButtonEvent() {
    const saveBtn = document.getElementById('btnSaveOrderNew');
    if (!saveBtn) {
      console.warn('[事件处理] 保存按钮未找到，跳过保存按钮事件绑定'); // eslint-disable-line no-console
      return;
    }

    if (!saveOrder || !serializeOrderForm) {
      console.warn('[事件处理] 保存订单函数或序列化表单函数未提供，跳过保存按钮事件绑定'); // eslint-disable-line no-console
      return;
    }

    // 使用 onclick 属性赋值而不是 addEventListener，
    // 以防止在SPA切换/热重载过程中产生重复的事件绑定
    saveBtn.onclick = async function (e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      try {
        // 在收集数据前，立即同步 textarea 的值（确保获取到最新输入）
        await new Promise((resolve) => {
          requestAnimationFrame(() => {
            // 强制同步 textarea 的值（唛头说明字段）
            const marksNoteTextarea = document.querySelector(
              '.marks-note-textarea[data-field="marksNote"]'
            );
            if (marksNoteTextarea) {
              // 触发 input 事件以确保值同步
              marksNoteTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            setTimeout(resolve, 0);
          });
        });

        await saveOrder({
          isEdit,
          editId,
          serializeOrderForm,
          customers
        });

        // 保存成功处理
        window.NotificationSystem.toast('订单保存成功', 'success', 1500);

        // SPA环境：使用hash路由跳转，无需页面刷新
        setTimeout(() => {
          // 跳转到订单列表（路由切换会自动刷新数据）
          // console.log('[Order Save] 保存成功，准备跳转到列表页');
          location.hash = '#/orders/list';
          // 如果refreshOrders函数可用，也调用一次确保数据刷新
          if (typeof window.refreshOrders === 'function') {
            setTimeout(() => window.refreshOrders(), 100);
          }
        }, 150);
      } catch (error) {
        console.error('[Order Save] 订单保存异常 (已捕获):', error); // eslint-disable-line no-console
        // 确保不会继续执行跳转

        console.error('[Order Save] 订单保存失败:', error); // eslint-disable-line no-console
        // 优化错误提示
        let errorMsg = error.message || '保存失败：服务器响应异常';

        // 检查是否有详细的错误信息（从后端返回的 details）
        if (error.details && error.details.message) {
          errorMsg = error.details.message;
        } else if (error.message) {
          // 如果错误消息包含后端返回的详细错误信息，直接使用
          if (error.message.includes('客户ID无效') || error.message.includes('客户不存在')) {
            errorMsg = '保存失败：客户信息无效，请重新选择客户';
          } else if (error.message.includes('外键约束') || error.message.includes('FOREIGN KEY')) {
            errorMsg = '保存失败：数据关联错误，请检查客户或产品信息';
          } else if (error.message.includes('HTTP 500')) {
            // 如果错误消息就是后端返回的详细消息，直接使用
            if (error.message.length > 20) {
              errorMsg = error.message.replace('HTTP 500: ', '');
            } else {
              errorMsg = '服务器内部错误，请检查订单数据是否完整（客户、产品信息等）';
            }
          } else if (error.message.includes('HTTP 400')) {
            errorMsg = '订单数据验证失败，请检查必填字段';
          } else if (error.message.includes('网络')) {
            errorMsg = '保存失败：网络连接异常';
          } else if (error.message.includes('404')) {
            errorMsg = '保存失败：订单不存在';
          } else if (error.message.includes('验证')) {
            errorMsg = '保存失败：数据验证错误';
          } else if (error.message.includes('Failed to fetch')) {
            errorMsg = '保存失败：网络连接中断';
          } else if (error.message.includes('500')) {
            // 如果错误消息就是后端返回的详细消息，直接使用
            if (error.message.length > 20 && !error.message.startsWith('HTTP')) {
              errorMsg = error.message;
            } else {
              errorMsg = '保存失败：服务器内部错误';
            }
          } else if (error.message.includes('HTTP')) {
            errorMsg = `保存失败：${error.message}`;
          } else if (error.message.includes('服务器未返回')) {
            errorMsg = `保存失败：${error.message}`;
          } else {
            // 直接使用错误消息（验证错误会直接传递，如"请为所有产品选择件数单位"）
            errorMsg = error.message;
          }
        }

        // 如果错误消息包含换行符，说明有多个错误，需要特殊处理显示
        if (errorMsg.includes('\n')) {
          // 多个错误时，使用自定义模态框显示完整错误列表
          window.NotificationSystem?.toast('保存失败，请查看详细错误', 'error', 3000);
          setTimeout(async () => {
            // alert('保存失败，请检查以下问题：\n\n' + errorMsg);
            if (window.ModalDialog) {
              await window.ModalDialog.custom(`
                <div style="padding: 20px;">
                  <div style="color: #ef4444; font-weight: 600; margin-bottom: 12px; font-size: 16px;">保存失败，请检查以下问题：</div>
                  <pre style="background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; font-family: monospace; font-size: 13px; color: #374151;">${errorMsg}</pre>
                </div>
              `, {
                title: '保存失败',
                size: 'small',
                footer: '<button class="btn btn-primary" data-action="confirm" style="width: 100%;">确定</button>',
                onConfirm: () => true // 修复无法关闭弹窗的问题
              });
            } else {
              // 降级处理
              // eslint-disable-next-line no-alert
              alert('保存失败，请检查以下问题：\n\n' + errorMsg);
            }
          }, 100);
        } else {
          // 单个错误时，根据错误类型选择不同的提示类型
          // 验证错误使用 warning，其他错误使用 error
          const toastType =
            errorMsg.includes('请') || errorMsg.includes('必须') || errorMsg.includes('不能')
              ? 'warning'
              : 'error';
          window.NotificationSystem?.toast(errorMsg, toastType, 3000);
        }
      }
    };
  }

  // 绑定备注一键插入功能
  function bindRemarkInsertEvent() {
    document.addEventListener('click', function (e) {
      // 生产备注快速填入按钮
      if (e.target.classList.contains('btn-remark')) {
        const remarkText = e.target.getAttribute('data-remark');
        const prodNoteTextarea = document.querySelector('textarea[data-field="prodNote"]');
        if (prodNoteTextarea && remarkText) {
          const currentValue = prodNoteTextarea.value.trim();
          if (currentValue) {
            // 如果已有内容，在新行添加
            prodNoteTextarea.value = currentValue + '\n' + remarkText;
          } else {
            // 如果没有内容，直接设置
            prodNoteTextarea.value = remarkText;
          }
          // 触发草稿保存
          try {
            scheduleSaveDraft();
          } catch (_) { /* 忽略草稿保存错误 */ }
          // 聚焦到文本框末尾
          prodNoteTextarea.focus();
          prodNoteTextarea.setSelectionRange(
            prodNoteTextarea.value.length,
            prodNoteTextarea.value.length
          );
        }
      }

      // 拍照备注快速填入按钮
      if (e.target.classList.contains('btn-quick-photo-remark')) {
        const remarkText = e.target.getAttribute('data-remark');
        const photoRemarkInput = document.querySelector('input[data-field="photoRemark"]');
        if (photoRemarkInput && remarkText) {
          // 直接替换拍照备注输入框的内容
          photoRemarkInput.value = remarkText;
          // 触发草稿保存
          try {
            scheduleSaveDraft();
          } catch (_) { /* 忽略草稿保存错误 */ }
          // 聚焦到输入框
          photoRemarkInput.focus();
        }
      }
    });
  }

  // 绑定客户选择变化事件
  function bindCustomerSelectEvent(customers, isManuallyModifiedRef, loadNextContractNoWrapper) {
    const sel = document.getElementById('ordCustomerSelect');
    if (!sel) {
      console.warn('[事件处理] 客户选择框未找到，跳过客户选择事件绑定'); // eslint-disable-line no-console
      return;
    }

    // 监听客户选择框变化，自动填充客户信息
    // 注意：目的港（shipTo）不自动填充，由用户手动填写
    sel.addEventListener('change', function () {
      const selectedCustomer = customers.find((c) => String(c.id) === this.value);

      // 安全地设置元素值，只设置存在的元素
      // 注意：shipTo（目的港）不自动填充，保持用户手动输入的值
      const contactPersonEl = document.getElementById('contactPerson');
      const contactTelEl = document.getElementById('contactTel');
      const contactFaxEl = document.getElementById('contactFax');
      const contactEmailEl = document.getElementById('contactEmail');

      if (selectedCustomer) {
        // 不自动填充目的港（shipTo），由用户手动填写
        // if (shipToEl) shipToEl.value = selectedCustomer.address || '';
        if (contactPersonEl) {
          contactPersonEl.value = selectedCustomer.contactPerson || '';
        }
        if (contactTelEl) {
          contactTelEl.value = selectedCustomer.contactTel || '';
        }
        if (contactFaxEl) {
          contactFaxEl.value = selectedCustomer.contactFax || '';
        }
        if (contactEmailEl) {
          contactEmailEl.value = selectedCustomer.contactEmail || '';
        }

        // 当客户选择除DAINEN TRADING CO.,LTD外的其他客户时，自动填写拍照备注
        const photoRemarkEl = document.querySelector('[data-field="photoRemark"]');
        if (photoRemarkEl) {
          if (selectedCustomer.name && selectedCustomer.name.includes('DAINEN TRADING CO.,LTD')) {
            // DAINEN客户清空拍照备注
            photoRemarkEl.value = '';
          } else {
            // 其他客户填充通用拍照要求
            photoRemarkEl.value = '空箱、满箱和铅封号照片';
          }
        }
      } else {
        // 清空客户信息（但不清空目的港，保持用户输入）
        // if (shipToEl) shipToEl.value = '';
        if (contactPersonEl) {
          contactPersonEl.value = '';
        }
        if (contactTelEl) {
          contactTelEl.value = '';
        }
        if (contactFaxEl) {
          contactFaxEl.value = '';
        }
        if (contactEmailEl) {
          contactEmailEl.value = '';
        }
      }

      // 在客户选择变化时，如果合同编号未手动修改，则重新获取
      if (!isEdit && !isManuallyModifiedRef.current && loadNextContractNoWrapper) {
        loadNextContractNoWrapper();
      }

      scheduleSaveDraft(); // 客户信息变化也保存草稿
    });
  }

  // 绑定NO.按钮点击事件
  function bindAddOrderNoButtonEvent(contractNoInput, isManuallyModifiedRef) {
    const btnAddOrderNo = document.getElementById('btnAddOrderNo');
    if (!btnAddOrderNo) {
      console.warn('[事件处理] NO.按钮未找到，跳过NO.按钮事件绑定'); // eslint-disable-line no-console
      return;
    }

    // 防止重复绑定事件：检查是否已经绑定过
    if (btnAddOrderNo.hasAttribute('data-no-btn-bound')) {
      // console.log('[NO.按钮] 事件已绑定，跳过重复绑定');
      return;
    }
    // 标记为已绑定
    btnAddOrderNo.setAttribute('data-no-btn-bound', 'true');

    btnAddOrderNo.addEventListener('click', async function (e) {
      // 防止重复点击：检查是否已经有弹窗打开
      const existingModal = document.querySelector('.modal-dialog-overlay');
      if (existingModal) {
        // console.log('[NO.按钮] 已有弹窗打开，忽略点击');
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 防止按钮在弹窗打开期间被重复点击
      if (btnAddOrderNo.disabled) {
        // console.log('[NO.按钮] 按钮已禁用，忽略点击');
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 临时禁用按钮，防止快速重复点击
      btnAddOrderNo.disabled = true;

      try {
        // 获取当前合同编号
        const currentContractNo = contractNoInput.value.trim();
        const existingOrderNo = extractOrderNoFromContractNo(currentContractNo);

        // 构建输入框HTML
        const inputId = `orderNoInput_${Date.now()}`;
        const bodyHTML = `
          <div style="padding: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">请输入ORDER NO.</label>
            <input 
              type="text" 
              id="${inputId}" 
              class="input" 
              placeholder="例如：25669" 
              value="${existingOrderNo || ''}"
              style="width: 100%; padding: 10px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px;"
              autocomplete="off"
              autofocus
            />
            <div style="margin-top: 12px; font-size: 12px; color: #666;">
              <div>💡 提示：订单号将添加到合同编号中，格式为：合同编号(NO.订单号)</div>
              ${existingOrderNo ? `<div style="margin-top: 4px; color: #f59e0b;">当前订单号：${existingOrderNo}</div>` : ''}
            </div>
          </div>
        `;

        // 构建底部按钮
        const footerHTML = `
          <button class="btn btn-secondary" data-action="cancel" type="button">取消</button>
          <button class="btn btn-primary" data-action="confirm" type="button">确认</button>
        `;

        // 确认按钮处理函数
        const handleConfirm = () => {
          // console.log('[NO.按钮] 确认按钮被点击');
          // 获取输入值
          const input = document.getElementById(inputId);
          if (!input) {
            console.warn('[NO.按钮] 输入框未找到'); // eslint-disable-line no-console
            return false;
          }

          const orderNo = input.value.trim();
          // console.log('[NO.按钮] 输入的订单号:', orderNo);

          // 验证：如果required为true且值为空，不关闭弹窗
          if (!orderNo) {
            if (window.NotificationSystem) {
              window.NotificationSystem.toast('请输入订单号', 'warning');
            }
            input.focus();
            return false; // 返回false不关闭弹窗
          }

          // 验证通过，处理订单号
          const trimmedOrderNo = orderNo.trim();

          // 检查合同编号中是否已经有订单号
          if (existingOrderNo) {
            // 如果已有订单号，替换它
            // 支持两种格式：(NO.数字) 或 (数字)
            const newContractNo = currentContractNo.replace(
              /\(NO\.\s*\d+\s*\)|\(\d+\)/i,
              `(NO.${trimmedOrderNo})`
            );
            contractNoInput.value = newContractNo;
          } else {
            // 如果没有订单号，追加到合同编号后面
            if (currentContractNo) {
              contractNoInput.value = currentContractNo + `(NO.${trimmedOrderNo})`;
            } else {
              contractNoInput.value = `(NO.${trimmedOrderNo})`;
            }
          }

          // 更新合同编号显示
          updateContractNoDisplay();

          // 检查合同编号格式，如果匹配SC2025-220(NO.28888)格式，自动切换到C类品
          // 延迟执行以确保DOM已更新
          setTimeout(() => {
            checkContractNoAndSwitchToC();
          }, 50);

          // 手动处理订单号提取和填写
          const orderNoInput = document.querySelector('input[data-field="orderNo"]');
          if (orderNoInput && !orderNoInput.value.trim()) {
            orderNoInput.value = trimmedOrderNo;
            // 触发input事件以确保草稿保存等功能正常工作
            orderNoInput.dispatchEvent(new Event('input', { bubbles: true }));
          }

          // 标记为手动修改
          isManuallyModifiedRef.current = true;

          // console.log('[NO.按钮] 订单号已更新，返回true关闭弹窗');
          // 返回true关闭弹窗
          return true;
        };

        // 取消按钮处理函数
        // const handleCancel = () => {
        //   console.log('[NO.按钮] 取消按钮被点击，关闭弹窗');
        //   // 取消时不做任何操作，直接关闭
        //   return null;
        // };

        // ModalDialog.custom 的 Promise 在弹窗关闭后才 resolve，聚焦逻辑必须在 await 之前执行
        const modalPromise = window.ModalDialog.custom(bodyHTML, {
          title: '添加订单号',
          footer: footerHTML,
          size: 'small',
          closable: true,
          clickOutsideToClose: true,
          preventDuplicate: true,
          onConfirm: handleConfirm,
          onClose: () => null
        });

        // 与 showModal 中双次 rAF 对齐，再短延迟确保已加上 .show，避免焦点仍留在 NO. 按钮上
        const scheduleFocusAndEnter = () => {
          const input = document.getElementById(inputId);
          if (!input) {
            return;
          }
          const modal = input.closest('.modal-dialog-overlay');
          if (!modal || !modal.classList.contains('show')) {
            return;
          }
          input.focus({ preventScroll: true });
          if (input.value) {
            input.select();
          }

          const handleEnter = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const confirmBtn = modal.querySelector('[data-action="confirm"]');
              if (confirmBtn) {
                confirmBtn.click();
              }
            }
          };
          input.addEventListener('keydown', handleEnter);

          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.removedNodes.forEach((node) => {
                if (
                  node === modal ||
                  (node.nodeType === 1 && node.contains && node.contains(modal))
                ) {
                  input.removeEventListener('keydown', handleEnter);
                  observer.disconnect();
                }
              });
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });
        };

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(scheduleFocusAndEnter, 50);
          });
        });

        await modalPromise;
      } catch (error) {
        console.error('[NO.按钮] 弹窗处理异常:', error); // eslint-disable-line no-console
      } finally {
        btnAddOrderNo.disabled = false;
      }
    });
  }

  // 绑定日期选择器按钮事件
  function bindDatePickerButtonEvents() {
    if (!normalizeDateTextToISO || !normalizeTimeTextToHHMM) {
      console.warn('[事件处理] 日期/时间格式化函数未提供，跳过日期选择器按钮事件绑定');
      return;
    }

    // 通用日期选择器函数 - 与日期筛选输入框一致的实现
    function setupDatePicker(inputElement, buttonElement) {
      if (!inputElement || !buttonElement) {
        return;
      }

      // 防止重复绑定
      if (buttonElement.hasAttribute('data-date-btn-bound')) {
        return;
      }
      buttonElement.setAttribute('data-date-btn-bound', 'true');

      // 预处理函数：切换类型并同步值
      const onPrepare = () => {
        if (inputElement.type !== 'date') {
          const originalValue = inputElement.value;

          // 转换显示样式前先计算并保存样式
          const computedStyle = window.getComputedStyle(inputElement);
          const originalHeight = computedStyle.height;
          const originalPadding = computedStyle.padding;
          const originalFontSize = computedStyle.fontSize;

          inputElement.type = 'date';

          // 强制保持原始样式
          inputElement.style.height = originalHeight;
          inputElement.style.padding = originalPadding;
          inputElement.style.fontSize = originalFontSize;
          inputElement.style.paddingRight = '35px';

          // 设置默认值
          if (originalValue && /^\d{4}-\d{2}-\d{2}$/.test(originalValue)) {
            inputElement.value = originalValue;
          } else if (originalValue) {
            const normalized = normalizeDateTextToISO(originalValue);
            if (normalized) {
              inputElement.value = normalized;
            }
          }
        }
      };

      // 1. 在按下鼠标时就提前准备好元素类型（提高 showPicker 成功率）
      buttonElement.addEventListener('mousedown', function (e) {
        onPrepare();
      });

      // 2. 在点击时立即触发弹出
      buttonElement.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        // console.log('日期选择器按钮被点击');

        // 再次确保已准备好（防止键盘触发等情况）
        const originalStyle = inputElement.style.cssText;
        onPrepare();

        // 监听日期选择
        const handleDateChange = function () {
          // console.log('日期已选择:', inputElement.value);
          inputElement.type = 'text';
          inputElement.style.cssText = originalStyle;
          inputElement.removeEventListener('change', handleDateChange);
          inputElement.removeEventListener('blur', handleDateBlur);
          scheduleSaveDraft();
        };

        // 监听失焦事件
        const handleDateBlur = function () {
          // console.log('日期选择器失焦');
          setTimeout(() => {
            inputElement.type = 'text';
            inputElement.style.cssText = originalStyle;
            inputElement.removeEventListener('change', handleDateChange);
            inputElement.removeEventListener('blur', handleDateBlur);
          }, 100);
        };

        inputElement.addEventListener('change', handleDateChange);
        inputElement.addEventListener('blur', handleDateBlur);

        // 核心：在同步的代码路径中直接触发，不使用 setTimeout
        if (inputElement.showPicker) {
          try {
            inputElement.showPicker();
          } catch (err) {
            console.warn('[DatePicker] showPicker failed, fallback to focus:', err); // eslint-disable-line no-console
            inputElement.focus();
          }
        } else {
          inputElement.focus();
        }
      });
    }

    // 为订单日期设置日期选择器
    const invoiceDateInput = document.getElementById('invoiceDate');
    const btnPickDate = document.getElementById('btnPickDate');
    if (invoiceDateInput && btnPickDate) {
      setupDatePicker(invoiceDateInput, btnPickDate);
    }

    // 为发货日期设置日期选择器
    const shipmentDateInput = document.getElementById('shipmentDate');
    const btnPickShipmentDate = document.getElementById('btnPickShipmentDate');
    if (shipmentDateInput && btnPickShipmentDate) {
      setupDatePicker(shipmentDateInput, btnPickShipmentDate);
    }

    // 为拉货日期设置日期选择器
    const pickupDateInput = document.querySelector('[data-field="pickupDate"]');
    const btnPickPickupDate = document.getElementById('btnPickPickupDate');
    if (pickupDateInput && btnPickPickupDate) {
      setupDatePicker(pickupDateInput, btnPickPickupDate);
    }

    // 为拉货时间设置时间选择器
    const pickupTimeInput = document.querySelector('[data-field="pickupTime"]');
    const btnPickPickupTime = document.getElementById('btnPickPickupTime');
    if (pickupTimeInput && btnPickPickupTime) {
      // 1. 防重绑定
      if (!btnPickPickupTime.hasAttribute('data-time-btn-bound')) {
        btnPickPickupTime.setAttribute('data-time-btn-bound', 'true');

        // 2. 预处理
        const onPrepareTime = () => {
          if (pickupTimeInput.type !== 'time') {
            const originalValue = pickupTimeInput.value;
            // 样式保持逻辑（简化版，时间输入框通常高度变化不大，主要关注类型）
            pickupTimeInput.type = 'time';

            // 值同步
            if (originalValue && /^\d{2}:\d{2}$/.test(originalValue)) {
              pickupTimeInput.value = originalValue;
            } else if (originalValue) {
              const normalized = normalizeTimeTextToHHMM(originalValue);
              if (normalized) {
                pickupTimeInput.value = normalized;
              }
            }
          }
        };

        btnPickPickupTime.addEventListener('mousedown', onPrepareTime);

        btnPickPickupTime.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();

          // console.log('时间选择器按钮被点击');

          const originalStyle = pickupTimeInput.style.cssText;
          const originalType = 'text'; // 或者是 pickupTimeInput.getAttribute('type') || 'text'

          onPrepareTime();

          // 监听时间选择
          const handleTimeChange = function () {
            // console.log('时间已选择:', pickupTimeInput.value);
            pickupTimeInput.type = originalType;
            pickupTimeInput.style.cssText = originalStyle;
            pickupTimeInput.removeEventListener('change', handleTimeChange);
            pickupTimeInput.removeEventListener('blur', handleTimeBlur);
            scheduleSaveDraft();
          };

          // 监听失焦事件
          const handleTimeBlur = function () {
            // console.log('时间选择器失焦');
            setTimeout(() => {
              pickupTimeInput.type = originalType;
              pickupTimeInput.style.cssText = originalStyle;
              pickupTimeInput.removeEventListener('change', handleTimeChange);
              pickupTimeInput.removeEventListener('blur', handleTimeBlur);
            }, 100);
          };

          pickupTimeInput.addEventListener('change', handleTimeChange);
          pickupTimeInput.addEventListener('blur', handleTimeBlur);

          // 3. 同步触发
          if (pickupTimeInput.showPicker) {
            try {
              pickupTimeInput.showPicker();
            } catch (err) {
              console.warn('[TimePicker] showPicker failed, fallback to focus:', err); // eslint-disable-line no-console
              pickupTimeInput.focus();
            }
          } else {
            pickupTimeInput.focus();
          }
        });
      }
    }
  }

  // 绑定发票号历史按钮事件
  function bindInvoiceHistoryEvent() {
    const btnInvoiceHistory = document.getElementById('btnInvoiceHistory');
    const invoiceNoInput = document.getElementById('invoiceNo');
    const invoiceHistoryDropdown = document.getElementById('invoiceHistoryDropdown');

    if (!btnInvoiceHistory || !invoiceNoInput || !invoiceHistoryDropdown) {
      return;
    }

    btnInvoiceHistory.addEventListener('click', async function (e) {
      e.stopPropagation(); // 阻止事件冒泡到 document

      // 切换显示/隐藏状态
      if (invoiceHistoryDropdown.style.display === 'block') {
        invoiceHistoryDropdown.style.display = 'none';
        return;
      }

      // 显示加载中状态
      invoiceHistoryDropdown.innerHTML = '<div style="padding: 8px 12px; color: #666; font-size: 13px; text-align: center;">正在读取...</div>';
      invoiceHistoryDropdown.style.display = 'block';

      try {
        // 从后端拉取订单列表（默认按 ID 降序或最新创建排在前面，若后端没排序这里依赖后端返回顺序）
        const orders = await ApiService.orders.list();
        
        let history = [];
        if (Array.isArray(orders)) {
          // 提取最新的5个非空且不重复的发票号
          for (let i = 0; i < orders.length; i++) {
            const invoiceNo = orders[i].invoiceNo;
            if (invoiceNo && invoiceNo.trim() !== '') {
              const val = invoiceNo.trim();
              if (!history.includes(val)) {
                history.push(val);
              }
              if (history.length >= 5) break;
            }
          }
        }

        if (history.length === 0) {
          invoiceHistoryDropdown.innerHTML = '<div style="padding: 8px 12px; color: #999; font-size: 13px; text-align: center;">暂无历史记录</div>';
        } else {
          invoiceHistoryDropdown.innerHTML = '';
          history.forEach(item => {
            const div = document.createElement('div');
            div.textContent = item;
            div.style.cssText = 'padding: 8px 12px; cursor: pointer; font-size: 13px; color: #333; border-bottom: 1px solid #f0f0f0;';
            div.addEventListener('mouseenter', () => div.style.backgroundColor = '#f5f5f5');
            div.addEventListener('mouseleave', () => div.style.backgroundColor = 'transparent');
            div.addEventListener('click', () => {
              invoiceNoInput.value = item;
              invoiceHistoryDropdown.style.display = 'none';
              // 触发 input 事件以确保任何监听器（如草稿保存）能捕捉到变化
              invoiceNoInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
            invoiceHistoryDropdown.appendChild(div);
          });
        }
      } catch (err) {
        console.error('获取发票号历史失败', err);
        invoiceHistoryDropdown.innerHTML = '<div style="padding: 8px 12px; color: #ef4444; font-size: 13px; text-align: center;">读取失败</div>';
      }
    });

    // 点击页面其他区域隐藏下拉菜单
    document.addEventListener('click', function (e) {
      if (invoiceHistoryDropdown.style.display === 'block' && 
          !btnInvoiceHistory.contains(e.target) && 
          !invoiceHistoryDropdown.contains(e.target)) {
        invoiceHistoryDropdown.style.display = 'none';
      }
    });
  }

  // 返回导出的函数集合
  return {
    bindContractNoEvents,
    bindDatePickerEvents,
    bindSaveButtonEvent,
    bindRemarkInsertEvent,
    bindCustomerSelectEvent,
    bindAddOrderNoButtonEvent,
    bindDatePickerButtonEvents,
    bindInvoiceHistoryEvent
    // 其他事件绑定函数将在后续分段中添加
  };
}
