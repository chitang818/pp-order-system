/**
 * 仪表盘路由
 * 处理仪表盘相关的所有 API 请求
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const DashboardService = require('../services/DashboardService');

/**
 * 获取统计数据
 * GET /api/dashboard/stats
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await DashboardService.getStats();
  res.json(stats);
}));

/**
 * 获取趋势数据
 * GET /api/dashboard/trends?days=30
 */
router.get('/trends', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const trends = await DashboardService.getTrends(days);
  res.json(trends);
}));

/**
 * 获取订单状态分布
 * GET /api/dashboard/status-distribution
 */
router.get('/status-distribution', asyncHandler(async (req, res) => {
  const distribution = await DashboardService.getStatusDistribution();
  res.json(distribution);
}));

/**
 * 获取客户交易排行
 * GET /api/dashboard/customer-ranking?limit=10
 */
router.get('/customer-ranking', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const ranking = await DashboardService.getCustomerRanking(limit);
  res.json(ranking);
}));

/**
 * 获取月度对比数据
 * GET /api/dashboard/monthly-comparison?months=6
 */
router.get('/monthly-comparison', asyncHandler(async (req, res) => {
  const months = parseInt(req.query.months) || 6;
  const comparison = await DashboardService.getMonthlyComparison(months);
  res.json(comparison);
}));

/**
 * 获取年度对比数据
 * GET /api/dashboard/yearly-comparison?years=5
 */
router.get('/yearly-comparison', asyncHandler(async (req, res) => {
  const years = parseInt(req.query.years) || 5;
  const comparison = await DashboardService.getYearlyComparison(years);
  res.json(comparison);
}));

/**
 * 获取最近操作记录
 * GET /api/dashboard/recent-activities
 */
router.get('/recent-activities', asyncHandler(async (req, res) => {
  const activities = await DashboardService.getRecentActivities();
  res.json(activities);
}));

/**
 * 获取目的港城市分布
 */
router.get('/destination-distribution', async (req, res) => {
  try {
    const data = await DashboardService.getDestinationDistribution();
    res.json(data);
  } catch (error) {
    console.error('[Dashboard] 获取目的港分布失败:', error);
    res.status(500).json({ error: '获取目的港分布失败' });
  }
});

/**
 * 获取产品数量排名
 */
router.get('/product-quantity-ranking', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await DashboardService.getProductQuantityRanking(limit);
    res.json(data);
  } catch (error) {
    console.error('[Dashboard] 获取产品数量排名失败:', error);
    res.status(500).json({ error: '获取产品数量排名失败' });
  }
});

/**
 * 获取箱型统计
 */
router.get('/box-type-stats', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await DashboardService.getBoxTypeStats(limit);
    res.json(data);
  } catch (error) {
    console.error('[Dashboard] 获取箱型统计失败:', error);
    res.status(500).json({ error: '获取箱型统计失败' });
  }
});

/**
 * 批量获取仪表盘数据（优化性能，减少请求数）
 * GET /api/dashboard/batch?include=stats,trends,distribution,ranking
 */
router.get('/batch', asyncHandler(async (req, res) => {
  const include = (req.query.include || '').split(',').map(s => s.trim()).filter(Boolean);
  
  // 如果没有指定，返回所有数据
  const includeAll = include.length === 0;
  
  const result = {};
  
  // 并行加载请求的数据
  const promises = [];
  
  if (includeAll || include.includes('stats')) {
    promises.push(
      DashboardService.getStats().then(data => { result.stats = data; }).catch(err => {
        console.error('[Dashboard] 获取stats失败:', err);
        result.stats = null;
      })
    );
  }
  
  if (includeAll || include.includes('trends')) {
    const days = parseInt(req.query.trendsDays) || 30;
    promises.push(
      DashboardService.getTrends(days).then(data => { result.trends = data; }).catch(err => {
        console.error('[Dashboard] 获取trends失败:', err);
        result.trends = null;
      })
    );
  }
  
  if (includeAll || include.includes('distribution')) {
    promises.push(
      DashboardService.getStatusDistribution().then(data => { result.distribution = data; }).catch(err => {
        console.error('[Dashboard] 获取distribution失败:', err);
        result.distribution = null;
      })
    );
  }
  
  if (includeAll || include.includes('ranking')) {
    const limit = parseInt(req.query.rankingLimit) || 10;
    promises.push(
      DashboardService.getCustomerRanking(limit).then(data => { result.ranking = data; }).catch(err => {
        console.error('[Dashboard] 获取ranking失败:', err);
        result.ranking = null;
      })
    );
  }
  
  if (includeAll || include.includes('comparison')) {
    const months = parseInt(req.query.comparisonMonths) || 6;
    promises.push(
      DashboardService.getMonthlyComparison(months).then(data => { result.comparison = data; }).catch(err => {
        console.error('[Dashboard] 获取comparison失败:', err);
        result.comparison = null;
      })
    );
  }
  
  if (includeAll || include.includes('yearlyComparison')) {
    const years = parseInt(req.query.yearlyComparisonYears) || 5;
    promises.push(
      DashboardService.getYearlyComparison(years).then(data => { result.yearlyComparison = data; }).catch(err => {
        console.error('[Dashboard] 获取yearlyComparison失败:', err);
        result.yearlyComparison = null;
      })
    );
  }
  
  if (includeAll || include.includes('destinationDistribution')) {
    promises.push(
      DashboardService.getDestinationDistribution().then(data => { result.destinationDistribution = data; }).catch(err => {
        console.error('[Dashboard] 获取destinationDistribution失败:', err);
        result.destinationDistribution = null;
      })
    );
  }
  
  if (includeAll || include.includes('productRanking')) {
    const limit = parseInt(req.query.productRankingLimit) || 5;
    promises.push(
      DashboardService.getProductQuantityRanking(limit).then(data => { result.productRanking = data; }).catch(err => {
        console.error('[Dashboard] 获取productRanking失败:', err);
        result.productRanking = null;
      })
    );
  }
  
  if (includeAll || include.includes('boxTypeStats')) {
    const limit = parseInt(req.query.boxTypeStatsLimit) || 5;
    promises.push(
      DashboardService.getBoxTypeStats(limit).then(data => { result.boxTypeStats = data; }).catch(err => {
        console.error('[Dashboard] 获取boxTypeStats失败:', err);
        result.boxTypeStats = null;
      })
    );
  }
  
  // 等待所有请求完成
  await Promise.all(promises);
  
  res.json(result);
}));

module.exports = router;

