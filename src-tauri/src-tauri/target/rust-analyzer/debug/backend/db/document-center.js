/**
 * 单据中心数据访问层
 * 负责单据模板的数据库操作
 */

const db = require('./connection').db;

/**
 * 解析JSON安全函数（处理null和无效JSON）
 */
function parseJsonSafe(jsonStr) {
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('[DB] JSON解析失败:', e.message, '原始值:', jsonStr);
    return null;
  }
}

/**
 * 获取模板列表
 * @param {string} type - 模板类型筛选（可选）
 * @param {Function} cb - 回调函数
 */
function listTemplates(type, cb) {
  // 支持两种调用方式：listTemplates(cb) 或 listTemplates(type, cb)
  if (typeof type === 'function') {
    cb = type;
    type = null;
  }

  // 关联查询用户表，获取创建人用户名
  let query = `
    SELECT 
      dt.*,
      u.username as createdByUsername,
      u.displayName as createdByDisplayName
    FROM document_templates dt
    LEFT JOIN users u ON dt.createdBy = u.id
  `;
  const params = [];
  
  if (type) {
    query += ' WHERE dt.type = ?';
    params.push(type);
  }
  
  query += ' ORDER BY dt.createdAt DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) return cb(err);
    const templates = rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      version: row.version,
      config: parseJsonSafe(row.config),
      isDefault: row.isDefault === 1,
      createdBy: row.createdByUsername || row.createdByDisplayName || row.createdBy || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
    cb(null, templates);
  });
}

/**
 * 获取单个模板
 * @param {number} id - 模板ID
 * @param {Function} cb - 回调函数
 */
function getTemplate(id, cb) {
  // 关联查询用户表，获取创建人用户名
  db.get(`
    SELECT 
      dt.*,
      u.username as createdByUsername,
      u.displayName as createdByDisplayName
    FROM document_templates dt
    LEFT JOIN users u ON dt.createdBy = u.id
    WHERE dt.id = ?
  `, [id], (err, row) => {
    if (err) return cb(err);
    if (!row) return cb(null, null);
    cb(null, {
      id: row.id,
      name: row.name,
      type: row.type,
      version: row.version,
      config: parseJsonSafe(row.config),
      isDefault: row.isDefault === 1,
      createdBy: row.createdByUsername || row.createdByDisplayName || row.createdBy || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    });
  });
}

/**
 * 创建模板
 * @param {Object} data - 模板数据
 * @param {string} data.name - 模板名称
 * @param {string} data.type - 模板类型
 * @param {Object} data.config - 模板配置JSON
 * @param {boolean} data.isDefault - 是否默认模板
 * @param {number} data.createdBy - 创建人ID
 * @param {Function} cb - 回调函数
 */
function createTemplate(data, cb) {
  const { name, type, config, isDefault = false, createdBy } = data;
  const now = new Date().toISOString();
  const configJson = JSON.stringify(config);
  
  // 如果设为默认，先取消同类型其他模板的默认状态
  if (isDefault) {
    db.run('UPDATE document_templates SET isDefault = 0 WHERE type = ?', [type], (err) => {
      if (err) return cb(err);
      insertTemplate();
    });
  } else {
    insertTemplate();
  }
  
  function insertTemplate() {
    db.run(
      'INSERT INTO document_templates (name, type, config, isDefault, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, type, configJson, isDefault ? 1 : 0, createdBy, now, now],
      function(err) {
        if (err) return cb(err);
        getTemplate(this.lastID, cb);
      }
    );
  }
}

/**
 * 更新模板
 * @param {number} id - 模板ID
 * @param {Object} data - 更新数据
 * @param {string} data.name - 模板名称
 * @param {string} data.type - 模板类型
 * @param {Object} data.config - 模板配置JSON
 * @param {boolean} data.isDefault - 是否默认模板
 * @param {Function} cb - 回调函数
 */
function updateTemplate(id, data, cb) {
  const { name, type, config, isDefault } = data;
  const now = new Date().toISOString();
  const configJson = JSON.stringify(config);
  
  // 如果设为默认，先取消同类型其他模板的默认状态
  if (isDefault) {
    db.run('UPDATE document_templates SET isDefault = 0 WHERE type = ? AND id != ?', [type, id], (err) => {
      if (err) return cb(err);
      updateTemplateData();
    });
  } else {
    updateTemplateData();
  }
  
  function updateTemplateData() {
    console.log('[DB] 更新模板数据:', {
      id,
      name,
      type,
      configLength: configJson.length,
      isDefault,
      configPreview: configJson.substring(0, 200)
    });
    
    db.run(
      'UPDATE document_templates SET name = ?, type = ?, config = ?, isDefault = ?, updatedAt = ? WHERE id = ?',
      [name, type, configJson, isDefault ? 1 : 0, now, id],
      (err) => {
        if (err) {
          console.error('[DB] ❌ 更新模板失败:', err);
          return cb(err);
        }
        console.log('[DB] ✅ 模板更新成功，ID:', id, '影响行数:', this.changes);
        getTemplate(id, cb);
      }
    );
  }
}

/**
 * 删除模板
 * @param {number} id - 模板ID
 * @param {Function} cb - 回调函数
 */
function deleteTemplate(id, cb) {
  db.run('DELETE FROM document_templates WHERE id = ?', [id], (err) => {
    if (err) return cb(err);
    cb(null);
  });
}

/**
 * 删除所有模板
 * @param {Function} cb - 回调函数
 */
function deleteAllTemplates(cb) {
  db.run('DELETE FROM document_templates', [], function(err) {
    if (err) return cb(err);
    cb(null, this.changes); // 返回删除的行数
  });
}

/**
 * 获取默认模板
 * @param {string} type - 模板类型
 * @param {Function} cb - 回调函数
 */
function getDefaultTemplate(type, cb) {
  // 关联查询用户表，获取创建人用户名
  db.get(`
    SELECT 
      dt.*,
      u.username as createdByUsername,
      u.displayName as createdByDisplayName
    FROM document_templates dt
    LEFT JOIN users u ON dt.createdBy = u.id
    WHERE dt.type = ? AND dt.isDefault = 1
    LIMIT 1
  `, [type], (err, row) => {
    if (err) return cb(err);
    if (!row) return cb(null, null);
    cb(null, {
      id: row.id,
      name: row.name,
      type: row.type,
      version: row.version,
      config: parseJsonSafe(row.config),
      isDefault: true,
      createdBy: row.createdByUsername || row.createdByDisplayName || row.createdBy || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    });
  });
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  deleteAllTemplates,
  getDefaultTemplate
};

