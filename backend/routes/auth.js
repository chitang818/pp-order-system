const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { authenticate, optionalAuth, requireRole, logOperation } = require('../middleware/auth');

// 生成随机token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 登录
router.post('/login', logOperation('认证', '用户登录'), (req, res) => {
  try {
    // 确保请求体已解析
    if (!req.body) {
      console.error('[Auth] 请求体未解析');
      return res.status(400).json({ success: false, message: '请求格式错误' });
    }
    
    const { username, password, rememberMe } = req.body;
    
    if (!username || !password) {
      return res.json({ success: false, message: '用户名和密码不能为空' });
    }
    
    // 查询用户
    db.getUserByUsername(username, (err, user) => {
      if (err) {
        console.error('[Auth] 查询用户失败:', err);
        console.error('[Auth] 错误详情:', err.message, err.stack);
        // 确保响应还未发送
        if (!res.headersSent) {
        return res.status(500).json({ success: false, message: '登录失败：服务器错误' });
        }
        return;
      }
      
      if (!user) {
        if (!res.headersSent) {
        return res.json({ success: false, message: '用户名或密码错误' });
        }
        return;
      }
      
      if (user.status !== 'active') {
        if (!res.headersSent) {
        return res.json({ success: false, message: '用户已被禁用' });
        }
        return;
      }
      
      // 验证密码
      try {
      const isValid = db.verifyPassword(password, user.password);
      
      if (!isValid) {
          if (!res.headersSent) {
        return res.json({ success: false, message: '用户名或密码错误' });
          }
          return;
        }
      } catch (verifyError) {
        console.error('[Auth] 验证密码失败:', verifyError);
        if (!res.headersSent) {
          return res.status(500).json({ success: false, message: '登录失败：密码验证错误' });
        }
        return;
      }
      
      // 生成会话token
      const token = generateToken();
      const expiresIn = rememberMe ? 30 : 7; // 记住我：30天，否则7天
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresIn);
      
      // 创建会话
      db.createSession({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown'
      }, (err) => {
        if (err) {
          console.error('[Auth] 创建会话失败:', err);
          console.error('[Auth] 创建会话错误详情:', err.message, err.stack);
          // 确保响应还未发送
          if (!res.headersSent) {
            return res.status(500).json({ success: false, message: '登录失败：创建会话失败', error: err.message });
        }
          return;
        }
        
        try {
        // 更新最后登录时间
        db.updateUserLastLogin(user.id, () => {});
        
        // 设置 HttpOnly Cookie（保持兼容：仍返回 token）
        res.cookie('token', token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.nodeEnv !== 'development',
          expires: expiresAt
        });

        // 下发 CSRF Cookie（双重提交策略，前端可读取并附加到写操作请求头）
        const csrfToken = crypto.randomBytes(24).toString('hex');
        res.cookie('csrf_token', csrfToken, {
          httpOnly: false,
          sameSite: 'lax',
          secure: config.nodeEnv !== 'development',
          expires: expiresAt
        });

        // 返回用户信息和token（兼容旧前端逻辑）
          if (!res.headersSent) {
        res.json({
          success: true,
          message: '登录成功',
          data: {
            token,
            expiresAt: expiresAt.toISOString(),
            csrfToken,
            user: {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatar: user.avatar,
              role: user.role
            }
          }
        });
          }
        } catch (cookieError) {
          console.error('[Auth] 设置Cookie或返回响应失败:', cookieError);
          if (!res.headersSent) {
            return res.status(500).json({ success: false, message: '登录失败：设置Cookie失败' });
          }
        }
      });
    });
  } catch (error) {
    console.error('[Auth] 登录处理异常:', error);
    console.error('[Auth] 异常堆栈:', error.stack);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: '登录失败：服务器异常', error: error.message });
    }
  }
});

// 登出
router.post('/logout', authenticate, logOperation('认证', '用户登出'), (req, res) => {
  const token = req.token;
  
  db.deleteSession(token, (err) => {
    if (err) {
      console.error('[Auth] 删除会话失败:', err);
      return res.json({ success: false, message: '登出失败' });
    }

    // 清除 Cookie
    res.clearCookie('token');

    res.json({ success: true, message: '登出成功' });
  });
});

// 获取当前用户信息
router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      avatar: req.user.avatar,
      role: req.user.role,
      status: req.user.status,
      lastLoginAt: req.user.lastLoginAt
    }
  });
});

// 修改当前用户密码
router.post('/change-password', authenticate, logOperation('认证', '修改密码'), (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  if (!oldPassword || !newPassword) {
    return res.json({ success: false, message: '请输入旧密码和新密码' });
  }
  
  if (newPassword.length < 6) {
    return res.json({ success: false, message: '新密码长度不能少于6位' });
  }
  
  // 获取用户完整信息（包含密码）
  db.getUserByUsername(req.user.username, (err, user) => {
    if (err || !user) {
      return res.json({ success: false, message: '获取用户信息失败' });
    }
    
    // 验证旧密码
    const isValid = db.verifyPassword(oldPassword, user.password);
    
    if (!isValid) {
      return res.json({ success: false, message: '旧密码错误' });
    }
    
    // 更新密码
    db.updateUserPassword(user.id, newPassword, (err) => {
      if (err) {
        console.error('[Auth] 更新密码失败:', err);
        return res.json({ success: false, message: '修改密码失败' });
      }
      
      // 删除该用户的所有会话（强制重新登录）
      db.deleteUserSessions(user.id, () => {});
      
      res.json({ success: true, message: '密码修改成功，请重新登录' });
    });
  });
});

// 更新当前用户信息
router.put('/me', authenticate, logOperation('认证', '更新个人信息'), (req, res) => {
  const { displayName, avatar } = req.body;
  
  db.updateUser(req.user.id, {
    displayName: displayName || req.user.displayName,
    avatar: avatar !== undefined ? avatar : req.user.avatar,
    role: req.user.role,
    status: req.user.status
  }, (err, result) => {
    if (err) {
      console.error('[Auth] 更新用户信息失败:', err);
      return res.json({ success: false, message: '更新失败' });
    }
    
    res.json({ success: true, message: '更新成功', data: result });
  });
});

module.exports = router;


