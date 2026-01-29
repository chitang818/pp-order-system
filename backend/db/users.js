/**
 * 用户数据库操作模块
 */

const { db } = require('./connection');
const crypto = require('crypto');

/**
 * 创建用户
 */
function createUser(payload, cb) {
  const { username, password, displayName, avatar, role, createdBy } = payload;
  const now = new Date().toISOString();

  if (!username || !password) {
    return cb(new Error('用户名和密码不能为空'));
  }

  // 加密密码
  // 加密密码
  const saltBuf = crypto.randomBytes(16);
  const salt = saltBuf.toString('hex');
  const hash = crypto.pbkdf2Sync(password, saltBuf, 1000, 64, 'sha512').toString('hex');
  const passwordHash = `${salt}:${hash}`;

  db.run(
    'INSERT INTO users (username, password, displayName, avatar, role, status, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [username, passwordHash, displayName || username, avatar || null, role || 'user', 'active', now, now, createdBy || null],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return cb(new Error('用户名已存在'));
        }
        return cb(err);
      }
      cb(null, {
        id: this.lastID,
        username,
        displayName: displayName || username,
        avatar,
        role: role || 'user',
        status: 'active',
        createdAt: now,
        updatedAt: now
      });
    }
  );
}

/**
 * 获取所有用户
 */
function listUsers(cb) {
  db.all('SELECT id, username, displayName, avatar, role, status, lastLoginAt, createdAt, updatedAt FROM users ORDER BY createdAt DESC', (err, rows) => {
    if (err) return cb(err);
    cb(null, rows || []);
  });
}

/**
 * 获取单个用户
 */
function getUser(id, cb) {
  db.get('SELECT id, username, displayName, avatar, role, status, lastLoginAt, createdAt, updatedAt FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return cb(err);
    cb(null, row || null);
  });
}

/**
 * 根据用户名获取用户（包含密码，用于登录验证）
 */
function getUserByUsername(username, cb) {
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
    if (err) return cb(err);
    cb(null, row || null);
  });
}

/**
 * 更新用户
 */
function updateUser(id, payload, cb) {
  const { displayName, avatar, role, status } = payload;
  const now = new Date().toISOString();

  db.run(
    'UPDATE users SET displayName = ?, avatar = ?, role = ?, status = ?, updatedAt = ? WHERE id = ?',
    [displayName, avatar, role, status, now, id],
    function (err) {
      if (err) return cb(err);
      cb(null, { changes: this.changes });
    }
  );
}

/**
 * 更新用户密码
 */
function updateUserPassword(id, newPassword, cb) {
  const saltBuf = crypto.randomBytes(16);
  const salt = saltBuf.toString('hex');
  const hash = crypto.pbkdf2Sync(newPassword, saltBuf, 1000, 64, 'sha512').toString('hex');
  const passwordHash = `${salt}:${hash}`;
  const now = new Date().toISOString();

  db.run(
    'UPDATE users SET password = ?, updatedAt = ? WHERE id = ?',
    [passwordHash, now, id],
    function (err) {
      if (err) return cb(err);
      cb(null, { changes: this.changes });
    }
  );
}

/**
 * 更新用户最后登录时间
 */
function updateUserLastLogin(id, cb) {
  const now = new Date().toISOString();

  db.run(
    'UPDATE users SET lastLoginAt = ? WHERE id = ?',
    [now, id],
    function (err) {
      if (err) return cb(err);
      cb(null, { changes: this.changes });
    }
  );
}

/**
 * 删除用户
 */
function deleteUser(id, cb) {
  db.run('DELETE FROM users WHERE id = ?', [id], function (err) {
    if (err) return cb(err);
    cb(null, { changes: this.changes });
  });
}

/**
 * 验证密码
 */
function verifyPassword(password, passwordHash) {
  const [salt, hash] = passwordHash.split(':');
  const saltBuf = Buffer.from(salt, 'hex');
  const verifyHash = crypto.pbkdf2Sync(password, saltBuf, 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

module.exports = {
  createUser,
  listUsers,
  getUser,
  getUserByUsername,
  updateUser,
  updateUserPassword,
  updateUserLastLogin,
  deleteUser,
  verifyPassword
};
