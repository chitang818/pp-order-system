/**
 * 仪表盘提醒卡片渲染
 * 包括发货提醒和收款提醒
 */

/**
 * 格式化日期
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
 * 显示设置对话框
 * @param {number} currentDays - 当前提前天数
 * @param {Function} onSave - 保存回调函数
 */
export function showSettingsDialog(currentDays, onSave) {
  // 创建对话框
  const dialog = document.createElement('div');
  dialog.className = 'reminder-settings-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement('div');
  content.className = 'reminder-settings-dialog-content';
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    min-width: 320px;
    max-width: 90%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  `;

  const title = document.createElement('div');
  title.style.cssText = `
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 20px;
  `;
  title.textContent = '设置发货提醒提前天数';

  const form = document.createElement('div');
  form.style.cssText = 'margin-bottom: 20px;';

  const label = document.createElement('label');
  label.style.cssText = `
    display: block;
    font-size: 14px;
    color: #6b7280;
    margin-bottom: 8px;
  `;
  label.textContent = '提前天数';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.value = currentDays;
  input.style.cssText = `
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
  `;

  const buttons = document.createElement('div');
  buttons.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    padding: 8px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: white;
    color: #6b7280;
    cursor: pointer;
    font-size: 14px;
  `;
  cancelBtn.addEventListener('click', () => {
    if (document.body.contains(dialog)) {
      document.body.removeChild(dialog);
    }
  });

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '保存';
  saveBtn.style.cssText = `
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: #3b82f6;
    color: white;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  `;
  saveBtn.addEventListener('click', async () => {
    const days = parseInt(input.value);
    if (isNaN(days) || days < 0) {
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('请输入有效的天数（大于等于0）', 'warning');
      } else {
        alert('请输入有效的天数（大于等于0）');
      }
      return;
    }
    
    try {
      console.log('[DashboardReminders] 保存设置，提前天数:', days);
      await onSave(days);
      if (document.body.contains(dialog)) {
        document.body.removeChild(dialog);
      }
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('设置已保存', 'success');
      }
    } catch (error) {
      console.error('[DashboardReminders] 保存设置失败:', error);
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('保存失败，请重试', 'error');
      } else {
        alert('保存失败，请重试');
      }
    }
  });

  form.appendChild(label);
  form.appendChild(input);
  buttons.appendChild(cancelBtn);
  buttons.appendChild(saveBtn);
  content.appendChild(title);
  content.appendChild(form);
  content.appendChild(buttons);
  dialog.appendChild(content);
  document.body.appendChild(dialog);

  // 点击背景关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      if (document.body.contains(dialog)) {
        document.body.removeChild(dialog);
      }
    }
  });
  
  // ESC键关闭
  const handleEsc = (e) => {
    if (e.key === 'Escape' && document.body.contains(dialog)) {
      document.body.removeChild(dialog);
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);

  // 聚焦输入框
  setTimeout(() => input.focus(), 100);
}

/**
 * 渲染发货提醒卡片
 */
export function renderShipmentReminder(container, remindersData, settings, onSettingsClick) {
  if (!container) {
    console.warn('[DashboardReminders] 发货提醒容器未找到');
    return;
  }

  const list = container.querySelector('#shipmentReminderList');
  const empty = container.querySelector('#shipmentReminderEmpty');
  
  if (!list || !empty) {
    console.warn('[DashboardReminders] 发货提醒列表或空状态元素未找到');
    return;
  }

  list.innerHTML = '';

  // 检查数据
  if (!remindersData) {
    console.warn('[DashboardReminders] 发货提醒数据为空');
    list.style.display = 'none';
    empty.style.display = 'block';
    // 即使没有数据，也要绑定设置按钮
    bindSettingsButton(container, settings, onSettingsClick);
    return;
  }

  const orders = remindersData.orders || [];
  if (orders.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    // 隐藏滚动消息条
    const messageContainer = container.querySelector('#shipmentScrollMessage');
    if (messageContainer) {
      messageContainer.style.display = 'none';
    }
    // 即使没有数据，也要绑定设置按钮
    bindSettingsButton(container, settings, onSettingsClick);
    return;
  }

  list.style.display = 'block';
  empty.style.display = 'none';

  // 渲染滚动消息条（显示最近的订单）
  renderScrollMessage(container, orders);

  orders.forEach(order => {
    const item = document.createElement('div');
    item.className = 'reminder-item';
    
    item.addEventListener('click', () => {
      if (order.contractNo) {
        // 跳转到订单列表页面，并自动筛选该订单
        navigateTo(`orders/list?orderNo=${encodeURIComponent(order.contractNo)}`);
      }
    });

    // 优化后的单行显示布局
    const content = document.createElement('div');
    content.className = 'reminder-item-content';
    
    // 左侧：合同号（不显示客户名）
    const leftSection = document.createElement('div');
    leftSection.className = 'reminder-item-left';
    
    const contractNo = document.createElement('span');
    contractNo.className = 'reminder-item-contract-no';
    contractNo.textContent = order.contractNo || '-';
    
    leftSection.appendChild(contractNo);
    
    // 中间：发货日期
    const dateSection = document.createElement('div');
    dateSection.className = 'reminder-item-date-section';
    const dateIcon = document.createElement('span');
    dateIcon.className = 'reminder-item-icon';
    dateIcon.textContent = '📅';
    const dateInfo = document.createElement('span');
    dateInfo.className = 'reminder-item-date';
    dateInfo.textContent = formatDate(order.shipmentDate);
    dateSection.appendChild(dateIcon);
    dateSection.appendChild(dateInfo);
    
    // 右侧：剩余天数（带标签样式）
    const timeSection = document.createElement('div');
    timeSection.className = 'reminder-item-time-section';
    const daysUntil = order.daysUntilShipment;
    if (daysUntil !== null && daysUntil !== undefined) {
      if (daysUntil === 0) {
        timeSection.className = 'reminder-item-time-section reminder-item-time-urgent';
        timeSection.textContent = '今天发货';
      } else if (daysUntil === 1) {
        timeSection.className = 'reminder-item-time-section reminder-item-time-warning';
        timeSection.textContent = '明天发货';
      } else if (daysUntil < 0) {
        timeSection.className = 'reminder-item-time-section reminder-item-time-urgent';
        timeSection.textContent = `已逾期 ${Math.abs(daysUntil)} 天`;
      } else {
        timeSection.className = 'reminder-item-time-section reminder-item-time-normal';
        timeSection.textContent = `还有 ${daysUntil} 天`;
      }
    } else {
      timeSection.className = 'reminder-item-time-section reminder-item-time-disabled';
      timeSection.textContent = '-';
    }

    content.appendChild(leftSection);
    content.appendChild(dateSection);
    content.appendChild(timeSection);
    
    item.appendChild(content);
    list.appendChild(item);
  });

  // 绑定设置按钮
  bindSettingsButton(container, settings, onSettingsClick);
}

/**
 * 渲染滚动消息条
 * @param {HTMLElement} container - 卡片容器
 * @param {Array} orders - 订单列表
 */
function renderScrollMessage(container, orders) {
  const messageContainer = container.querySelector('#shipmentScrollMessage');
  if (!messageContainer) {
    console.warn('[DashboardReminders] 滚动消息容器未找到');
    return;
  }

  // 如果没有订单，隐藏消息条
  if (!orders || orders.length === 0) {
    messageContainer.style.display = 'none';
    return;
  }

  // 找到最近的订单（按剩余天数排序，天数最少的）
  const sortedOrders = [...orders].sort((a, b) => {
    const daysA = a.daysUntilShipment !== null && a.daysUntilShipment !== undefined ? a.daysUntilShipment : 999;
    const daysB = b.daysUntilShipment !== null && b.daysUntilShipment !== undefined ? b.daysUntilShipment : 999;
    return daysA - daysB;
  });

  const nearestOrder = sortedOrders[0];
  if (!nearestOrder) {
    messageContainer.style.display = 'none';
    return;
  }

  const daysUntil = nearestOrder.daysUntilShipment;
  if (daysUntil === null || daysUntil === undefined) {
    messageContainer.style.display = 'none';
    return;
  }

  // 构建消息文本
  const contractNo = nearestOrder.contractNo || '-';
  let message = '';
  if (daysUntil === 0) {
    message = `${contractNo}预订今天发货，请确认发货进度！`;
  } else if (daysUntil < 0) {
    message = `${contractNo}已逾期 ${Math.abs(daysUntil)} 天，请尽快处理！`;
  } else {
    message = `${contractNo}距离预订发货期还有${daysUntil}天，抓紧找货代啊！`;
  }

  // 根据天数设置颜色
  let colorClass = 'reminder-scroll-message-black';
  if (daysUntil <= 3) {
    colorClass = 'reminder-scroll-message-red';
  } else if (daysUntil <= 6) {
    colorClass = 'reminder-scroll-message-blue';
  }

  // 清空并设置内容 - 立即显示
  messageContainer.innerHTML = '';
  messageContainer.className = `reminder-scroll-message ${colorClass}`;
  messageContainer.style.display = 'flex'; // 立即显示容器
  
  // 创建滚动文本元素 - 立即显示文本内容
  const scrollText = document.createElement('span');
  scrollText.className = 'reminder-scroll-text';
  scrollText.textContent = message;
  messageContainer.appendChild(scrollText);
  
  // 先让文本可见，不等待动画设置
  messageContainer.style.overflow = 'visible';
  
  // 添加鼠标悬停事件，暂停/恢复动画
  messageContainer.addEventListener('mouseenter', () => {
    if (scrollText.style.animation && scrollText.style.animation !== 'none') {
      scrollText.style.animationPlayState = 'paused';
    }
  });
  
  messageContainer.addEventListener('mouseleave', () => {
    if (scrollText.style.animation && scrollText.style.animation !== 'none') {
      scrollText.style.animationPlayState = 'running';
    }
  });
  
  // 异步检查是否需要滚动（不影响文本立即显示）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const containerWidth = messageContainer.offsetWidth;
      const textWidth = scrollText.scrollWidth;
      
      if (textWidth > containerWidth) {
        // 文本超出容器，启用滚动动画
        messageContainer.style.overflow = 'hidden';
        // 计算动画时长（根据文本长度动态调整）
        const duration = Math.max(10, (textWidth / 50)); // 每50px需要1秒
        scrollText.style.animation = `scroll-message ${duration}s linear infinite`;
        scrollText.style.animationDelay = '0s'; // 立即开始滚动，无延迟
        scrollText.style.animationPlayState = 'running'; // 确保动画运行
      } else {
        // 文本不超出，直接显示，不需要滚动
        messageContainer.style.overflow = 'visible';
        scrollText.style.animation = 'none';
      }
    });
  });
  
  console.log('[DashboardReminders] 滚动消息已渲染:', message, '天数:', daysUntil, '颜色:', colorClass);
}

/**
 * 显示收款提醒滚动消息设置对话框
 * @param {string} currentTemplate - 当前消息模板
 * @param {Function} onSave - 保存回调函数
 */
export function showPaymentMessageSettingsDialog(currentTemplate, onSave) {
  // 默认模板
  const defaultTemplate = '发票号{invoiceNo}订单都发货了{days}天了，还没要到钱呀，快催催别跑路了';
  
  // 创建对话框
  const dialog = document.createElement('div');
  dialog.className = 'reminder-settings-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement('div');
  content.className = 'reminder-settings-dialog-content';
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    min-width: 500px;
    max-width: 90%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  `;

  const title = document.createElement('div');
  title.style.cssText = `
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 20px;
  `;
  title.textContent = '设置收款提醒滚动消息';

  const form = document.createElement('div');
  form.style.cssText = 'margin-bottom: 20px;';

  const label = document.createElement('label');
  label.style.cssText = `
    display: block;
    font-size: 14px;
    color: #6b7280;
    margin-bottom: 8px;
  `;
  label.textContent = '消息模板（可使用变量：{invoiceNo} 发票号，{days} 发货天数）';

  const textarea = document.createElement('textarea');
  textarea.value = currentTemplate || defaultTemplate;
  textarea.rows = 4;
  textarea.style.cssText = `
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
    resize: vertical;
    font-family: inherit;
  `;

  const hint = document.createElement('div');
  hint.style.cssText = `
    font-size: 12px;
    color: #9ca3af;
    margin-top: 8px;
    line-height: 1.5;
  `;
  hint.innerHTML = '提示：<br/>• {invoiceNo} 会被替换为订单发票号<br/>• {days} 会被替换为发货后天数<br/>• 如果发票号为空，将使用合同号';

  const buttons = document.createElement('div');
  buttons.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    padding: 8px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: white;
    color: #6b7280;
    cursor: pointer;
    font-size: 14px;
  `;
  cancelBtn.addEventListener('click', () => {
    if (document.body.contains(dialog)) {
      document.body.removeChild(dialog);
    }
  });

  const resetBtn = document.createElement('button');
  resetBtn.textContent = '重置默认';
  resetBtn.style.cssText = `
    padding: 8px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: white;
    color: #6b7280;
    cursor: pointer;
    font-size: 14px;
  `;
  resetBtn.addEventListener('click', () => {
    textarea.value = defaultTemplate;
  });

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '保存';
  saveBtn.style.cssText = `
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: #3b82f6;
    color: white;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  `;
  saveBtn.addEventListener('click', async () => {
    const template = textarea.value.trim();
    if (!template) {
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('消息模板不能为空', 'warning');
      } else {
        alert('消息模板不能为空');
      }
      return;
    }
    
    try {
      console.log('[DashboardReminders] 保存收款提醒消息模板:', template);
      await onSave(template);
      if (document.body.contains(dialog)) {
        document.body.removeChild(dialog);
      }
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('设置已保存', 'success');
      }
    } catch (error) {
      console.error('[DashboardReminders] 保存设置失败:', error);
      if (window.NotificationSystem) {
        window.NotificationSystem.toast('保存失败，请重试', 'error');
      } else {
        alert('保存失败，请重试');
      }
    }
  });

  form.appendChild(label);
  form.appendChild(textarea);
  form.appendChild(hint);
  buttons.appendChild(cancelBtn);
  buttons.appendChild(resetBtn);
  buttons.appendChild(saveBtn);
  content.appendChild(title);
  content.appendChild(form);
  content.appendChild(buttons);
  dialog.appendChild(content);
  document.body.appendChild(dialog);

  // 点击背景关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      if (document.body.contains(dialog)) {
        document.body.removeChild(dialog);
      }
    }
  });
  
  // ESC键关闭
  const handleEsc = (e) => {
    if (e.key === 'Escape' && document.body.contains(dialog)) {
      document.body.removeChild(dialog);
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
  
  // 聚焦到输入框
  setTimeout(() => {
    textarea.focus();
    textarea.select();
  }, 100);
}

/**
 * 渲染收款提醒滚动消息条
 * @param {HTMLElement} container - 收款提醒卡片容器
 * @param {Array} orders - 收款提醒订单列表
 * @param {string} messageTemplate - 消息模板（可选）
 */
function renderPaymentScrollMessage(container, orders, messageTemplate) {
  const messageContainer = container.querySelector('#paymentScrollMessage');
  if (!messageContainer) {
    console.warn('[DashboardReminders] 收款提醒滚动消息容器未找到');
    return;
  }

  // 如果没有订单，隐藏消息条
  if (!orders || orders.length === 0) {
    messageContainer.style.display = 'none';
    return;
  }

  // 找到发货时间最长的订单（按发货后天数排序，天数最多的）
  const sortedOrders = [...orders].filter(order => {
    // 只处理有发货天数的订单
    return order.daysSinceShipment !== null && order.daysSinceShipment !== undefined;
  }).sort((a, b) => {
    const daysA = a.daysSinceShipment || 0;
    const daysB = b.daysSinceShipment || 0;
    return daysB - daysA; // 降序排列，天数最多的在前
  });

  const longestOrder = sortedOrders[0];
  if (!longestOrder) {
    messageContainer.style.display = 'none';
    return;
  }

  const daysSince = longestOrder.daysSinceShipment;
  if (daysSince === null || daysSince === undefined || daysSince <= 0) {
    messageContainer.style.display = 'none';
    return;
  }

  // 构建消息文本（使用模板或默认格式）
  const invoiceNo = longestOrder.invoiceNo || longestOrder.contractNo || '未知订单';
  const defaultTemplate = '发票号{invoiceNo}订单都发货了{days}天了，还没要到钱呀，快催催别跑路了';
  const template = messageTemplate || defaultTemplate;
  
  // 替换模板变量
  const message = template
    .replace(/\{invoiceNo\}/g, invoiceNo)
    .replace(/\{days\}/g, daysSince);

  // 根据天数设置颜色
  let colorClass = 'reminder-scroll-message-black';
  if (daysSince >= 30) {
    colorClass = 'reminder-scroll-message-red'; // 超过30天，红色警告
  } else if (daysSince >= 15) {
    colorClass = 'reminder-scroll-message-black'; // 超过15天，黑色提醒
  }

  // 清空并设置内容 - 立即显示
  messageContainer.innerHTML = '';
  messageContainer.className = `reminder-scroll-message ${colorClass}`;
  messageContainer.style.display = 'flex'; // 立即显示容器
  
  // 创建滚动文本元素 - 立即显示文本内容
  const scrollText = document.createElement('span');
  scrollText.className = 'reminder-scroll-text';
  scrollText.textContent = message;
  messageContainer.appendChild(scrollText);
  
  // 先让文本可见，不等待动画设置
  messageContainer.style.overflow = 'visible';
  
  // 添加鼠标悬停事件，暂停/恢复动画
  messageContainer.addEventListener('mouseenter', () => {
    if (scrollText.style.animation && scrollText.style.animation !== 'none') {
      scrollText.style.animationPlayState = 'paused';
    }
  });
  
  messageContainer.addEventListener('mouseleave', () => {
    if (scrollText.style.animation && scrollText.style.animation !== 'none') {
      scrollText.style.animationPlayState = 'running';
    }
  });
  
  // 异步检查是否需要滚动（不影响文本立即显示）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const containerWidth = messageContainer.offsetWidth;
      const textWidth = scrollText.scrollWidth;
      
      if (textWidth > containerWidth) {
        // 文本超出容器，启用滚动动画
        messageContainer.style.overflow = 'hidden';
        // 计算动画时长（根据文本长度动态调整）
        const duration = Math.max(10, (textWidth / 50)); // 每50px需要1秒
        scrollText.style.animation = `scroll-message ${duration}s linear infinite`;
        scrollText.style.animationDelay = '0s'; // 立即开始滚动，无延迟
        scrollText.style.animationPlayState = 'running'; // 确保动画运行
      } else {
        // 文本不超出，直接显示，不需要滚动
        messageContainer.style.overflow = 'visible';
        scrollText.style.animation = 'none';
      }
    });
  });
  
  console.log('[DashboardReminders] 收款提醒滚动消息已渲染:', message, '天数:', daysSince, '颜色:', colorClass);
}

/**
 * 绑定设置按钮（独立函数，便于复用）
 */
function bindSettingsButton(container, settings, onSettingsClick) {
  const settingsBtn = container.querySelector('#btnShipmentSettings');
  if (settingsBtn) {
    // 移除所有旧的事件监听器（通过克隆节点）
    const newBtn = settingsBtn.cloneNode(true);
    settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);
    
    // 确保按钮可点击
    newBtn.style.cursor = 'pointer';
    newBtn.style.pointerEvents = 'auto';
    newBtn.style.position = 'relative';
    newBtn.style.zIndex = '10';
    newBtn.setAttribute('title', '设置提前天数');
    
    // 添加点击事件
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[DashboardReminders] 设置按钮被点击，当前提前天数:', settings?.advanceDays || 5);
      
      if (onSettingsClick) {
        onSettingsClick(settings?.advanceDays || 5);
      } else {
        console.warn('[DashboardReminders] onSettingsClick 回调未提供');
        if (window.NotificationSystem) {
          window.NotificationSystem.toast('设置功能未配置', 'warning');
        }
      }
    };
    
    newBtn.addEventListener('click', handleClick);
    newBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  } else {
    console.warn('[DashboardReminders] 设置按钮未找到，容器:', container);
  }
}

/**
 * 绑定收款提醒设置按钮
 */
function bindPaymentSettingsButton(container, settings, onSettingsClick) {
  const settingsBtn = container.querySelector('#btnPaymentSettings');
  if (settingsBtn) {
    // 移除所有旧的事件监听器（通过克隆节点）
    const newBtn = settingsBtn.cloneNode(true);
    settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);
    
    // 确保按钮可点击
    newBtn.style.cursor = 'pointer';
    newBtn.style.pointerEvents = 'auto';
    newBtn.style.position = 'relative';
    newBtn.style.zIndex = '10';
    newBtn.setAttribute('title', '设置滚动消息内容');
    
    // 添加点击事件
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[DashboardReminders] 收款提醒设置按钮被点击，当前模板:', settings?.messageTemplate || '默认');
      
      if (onSettingsClick) {
        onSettingsClick(settings?.messageTemplate || '');
      } else {
        console.warn('[DashboardReminders] onSettingsClick 回调未提供');
        if (window.NotificationSystem) {
          window.NotificationSystem.toast('设置功能未配置', 'warning');
        }
      }
    };
    
    newBtn.addEventListener('click', handleClick);
    newBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  } else {
    console.warn('[DashboardReminders] 收款提醒设置按钮未找到，容器:', container);
  }
}

/**
 * 渲染收款提醒卡片
 * @param {HTMLElement} container - 卡片容器
 * @param {Object} remindersData - 提醒数据
 * @param {Object} settings - 设置对象（包含messageTemplate）
 * @param {Function} onSettingsClick - 设置按钮点击回调
 */
export function renderPaymentReminder(container, remindersData, settings, onSettingsClick) {
  if (!container) {
    console.warn('[DashboardReminders] 收款提醒容器未找到');
    return;
  }

  const list = container.querySelector('#paymentReminderList');
  const empty = container.querySelector('#paymentReminderEmpty');
  
  if (!list || !empty) {
    console.warn('[DashboardReminders] 收款提醒列表或空状态元素未找到');
    return;
  }

  list.innerHTML = '';

  // 检查数据
  if (!remindersData) {
    console.warn('[DashboardReminders] 收款提醒数据为空');
    list.style.display = 'none';
    empty.style.display = 'block';
    // 隐藏消息条
    const messageContainer = container.querySelector('#paymentScrollMessage');
    if (messageContainer) {
      messageContainer.style.display = 'none';
    }
    // 即使没有数据，也要绑定设置按钮
    bindPaymentSettingsButton(container, settings, onSettingsClick);
    return;
  }

  const orders = remindersData.orders || [];
  if (orders.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    // 隐藏消息条
    const messageContainer = container.querySelector('#paymentScrollMessage');
    if (messageContainer) {
      messageContainer.style.display = 'none';
    }
    // 即使没有数据，也要绑定设置按钮
    bindPaymentSettingsButton(container, settings, onSettingsClick);
    return;
  }

  list.style.display = 'block';
  empty.style.display = 'none';

  // 对订单进行排序：已发货时间最长的订单显示在最上面
  const sortedOrders = [...orders].sort((a, b) => {
    // 获取发货后天数，如果没有则设为0（放在最后）
    const daysA = a.daysSinceShipment !== null && a.daysSinceShipment !== undefined ? a.daysSinceShipment : 0;
    const daysB = b.daysSinceShipment !== null && b.daysSinceShipment !== undefined ? b.daysSinceShipment : 0;
    
    // 降序排列：天数最多的在前
    // 如果天数相同，按发票号排序（确保排序稳定）
    if (daysB !== daysA) {
      return daysB - daysA;
    }
    
    // 天数相同时，按发票号排序
    const invoiceNoA = (a.invoiceNo || a.contractNo || '').toLowerCase();
    const invoiceNoB = (b.invoiceNo || b.contractNo || '').toLowerCase();
    return invoiceNoA.localeCompare(invoiceNoB);
  });

  // 渲染滚动消息条（显示发货时间最长的订单）
  renderPaymentScrollMessage(container, sortedOrders, settings?.messageTemplate);

  // 绑定设置按钮
  bindPaymentSettingsButton(container, settings, onSettingsClick);

  sortedOrders.forEach(order => {
    const item = document.createElement('div');
    item.className = 'reminder-item';
    
    item.addEventListener('click', () => {
      // 使用合同编号进行筛选
      const orderNo = order.contractNo;
      if (orderNo) {
        // 跳转到订单列表页面，并自动筛选该订单
        navigateTo(`orders/list?orderNo=${encodeURIComponent(orderNo)}`);
      }
    });

    // 优化后的单行显示布局
    const content = document.createElement('div');
    content.className = 'reminder-item-content';
    
    // 左侧：合同编号
    const leftSection = document.createElement('div');
    leftSection.className = 'reminder-item-left';
    
    const contractNo = document.createElement('span');
    contractNo.className = 'reminder-item-contract-no';
    // 显示合同编号，如果合同编号为空则显示 '-'
    const displayText = order.contractNo ? String(order.contractNo).trim() : '-';
    contractNo.textContent = displayText;
    
    leftSection.appendChild(contractNo);
    
    // 中间：金额
    const amountSection = document.createElement('div');
    amountSection.className = 'reminder-item-amount-section';
    const amountIcon = document.createElement('span');
    amountIcon.className = 'reminder-item-icon';
    amountIcon.textContent = '💰';
    const amountInfo = document.createElement('span');
    amountInfo.className = 'reminder-item-amount';
    amountInfo.textContent = `$${formatMoney(order.totalAmount)}`;
    amountSection.appendChild(amountIcon);
    amountSection.appendChild(amountInfo);
    
    // 右侧：到账信息（带标签样式）
    const timeSection = document.createElement('div');
    timeSection.className = 'reminder-item-time-section';
    if (order.paymentDate) {
      const daysUntil = order.daysUntilPayment;
      if (daysUntil !== null && daysUntil !== undefined) {
        if (daysUntil === 0) {
          timeSection.className = 'reminder-item-time-section reminder-item-time-urgent';
          timeSection.textContent = '今天到账';
        } else if (daysUntil === 1) {
          timeSection.className = 'reminder-item-time-section reminder-item-time-warning';
          timeSection.textContent = '明天到账';
        } else {
          timeSection.className = 'reminder-item-time-section reminder-item-time-normal';
          timeSection.textContent = `还有 ${daysUntil} 天`;
        }
      } else {
        timeSection.className = 'reminder-item-time-section reminder-item-time-normal';
        timeSection.textContent = formatDate(order.paymentDate);
      }
    } else {
      // 未设置到账日期，显示"已发货X天"
      const daysSinceShipment = order.daysSinceShipment;
      if (daysSinceShipment !== null && daysSinceShipment !== undefined) {
        timeSection.className = 'reminder-item-time-section reminder-item-time-normal';
        timeSection.textContent = `已发货${daysSinceShipment}天`;
      } else {
        timeSection.className = 'reminder-item-time-section reminder-item-time-disabled';
        timeSection.textContent = '已发货';
      }
    }

    content.appendChild(leftSection);
    content.appendChild(amountSection);
    content.appendChild(timeSection);
    
    item.appendChild(content);
    list.appendChild(item);
  });
}

