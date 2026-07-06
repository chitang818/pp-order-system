/**
 * 统一日志工具
 * 生产环境仅输出 warn 和 error 级别
 */

const config = require('../config');

const isDev = config.nodeEnv === 'development';

const logger = {
    debug: (...args) => {
        if (isDev) console.log('[DEBUG]', ...args);
    },

    info: (...args) => {
        if (isDev) console.log('[INFO]', ...args);
    },

    warn: (...args) => {
        console.warn('[WARN]', ...args);
    },

    error: (...args) => {
        console.error('[ERROR]', ...args);
    },

    // 审计日志（始终输出）
    audit: (...args) => {
        console.log('[AUDIT]', new Date().toISOString(), ...args);
    }
};

module.exports = logger;
