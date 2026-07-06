/**
 * 日志路由
 * 处理操作日志相关的所有 API 请求
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const LogService = require('../services/LogService');
const { authenticate, requireRole, logOperation } = require('../middleware/auth');

// 所有操作日志接口都需要登录
router.use(authenticate);

/**
 * 获取操作日志列表
 * GET /api/logs
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 50,
    module,
    userId,
    operation,
    startDate,
    endDate
  } = req.query;
  
  const options = {
    page,
    pageSize,
    module,
    userId,
    operation,
    startDate,
    endDate
  };
  
  const result = await LogService.listOperationLogs(options);
  res.json({ success: true, data: result });
}));

/**
 * 删除操作日志（仅管理员）
 * DELETE /api/logs/:id
 */
router.delete('/:id', requireRole('admin'), logOperation('操作日志', '删除日志'), asyncHandler(async (req, res) => {
  const id = req.params.id;
  
  try {
    await LogService.deleteOperationLog(id);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: '日志不存在' });
    }
    throw error;
  }
}));

/**
 * 清空操作日志（仅管理员）
 * DELETE /api/logs
 */
router.delete('/', requireRole('admin'), logOperation('操作日志', '清空日志'), asyncHandler(async (req, res) => {
  const result = await LogService.clearOperationLogs();
  res.json({ success: true, message: `已清空${result.changes}条日志` });
}));

/**
 * 清理旧日志（仅管理员）
 * POST /api/logs/clean
 */
router.post('/clean', requireRole('admin'), logOperation('操作日志', '清理旧日志'), asyncHandler(async (req, res) => {
  const { days = 90 } = req.body;
  
  const result = await LogService.cleanOldOperationLogs(days);
  res.json({ success: true, message: `已清理${result.changes}条日志（保留最近${days}天）` });
}));

module.exports = router;


