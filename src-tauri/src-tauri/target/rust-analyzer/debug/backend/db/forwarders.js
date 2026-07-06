/**
 * 货代数据库操作模块
 * 基于客户管理模块创建，提供相同的CRUD功能
 */

const { db } = require('./connection');

/**
 * 获取货代列表（支持分页）
 * @param {Object} options - 查询选项（可选）
 * @param {number} options.page - 页码（默认：1）
 * @param {number} options.pageSize - 每页数量（默认：全部）
 * @param {Function} cb - 回调函数
 */
function listForwarders(options, cb) {
    // 支持两种调用方式：listForwarders(cb) 或 listForwarders(options, cb)
    if (typeof options === 'function') {
        cb = options;
        options = {};
    }

    const { page, pageSize } = options || {};
    const hasPagination = page !== undefined && pageSize !== undefined;

    const baseQuery = `SELECT 
    COALESCE(id, rowid) AS id, 
    name, 
    address, 
    tel, 
    fax, 
    contact,
    email,
    remarks
  FROM forwarders
  ORDER BY COALESCE(id, rowid) DESC`;

    if (hasPagination) {
        // 分页查询
        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const limit = parseInt(pageSize);

        // 先获取总数
        db.get('SELECT COUNT(*) as total FROM forwarders', (err, countRow) => {
            if (err) return cb(err);
            const total = countRow.total;

            // 再获取分页数据
            db.all(`${baseQuery} LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
                if (err) {
                    console.error('[DB] 查询货代列表失败:', err);
                    return cb(err);
                }
                cb(null, {
                    total,
                    page: parseInt(page),
                    pageSize: parseInt(pageSize),
                    totalPages: Math.ceil(total / parseInt(pageSize)),
                    data: rows || []
                });
            });
        });
    } else {
        // 不分页，返回所有数据（保持向后兼容）
        db.all(baseQuery, (err, rows) => {
            if (err) {
                console.error('[DB] 查询货代列表失败:', err);
                return cb(err);
            }
            cb(null, rows);
        });
    }
}

/**
 * 获取单个货代
 */
function getForwarder(id, cb) {
    const query = `SELECT 
    COALESCE(id, rowid) AS id, 
    name, 
    address, 
    tel, 
    fax, 
    contact,
    email,
    remarks
  FROM forwarders
  WHERE COALESCE(id, rowid) = ?`;

    db.get(query, [id], cb);
}

/**
 * 创建货代
 */
function createForwarder(payload, cb) {
    const name = (payload && payload.name !== undefined && payload.name !== null) ? String(payload.name).trim() : '';
    const address = (payload && payload.address !== undefined && payload.address !== null) ? String(payload.address).trim() : '';
    const tel = (payload && payload.tel !== undefined && payload.tel !== null) ? String(payload.tel).trim() : '';
    const fax = (payload && payload.fax !== undefined && payload.fax !== null) ? String(payload.fax).trim() : '';
    const contact = (payload && payload.contact !== undefined && payload.contact !== null) ? String(payload.contact).trim() : '';
    const email = (payload && payload.email !== undefined && payload.email !== null) ? String(payload.email).trim() : '';
    const remarks = (payload && payload.remarks !== undefined && payload.remarks !== null) ? String(payload.remarks).trim() : '';

    // 验证必填字段
    if (!name || name === '') {
        return cb({ code: 'VALIDATION_ERROR', message: 'Forwarder name is required' });
    }

    // 重复校验：按名称唯一（不区分大小写）
    db.get('SELECT id FROM forwarders WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [name], (e, row) => {
        if (e) return cb(e);
        if (row) return cb({ code: 'DUPLICATE', message: 'Duplicate forwarder name' });
        db.run('INSERT INTO forwarders (name, address, tel, fax, contact, email, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, address, tel, fax, contact, email, remarks], function (err) {
                if (err) return cb(err);
                getForwarder(this.lastID, cb);
            });
    });
}

/**
 * 更新货代
 */
function updateForwarder(id, data, callback) {
    if (!data || typeof data !== 'object') {
        return callback(new Error('Invalid data'));
    }

    // 输入验证和数据清理
    const cleanData = {};
    if (data.name !== undefined) {
        cleanData.name = String(data.name || '').trim();
        // 如果提供了name字段但为空，则返回验证错误
        if (cleanData.name === '') {
            const err = new Error('货代名称不能为空');
            err.code = 'VALIDATION_ERROR';
            return callback(err);
        }
    }
    if (data.address !== undefined) cleanData.address = String(data.address || '').trim();
    if (data.tel !== undefined) cleanData.tel = String(data.tel || '').trim();
    if (data.fax !== undefined) cleanData.fax = String(data.fax || '').trim();
    if (data.contact !== undefined) cleanData.contact = String(data.contact || '').trim();
    if (data.email !== undefined) cleanData.email = String(data.email || '').trim();
    if (data.remarks !== undefined) cleanData.remarks = String(data.remarks || '').trim();

    const fields = Object.keys(cleanData);
    if (fields.length === 0) {
        return callback(new Error('No valid fields to update'));
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => cleanData[f]);
    values.push(id);

    db.run(`UPDATE forwarders SET ${setClause} WHERE id = ?`, values, function (err) {
        if (err) return callback(err);
        if (this.changes === 0) {
            return callback(null, null);
        }

        db.get('SELECT * FROM forwarders WHERE id = ?', [id], callback);
    });
}

/**
 * 删除货代
 */
function deleteForwarder(id, cb) {
    db.run('DELETE FROM forwarders WHERE id = ?', [id], function (err) {
        cb(err, this.changes > 0);
    });
}

/**
 * 清空所有货代
 */
function clearForwarders(cb) {
    db.run('DELETE FROM forwarders', function (err) {
        cb(err, this.changes >= 0);
    });
}

module.exports = {
    listForwarders,
    getForwarder,
    createForwarder,
    updateForwarder,
    deleteForwarder,
    clearForwarders
};
