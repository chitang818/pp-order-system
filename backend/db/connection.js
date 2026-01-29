/**
 * 数据库连接管理
 * 负责数据库连接的创建和管理
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../utils/logger');

const ROOT = __dirname;
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'config.json');

/**
 * 确保目录存在
 */
function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch (e) { }
}

/**
 * 读取数据库路径
 * 优先级：环境变量 > 配置文件 > 默认路径
 */
function readDbPath() {
  // 环境变量优先：支持通过 DB_PATH 覆盖数据库路径
  try {
    const envPath = process.env && process.env.DB_PATH ? String(process.env.DB_PATH).trim() : '';
    if (envPath) {
      // 强制使用绝对路径。如果是从 Rust 传过来的，应该是绝对路径。
      // 不再尝试与项目根目录拼接，以保证开发生产环境一致。
      const resolvedPath = path.resolve(envPath);
      logger.info('[DB] 使用环境变量 DB_PATH:', resolvedPath);
      return resolvedPath;
    }
  } catch (e) {
    logger.warn('[DB] 读取环境变量 DB_PATH 失败:', e);
  }

  // 如果环境变量未设置，才读取配置文件
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const obj = JSON.parse(raw || '{}');
      if (obj && obj.dbPath && typeof obj.dbPath === 'string') {
        const s = String(obj.dbPath).trim().replace(/^['"]|['"]$/g, '');
        if (s) {
          // 如果是相对路径，相对于项目根目录解析
          const resolvedPath = path.isAbsolute(s) ? s : path.join(__dirname, '..', '..', s);
          logger.info('[DB] 使用配置文件 dbPath:', resolvedPath);
          return resolvedPath;
        }
      }
    }
  } catch (e) {
    logger.warn('[DB] 读取配置文件失败:', e);
  }

  // 默认使用项目 data 目录（跨平台统一）
  return path.join(__dirname, '..', '..', 'data', 'erp.sqlite');
}

const DB_PATH = readDbPath();
try {
  // 记录环境变量和最终使用的路径（用于调试）
  const envDbPath = process.env && process.env.DB_PATH ? String(process.env.DB_PATH).trim() : '(未设置)';
  logger.info('[DB] DB_PATH 环境变量:', envDbPath);
  logger.info('[DB] 最终使用的数据库路径:', DB_PATH);
  
  // 如果环境变量和最终路径不一致，给出警告
  if (envDbPath !== '(未设置)' && path.resolve(envDbPath) !== path.resolve(DB_PATH)) {
    logger.warn('[DB] 警告: 环境变量 DB_PATH 与最终使用的路径不一致');
    logger.warn('[DB] 环境变量:', envDbPath);
    logger.warn('[DB] 最终路径:', DB_PATH);
  }
} catch (_) { }

ensureDir(path.dirname(DB_PATH));

// 创建数据库连接并添加错误处理
const sqlite3Flags = sqlite3.OPEN_READWRITE; // 移除 OPEN_CREATE，防止自动创建

// 提供一个 Mock 对象防止服务在初始化 bind 时崩溃
const mockDb = {
  all: function () { logger.warn('[DB Mock] all called while DB not ready'); },
  get: function () { logger.warn('[DB Mock] get called while DB not ready'); },
  run: function () { logger.warn('[DB Mock] run called while DB not ready'); },
  each: function () { console.warn('[DB Mock] each called while DB not ready'); },
  exec: function () { logger.warn('[DB Mock] exec called while DB not ready'); },
  prepare: function () {
    logger.warn('[DB Mock] prepare called while DB not ready');
    return { run: () => { }, get: () => { }, all: () => { }, finalize: () => { } };
  },
  serialize: function (cb) { cb(); },
  close: function () { },
  isMock: true
};

let db = mockDb;

if (fs.existsSync(DB_PATH)) {
  try {
    db = new sqlite3.Database(DB_PATH, sqlite3Flags);
    logger.info('[DB] 成功连接到数据库:', DB_PATH);
  } catch (error) {
    console.error('[DB ERROR] 无法连接到数据库:', DB_PATH);
    console.error('[DB ERROR] 错误详情:', error.message);
    db = mockDb;
  }
} else {
  logger.info('[DB] 数据库文件尚不存在，Node.js 后端进入等待模式:', DB_PATH);
  db = mockDb;
}

module.exports = {
  db,
  DB_PATH,
  getDbPath: () => DB_PATH
};
