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

  // 使用事务确保数据一致性
  const sqlite = db.db;

  // 获取所有订单项，提取产品型号和所有重量相关字段，包括标签批号、标签说明和产品类型
  // 对于同一产品型号，优先级：B类品(2) > C类品(3) > A类品(1) > 最新记录
  const orderItems = await new Promise((resolve, reject) => {
    sqlite.all(`
      SELECT 
        oi.model, 
        oi.weight as estimatedWeight, 
        oi.labelWeight, 
        oi.safetyFactor, 
        oi.cleanliness, 
        oi.unit, 
        oi.labelBatchNo, 
        oi.label,
        oi.extras,
        o.productType,
        o.createdAt
      FROM order_items oi
      LEFT JOIN orders o ON oi.orderId = o.id
      WHERE oi.model IS NOT NULL AND oi.model != '' 
      ORDER BY 
        oi.model,
        CASE 
          WHEN o.productType = 2 THEN 0
          WHEN o.productType = 3 THEN 1
          ELSE 2
        END,
        o.createdAt DESC
    `, [], (err, rows) => {
      if (err) reject(err);
      else {
        // 对于每个产品型号，只保留第一条记录（优先B类品，其次C类品，再次A类品，最后最新）
        const uniqueProducts = {};
        rows.forEach(row => {
          if (!uniqueProducts[row.model]) {
            uniqueProducts[row.model] = { ...row };
          }
        });
        resolve(Object.values(uniqueProducts));
      }
    });
  });

  if (!orderItems || orderItems.length === 0) {
    return res.json({
      success: true,
      message: '没有找到可同步的产品数据',
      data: { added: 0, updated: 0, total: 0 }
    });
  }

  console.log(`从订单中找到 ${orderItems.length} 个不同的产品型号`);
  orderItems.forEach((item, index) => {
    const productTypeName = item.productType === 2 ? 'B类品' : item.productType === 3 ? 'C类品' : 'A类品';
    console.log(`${index + 1}. 型号: ${item.model}, 产品类型: ${productTypeName}(${item.productType || 1}), 件数单位: "${item.unit}", 重量: ${item.estimatedWeight}, 标签重量: ${item.labelWeight}, 安全系数: "${item.safetyFactor}", 清洁度: "${item.cleanliness}", 标签批号: "${item.labelBatchNo || ''}", 标签说明: "${item.label || ''}"`);
  });

  let added = 0;
  let updated = 0;

  // 为每个产品型号创建或更新产品记录
  for (const item of orderItems) {
    const { model, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, productType, extras } = item;

    // 从extras中提取marks字段（C类品的唛头）
    let marks = '';
    try {
      if (extras) {
        const parsedExtras = typeof extras === 'string' ? JSON.parse(extras) : extras;
        marks = parsedExtras.marks || '';
      }
    } catch (e) {
      console.warn(`解析产品 ${model} 的extras失败:`, e);
    }

    const finalProductType = productType || 1; // 默认为A类品
    const productTypeName = finalProductType === 2 ? 'B类品' : finalProductType === 3 ? 'C类品' : 'A类品';
    console.log(`\n处理产品: ${model}, 产品类型: ${productTypeName}(${finalProductType})`);

    // 根据产品类型决定同步哪些字段
    // A类品: estimatedWeight, labelWeight, safetyFactor, cleanliness, unit
    // B类品: estimatedWeight, labelWeight, cleanliness, unit, labelBatchNo, label
    // C类品: estimatedWeight, labelWeight, cleanliness, unit, marks, label
    
    // 准备同步的字段值（如果字段未输入，则同步为空）
    const syncData = {
      productType: finalProductType,
      estimatedWeight: estimatedWeight || null,
      labelWeight: labelWeight || null,
      cleanliness: cleanliness || null,
      unit: unit || '',
      // A类品特有字段
      safetyFactor: (finalProductType === 1) ? (safetyFactor || null) : null,
      // B类品特有字段
      labelBatchNo: (finalProductType === 2) ? (labelBatchNo || '') : null,
      label: (finalProductType === 2 || finalProductType === 3) ? (label || '') : null,
      // C类品特有字段
      marks: (finalProductType === 3) ? (marks || '') : null
    };

    // 检查产品是否已存在
    const existingProduct = await new Promise((resolve, reject) => {
      sqlite.get('SELECT * FROM products WHERE model = ?', [model], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingProduct) {
      console.log(`产品 ${model} 已存在，更新产品类型和字段...`);
      
      // 构建更新字段和值
      const updateFields = [];
      const updateValues = [];

      // 始终更新productType（直接使用订单的产品类型）
      updateFields.push('productType = ?');
      updateValues.push(syncData.productType);

      // 根据产品类型更新对应字段（所有字段都同步，即使为空）
      // 通用字段（所有类型都有）
      updateFields.push('estimatedWeight = ?');
      updateValues.push(syncData.estimatedWeight);
      updateFields.push('labelWeight = ?');
      updateValues.push(syncData.labelWeight);
      updateFields.push('cleanliness = ?');
      updateValues.push(syncData.cleanliness);
      updateFields.push('unit = ?');
      updateValues.push(syncData.unit);

      // A类品特有字段
      if (finalProductType === 1) {
        updateFields.push('safetyFactor = ?');
        updateValues.push(syncData.safetyFactor);
        // 清空B类品和C类品字段
        updateFields.push('labelBatchNo = NULL', 'label = NULL', 'marks = NULL');
      }
      // B类品特有字段
      else if (finalProductType === 2) {
        updateFields.push('labelBatchNo = ?');
        updateValues.push(syncData.labelBatchNo);
        updateFields.push('label = ?');
        updateValues.push(syncData.label);
        // 清空A类品和C类品字段
        updateFields.push('safetyFactor = NULL', 'marks = NULL');
      }
      // C类品特有字段
      else if (finalProductType === 3) {
        updateFields.push('marks = ?');
        updateValues.push(syncData.marks);
        updateFields.push('label = ?');
        updateValues.push(syncData.label);
        // 清空A类品和B类品字段
        updateFields.push('safetyFactor = NULL', 'labelBatchNo = NULL');
      }

      updateFields.push('source = ?', 'updatedAt = datetime("now")');
      updateValues.push('order', model);

      await new Promise((resolve, reject) => {
        sqlite.run(
          `UPDATE products SET ${updateFields.join(', ')} WHERE model = ?`,
          updateValues,
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      console.log(`更新了产品 ${model} 的产品类型为${productTypeName}，并同步了相关字段`);
      updated++;
    } else {
      console.log(`创建新产品: ${model}, 产品类型: ${productTypeName}(${finalProductType})`);
      
      // 创建新产品记录，根据产品类型同步对应字段
      await new Promise((resolve, reject) => {
        sqlite.run(
          'INSERT INTO products (model, productType, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, marks, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"), datetime("now"))',
          [
            model,
            syncData.productType,
            syncData.estimatedWeight,
            syncData.labelWeight,
            syncData.safetyFactor,
            syncData.cleanliness,
            syncData.unit,
            syncData.labelBatchNo,
            syncData.label,
            syncData.marks,
            'order'
          ],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      console.log(`成功创建产品 ${model}`);
      added++;
    }
  }

  // 获取总产品数
  const totalProducts = await new Promise((resolve, reject) => {
    sqlite.get('SELECT COUNT(*) as count FROM products', (err, row) => {
      if (err) reject(err);
      else resolve(row.count);
    });
  });

  console.log(`同步完成: 新增 ${added} 个产品，更新 ${updated} 个产品，总计 ${totalProducts} 个产品`);

  await LogService.logOperation(req, '同步产品', '产品库管理', '', `同步完成：新增 ${added} 个产品，更新 ${updated} 个产品`);

  res.json({
    success: true,
    message: `同步完成：新增 ${added} 个产品，更新 ${updated} 个产品`,
    data: { added, updated, total: totalProducts }
  });
}));

module.exports = router;
