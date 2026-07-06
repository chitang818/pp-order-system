/**
 * 产品数据库操作模块
 */

const { db } = require('./connection');

/**
 * 获取产品列表
 */
function listProducts(cb) {
  db.all('SELECT * FROM products ORDER BY model ASC, COALESCE(productType, 1) ASC', cb);
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
  const {
    model,
    description,
    estimatedWeight,
    labelWeight,
    safetyFactor,
    cleanliness,
    unit,
    labelBatchNo,
    label,
    marks,
    source = 'manual',
    productType: rawProductType
  } = payload;
  const productType =
    rawProductType === 2 || rawProductType === 3 ? rawProductType : 1;
  const now = new Date().toISOString();
  const trimmedModel = (model || '').trim();

  console.log('[DB] 创建产品:', {
    model: trimmedModel,
    productType,
    description,
    estimatedWeight,
    labelWeight,
    safetyFactor,
    cleanliness,
    unit,
    labelBatchNo,
    label,
    marks,
    source
  });

  db.run(
    'INSERT INTO products (model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, marks, source, productType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      trimmedModel,
      description,
      estimatedWeight || 0,
      labelWeight || 0,
      safetyFactor || null,
      cleanliness || null,
      unit || '',
      labelBatchNo || '',
      label || '',
      marks || '',
      source,
      productType,
      now,
      now
    ],
    function (err) {
      if (err) {
        console.error('[DB] 创建产品失败:', err);
        if (err.code === 'SQLITE_CONSTRAINT' || String(err.message || '').includes('UNIQUE')) {
          err.code = 'DUPLICATE_MODEL_TYPE';
          err.message = '该型号在此产品类型下已存在';
        }
        return cb(err);
      }
      console.log('[DB] 创建产品成功，ID:', this.lastID);
      cb(null, {
        id: this.lastID,
        model: trimmedModel,
        productType,
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
  const {
    model,
    description,
    actualWeight,
    unit,
    safetyFactor,
    cleanliness,
    labelBatchNo,
    label,
    marks,
    productType: rawPt
  } = payload;
  const now = new Date().toISOString();

  db.get('SELECT * FROM products WHERE id = ? OR rowid = ?', [id, id], (err, row) => {
    if (err) {
      console.error('[DB] 更新产品前读取失败:', err);
      return cb(err);
    }
    if (!row) {
      return cb(new Error('产品不存在'));
    }

    const modelFinal = (model != null ? String(model) : row.model).trim();
    let productType = row.productType != null ? row.productType : 1;
    if (rawPt !== undefined && rawPt !== null && rawPt !== '') {
      const p = Number(rawPt);
      productType = p === 2 || p === 3 ? p : 1;
    }
    const descFinal = description !== undefined ? description : row.description;
    const aw = actualWeight !== undefined ? actualWeight : row.actualWeight;
    const unitFinal = unit !== undefined ? unit : row.unit;
    const sf = safetyFactor !== undefined ? safetyFactor : row.safetyFactor;
    const cl = cleanliness !== undefined ? cleanliness : row.cleanliness;
    const lbno = labelBatchNo !== undefined ? labelBatchNo : row.labelBatchNo;
    const lbl = label !== undefined ? label : row.label;
    const mk = marks !== undefined ? marks : row.marks;

    console.log('[DB] 更新产品，ID:', id, '数据:', {
      model: modelFinal,
      productType,
      description: descFinal,
      actualWeight: aw,
      unit: unitFinal
    });

    db.run(
      'UPDATE products SET model = ?, description = ?, actualWeight = ?, unit = ?, safetyFactor = ?, cleanliness = ?, labelBatchNo = ?, label = ?, marks = ?, productType = ?, source = ?, updatedAt = ? WHERE id = ?',
      [
        modelFinal,
        descFinal,
        aw || 0,
        unitFinal || '',
        sf || null,
        cl || null,
        lbno || '',
        lbl || '',
        mk || '',
        productType,
        'manual',
        now,
        id
      ],
      function (uerr) {
        if (uerr) {
          console.error('[DB] 更新产品失败:', uerr);
          if (uerr.code === 'SQLITE_CONSTRAINT' || String(uerr.message || '').includes('UNIQUE')) {
            uerr.message = '该型号在此产品类型下已存在';
          }
          return cb(uerr);
        }
        console.log('[DB] 更新产品成功，影响行数:', this.changes);
        cb(null, {
          changes: this.changes,
          id,
          model: modelFinal,
          productType,
          description: descFinal,
          actualWeight: aw || 0,
          unit: unitFinal || '',
          safetyFactor: sf || '',
          cleanliness: cl || '',
          labelBatchNo: lbno || '',
          label: lbl || '',
          marks: mk || '',
          source: 'manual',
          updatedAt: now
        });
      }
    );
  });
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
      model ASC,
      COALESCE(productType, 1) ASC
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

  const orderProductType = 1;

  // 检查产品是否已存在（与订单同步入口一致时按类型区分；此辅助函数默认 A 类）
  db.get('SELECT * FROM products WHERE model = ? AND COALESCE(productType, 1) = ?', [trimmedModel, orderProductType], (err, row) => {
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
      'INSERT INTO products (model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, productType, createdAt, updatedAt, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [trimmedModel, '', estimatedWeight || null, labelWeight || null, safetyFactor || null, cleanliness || null, unit || null, labelBatchNo || null, label || null, orderProductType, now, now, 'order'],
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
