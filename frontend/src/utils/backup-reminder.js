/**
 * 备份提醒工具
 * 处理应用启动时的备份配置检查和提醒
 */
import { call, isTauriAvailable } from '../core/ipc-client.js';
import { ModalDialog } from '../components/modal-dialog.js';

/**
 * 检查备份设置并提醒用户
 */
export async function checkBackupSettingsAndRemind() {
  const isTauri = await isTauriAvailable();
  if (!isTauri) return;

  try {
    const config = await call('db_get_backup_config');
    console.log('[备份检查] 当前配置:', config);

    // 如果从未设置过备份（enabled 为 false 且 path 为空）
    if (!config.enabled && !config.path) {
      console.log('[备份检查] 未设置自动备份，弹出提醒');
      
      const confirmed = await ModalDialog.confirm(
        '您的数据库尚未开启自动备份功能。\n\n为了保障订单数据安全，防止因意外导致的数据丢失，强烈建议您立即开启自动备份。',
        {
          title: '启用自动备份提醒',
          icon: '🛡️',
          confirmText: '去设置',
          cancelText: '稍后提醒',
          preventDuplicate: true
        }
      );

      if (confirmed) {
        // 跳转到数据库设置页面
        window.location.hash = '#/settings/database';
      }
    }
  } catch (e) {
    console.error('[备份检查] 检查失败:', e);
  }
}
