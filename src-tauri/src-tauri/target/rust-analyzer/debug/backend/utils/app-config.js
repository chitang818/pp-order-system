/**
 * App-level JSON config helper.
 *
 * 存放位置由 config.db.configPath 决定（生产环境为 Tauri AppData/config/config.json）。
 * 注意：不要在不同功能里“覆盖写”整个配置文件，必须 merge 更新，避免互相覆盖。
 */
const fs = require('fs');
const path = require('path');

function getConfigPath() {
  try {
    // 动态加载 config，避免循环依赖
    const config = require('../config');
    // 统一使用 config/index.js 计算出的 configPath（会随 CONFIG_ROOT 变化）
    const p = config?.db?.configPath;
    if (p) return String(p);
  } catch (_) { }
  
  // 兜底：项目目录 config/config.json
  return path.join(__dirname, '..', '..', 'config', 'config.json');
}

function ensureDirExists(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch (_) { }
}

function safeParseJson(raw) {
  try {
    const obj = JSON.parse(String(raw || '{}'));
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (_) {
    return {};
  }
}

function readConfig() {
  const filePath = getConfigPath();
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    return safeParseJson(raw);
  } catch (_) {
    return {};
  }
}

function writeConfig(nextObj) {
  const filePath = getConfigPath();
  ensureDirExists(filePath);
  fs.writeFileSync(filePath, JSON.stringify(nextObj || {}, null, 2), 'utf8');
  return true;
}

/**
 * 合并更新配置（浅合并）。
 * @param {Object} patch
 * @returns {Object} updated config
 */
function updateConfig(patch) {
  const current = readConfig();
  const next = Object.assign({}, current, patch || {});

  // 清理：显式传入 null/undefined 时删除对应 key（避免写入脏值）
  Object.keys(next).forEach((k) => {
    if (next[k] === undefined || next[k] === null) {
      delete next[k];
    }
  });

  writeConfig(next);
  return next;
}

module.exports = {
  getConfigPath,
  readConfig,
  writeConfig,
  updateConfig,
};
