/**
 * API速率限制中间件
 * 防止API滥用和暴力破解
 */

const rateLimit = require('express-rate-limit');

// 通用速率限制
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 最多100个请求
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 登录接口限制（更严格）
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 15分钟内最多5次登录尝试
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: '登录尝试次数过多，请15分钟后再试'
  }
});

// 导出接口限制
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 10, // 最多10次导出
  message: {
    success: false,
    error: '导出次数已达上限，请1小时后再试'
  }
});

// IP黑名单
const ipBlacklist = new Set();

function blacklistMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  
  if (ipBlacklist.has(ip)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }
  
  next();
}

function addToBlacklist(ip, duration = 3600000) {
  ipBlacklist.add(ip);
  setTimeout(() => ipBlacklist.delete(ip), duration);
}

module.exports = {
  generalLimiter,
  loginLimiter,
  exportLimiter,
  blacklistMiddleware,
  addToBlacklist
};
