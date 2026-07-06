/**
 * 仪表盘统计卡片渲染
 */

import { isAnalyticsSummaryNavEnabled } from '../../utils/ui-preferences.js';

function analyticsAmountTargetPath() {
  return isAnalyticsSummaryNavEnabled() ? '/analytics/summary' : '/analytics/export';
}

/**
 * 格式化金额
 */
function formatMoney(amount) {
  if (amount === null || amount === undefined) return '0';
  return Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * 数字动画效果
 */
function animateNumber(element, targetValue, options = {}) {
  if (!element) return;

  const duration = options.duration || 1000;
  const startValue = Number(element.textContent) || 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 使用缓动函数
    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOutQuart);
    
    element.textContent = currentValue;
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = targetValue;
    }
  }

  requestAnimationFrame(update);
}

/**
 * 创建统计卡片
 */
function createStatCard(config) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  card.style.setProperty('--color-start', config.color[0]);
  card.style.setProperty('--color-end', config.color[1]);

  if (config.onClick) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', config.onClick);
  }

  // 图标容器（圆形背景）
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'stat-card-icon-wrapper';
  iconWrapper.style.setProperty('--color-start', config.color[0]);
  iconWrapper.style.setProperty('--color-end', config.color[1]);
  iconWrapper.style.background = `linear-gradient(135deg, ${config.color[0]}, ${config.color[1]})`;

  const icon = document.createElement('div');
  icon.className = 'stat-card-icon';
  icon.textContent = config.icon;
  iconWrapper.appendChild(icon);

  // 内容区域
  const content = document.createElement('div');
  content.className = 'stat-card-content';

  const label = document.createElement('div');
  label.className = 'stat-card-label';
  label.textContent = config.label;

  const valueWrapper = document.createElement('div');
  valueWrapper.className = 'stat-card-value-wrapper';

  const value = document.createElement('div');
  value.className = 'stat-card-value';
  value.textContent = '0';

  // 如果有后缀（如USD），添加后缀
  if (config.suffix) {
    const suffix = document.createElement('span');
    suffix.className = 'stat-card-suffix';
    suffix.textContent = config.suffix;
    valueWrapper.appendChild(value);
    valueWrapper.appendChild(suffix);
  } else {
    valueWrapper.appendChild(value);
  }

  content.appendChild(label);
  content.appendChild(valueWrapper);

  card.appendChild(iconWrapper);
  card.appendChild(content);

  // 如果有后缀，标记卡片以便应用更宽的样式
  if (config.suffix) {
    card.setAttribute('data-has-suffix', 'true');
  }

  // 存储value元素，用于后续动画
  card._valueElement = value;

  return card;
}

/**
 * 渲染统计卡片
 */
export function renderStatsCards(stats, container) {
  if (!container) return;

  // 清空容器
  container.innerHTML = '';

  // 定义非金额统计卡片配置（先渲染）
  const nonAmountCardConfigs = [
    // 订单相关
    {
      id: 'totalOrders',
      label: '总订单数',
      value: stats.orders?.total || 0,
      icon: '📝',
      color: ['#7C9DFF', '#5B8FE8'],
      onClick: () => {
        if (window.navigateTo) {
          window.navigateTo('/orders/list');
        } else {
          window.location.hash = '#/orders/list';
        }
      }
    },
    {
      id: 'pendingOrders',
      label: '待发货订单',
      value: stats.orders?.pending || 0,
      icon: '📦',
      color: ['#A78BFA', '#8B5CF6'],
      onClick: () => {
        if (window.navigateTo) {
          window.navigateTo('/orders/list?status=已排产');
        } else {
          window.location.hash = '#/orders/list?status=已排产';
        }
      }
    },
    {
      id: 'shippedOrders',
      label: '已发货订单',
      value: stats.orders?.shipped || 0,
      icon: '🚚',
      color: ['#818CF8', '#6366F1'],
      onClick: () => {
        if (window.navigateTo) {
          window.navigateTo('/orders/list?status=已发货');
        } else {
          window.location.hash = '#/orders/list?status=已发货';
        }
      }
    },
    {
      id: 'completedOrders',
      label: '已完成订单',
      value: stats.orders?.completed || 0,
      icon: '✅',
      color: ['#6EE7B7', '#34D399'],
      onClick: () => {
        if (window.navigateTo) {
          window.navigateTo('/orders/list?status=已完成');
        } else {
          window.location.hash = '#/orders/list?status=已完成';
        }
      }
    },
    {
      id: 'monthlyNewOrders',
      label: '本月新增订单',
      value: stats.orders?.monthlyNew || 0,
      icon: '📈',
      color: ['#22D3EE', '#06B6D4'],
      onClick: () => {
        if (window.navigateTo) {
          window.navigateTo('/orders/list?monthly=true');
        } else {
          window.location.hash = '#/orders/list?monthly=true';
        }
      }
    },
    // 客户相关
    {
      id: 'totalCustomers',
      label: '总客户数',
      value: stats.customers?.total || 0,
      icon: '👥',
      color: ['#7C9DFF', '#5B8FE8'],
      onClick: () => {
        if (window.navigateTo) {
          window.navigateTo('/customers');
        } else {
          window.location.hash = '#/customers';
        }
      }
    }
  ];

  // 定义金额卡片配置（后渲染，显示在右侧）
  const amountCardConfigs = [
    {
      id: 'totalAmount',
      label: '订单总金额',
      value: formatMoney(stats.orders?.totalAmount || 0),
      icon: '💰',
      color: ['#FBBF24', '#F59E0B'],
      suffix: ' USD',
      onClick: () => {
        const p = analyticsAmountTargetPath();
        if (window.navigateTo) {
          window.navigateTo(p);
        } else {
          window.location.hash = `#${p.startsWith('/') ? p : '/' + p}`;
        }
      }
    },
    {
      id: 'monthlyAmount',
      label: '本月订单金额',
      value: formatMoney(stats.orders?.monthlyAmount || 0),
      icon: '💵',
      color: ['#F472B6', '#EC4899'],
      suffix: ' USD',
      onClick: () => {
        const p = analyticsAmountTargetPath();
        if (window.navigateTo) {
          window.navigateTo(p);
        } else {
          window.location.hash = `#${p.startsWith('/') ? p : '/' + p}`;
        }
      }
    }
  ];

  // 先创建并添加非金额卡片
  nonAmountCardConfigs.forEach(config => {
    const card = createStatCard(config);
    container.appendChild(card);

    // 延迟执行动画，让DOM先渲染
    setTimeout(() => {
      animateNumber(card._valueElement, config.value);
    }, 100);
  });

  // 然后创建并添加金额卡片（显示在右侧）
  amountCardConfigs.forEach(config => {
    const card = createStatCard(config);
    container.appendChild(card);

    // 延迟执行，直接设置文本（不重复添加后缀）
    setTimeout(() => {
      // 只设置数值，后缀已经在 createStatCard 中添加了
      card._valueElement.textContent = config.value;
    }, 100);
  });
}

/**
 * 渲染待办提醒卡片
 */
export function renderTodoReminderCard(container) {
  if (!container) {
    return;
  }
  
  // 暂时为空，后续添加内容
  container.innerHTML = `
    <div class="reminder-card-header">
      <div class="reminder-card-title">
        <span class="reminder-icon">📋</span>
        <span>待办提醒</span>
      </div>
    </div>
    <div class="stat-card-chart-content" style="display: flex; align-items: center; justify-content: center; min-height: 100px; color: #9ca3af;">
      <div style="text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">📋</div>
        <div style="font-size: 14px;">待办提醒功能开发中...</div>
      </div>
    </div>
  `;
}

/**
 * 渲染AI秘书卡片
 */
export function renderAISecretaryCard(container) {
  if (!container) {
    return;
  }
  
  // 暂时为空，后续添加内容
  container.innerHTML = `
    <div class="reminder-card-header">
      <div class="reminder-card-title">
        <span class="reminder-icon">🤖</span>
        <span>AI秘书</span>
      </div>
    </div>
    <div class="stat-card-chart-content" style="display: flex; align-items: center; justify-content: center; min-height: 150px; color: #9ca3af;">
      <div style="text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">🤖</div>
        <div style="font-size: 14px;">AI秘书功能开发中...</div>
      </div>
    </div>
  `;
}

/**
 * 渲染目的港城市分布卡片
 */
export function renderDestinationDistributionCard(container, data) {
  if (!container) {
    return;
  }
  
  if (!data || !Array.isArray(data) || data.length === 0) {
    container.innerHTML = `
      <div class="reminder-card-header">
        <div class="reminder-card-title">
          <span class="reminder-icon">🌍</span>
          <span>目的港城市分布</span>
        </div>
      </div>
      <div class="reminder-empty" style="display: block;">
        暂无数据
      </div>
    `;
    return;
  }

  // 按城市分组统计
  const cityMap = new Map();
  data.forEach(item => {
    const city = item.city || item.destination || '未知';
    if (!cityMap.has(city)) {
      cityMap.set(city, {
        city,
        orderCount: 0,
        totalAmount: 0
      });
    }
    const cityData = cityMap.get(city);
    cityData.orderCount += item.orderCount || 0;
    cityData.totalAmount += item.totalAmount || 0;
  });

  // 转换为数组并按订单数排序
  const cityList = Array.from(cityMap.values())
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 5); // 只显示前5名（高度缩小一半，减少显示数量）

  // 创建卡片内容（直接渲染到容器中，因为容器已经是reminder-card）
  container.innerHTML = `
    <div class="reminder-card-header">
      <div class="reminder-card-title">
        <span class="reminder-icon">🌍</span>
        <span>目的港城市分布</span>
      </div>
    </div>
    <div class="stat-card-chart-content">
      <div class="destination-list">
        ${cityList.map((item, index) => `
          <div class="destination-item">
            <div class="destination-rank">${index + 1}</div>
            <div class="destination-info">
              <div class="destination-city">${item.city}</div>
              <div class="destination-stats">
                <span class="destination-orders">${item.orderCount}单</span>
                <span class="destination-amount">${formatMoney(item.totalAmount)} USD</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * 渲染产品数量排名卡片
 */
export function renderProductQuantityRankingCard(container, data) {
  if (!container) {
    return;
  }
  
  if (!data || !Array.isArray(data) || data.length === 0) {
    container.innerHTML = `
      <div class="reminder-card-header">
        <div class="reminder-card-title">
          <span class="reminder-icon">📦</span>
          <span>产品数量排名</span>
        </div>
      </div>
      <div class="reminder-empty" style="display: block;">
        暂无数据
      </div>
    `;
    return;
  }

  // 限制显示数量为5个
  const displayData = data.slice(0, 5);

  // 创建卡片内容（直接渲染到容器中，因为容器已经是reminder-card）
  container.innerHTML = `
    <div class="reminder-card-header">
      <div class="reminder-card-title">
        <span class="reminder-icon">📦</span>
        <span>产品数量排名</span>
      </div>
    </div>
    <div class="stat-card-chart-content">
      <div class="product-ranking-list">
        ${displayData.map((item, index) => {
          return `
            <div class="product-ranking-item">
              <div class="product-ranking-rank">${index + 1}</div>
              <div class="product-ranking-info">
                <div class="product-ranking-model">${item.model || '未知型号'}</div>
                <div class="product-ranking-stats">
                  <span class="product-ranking-quantity">${item.totalQuantity || 0}条</span>
                  <span class="product-ranking-amount">${formatMoney(item.totalAmount || 0)} USD</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/**
 * 渲染箱型统计卡片
 */
export function renderBoxTypeStatsCard(container, data) {
  if (!container) {
    console.warn('[renderBoxTypeStatsCard] 容器未找到');
    return;
  }
  
  console.log('[renderBoxTypeStatsCard] 开始渲染，接收到的数据:', data);
  console.log('[renderBoxTypeStatsCard] 数据类型:', typeof data, '是否为数组:', Array.isArray(data));
  
  // 确保data是数组
  let boxTypeData = [];
  if (Array.isArray(data)) {
    boxTypeData = data;
  } else if (data && typeof data === 'object') {
    // 如果data是对象，尝试提取数组字段
    console.warn('[renderBoxTypeStatsCard] 数据不是数组，尝试转换:', Object.keys(data));
    // 检查是否有data属性（可能是API包装格式）
    if (data.data && Array.isArray(data.data)) {
      boxTypeData = data.data;
    } else if (Array.isArray(data.boxTypeStats)) {
      boxTypeData = data.boxTypeStats;
    } else {
      boxTypeData = [];
    }
  }
  
  console.log('[renderBoxTypeStatsCard] 处理后的数据:', boxTypeData, '长度:', boxTypeData.length);
  
  if (boxTypeData.length === 0) {
    container.innerHTML = `
      <div class="reminder-card-header">
        <div class="reminder-card-title">
          <span class="reminder-icon">🚛</span>
          <span>箱型统计</span>
        </div>
      </div>
      <div class="reminder-empty" style="display: block; padding: 20px; text-align: center; color: #9ca3af;">
        暂无数据
      </div>
    `;
    console.log('[renderBoxTypeStatsCard] 渲染空数据状态');
    return;
  }

  // 限制显示数量为5个
  const displayData = boxTypeData.slice(0, 5);

  // 创建卡片内容（直接渲染到容器中，因为容器已经是reminder-card）
  container.innerHTML = `
    <div class="reminder-card-header">
      <div class="reminder-card-title">
        <span class="reminder-icon">🚛</span>
        <span>箱型统计</span>
      </div>
    </div>
    <div class="stat-card-chart-content">
      <div class="product-ranking-list">
        ${displayData.map((item, index) => {
          return `
            <div class="product-ranking-item">
              <div class="product-ranking-rank">${index + 1}</div>
              <div class="product-ranking-info">
                <div class="product-ranking-model">${item.boxType || '未知箱型'}</div>
                <div class="product-ranking-stats">
                  <span class="product-ranking-quantity">${item.orderCount || 0}个</span>
                  <span class="product-ranking-amount">${formatMoney(item.totalAmount || 0)} USD</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  console.log('[renderBoxTypeStatsCard] 渲染完成，共', boxTypeData.length, '条数据');
}

/**
 * 渲染每日话题卡片
 */
export function renderDailyTopicCard(container) {
  if (!container) {
    console.warn('[renderDailyTopicCard] 容器未找到');
    return;
  }
  
  // 渲染每日话题卡片，表头在左侧，内容在右侧
  container.innerHTML = `
    <div class="topic-card-header">
      <div class="topic-card-title">每日话题</div>
    </div>
    <div class="topic-card-content">
      <div class="topic-card-placeholder">功能开发中...</div>
    </div>
  `;
}

