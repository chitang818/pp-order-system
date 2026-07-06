/**
 * 统一错误处理中间件
 * 提供统一的错误响应格式和处理逻辑
 */

/**
 * 错误处理中间件
 * 应作为最后一个中间件使用
 * 
 * @param {Error} err - 错误对象
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
function errorHandler(err, req, res, next) {
  // 默认错误信息
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = '服务器内部错误';
  let details = null;

  // 记录错误日志
  console.error('[Error Handler]', {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    error: {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    user: req.user ? { id: req.user.id, username: req.user.username } : null
  });

  // 根据错误类型设置状态码和错误码
  if (err.name === 'ValidationError' || err.code === 'VALIDATION_ERROR') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = err.message || '输入验证失败';
    details = err.details || null;
  } else if (err.code === 'DUPLICATE' || err.code === 'DUPLICATE_NAME') {
    statusCode = 409;
    errorCode = 'DUPLICATE';
    message = err.message || '数据重复';
  } else if (err.code === 'NOT_FOUND' || err.name === 'NotFoundError') {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    message = err.message || '资源不存在';
  } else if (err.code === 'UNAUTHORIZED' || err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    message = err.message || '未授权访问';
  } else if (err.code === 'FORBIDDEN' || err.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    message = err.message || '禁止访问';
  } else if (err.statusCode || err.status) {
    // 支持自定义状态码
    statusCode = err.statusCode || err.status;
    errorCode = err.code || 'CUSTOM_ERROR';
    message = err.message || '操作失败';
  } else if (err.message) {
    // 有错误消息但没有特定错误码
    message = err.message;
  }

  // 开发环境返回详细错误信息
  if (process.env.NODE_ENV === 'development') {
    details = {
      stack: err.stack,
      name: err.name
    };
  }

  // 统一错误响应格式
  const errorResponse = {
    success: false,
    error: errorCode,
    message: message
  };

  if (details) {
    errorResponse.details = details;
  }

  // 发送错误响应
  res.status(statusCode).json(errorResponse);
}

/**
 * 异步错误包装器
 * 将异步函数包装为 Express 中间件，自动捕获异常
 * 
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} Express 中间件函数
 * 
 * @example
 * app.get('/api/data', asyncHandler(async (req, res) => {
 *   const data = await fetchData();
 *   res.json(data);
 * }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 创建标准错误对象
 * 
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 * @param {number} statusCode - HTTP 状态码
 * @returns {Error} 错误对象
 */
function createError(message, code = 'CUSTOM_ERROR', statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * 创建验证错误
 */
function createValidationError(message, details = null) {
  const error = createError(message, 'VALIDATION_ERROR', 400);
  if (details) {
    error.details = details;
  }
  return error;
}

/**
 * 创建重复数据错误
 */
function createDuplicateError(message = '数据重复') {
  return createError(message, 'DUPLICATE', 409);
}

/**
 * 创建未找到错误
 */
function createNotFoundError(message = '资源不存在') {
  return createError(message, 'NOT_FOUND', 404);
}

/**
 * 创建未授权错误
 */
function createUnauthorizedError(message = '未授权访问') {
  return createError(message, 'UNAUTHORIZED', 401);
}

/**
 * 创建禁止访问错误
 */
function createForbiddenError(message = '禁止访问') {
  return createError(message, 'FORBIDDEN', 403);
}

module.exports = {
  errorHandler,
  asyncHandler,
  createError,
  createValidationError,
  createDuplicateError,
  createNotFoundError,
  createUnauthorizedError,
  createForbiddenError
};

