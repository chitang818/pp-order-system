/**
 * 图表工具函数
 * 封装 Chart.js 的创建和配置
 */

// 使用 chart.js/auto 自动注册所有组件
import { Chart, registerables } from 'chart.js';

// 注册所有 Chart.js 组件
Chart.register(...registerables);

/**
 * 默认图表配置
 */
const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: {
        usePointStyle: true,
        padding: 15,
        font: {
          size: 12,
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        }
      }
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      padding: 12,
      titleFont: {
        size: 13,
        weight: '600'
      },
      bodyFont: {
        size: 12
      },
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
      cornerRadius: 8,
      displayColors: true,
      callbacks: {
        label: function(context) {
          let label = context.dataset.label || '';
          if (label) {
            label += ': ';
          }
          if (context.parsed.y !== null) {
            label += typeof context.parsed.y === 'number' 
              ? context.parsed.y.toLocaleString('zh-CN')
              : context.parsed.y;
          }
          return label;
        }
      }
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      },
      ticks: {
        font: {
          size: 11
        },
        color: '#6b7280'
      }
    },
    y: {
      grid: {
        color: 'rgba(0, 0, 0, 0.05)',
        drawBorder: false
      },
      ticks: {
        font: {
          size: 11
        },
        color: '#6b7280',
        callback: function(value) {
          return value.toLocaleString('zh-CN');
        }
      }
    }
  }
};

/**
 * 创建折线图
 */
export function createLineChart(canvas, data, options = {}) {
  const config = {
    type: 'line',
    data: data,
    options: {
      ...defaultOptions,
      ...options,
      plugins: {
        ...defaultOptions.plugins,
        ...(options.plugins || {})
      }
    }
  };

  return new Chart(canvas, config);
}

/**
 * 创建柱状图
 */
export function createBarChart(canvas, data, options = {}) {
  const config = {
    type: 'bar',
    data: data,
    options: {
      ...defaultOptions,
      ...options,
      plugins: {
        ...defaultOptions.plugins,
        ...(options.plugins || {})
      }
    }
  };

  return new Chart(canvas, config);
}

/**
 * 创建饼图
 */
export function createPieChart(canvas, data, options = {}) {
  const config = {
    type: 'pie',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...defaultOptions.plugins,
        legend: {
          ...defaultOptions.plugins.legend,
          position: 'right',
          ...(options.plugins?.legend || {})
        },
        tooltip: {
          ...defaultOptions.plugins.tooltip,
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value} (${percentage}%)`;
            }
          },
          ...(options.plugins?.tooltip || {})
        },
        ...(options.plugins || {})
      },
      ...options
    }
  };

  return new Chart(canvas, config);
}

/**
 * 销毁图表
 */
export function destroyChart(chart) {
  if (chart && typeof chart.destroy === 'function') {
    chart.destroy();
  }
}

/**
 * 更新图表数据
 */
export function updateChart(chart, newData) {
  if (!chart) return;
  
  chart.data = newData;
  chart.update();
}

