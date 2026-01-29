/**
 * 产品数据库操作模块
 */

const { db } = require('./connection');

/**
 * 获取产品列表
 */
function listProducts(cb) {
  db.all('SELECT * FROM products ORDER BY model ASC', cb);
}

/**
 * 获取单个产品
 */
function getProduct(id, cb) {
  db.get('SELECT * FROM products WHERE id = ? OR rowid = ?', [id, id], cb);
}

/**
 * 创建产品
 */
function createProduct(payload, cb) {
  const { model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, marks, source = 'manual' } = payload;
  const now = new Date().toISOString();
  
  console.log('[DB] 创建产品:', { model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, marks, source });
  
  db.run(
    'INSERT INTO products (model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, marks, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [model, description, estimatedWeight || 0, labelWeight || 0, safetyFactor || null, cleanliness || null, unit || '', labelBatchNo || '', label || '', marks || '', source, now, now],
    function(err) {
      if (err) {
        console.error('[DB] 创建产品失败:', err);
        return cb(err);
      }
      console.log('[DB] 创建产品成功，ID:', this.lastID);
      cb(null, { 
        id: this.lastID, 
        model, 
        description, 
        estimatedWeight: estimatedWeight || 0,
        labelWeight: labelWeight || 0,
        safetyFactor: safetyFactor || '',
        cleanliness: cleanliness || '',
        unit: unit || '',
        labelBatchNo: labelBatchNo || '',
        label: label || '',
        marks: marks || '',
        source, 
        createdAt: now, 
        updatedAt: now 
      });
    }
  );
}

/**
 * 更新产品
 */
function updateProduct(id, payload, cb) {
  const { model, description, actualWeight, unit, safetyFactor, cleanliness, labelBatchNo, label, marks } = payload;
  const now = new Date().toISOString();
  
  console.log('[DB] 更新产品，ID:', id, '数据:', { model, description, actualWeight, unit, safetyFactor, cleanliness, labelBatchNo, label, marks });
  
  // 手动编辑产品时，将来源更新为manual，并更新修改时间
  // 安全系数和清洁度为空时保存为null而不是空字符串
  db.run(
    'UPDATE products SET model = ?, description = ?, actualWeight = ?, unit = ?, safetyFactor = ?, cleanliness = ?, labelBatchNo = ?, label = ?, marks = ?, source = ?, updatedAt = ? WHERE id = ?',
    [model, description, actualWeight || 0, unit || '', safetyFactor || null, cleanliness || null, labelBatchNo || '', label || '', marks || '', 'manual', now, id],
    function(err) {
      if (err) {
        console.error('[DB] 更新产品失败:', err);
        return cb(err);
      }
      console.log('[DB] 更新产品成功，影响行数:', this.changes);
      cb(null, { 
        changes: this.changes,
        id,
        model,
        description,
        actualWeight: actualWeight || 0,
        unit: unit || '',
        safetyFactor: safetyFactor || '',
        cleanliness: cleanliness || '',
        labelBatchNo: labelBatchNo || '',
        label: label || '',
        marks: marks || '',
        source: 'manual',
        updatedAt: now
      });
    }
  );
}

/**
 * 删除产品
 */
function deleteProduct(id, cb) {
  console.log('[DB] 删除产品，ID:', id);
  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('[DB] 删除产品失败:', err);
      return cb(err);
    }
    console.log('[DB] 删除产品成功，影响行数:', this.changes);
    cb(null, { changes: this.changes });
  });
}

/**
 * 产品搜索 - 支持模糊匹配，优化性能和结果排序
 */
function searchProducts(searchTerm, limit = 10, cb) {
  const sql = `
    SELECT id, model, description, actualWeight, source, createdAt, updatedAt
    FROM products 
    WHERE model LIKE ? OR description LIKE ?
    ORDER BY 
      CASE 
        WHEN model = ? THEN 1
        WHEN model LIKE ? THEN 2
        WHEN description = ? THEN 3
        WHEN description LIKE ? THEN 4
        ELSE 5
      END,
      LENGTH(model) ASC,
      model ASC
    LIMIT ?
  `;
  
  const searchPattern = `%${searchTerm}%`;
  const exactMatch = searchTerm;
  const prefixMatch = `${searchTerm}%`;
  
  db.all(sql, [
    searchPattern, searchPattern, // WHERE条件
    exactMatch, prefixMatch, exactMatch, prefixMatch, // ORDER BY条件
    limit
  ], cb);
}

/**
 * 从订单同步产品信息
 * 如果产品不存在则创建，如果存在则更新缺失字段
 */
function syncProductFromOrder(model, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, cb) {
  // 兼容不同参数数量的调用
  if (typeof estimatedWeight === 'function') {
    cb = estimatedWeight;
    estimatedWeight = null;
    labelWeight = null;
    safetyFactor = null;
    cleanliness = null;
    unit = null;
    labelBatchNo = null;
    label = null;
  }
  
  // 兼容7参数调用（没有label参数）
  if (typeof label === 'function') {
    cb = label;
    label = null;
  }
  
  // 兼容6参数调用（没有labelBatchNo和label参数）
  if (typeof labelBatchNo === 'function') {
    cb = labelBatchNo;
    labelBatchNo = null;
    label = null;
  }
  
  // 兼容5参数调用（没有unit、labelBatchNo和label参数）
  if (typeof unit === 'function') {
    cb = unit;
    unit = null;
    labelBatchNo = null;
    label = null;
  }

  if (!model || !model.trim()) {
    return cb && cb(null);
  }

  const now = new Date().toISOString();
  const trimmedModel = model.trim();

  // 检查产品是否已存在
  db.get('SELECT * FROM products WHERE model = ?', [trimmedModel], (err, row) => {
    if (err) return cb && cb(err);
    
    if (row) {
      // 产品已存在，更新缺失的字段
      const updates = [];
      const values = [];
      
      if (estimatedWeight && !row.estimatedWeight) {
        updates.push('estimatedWeight = ?');
        values.push(estimatedWeight);
      }
      if (labelWeight && !row.labelWeight) {
        updates.push('labelWeight = ?');
        values.push(labelWeight);
      }
      if (safetyFactor && !row.safetyFactor) {
        updates.push('safetyFactor = ?');
        values.push(safetyFactor);
      }
      if (cleanliness && !row.cleanliness) {
        updates.push('cleanliness = ?');
        values.push(cleanliness);
      }
      if (unit && !row.unit) {
        updates.push('unit = ?');
        values.push(unit);
      }
      if (labelBatchNo && !row.labelBatchNo) {
        updates.push('labelBatchNo = ?');
        values.push(labelBatchNo);
      }
      if (label && !row.label) {
        updates.push('label = ?');
        values.push(label);
      }
      
      if (updates.length > 0) {
        updates.push('updatedAt = ?');
        values.push(now);
        values.push(row.id);
        
        db.run(
          `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
          values,
          function(updateErr) {
            if (updateErr) {
              console.warn('更新产品信息失败:', trimmedModel, updateErr.message);
            }
            cb && cb(null);
          }
        );
      } else {
        cb && cb(null); // 产品已存在，无需更新
      }
      return;
    }

    // 添加新产品
    db.run(
      'INSERT INTO products (model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, createdAt, updatedAt, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [trimmedModel, '', estimatedWeight || null, labelWeight || null, safetyFactor || null, cleanliness || null, unit || null, labelBatchNo || null, label || null, now, now, 'order'],
      function(insertErr) {
        if (insertErr && insertErr.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
          return cb && cb(insertErr);
        }
        cb && cb(null);
      }
    );
  });
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  syncProductFromOrder
};
