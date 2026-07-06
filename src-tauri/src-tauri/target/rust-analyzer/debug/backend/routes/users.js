const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole, logOperation } = require('../middleware/auth');
const { validateUser, validateUserUpdate, validateId } = require('../middleware/validation');

// 认证中间件
router.use(authenticate);

// 获取用户列表 - 允许所有已登录用户查看
router.get('/', (req, res) => {
  db.listUsers((err, users) => {
    if (err) {
      console.error('[Users] 获取用户列表失败:', err);
      return res.json({ success: false, message: '获取用户列表失败' });
    }

    res.json({ success: true, data: users });
  });
});

// 获取单个用户 - 允许所有已登录用户查看
router.get('/:id', validateId, (req, res) => {
  const id = parseInt(req.params.id);

  db.getUser(id, (err, user) => {
    if (err) {
      console.error('[Users] 获取用户失败:', err);
      return res.json({ success: false, message: '获取用户失败' });
    }

    if (!user) {
      return res.json({ success: false, message: '用户不存在' });
    }

    res.json({ success: true, data: user });
  });
});

// 修改操作需要管理员权限
router.use(requireRole('admin'));



// 创建用户
router.post('/', validateUser, logOperation('用户管理', '创建用户'), (req, res) => {
  const { username, password, displayName, avatar, role } = req.body;

  // 注意：validateUser 中的密码验证是可选的（optional），这里需要额外检查
  if (!password || password.length < 6) {
    return res.json({ success: false, message: '密码不能为空且长度不能少于6位' });
  }

  db.createUser({
    username,
    password,
    displayName: displayName || username,
    avatar: avatar || null,
    role: role || 'user',
    createdBy: req.user.id
  }, (err, user) => {
    if (err) {
      console.error('[Users] 创建用户失败:', err);
      return res.json({ success: false, message: err.message || '创建用户失败' });
    }

    res.json({ success: true, message: '创建成功', data: user });
  });
});

// 更新用户
router.put('/:id', validateId, validateUserUpdate, logOperation('用户管理', '更新用户'), (req, res) => {
  const id = parseInt(req.params.id);
  const { displayName, avatar, role, status } = req.body;

  // 不能修改自己的状态
  if (id === req.user.id && status && status !== req.user.status) {
    return res.json({ success: false, message: '不能修改自己的状态' });
  }

  db.updateUser(id, {
    displayName,
    avatar,
    role,
    status
  }, (err, result) => {
    if (err) {
      console.error('[Users] 更新用户失败:', err);
      return res.json({ success: false, message: '更新失败' });
    }

    if (result.changes === 0) {
      return res.json({ success: false, message: '用户不存在' });
    }

    res.json({ success: true, message: '更新成功', data: result });
  });
});

// 重置用户密码
router.post('/:id/reset-password', validateId, logOperation('用户管理', '重置密码'), (req, res) => {
  const id = parseInt(req.params.id);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.json({ success: false, message: '密码不能为空且长度不能少于6位' });
  }

  db.updateUserPassword(id, newPassword, (err, result) => {
    if (err) {
      console.error('[Users] 重置密码失败:', err);
      return res.json({ success: false, message: '重置密码失败' });
    }

    if (result.changes === 0) {
      return res.json({ success: false, message: '用户不存在' });
    }

    // 删除该用户的所有会话
    db.deleteUserSessions(id, () => { });

    res.json({ success: true, message: '密码重置成功' });
  });
});

// 删除用户
router.delete('/:id', validateId, logOperation('用户管理', '删除用户'), (req, res) => {
  const id = parseInt(req.params.id);

  // 不能删除自己
  if (id === req.user.id) {
    return res.json({ success: false, message: '不能删除自己' });
  }

  // 不能删除admin用户
  db.getUser(id, (err, user) => {
    if (err || !user) {
      return res.json({ success: false, message: '用户不存在' });
    }

    if (user.username === 'admin') {
      return res.json({ success: false, message: '不能删除默认管理员账户' });
    }

    db.deleteUser(id, (err, result) => {
      if (err) {
        console.error('[Users] 删除用户失败:', err);
        return res.json({ success: false, message: '删除失败' });
      }

      if (result.changes === 0) {
        return res.json({ success: false, message: '用户不存在' });
      }

      // 删除该用户的所有会话
      db.deleteUserSessions(id, () => { });

      res.json({ success: true, message: '删除成功' });
    });
  });
});

module.exports = router;


