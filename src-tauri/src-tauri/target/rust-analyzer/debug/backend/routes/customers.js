/**
 * 客户路由
 * 处理客户相关的所有 API 请求
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const LogService = require('../services/LogService');
const { asyncHandler } = require('../middleware/errorHandler');
const CustomerService = require('../services/CustomerService');
const { validateCustomer, validateId } = require('../middleware/validation');

/**
 * 获取客户列表
 * GET /api/customers
 * 支持分页参数：?page=1&pageSize=20
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  
  // 如果提供了分页参数，使用分页查询
  if (page && pageSize) {
    const options = {
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    };
    const result = await CustomerService.listCustomers(options);
    res.json(result);
  } else {
    // 否则返回所有数据（保持向后兼容）
    const rows = await CustomerService.listCustomers();
    res.json(rows || []);
  }
}));

/**
 * 获取单个客户
 * GET /api/customers/:id
 */
router.get('/:id', validateId, asyncHandler(async (req, res) => {
  try {
    const row = await CustomerService.getCustomer(Number(req.params.id));
    res.json(row);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: '客户不存在' });
    }
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '获取客户信息失败' });
  }
}));

/**
 * 创建客户
 * POST /api/customers
 */
router.post('/', (req, res, next) => {
  // 在验证之前手动 trim 所有字符串字段
  if (req.body) {
    // name 是必填字段，必须处理
    if (req.body.name != null) {
      req.body.name = String(req.body.name).trim();
    }
    // 可选字段：只有存在时才 trim
    if (req.body.address != null && typeof req.body.address === 'string') {
      req.body.address = req.body.address.trim();
    }
    if (req.body.tel != null && typeof req.body.tel === 'string') {
      req.body.tel = req.body.tel.trim();
    }
    if (req.body.fax != null && typeof req.body.fax === 'string') {
      req.body.fax = req.body.fax.trim();
    }
    if (req.body.contact != null && typeof req.body.contact === 'string') {
      req.body.contact = req.body.contact.trim();
    }
  }
  next();
}, validateCustomer, asyncHandler(async (req, res) => {
  // 调试日志：检查接收到的数据
  console.log('[Customers] POST /api/customers - Request body:', JSON.stringify(req.body));
  console.log('[Customers] POST /api/customers - req.body.name:', req.body?.name, 'Type:', typeof req.body?.name);

  try {
    const row = await CustomerService.createCustomer(req.body || {});
    console.log('[Customers] 创建客户成功，返回数据:', JSON.stringify(row));
    LogService.logOperation(req, '创建客户', '客户管理', row.name || row.id, '创建客户成功');
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      LogService.logOperation(req, '创建客户', '客户管理', req.body?.name || '', '创建失败：名称为空', 'failure', '客户名称不能为空');
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: '客户名称不能为空' });
    }
    if (err.code === 'DUPLICATE_NAME' || err.code === 'DUPLICATE') {
      LogService.logOperation(req, '创建客户', '客户管理', req.body?.name || '', '创建失败：名称重复', 'failure', '客户名称已存在');
      return res.status(409).json({ success: false, error: 'DUPLICATE', message: '该客户名称已存在，请使用其他名称' });
    }
    LogService.logOperation(req, '创建客户', '客户管理', req.body?.name || '', '创建失败', 'failure', err.message);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '创建客户失败' });
  }
}));

/**
 * 更新客户
 * PUT /api/customers/:id
 */
router.put('/:id', validateId, (req, res, next) => {
  // 在验证之前手动 trim 所有字符串字段
  if (req.body) {
    // name 是必填字段，必须处理
    if (req.body.name != null) {
      req.body.name = String(req.body.name).trim();
    }
    // 可选字段：只有存在时才 trim
    if (req.body.address != null && typeof req.body.address === 'string') {
      req.body.address = req.body.address.trim();
    }
    if (req.body.tel != null && typeof req.body.tel === 'string') {
      req.body.tel = req.body.tel.trim();
    }
    if (req.body.fax != null && typeof req.body.fax === 'string') {
      req.body.fax = req.body.fax.trim();
    }
    if (req.body.contact != null && typeof req.body.contact === 'string') {
      req.body.contact = req.body.contact.trim();
    }
  }
  next();
}, validateCustomer, asyncHandler(async (req, res) => {
  try {
    const row = await CustomerService.updateCustomer(Number(req.params.id), req.body || {});
    LogService.logOperation(req, '更新客户', '客户管理', row.name || req.params.id, '更新客户成功');
    res.json(row);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      LogService.logOperation(req, '更新客户', '客户管理', req.params.id, '更新失败：验证错误', 'failure', '客户名称不能为空');
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: '客户名称不能为空' });
    }
    if (err.code === 'DUPLICATE_NAME' || err.code === 'DUPLICATE') {
      LogService.logOperation(req, '更新客户', '客户管理', req.params.id, '更新失败：名称重复', 'failure', '客户名称已存在');
      return res.status(409).json({ success: false, error: 'DUPLICATE', message: '该客户名称已存在，请使用其他名称' });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: '客户不存在' });
    }
    LogService.logOperation(req, '更新客户', '客户管理', req.params.id, '更新失败', 'failure', err.message);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '更新客户失败' });
  }
}));

/**
 * 删除客户
 * DELETE /api/customers/:id
 */
router.delete('/:id', validateId, asyncHandler(async (req, res) => {
  try {
    const result = await CustomerService.deleteCustomer(Number(req.params.id));
    LogService.logOperation(req, '删除客户', '客户管理', req.params.id, '删除客户成功');
    res.json(result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: '客户不存在' });
    }
    LogService.logOperation(req, '删除客户', '客户管理', req.params.id, '删除失败', 'failure', err.message);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '删除客户失败' });
  }
}));

/**
 * 清空所有客户
 * POST /api/customers/clear
 */
router.post('/clear', (req, res) => {
  db.clearCustomers((err, ok) => {
    if (err) {
      LogService.logOperation(req, '清空客户', '客户管理', '', '清空失败', 'failure', err.message);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message || '清空客户失败'
      });
    }
    LogService.logOperation(req, '清空客户', '客户管理', '', '清空所有客户成功');
    res.json({ ok });
  });
});

/**
 * 兼容别名：清空所有客户
 * DELETE /api/customers
 */
router.delete('/', (req, res) => {
  db.clearCustomers((err, ok) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: '清空客户失败'
      });
    }
    res.json({ ok });
  });
});

module.exports = router;

