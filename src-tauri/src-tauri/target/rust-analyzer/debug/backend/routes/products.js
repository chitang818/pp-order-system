/**
 * 产品路由
 * 处理产品相关的所有 API 请求
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const LogService = require('../services/LogService');
const { validateProduct, validateId } = require('../middleware/validation');
const ProductService = require('../services/ProductService');
const ProductSyncService = require('../services/ProductSyncService');

/**
 * 获取产品列表
 * GET /api/products
 */
const { generateEtag } = require('../utils/etag');
router.get('/', asyncHandler(async (req, res) => {
  console.log('收到产品列表请求');
  const products = await ProductService.listProducts();
  console.log('产品列表查询成功，返回数据:', Array.isArray(products) ? `count=${products.length}` : typeof products);

  // 计算 ETag，支持条件请求减少传输
  const etag = generateEtag(products);
  const inm = req.headers['if-none-match'];
  if (inm && inm === etag) {
    return res.status(304).end();
  }
  res.setHeader('ETag', etag);
  res.json({ success: true, data: products });
}));

/**
 * 产品搜索
 * GET /api/products/search
 * 必须放在 /:id 路由之前
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q: query } = req.query;

  if (!query || query.trim().length === 0) {
    return res.json({ success: true, data: [] });
  }

  const searchTerm = query.trim();
  const products = await ProductService.searchProducts(searchTerm);

  res.json({
    success: true,
    data: products || [],
    query: searchTerm,
    count: (products || []).length
  });
}));

/**
 * 产品库自动同步设置（必须在 /:id 之前注册）
 * GET /api/products/sync-settings
 */
router.get('/sync-settings', asyncHandler(async (req, res) => {
  const sqlite = db.db;
  const settings = await ProductSyncService.getSyncSettings(sqlite);
  res.json({ success: true, data: settings });
}));

/**
 * PUT /api/products/sync-settings
 */
router.put('/sync-settings', asyncHandler(async (req, res) => {
  const sqlite = db.db;
  const { enabled, intervalDays } = req.body || {};
  const data = await ProductSyncService.setSyncSettings(sqlite, {
    enabled: !!enabled,
    intervalDays: intervalDays != null ? Number(intervalDays) : 3
  });
  await LogService.logOperation(req, '保存产品同步设置', '产品库管理', '', JSON.stringify(data));
  const full = await ProductSyncService.getSyncSettings(sqlite);
  res.json({ success: true, data: full });
}));

/**
 * 获取单个产品
 * GET /api/products/:id
 */
router.get('/:id', validateId, asyncHandler(async (req, res) => {
  const id = req.params.id;
  console.log('收到获取产品请求，ID:', id);
  try {
    const product = await ProductService.getProduct(id);
    res.json({ success: true, data: product });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: '产品不存在' });
    }
    throw error;
  }
}));

/**
 * 创建产品
 * POST /api/products
 */
router.post('/', validateProduct, asyncHandler(async (req, res) => {
  console.log('收到创建产品请求，数据:', req.body);
  try {
    const product = await ProductService.createProduct(req.body);
    LogService.logOperation(req, '创建产品', '产品库管理', product.model || product.id, '创建产品成功');
    res.json({ success: true, data: product });
  } catch (err) {
    LogService.logOperation(req, '创建产品', '产品库管理', req.body?.model || '', '创建失败', 'failure', err.message);
    if (err.code === 'DUPLICATE_MODEL_TYPE' || String(err.message || '').includes('该型号在此产品类型下已存在')) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE',
        message: err.message || '该型号在此产品类型下已存在'
      });
    }
    throw err;
  }
}));

/**
 * 更新产品
 * PUT /api/products/:id
 */
router.put('/:id', validateId, validateProduct, asyncHandler(async (req, res) => {
  const id = req.params.id;
  console.log('收到更新产品请求，ID:', id, '数据:', req.body);
  try {
    const result = await ProductService.updateProduct(id, req.body);
    LogService.logOperation(req, '更新产品', '产品库管理', req.body?.model || id, '更新产品成功');
    res.json({ success: true, result });
  } catch (err) {
    LogService.logOperation(req, '更新产品', '产品库管理', id, '更新失败', 'failure', err.message);
    if (String(err.message || '').includes('该型号在此产品类型下已存在')) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE',
        message: err.message
      });
    }
    throw err;
  }
}));

/**
 * 删除产品
 * DELETE /api/products/:id
 */
router.delete('/:id', validateId, asyncHandler(async (req, res) => {
  const id = req.params.id;
  console.log('收到删除产品请求，ID:', id);
  try {
    const result = await ProductService.deleteProduct(id);
    LogService.logOperation(req, '删除产品', '产品库管理', id, '删除产品成功');
    res.json({ success: true, result });
  } catch (err) {
    LogService.logOperation(req, '删除产品', '产品库管理', id, '删除失败', 'failure', err.message);
    throw err;
  }
}));

/**
 * 清空产品库
 * POST /api/products/clear
 */
router.post('/clear', asyncHandler(async (req, res) => {
  const sqlite = db.db;

  console.log('[清空产品库] 开始执行清空操作');

  // 使用事务确保数据一致性
  await new Promise((resolve, reject) => {
    sqlite.run('BEGIN TRANSACTION', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  try {
    // 执行删除操作
    const deletedCount = await new Promise((resolve, reject) => {
      sqlite.run('DELETE FROM products', [], function(err) {
        if (err) {
          console.error('[清空产品库] 删除操作失败:', err);
          reject(err);
        } else {
          console.log('[清空产品库] 删除操作完成，影响行数:', this.changes);
          resolve(this.changes);
        }
      });
    });

    // 重置自增ID序列（可选，确保下次插入从1开始）
    await new Promise((resolve, reject) => {
      sqlite.run('DELETE FROM sqlite_sequence WHERE name = "products"', [], function(err) {
        if (err) {
          // 如果表不存在自增序列，忽略错误
          console.log('[清空产品库] 重置序列失败或序列不存在:', err.message);
        } else {
          console.log('[清空产品库] 重置自增序列成功');
        }
        resolve();
      });
    });

    // 提交事务
    await new Promise((resolve, reject) => {
      sqlite.run('COMMIT', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`[清空产品库] 清空产品库成功，删除了 ${deletedCount} 个产品`);

    res.json({
      success: true,
      result: { changes: deletedCount }
    });

  } catch (error) {
    // 回滚事务
    await new Promise((resolve) => {
      sqlite.run('ROLLBACK', () => resolve());
    });
    throw error;
  }
}));

/**
 * 从订单同步产品
 * POST /api/products/sync-from-orders
 */
router.post('/sync-from-orders', asyncHandler(async (req, res) => {
  console.log('开始手动同步产品...');
  const sqlite = db.db;
  const result = await ProductSyncService.syncFromOrders(sqlite, { req });
  await ProductSyncService.setLastRunNow(sqlite);
  res.json({
    success: true,
    message: result.message,
    data: { added: result.added, updated: result.updated, total: result.total }
  });
}));

module.exports = router;
