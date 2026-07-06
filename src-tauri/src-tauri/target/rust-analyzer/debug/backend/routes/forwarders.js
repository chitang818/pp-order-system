/**
 * 货代路由
 * 处理货代相关的所有 API 请求
 * 基于客户路由创建
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const LogService = require('../services/LogService');
const { asyncHandler } = require('../middleware/errorHandler');
const ForwarderService = require('../services/ForwarderService');
const { validateId } = require('../middleware/validation');

/**
 * 货代数据验证中间件
 */
function validateForwarder(req, res, next) {
    const { name } = req.body;

    // 验证名称
    if (!name || name.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: '货代名称不能为空'
        });
    }

    next();
}

/**
 * 获取货代列表
 * GET /api/forwarders
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
        const result = await ForwarderService.listForwarders(options);
        res.json(result);
    } else {
        // 否则返回所有数据（保持向后兼容）
        const rows = await ForwarderService.listForwarders();
        res.json(rows || []);
    }
}));

/**
 * 获取单个货代
 * GET /api/forwarders/:id
 */
router.get('/:id', validateId, asyncHandler(async (req, res) => {
    try {
        const row = await ForwarderService.getForwarder(Number(req.params.id));
        res.json(row);
    } catch (err) {
        if (err.code === 'NOT_FOUND') {
            return res.status(404).json({ success: false, error: 'NOT_FOUND', message: '货代不存在' });
        }
        return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '获取货代信息失败' });
    }
}));

/**
 * 创建货代
 * POST /api/forwarders
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
        if (req.body.email != null && typeof req.body.email === 'string') {
            req.body.email = req.body.email.trim();
        }
        if (req.body.remarks != null && typeof req.body.remarks === 'string') {
            req.body.remarks = req.body.remarks.trim();
        }
    }
    next();
}, validateForwarder, asyncHandler(async (req, res) => {
    console.log('[Forwarders] POST /api/forwarders - Request body:', JSON.stringify(req.body));

    try {
        const row = await ForwarderService.createForwarder(req.body || {});
        console.log('[Forwarders] 创建货代成功，返回数据:', JSON.stringify(row));
        LogService.logOperation(req, '创建货代', '货代管理', row.name || row.id, '创建货代成功');
        res.status(201).json(row);
    } catch (err) {
        if (err.code === 'VALIDATION_ERROR') {
            LogService.logOperation(req, '创建货代', '货代管理', req.body?.name || '', '创建失败：名称为空', 'failure', '货代名称不能为空');
            return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: '货代名称不能为空' });
        }
        if (err.code === 'DUPLICATE_NAME' || err.code === 'DUPLICATE') {
            LogService.logOperation(req, '创建货代', '货代管理', req.body?.name || '', '创建失败：名称重复', 'failure', '货代名称已存在');
            return res.status(409).json({ success: false, error: 'DUPLICATE', message: '该货代名称已存在，请使用其他名称' });
        }
        LogService.logOperation(req, '创建货代', '货代管理', req.body?.name || '', '创建失败', 'failure', err.message);
        return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '创建货代失败' });
    }
}));

/**
 * 更新货代
 * PUT /api/forwarders/:id
 */
router.put('/:id', validateId, (req, res, next) => {
    // 在验证之前手动 trim 所有字符串字段
    if (req.body) {
        if (req.body.name != null) {
            req.body.name = String(req.body.name).trim();
        }
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
        if (req.body.email != null && typeof req.body.email === 'string') {
            req.body.email = req.body.email.trim();
        }
        if (req.body.remarks != null && typeof req.body.remarks === 'string') {
            req.body.remarks = req.body.remarks.trim();
        }
    }
    next();
}, validateForwarder, asyncHandler(async (req, res) => {
    try {
        const row = await ForwarderService.updateForwarder(Number(req.params.id), req.body || {});
        LogService.logOperation(req, '更新货代', '货代管理', row.name || req.params.id, '更新货代成功');
        res.json(row);
    } catch (err) {
        if (err.code === 'VALIDATION_ERROR') {
            LogService.logOperation(req, '更新货代', '货代管理', req.params.id, '更新失败：验证错误', 'failure', '货代名称不能为空');
            return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: '货代名称不能为空' });
        }
        if (err.code === 'DUPLICATE_NAME' || err.code === 'DUPLICATE') {
            LogService.logOperation(req, '更新货代', '货代管理', req.params.id, '更新失败：名称重复', 'failure', '货代名称已存在');
            return res.status(409).json({ success: false, error: 'DUPLICATE', message: '该货代名称已存在，请使用其他名称' });
        }
        if (err.code === 'NOT_FOUND') {
            return res.status(404).json({ success: false, error: 'NOT_FOUND', message: '货代不存在' });
        }
        LogService.logOperation(req, '更新货代', '货代管理', req.params.id, '更新失败', 'failure', err.message);
        return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '更新货代失败' });
    }
}));

/**
 * 删除货代
 * DELETE /api/forwarders/:id
 */
router.delete('/:id', validateId, asyncHandler(async (req, res) => {
    try {
        const result = await ForwarderService.deleteForwarder(Number(req.params.id));
        LogService.logOperation(req, '删除货代', '货代管理', req.params.id, '删除货代成功');
        res.json(result);
    } catch (err) {
        if (err.code === 'NOT_FOUND') {
            return res.status(404).json({ success: false, error: 'NOT_FOUND', message: '货代不存在' });
        }
        LogService.logOperation(req, '删除货代', '货代管理', req.params.id, '删除失败', 'failure', err.message);
        return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message || '删除货代失败' });
    }
}));

/**
 * 清空所有货代
 * POST /api/forwarders/clear
 */
router.post('/clear', (req, res) => {
    db.clearForwarders((err, ok) => {
        if (err) {
            LogService.logOperation(req, '清空货代', '货代管理', '', '清空失败', 'failure', err.message);
            return res.status(500).json({
                success: false,
                error: 'INTERNAL_ERROR',
                message: err.message || '清空货代失败'
            });
        }
        LogService.logOperation(req, '清空货代', '货代管理', '', '清空所有货代成功');
        res.json({ ok });
    });
});

/**
 * 兼容别名：清空所有货代
 * DELETE /api/forwarders
 */
router.delete('/', (req, res) => {
    db.clearForwarders((err, ok) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: 'INTERNAL_ERROR',
                message: '清空货代失败'
            });
        }
        res.json({ ok });
    });
});

module.exports = router;
