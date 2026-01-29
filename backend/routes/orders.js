/**
 * 订单路由
 * 处理订单相关的所有 API 请求
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, createNotFoundError } = require('../middleware/errorHandler');
const LogService = require('../services/LogService');
const OrderService = require('../services/OrderService');
const { validateOrder, validateOrderUpdate, validateId } = require('../middleware/validation');

/**
 * 获取订单列表
 * GET /api/orders
 * 支持分页参数：?page=1&pageSize=20
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, productModel } = req.query;
  
  // 禁用缓存：订单数据是动态的，不应该被浏览器缓存
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // 构建查询选项
  const options = {};
  
  // 严格检查分页参数：必须是有效的数字字符串，且不能是 "null" 或 "undefined"
  const hasValidPage = page && page !== 'null' && page !== 'undefined' && !isNaN(parseInt(page)) && parseInt(page) > 0;
  const hasValidPageSize = pageSize && pageSize !== 'null' && pageSize !== 'undefined' && !isNaN(parseInt(pageSize)) && parseInt(pageSize) > 0;
  
  if (hasValidPage && hasValidPageSize) {
    options.page = parseInt(page);
    options.pageSize = parseInt(pageSize);
  }
  
  if (productModel && productModel.trim() !== '' && productModel !== 'null') {
    options.productModel = productModel.trim();
  }
  
  // 如果提供了有效的分页参数，使用分页查询
  if (hasValidPage && hasValidPageSize) {
    const result = await OrderService.listOrders(options);
    res.json(result);
  } else {
    // 否则返回所有数据（保持向后兼容）
    const rows = await OrderService.listOrders(options);
    res.json(rows || []);
  }
}));

/**
 * 获取下一个合同编号
 * GET /api/orders/next-contract-no
 * 注意：必须在 /:id 路由之前定义，否则会被误匹配
 */
router.get('/next-contract-no', asyncHandler(async (req, res) => {
  console.log('[Orders] /next-contract-no 路由被匹配');
  try {
    const result = await OrderService.getNextContractNo();
    console.log('[Orders] 生成下一个合同编号:', result.data.nextContractNo);
    res.json(result);
  } catch (error) {
    console.error('[Orders] 获取下一个合同编号失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message || '获取合同编号失败'
    });
  }
}));

/**
 * 获取已删除的订单列表
 * GET /api/orders/deleted
 * 注意：必须在 /:id 路由之前定义，否则会被误匹配
 */
router.get('/deleted', asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const options = {};
  
  if (page) options.page = parseInt(page);
  if (pageSize) options.pageSize = parseInt(pageSize);

  try {
    const result = await OrderService.listDeletedOrders(options);
    res.json(result);
  } catch (err) {
    console.error('[Orders] 获取已删除订单列表失败:', err);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '获取已删除订单列表失败' });
  }
}));

/**
 * 获取单个订单
 * GET /api/orders/:id
 */
router.get('/:id', validateId, asyncHandler(async (req, res) => {
  console.log('[Orders] /:id 路由被匹配，ID:', req.params.id);
  const id = req.params.id;
  try {
    const row = await OrderService.getOrder(id);
    res.json(row);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: '订单不存在' });
    }
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: error.message || '获取订单信息失败' });
  }
}));

/**
 * 创建订单
 * POST /api/orders
 */
router.post('/', validateOrder, asyncHandler(async (req, res) => {
  // 调试日志：检查接收到的订单数据
  console.log('[Orders] POST /api/orders - Request body:', JSON.stringify(req.body, null, 2));
  console.log('[Orders] POST /api/orders - Items:', req.body?.items?.length || 0, 'items');
  console.log('[Orders] POST /api/orders - Customer ID:', req.body?.customerId, 'Customer Name:', req.body?.customerName);

  try {
    const row = await OrderService.createOrder(req.body || {}, req);
    LogService.logOperation(req, '创建订单', '订单管理', row.contractNo || row.orderNo || row.id, `创建订单成功，金额: ${row.totalUSD || 0} USD`);
    res.status(201).json(row);
  } catch (err) {
    // 详细错误日志
    console.error('[Orders] POST /api/orders - 创建订单失败:', {
      error: err,
      message: err.message,
      stack: err.stack,
      code: err.code,
      requestBody: {
        contractNo: req.body?.contractNo,
        customerId: req.body?.customerId,
        customerName: req.body?.customerName,
        itemsCount: req.body?.items?.length || 0,
        productType: req.body?.productType
      }
    });
    
    const status = err.code === 'VALIDATION_ERROR' ? 400 : 500;
    LogService.logOperation(req, '创建订单', '订单管理', req.body?.contractNo || '', '创建失败', 'failure', err.message);
    
    // 返回详细的错误信息（开发环境）
    const errorResponse = {
      success: false,
      error: err.code || 'INTERNAL_ERROR',
      message: err.message || '创建订单失败'
    };
    
    // 开发环境返回更多调试信息
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = {
        stack: err.stack,
        name: err.name
      };
    }
    
    return res.status(status).json(errorResponse);
  }
}));

/**
 * 更新订单
 * PUT /api/orders/:id
 */
router.put('/:id', validateId, validateOrderUpdate, asyncHandler(async (req, res) => {
  const id = req.params.id;
  try {
    const row = await OrderService.updateOrder(id, req.body || {}, req);
    LogService.logOperation(req, '更新订单', '订单管理', row.contractNo || row.orderNo || id, `更新订单成功，金额: ${row.totalUSD || 0} USD`);
    res.json(row);
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'VALIDATION_ERROR' ? 400 : 500;
    LogService.logOperation(req, '更新订单', '订单管理', id, '更新失败', 'failure', err.message);
    return res.status(status).json({ success: false, error: err.code || 'INTERNAL_ERROR', message: err.message || '更新订单失败' });
  }
}));

/**
 * 删除订单（软删除）
 * DELETE /api/orders/:id
 */
router.delete('/:id', validateId, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const timestamp = new Date().toISOString();

  console.log(`[AUDIT] ${timestamp} - 删除订单请求 - ID: ${id} - IP: ${clientIP}`);

  try {
    const result = await OrderService.deleteOrder(id, req);
    console.log(`[AUDIT] ${timestamp} - 删除订单成功 - ID: ${id} - 结果: ${JSON.stringify(result)}`);
    LogService.logOperation(req, '删除订单', '订单管理', id, '删除订单成功（可恢复）');
    res.json({ ...result, timestamp });
  } catch (err) {
    console.log(`[AUDIT] ${timestamp} - 删除订单失败 - ID: ${id} - 错误: ${err.message}`);
    const status = err.code === 'NOT_FOUND' ? 404 : 500;
    LogService.logOperation(req, '删除订单', '订单管理', id, '删除失败', 'failure', err.message);
    return res.status(status).json({ success: false, error: err.code || 'INTERNAL_ERROR', message: err.message || '删除订单失败' });
  }
}));

/**
 * 恢复已删除的订单
 * POST /api/orders/:id/restore
 */
router.post('/:id/restore', validateId, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const timestamp = new Date().toISOString();

  console.log(`[AUDIT] ${timestamp} - 恢复订单请求 - ID: ${id} - IP: ${clientIP}`);

  try {
    const result = await OrderService.restoreOrder(id, req);
    console.log(`[AUDIT] ${timestamp} - 恢复订单成功 - ID: ${id} - 结果: ${JSON.stringify(result)}`);
    LogService.logOperation(req, '恢复订单', '订单管理', id, '恢复订单成功');
    res.json({ ...result, timestamp });
  } catch (err) {
    console.log(`[AUDIT] ${timestamp} - 恢复订单失败 - ID: ${id} - 错误: ${err.message}`);
    LogService.logOperation(req, '恢复订单', '订单管理', id, '恢复失败', 'failure', err.message);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '恢复订单失败' });
  }
}));

/**
 * 永久删除订单（物理删除）
 * DELETE /api/orders/:id/permanently-delete
 */
router.delete('/:id/permanently-delete', validateId, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const timestamp = new Date().toISOString();

  console.log(`[AUDIT] ${timestamp} - 永久删除订单请求 - ID: ${id} - IP: ${clientIP}`);

  try {
    const result = await OrderService.permanentlyDeleteOrder(id);
    console.log(`[AUDIT] ${timestamp} - 永久删除订单成功 - ID: ${id} - 结果: ${JSON.stringify(result)}`);
    LogService.logOperation(req, '永久删除订单', '订单管理', id, '永久删除订单成功');
    res.json({ ...result, timestamp });
  } catch (err) {
    console.log(`[AUDIT] ${timestamp} - 永久删除订单失败 - ID: ${id} - 错误: ${err.message}`);
    LogService.logOperation(req, '永久删除订单', '订单管理', id, '永久删除失败', 'failure', err.message);
    const status = err.code === 'NOT_FOUND' ? 404 : 500;
    return res.status(status).json({ success: false, error: err.code || 'INTERNAL_ERROR', message: err.message || '永久删除订单失败' });
  }
}));

module.exports = router;

