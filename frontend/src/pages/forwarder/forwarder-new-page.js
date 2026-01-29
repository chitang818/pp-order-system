/**
 * 货代编辑页面业务逻辑
 * 基于客户编辑页面创建，简化版实现
 */

// 导入依赖
import { ApiService } from '../../api/api.js';

/**
 * 初始化货代编辑页面
 */
export function initForwarderNewPage() {
    // 从URL参数获取编辑ID
    let editId = null;
    const hashMatch = location.hash.match(/[?&]id=([^&]+)/);
    if (hashMatch) {
        editId = decodeURIComponent(hashMatch[1]);
    }

    async function init() {
        if (editId) {
            try {
                const forwarder = await ApiService.forwarders.get(editId);
                if (forwarder) {
                    document.getElementById('fwdName').value = forwarder.name || '';
                    document.getElementById('fwdAddress').value = forwarder.address || '';
                    document.getElementById('fwdTel').value = forwarder.tel || '';
                    document.getElementById('fwdFax').value = forwarder.fax || '';
                    document.getElementById('fwdContact').value = forwarder.contact || '';
                    document.getElementById('fwdEmail').value = forwarder.email || '';
                    document.getElementById('fwdRemarks').value = forwarder.remarks || '';

                    const btnEl = document.getElementById('btnSaveForwarder');
                    if (btnEl) btnEl.textContent = '保存修改';
                }
            } catch (e) {
                console.error('加载货代失败:', e);
            }
        }
    }

    init();

    // 绑定保存按钮
    const btn = document.getElementById('btnSaveForwarder');
    if (!btn || btn.hasAttribute('data-save-bound')) return;

    btn.setAttribute('data-save-bound', 'true');

    btn.addEventListener('click', async function () {
        const name = document.getElementById('fwdName')?.value?.trim() || '';
        const address = document.getElementById('fwdAddress')?.value?.trim() || '';
        const tel = document.getElementById('fwdTel')?.value?.trim() || '';
        const fax = document.getElementById('fwdFax')?.value?.trim() || '';
        const contact = document.getElementById('fwdContact')?.value?.trim() || '';
        const email = document.getElementById('fwdEmail')?.value?.trim() || '';
        const remarks = document.getElementById('fwdRemarks')?.value?.trim() || '';

        if (!name) {
            window.NotificationSystem?.toast('请输入货代名称', 'warning');
            return;
        }

        const payload = { name, address, tel, fax, contact, email, remarks };

        try {
            if (editId) {
                await ApiService.forwarders.update(editId, payload);
                window.NotificationSystem?.toast('保存成功：已更新货代信息', 'success', 1500);
            } else {
                await ApiService.forwarders.create(payload);
                window.NotificationSystem?.toast('保存成功：已创建新货代', 'success', 1500);
            }

            // 返回货代列表
            location.hash = '#/partners/forwarders?refresh=' + Date.now();
        } catch (e) {
            console.error('保存货代失败:', e);
            window.NotificationSystem?.toast('保存失败：' + e.message, 'error');
        }
    });
}

// DOM 加载完成后自动初始化（仅在非SPA模式下）
if (!window.isSPA) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initForwarderNewPage);
    } else {
        initForwarderNewPage();
    }
}
