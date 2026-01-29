/**
 * 仪表盘图表渲染
 */

import { createLineChart, createBarChart, createPieChart, destroyChart } from '../../utils/chart-utils.js';

/**
 * 渲染订单趋势图（折线图）
 */
export function renderOrderTrendChart(container, trendsData, days = 30) {
  if (!container || !trendsData) {
    console.warn('[DashboardCharts] 订单趋势图：缺少容器或数据');
    return null;
  }

  // 获取或创建图表容器
  let chartContainer = container.querySelector('.chart-container');
  if (!chartContainer) {
    chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    container.appendChild(chartContainer);
  }

  // 清除旧图表
  const oldCanvas = chartContainer.querySelector('canvas');
  if (oldCanvas) {
    oldCanvas.remove();
  }

  // 创建 canvas 元素
  const canvas = document.createElement('canvas');
  chartContainer.appendChild(canvas);

  // 准备数据 - 添加防御性检查
  const orderCountArr = trendsData.orderCount || [];
  const orderAmountArr = trendsData.orderAmount || [];

  if (orderCountArr.length === 0) {
    console.warn('[DashboardCharts] 订单趋势图：没有订单数量数据');
    return null;
  }

  const labels = orderCountArr.map(item => {
    const date = new Date(item.date);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });

  const orderCountData = orderCountArr.map(item => item.count);
  const orderAmountData = orderAmountArr.map(item => item.amount);

  const chartData = {
    labels: labels,
    datasets: [
      {
        label: '订单数量',
        data: orderCountData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y',
        pointRadius: 3,
        pointHoverRadius: 5
      },
      {
        label: '订单金额(USD)',
        data: orderAmountData,
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y1',
        pointRadius: 3,
        pointHoverRadius: 5
      }
    ]
  };

  const chartOptions = {
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              if (context.dataset.yAxisID === 'y1') {
                // 金额格式
                label += '$' + context.parsed.y.toLocaleString('zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
              } else {
                // 数量格式
                label += context.parsed.y.toLocaleString('zh-CN');
              }
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        type: 'linear',
        position: 'left',
        title: {
          display: true,
          text: '订单数量',
          color: '#6b7280',
          font: {
            size: 12
          }
        },
        ticks: {
          callback: function (value) {
            return value.toLocaleString('zh-CN');
          }
        }
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: {
          display: true,
          text: '订单金额(USD)',
          color: '#6b7280',
          font: {
            size: 12
          }
        },
        ticks: {
          callback: function (value) {
            return '$' + value.toLocaleString('zh-CN', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            });
          }
        },
        grid: {
          drawOnChartArea: false
        }
      }
    }
  };

  try {
    const chart = createLineChart(canvas, chartData, chartOptions);
    return chart;
  } catch (error) {
    console.error('[DashboardCharts] 创建订单趋势图失败:', error);
    return null;
  }
}

/**
 * 渲染订单状态分布（饼图）
 */
export function renderStatusDistributionChart(container, distributionData) {
  if (!container || !distributionData) {
    console.warn('[DashboardCharts] 状态分布图：缺少容器或数据');
    return null;
  }

  // 获取或创建图表容器
  let chartContainer = container.querySelector('.chart-container');
  if (!chartContainer) {
    chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    container.appendChild(chartContainer);
  }

  // 清除旧图表
  const oldCanvas = chartContainer.querySelector('canvas');
  if (oldCanvas) {
    oldCanvas.remove();
  }

  // 创建 canvas 元素
  const canvas = document.createElement('canvas');
  chartContainer.appendChild(canvas);

  // 准备数据
  const labels = Object.keys(distributionData);
  const data = Object.values(distributionData);

  // 状态颜色映射
  const statusColors = {
    '已创建': ['rgba(156, 163, 175, 0.8)', 'rgba(107, 114, 128, 1)'],
    '已排产': ['rgba(59, 130, 246, 0.8)', 'rgba(37, 99, 235, 1)'],
    '已发货': ['rgba(251, 191, 36, 0.8)', 'rgba(245, 158, 11, 1)'],
    '已完成': ['rgba(16, 185, 129, 0.8)', 'rgba(5, 150, 105, 1)']
  };

  const backgroundColors = labels.map(label => statusColors[label]?.[0] || 'rgba(156, 163, 175, 0.8)');
  const borderColors = labels.map(label => statusColors[label]?.[1] || 'rgba(107, 114, 128, 1)');

  const chartData = {
    labels: labels,
    datasets: [{
      data: data,
      backgroundColor: backgroundColors,
      borderColor: borderColors,
      borderWidth: 2
    }]
  };

  const chartOptions = {
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          padding: 15,
          usePointStyle: true,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

  try {
    const chart = createPieChart(canvas, chartData, chartOptions);
    return chart;
  } catch (error) {
    console.error('[DashboardCharts] 创建状态分布图失败:', error);
    return null;
  }
}

/**
 * 渲染客户交易排行（柱状图）
 */
export function renderCustomerRankingChart(container, rankingData) {
  if (!container || !rankingData || !Array.isArray(rankingData)) {
    console.warn('[DashboardCharts] 客户排行图：缺少容器或数据');
    return null;
  }

  // 获取或创建图表容器
  let chartContainer = container.querySelector('.chart-container');
  if (!chartContainer) {
    chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    container.appendChild(chartContainer);
  }

  // 清除旧图表
  const oldCanvas = chartContainer.querySelector('canvas');
  if (oldCanvas) {
    oldCanvas.remove();
  }

  // 创建 canvas 元素
  const canvas = document.createElement('canvas');
  chartContainer.appendChild(canvas);

  // 准备数据（最多显示10个）
  const displayData = rankingData.slice(0, 10);
  const labels = displayData.map(item => item.customerName || '-');
  const data = displayData.map(item => item.totalAmount || 0);

  const chartData = {
    labels: labels,
    datasets: [{
      label: '交易金额(USD)',
      data: data,
      backgroundColor: 'rgba(102, 126, 234, 0.8)',
      borderColor: 'rgba(102, 126, 234, 1)',
      borderWidth: 1,
      borderRadius: 6
    }]
  };

  const chartOptions = {
    indexAxis: 'y', // 横向柱状图
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            return '$' + context.parsed.x.toLocaleString('zh-CN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '交易金额(USD)',
          color: '#6b7280',
          font: {
            size: 12
          }
        },
        ticks: {
          callback: function (value) {
            return '$' + value.toLocaleString('zh-CN', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            });
          }
        }
      },
      y: {
        ticks: {
          font: {
            size: 11
          }
        }
      }
    }
  };

  try {
    const chart = createBarChart(canvas, chartData, chartOptions);
    return chart;
  } catch (error) {
    console.error('[DashboardCharts] 创建客户排行图失败:', error);
    return null;
  }
}

/**
 * 渲染月度对比（柱状图）
 */
export function renderMonthlyComparisonChart(container, comparisonData) {
  if (!container || !comparisonData) {
    console.warn('[DashboardCharts] 月度对比图：缺少容器或数据');
    return null;
  }

  // 获取或创建图表容器
  let chartContainer = container.querySelector('.chart-container');
  if (!chartContainer) {
    chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    container.appendChild(chartContainer);
  }

  // 清除旧图表
  const oldCanvas = chartContainer.querySelector('canvas');
  if (oldCanvas) {
    oldCanvas.remove();
  }

  // 创建 canvas 元素
  const canvas = document.createElement('canvas');
  chartContainer.appendChild(canvas);

  // 准备数据 - 兼容 Rust 后端（返回 labels）和旧的 Node.js 后端（返回 months）
  const monthsData = comparisonData.months || comparisonData.labels || [];

  if (monthsData.length === 0) {
    console.warn('[DashboardCharts] 月度对比图：没有月份数据');
    return null;
  }

  const labels = monthsData.map(monthStr => {
    const [year, month] = monthStr.split('-');
    return `${year}年${parseInt(month)}月`;
  });

  // 确保数据数组存在
  const orderCountData = comparisonData.orderCount || [];
  const orderAmountData = comparisonData.orderAmount || [];

  const chartData = {
    labels: labels,
    datasets: [
      {
        label: '订单数量',
        data: orderCountData,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        borderRadius: 6,
        yAxisID: 'y'
      },
      {
        label: '订单金额(USD)',
        data: orderAmountData,
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
        borderRadius: 6,
        yAxisID: 'y1'
      }
    ]
  };

  const chartOptions = {
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              if (context.dataset.yAxisID === 'y1') {
                // 金额格式
                label += '$' + context.parsed.y.toLocaleString('zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
              } else {
                // 数量格式
                label += context.parsed.y.toLocaleString('zh-CN');
              }
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        type: 'linear',
        position: 'left',
        title: {
          display: true,
          text: '订单数量',
          color: '#6b7280',
          font: {
            size: 12
          }
        },
        ticks: {
          callback: function (value) {
            return value.toLocaleString('zh-CN');
          }
        }
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: {
          display: true,
          text: '订单金额(USD)',
          color: '#6b7280',
          font: {
            size: 12
          }
        },
        ticks: {
          callback: function (value) {
            return '$' + value.toLocaleString('zh-CN', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            });
          }
        },
        grid: {
          drawOnChartArea: false
        }
      }
    }
  };

  try {
    const chart = createBarChart(canvas, chartData, chartOptions);
    return chart;
  } catch (error) {
    console.error('[DashboardCharts] 创建月度对比图失败:', error);
    return null;
  }
}

/**
 * 渲染年度对比（柱状图）
 */
export function renderYearlyComparisonChart(container, comparisonData) {
  if (!container || !comparisonData) {
    console.warn('[DashboardCharts] 年度对比图：缺少容器或数据');
    return null;
  }

  // 获取或创建图表容器
  let chartContainer = container.querySelector('.chart-container');
  if (!chartContainer) {
    chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    container.appendChild(chartContainer);
  }

  // 清除旧图表
  const oldCanvas = chartContainer.querySelector('canvas');
  if (oldCanvas) {
    oldCanvas.remove();
  }

  // 创建 canvas 元素
  const canvas = document.createElement('canvas');
  chartContainer.appendChild(canvas);

  // 准备数据 - 兼容 Rust 后端（返回 labels）和旧的 Node.js 后端（返回 years）
  const yearsData = comparisonData.years || comparisonData.labels || [];

  if (yearsData.length === 0) {
    console.warn('[DashboardCharts] 年度对比图：没有年份数据');
    return null;
  }

  const labels = yearsData.map(year => `${year}年`);

  // 确保数据数组存在
  const orderCountData = comparisonData.orderCount || [];
  const orderAmountData = comparisonData.orderAmount || [];

  const chartData = {
    labels: labels,
    datasets: [
      {
        label: '订单数量',
        data: orderCountData,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        borderRadius: 6,
        yAxisID: 'y'
      },
      {
        label: '订单金额(USD)',
        data: orderAmountData,
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
        borderRadius: 6,
        yAxisID: 'y1'
      }
    ]
  };

  const chartOptions = {
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              if (context.dataset.yAxisID === 'y1') {
                // 金额格式
                label += '$' + context.parsed.y.toLocaleString('zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
              } else {
                // 数量格式
                label += context.parsed.y.toLocaleString('zh-CN');
              }
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        type: 'linear',
        position: 'left',
        title: {
          display: true,
          text: '订单数量',
          color: '#6b7280',
          font: {
            size: 12
          }
        },
        ticks: {
          callback: function (value) {
            return value.toLocaleString('zh-CN');
          }
        }
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: {
          display: true,
          text: '订单金额(USD)',
          color: '#6b7280',
          font: {
            size: 12
          }
        },
        ticks: {
          callback: function (value) {
            return '$' + value.toLocaleString('zh-CN', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            });
          }
        },
        grid: {
          drawOnChartArea: false
        }
      }
    }
  };

  try {
    const chart = createBarChart(canvas, chartData, chartOptions);
    return chart;
  } catch (error) {
    console.error('[DashboardCharts] 创建年度对比图失败:', error);
    return null;
  }
}

