/**
 * 客户数据库操作模块
 */

const { db } = require('./connection');

/**
 * 调试函数：检查客户交易额数据
 * 用于诊断交易额显示为0的问题
 */
function debugCustomerTotalUSD(cb) {
  // 检查订单数据
  db.all(`
    SELECT 
      customerId,
      COUNT(*) as orderCount,
      SUM(COALESCE(totalUSD, 0)) as totalUSD,
      COUNT(CASE WHEN deletedAt IS NULL OR deletedAt = '' THEN 1 END) as activeOrderCount
    FROM orders
    WHERE customerId IS NOT NULL
    GROUP BY customerId
    LIMIT 10
  `, (err, orderStats) => {
    if (err) {
      console.error('[DB Debug] 查询订单统计失败:', err);
      return cb(err);
    }
    
    console.log('[DB Debug] 订单统计（按客户ID分组）:', orderStats);
    
    // 检查客户数据
    db.all(`
      SELECT 
        COALESCE(c.id, c.rowid) AS id,
        c.name,
        (SELECT COUNT(*) FROM orders o WHERE o.customerId = COALESCE(c.id, c.rowid) AND (o.deletedAt IS NULL OR o.deletedAt = '')) as orderCount,
        (SELECT SUM(COALESCE(o.totalUSD, 0)) FROM orders o WHERE o.customerId = COALESCE(c.id, c.rowid) AND (o.deletedAt IS NULL OR o.deletedAt = '')) as totalUSD
      FROM customers c
      LIMIT 10
    `, (err2, customerStats) => {
      if (err2) {
        console.error('[DB Debug] 查询客户统计失败:', err2);
        return cb(err2);
      }
      
      console.log('[DB Debug] 客户统计（子查询方式）:', customerStats);
      
      // 检查JOIN查询结果
      db.all(`
        SELECT 
          COALESCE(c.id, c.rowid) AS id,
          c.name,
          COALESCE(SUM(COALESCE(o.totalUSD, 0)), 0) AS totalUSD,
          COUNT(o.id) as orderCount
        FROM customers c
        LEFT JOIN orders o ON o.customerId = COALESCE(c.id, c.rowid)
          AND o.customerId IS NOT NULL
          AND (o.deletedAt IS NULL OR o.deletedAt = '')
        GROUP BY c.id, c.rowid, c.name
        LIMIT 10
      `, (err3, joinStats) => {
        if (err3) {
          console.error('[DB Debug] 查询JOIN统计失败:', err3);
          return cb(err3);
        }
        
        console.log('[DB Debug] JOIN查询统计:', joinStats);
        cb(null, { orderStats, customerStats, joinStats });
      });
    });
  });
}

/**
 * 获取客户列表（支持分页）
 * @param {Object} options - 查询选项（可选）
 * @param {number} options.page - 页码（默认：1）
 * @param {number} options.pageSize - 每页数量（默认：全部）
 * @param {Function} cb - 回调函数
 */
function listCustomers(options, cb) {
  // 支持两种调用方式：listCustomers(cb) 或 listCustomers(options, cb)
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  const { page, pageSize } = options || {};
  const hasPagination = page !== undefined && pageSize !== undefined;
  
  // 修改查询以包含客户交易额统计（通过 LEFT JOIN 订单表）
  // 只统计未删除的订单（deletedAt IS NULL OR deletedAt = ''）
  // 确保customerId不为NULL且类型匹配
  // 使用 COALESCE 确保 totalUSD 为 NULL 时返回 0
  const baseQuery = `SELECT 
    COALESCE(c.id, c.rowid) AS id, 
    c.name, 
    c.address, 
    c.tel, 
    c.fax, 
    c.contact,
    COALESCE(SUM(COALESCE(o.totalUSD, 0)), 0) AS totalUSD
  FROM customers c
  LEFT JOIN orders o ON o.customerId = COALESCE(c.id, c.rowid)
    AND o.customerId IS NOT NULL
    AND (o.deletedAt IS NULL OR o.deletedAt = '')
  GROUP BY c.id, c.rowid, c.name, c.address, c.tel, c.fax, c.contact
  ORDER BY COALESCE(c.id, c.rowid) DESC`;

  if (hasPagination) {
    // 分页查询
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 先获取总数
    db.get('SELECT COUNT(*) as total FROM customers', (err, countRow) => {
      if (err) return cb(err);
      const total = countRow.total;
      
      // 再获取分页数据
      db.all(`${baseQuery} LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
        if (err) {
          console.error('[DB] 查询客户列表失败:', err);
          return cb(err);
        }
        // 调试日志：检查查询结果
        if (rows && rows.length > 0) {
          console.log('[DB] 客户列表查询结果示例:', {
            customerCount: rows.length,
            firstCustomer: {
              id: rows[0].id,
              name: rows[0].name,
              totalUSD: rows[0].totalUSD,
              totalUSDType: typeof rows[0].totalUSD
            }
          });
        }
        cb(null, {
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(total / parseInt(pageSize)),
          data: rows || []
        });
      });
    });
  } else {
    // 不分页，返回所有数据（保持向后兼容）
    db.all(baseQuery, (err, rows) => {
      if (err) {
        console.error('[DB] 查询客户列表失败:', err);
        return cb(err);
      }
      // 调试日志：检查查询结果
      if (rows && rows.length > 0) {
        console.log('[DB] 客户列表查询结果示例:', {
          customerCount: rows.length,
          firstCustomer: {
            id: rows[0].id,
            name: rows[0].name,
            totalUSD: rows[0].totalUSD,
            totalUSDType: typeof rows[0].totalUSD
          }
        });
      }
      cb(null, rows);
    });
  }
}

/**
 * 获取单个客户（包含交易额统计）
 */
function getCustomer(id, cb) {
  const query = `SELECT 
    COALESCE(c.id, c.rowid) AS id, 
    c.name, 
    c.address, 
    c.tel, 
    c.fax, 
    c.contact,
    COALESCE(SUM(COALESCE(o.totalUSD, 0)), 0) AS totalUSD
  FROM customers c
  LEFT JOIN orders o ON o.customerId = COALESCE(c.id, c.rowid)
    AND o.customerId IS NOT NULL
    AND (o.deletedAt IS NULL OR o.deletedAt = '')
  WHERE COALESCE(c.id, c.rowid) = ?
  GROUP BY c.id, c.rowid, c.name, c.address, c.tel, c.fax, c.contact`;
  
  db.get(query, [id], cb);
}

/**
 * 创建客户
 */
function createCustomer(payload, cb) {
  const name = (payload && payload.name !== undefined && payload.name !== null) ? String(payload.name).trim() : '';
  const address = (payload && payload.address !== undefined && payload.address !== null) ? String(payload.address).trim() : '';
  const tel = (payload && payload.tel !== undefined && payload.tel !== null) ? String(payload.tel).trim() : '';
  const fax = (payload && payload.fax !== undefined && payload.fax !== null) ? String(payload.fax).trim() : '';
  const contact = (payload && payload.contact !== undefined && payload.contact !== null) ? String(payload.contact).trim() : '';
  
  // 验证必填字段
  if (!name || name === '') {
    return cb({ code: 'VALIDATION_ERROR', message: 'Customer name is required' });
  }
  
  // 重复校验：按名称唯一（不区分大小写）
  db.get('SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [name], (e, row) => {
    if (e) return cb(e);
    if (row) return cb({ code: 'DUPLICATE', message: 'Duplicate customer name' });
    db.run('INSERT INTO customers (name, address, tel, fax, contact) VALUES (?, ?, ?, ?, ?)',
      [name, address, tel, fax, contact], function(err) {
        if (err) return cb(err);
        getCustomer(this.lastID, cb);
      });
  });
}

/**
 * 更新客户
 */
function updateCustomer(id, data, callback) {
  if (!data || typeof data !== 'object') {
    return callback(new Error('Invalid data'));
  }
  
  // 输入验证和数据清理
  const cleanData = {};
  if (data.name !== undefined) {
    cleanData.name = String(data.name || '').trim();
    // 如果提供了name字段但为空，则返回验证错误
    if (cleanData.name === '') {
      const err = new Error('客户名称不能为空');
      err.code = 'VALIDATION_ERROR';
      return callback(err);
    }
  }
  if (data.address !== undefined) cleanData.address = String(data.address || '').trim();
  if (data.tel !== undefined) cleanData.tel = String(data.tel || '').trim();
  if (data.fax !== undefined) cleanData.fax = String(data.fax || '').trim();
  if (data.contact !== undefined) cleanData.contact = String(data.contact || '').trim();

  const fields = Object.keys(cleanData);
  if (fields.length === 0) {
    return callback(new Error('No valid fields to update'));
  }

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => cleanData[f]);
  values.push(id);

  db.run(`UPDATE customers SET ${setClause} WHERE id = ?`, values, function(err) {
    if (err) return callback(err);
    if (this.changes === 0) {
      // 未更新任何记录，尝试按名称匹配并回退更新
      if (cleanData.name) {
        db.get('SELECT id FROM customers WHERE TRIM(name) = ? LIMIT 1', [cleanData.name], (err2, row) => {
          if (err2) return callback(err2);
          if (row && row.id) {
            // 找到同名客户，使用其ID重新更新
            const newValues = fields.map(f => cleanData[f]);
            newValues.push(row.id);
            db.run(`UPDATE customers SET ${setClause} WHERE id = ?`, newValues, function(err3) {
              if (err3) return callback(err3);
              if (this.changes === 0) return callback(null, null);
              
              // 如果更新了客户名称，同步更新所有相关订单的 customerName
              if (cleanData.name) {
                db.run('UPDATE orders SET customerName = ? WHERE customerId = ?', [cleanData.name, row.id], function(err4) {
                  if (err4) {
                    console.error('[DB] 更新订单客户名称失败:', err4);
                    // 不阻止客户更新，只记录错误
                  } else {
                    console.log(`[DB] 已同步更新 ${this.changes} 个订单的客户名称`);
                  }
                });
              }
              
              db.get('SELECT * FROM customers WHERE id = ?', [row.id], callback);
            });
          } else {
            callback(null, null);
          }
        });
      } else {
        callback(null, null);
      }
    } else {
      // 如果更新了客户名称，同步更新所有相关订单的 customerName
      if (cleanData.name) {
        db.run('UPDATE orders SET customerName = ? WHERE customerId = ?', [cleanData.name, id], function(err2) {
          if (err2) {
            console.error('[DB] 更新订单客户名称失败:', err2);
            // 不阻止客户更新，只记录错误
          } else {
            console.log(`[DB] 已同步更新 ${this.changes} 个订单的客户名称`);
          }
        });
      }
      
      db.get('SELECT * FROM customers WHERE id = ?', [id], callback);
    }
  });
}

/**
 * 删除客户
 */
function deleteCustomer(id, cb) {
  db.run('DELETE FROM customers WHERE id = ?', [id], function(err) { 
    cb(err, this.changes > 0); 
  });
}

/**
 * 清空所有客户
 */
function clearCustomers(cb) {
  db.run('DELETE FROM customers', function(err) { 
    cb(err, this.changes >= 0); 
  });
}

module.exports = {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  clearCustomers,
  debugCustomerTotalUSD
};
