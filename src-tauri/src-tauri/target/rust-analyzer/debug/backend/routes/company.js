/**
 * 公司配置路由
 * 处理公司信息相关的 API 请求
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const config = require('../config');
const LogService = require('../services/LogService');

/**
 * 获取公司配置（兼容旧接口）
 * GET /api/config
 */
router.get('/config', (req, res) => {
  db.getCompany((err, row) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: String(err)
      });
    }
    res.json({ KEY_COMPANY: row || config.defaultCompany });
  });
});

/**
 * 更新公司配置（兼容旧接口）
 * PUT /api/config
 */
router.put('/config', (req, res) => {
  const body = req.body || {};
  const next = body.KEY_COMPANY || config.defaultCompany;
  db.setCompany(next, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: String(err)
      });
    }
    res.json({ ok: true });
  });
});

/**
 * 获取公司配置
 * GET /api/company
 */
router.get('/', (req, res) => {
  db.getCompany((err, row) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: String(err)
      });
    }
    res.json(row || config.defaultCompany);
  });
});

/**
 * 更新公司配置
 * PUT /api/company
 */
router.put('/', (req, res) => {
  db.setCompany(req.body || config.defaultCompany, (err) => {
    if (err) {
      LogService.logOperation(req, '更新公司设置', '系统设置', '', '更新失败', 'failure', String(err));
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: String(err)
      });
    }
    LogService.logOperation(req, '更新公司设置', '系统设置', req.body?.companyNameCN || '', '更新公司设置成功');
    res.json({ ok: true });
  });
});

/**
 * 重置/清空公司配置
 * DELETE /api/company
 */
router.delete('/', (req, res) => {
  // 清空公司配置：设置为所有字段为空值
  const emptyCompany = { ...config.defaultCompany };
  // 确保所有字段都是空字符串
  Object.keys(emptyCompany).forEach(key => {
    if (typeof emptyCompany[key] === 'string') {
      emptyCompany[key] = '';
    }
  });
  
  db.setCompany(emptyCompany, (err) => {
    if (err) {
      LogService.logOperation(req, '重置公司设置', '系统设置', '', '重置失败', 'failure', String(err));
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: String(err)
      });
    }
    LogService.logOperation(req, '重置公司设置', '系统设置', '', '重置公司设置成功');
    res.json({ ok: true });
  });
});

module.exports = router;

