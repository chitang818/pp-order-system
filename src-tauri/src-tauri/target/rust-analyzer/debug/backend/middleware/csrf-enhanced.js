/**
 * 增强的CSRF保护
 * 实现一次性token和过期机制
 */

const crypto = require('crypto');
const logger = require('../utils/structured-logger');

class CSRFProtection {
  constructor() {
    this.tokenStore = new Map();
    this.maxAge = 3600000; // 1小时
  }
  
  generateToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.maxAge;
    
    this.tokenStore.set(token, {
      sessionId,
      expiresAt,
      used: false
    });
    
    this.cleanExpired();
    
    return token;
  }
  
  validateToken(token, sessionId) {
    const tokenData = this.tokenStore.get(token);
    
    if (!tokenData) {
      logger.security('CSRF token not found', { token: token.substring(0, 8) });
      return { valid: false, reason: 'Token not found' };
    }
    
    if (tokenData.used) {
      logger.security('CSRF token already used', { token: token.substring(0, 8) });
      return { valid: false, reason: 'Token already used' };
    }
    
    if (tokenData.expiresAt < Date.now()) {
      this.tokenStore.delete(token);
      logger.security('CSRF token expired', { token: token.substring(0, 8) });
      return { valid: false, reason: 'Token expired' };
    }
    
    if (tokenData.sessionId !== sessionId) {
      logger.security('CSRF invalid session', { 
        token: token.substring(0, 8),
        expected: tokenData.sessionId,
        got: sessionId
      });
      return { valid: false, reason: 'Invalid session' };
    }
    
    // 标记token为已使用
    tokenData.used = true;
    
    return { valid: true };
  }
  
  cleanExpired() {
    const now = Date.now();
    for (const [token, data] of this.tokenStore.entries()) {
      if (data.expiresAt < now) {
        this.tokenStore.delete(token);
      }
    }
  }
  
  middleware() {
    return (req, res, next) => {
      if (req.method === 'GET') {
        return next();
      }
      
      const token = req.headers['x-csrf-token'] || req.body._csrf;
      const sessionId = req.session?.id;
      
      if (!sessionId) {
        return res.status(401).json({
          success: false,
          error: 'No session'
        });
      }
      
      const validation = this.validateToken(token, sessionId);
      if (!validation.valid) {
        logger.security('CSRF validation failed', {
          reason: validation.reason,
          ip: req.ip,
          path: req.path
        });
        
        return res.status(403).json({
          success: false,
          error: 'Invalid CSRF token',
          reason: validation.reason
        });
      }
      
      next();
    };
  }
}

const csrfProtection = new CSRFProtection();

// 定期清理过期token
setInterval(() => {
  csrfProtection.cleanExpired();
}, 60000); // 每分钟

module.exports = csrfProtection;
