const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

// 已登录用户自动下发 CSRF Cookie（若不存在）
function ensureCsrfCookieIfAuthenticated(req, res, next) {
  try {
    if (req.user) {
      const existingToken = req.cookies?.csrf_token;

      // 如果没有 csrf_token cookie 或者 cookie 值为空，设置一个新的
      if (!existingToken) {
        const token = generateCsrfToken();
        logger.info('[CSRF] 为已认证用户设置 CSRF cookie:', {
          userId: req.user.id,
          username: req.user.username,
          path: req.path
        });
        res.cookie('csrf_token', token, {
          httpOnly: false, // 双重提交策略要求前端可读
          sameSite: 'lax',
          secure: config.nodeEnv !== 'development',
          maxAge: 7 * 24 * 60 * 60 * 1000
        });
      }
    }
  } catch (e) {
    logger.error('[CSRF] 设置 CSRF cookie 失败:', e);
  }
  next();
}

// 针对写操作的 CSRF 保护（仅在已认证用户时启用）
function protectIfAuthenticated(req, res, next) {
  const method = req.method.toUpperCase();
  const isWrite = method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';

  // 排除登录和注册端点，这些端点不需要 CSRF token（用户尚未登录）
  // 注意：req.path 在中间件中是完整路径（如 /api/auth/login），req.originalUrl 也是完整路径
  const isAuthEndpoint = req.path.includes('/auth/login') || req.path.includes('/auth/register') || req.path.includes('/auth/logout');

  if (!isWrite || !req.user || isAuthEndpoint) {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
  const cookieToken = req.cookies?.csrf_token;

  logger.info('[CSRF] 验证 CSRF token:', {
    path: req.path,
    method: method,
    hasHeaderToken: !!headerToken,
    hasCookieToken: !!cookieToken,
    tokensMatch: headerToken === cookieToken,
    userId: req.user?.id
  });

  // Tauri 桌面环境下的特殊处理：

  // 1. Header-Only 模式 (现有逻辑，用于某些无法携带 Cookie 的场景)
  // 由于跨域限制，cookie 可能无法发送，此时只要 header token 存在且有效即可
  // 判断依据：如果有 header token 但没有 cookie token，且 header token 格式正确（48位十六进制）
  const isTauriHeaderOnly = headerToken && !cookieToken && /^[a-f0-9]{48}$/.test(headerToken);

  if (isTauriHeaderOnly) {
    // Tauri 环境：只检查 header token 是否存在且格式正确
    logger.info('[CSRF] Tauri 环境检测到 (Header Token Only)，验证通过');
    return next();
  }

  // 2. Authorization Header 模式 (修复方案 - 最终版)
  // 如果请求包含 Authorization 头 (Bearer Token)，说明这是前端显式发送的 API 请求。
  // CSRF 攻击无法强迫浏览器发送自定义 Header，因此这是安全的。
  // 这绕过了 Tauri 环境下 Cookie 丢失/跨域的问题。
  if (req.headers['authorization']) {
    logger.info('[CSRF] 检测到 Authorization Header，认为安全，跳过 CSRF 检查');
    return next();
  }

  // 3. Origin-Trust 模式 (备用)
  // 当在 Tauri 环境中，前端无法读取 Cookie 来设置 Header (因为HttpOnly或跨域)，但浏览器会自动发送 Cookie。
  // 如果请求来自受信任的 Tauri/开发源，且包含有效的 Session Cookie，我们信任该请求。
  const origin = req.headers['origin'] || '';
  const isTrustedOrigin = origin.startsWith('tauri://') ||
    origin.startsWith('http://localhost:5173') ||
    origin.startsWith('http://127.0.0.1:5173');

  if (isTrustedOrigin && cookieToken) {
    logger.info('[CSRF] Tauri/开发环境检测到 (Trusted Origin + Cookie)，验证通过', { origin });
    return next();
  }

  // 标准 Web 环境：要求 header 和 cookie 都存在且匹配
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    logger.warn('[CSRF] CSRF 验证失败:', {
      path: req.path,
      headerToken: headerToken ? '***' + headerToken.slice(-6) : 'missing',
      cookieToken: cookieToken ? '***' + cookieToken.slice(-6) : 'missing',
      match: headerToken === cookieToken,
      origin: origin
    });
    return res.status(403).json({ success: false, error: 'CSRF_TOKEN_INVALID', message: 'CSRF 校验失败' });
  }
  next();
}

module.exports = {
  ensureCsrfCookieIfAuthenticated,
  protectIfAuthenticated,
  generateCsrfToken
};