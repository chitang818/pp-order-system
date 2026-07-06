/**
 * 结构化日志系统
 * 基于winston实现
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// 确保日志目录存在
const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 控制台格式（彩色输出）
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// 创建logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'pp-order-system' },
  transports: [
    // 错误日志 - 每日轮转
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true
    }),
    
    // 所有日志 - 每日轮转
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true
    }),
    
    // 控制台输出
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
    })
  ]
});

// 业务日志方法
logger.business = (action, details = {}) => {
  logger.info('Business Event', {
    type: 'business',
    action,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// 安全日志方法
logger.security = (event, details = {}) => {
  logger.warn('Security Event', {
    type: 'security',
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// 性能日志方法
logger.performance = (metric, value, details = {}) => {
  logger.info('Performance Metric', {
    type: 'performance',
    metric,
    value,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// 审计日志方法
logger.audit = (message, details = {}) => {
  logger.info('Audit Log', {
    type: 'audit',
    message,
    timestamp: new Date().toISOString(),
    ...details
  });
};

module.exports = logger;
