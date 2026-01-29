const db = require('../db');
const logger = require('../utils/logger');

// 认证中间件 - 验证用户是否已登录
function authenticate(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.token;

  if (!token) {
    return res.status(401).json({ success: false, message: '未登录，请先登录' });
  }

  // 验证token
  db.getSessionByToken(token, (err, session) => {
    if (err) {
      logger.error('[Auth] 验证会话失败:', err);
      return res.status(500).json({ success: false, message: '验证失败' });
    }

    if (!session) {
      return res.status(401).json({ success: false, message: '会话不存在或已过期' });
    }

    // 检查会话是否过期
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);

    if (now > expiresAt) {
      // 删除过期会话
      db.deleteSession(token, () => { });
      return res.status(401).json({ success: false, message: '会话已过期，请重新登录' });
    }

    // 获取用户信息
    db.getUser(session.userId, (err, user) => {
      if (err) {
        logger.error('[Auth] 获取用户信息失败:', err);
        return res.status(500).json({ success: false, message: '获取用户信息失败' });
      }

      if (!user) {
        return res.status(401).json({ success: false, message: '用户不存在' });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: '用户已被禁用' });
      }

      // 将用户信息附加到请求对象
      req.user = user;
      req.token = token;
      next();
    });
  });
}

// 可选认证中间件 - 如果有token则验证，没有则继续
function optionalAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.token;

  if (!token) {
    return next();
  }

  db.getSessionByToken(token, (err, session) => {
    if (err || !session) {
      return next();
    }

    const now = new Date();
    const expiresAt = new Date(session.expiresAt);

    if (now > expiresAt) {
      return next();
    }

    db.getUser(session.userId, (err, user) => {
      if (!err && user && user.status === 'active') {
        req.user = user;
        req.token = token;
      }
      next();
    });
  });
}

// 权限检查中间件
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }

    next();
  };
}

// 操作日志记录中间件
function logOperation(module, operation) {
  return (req, res, next) => {
    // 保存原始的json方法
    const originalJson = res.json.bind(res);

    // 重写json方法以在响应后记录日志
    res.json = function (data) {
      // 先发送响应
      originalJson(data);

      // 异步记录日志（使用 try-catch 防止日志记录失败影响响应）
      setImmediate(() => {
        try {
          // 安全地获取请求体（可能还未解析）
          let requestBody = null;
          try {
            requestBody = sanitizeRequestBody(req.body);
          } catch (e) {
            // 如果解析失败，使用空对象
            requestBody = {};
          }

          const logData = {
            userId: req.user?.id || null,
            username: req.user?.username || req.body?.username || '匿名',
            operation,
            module,
            target: req.params?.id || req.body?.id || req.body?.contractNo || req.body?.model || null,
            details: JSON.stringify({
              method: req.method,
              path: req.path || req.url,
              body: requestBody,
              query: req.query || {}
            }),
            ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            status: data?.success ? 'success' : 'failure',
            errorMessage: data?.message || null
          };

          db.createOperationLog(logData, (err) => {
            if (err) {
              logger.error('[LogOperation] 记录操作日志失败:', err);
            }
          });
        } catch (error) {
          logger.error('[LogOperation] 记录操作日志异常:', error);
        }
      });
    };

    next();
  };
}

// 清理敏感信息（密码等）
function sanitizeRequestBody(body) {
  if (!body) return null;

  const sanitized = { ...body };

  // 移除敏感字段
  if (sanitized.password) {
    sanitized.password = '******';
  }
  if (sanitized.newPassword) {
    sanitized.newPassword = '******';
  }
  if (sanitized.oldPassword) {
    sanitized.oldPassword = '******';
  }

  return sanitized;
}

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  logOperation
};


