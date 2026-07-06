/**
 * 会话数据库操作模块
 */

const { db } = require('./connection');

/**
 * 创建会话
 */
function createSession(payload, cb) {
  const { userId, token, expiresAt, ipAddress, userAgent } = payload;
  const now = new Date().toISOString();
  
  db.run(
    'INSERT INTO sessions (userId, token, expiresAt, ipAddress, userAgent, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, token, expiresAt, ipAddress || null, userAgent || null, now],
    function(err) {
      if (err) return cb(err);
      cb(null, {
        id: this.lastID,
        userId,
        token,
        expiresAt,
        createdAt: now
      });
    }
  );
}

/**
 * 根据token获取会话
 */
function getSessionByToken(token, cb) {
  db.get('SELECT * FROM sessions WHERE token = ? AND expiresAt > ?', [token, new Date().toISOString()], (err, row) => {
    if (err) return cb(err);
    cb(null, row || null);
  });
}

/**
 * 删除会话（登出）
 */
function deleteSession(token, cb) {
  db.run('DELETE FROM sessions WHERE token = ?', [token], function(err) {
    if (err) return cb(err);
    cb(null, { changes: this.changes });
  });
}

/**
 * 删除用户的所有会话
 */
function deleteUserSessions(userId, cb) {
  db.run('DELETE FROM sessions WHERE userId = ?', [userId], function(err) {
    if (err) return cb(err);
    cb(null, { changes: this.changes });
  });
}

/**
 * 清理过期会话
 */
function cleanExpiredSessions(cb) {
  const now = new Date().toISOString();
  db.run('DELETE FROM sessions WHERE expiresAt < ?', [now], function(err) {
    if (err) return cb(err);
    cb(null, { changes: this.changes });
  });
}

module.exports = {
  createSession,
  getSessionByToken,
  deleteSession,
  deleteUserSessions,
  cleanExpiredSessions
};
