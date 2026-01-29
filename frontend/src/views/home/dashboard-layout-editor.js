/**
 * 首页卡片布局编辑器
 * 允许用户在UI界面中手动调整各卡片的大小和位置
 * 
 * 使用方式：
 * 1. 点击"布局设置"按钮进入布局设置模式
 * 2. 在布局设置模式下，点击任意卡片会弹出该卡片的设置弹窗
 * 3. 修改设置后点击保存，立即生效
 * 4. 点击"退出布局设置"按钮退出布局设置模式
 */

// 布局设置模式状态
let isLayoutEditingMode = false;
let cardClickHandlers = new Map(); // 存储卡片点击事件处理器
let cardDragHandlers = new Map(); // 存储卡片拖动事件处理器
let cardResizeHandlers = new Map(); // 存储卡片调整大小事件处理器
let isDragging = false; // 是否正在拖动
let isResizing = false; // 是否正在调整大小
let dragState = null; // 拖动状态
let resizeState = null; // 调整大小状态

// 卡片配置定义
// 重新设计的布局方案（24列网格）：
// 第1-3行：欢迎卡片(8列x3行) + AI秘书(4列x5行) + 目的港(4列x5行) + 产品排名(4列x5行) + 箱型统计(4列x5行) = 24列
// 第4-6行：待办提醒(8列x3行)
// 第6-11行：发货提醒(6列x6行) + 收款提醒(6列x6行) = 12列
// 第12-13行：订单趋势(12列x2行) + 客户排行(12列x2行) = 24列
// 第15-20行：订单状态分布(6列x6行)
// 第16-17行：月度对比(12列x2行)
// 第18-19行：快速操作(6列x2行)
// 第20-21行：最近操作记录(6列x2行)
// 更新后的卡片配置（从保存的布局同步）
const CARD_CONFIGS = {
  'welcomeCard': {
    name: '欢迎卡片',
    id: 'welcomeCard',
    selector: '#welcomeCard',
    defaultCols: 8,
    defaultRows: 3,
    defaultColStart: 1,
    defaultRowStart: 1,
    minCols: 2,
    maxCols: 24,
    minRows: 1,
    maxRows: 8
  },
  'todoReminderCard': {
    name: '待办提醒',
    id: 'todoReminderCard',
    selector: '#todoReminderCard',
    defaultCols: 8,
    defaultRows: 3,
    defaultColStart: 1,
    defaultRowStart: 4,
    minCols: 2,
    maxCols: 24,
    minRows: 1,
    maxRows: 8
  },
  'aiSecretaryCard': {
    name: 'AI秘书',
    id: 'aiSecretaryCard',
    selector: '#aiSecretaryCard',
    defaultCols: 4,
    defaultRows: 5,
    defaultColStart: 9,
    defaultRowStart: 1,
    minCols: 1,
    maxCols: 12,
    minRows: 1,
    maxRows: 8
  },
  'destinationDistributionCard': {
    name: '目的港城市分布',
    id: 'destinationDistributionCard',
    selector: '#destinationDistributionCard',
    defaultCols: 4,
    defaultRows: 5,
    defaultColStart: 13,
    defaultRowStart: 1,
    minCols: 1,
    maxCols: 12,
    minRows: 1,
    maxRows: 8
  },
  'productRankingCard': {
    name: '产品数量排名',
    id: 'productRankingCard',
    selector: '#productRankingCard',
    defaultCols: 4,
    defaultRows: 5,
    defaultColStart: 17,
    defaultRowStart: 1,
    minCols: 1,
    maxCols: 12,
    minRows: 1,
    maxRows: 8
  },
  'boxTypeStatsCard': {
    name: '箱型统计',
    id: 'boxTypeStatsCard',
    selector: '#boxTypeStatsCard',
    defaultCols: 4,
    defaultRows: 5,
    defaultColStart: 21,
    defaultRowStart: 1,
    minCols: 1,
    maxCols: 12,
    minRows: 1,
    maxRows: 8
  },
  'shipmentReminderCard': {
    name: '发货提醒',
    id: 'shipmentReminderCard',
    selector: '#shipmentReminderCard',
    defaultCols: 6,
    defaultRows: 6,
    defaultColStart: 1,
    defaultRowStart: 7,
    minCols: 1,
    maxCols: 12,
    minRows: 1,
    maxRows: 12
  },
  'paymentReminderCard': {
    name: '收款提醒',
    id: 'paymentReminderCard',
    selector: '#paymentReminderCard',
    defaultCols: 6,
    defaultRows: 6,
    defaultColStart: 7,
    defaultRowStart: 7,
    minCols: 1,
    maxCols: 12,
    minRows: 1,
    maxRows: 12
  },
  'statusDistributionChart': {
    name: '订单状态分布',
    id: 'statusDistributionChart',
    selector: '#statusDistributionChart',
    defaultCols: 12,
    defaultRows: 6,
    defaultColStart: 1,
    defaultRowStart: 18,
    minCols: 1,
    maxCols: 12,
    minRows: 1,
    maxRows: 8
  },
  'dailyTopicCard': {
    name: '每日话题',
    id: 'dailyTopicCard',
    selector: '#dailyTopicCard',
    defaultCols: 16,
    defaultRows: 1,
    defaultColStart: 9,
    defaultRowStart: 6,
    minCols: 2,
    maxCols: 24,
    minRows: 1,
    maxRows: 8
  },
  'orderTrendChart': {
    name: '订单趋势',
    id: 'orderTrendChart',
    selector: '#orderTrendChart',
    defaultCols: 12,
    defaultRows: 5,
    defaultColStart: 13,
    defaultRowStart: 13,
    minCols: 2,
    maxCols: 24,
    minRows: 1,
    maxRows: 8
  },
  'customerRankingChart': {
    name: '客户交易排行',
    id: 'customerRankingChart',
    selector: '#customerRankingChart',
    defaultCols: 12,
    defaultRows: 5,
    defaultColStart: 1,
    defaultRowStart: 13,
    minCols: 2,
    maxCols: 24,
    minRows: 1,
    maxRows: 8
  },
  'monthlyComparisonChart': {
    name: '月度对比',
    id: 'monthlyComparisonChart',
    selector: '#monthlyComparisonChart',
    defaultCols: 12,
    defaultRows: 6,
    defaultColStart: 13,
    defaultRowStart: 18,
    minCols: 2,
    maxCols: 24,
    minRows: 1,
    maxRows: 8
  },
  'yearlyComparisonChart': {
    name: '年度对比',
    id: 'yearlyComparisonChart',
    selector: '#yearlyComparisonChart',
    defaultCols: 12,
    defaultRows: 6,
    defaultColStart: 1,
    defaultRowStart: 24,
    minCols: 2,
    maxCols: 24,
    minRows: 1,
    maxRows: 8
  },
  'quickActions': {
    name: '快速操作',
    id: 'quickActions',
    selector: '#quickActions',
    defaultCols: 6,
    defaultRows: 6,
    defaultColStart: 13,
    defaultRowStart: 7,
    minCols: 2,
    maxCols: 24,
    minRows: 1,
    maxRows: 8
  },
  'recentActivities': {
    name: '最近操作记录',
    id: 'recentActivities',
    selector: '#recentActivities',
    defaultCols: 6,
    defaultRows: 6,
    defaultColStart: 19,
    defaultRowStart: 7,
    minCols: 2,
    maxCols: 24,
    minRows: 1,
    maxRows: 8
  }
};

// 计算鼠标位置对应的网格列和行
function getGridPositionFromMouse(event, container) {
  const containerRect = container.getBoundingClientRect();
  const containerStyle = window.getComputedStyle(container);
  const padding = parseFloat(containerStyle.paddingLeft);
  const gap = parseFloat(containerStyle.gap) || 16;
  const cols = 24;
  
  // 计算相对于容器内容区域的位置（减去padding）
  const x = event.clientX - containerRect.left - padding;
  const y = event.clientY - containerRect.top - padding;
  
  // 计算列宽：(容器宽度 - 左右padding - gap * (列数-1)) / 列数
  const containerWidth = container.clientWidth - padding * 2;
  const columnWidth = (containerWidth - gap * (cols - 1)) / cols;
  const rowHeight = parseFloat(containerStyle.getPropertyValue('grid-auto-rows')) || columnWidth;
  
  // 计算列位置（从1开始）
  let col = Math.floor(x / (columnWidth + gap)) + 1;
  col = Math.max(1, Math.min(col, cols));
  
  // 计算行位置（从1开始）
  let row = Math.floor(y / (rowHeight + gap)) + 1;
  row = Math.max(1, row);
  
  return { col, row, columnWidth, rowHeight };
}

// 从localStorage加载布局设置
function loadLayoutSettings() {
  try {
    const saved = localStorage.getItem('dashboard_card_layout');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('[布局编辑器] 加载设置失败:', error);
  }
  return {};
}

// 保存布局设置到localStorage（兼容360极速浏览器）
function saveLayoutSettings(settings) {
  try {
    // 确保保存所有卡片的配置
    const allCardSettings = {};
    Object.keys(CARD_CONFIGS).forEach(cardKey => {
      // 如果settings中有该卡片的配置，使用保存的；否则使用默认配置
      if (settings[cardKey]) {
        allCardSettings[cardKey] = settings[cardKey];
      } else {
        const config = CARD_CONFIGS[cardKey];
        allCardSettings[cardKey] = {
          colStart: config.defaultColStart,
          cols: config.defaultCols,
          rowStart: config.defaultRowStart,
          rows: config.defaultRows
        };
      }
    });
    
    const settingsStr = JSON.stringify(allCardSettings);
    const dataSize = new Blob([settingsStr]).size; // 计算数据大小（字节）
    
    // 检查数据大小是否超过localStorage限制（通常约5-10MB）
    if (dataSize > 5 * 1024 * 1024) {
      console.warn('[布局编辑器] ⚠️ 数据较大，可能会遇到存储限制:', dataSize, 'bytes');
    }
    
    // 尝试保存
    localStorage.setItem('dashboard_card_layout', settingsStr);
    
    console.log('[布局编辑器] ✅ 布局设置已保存到localStorage');
    console.log('[布局编辑器] 保存的设置数量:', Object.keys(allCardSettings).length, '/ 总卡片数:', Object.keys(CARD_CONFIGS).length);
    console.log('[布局编辑器] 数据大小:', dataSize, 'bytes');
    
    // 验证保存是否成功
    const verify = localStorage.getItem('dashboard_card_layout');
    if (verify && verify === settingsStr) {
      const verifyParsed = JSON.parse(verify);
      console.log('[布局编辑器] ✅ 验证：保存成功，卡片数:', Object.keys(verifyParsed).length);
      
      // 检查是否所有卡片都被保存
      const missingCards = Object.keys(CARD_CONFIGS).filter(key => !verifyParsed[key]);
      if (missingCards.length > 0) {
        console.warn('[布局编辑器] ⚠️ 警告：以下卡片未在保存的数据中:', missingCards);
        // 自动补充缺失的卡片
        missingCards.forEach(cardKey => {
          const config = CARD_CONFIGS[cardKey];
          verifyParsed[cardKey] = {
            colStart: config.defaultColStart,
            cols: config.defaultCols,
            rowStart: config.defaultRowStart,
            rows: config.defaultRows
          };
        });
        // 重新保存完整数据
        const completeStr = JSON.stringify(verifyParsed);
        localStorage.setItem('dashboard_card_layout', completeStr);
        console.log('[布局编辑器] ✅ 已补充缺失的卡片配置并重新保存');
      }
    } else {
      console.error('[布局编辑器] ❌ 验证：保存失败，数据不匹配或为空');
      if (!verify) {
        console.error('[布局编辑器] ❌ localStorage中未找到保存的数据');
      } else if (verify.length !== settingsStr.length) {
        console.error('[布局编辑器] ❌ 数据长度不匹配:', '保存:', settingsStr.length, '验证:', verify.length);
      }
    }
    return true;
  } catch (error) {
    console.error('[布局编辑器] ❌ 保存设置失败:', error);
    
    // 如果是配额超出错误，提供更友好的提示
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      console.error('[布局编辑器] ❌ localStorage存储空间不足，请清除浏览器缓存后重试');
    } else if (error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.error('[布局编辑器] ❌ localStorage存储配额已满，请清除浏览器缓存后重试');
    }
    
    return false;
  }
}

// 防抖定时器，避免短时间内多次应用布局
let applyLayoutTimer = null;
let lastAppliedSettings = null;
let isApplyingLayout = false;

// 应用布局设置到CSS（兼容360极速浏览器等旧版浏览器）
function applyLayoutSettings(settings, force = false) {
  // 如果正在应用布局且不是强制应用，则跳过
  if (isApplyingLayout && !force) {
    return;
  }
  
  // 检查设置是否与上次相同，如果相同且不是强制应用，则跳过
  if (!force && lastAppliedSettings) {
    const settingsStr = JSON.stringify(settings);
    const lastStr = JSON.stringify(lastAppliedSettings);
    if (settingsStr === lastStr) {
      return; // 设置相同，跳过应用
    }
  }
  
  const container = document.querySelector('.dashboard-container');
  if (!container) {
    console.warn('[布局编辑器] 未找到容器 .dashboard-container');
    return;
  }
  
  isApplyingLayout = true;
  lastAppliedSettings = JSON.parse(JSON.stringify(settings)); // 深拷贝保存
  
  // 检测浏览器是否支持 setProperty 的 priority 参数
  const supportsPriority = (function() {
    try {
      const testEl = document.createElement('div');
      testEl.style.setProperty('test', 'value', 'important');
      return testEl.style.getPropertyPriority('test') === 'important';
    } catch (e) {
      return false;
    }
  })();
  
  let appliedCount = 0;
  let errorCount = 0;
  
  Object.keys(settings).forEach(cardKey => {
    const config = CARD_CONFIGS[cardKey];
    if (!config) {
      console.warn(`[布局编辑器] 未找到卡片配置: ${cardKey}`);
      return;
    }
    
    const setting = settings[cardKey];
    const element = document.querySelector(config.selector);
    if (!element) {
      console.warn(`[布局编辑器] 未找到卡片元素: ${config.selector}`);
      return;
    }
    
    // 验证并规范化设置值（确保在合理范围内）
    let colStart = setting.colStart;
    let cols = setting.cols;
    let rowStart = setting.rowStart;
    let rows = setting.rows;
    
    // 验证列起始位置（1-24）
    if (colStart === undefined || isNaN(colStart) || colStart < 1 || colStart > 24) {
      colStart = config.defaultColStart;
    }
    // 验证列数（1-24，且不能超出边界）
    if (cols === undefined || isNaN(cols) || cols < config.minCols || cols > config.maxCols) {
      cols = config.defaultCols;
    }
    if (colStart + cols - 1 > 24) {
      cols = 24 - colStart + 1; // 调整列数以适应边界
    }
    
    // 验证行起始位置（>= 1）
    if (rowStart === undefined || isNaN(rowStart) || rowStart < 1) {
      rowStart = config.defaultRowStart;
    }
    // 验证行数（>= minRows, <= maxRows）
    if (rows === undefined || isNaN(rows) || rows < config.minRows || rows > config.maxRows) {
      rows = config.defaultRows;
    }
    
    try {
      // 应用grid-column（先清除旧值再设置新值，避免累积）
      if (colStart !== undefined && cols !== undefined) {
        const gridColumnValue = `${colStart} / span ${cols}`;
        // 先清除可能存在的旧值
        element.style.removeProperty('grid-column');
        // 然后设置新值
        if (supportsPriority) {
          element.style.setProperty('grid-column', gridColumnValue, 'important');
        } else {
          // 兼容旧浏览器：直接设置带!important的样式
          element.style.setProperty('grid-column', gridColumnValue);
          // 对于不支持priority的浏览器，通过覆盖cssText中的特定属性
          const currentCssText = element.style.cssText || '';
          // 移除旧的grid-column
          const cleanedCssText = currentCssText.replace(/grid-column\s*:[^;]*;?/gi, '');
          element.style.cssText = cleanedCssText + '; grid-column: ' + gridColumnValue + ' !important;';
        }
      }
      
      // 应用grid-row（先清除旧值再设置新值）
      if (rowStart !== undefined && rows !== undefined) {
        // 先清除可能存在的旧值
        element.style.removeProperty('grid-row');
        element.style.removeProperty('height');
        element.style.removeProperty('max-height');
        
        // 支持小数行数
        if (Number.isInteger(rows)) {
          // 整数行数：使用 span 格式
          const gridRowValue = `${rowStart} / span ${rows}`;
          if (supportsPriority) {
            element.style.setProperty('grid-row', gridRowValue, 'important');
          } else {
            // 兼容旧浏览器
            element.style.setProperty('grid-row', gridRowValue);
            const currentCssText = element.style.cssText || '';
            const cleanedCssText = currentCssText.replace(/grid-row\s*:[^;]*;?/gi, '');
            element.style.cssText = cleanedCssText + '; grid-row: ' + gridRowValue + ' !important;';
          }
        } else {
          // 小数行数：使用 span 向上取整，然后通过 height 控制实际高度
          const spanRows = Math.ceil(rows);
          const gridRowValue = `${rowStart} / span ${spanRows}`;
          const heightPercent = (rows / spanRows) * 100;
          
          if (supportsPriority) {
            element.style.setProperty('grid-row', gridRowValue, 'important');
            element.style.setProperty('height', `${heightPercent}%`, 'important');
            element.style.setProperty('max-height', `${heightPercent}%`, 'important');
          } else {
            // 兼容旧浏览器
            element.style.setProperty('grid-row', gridRowValue);
            element.style.setProperty('height', `${heightPercent}%`);
            element.style.setProperty('max-height', `${heightPercent}%`);
            const currentCssText = element.style.cssText || '';
            const cleanedCssText = currentCssText.replace(/grid-row\s*:[^;]*;?/gi, '');
            element.style.cssText = cleanedCssText + '; grid-row: ' + gridRowValue + ' !important; height: ' + heightPercent + '% !important; max-height: ' + heightPercent + '% !important;';
          }
        }
      }
      
      appliedCount++;
    } catch (error) {
      errorCount++;
      console.error(`[布局编辑器] 应用 ${cardKey} 布局失败:`, error, setting);
    }
  });
  
  console.log(`[布局编辑器] 布局应用完成: 成功 ${appliedCount}, 失败 ${errorCount}`);
  
  // 标记应用完成
  isApplyingLayout = false;
  
  // 强制重绘，确保360极速浏览器正确应用样式（只在必要时执行）
  if (force || appliedCount > 0) {
    if (container.offsetHeight) {
      void container.offsetHeight; // 触发重排
    }
  }
}

// 获取当前布局设置
function getCurrentLayoutSettings() {
  const settings = {};
  Object.keys(CARD_CONFIGS).forEach(cardKey => {
    const config = CARD_CONFIGS[cardKey];
    const element = document.querySelector(config.selector);
    if (!element) return;
    
    const computedStyle = window.getComputedStyle(element);
    const gridColumn = computedStyle.gridColumn;
    const gridRow = computedStyle.gridRow;
    
    // 解析grid-column: start / span cols
    const colMatch = gridColumn.match(/(\d+)\s*\/\s*span\s*(\d+)/);
    // 解析grid-row: 支持两种格式
    // 1. start / span rows (整数行数)
    // 2. start / end (小数行数，rows = end - start)
    let rowStart = config.defaultRowStart;
    let rows = config.defaultRows;
    
    if (gridRow) {
      // 尝试匹配 span 格式: "1 / span 2"
      const spanMatch = gridRow.match(/(\d+)\s*\/\s*span\s*([\d.]+)/);
      if (spanMatch) {
        rowStart = parseInt(spanMatch[1]);
        const spanValue = parseFloat(spanMatch[2]);
        
        // 检查是否有 height 样式（表示小数行数）
        const computedStyle = window.getComputedStyle(element);
        const height = computedStyle.height;
        const maxHeight = computedStyle.maxHeight;
        
        // 如果设置了 height 或 maxHeight 百分比，说明是小数行数
        if (height && height.includes('%')) {
          const heightPercent = parseFloat(height);
          // 计算实际行数：spanValue * (heightPercent / 100)
          rows = spanValue * (heightPercent / 100);
        } else {
          rows = spanValue;
        }
      }
    }
    
    settings[cardKey] = {
      colStart: colMatch ? parseInt(colMatch[1]) : config.defaultColStart,
      cols: colMatch ? parseInt(colMatch[2]) : config.defaultCols,
      rowStart: rowStart,
      rows: rows
    };
  });
  return settings;
}

// 获取单个卡片的当前设置
function getCardSettings(cardKey) {
  const config = CARD_CONFIGS[cardKey];
  if (!config) return null;
  
  const savedSettings = loadLayoutSettings();
  const currentSettings = getCurrentLayoutSettings();
  const settings = { ...currentSettings, ...savedSettings }; // 合并设置，保存的优先
  
  return settings[cardKey] || {
    colStart: config.defaultColStart,
    cols: config.defaultCols,
    rowStart: config.defaultRowStart,
    rows: config.defaultRows
  };
}

// 初始化卡片拖动功能
function initCardDrag(cardKey, element, config) {
  let isDraggingCard = false;
  let dragStartPos = null;
  let originalPosition = null;
  
  // 创建拖动句柄（在卡片顶部显示一个拖动条）
  const dragHandle = document.createElement('div');
  dragHandle.className = 'card-drag-handle';
  dragHandle.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 30px;
    background: rgba(99, 102, 241, 0.1);
    cursor: move;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px 12px 0 0;
    z-index: 10;
    opacity: 0;
    transition: opacity 0.2s;
  `;
  dragHandle.innerHTML = '<span style="color: #6366f1; font-size: 16px;">⋮⋮</span>';
  element.appendChild(dragHandle);
  
  // 鼠标悬停时显示拖动句柄
  element.addEventListener('mouseenter', () => {
    if (!isResizing) {
      dragHandle.style.opacity = '1';
    }
  });
  
  element.addEventListener('mouseleave', () => {
    if (!isDraggingCard) {
      dragHandle.style.opacity = '0';
    }
  });
  
    // 拖动开始
    dragHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      isDraggingCard = true;
      isDragging = true;
      dragHandle.style.opacity = '1';
      
      const container = document.querySelector('.dashboard-container');
      if (!container) return;
      
      // 获取当前卡片的位置
      const currentSettings = getCardSettings(cardKey);
      originalPosition = {
        colStart: currentSettings.colStart,
        rowStart: currentSettings.rowStart
      };
      
      dragStartPos = getGridPositionFromMouse(e, container);
      
      // 计算鼠标相对于卡片左上角的偏移（用于平滑拖动）
      const cardRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetX = e.clientX - cardRect.left;
      const offsetY = e.clientY - cardRect.top;
      
      // 添加拖动样式
      element.classList.add('dragging');
      element.style.opacity = '0.7';
      element.style.zIndex = '1000';
      element.style.transition = 'none';
      
      // 添加全局拖动事件
      const onMouseMove = (e) => {
        if (!isDraggingCard || !container) return;
        
        const pos = getGridPositionFromMouse(e, container);
        
        // 考虑鼠标在卡片上的偏移，让拖动更精确
        // 计算应该放置的网格位置（鼠标位置减去偏移量对应的网格数）
        const containerStyle = window.getComputedStyle(container);
        const padding = parseFloat(containerStyle.paddingLeft);
        const gap = parseFloat(containerStyle.gap) || 16;
        const cols = 24;
        const containerWidth = container.clientWidth - padding * 2;
        const columnWidth = (containerWidth - gap * (cols - 1)) / cols;
        const rowHeight = parseFloat(containerStyle.getPropertyValue('grid-auto-rows')) || columnWidth;
        
        // 计算偏移量对应的网格数（取整，使拖动更平滑）
        const offsetCols = Math.round(offsetX / (columnWidth + gap));
        const offsetRows = Math.round(offsetY / (rowHeight + gap));
        
        // 计算新位置（考虑偏移）
        let newColStart = pos.col - offsetCols;
        let newRowStart = pos.row - offsetRows;
        
        // 确保不超出边界（保持原有大小不变）
        newColStart = Math.max(1, Math.min(newColStart, 24 - currentSettings.cols + 1));
        newRowStart = Math.max(1, newRowStart);
        
        // 应用新位置，保持大小不变（只更新 colStart 和 rowStart）
        const tempSettings = {
          colStart: newColStart,
          rowStart: newRowStart,
          cols: currentSettings.cols,  // 保持原有列数
          rows: currentSettings.rows   // 保持原有行数
        };
        applyLayoutSettings({ [cardKey]: tempSettings });
      };
      
      const onMouseUp = () => {
        if (!isDraggingCard || !container) return;
        
        isDraggingCard = false;
        isDragging = false;
        
        // 恢复样式
        element.classList.remove('dragging');
        element.style.opacity = '';
        element.style.zIndex = '';
        element.style.transition = '';
        dragHandle.style.opacity = '0';
        
        // 获取最终位置并保存（确保保存所有卡片的完整配置）
        const finalSettings = getCardSettings(cardKey);
        // 获取当前所有卡片的实际布局状态，而不是只更新localStorage中的部分数据
        const allCurrentSettings = getCurrentLayoutSettings();
        allCurrentSettings[cardKey] = finalSettings; // 更新当前卡片
        saveLayoutSettings(allCurrentSettings);
        
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast(`${config.name}位置已更新`, 'success');
        }
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  
  return { element, dragHandle };
}

// 初始化卡片大小调整功能
function initCardResize(cardKey, element, config) {
  let isResizingCard = false;
  let resizeStartPos = null;
  let originalSize = null;
  
  // 创建调整大小句柄（在卡片右下角）
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'card-resize-handle';
  resizeHandle.style.cssText = `
    position: absolute;
    bottom: 0;
    right: 0;
    width: 20px;
    height: 20px;
    background: rgba(99, 102, 241, 0.9);
    cursor: nwse-resize;
    z-index: 10;
    border-radius: 12px 0 12px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  `;
  resizeHandle.innerHTML = '<span style="color: white; font-size: 12px; transform: rotate(45deg);">↗</span>';
  element.appendChild(resizeHandle);
  
  // 鼠标悬停时显示调整大小句柄
  element.addEventListener('mouseenter', () => {
    if (!isDragging) {
      resizeHandle.style.opacity = '1';
    }
  });
  
  element.addEventListener('mouseleave', () => {
    if (!isResizingCard) {
      resizeHandle.style.opacity = '0';
    }
  });
  
  // 调整大小开始
  resizeHandle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    isResizingCard = true;
    isResizing = true;
    resizeHandle.style.opacity = '1';
    
    const container = document.querySelector('.dashboard-container');
    if (!container) return;
    
    // 获取当前卡片的大小
    const currentSettings = getCardSettings(cardKey);
    originalSize = {
      cols: currentSettings.cols,
      rows: currentSettings.rows
    };
    
    resizeStartPos = getGridPositionFromMouse(e, container);
    const cardRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    resizeStartPos.cardRight = cardRect.right;
    resizeStartPos.cardBottom = cardRect.bottom;
    resizeStartPos.containerLeft = containerRect.left;
    resizeStartPos.containerTop = containerRect.top;
    
      // 添加调整大小样式
      element.classList.add('resizing');
      element.style.transition = 'none';
      
      // 添加全局调整大小事件
      const onMouseMove = (e) => {
        if (!isResizingCard || !container) return;
        
        const containerRect = container.getBoundingClientRect();
        const containerStyle = window.getComputedStyle(container);
        const padding = parseFloat(containerStyle.paddingLeft);
        const gap = parseFloat(containerStyle.gap) || 16;
        const cols = 24;
        
        const containerWidth = container.clientWidth - padding * 2;
        const columnWidth = (containerWidth - gap * (cols - 1)) / cols;
        const rowHeight = parseFloat(containerStyle.getPropertyValue('grid-auto-rows')) || columnWidth;
        
        // 计算鼠标相对于容器的位置
        const x = e.clientX - containerRect.left - padding;
        const y = e.clientY - containerRect.top - padding;
        
        // 计算卡片右下角应该在的网格位置（基于当前卡片的位置保持不变）
        const cardEndCol = Math.ceil(x / (columnWidth + gap));
        const cardEndRow = Math.ceil(y / (rowHeight + gap));
        
        // 计算新的列数和行数（基于当前的 colStart 和 rowStart，保持位置不变）
        let newCols = cardEndCol - currentSettings.colStart + 1;
        let newRows = cardEndRow - currentSettings.rowStart + 1;
        
        // 限制在最小最大值之间
        newCols = Math.max(config.minCols || 1, Math.min(newCols, config.maxCols || 24));
        newRows = Math.max(config.minRows || 1, Math.min(newRows, config.maxRows || 8));
        
        // 确保不超过网格边界（保持位置不变）
        if (currentSettings.colStart + newCols - 1 > 24) {
          newCols = 24 - currentSettings.colStart + 1;
        }
        
        // 应用新大小，保持位置不变（只更新 cols 和 rows）
        const tempSettings = {
          colStart: currentSettings.colStart,  // 保持原有列起始位置
          rowStart: currentSettings.rowStart,  // 保持原有行起始位置
          cols: newCols,  // 只更新列数
          rows: newRows   // 只更新行数
        };
        applyLayoutSettings({ [cardKey]: tempSettings });
      };
      
      const onMouseUp = () => {
        if (!isResizingCard || !container) return;
        
        isResizingCard = false;
        isResizing = false;
        
        // 恢复样式
        element.classList.remove('resizing');
        element.style.transition = '';
        resizeHandle.style.opacity = '0';
        
        // 获取最终大小并保存（确保保存所有卡片的完整配置）
        const finalSettings = getCardSettings(cardKey);
        // 获取当前所有卡片的实际布局状态，而不是只更新localStorage中的部分数据
        const allCurrentSettings = getCurrentLayoutSettings();
        allCurrentSettings[cardKey] = finalSettings; // 更新当前卡片
        saveLayoutSettings(allCurrentSettings);
        
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast(`${config.name}大小已更新`, 'success');
        }
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  
  return { element, resizeHandle };
}

// 显示单个卡片的设置弹窗
async function showCardSettingsDialog(cardKey) {
  const config = CARD_CONFIGS[cardKey];
  if (!config) return;
  
  const setting = getCardSettings(cardKey);
  
  // 生成表单HTML
  const formHTML = `
    <div class="layout-card-settings-form" style="padding: 8px 0;">
      <div style="margin-bottom: 16px; padding: 12px; background: #f3f4f6; border-radius: 8px; font-size: 13px; color: #6b7280;">
        <strong>说明：</strong>调整卡片的位置和大小。位置从第1列/第1行开始计算，大小表示占据的列数/行数。行数支持小数（如1.5、2.5等），可以更精确地控制卡片高度。
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #6b7280; font-weight: 500;">起始列</label>
          <input type="number" 
                 id="card_${cardKey}_colStart" 
                 value="${setting.colStart}" 
                 min="1" 
                 max="24" 
                 style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
        </div>
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #6b7280; font-weight: 500;">占据列数</label>
          <input type="number" 
                 id="card_${cardKey}_cols" 
                 value="${setting.cols}" 
                 min="${config.minCols}" 
                 max="${config.maxCols}" 
                 style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
        </div>
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #6b7280; font-weight: 500;">起始行</label>
          <input type="number" 
                 id="card_${cardKey}_rowStart" 
                 value="${setting.rowStart}" 
                 min="1" 
                 max="40" 
                 style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
        </div>
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #6b7280; font-weight: 500;">占据行数（支持小数）</label>
          <input type="number" 
                 id="card_${cardKey}_rows" 
                 value="${setting.rows}" 
                 min="${config.minRows}" 
                 max="${config.maxRows}" 
                 step="0.1"
                 style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
        </div>
      </div>
    </div>
  `;
  
  const footerHTML = `
    <button class="btn secondary" data-action="reset" style="margin-right: 8px;">重置为默认</button>
    <button class="btn secondary" data-action="cancel">取消</button>
    <button class="btn primary" data-action="confirm">保存</button>
  `;
  
  // 实时预览功能
  const previewSetting = { ...setting };
  
  // 绑定输入事件，实时预览
  const setupPreview = () => {
    const colStartInput = document.getElementById(`card_${cardKey}_colStart`);
    const colsInput = document.getElementById(`card_${cardKey}_cols`);
    const rowStartInput = document.getElementById(`card_${cardKey}_rowStart`);
    const rowsInput = document.getElementById(`card_${cardKey}_rows`);
    
    if (colStartInput && colsInput && rowStartInput && rowsInput) {
      const updatePreview = () => {
        previewSetting.colStart = parseInt(colStartInput.value) || config.defaultColStart;
        previewSetting.cols = parseInt(colsInput.value) || config.defaultCols;
        previewSetting.rowStart = parseInt(rowStartInput.value) || config.defaultRowStart;
        previewSetting.rows = parseFloat(rowsInput.value) || config.defaultRows;
        
        // 应用预览设置
        const currentSettings = getCurrentLayoutSettings();
        currentSettings[cardKey] = previewSetting;
        applyLayoutSettings({ [cardKey]: previewSetting });
      };
      
      colStartInput.addEventListener('input', updatePreview);
      colsInput.addEventListener('input', updatePreview);
      rowStartInput.addEventListener('input', updatePreview);
      rowsInput.addEventListener('input', updatePreview);
    }
  };
  
  const result = await window.ModalDialog.custom(formHTML, {
    title: `设置：${config.name}`,
    footer: footerHTML,
    size: 'small',
    onConfirm: () => {
      const colStartInput = document.getElementById(`card_${cardKey}_colStart`);
      const colsInput = document.getElementById(`card_${cardKey}_cols`);
      const rowStartInput = document.getElementById(`card_${cardKey}_rowStart`);
      const rowsInput = document.getElementById(`card_${cardKey}_rows`);
      
      if (colStartInput && colsInput && rowStartInput && rowsInput) {
        const newSetting = {
          colStart: parseInt(colStartInput.value) || config.defaultColStart,
          cols: parseInt(colsInput.value) || config.defaultCols,
          rowStart: parseInt(rowStartInput.value) || config.defaultRowStart,
          rows: parseFloat(rowsInput.value) || config.defaultRows
        };
        
        // 保存设置（确保保存所有卡片的完整配置）
        // 获取当前所有卡片的实际布局状态，而不是只更新localStorage中的部分数据
        const allCurrentSettings = getCurrentLayoutSettings();
        allCurrentSettings[cardKey] = newSetting; // 更新当前卡片
        
        if (saveLayoutSettings(allCurrentSettings)) {
          // 应用设置
          applyLayoutSettings({ [cardKey]: newSetting });
          if (window.NotificationSystem?.toast) {
            window.NotificationSystem.toast(`${config.name}设置已保存`, 'success');
          }
          return true; // 关闭弹窗
        } else {
          if (window.NotificationSystem?.toast) {
            window.NotificationSystem.toast('保存失败', 'error');
          }
          return false; // 不关闭弹窗
        }
      }
      return true;
    },
    onCancel: () => {
      // 取消时恢复原始设置
      const originalSetting = getCardSettings(cardKey);
      applyLayoutSettings({ [cardKey]: originalSetting });
      return true;
    },
    onAction: (action) => {
      if (action === 'reset') {
        // 重置为默认设置
        const defaultSetting = {
          colStart: config.defaultColStart,
          cols: config.defaultCols,
          rowStart: config.defaultRowStart,
          rows: config.defaultRows
        };
        
        // 更新输入框
        const colStartInput = document.getElementById(`card_${cardKey}_colStart`);
        const colsInput = document.getElementById(`card_${cardKey}_cols`);
        const rowStartInput = document.getElementById(`card_${cardKey}_rowStart`);
        const rowsInput = document.getElementById(`card_${cardKey}_rows`);
        
        if (colStartInput) colStartInput.value = defaultSetting.colStart;
        if (colsInput) colsInput.value = defaultSetting.cols;
        if (rowStartInput) rowStartInput.value = defaultSetting.rowStart;
        if (rowsInput) rowsInput.value = defaultSetting.rows;
        
        // 应用默认设置并预览
        applyLayoutSettings({ [cardKey]: defaultSetting });
        Object.assign(previewSetting, defaultSetting);
        
        if (window.NotificationSystem?.toast) {
          window.NotificationSystem.toast('已重置为默认设置', 'info');
        }
      }
    }
  });
  
  // 设置实时预览
  setTimeout(setupPreview, 100);
  
  return result;
}

// 进入布局设置模式
function enterLayoutEditingMode() {
  if (isLayoutEditingMode) return;
  
  isLayoutEditingMode = true;
  
  // 为所有卡片添加拖动和调整大小功能
  Object.keys(CARD_CONFIGS).forEach(cardKey => {
    const config = CARD_CONFIGS[cardKey];
    const element = document.querySelector(config.selector);
    if (!element) return;
    
    // 添加编辑模式样式
    element.style.position = 'relative';
    element.classList.add('layout-editing-card');
    
    // 初始化拖动功能
    const dragHandler = initCardDrag(cardKey, element, config);
    cardDragHandlers.set(cardKey, dragHandler);
    
    // 初始化调整大小功能
    const resizeHandler = initCardResize(cardKey, element, config);
    cardResizeHandlers.set(cardKey, resizeHandler);
    
    // 添加点击事件处理器（双击弹出设置弹窗，作为辅助功能）
    const clickHandler = (e) => {
      // 如果点击的是拖动句柄或调整大小句柄，不触发
      if (e.target.closest('.card-drag-handle') || e.target.closest('.card-resize-handle')) {
        return;
      }
      
      // 双击弹出设置弹窗
      if (e.detail === 2) {
      e.stopPropagation();
      e.preventDefault();
      showCardSettingsDialog(cardKey);
      }
    };
    
    element.addEventListener('click', clickHandler);
    cardClickHandlers.set(cardKey, { element, handler: clickHandler });
    
    // 添加编辑提示图标（显示拖动和调整大小提示）
    if (!element.querySelector('.layout-edit-indicator')) {
      const indicator = document.createElement('div');
      indicator.className = 'layout-edit-indicator';
      indicator.innerHTML = '⚙️';
      indicator.style.cssText = `
        position: absolute;
        bottom: 35px;
        right: 8px;
        background: rgba(99, 102, 241, 0.9);
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        pointer-events: none;
        cursor: pointer;
      `;
      // 允许点击图标弹出设置弹窗
      indicator.style.pointerEvents = 'auto';
      indicator.addEventListener('click', (e) => {
        e.stopPropagation();
        showCardSettingsDialog(cardKey);
      });
      element.appendChild(indicator);
    }
  });
  
  // 更新按钮文本
  const layoutBtn = document.getElementById('btnLayoutSettings');
  if (layoutBtn) {
    layoutBtn.innerHTML = '<span>✅</span> 退出布局设置';
    layoutBtn.classList.add('editing-mode');
  }
  
  // 添加容器样式提示和网格背景
  const container = document.querySelector('.dashboard-container');
  if (container) {
    container.classList.add('layout-editing-mode');
    
    // 创建网格背景元素
    if (!container.querySelector('.layout-grid-background')) {
      const gridBg = document.createElement('div');
      gridBg.className = 'layout-grid-background';
      container.insertBefore(gridBg, container.firstChild);
    }
  }
  
  if (window.NotificationSystem?.toast) {
    window.NotificationSystem.toast('已进入布局设置模式：拖动顶部条移动卡片，拖动右下角调整大小，双击或点击⚙️图标打开详细设置', 'info');
  }
}

// 退出布局设置模式
async function exitLayoutEditingMode() {
  if (!isLayoutEditingMode) return;
  
  // 检查是否有保存的布局设置，询问是否同步到默认布局
  const savedSettings = loadLayoutSettings();
  if (savedSettings && Object.keys(savedSettings).length > 0) {
    const shouldSync = await window.ModalDialog.confirm(
      '检测到您有保存的布局设置，是否要将修改后的布局同步到默认布局中？',
      {
        title: '同步布局到默认值',
        confirmText: '同步',
        cancelText: '取消'
      }
    );
    
    if (shouldSync) {
      syncLayoutToDefaults();
    }
  }
  
  isLayoutEditingMode = false;
  isDragging = false;
  isResizing = false;
  
  // 移除所有卡片的点击事件和视觉提示
  cardClickHandlers.forEach(({ element, handler }, cardKey) => {
    if (element) {
      element.removeEventListener('click', handler);
      element.classList.remove('layout-editing-card');
      
      // 移除拖动句柄
      const dragHandle = element.querySelector('.card-drag-handle');
      if (dragHandle) {
        dragHandle.remove();
      }
      
      // 移除调整大小句柄
      const resizeHandle = element.querySelector('.card-resize-handle');
      if (resizeHandle) {
        resizeHandle.remove();
      }
      
      // 移除编辑提示图标
      const indicator = element.querySelector('.layout-edit-indicator');
      if (indicator) {
        indicator.remove();
      }
      
      // 恢复样式
      element.style.opacity = '';
      element.style.zIndex = '';
      element.style.transition = '';
    }
  });
  
  cardClickHandlers.clear();
  cardDragHandlers.clear();
  cardResizeHandlers.clear();
  
  // 更新按钮文本
  const layoutBtn = document.getElementById('btnLayoutSettings');
  if (layoutBtn) {
    layoutBtn.innerHTML = '<span>⚙️</span> 布局设置';
    layoutBtn.classList.remove('editing-mode');
  }
  
  // 移除容器样式和网格背景
  const container = document.querySelector('.dashboard-container');
  if (container) {
    container.classList.remove('layout-editing-mode');
    
    // 移除网格背景元素
    const gridBg = container.querySelector('.layout-grid-background');
    if (gridBg) {
      gridBg.remove();
    }
  }
  
  if (window.NotificationSystem?.toast) {
    window.NotificationSystem.toast('已退出布局设置模式', 'info');
  }
}

// 切换布局设置模式
export async function toggleLayoutEditingMode() {
  if (isLayoutEditingMode) {
    await exitLayoutEditingMode();
  } else {
    enterLayoutEditingMode();
  }
}

// 显示布局编辑器弹窗（保留旧接口，但改为进入编辑模式）
export async function showLayoutEditor() {
  // 直接进入布局设置模式
  enterLayoutEditingMode();
}

// 设置行高等于列宽
function setRowHeightEqualToColumnWidth() {
  const container = document.querySelector('.dashboard-container');
  if (!container) return;
  
  // 获取容器的计算样式
  const containerStyle = window.getComputedStyle(container);
  const padding = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
  const gap = parseFloat(containerStyle.gap) || 16;
  const containerWidth = container.clientWidth;
  
  // 计算列宽：(容器宽度 - 左右padding - gap * (列数-1)) / 列数
  const cols = 24;
  const columnWidth = (containerWidth - padding - gap * (cols - 1)) / cols;
  
  // 设置行高等于列宽
  container.style.setProperty('grid-auto-rows', `${columnWidth}px`, 'important');
  
  // 监听窗口大小变化，动态调整行高
  const resizeObserver = new ResizeObserver(() => {
    const newContainerWidth = container.clientWidth;
    const newColumnWidth = (newContainerWidth - padding - gap * (cols - 1)) / cols;
    container.style.setProperty('grid-auto-rows', `${newColumnWidth}px`, 'important');
  });
  
  resizeObserver.observe(container);
  
  // 存储observer以便后续清理
  if (!container._layoutResizeObserver) {
    container._layoutResizeObserver = resizeObserver;
  }
}

// 清除旧的布局设置（用于重置为新布局）
export function clearLayoutSettings() {
  try {
    localStorage.removeItem('dashboard_card_layout');
    console.log('[布局编辑器] ✅ 已清除保存的布局设置');
    console.log('[布局编辑器] 💡 请刷新页面以应用默认布局');
    if (window.NotificationSystem?.toast) {
      window.NotificationSystem.toast('已清除布局设置，请刷新页面', 'info');
    }
    return true;
  } catch (error) {
    console.error('[布局编辑器] ❌ 清除设置失败:', error);
    return false;
  }
}

// 检测布局是否有问题（检查卡片重叠、尺寸异常等）
function detectLayoutIssues() {
  const container = document.querySelector('.dashboard-container');
  if (!container) return false;
  
  const cards = [];
  let hasIssue = false;
  
  Object.keys(CARD_CONFIGS).forEach(cardKey => {
    const config = CARD_CONFIGS[cardKey];
    const element = document.querySelector(config.selector);
    if (!element) return;
    
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    const gridColumn = computedStyle.gridColumn;
    const gridRow = computedStyle.gridRow;
    
    cards.push({
      key: cardKey,
      name: config.name,
      element,
      rect,
      gridColumn,
      gridRow
    });
  });
  
  // 检查是否有卡片位置异常（比如位置为0或负数，尺寸异常等）
  cards.forEach(card => {
    if (card.rect.width <= 0 || card.rect.height <= 0) {
      console.warn(`[布局检测] 卡片 ${card.name} 尺寸异常:`, card.rect);
      hasIssue = true;
    }
    if (card.gridColumn === 'auto' || card.gridRow === 'auto') {
      console.warn(`[布局检测] 卡片 ${card.name} 使用了auto布局，可能导致问题`);
    }
    // 检查是否在可视区域外（可能是布局错误）
    if (card.rect.right < 0 || card.rect.bottom < 0 || card.rect.left > window.innerWidth) {
      console.warn(`[布局检测] 卡片 ${card.name} 位置异常，可能在可视区域外`);
      hasIssue = true;
    }
  });
  
  return hasIssue;
}

// 调试函数：检查当前保存的布局设置
export function debugLayoutSettings() {
  const saved = loadLayoutSettings();
  const defaults = {};
  Object.keys(CARD_CONFIGS).forEach(cardKey => {
    const config = CARD_CONFIGS[cardKey];
    defaults[cardKey] = {
      colStart: config.defaultColStart,
      cols: config.defaultCols,
      rowStart: config.defaultRowStart,
      rows: config.defaultRows
    };
  });
  
  console.log('=== 布局设置调试信息 ===');
  console.log('保存的设置数量:', Object.keys(saved).length);
  console.log('总卡片数量:', Object.keys(CARD_CONFIGS).length);
  console.log('保存的设置:', saved);
  console.log('默认配置:', defaults);
  console.log('localStorage原始数据:', localStorage.getItem('dashboard_card_layout'));
  
  // 检查每个卡片元素是否存在和应用情况
  console.log('\n=== 卡片元素状态检查 ===');
  Object.keys(CARD_CONFIGS).forEach(cardKey => {
    const config = CARD_CONFIGS[cardKey];
    const element = document.querySelector(config.selector);
    if (element) {
      const computedStyle = window.getComputedStyle(element);
      const defaultConfig = defaults[cardKey];
      const savedConfig = saved[cardKey];
      const isUsingSaved = savedConfig && (
        savedConfig.colStart !== defaultConfig.colStart ||
        savedConfig.cols !== defaultConfig.cols ||
        savedConfig.rowStart !== defaultConfig.rowStart ||
        savedConfig.rows !== defaultConfig.rows
      );
      
      console.log(`${config.name} (${cardKey}):`, {
        元素存在: true,
        当前gridColumn: computedStyle.gridColumn,
        当前gridRow: computedStyle.gridRow,
        默认配置: defaultConfig,
        保存的配置: savedConfig || '未保存',
        是否使用保存的配置: isUsingSaved ? '是' : '否'
      });
    } else {
      console.warn(`${config.name} (${cardKey}): 元素不存在 - ${config.selector}`);
    }
  });
  
  return { saved, defaults, configs: CARD_CONFIGS };
}

// 将调试函数暴露到全局，方便在控制台调用
if (typeof window !== 'undefined') {
  window.debugLayoutSettings = debugLayoutSettings;
  window.clearLayoutSettings = clearLayoutSettings;
}


// 初始化时应用默认布局（布局设置仅用于调试，生产环境始终使用默认布局）
// 初始化标志位，防止重复初始化（每次切换到首页时重置）
let isLayoutInitialized = false;

// 重置布局初始化标志位（用于页面切换时重新初始化）
export function resetLayoutInitialization() {
  isLayoutInitialized = false;
  console.log('[布局编辑器] 已重置初始化标志位，允许重新初始化');
}

// 检测是否为旧浏览器（需要多次应用布局）
function isOldBrowser() {
  try {
    // 检测360极速浏览器等旧浏览器
    const ua = navigator.userAgent.toLowerCase();
    const is360 = ua.indexOf('360se') > -1 || ua.indexOf('360ee') > -1;
    const isOldIE = /msie [1-9]\./.test(ua);
    return is360 || isOldIE;
  } catch (e) {
    return false;
  }
}

// 检查所有卡片元素是否已存在
function checkAllCardsExist() {
  const requiredCards = Object.keys(CARD_CONFIGS);
  const missingCards = [];
  
  requiredCards.forEach(cardKey => {
    const config = CARD_CONFIGS[cardKey];
    if (config && config.selector) {
      const element = document.querySelector(config.selector);
      if (!element) {
        missingCards.push(cardKey);
      }
    }
  });
  
  return {
    allExist: missingCards.length === 0,
    missingCards
  };
}

export function initLayoutSettings() {
  // 防止重复初始化（但在页面切换时会重置）
  if (isLayoutInitialized) {
    console.log('[布局编辑器] 已初始化，跳过重复调用');
    return;
  }
  
  // 检查所有卡片元素是否已存在
  const cardCheck = checkAllCardsExist();
  if (!cardCheck.allExist) {
    console.warn('[布局编辑器] 部分卡片元素未找到，延迟初始化:', cardCheck.missingCards);
    // 延迟重试，最多重试5次
    let retries = 0;
    const maxRetries = 5;
    const retryInit = () => {
      const check = checkAllCardsExist();
      if (check.allExist || retries >= maxRetries) {
        if (check.allExist) {
          console.log('[布局编辑器] 所有卡片元素已就绪，开始初始化');
          isLayoutInitialized = true;
          doInitLayoutSettings();
        } else {
          console.warn('[布局编辑器] 重试次数已达上限，部分卡片可能缺失:', check.missingCards);
          // 即使有缺失的卡片，也尝试初始化（部分布局总比没有好）
          isLayoutInitialized = true;
          doInitLayoutSettings();
        }
      } else {
        retries++;
        setTimeout(retryInit, 200);
      }
    };
    setTimeout(retryInit, 200);
    return;
  }
  
  isLayoutInitialized = true;
  doInitLayoutSettings();
}

// 执行实际的布局初始化
function doInitLayoutSettings() {
  
  // 准备默认布局（始终使用默认布局，不加载保存的设置）
  const defaultSettings = {};
  Object.keys(CARD_CONFIGS).forEach(cardKey => {
    const config = CARD_CONFIGS[cardKey];
    defaultSettings[cardKey] = {
      colStart: config.defaultColStart,
      cols: config.defaultCols,
      rowStart: config.defaultRowStart,
      rows: config.defaultRows
    };
  });
  
  // 检查是否有保存的设置（仅用于调试信息）
  const savedSettings = loadLayoutSettings();
  if (savedSettings && Object.keys(savedSettings).length > 0) {
    console.log('[布局编辑器] 💡 检测到保存的布局设置（仅用于调试，当前使用默认布局）');
    console.log('[布局编辑器] 保存的设置数量:', Object.keys(savedSettings).length, '/ 总卡片数:', Object.keys(CARD_CONFIGS).length);
    // 调试模式下，可以通过 window.applySavedLayout() 应用保存的设置
    if (typeof window !== 'undefined') {
      window.applySavedLayout = function() {
        console.log('[布局编辑器] 🔧 调试模式：应用保存的布局设置');
        let settingsToApply = { ...defaultSettings };
        Object.keys(savedSettings).forEach(cardKey => {
          if (CARD_CONFIGS[cardKey] && savedSettings[cardKey]) {
            settingsToApply[cardKey] = { ...savedSettings[cardKey] };
          }
        });
        applyLayoutSettings(settingsToApply, true);
        console.log('[布局编辑器] ✅ 已应用保存的布局设置');
      };
      console.log('[布局编辑器] 💡 调试提示：在控制台运行 window.applySavedLayout() 可应用保存的布局');
    }
  } else {
    console.log('[布局编辑器] ✅ 使用默认布局，卡片数:', Object.keys(defaultSettings).length);
  }
  
  console.log('[布局编辑器] 准备应用的布局设置（默认布局），卡片数:', Object.keys(defaultSettings).length);
  
  // 始终使用默认布局
  const settingsToApply = defaultSettings;
  
  // 检测是否为旧浏览器
  const needMultipleApplies = isOldBrowser();
  
  if (needMultipleApplies) {
    // 旧浏览器：需要多次应用以确保样式生效
    console.log('[布局编辑器] 检测到旧浏览器，将多次应用布局以确保样式生效');
    
    // 立即应用布局设置
    applyLayoutSettings(settingsToApply, true);
    
    // 使用防抖机制，避免频繁应用
    if (applyLayoutTimer) {
      clearTimeout(applyLayoutTimer);
    }
    
    // 延迟应用，确保DOM完全渲染
    applyLayoutTimer = setTimeout(() => {
      applyLayoutSettings(settingsToApply);
    }, 100);
    
    // 再次延迟应用，确保360极速浏览器正确渲染
    setTimeout(() => {
      applyLayoutSettings(settingsToApply);
    }, 300);
  } else {
    // 现代浏览器：只需应用一次
    console.log('[布局编辑器] 现代浏览器，单次应用布局');
    applyLayoutSettings(settingsToApply, true);
  }
  
  // 在下一帧设置行高等于列宽
  requestAnimationFrame(() => {
    setRowHeightEqualToColumnWidth();
  });
}

// 将修改后的布局同步到默认布局中
export function syncLayoutToDefaults() {
  try {
    const savedSettings = loadLayoutSettings();
    
    if (!savedSettings || Object.keys(savedSettings).length === 0) {
      if (window.NotificationSystem?.toast) {
        window.NotificationSystem.toast('没有找到保存的布局设置', 'warning');
      }
      return false;
    }
    
    // 更新 CARD_CONFIGS 中的默认值
    let syncedCount = 0;
    Object.keys(savedSettings).forEach(cardKey => {
      const config = CARD_CONFIGS[cardKey];
      if (!config) {
        console.warn(`[布局编辑器] 未找到卡片配置: ${cardKey}`);
        return;
      }
      
      const setting = savedSettings[cardKey];
      if (setting) {
        // 同步默认值
        if (setting.colStart !== undefined) {
          config.defaultColStart = setting.colStart;
        }
        if (setting.cols !== undefined) {
          config.defaultCols = setting.cols;
        }
        if (setting.rowStart !== undefined) {
          config.defaultRowStart = setting.rowStart;
        }
        if (setting.rows !== undefined) {
          config.defaultRows = setting.rows;
        }
        syncedCount++;
      }
    });
    
    console.log(`[布局编辑器] 已同步 ${syncedCount} 个卡片的默认布局设置`, savedSettings);
    
    // 生成更新后的代码片段，方便复制到文件中
    generateUpdatedConfigCode();
    
    if (window.NotificationSystem?.toast) {
      window.NotificationSystem.toast(`已成功同步 ${syncedCount} 个卡片的默认布局设置`, 'success');
    }
    
    return true;
  } catch (error) {
    console.error('[布局编辑器] 同步布局到默认值失败:', error);
    if (window.NotificationSystem?.toast) {
      window.NotificationSystem.toast('同步失败: ' + (error.message || '未知错误'), 'error');
    }
    return false;
  }
}

// 生成更新后的配置代码
function generateUpdatedConfigCode() {
  let code = '\n// 更新后的卡片配置（从保存的布局同步）\n';
  code += 'const CARD_CONFIGS = {\n';
  
  const cardKeys = Object.keys(CARD_CONFIGS);
  cardKeys.forEach((cardKey, index) => {
    const config = CARD_CONFIGS[cardKey];
    code += `  '${cardKey}': {\n`;
    code += `    name: '${config.name}',\n`;
    code += `    id: '${config.id}',\n`;
    code += `    selector: '${config.selector}',\n`;
    code += `    defaultCols: ${config.defaultCols},\n`;
    code += `    defaultRows: ${config.defaultRows},\n`;
    code += `    defaultColStart: ${config.defaultColStart},\n`;
    code += `    defaultRowStart: ${config.defaultRowStart},\n`;
    code += `    minCols: ${config.minCols},\n`;
    code += `    maxCols: ${config.maxCols},\n`;
    code += `    minRows: ${config.minRows},\n`;
    code += `    maxRows: ${config.maxRows}\n`;
    code += `  }${index < cardKeys.length - 1 ? ',' : ''}\n`;
  });
  
  code += '};\n';
  
  console.log('%c[布局编辑器] 更新后的配置代码:', 'color: #4CAF50; font-weight: bold;');
  console.log(code);
  
  // 同时输出到页面，方便用户查看和复制
  const outputDiv = document.createElement('div');
  outputDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border: 2px solid #4CAF50; border-radius: 8px; padding: 20px; max-width: 90%; max-height: 90%; overflow: auto; z-index: 10000; box-shadow: 0 4px 20px rgba(0,0,0,0.3);';
  outputDiv.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h3 style="margin: 0; color: #4CAF50;">布局配置已同步到代码</h3>
      <button id="closeConfigOutput" style="background: #f44336; color: white; border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer;">关闭</button>
    </div>
    <div style="margin-bottom: 10px;">
      <button id="copyConfigCode" style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;">📋 复制代码</button>
    </div>
    <pre id="configCodePreview" style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; margin: 0; font-size: 12px; line-height: 1.5; user-select: all;">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    <div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border-radius: 4px; font-size: 13px;">
      <strong>提示：</strong>请将上述代码复制并替换文件 <code>dashboard-layout-editor.js</code> 中的 <code>CARD_CONFIGS</code> 对象定义部分（约第22-179行）。
    </div>
  `;
  
  document.body.appendChild(outputDiv);
  
  // 复制代码功能
  document.getElementById('copyConfigCode').addEventListener('click', () => {
    const textarea = document.createElement('textarea');
    textarea.value = code;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      const btn = document.getElementById('copyConfigCode');
      const originalText = btn.textContent;
      btn.textContent = '✓ 已复制';
      btn.style.background = '#8BC34A';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '#4CAF50';
      }, 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
    document.body.removeChild(textarea);
  });
  
  // 关闭按钮
  document.getElementById('closeConfigOutput').addEventListener('click', () => {
    document.body.removeChild(outputDiv);
  });
  
  // 点击外部区域关闭
  outputDiv.addEventListener('click', (e) => {
    if (e.target === outputDiv) {
      document.body.removeChild(outputDiv);
    }
  });
}
