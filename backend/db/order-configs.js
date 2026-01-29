/**
 * 订单配置数据库模块
 * 处理订单参数配置相关的数据库操作
 */

const { db } = require('./connection');

/**
 * 获取所有订单配置
 * @returns {Promise<Array>} 配置列表
 */
function listOrderConfigs() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM order_configs ORDER BY category, sortIndex ASC, id ASC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * 根据分类获取订单配置
 * @param {string} category - 配置分类
 * @returns {Promise<Array>} 该分类下的配置列表
 */
function getOrderConfigsByCategory(category) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM order_configs WHERE category = ? ORDER BY sortIndex ASC, id ASC', [category], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * 创建订单配置项
 * @param {Object} config - 配置对象 { category, value, sortIndex }
 * @returns {Promise<Object>} 创建的配置对象
 */
function createOrderConfig(config) {
  const { category, value, sortIndex = 0 } = config;
  const now = new Date().toISOString();
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      [category, value, sortIndex, now, now],
      function(err) {
        if (err) reject(err);
        else {
          resolve({ id: this.lastID, ...config, createdAt: now, updatedAt: now });
        }
      }
    );
  });
}

/**
 * 更新订单配置项
 * @param {number} id - 配置ID
 * @param {Object} config - 更新内容 { value, sortIndex }
 * @returns {Promise<boolean>} 是否成功
 */
function updateOrderConfig(id, config) {
  const { value, sortIndex } = config;
  const now = new Date().toISOString();
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE order_configs SET value = ?, sortIndex = ?, updatedAt = ? WHERE id = ?',
      [value, sortIndex, now, id],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

/**
 * 删除订单配置项
 * @param {number} id - 配置ID
 * @returns {Promise<boolean>} 是否成功
 */
function deleteOrderConfig(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM order_configs WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

/**
 * 批量获取多种分类的配置
 * @param {Array<string>} categories - 分类列表
 * @returns {Promise<Object>} 分类字典，如 { trade_term: [...], unit: [...] }
 */
async function getMultipleConfigs(categories) {
  const results = {};
  for (const cat of categories) {
    results[cat] = await getOrderConfigsByCategory(cat);
  }
  return results;
}

module.exports = {
  listOrderConfigs,
  getOrderConfigsByCategory,
  createOrderConfig,
  updateOrderConfig,
  deleteOrderConfig,
  getMultipleConfigs
};
