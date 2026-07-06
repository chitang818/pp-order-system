/**
 * 操作日志数据库操作模块
 */

const { db } = require('./connection');

/**
 * 记录操作日志
 */
function createOperationLog(payload, cb) {
  const { userId, username, operation, module, target, details, ipAddress, userAgent, status, errorMessage } = payload;
  const now = new Date().toISOString();
  
  db.run(
    'INSERT INTO operation_logs (userId, username, operation, module, target, details, ipAddress, userAgent, status, errorMessage, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [userId || null, username || null, operation, module, target || null, details || null, ipAddress || null, userAgent || null, status || 'success', errorMessage || null, now],
    function(err) {
      if (err) {
        console.error('[DB] 记录操作日志失败:', err);
        return cb && cb(err);
      }
      cb && cb(null, {
        id: this.lastID,
        createdAt: now
      });
    }
  );
}

/**
 * 获取操作日志列表（支持分页和筛选）
 */
function listOperationLogs(options, cb) {
  const { page = 1, pageSize = 50, module, userId, operation, startDate, endDate } = options;
  const offset = (page - 1) * pageSize;
  
  let whereConditions = [];
  let params = [];
  
  if (module) {
    whereConditions.push('module = ?');
    params.push(module);
  }
  if (userId) {
    whereConditions.push('userId = ?');
    params.push(userId);
  }
  if (operation) {
    whereConditions.push('operation = ?');
    params.push(operation);
  }
  if (startDate) {
    whereConditions.push('createdAt >= ?');
    params.push(startDate);
  }
  if (endDate) {
    whereConditions.push('createdAt <= ?');
    params.push(endDate);
  }
  
  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
  
  // 获取总数
  db.get(`SELECT COUNT(*) as total FROM operation_logs ${whereClause}`, params, (err, countRow) => {
    if (err) return cb(err);
    
    const total = countRow.total;
    
    // 获取列表
    const queryParams = [...params, pageSize, offset];
    db.all(
      `SELECT * FROM operation_logs ${whereClause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      queryParams,
      (err, rows) => {
        if (err) return cb(err);
        cb(null, {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
          data: rows || []
        });
      }
    );
  });
}

/**
 * 删除操作日志
 */
function deleteOperationLog(id, cb) {
  db.run('DELETE FROM operation_logs WHERE id = ?', [id], function(err) {
    if (err) return cb(err);
    cb(null, { changes: this.changes });
  });
}

/**
 * 清空操作日志
 */
function clearOperationLogs(cb) {
  db.run('DELETE FROM operation_logs', function(err) {
    if (err) return cb(err);
    cb(null, { changes: this.changes });
  });
}

/**
 * 清理旧的操作日志（保留最近N天）
 */
function cleanOldOperationLogs(days, cb) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString();
  
  db.run('DELETE FROM operation_logs WHERE createdAt < ?', [cutoffDateStr], function(err) {
    if (err) return cb(err);
    cb(null, { changes: this.changes });
  });
}

module.exports = {
  createOperationLog,
  listOperationLogs,
  deleteOperationLog,
  clearOperationLogs,
  cleanOldOperationLogs
};
