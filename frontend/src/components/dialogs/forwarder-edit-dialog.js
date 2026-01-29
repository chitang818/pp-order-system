/**
 * 货代编辑对话框组件
 * 
 * 功能：
 * - 新建货代
 * - 编辑货代
 * - 表单验证
 * - 保存后刷新列表
 */
import { timerManager } from '../../utils/timer-manager.js';
import { escapeHtml } from '../../utils/format-utils.js';

/**
 * 显示货代编辑对话框
 * @param {Object} forwarder - 货代数据（编辑模式），null或undefined表示新建模式
 * @returns {Promise<{success: boolean, data: Object|null}>} 返回保存结果
 */
export async function showForwarderEditDialog(forwarder = null) {
    return new Promise((resolve) => {
        const isEditMode = forwarder && forwarder.id;
        const title = isEditMode ? '编辑货代' : '新建货代';

        // 表单HTML
        const bodyHTML = `
      <div style="padding: 24px;">
        <form id="forwarderEditForm">
          <div class="form-item" style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
              货代名称 <span style="color: #ef4444;">*</span>
            </label>
            <input 
              type="text" 
              id="forwarderName" 
              name="name"
              value="${escapeHtml(forwarder?.name || '')}"
              placeholder="请输入货代名称"
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
              id="forwarderAddress" 
              name="address"
              value="${escapeHtml(forwarder?.address || '')}"
              placeholder="请输入货代地址"
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
                id="forwarderTel" 
                name="tel"
                value="${escapeHtml(forwarder?.tel || '')}"
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
                id="forwarderFax" 
                name="fax"
                value="${escapeHtml(forwarder?.fax || '')}"
                placeholder="请输入传真"
                style="width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
              />
            </div>
          </div>
          
          <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div class="form-item">
              <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                联系人
              </label>
              <input 
                type="text" 
                id="forwarderContact" 
                name="contact"
                value="${escapeHtml(forwarder?.contact || '')}"
                placeholder="请输入联系人"
                style="width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
              />
            </div>
            
            <div class="form-item">
              <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                邮箱
              </label>
              <input 
                type="email" 
                id="forwarderEmail" 
                name="email"
                value="${escapeHtml(forwarder?.email || '')}"
                placeholder="请输入邮箱"
                style="width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
              />
            </div>
          </div>
          
          <div class="form-item">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
              备注
            </label>
            <textarea 
              id="forwarderRemarks" 
              name="remarks"
              placeholder="请输入备注信息"
              rows="3"
              style="width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s; resize: vertical; font-family: inherit;"
            >${escapeHtml(forwarder?.remarks || '')}</textarea>
          </div>
        </form>
        
        <style>
          #forwarderEditForm input:focus,
          #forwarderEditForm textarea:focus {
            outline: none;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
          }
          #forwarderEditForm input:hover,
          #forwarderEditForm textarea:hover {
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
      <button class="btn primary" data-action="confirm" style="padding: 10px 28px; border-radius: 8px; font-weight: 600; background: linear-gradient(135deg, #06B6D4 0%, #0891B2 100%);">
        ${isEditMode ? '保存' : '创建'}
      </button>
    `;

        // 设置焦点
        timerManager.setTimeout(() => {
            const nameInput = document.getElementById('forwarderName');
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
                const nameInput = document.getElementById('forwarderName');
                const addressInput = document.getElementById('forwarderAddress');
                const telInput = document.getElementById('forwarderTel');
                const faxInput = document.getElementById('forwarderFax');
                const contactInput = document.getElementById('forwarderContact');
                const emailInput = document.getElementById('forwarderEmail');
                const remarksInput = document.getElementById('forwarderRemarks');

                // 获取表单数据
                const formData = {
                    name: nameInput?.value?.trim() || '',
                    address: addressInput?.value?.trim() || '',
                    tel: telInput?.value?.trim() || '',
                    fax: faxInput?.value?.trim() || '',
                    contact: contactInput?.value?.trim() || '',
                    email: emailInput?.value?.trim() || '',
                    remarks: remarksInput?.value?.trim() || ''
                };

                // 验证
                if (!formData.name) {
                    window.NotificationSystem?.toast('请输入货代名称', 'warning');
                    nameInput?.focus();
                    return false; // 不关闭弹窗
                }

                try {
                    let result;
                    const ApiService = window.ApiService;

                    if (isEditMode) {
                        // 更新货代
                        result = await ApiService.forwarders.update(forwarder.id, formData);
                        window.NotificationSystem?.toast('货代更新成功', 'success');
                    } else {
                        // 新建货代
                        result = await ApiService.forwarders.create(formData);
                        window.NotificationSystem?.toast('货代创建成功', 'success');
                    }

                    // 返回成功结果
                    resolve({ success: true, data: result });
                    return true; // 关闭弹窗
                } catch (error) {
                    console.error('[货代编辑] 保存失败:', error);
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
