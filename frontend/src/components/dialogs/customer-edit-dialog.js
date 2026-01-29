/**
 * 客户编辑对话框组件
 * 
 * 功能：
 * - 新建客户
 * - 编辑客户
 * - 表单验证
 * - 保存后刷新列表
 */
import { timerManager } from '../../utils/timer-manager.js';
import { escapeHtml } from '../../utils/format-utils.js';

/**
 * 显示客户编辑对话框
 * @param {Object} customer - 客户数据（编辑模式），null或undefined表示新建模式
 * @returns {Promise<{success: boolean, data: Object|null}>} 返回保存结果
 */
export async function showCustomerEditDialog(customer = null) {
    return new Promise((resolve) => {
        const isEditMode = customer && customer.id;
        const title = isEditMode ? '编辑客户' : '新建客户';

        // 表单HTML
        const bodyHTML = `
      <div style="padding: 24px;">
        <form id="customerEditForm">
          <div class="form-item" style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
              客户名称 <span style="color: #ef4444;">*</span>
            </label>
            <input 
              type="text" 
              id="customerName" 
              name="name"
              value="${escapeHtml(customer?.name || '')}"
              placeholder="请输入客户名称"
              required
              style="width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
            />
          </div>
          
          <div class="form-item" style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
              地址
            </label>
            <input 
              type="text" 
              id="customerAddress" 
              name="address"
              value="${escapeHtml(customer?.address || '')}"
              placeholder="请输入客户地址"
              style="width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
            />
          </div>
          
          <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div class="form-item">
              <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                电话
              </label>
              <input 
                type="text" 
                id="customerTel" 
                name="tel"
                value="${escapeHtml(customer?.tel || '')}"
                placeholder="请输入电话"
                style="width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
              />
            </div>
            
            <div class="form-item">
              <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                传真
              </label>
              <input 
                type="text" 
                id="customerFax" 
                name="fax"
                value="${escapeHtml(customer?.fax || '')}"
                placeholder="请输入传真"
                style="width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
              />
            </div>
          </div>
          
          <div class="form-item">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
              联系人
            </label>
            <input 
              type="text" 
              id="customerContact" 
              name="contact"
              value="${escapeHtml(customer?.contact || '')}"
              placeholder="请输入联系人"
              style="width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
            />
          </div>
        </form>
        
        <style>
          #customerEditForm input:focus {
            outline: none;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
          }
          #customerEditForm input:hover {
            border-color: #c7d2fe;
          }
        </style>
      </div>
    `;

        // 底部按钮HTML
        const footerHTML = `
      <button class="btn secondary" data-action="cancel" style="padding: 10px 24px; border-radius: 8px; font-weight: 600;">
        取消
      </button>
      <button class="btn primary" data-action="confirm" style="padding: 10px 28px; border-radius: 8px; font-weight: 600; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        ${isEditMode ? '保存' : '创建'}
      </button>
    `;

        // 设置焦点
        timerManager.setTimeout(() => {
            const nameInput = document.getElementById('customerName');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        }, 200);

        // 显示弹窗
        window.ModalDialog.custom(bodyHTML, {
            title: title,
            footer: footerHTML,
            size: 'medium',
            onConfirm: async () => {
                const nameInput = document.getElementById('customerName');
                const addressInput = document.getElementById('customerAddress');
                const telInput = document.getElementById('customerTel');
                const faxInput = document.getElementById('customerFax');
                const contactInput = document.getElementById('customerContact');

                // 获取表单数据
                const formData = {
                    name: nameInput?.value?.trim() || '',
                    address: addressInput?.value?.trim() || '',
                    tel: telInput?.value?.trim() || '',
                    fax: faxInput?.value?.trim() || '',
                    contact: contactInput?.value?.trim() || ''
                };

                // 验证
                if (!formData.name) {
                    window.NotificationSystem?.toast('请输入客户名称', 'warning');
                    nameInput?.focus();
                    return false; // 不关闭弹窗
                }

                try {
                    let result;
                    const ApiService = window.ApiService;

                    if (isEditMode) {
                        // 更新客户
                        result = await ApiService.customers.update(customer.id, formData);
                        window.NotificationSystem?.toast('客户更新成功', 'success');
                    } else {
                        // 新建客户
                        result = await ApiService.customers.create(formData);
                        window.NotificationSystem?.toast('客户创建成功', 'success');
                    }

                    // 返回成功结果
                    resolve({ success: true, data: result });
                    return true; // 关闭弹窗
                } catch (error) {
                    console.error('[客户编辑] 保存失败:', error);
                    window.NotificationSystem?.toast('保存失败: ' + error.message, 'error');
                    return false; // 不关闭弹窗
                }
            },
            onClose: () => {
                // 用户取消
                resolve({ success: false, data: null });
            }
        });
    });
}
