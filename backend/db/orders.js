/**
 * 订单数据库操作模块
 */

const { db } = require('./connection');

/**
 * 安全解析 JSON 文本为对象
 */
function parseJsonSafe(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const obj = JSON.parse(text);
    return (obj && typeof obj === 'object') ? obj : null;
  } catch (_) {
    return null;
  }
}

/**
 * 获取订单列表（支持分页）
 * @param {Object} options - 查询选项（可选）
 * @param {number} options.page - 页码（默认：1）
 * @param {number} options.pageSize - 每页数量（默认：全部）
 * @param {Function} cb - 回调函数
 */
function listOrders(options, cb) {
  // 支持两种调用方式：listOrders(cb) 或 listOrders(options, cb)
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  const { page, pageSize, productModel } = options || {};
  const hasPagination = page !== undefined && pageSize !== undefined;
  const hasProductModelFilter = productModel && productModel.trim() !== '';
  
  // 如果有产品型号筛选，需要JOIN order_items表
  let baseQuery;
  let countQuery;
  
  if (hasProductModelFilter) {
    // 包含产品型号筛选的查询
    // 排除已删除的订单（deletedAt IS NULL OR deletedAt = ''）
    const productModelPattern = `%${productModel.trim()}%`;
    baseQuery = `SELECT DISTINCT COALESCE(o.id, o.rowid) AS id, o.rowid,
                        o.contractNo, o.invoiceNo, o.blNo, o.invoiceDate, o.shipmentDate, o.shipFrom, o.shipTo, o.shippedPerSs, o.forwarder,
                        o.customerId, o.customerName, o.totalUSD, o.createdAt, o.updatedAt, o.productType, o.extras, o.status
                 FROM orders o
                 INNER JOIN order_items oi ON oi.orderId = COALESCE(o.id, o.rowid)
                 WHERE LOWER(oi.model) LIKE LOWER(?)
                   AND (o.deletedAt IS NULL OR o.deletedAt = '')
                 ORDER BY o.invoiceDate DESC, o.contractNo DESC`;
    countQuery = `SELECT COUNT(DISTINCT COALESCE(o.id, o.rowid)) as total 
                  FROM orders o
                  INNER JOIN order_items oi ON oi.orderId = COALESCE(o.id, o.rowid)
                  WHERE LOWER(oi.model) LIKE LOWER(?)
                    AND (o.deletedAt IS NULL OR o.deletedAt = '')`;
  } else {
    // 普通查询 - 按 contractNo 去重，避免相同合同号的订单重复显示
    // 如果存在重复的 contractNo，只保留 id 最大的那条记录（通常是最新的）
    // 排除已删除的订单（deletedAt IS NULL OR deletedAt = ''）
    baseQuery = `SELECT COALESCE(o.id, o.rowid) AS id, o.rowid,
                        o.contractNo, o.invoiceNo, o.blNo, o.invoiceDate, o.shipmentDate, o.shipFrom, o.shipTo, o.shippedPerSs, o.forwarder,
                        o.customerId, o.customerName, o.totalUSD, o.createdAt, o.updatedAt, o.productType, o.extras, o.status
                 FROM orders o
                 INNER JOIN (
                   SELECT contractNo, MAX(COALESCE(id, rowid)) AS maxId
                   FROM orders
                   WHERE contractNo IS NOT NULL AND contractNo != ''
                     AND (deletedAt IS NULL OR deletedAt = '')
                   GROUP BY contractNo
                 ) latest ON o.contractNo = latest.contractNo AND COALESCE(o.id, o.rowid) = latest.maxId
                 UNION ALL
                 SELECT COALESCE(id, rowid) AS id, rowid,
                        contractNo, invoiceNo, blNo, invoiceDate, shipmentDate, shipFrom, shipTo, shippedPerSs, forwarder,
                        customerId, customerName, totalUSD, createdAt, updatedAt, productType, extras, status
                 FROM orders
                 WHERE (contractNo IS NULL OR contractNo = '')
                   AND (deletedAt IS NULL OR deletedAt = '')
                 ORDER BY invoiceDate DESC, contractNo DESC`;
    countQuery = `SELECT COUNT(*) as total FROM (
                   SELECT contractNo
                   FROM orders
                   WHERE contractNo IS NOT NULL AND contractNo != ''
                     AND (deletedAt IS NULL OR deletedAt = '')
                   GROUP BY contractNo
                   UNION ALL
                   SELECT NULL as contractNo
                   FROM orders
                   WHERE (contractNo IS NULL OR contractNo = '')
                     AND (deletedAt IS NULL OR deletedAt = '')
                 )`;
  }

  if (hasPagination) {
    // 分页查询
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 先获取总数
    const countParams = hasProductModelFilter ? [`%${productModel.trim()}%`] : [];
    db.get(countQuery, countParams, (err, countRow) => {
      if (err) return cb(err);
      const total = countRow.total;
      
      // 再获取分页数据
      const queryParams = hasProductModelFilter 
        ? [`%${productModel.trim()}%`, limit, offset]
        : [limit, offset];
      const finalQuery = `${baseQuery} LIMIT ? OFFSET ?`;
      
      db.all(finalQuery, queryParams, (err, rows) => {
        if (err) return cb(err);
        const parsed = (rows || []).map(r => ({ 
          ...r, 
          id: r.id || r.rowid,
          extras: parseJsonSafe(r.extras), 
          productType: r.productType || 1 
        }));
        cb(null, {
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(total / parseInt(pageSize)),
          data: parsed
        });
      });
    });
  } else {
    // 不分页，返回所有数据（保持向后兼容）
    const queryParams = hasProductModelFilter ? [`%${productModel.trim()}%`] : [];
    db.all(baseQuery, queryParams, (err, rows) => {
      if (err) return cb(err);
      const parsed = (rows || []).map(r => ({ 
        ...r, 
        id: r.id || r.rowid,
        extras: parseJsonSafe(r.extras), 
        productType: r.productType || 1 
      }));
      cb(null, parsed);
    });
  }
}

/**
 * 获取单个订单（包含订单项）
 */
function getOrder(id, cb) {
      // 允许获取已删除的订单（用于恢复功能）
      db.get(`SELECT COALESCE(id, rowid) AS id, rowid,
                 contractNo, invoiceNo, blNo, invoiceDate, shipmentDate, shipFrom, shipTo, shippedPerSs, forwarder,
                 customerId, customerName, totalUSD, createdAt, updatedAt, productType, extras, status, deletedAt
          FROM orders WHERE id = ? OR rowid = ?`, [id, id], (err, row) => {
    if (err) return cb(err);
    if (!row) return cb(null, null);
    const parsedExtras = parseJsonSafe(row.extras);
    // 只在开发模式下输出详细日志
    if (process.env.NODE_ENV === 'development') {
      console.log('[DB] getOrder 从数据库读取的extras原始值:', row.extras);
      console.log('[DB] getOrder 解析后的extras:', JSON.stringify(parsedExtras, null, 2));
      if (parsedExtras && parsedExtras.marks !== undefined) {
        console.log('[DB] getOrder extras.marks 值:', parsedExtras.marks, '类型:', typeof parsedExtras.marks);
      }
    }
    // marks 字段是可选的，如果没有则不输出警告（避免日志噪音）
    const base = { ...row, extras: parsedExtras, productType: row.productType || 1 };
    // 使用实际的ID或rowid来查询order_items
    const actualId = row.id || row.rowid;
    db.all('SELECT * FROM order_items WHERE orderId = ? ORDER BY COALESCE(sortIndex, id) ASC', [actualId], (e2, items) => {
      if (e2) return cb(e2);
      const parsedItems = (items || []).map(it => ({ ...it, extras: parseJsonSafe(it.extras) }));
      cb(null, { ...base, items: parsedItems });
    });
  });
}

/**
 * 数字解析辅助函数
 * 转换全角数字，去除千分位逗号和非数字字符
 */
function toNumOrNull(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  
  const fullWidthMap = { '０':'0','１':'1','２':'2','３':'3','４':'4','５':'5','６':'6','７':'7','８':'8','９':'9','．':'.','－':'-' };
  const fullWidthRegex = /[０-９．－]/g;
  const nonNumericRegex = /[^0-9.-]/g;
  const hasDigitRegex = /[0-9]/;
  
  let s = String(v).trim();
  if (s === '') return null;
  // 转换全角数字与符号
  s = s.replace(fullWidthRegex, ch => fullWidthMap[ch] || ch);
  // 去除千分位逗号和非数字字符
  s = s.replace(/,/g, '').replace(nonNumericRegex, '');
  // 边界：若只剩"-"或"."或空则视为无效
  if (!hasDigitRegex.test(s)) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/**
 * 创建订单
 */
function isTransactionInactiveError(err) {
  if (!err || !err.message) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('no transaction') || msg.includes('not active');
}

function createOrder(payload, cb) {
  try {
    const now = new Date().toISOString();
    let extras = null;
    try {
      extras = payload.extras ? JSON.stringify(payload.extras) : null;
    } catch (err) {
      console.error('[DB] 序列化 extras 失败:', err);
      return cb(new Error('序列化订单额外信息失败: ' + err.message));
    }
    // 注意：不手动指定ID，让数据库自动生成（AUTOINCREMENT）
    // 如果 payload 中有 id，先保存以便后续使用，但不插入到数据库
    const providedId = payload.id;
    
    // 容错：若 items 为字符串或非数组，归一化为数组
    try {
      if (typeof payload.items === 'string') {
        try { payload.items = JSON.parse(payload.items); } catch (_) { payload.items = []; }
      }
      if (!Array.isArray(payload.items)) payload.items = [];
    } catch (_) { payload.items = []; }
    
    // 开始新的事务（使用 IMMEDIATE 模式避免死锁）
    // 注意：如果之前有未完成的事务，SQLite 会自动处理，不需要手动 ROLLBACK
    db.run('BEGIN IMMEDIATE TRANSACTION', function(err) {
      if (err) {
        // 如果开始事务失败，可能是因为有未完成的事务，先尝试回滚再重试
        if (err.message && (err.message.includes('transaction') || err.message.includes('busy'))) {
          // 尝试回滚并重试
          db.run('ROLLBACK', function(rollbackErr) {
            // 忽略回滚错误（如果没有事务，这是正常的）
            if (rollbackErr && !rollbackErr.message.includes('no transaction') && !rollbackErr.message.includes('cannot rollback')) {
              console.warn('[DB] 回滚未完成事务时出现错误（可忽略）:', rollbackErr.message);
            }
            // 重试开始事务
            db.run('BEGIN IMMEDIATE TRANSACTION', function(retryErr) {
              if (retryErr) {
                console.error('[DB] 重试开始事务失败:', retryErr);
                return cb(retryErr);
              }
              // 继续执行事务逻辑（需要将后续代码移到这里）
              continueTransaction();
            });
          });
          return;
        }
        console.error('[DB] 开始事务失败:', err);
        return cb(err);
      }
      
      // 继续执行事务逻辑
      continueTransaction();
      
      function continueTransaction() {
        // 标记事务是否已处理（避免重复提交或回滚）
        let transactionHandled = false;
        
        // 安全的事务处理函数
        function safeRollback(callback) {
          if (transactionHandled) {
            console.warn('[DB] 事务已处理，跳过回滚');
            if (callback) callback();
            return;
          }
          transactionHandled = true;
          db.run('ROLLBACK', function(rollbackErr) {
            // 忽略"no transaction"错误，因为可能事务已经自动回滚
            if (rollbackErr && !rollbackErr.message.includes('no transaction') && !rollbackErr.message.includes('cannot rollback')) {
              console.warn('[DB] 回滚事务时出现错误（可忽略）:', rollbackErr.message);
            }
            if (callback) callback();
          });
        }
        
        function safeCommit(callback) {
          if (transactionHandled) {
            console.warn('[DB] 事务已处理，跳过提交');
            if (callback) callback(new Error('事务已处理，无法提交'));
            return;
          }
          transactionHandled = true;
          db.run('COMMIT', function(commitErr) {
            if (commitErr && isTransactionInactiveError(commitErr)) {
              console.warn('[DB] COMMIT 返回非活动事务提示，视为成功:', commitErr.message);
              commitErr = null;
            }
            if (commitErr) {
              console.error('[DB] 提交事务失败:', commitErr);
              // 如果提交失败，尝试回滚
              db.run('ROLLBACK', function(rollbackErr) {
                if (rollbackErr && !rollbackErr.message.includes('no transaction') && !rollbackErr.message.includes('cannot rollback')) {
                  console.warn('[DB] 提交失败后回滚时出现错误（可忽略）:', rollbackErr.message);
                }
              });
            }
            if (callback) callback(commitErr);
          });
        }
        
        // 优化：使用预处理语句提高性能
        // 注意：不插入 id 字段，让数据库自动生成
        const insertOrderStmt = db.prepare(`INSERT INTO orders (contractNo, invoiceNo, blNo, invoiceDate, shippedPerSs, forwarder, shipFrom, shipTo, customerId, customerName, totalUSD, createdAt, updatedAt, productType, extras, shipmentDate, status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        
        // 调试日志
        const productType = payload.productType !== undefined ? payload.productType : 1;
        try { console.log('[DB] 创建订单 productType:', productType, 'contractNo:', payload.contractNo); } catch(_){}
        
        // 处理 customerId：如果提供了 customerId，验证它是否存在
        let finalCustomerId = payload.customerId || null;
        if (finalCustomerId !== null && finalCustomerId !== undefined && finalCustomerId !== '') {
          // 确保 customerId 是数字
          finalCustomerId = Number(finalCustomerId);
          if (isNaN(finalCustomerId) || finalCustomerId <= 0) {
            console.error('[DB] 无效的 customerId:', payload.customerId);
            finalCustomerId = null;
          } else {
            // 验证客户是否存在（异步检查，如果不存在则设为null，避免外键约束错误）
            // 注意：这里不阻塞，如果客户不存在，会在插入时触发外键约束错误，我们会在错误处理中捕获
            // 如果 customerName 存在，即使 customerId 无效也可以继续（使用 customerName）
            if (!payload.customerName || payload.customerName.trim() === '') {
              // 如果没有 customerName，必须验证 customerId 是否存在
              // 这里我们依赖数据库的外键约束来验证，如果失败会在错误处理中捕获
            }
          }
        } else {
          finalCustomerId = null;
        }
        
        insertOrderStmt.run([payload.contractNo, payload.invoiceNo, payload.blNo, payload.invoiceDate, payload.shippedPerSs || null, payload.forwarder || null, payload.shipFrom, payload.shipTo,
           finalCustomerId, payload.customerName || null, toNumOrNull(payload.totalUSD), now, now, productType, extras, payload.shipmentDate, payload.status || '已创建'], function(err){
          insertOrderStmt.finalize();
          if (err) { 
            console.error('[DB] 插入订单主表失败:', {
              error: err,
              message: err.message,
              code: err.code,
              customerId: finalCustomerId,
              customerName: payload.customerName,
              contractNo: payload.contractNo
            });
            
            // 检查是否是外键约束错误
            let errorMessage = err.message || '插入订单主表失败';
            if (err.message && (err.message.includes('FOREIGN KEY') || err.message.includes('constraint'))) {
              errorMessage = `客户ID无效或客户不存在。customerId: ${finalCustomerId}, customerName: ${payload.customerName || '未提供'}`;
            }
            
            safeRollback(function() {
              const dbError = new Error(errorMessage);
              dbError.code = err.code;
              dbError.originalError = err;
              cb(dbError);
            });
            return;
          }
          
          // 获取数据库自动生成的订单ID
          const orderId = this.lastID;
          console.log('[DB] 创建订单成功，数据库生成的ID:', orderId);
          
          if (!orderId || orderId <= 0) {
            console.error('[DB] 创建订单失败：无法获取生成的订单ID');
            safeRollback(function() {
              cb(new Error('创建订单失败：无法获取生成的订单ID'));
            });
            return;
          }
          
          const items = Array.isArray(payload.items) ? payload.items : [];
          if (items.length === 0) {
            safeCommit(function(commitErr) {
              if (commitErr) {
                return cb(commitErr);
              }
              getOrder(orderId, (e, row) => {
                if (e) {
                  console.error('[DB] createOrder - getOrder 失败（无订单项）:', {
                    orderId: orderId,
                    error: e,
                    message: e.message
                  });
                  return cb(new Error('创建订单后查询失败: ' + e.message));
                }
                if (!row) {
                  console.error('[DB] createOrder - getOrder 返回空结果（无订单项），orderId:', orderId);
                  return cb(new Error('创建订单后查询结果为空，订单ID: ' + orderId));
                }
                cb(null, row);
              });
            });
            return;
          }
          
          // 优化：批量插入订单项目
          const insertItemStmt = db.prepare(`INSERT INTO order_items (orderId, sortIndex, model, quantity, packages, weight, actualWeight, packing, labelWeight, safetyFactor, cleanliness, unit, unitPrice, amount, labelBatchNo, label, extras)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
          
          let pending = items.length;
          let hasError = false;
          
          items.forEach((it, idx) => {
            if (hasError) return; // 避免重复处理
            
            const quantity = toNumOrNull(it.quantity);
            const packages = toNumOrNull(it.packages);
            const weight = toNumOrNull(it.weight);
            const actualWeight = toNumOrNull(it.actualWeight);
            const labelWeight = toNumOrNull(it.labelWeight);
            const unitPrice = toNumOrNull(it.unitPrice);
            const amount = toNumOrNull(it.amount);
            
            // 收集未知字段到 extras，便于未来扩展，并与前端传入的 it.extras 合并（marks 和 enabled 字段也保存到 extras 中）
            // 已知的数据库列字段（这些字段会直接插入到数据库列中）
            const dbColumns = ['model','quantity','packages','weight','actualWeight','packing','labelWeight','safetyFactor','cleanliness','unit','unitPrice','amount','labelBatchNo','label','sortIndex'];
            // 需要保存到 extras 的字段（这些字段不在数据库列中，需要保存到 extras JSON 中）
            // 注意：wrappingCloth（包皮布）是C类品特有的字段，需要保存到extras中
            const extrasFields = ['marks','enabled','wrappingCloth'];
            let extraObj = {};
            
            // 首先合并 it.extras 中的值（但不包括 sortIndex 和 extrasFields 中的字段，因为这些会在后面单独处理）
            try {
              if (it && typeof it.extras === 'object' && it.extras) {
                const { sortIndex, ...rest } = it.extras;
                // 排除 extrasFields 中的字段，避免被旧值覆盖
                extrasFields.forEach(field => {
                  delete rest[field];
                });
                extraObj = { ...rest };
              }
            } catch(err) {
              console.error('[DB] 合并订单项 extras 失败:', err);
            }
            
            // 然后处理 it 中的字段，优先级高于 it.extras
            try {
              Object.keys(it || {}).forEach(k => { 
                // 如果是数据库列字段，跳过（已经在 SQL 中处理）
                if (dbColumns.includes(k)) {
                  return;
                }
                // 如果是需要保存到 extras 的字段，保存到 extraObj（覆盖 it.extras 中的值）
                if (extrasFields.includes(k)) {
                  // 对于这些字段，即使为空字符串也保存（因为可能是用户明确选择的值，如"请选择"）
                  if (it[k] !== undefined && it[k] !== null) {
                    extraObj[k] = it[k];
                    if (k === 'wrappingCloth') {
                      console.log('[DB] createOrder 保存订单项 wrappingCloth 字段到 extras:', k, '值:', it[k], '索引:', idx);
                    } else {
                      console.log('[DB] createOrder 保存订单项', k, '字段到 extras:', k, '值:', it[k], '索引:', idx);
                    }
                  }
                }
                // 如果是未知字段，也保存到 extras
                else if (k !== 'extras') {
                  // 对于空字符串，也保存（因为可能是用户明确选择的值）
                  if (it[k] !== undefined && it[k] !== null) {
                    extraObj[k] = it[k];
                  }
                }
              });
            } catch(err) {
              console.error('[DB] 处理订单项 extras 失败:', err);
            }
            
            // 安全地序列化 extras，避免循环引用或特殊值导致的问题
            let itemExtras = null;
            try {
              if (Object.keys(extraObj).length > 0) {
                itemExtras = JSON.stringify(extraObj);
              }
            } catch(err) {
              console.error('[DB] 序列化订单项 extras 失败:', idx, err);
              // 如果序列化失败，尝试清理可能有问题的字段
              try {
                const cleanedObj = {};
                Object.keys(extraObj).forEach(k => {
                  const v = extraObj[k];
                  // 只保存可以序列化的值
                  if (v !== undefined && v !== null && typeof v !== 'function' && typeof v !== 'symbol') {
                    cleanedObj[k] = v;
                  }
                });
                itemExtras = Object.keys(cleanedObj).length > 0 ? JSON.stringify(cleanedObj) : null;
              } catch(cleanErr) {
                console.error('[DB] 清理订单项 extras 后仍序列化失败:', idx, cleanErr);
                itemExtras = null;
              }
            }
            console.log('[DB] createOrder 订单项 extras 最终值:', idx, itemExtras);
            
            // 调试日志 - 只显示第一个产品
            if (idx === 0) {
              try { console.log('[DB] 创建产品详情 model:', it.model, 'labelBatchNo:', it.labelBatchNo, 'label:', it.label, 'marks:', it.marks); } catch(_){}
            }
            
            // 使用预处理语句插入订单项目
            insertItemStmt.run([orderId, Number(it.sortIndex != null ? it.sortIndex : idx), it.model || '', quantity, packages, weight, actualWeight, it.packing || '', labelWeight, it.safetyFactor || '', it.cleanliness || '', it.unit || '', unitPrice, amount, it.labelBatchNo || '', it.label || '', itemExtras], function(ei){
              if (ei && !hasError) { 
                hasError = true;
                console.error('[DB] 插入订单项失败:', {
                  index: idx,
                  error: ei,
                  message: ei.message,
                  code: ei.code,
                  orderId: orderId,
                  model: it.model
                });
                
                // 检查是否是外键约束错误
                let errorMessage = ei.message || '插入订单项失败';
                if (ei.message && (ei.message.includes('FOREIGN KEY') || ei.message.includes('constraint'))) {
                  errorMessage = `插入订单项失败：订单ID无效。orderId: ${orderId}, 产品型号: ${it.model || '未知'}`;
                }
                
                insertItemStmt.finalize();
                safeRollback(function() {
                  const dbError = new Error(errorMessage);
                  dbError.code = ei.code;
                  dbError.originalError = ei;
                  cb(dbError);
                });
                return;
              }
              
              pending--; 
              if (pending === 0 && !hasError) {
                insertItemStmt.finalize();
                safeCommit(function(commitErr) {
                  if (commitErr) {
                    return cb(commitErr);
                  }
                  getOrder(orderId, (e, row) => {
                    if (e) {
                      console.error('[DB] createOrder - getOrder 失败:', {
                        orderId: orderId,
                        error: e,
                        message: e.message,
                        stack: e.stack
                      });
                      return cb(new Error('创建订单后查询失败: ' + e.message));
                    }
                    if (!row) {
                      console.error('[DB] createOrder - getOrder 返回空结果，orderId:', orderId);
                      return cb(new Error('创建订单后查询结果为空，订单ID: ' + orderId));
                    }
                    if (row && (!row.id || Number(row.id) <= 0)) row.id = orderId;
                    cb(null, row);
                  });
                });
              }
            });
          });
        }); // insertOrderStmt.run 回调结束
      } // continueTransaction 函数结束
    }); // BEGIN IMMEDIATE TRANSACTION 回调结束
  } catch (err) {
    console.error('[DB] createOrder 异常:', err);
    return cb(new Error('创建订单异常: ' + err.message));
  }
}

/**
 * 更新订单
 */
function updateOrder(id, payload, cb) {
  try {
    const now = new Date().toISOString();
    let extras = null;
    try {
      extras = payload.extras ? JSON.stringify(payload.extras) : null;
      // 添加调试日志，检查extras中的marks字段
      console.log('[DB] updateOrder 接收到的payload.extras:', JSON.stringify(payload.extras, null, 2));
      if (payload.extras && payload.extras.marksNote !== undefined) {
        console.log('[DB] updateOrder extras.marksNote 值:', payload.extras.marksNote, '类型:', typeof payload.extras.marksNote);
        console.log('[DB] updateOrder 序列化后的extras字符串:', extras);
        // 验证序列化是否正确
        try {
          const parsed = JSON.parse(extras);
          console.log('[DB] updateOrder 验证：解析后的extras.marksNote:', parsed.marksNote);
        } catch(e) {
          console.error('[DB] updateOrder 验证：解析extras失败:', e);
        }
      } else {
        console.log('[DB] updateOrder extras中没有marksNote字段或为undefined');
        console.log('[DB] updateOrder extras对象:', payload.extras);
        console.log('[DB] updateOrder 序列化后的extras:', extras);
      }
      
      // 检查items中的marks字段
      if (payload.items && Array.isArray(payload.items) && payload.items.length > 0) {
        console.log('[DB] updateOrder items数量:', payload.items.length);
        payload.items.forEach((it, idx) => {
          if (it.marks !== undefined) {
            console.log('[DB] updateOrder items[' + idx + '].marks 值:', it.marks, '类型:', typeof it.marks);
          }
          if (it.extras && it.extras.marks !== undefined) {
            console.log('[DB] updateOrder items[' + idx + '].extras.marks 值:', it.extras.marks, '类型:', typeof it.extras.marks);
          }
        });
      }
    } catch (err) {
      console.error('[DB] 序列化 extras 失败:', err);
      return cb(new Error('序列化订单额外信息失败: ' + err.message));
    }
    
    // 容错：若 items 为字符串或非数组，归一化为数组
    try {
      if (typeof payload.items === 'string') {
        try { payload.items = JSON.parse(payload.items); } catch (_) { payload.items = []; }
      }
      if (!Array.isArray(payload.items)) payload.items = [];
    } catch (err) {
      console.error('[DB] 处理 items 失败:', err);
      payload.items = [];
    }
    
    const productType = payload.productType !== undefined ? payload.productType : 1;
    try { console.log('updateOrder payload base:', { id, contractNo: payload.contractNo, invoiceNo: payload.invoiceNo, productType: productType, customerId: payload.customerId, customerName: payload.customerName }); } catch(_){}
    
    // 开始事务（使用 IMMEDIATE 模式避免死锁）
    // 注意：如果之前有未完成的事务，SQLite 会自动处理，不需要手动 ROLLBACK
    db.run('BEGIN IMMEDIATE TRANSACTION', function(err) {
      if (err) {
        // 如果开始事务失败，可能是因为有未完成的事务，先尝试回滚再重试
        if (err.message && (err.message.includes('transaction') || err.message.includes('busy'))) {
          // 尝试回滚并重试
          db.run('ROLLBACK', function(rollbackErr) {
            // 忽略回滚错误（如果没有事务，这是正常的）
            if (rollbackErr && !rollbackErr.message.includes('no transaction') && !rollbackErr.message.includes('cannot rollback')) {
              console.warn('[DB] 回滚未完成事务时出现错误（可忽略）:', rollbackErr.message);
            }
            // 重试开始事务
            db.run('BEGIN IMMEDIATE TRANSACTION', function(retryErr) {
              if (retryErr) {
                console.error('[DB] 重试开始事务失败:', retryErr);
                return cb(retryErr);
              }
              // 成功开始事务，继续执行更新逻辑
              continueUpdateTransaction();
            });
          });
          return;
        }
        console.error('[DB] 开始事务失败:', err);
        return cb(err);
      }
      
      // 成功开始事务，继续执行更新逻辑
      continueUpdateTransaction();
    });
    
    // 将更新逻辑提取为独立函数，以便在重试时调用
    function continueUpdateTransaction() {
      
      // 优化：使用预处理语句更新订单主表
      const updateOrderStmt = db.prepare(`UPDATE orders SET contractNo=?, invoiceNo=?, blNo=?, invoiceDate=?, shipmentDate=?, shipFrom=?, shipTo=?, shippedPerSs=?, forwarder=?, customerId=?, customerName=?, totalUSD=?, updatedAt=?, productType=?, extras=?, status=? WHERE id=? OR rowid=?`);
      
      // 调试日志
      try { console.log('[DB] 更新订单 productType:', productType, 'id:', id); } catch(_){}
      
      const updateParams = [payload.contractNo, payload.invoiceNo, payload.blNo, payload.invoiceDate, payload.shipmentDate, payload.shipFrom, payload.shipTo, payload.shippedPerSs || null, payload.forwarder || null,
         payload.customerId || null, payload.customerName || null, toNumOrNull(payload.totalUSD), now, productType, extras, payload.status || '已创建', id, id];
      console.log('[DB] updateOrder 准备更新订单，extras参数值:', extras);
      console.log('[DB] updateOrder 更新参数中extras的位置:', updateParams.indexOf(extras), '总参数数:', updateParams.length);
      console.log('[DB] updateOrder 更新参数中extras的前后值:', updateParams[13], 'extras:', extras, updateParams[15]);
      updateOrderStmt.run(updateParams, function(err){
        updateOrderStmt.finalize();
        if (err) { 
          console.error('[DB] 更新订单主表失败:', err);
          db.run('ROLLBACK', function() {
            cb(err);
          });
          return;
        }
        
        // 优化：批量删除旧的订单项目
        const deleteItemsStmt = db.prepare('DELETE FROM order_items WHERE orderId = ?');
        deleteItemsStmt.run([id], function(e2){
          deleteItemsStmt.finalize();
          if (e2) { 
            console.error('[DB] 删除订单项失败:', e2);
            db.run('ROLLBACK', function() {
              cb(e2);
            });
            return;
          }
          
          const items = Array.isArray(payload.items) ? payload.items : [];
          try { console.log('updateOrder items.length:', items.length); } catch(_){}
          
          if (items.length === 0) {
            db.run('COMMIT', function(err) {
              if (err && isTransactionInactiveError(err)) {
                console.warn('[DB] COMMIT 返回非活动事务提示（更新订单-无订单项），视为成功:', err.message);
                err = null;
              }
              if (err) {
                console.error('[DB] 提交事务失败:', err);
                return cb(err);
              }
              getOrder(id, cb);
            });
            return;
          }
          
          // 优化：批量插入新的订单项目
          const insertItemStmt = db.prepare(`INSERT INTO order_items (orderId, sortIndex, model, quantity, packages, weight, actualWeight, packing, labelWeight, safetyFactor, cleanliness, unit, unitPrice, amount, labelBatchNo, label, extras)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
          
          let pending = items.length;
          let hasError = false;
          
          items.forEach((it, idx) => {
            if (hasError) return; // 避免重复处理
            
            const quantity = toNumOrNull(it.quantity);
            const packages = toNumOrNull(it.packages);
            const weight = toNumOrNull(it.weight);
            const actualWeight = toNumOrNull(it.actualWeight);
            const labelWeight = toNumOrNull(it.labelWeight);
            const unitPrice = toNumOrNull(it.unitPrice);
            const amount = toNumOrNull(it.amount);
            
            // 收集未知字段到 extras（marks 和 enabled 字段也保存到 extras 中，因为表结构中没有单独的列）
            // 已知的数据库列字段（这些字段会直接插入到数据库列中）
            const dbColumns = ['model','quantity','packages','weight','actualWeight','packing','labelWeight','safetyFactor','cleanliness','unit','unitPrice','amount','labelBatchNo','label','sortIndex'];
            // 需要保存到 extras 的字段（这些字段不在数据库列中，需要保存到 extras JSON 中）
            // 注意：wrappingCloth（包皮布）是C类品特有的字段，需要保存到extras中
            const extrasFields = ['marks','enabled','wrappingCloth'];
            let extraObj = {};
            
            // 首先合并 it.extras 中的值（但不包括 sortIndex 和 extrasFields 中的字段，因为这些会在后面单独处理）
            try {
              if (it && typeof it.extras === 'object' && it.extras) {
                const { sortIndex, ...rest } = it.extras;
                // 排除 extrasFields 中的字段，避免被旧值覆盖
                extrasFields.forEach(field => {
                  delete rest[field];
                });
                extraObj = { ...rest };
              }
            } catch(err) {
              console.error('[DB] 合并订单项 extras 失败:', err);
            }
            
            // 然后处理 it 中的字段，优先级高于 it.extras
            try {
              Object.keys(it || {}).forEach(k => { 
                // 如果是数据库列字段，跳过（已经在 SQL 中处理）
                if (dbColumns.includes(k)) {
                  return;
                }
                // 如果是需要保存到 extras 的字段，保存到 extraObj（覆盖 it.extras 中的值）
                if (extrasFields.includes(k)) {
                  // 对于这些字段，即使为空字符串也保存（因为可能是用户明确选择的值，如"请选择"）
                  if (it[k] !== undefined && it[k] !== null) {
                    extraObj[k] = it[k];
                    if (k === 'wrappingCloth') {
                      console.log('[DB] updateOrder 保存订单项 wrappingCloth 字段到 extras:', k, '值:', it[k], '索引:', idx);
                    } else {
                      console.log('[DB] updateOrder 保存订单项', k, '字段到 extras:', k, '值:', it[k], '索引:', idx);
                    }
                  }
                }
                // 如果是未知字段，也保存到 extras
                else if (k !== 'extras') {
                  // 对于空字符串，也保存（因为可能是用户明确选择的值）
                  if (it[k] !== undefined && it[k] !== null) {
                    extraObj[k] = it[k];
                  }
                }
              });
            } catch(err) {
              console.error('[DB] 处理订单项 extras 失败:', err);
            }
            
            // 安全地序列化 extras，避免循环引用或特殊值导致的问题
            let itemExtras = null;
            try {
              if (Object.keys(extraObj).length > 0) {
                itemExtras = JSON.stringify(extraObj);
              }
            } catch(err) {
              console.error('[DB] 序列化订单项 extras 失败:', idx, err);
              // 如果序列化失败，尝试清理可能有问题的字段
              try {
                const cleanedObj = {};
                Object.keys(extraObj).forEach(k => {
                  const v = extraObj[k];
                  // 只保存可以序列化的值
                  if (v !== undefined && v !== null && typeof v !== 'function' && typeof v !== 'symbol') {
                    cleanedObj[k] = v;
                  }
                });
                itemExtras = Object.keys(cleanedObj).length > 0 ? JSON.stringify(cleanedObj) : null;
              } catch(cleanErr) {
                console.error('[DB] 清理订单项 extras 后仍序列化失败:', idx, cleanErr);
                itemExtras = null;
              }
            }
            console.log('[DB] updateOrder 订单项 extras 最终值:', idx, itemExtras);
            
            try { console.log('updateOrder insert item', idx, { model: it.model, quantity, packages, weight, actualWeight, unit: it.unit, marks: it.marks }); } catch(_){}
            
            try {
              insertItemStmt.run([id, Number(it.sortIndex != null ? it.sortIndex : idx), it.model || '', quantity, packages, weight, actualWeight, it.packing || '', labelWeight, it.safetyFactor || '', it.cleanliness || '', it.unit || '', unitPrice, amount, it.labelBatchNo || '', it.label || '', itemExtras], function(ei){
                if (ei && !hasError) { 
                  hasError = true;
                  console.error('[DB] 插入订单项失败:', idx, '错误详情:', {
                    message: ei.message,
                    code: ei.code,
                    errno: ei.errno,
                    stack: ei.stack
                  });
                  insertItemStmt.finalize();
                  db.run('ROLLBACK', function(rollbackErr) {
                    if (rollbackErr) {
                      console.error('[DB] 回滚事务失败:', rollbackErr);
                    }
                    cb(new Error('插入订单项失败: ' + (ei.message || ei)));
                  });
                  return;
                }
                
                pending--; 
                if (pending === 0 && !hasError) { 
                  insertItemStmt.finalize();
                  db.run('COMMIT', function(err) {
                    if (err && isTransactionInactiveError(err)) {
                      console.warn('[DB] COMMIT 返回非活动事务提示（更新订单-含订单项），视为成功:', err.message);
                      err = null;
                    }
                    if (err) {
                      console.error('[DB] 提交事务失败:', err);
                      return cb(err);
                    }
                    getOrder(id, cb);
                  });
                }
              });
            } catch (err) {
              if (!hasError) {
                hasError = true;
                console.error('[DB] 插入订单项异常:', idx, '异常详情:', {
                  message: err.message,
                  stack: err.stack,
                  name: err.name
                });
                insertItemStmt.finalize();
                db.run('ROLLBACK', function(rollbackErr) {
                  if (rollbackErr) {
                    console.error('[DB] 回滚事务失败:', rollbackErr);
                  }
                  cb(new Error('插入订单项异常: ' + err.message));
                });
              }
            }
          });
        });
      });
    } // continueUpdateTransaction 函数结束
  } catch (err) {
    console.error('[DB] updateOrder 异常:', err);
    return cb(new Error('更新订单异常: ' + err.message));
  }
}

/**
 * 删除订单
 */
function deleteOrder(id, cb) {
  const timestamp = new Date().toISOString();
  console.log(`[DB] ${timestamp} - 开始软删除订单 - ID: ${id}`);
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 先查询订单是否存在且未删除
    db.get('SELECT id FROM orders WHERE (id = ? OR rowid = ?) AND (deletedAt IS NULL OR deletedAt = "")', [id, id], function(err, row) {
      if (err) {
        console.log(`[DB] ${timestamp} - 查询订单失败 - ID: ${id} - 错误: ${err.message}`);
        db.run('ROLLBACK');
        return cb(err);
      }
      
      if (!row) {
        console.log(`[DB] ${timestamp} - 订单不存在或已删除 - ID: ${id}`);
        db.run('ROLLBACK');
        return cb(new Error('订单不存在或已删除'));
      }
      
      // 软删除：更新deletedAt字段
      db.run('UPDATE orders SET deletedAt = ? WHERE id = ? OR rowid = ?', [timestamp, id, id], function(e2){
        if (e2) { 
          console.log(`[DB] ${timestamp} - 软删除订单失败 - ID: ${id} - 错误: ${e2.message}`);
          db.run('ROLLBACK'); 
          return cb(e2); 
        }
        
        if (this.changes === 0) {
          console.log(`[DB] ${timestamp} - 订单软删除无影响 - ID: ${id}`);
          db.run('ROLLBACK');
          return cb(new Error('订单软删除失败，未找到匹配记录'));
        }
        
        console.log(`[DB] ${timestamp} - 软删除订单成功 - ID: ${id} - 影响行数: ${this.changes} - deletedAt: ${timestamp}`);
        
        // 验证删除是否成功：查询更新后的记录
        db.get('SELECT id, deletedAt FROM orders WHERE id = ? OR rowid = ?', [id, id], (err, row) => {
          if (err) {
            console.warn(`[DB] ${timestamp} - 验证删除状态失败 - ID: ${id}:`, err.message);
          } else if (row) {
            console.log(`[DB] ${timestamp} - 验证删除状态 - ID: ${id} - deletedAt: ${row.deletedAt}`);
          }
        });
        db.run('COMMIT', function(err) {
          if (err && isTransactionInactiveError(err)) {
            console.warn('[DB] COMMIT 返回非活动事务提示（软删除订单），视为成功:', err.message);
            err = null;
          }
          if (err) {
            console.error('[DB] 软删除订单提交事务失败:', err);
            return cb(err);
          }
          cb(null, { 
            success: true, 
            deletedId: id,
            affectedRows: this.changes,
            timestamp: timestamp
          });
        }); 
      });
    });
  });
}

/**
 * 恢复已删除的订单
 */
function restoreOrder(id, cb) {
  const timestamp = new Date().toISOString();
  console.log(`[DB] ${timestamp} - 开始恢复订单 - ID: ${id}`);
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 先查询订单是否存在且已删除
    db.get('SELECT id FROM orders WHERE (id = ? OR rowid = ?) AND deletedAt IS NOT NULL AND deletedAt != ""', [id, id], function(err, row) {
      if (err) {
        console.log(`[DB] ${timestamp} - 查询订单失败 - ID: ${id} - 错误: ${err.message}`);
        db.run('ROLLBACK');
        return cb(err);
      }
      
      if (!row) {
        console.log(`[DB] ${timestamp} - 订单不存在或未删除 - ID: ${id}`);
        db.run('ROLLBACK');
        return cb(new Error('订单不存在或未删除'));
      }
      
      // 恢复订单：清除deletedAt字段
      db.run('UPDATE orders SET deletedAt = NULL WHERE id = ? OR rowid = ?', [id, id], function(e2){
        if (e2) { 
          console.log(`[DB] ${timestamp} - 恢复订单失败 - ID: ${id} - 错误: ${e2.message}`);
          db.run('ROLLBACK'); 
          return cb(e2); 
        }
        
        if (this.changes === 0) {
          console.log(`[DB] ${timestamp} - 恢复订单无影响 - ID: ${id}`);
          db.run('ROLLBACK');
          return cb(new Error('恢复订单失败，未找到匹配记录'));
        }
        
        console.log(`[DB] ${timestamp} - 恢复订单成功 - ID: ${id} - 影响行数: ${this.changes}`);
        db.run('COMMIT', function(err) {
          if (err && isTransactionInactiveError(err)) {
            console.warn('[DB] COMMIT 返回非活动事务提示（恢复订单），视为成功:', err.message);
            err = null;
          }
          if (err) {
            console.error('[DB] 恢复订单提交事务失败:', err);
            return cb(err);
          }
          cb(null, { 
            success: true, 
            restoredId: id,
            affectedRows: this.changes,
            timestamp: timestamp
          });
        }); 
      });
    });
  });
}

/**
 * 获取已删除的订单列表
 */
function listDeletedOrders(options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  const { page, pageSize } = options || {};
  const hasPagination = page !== undefined && pageSize !== undefined;

  const baseQuery = `SELECT COALESCE(o.id, o.rowid) AS id, o.rowid,
                        o.contractNo, o.invoiceNo, o.blNo, o.invoiceDate, o.shipmentDate, o.shipFrom, o.shipTo, o.shippedPerSs, o.forwarder,
                        o.customerId, o.customerName, o.totalUSD, o.createdAt, o.updatedAt, o.productType, o.extras, o.status, o.deletedAt
                 FROM orders o
                 WHERE o.deletedAt IS NOT NULL AND o.deletedAt != '' AND TRIM(o.deletedAt) != ''
                 ORDER BY o.deletedAt DESC`;
  
  const countQuery = `SELECT COUNT(*) as total 
                      FROM orders
                      WHERE deletedAt IS NOT NULL AND deletedAt != '' AND TRIM(deletedAt) != ''`;

  if (hasPagination) {
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    db.get(countQuery, [], (err, countRow) => {
      if (err) return cb(err);
      const total = countRow.total;
      db.all(`${baseQuery} LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
        if (err) return cb(err);
        const parsed = (rows || []).map(r => ({ 
          ...r, 
          id: r.id || r.rowid,
          extras: parseJsonSafe(r.extras), 
          productType: r.productType || 1 
        }));
        cb(null, {
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(total / parseInt(pageSize)),
          data: parsed
        });
      });
    });
  } else {
    db.all(baseQuery, [], (err, rows) => {
      if (err) return cb(err);
      const parsed = (rows || []).map(r => ({ 
        ...r, 
        id: r.id || r.rowid,
        extras: parseJsonSafe(r.extras), 
        productType: r.productType || 1 
      }));
      cb(null, parsed);
    });
  }
}

/**
 * 彻底删除订单（物理删除，用于清理超过保留期的已删除订单）
 * @param {number|string} id - 订单ID
 * @param {Function} cb - 回调函数
 */
function permanentlyDeleteOrder(id, cb) {
  const timestamp = new Date().toISOString();
  console.log(`[DB] ${timestamp} - 开始彻底删除订单 - ID: ${id}`);
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 先查询订单是否存在
    db.get('SELECT id FROM orders WHERE id = ? OR rowid = ?', [id, id], function(err, row) {
      if (err) {
        console.log(`[DB] ${timestamp} - 查询订单失败 - ID: ${id} - 错误: ${err.message}`);
        db.run('ROLLBACK');
        return cb(err);
      }
      
      if (!row) {
        console.log(`[DB] ${timestamp} - 订单不存在 - ID: ${id}`);
        db.run('ROLLBACK');
        return cb(new Error('订单不存在'));
      }
      
      // 删除订单项
      db.run('DELETE FROM order_items WHERE orderId = ?', [id], function(e1){
        if (e1) { 
          console.log(`[DB] ${timestamp} - 删除订单项失败 - ID: ${id} - 错误: ${e1.message}`);
          db.run('ROLLBACK'); 
          return cb(e1); 
        }
        
        console.log(`[DB] ${timestamp} - 删除订单项成功 - ID: ${id} - 影响行数: ${this.changes}`);
        
        // 删除订单
        db.run('DELETE FROM orders WHERE id = ? OR rowid = ?', [id, id], function(e2){
          if (e2) { 
            console.log(`[DB] ${timestamp} - 彻底删除订单失败 - ID: ${id} - 错误: ${e2.message}`);
            db.run('ROLLBACK'); 
            return cb(e2); 
          }
          
          if (this.changes === 0) {
            console.log(`[DB] ${timestamp} - 彻底删除订单无影响 - ID: ${id}`);
            db.run('ROLLBACK');
            return cb(new Error('彻底删除订单失败，未找到匹配记录'));
          }
          
          console.log(`[DB] ${timestamp} - 彻底删除订单成功 - ID: ${id} - 影响行数: ${this.changes}`);
          db.run('COMMIT', function(err) {
            if (err && isTransactionInactiveError(err)) {
              console.warn('[DB] COMMIT 返回非活动事务提示（彻底删除订单），视为成功:', err.message);
              err = null;
            }
            if (err) {
              console.error('[DB] 彻底删除订单提交事务失败:', err);
              return cb(err);
            }
            cb(null, { 
              success: true, 
              deletedId: id,
              affectedRows: this.changes,
              timestamp: timestamp
            });
          }); 
        });
      });
    });
  });
}

/**
 * 清理超过指定天数的已删除订单
 * @param {number} days - 保留天数，默认7天
 * @param {Function} cb - 回调函数
 */
function cleanupExpiredDeletedOrders(days = 7, cb) {
  const timestamp = new Date().toISOString();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString();
  
  console.log(`[DB] ${timestamp} - 开始清理超过 ${days} 天的已删除订单 - 截止日期: ${cutoffDateStr}`);
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 查询需要清理的订单ID列表
    db.all('SELECT COALESCE(id, rowid) AS id FROM orders WHERE deletedAt IS NOT NULL AND deletedAt != "" AND deletedAt < ?', [cutoffDateStr], (err, rows) => {
      if (err) {
        console.error(`[DB] ${timestamp} - 查询过期已删除订单失败:`, err);
        db.run('ROLLBACK');
        return cb(err);
      }
      
      if (!rows || rows.length === 0) {
        console.log(`[DB] ${timestamp} - 没有需要清理的已删除订单`);
        db.run('ROLLBACK');
        return cb(null, { success: true, deletedCount: 0, deletedIds: [] });
      }
      
      const orderIds = rows.map(r => r.id);
      console.log(`[DB] ${timestamp} - 找到 ${orderIds.length} 个需要清理的已删除订单:`, orderIds);
      
      // 构建占位符字符串
      const placeholders = orderIds.map(() => '?').join(',');
      
      // 先删除订单项
      db.run(`DELETE FROM order_items WHERE orderId IN (${placeholders})`, orderIds, function(e1) {
        if (e1) {
          console.error(`[DB] ${timestamp} - 删除订单项失败:`, e1);
          db.run('ROLLBACK');
          return cb(e1);
        }
        
        const deletedItemsCount = this.changes;
        console.log(`[DB] ${timestamp} - 删除订单项成功，影响行数: ${deletedItemsCount}`);
        
        // 再删除订单
        db.run(`DELETE FROM orders WHERE (id IN (${placeholders}) OR rowid IN (${placeholders})) AND deletedAt IS NOT NULL AND deletedAt != "" AND deletedAt < ?`, [...orderIds, ...orderIds, cutoffDateStr], function(e2) {
          if (e2) {
            console.error(`[DB] ${timestamp} - 删除订单失败:`, e2);
            db.run('ROLLBACK');
            return cb(e2);
          }
          
          const deletedOrdersCount = this.changes;
          console.log(`[DB] ${timestamp} - 删除订单成功，影响行数: ${deletedOrdersCount}`);
          
          // 提交事务
          db.run('COMMIT', function(err) {
            if (err && isTransactionInactiveError(err)) {
              console.warn('[DB] COMMIT 返回非活动事务提示（清理过期订单），视为成功:', err.message);
              err = null;
            }
            if (err) {
              console.error('[DB] 清理过期订单提交事务失败:', err);
              return cb(err);
            }
            console.log(`[DB] ${timestamp} - 清理完成，成功删除 ${deletedOrdersCount} 个过期订单`);
            cb(null, { 
              success: true, 
              deletedCount: deletedOrdersCount, 
              deletedItemsCount: deletedItemsCount,
              deletedIds: orderIds,
              timestamp: timestamp
            });
          });
        });
      });
    });
  });
}

module.exports = {
  listOrders,
  listDeletedOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  restoreOrder,
  permanentlyDeleteOrder,
  cleanupExpiredDeletedOrders
};
