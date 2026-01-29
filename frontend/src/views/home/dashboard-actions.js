/**
 * 仪表盘快速操作和最近记录渲染
 */

/**
 * 格式化日期时间
 */
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 0 ? '刚刚' : `${minutes}分钟前`;
      }
      return `${hours}小时前`;
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}月${day}日`;
    }
  } catch (e) {
    return dateStr;
  }
}

/**
 * 格式化金额
 */
function formatMoney(amount) {
  if (amount === null || amount === undefined) return '0.00';
  return Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * 导航到指定路由
 */
function navigateTo(path) {
  if (window.app && window.app.router) {
    window.app.router.navigate(path);
  } else {
    window.location.hash = `#/${path}`;
  }
}

/**
 * 渲染快速操作
 */
export function renderQuickActions(container) {
  if (!container) return;

  const actionsList = container.querySelector('#quickActionsList') || container;
  actionsList.innerHTML = '';

  const actions = [
    {
      icon: '➕',
      label: '新建订单',
      route: 'orders/edit',
      color: '#3b82f6'
    },
    {
      icon: '👤',
      label: '新建客户',
      route: 'customers',
      color: '#10b981'
    },
    {
      icon: '📦',
      label: '新增产品',
      route: 'products/add',
      color: '#8b5cf6'
    },
    {
      icon: '📄',
      label: '生成单据',
      route: 'document-center/generate',
      color: '#f59e0b'
    },
    {
      icon: '📋',
      label: '订单列表',
      route: 'orders/list',
      color: '#6366f1'
    },
    {
      icon: '👥',
      label: '客户列表',
      route: 'customers',
      color: '#06b6d4'
    },
    {
      icon: '📊',
      label: '交易统计',
      route: 'analytics/summary',
      color: '#ec4899'
    },
    {
      icon: '⚙️',
      label: '系统设置',
      route: 'settings/company',
      color: '#64748b'
    }
  ];

  actions.forEach(action => {
    const btn = document.createElement('a');
    btn.className = 'quick-action-btn';
    btn.href = `#/${action.route}`;
    btn.style.setProperty('--action-color', action.color);
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(action.route);
    });

    const icon = document.createElement('div');
    icon.className = 'quick-action-icon';
    icon.textContent = action.icon;
    icon.style.color = action.color;

    const label = document.createElement('div');
    label.className = 'quick-action-label';
    label.textContent = action.label;

    btn.appendChild(icon);
    btn.appendChild(label);
    actionsList.appendChild(btn);
  });
}

/**
 * 渲染最近操作记录
 */
export function renderRecentActivities(container, activitiesData) {
  if (!container) return;

  const content = container.querySelector('#recentActivitiesContent') || container;
  content.innerHTML = '';

  if (!activitiesData) {
    content.innerHTML = '<div class="recent-activity-empty">暂无最近操作记录</div>';
    return;
  }

  const { orders = [] } = activitiesData;

  // 仅显示最新的5条订单操作记录
  const displayOrders = orders.slice(0, 5);

  if (displayOrders.length > 0) {
    const list = document.createElement('div');
    list.className = 'recent-activity-list';

    displayOrders.forEach(order => {
      const item = document.createElement('div');
      item.className = 'recent-activity-item';

      const info = document.createElement('div');
      info.className = 'recent-activity-info';

      const main = document.createElement('div');
      main.className = 'recent-activity-main';
      
      // 显示订单号和操作类型（新建/编辑）
      const contractNo = order.contractNo || '-';
      const operation = order.operation || '编辑';
      const operationBadge = document.createElement('span');
      operationBadge.style.cssText = `
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
        margin-right: 8px;
        background: ${operation === '新建' ? '#dbeafe' : '#fef3c7'};
        color: ${operation === '新建' ? '#1e40af' : '#92400e'};
      `;
      operationBadge.textContent = operation;
      
      const contractNoSpan = document.createElement('span');
      contractNoSpan.textContent = contractNo;
      contractNoSpan.style.fontWeight = '600';
      
      main.appendChild(operationBadge);
      main.appendChild(contractNoSpan);

      info.appendChild(main);

      const time = document.createElement('div');
      time.className = 'recent-activity-time';
      time.textContent = formatDateTime(order.createdAt);

      item.appendChild(info);
      item.appendChild(time);
      list.appendChild(item);
    });

    content.appendChild(list);
  } else {
    // 如果没有订单记录
    content.innerHTML = '<div class="recent-activity-empty">暂无最近订单</div>';
  }
}

