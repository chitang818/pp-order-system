/**
 * 订单配置路由
 * 处理订单参数配置相关的 API 请求
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const LogService = require('../services/LogService');

/**
 * 获取所有订单配置
 * GET /api/order-configs
 */
router.get('/', asyncHandler(async (req, res) => {
  const configs = await db.listOrderConfigs();
  res.json({ success: true, data: configs });
}));

/**
 * 根据分类获取订单配置
 * GET /api/order-configs/category/:category
 */
router.get('/category/:category', asyncHandler(async (req, res) => {
  const { category } = req.params;
  const configs = await db.getOrderConfigsByCategory(category);
  res.json({ success: true, data: configs });
}));

/**
 * 批量获取多种分类的配置
 * GET /api/order-configs/batch?categories=unit,cleanliness
 */
router.get('/batch', asyncHandler(async (req, res) => {
  const categoriesStr = req.query.categories;
  if (!categoriesStr) {
    return res.status(400).json({ success: false, message: 'categories parameter is required' });
  }
  const categories = categoriesStr.split(',');
  const configs = await db.getMultipleConfigs(categories);
  res.json({ success: true, data: configs });
}));

/**
 * 创建订单配置项
 * POST /api/order-configs
 */
router.post('/', asyncHandler(async (req, res) => {
  const { category, value, sortIndex } = req.body;
  
  if (!category || !value) {
    return res.status(400).json({ success: false, message: 'category and value are required' });
  }
  
  const config = await db.createOrderConfig({ category, value, sortIndex });
  
  // 记录日志
  await LogService.logOperation(req, '创建订单参数', '订单管理', category, `添加参数: ${value}`);
  
  res.json({ success: true, data: config });
}));

/**
 * 更新订单配置项
 * PUT /api/order-configs/:id
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { value, sortIndex } = req.body;
  
  if (!value) {
    return res.status(400).json({ success: false, message: 'value is required' });
  }
  
  const success = await db.updateOrderConfig(id, { value, sortIndex });
  
  if (success) {
    // 记录日志
    await LogService.logOperation(req, '更新订单参数', '订单管理', id, `修改参数值为: ${value}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, message: 'Config item not found' });
  }
}));

/**
 * 删除订单配置项
 * DELETE /api/order-configs/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const success = await db.deleteOrderConfig(id);
  
  if (success) {
    // 记录日志
    await LogService.logOperation(req, '删除订单参数', '订单管理', id, `删除参数项 ID: ${id}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, message: 'Config item not found' });
  }
}));

module.exports = router;
