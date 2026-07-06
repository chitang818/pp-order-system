/**
 * 数据库初始化模块
 * 负责创建表、执行迁移、创建默认数据等
 */

const { db } = require('./connection');
const crypto = require('crypto'); // 用于密码加密

/**
 * 确保表包含所有必要列（轻量级迁移）
 */
function ensureColumns(table, defs, cb) {
  db.all(`PRAGMA table_info(${table})`, (err, rows) => {
    if (err) {
      console.error(`[DB] PRAGMA table_info error for ${table}:`, err);
      return cb && cb(err);
    }
    const existing = new Set((rows || []).map(r => r.name));
    const sqls = [];
    Object.keys(defs).forEach(name => {
      if (!existing.has(name)) {
        sqls.push(`ALTER TABLE ${table} ADD COLUMN ${name} ${defs[name]}`);
      }
    });

    if (!sqls.length) return cb && cb(null);

    db.serialize(() => {
      let pending = sqls.length;
      let hasError = false;
      sqls.forEach(sql => {
        db.run(sql, function (e) {
          if (e) {
            // 忽略字段已存在的错误
            if (!e.message.includes('duplicate column name')) {
              console.error(`[DB] Migration failed for ${table} with SQL "${sql}":`, e);
              hasError = true;
            }
          }
          pending--;
          if (pending === 0) {
            cb && cb(hasError ? new Error(`Migration failed for ${table}`) : null);
          }
        });
      });
    });
  });
}

/**
 * 历史库：products 仅 model UNIQUE → 改为 UNIQUE(model, productType)
 */
function migrateProductsCompositeUnique(cb) {
  db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='products'`, (err, row) => {
    if (err) return cb && cb(err);
    if (!row || !row.sql) return cb && cb(null);
    const s = row.sql;
    if (/\bUNIQUE\s*\(\s*model\s*,\s*productType\s*\)/i.test(s)) {
      return cb && cb(null);
    }
    const looksLegacy =
      /model\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(s) || /\bUNIQUE\s*\(\s*model\s*\)/i.test(s);
    if (!looksLegacy) {
      return cb && cb(null);
    }

    console.log('[DB] Migrating products table to UNIQUE(model, productType)...');
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE', (e0) => {
        if (e0) return cb && cb(e0);
      });
      db.run(
        `CREATE TABLE products_migrate (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT NOT NULL,
        description TEXT,
        estimatedWeight REAL,
        labelWeight REAL,
        safetyFactor TEXT,
        cleanliness TEXT,
        unit TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        source TEXT DEFAULT 'manual',
        actualWeight REAL,
        labelBatchNo TEXT,
        label TEXT,
        marks TEXT,
        template TEXT,
        productType INTEGER DEFAULT 1,
        UNIQUE(model, productType)
      )`,
        (e1) => {
          if (e1) {
            db.run('ROLLBACK', () => cb && cb(e1));
            return;
          }
          db.run(
            `INSERT INTO products_migrate (
          model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit,
          createdAt, updatedAt, source, actualWeight, labelBatchNo, label, marks, template, productType
        )
        SELECT
          trim(model), description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit,
          createdAt, updatedAt, source, actualWeight, labelBatchNo, label, marks, template,
          COALESCE(productType, 1)
        FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY trim(model), COALESCE(productType, 1)
            ORDER BY COALESCE(NULLIF(trim(updatedAt), ''), createdAt) DESC, id DESC
          ) AS rn
          FROM products
        ) WHERE rn = 1`,
            (e2) => {
              if (e2) {
                db.run('ROLLBACK', () => cb && cb(e2));
                return;
              }
              db.run('DROP TABLE products', (e3) => {
                if (e3) {
                  db.run('ROLLBACK', () => cb && cb(e3));
                  return;
                }
                db.run('ALTER TABLE products_migrate RENAME TO products', (e4) => {
                  if (e4) {
                    db.run('ROLLBACK', () => cb && cb(e4));
                    return;
                  }
                  db.run('CREATE INDEX IF NOT EXISTS idx_products_model ON products(model)');
                  db.run('CREATE INDEX IF NOT EXISTS idx_products_description ON products(description)');
                  db.run('CREATE INDEX IF NOT EXISTS idx_products_model_type ON products(model, productType)');
                  db.run('COMMIT', (e5) => {
                    if (e5) return cb && cb(e5);
                    console.log('[DB] products UNIQUE(model, productType) migration completed');
                    cb && cb(null);
                  });
                });
              });
            });
        });
    });
  });
}

/**
 * 数据库初始化函数
 * 创建所有必要的表，并执行数据迁移和默认数据创建
 */
function init(cb) {
  if (!db) {
    console.warn('[DB] 无法初始化数据库：连接对象不存在');
    return cb && cb(new Error('Database connection not established'));
  }
  db.serialize(() => {
    // 优化数据库性能配置
    // 开启 WAL 模式以提高并发性能
    db.run('PRAGMA journal_mode = WAL;', (err) => {
      if (err) console.warn('[DB] 开启 WAL 模式失败:', err.message);
    });

    // 优化同步模式（WAL模式下推荐NORMAL）
    db.run('PRAGMA synchronous = NORMAL;', (err) => {
      if (err) console.warn('[DB] 设置同步模式失败:', err.message);
    });

    // 增加缓存大小（默认2MB，增加到16MB）
    db.run('PRAGMA cache_size = -16384;', (err) => {
      if (err) console.warn('[DB] 设置缓存大小失败:', err.message);
    });

    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) console.warn('[DB] 启用外键约束失败:', err.message);
    });

    // 优化临时文件存储（使用内存）
    db.run('PRAGMA temp_store = MEMORY;', (err) => {
      if (err) console.warn('[DB] 设置临时存储失败:', err.message);
    });

    // 创建公司配置表
    db.run(`CREATE TABLE IF NOT EXISTS company (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      companyNameCN TEXT,
      companyNameEN TEXT,
      companyAddressCN TEXT,
      companyAddressEN TEXT,
      companyTel TEXT,
      companyFax TEXT,
      signAt TEXT,
      logoUrl TEXT,
      themeColor TEXT,
      fontSize INTEGER,
      headerProduction TEXT,
      headerInvoice TEXT,
      headerPacking TEXT,
      headerSales TEXT
    );`);

    // 创建客户表
    db.run(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT,
      tel TEXT,
      fax TEXT,
      contact TEXT
    );`);

    // 创建货代表
    db.run(`CREATE TABLE IF NOT EXISTS forwarders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT,
      tel TEXT,
      fax TEXT,
      contact TEXT,
      email TEXT,
      remarks TEXT
    );`);

    // 创建订单表
    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contractNo TEXT,
      invoiceNo TEXT,
      blNo TEXT,
      invoiceDate TEXT,
      shipmentDate TEXT,
      shipFrom TEXT,
      shipTo TEXT,
      shippedPerSs TEXT,
      forwarder TEXT,
      customerId INTEGER,
      customerName TEXT,
      totalUSD REAL,
      createdAt TEXT,
      updatedAt TEXT,
      productType INTEGER DEFAULT 1,
      extras TEXT,
      status TEXT DEFAULT '已创建',
      template TEXT,
      FOREIGN KEY(customerId) REFERENCES customers(id)
    );`);

    // 创建订单项目表
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      sortIndex INTEGER,
      model TEXT,
      quantity REAL,
      packages REAL,
      weight REAL,
      actualWeight REAL,
      packing TEXT,
      labelWeight REAL,
      safetyFactor TEXT,
      cleanliness TEXT,
      unit TEXT,
      unitPrice REAL,
      amount REAL,
      labelBatchNo TEXT,
      label TEXT,
      extras TEXT,
      FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE
    );`);

    // 创建产品表（型号 + 产品类型 联合唯一）
    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      description TEXT,
      estimatedWeight REAL,
      labelWeight REAL,
      safetyFactor TEXT,
      cleanliness TEXT,
      unit TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      source TEXT DEFAULT 'manual',
      actualWeight REAL,
      labelBatchNo TEXT,
      label TEXT,
      marks TEXT,
      template TEXT,
      productType INTEGER DEFAULT 1,
      UNIQUE(model, productType)
    );`);

    // 创建用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      displayName TEXT,
      avatar TEXT,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'active',
      lastLoginAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy INTEGER,
      FOREIGN KEY(createdBy) REFERENCES users(id)
    );`);

    // 创建操作日志表
    db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      username TEXT,
      operation TEXT NOT NULL,
      module TEXT NOT NULL,
      target TEXT,
      details TEXT,
      ipAddress TEXT,
      userAgent TEXT,
      status TEXT DEFAULT 'success',
      errorMessage TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id)
    );`);

    // 创建会话表
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );`);

    // 创建单据模板表（新版单据中心）
    db.run(`CREATE TABLE IF NOT EXISTS document_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      version TEXT DEFAULT '1.0',
      config TEXT NOT NULL,
      isDefault INTEGER DEFAULT 0,
      createdBy INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(createdBy) REFERENCES users(id)
    );`);

    // 创建订单配置表
    db.run(`CREATE TABLE IF NOT EXISTS order_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      sortIndex INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );`);

    // 创建索引以优化搜索性能
    db.run(`CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_forwarders_name ON forwarders(name);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_products_model ON products(model);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_products_description ON products(description);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_products_model_type ON products(model, productType);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customerId);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(createdAt);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_orders_contract ON orders(contractNo);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_orders_invoice ON orders(invoiceNo);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(orderId);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_order_items_model ON order_items(model);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON operation_logs(createdAt);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_document_templates_type ON document_templates(type);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_document_templates_default ON document_templates(type, isDefault);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_order_configs_category ON order_configs(category);`);

    // 注意：订单参数配置不再在代码中初始化默认值
    // 所有订单参数配置内容只存储在数据库中，不保存在软件代码中
    // 初始化时会一起删除，备份时会一起备份，导入时会一并导入

    // 轻量级迁移：为已有数据库添加缺失列；完成后将 products 迁到 UNIQUE(model, productType)
    ensureColumns(
      'products',
      {
        actualWeight: 'REAL',
        labelBatchNo: 'TEXT',
        label: 'TEXT',
        marks: 'TEXT',
        source: 'TEXT DEFAULT "manual"',
        productType: 'INTEGER DEFAULT 1',
        template: 'TEXT'
      },
      (pcErr) => {
        if (pcErr) console.warn('[DB] ensureColumns products:', pcErr.message);
        const finishInit = (mErr) => {
          db.run('UPDATE customers SET id = rowid WHERE id IS NULL', function (e) {
            if (e) console.warn('Fix null customer id failed', e);
          });
          db.run('UPDATE products SET id = rowid WHERE id IS NULL', function (e) {
            if (e) console.warn('Fix null product id failed', e);
          });
          db.run('SELECT 1', [], function (err) {
            if (err) console.error('[DB] Init completion check failed:', err);
            cb && cb(pcErr || mErr || err || null);
          });
        };
        if (pcErr) {
          finishInit(null);
          return;
        }
        migrateProductsCompositeUnique((mErr) => {
          if (mErr) console.error('[DB] migrateProductsCompositeUnique:', mErr.message || mErr);
          finishInit(mErr);
        });
      }
    );
    ensureColumns('orders', {
      productType: 'INTEGER DEFAULT 1',
      extras: 'TEXT',
      status: 'TEXT DEFAULT "已创建"',
      forwarder: 'TEXT',
      paymentDate: 'TEXT',
      deletedAt: 'TEXT',
      template: 'TEXT'
    });
    ensureColumns('order_items', {
      actualWeight: 'REAL',
      labelBatchNo: 'TEXT',
      label: 'TEXT',
      extras: 'TEXT'
    });
    ensureColumns('users', {
      displayName: 'TEXT',
      avatar: 'TEXT',
      role: 'TEXT DEFAULT "user"',
      status: 'TEXT DEFAULT "active"',
      lastLoginAt: 'TEXT',
      createdBy: 'INTEGER'
    });
    ensureColumns('operation_logs', {
      userId: 'INTEGER',
      username: 'TEXT',
      operation: 'TEXT',
      module: 'TEXT',
      target: 'TEXT',
      details: 'TEXT',
      ipAddress: 'TEXT',
      userAgent: 'TEXT',
      status: 'TEXT',
      errorMessage: 'TEXT',
      createdAt: 'TEXT'
    });
    ensureColumns('sessions', {
      userId: 'INTEGER',
      token: 'TEXT',
      expiresAt: 'TEXT',
      ipAddress: 'TEXT',
      userAgent: 'TEXT',
      createdAt: 'TEXT'
    });

    // 初始化完成回调在 ensureColumns('products') → migrateProductsCompositeUnique 链末尾触发
  });
}

module.exports = {
  init
};
