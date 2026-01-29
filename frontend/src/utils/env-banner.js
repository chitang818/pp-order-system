/**
 * 环境提示横幅
 * 在开发模式下显示当前运行环境信息
 */

/**
 * 显示环境提示横幅
 * 在浏览器开发模式下显示彩色控制台提示
 */
export function showEnvBanner() {
  // 只在开发环境显示
  if (typeof window === 'undefined') return;

  const isTauri = !!window.__TAURI__;
  const isLocalhost = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
  
  // 只在本地开发环境显示
  if (!isLocalhost && !isTauri) return;

  // Tauri 环境
  if (isTauri) {
    console.log(
      '%c🖥️  Tauri 桌面应用模式',
      'background: #24C8DB; color: white; padding: 8px 16px; border-radius: 4px; font-weight: bold; font-size: 14px;'
    );
    console.log(
      '%c✅ 完整功能模式',
      'color: #24C8DB; font-weight: bold; font-size: 12px;'
    );
    console.log(
      '%c  • 文件保存：系统原生对话框\n  • 托盘图标：可用\n  • 开机自启：可用\n  • 窗口控制：完整',
      'color: #666; font-size: 11px; line-height: 1.6;'
    );
    return;
  }

  // 浏览器环境
  console.log(
    '%c🌐 浏览器开发模式',
    'background: #4CAF50; color: white; padding: 8px 16px; border-radius: 4px; font-weight: bold; font-size: 14px;'
  );
  console.log(
    '%c⚡ 快速开发模式（部分功能降级）',
    'color: #4CAF50; font-weight: bold; font-size: 12px;'
  );
  console.log(
    '%c  ✅ 可用功能：\n    • UI 开发和调试\n    • API 调用（通过代理）\n    • 业务逻辑开发\n\n  ⚠️  降级功能：\n    • 文件保存 → 浏览器下载（自动保存到"下载"文件夹）\n    • 托盘图标、开机自启等原生功能不可用\n\n  💡 提示：\n    • 需要测试完整功能？运行: npm run tauri:dev\n    • 查看开发指南: docs/开发指南.md',
    'color: #666; font-size: 11px; line-height: 1.8;'
  );
}

/**
 * 显示简化版环境提示（在页面上）
 * @returns {HTMLElement|null} 提示元素
 */
export function showEnvBadge() {
  if (typeof window === 'undefined') return null;

  const isTauri = !!window.__TAURI__;
  const isLocalhost = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
  
  // 只在本地开发环境显示，且不在 Tauri 环境
  if (!isLocalhost || isTauri) return null;

  // 创建浮动提示徽章
  const badge = document.createElement('div');
  badge.id = 'env-badge';
  badge.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      line-height: 1.5;
      cursor: pointer;
      transition: all 0.3s ease;
    " 
    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.2)';"
    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)';">
      <div style="font-weight: bold; margin-bottom: 6px;">
        🌐 浏览器开发模式
      </div>
      <div style="font-size: 11px; opacity: 0.9;">
        文件保存功能已降级为下载<br>
        <span style="opacity: 0.7;">点击查看详情</span>
      </div>
    </div>
  `;

  // 点击显示详细信息
  badge.addEventListener('click', () => {
    alert(
      '🌐 浏览器开发模式\n\n' +
      '✅ 可用功能：\n' +
      '  • UI 开发和调试\n' +
      '  • API 调用\n' +
      '  • 业务逻辑开发\n\n' +
      '⚠️  降级功能：\n' +
      '  • 文件保存 → 浏览器下载\n' +
      '  • 托盘图标等原生功能不可用\n\n' +
      '💡 需要完整功能？\n' +
      '运行: npm run tauri:dev\n\n' +
      '📖 详见: docs/开发指南.md'
    );
  });

  // 添加到页面
  if (document.body) {
    document.body.appendChild(badge);
  } else {
    // 如果 body 还没加载，等待 DOM 加载完成
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(badge);
    });
  }

  return badge;
}

/**
 * 获取当前环境信息
 * @returns {Object} 环境信息对象
 */
export function getEnvironmentInfo() {
  return {
    isTauri: !!window.__TAURI__,
    isLocalhost: window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1',
    isDevelopment: process.env.NODE_ENV === 'development',
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    port: window.location.port,
  };
}

/**
 * 显示环境信息（控制台表格）
 */
export function showEnvironmentInfo() {
  const info = getEnvironmentInfo();
  console.group('🔍 环境信息');
  console.table(info);
  console.groupEnd();
}

// 默认导出
export default {
  showEnvBanner,
  showEnvBadge,
  getEnvironmentInfo,
  showEnvironmentInfo,
};
