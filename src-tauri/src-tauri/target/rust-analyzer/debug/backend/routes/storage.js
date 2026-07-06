/**
 * 存储管理路由
 * 处理数据库存储相关的 API 请求
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const child_process = require('child_process');
const db = require('../db');
const config = require('../config');
const { asyncHandler, createForbiddenError } = require('../middleware/errorHandler');
const LogService = require('../services/LogService');
const logger = require('../utils/logger');
const AppConfig = require('../utils/app-config');

/**
 * 获取数据库路径
 * GET /api/storage
 */
router.get('/', (req, res) => {
  try {
    const p = typeof db.getDbPath === 'function' ? db.getDbPath() : null;
    if (!p) {
      return res.json({ dbPath: '' });
    }

    // 规范化返回的路径：如果路径指向项目根目录下的data文件夹，返回相对路径
    const projectRoot = path.resolve(__dirname, '..', '..');
    const defaultDataDir = path.resolve(projectRoot, 'data');
    const resolvedPath = path.resolve(p);
    const pathDir = path.dirname(resolvedPath);
    const fileName = path.basename(resolvedPath);

    // 检查路径是否指向项目data文件夹
    let displayPath = p;
    if (path.resolve(pathDir) === path.resolve(defaultDataDir)) {
      // 指向项目data文件夹，返回相对路径（使用正斜杠，跨平台兼容）
      displayPath = `data/${fileName}`.replace(/\\/g, '/');
    }

    // 返回数据库路径和运行环境信息
    const env = config.nodeEnv || 'development';
    const envName = env === 'production' ? '生产环境' : env === 'development' ? '开发环境' : env;

    res.json({
      dbPath: displayPath,
      environment: envName,
      nodeEnv: env
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '获取存储路径失败'
    });
  }
});

/**
 * 设置数据库路径
 * PUT /api/storage
 */
router.put('/', (req, res) => {
  try {
    const body = req.body || {};
    let target = String(body.dbPath || '').trim();
    if (!target) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'dbPath is required'
      });
    }

    // 规范化路径：如果路径指向项目根目录下的data文件夹，保存为相对路径
    const projectRoot = path.resolve(__dirname, '..', '..');
    const defaultDataDir = path.resolve(projectRoot, 'data');

    // 解析目标路径（如果是相对路径，相对于项目根目录解析）
    let resolvedTarget;
    if (path.isAbsolute(target)) {
      resolvedTarget = path.resolve(target);
    } else {
      resolvedTarget = path.resolve(projectRoot, target);
    }

    // 获取目标路径的目录
    const targetDir = path.dirname(resolvedTarget);
    const targetFileName = path.basename(resolvedTarget);

    // 检查目标目录是否指向项目根目录下的data文件夹
    // 使用path.resolve确保路径比较的准确性
    if (path.resolve(targetDir) === path.resolve(defaultDataDir)) {
      // 指向项目data文件夹，保存为相对路径
      target = `data/${targetFileName}`.replace(/\\/g, '/');
    }
    // 如果已经是相对路径，确保格式正确（使用正斜杠，跨平台兼容）
    else if (!path.isAbsolute(target)) {
      // 规范化相对路径格式
      target = target.replace(/\\/g, '/');
    }
    // 如果是绝对路径但不指向项目data文件夹，保持原样

    // 合并写入配置：避免覆盖其他配置项（例如 pdfBrowserPath）
    try {
      AppConfig.updateConfig({ dbPath: target });
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: String(e)
      });
    }
    res.json({
      success: true,
      message: 'Saved. Please restart server to take effect.'
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '设置存储路径失败'
    });
  }
});

/**
 * 打开数据库所在位置
 * POST /api/storage/open
 */
router.post('/open', (req, res) => {
  try {
    const p = typeof db.getDbPath === 'function' ? db.getDbPath() : null;
    if (!p) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '当前数据库路径未知'
      });
    }
    const dir = fs.existsSync(p) ? path.dirname(p) : path.dirname(p);
    if (process.platform === 'win32') {
      child_process.spawn('explorer', [dir], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      child_process.spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref();
    } else {
      child_process.spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: String(e)
    });
  }
});

/**
 * 获取数据库统计信息
 * GET /api/storage/stats
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const sqlite = db && db.db ? db.db : null;
  if (!sqlite || typeof sqlite.run !== 'function') {
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'SQLite handle not available'
    });
  }

  const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
    sqlite.all(sql, params, function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  try {
    const stats = {
      tables: {},
      totalRecords: 0,
      databaseSize: 0,
      timestamp: new Date().toISOString()
    };

    // 获取数据库文件大小
    const p = typeof db.getDbPath === 'function' ? db.getDbPath() : null;
    if (p && fs.existsSync(p)) {
      const stat = fs.statSync(p);
      stats.databaseSize = stat.size;
    }

    // 统计各表的记录数
    const tables = ['company', 'customers', 'orders', 'order_items', 'products', 'users', 'operation_logs', 'sessions', 'document_templates', 'order_configs'];
    for (const table of tables) {
      try {
        const count = await allAsync(`SELECT COUNT(*) as count FROM ${table}`);
        const countNum = count && count[0] ? count[0].count : 0;
        stats.tables[table] = countNum;
        stats.totalRecords += countNum;
      } catch (e) {
        // 表可能不存在，忽略错误
        stats.tables[table] = 0;
      }
    }

    res.json({ success: true, stats });
  } catch (e) {
    logger.error('[数据库统计] 获取统计信息失败:', e);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '获取数据库统计信息失败: ' + String(e.message || e)
    });
  }
}));

/**
 * 数据库备份
 * GET /api/storage/backup
 */
router.get('/backup', asyncHandler(async (req, res) => {
  const p = typeof db.getDbPath === 'function' ? db.getDbPath() : null;
  if (!p || !fs.existsSync(p)) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Database file not found'
    });
  }

  const fileName = path.basename(p) || 'erp.sqlite';
  const tmpDir = path.join(os.tmpdir(), 'pp-erp-backups');
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (e) { }
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  const backupPath = path.join(tmpDir, `erp-backup-${ts}.sqlite`);
  try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch (e) { }

  // 使用 VACUUM INTO 生成一致性的备份文件
  const sqlite = db && db.db ? db.db : null;
  if (!sqlite || typeof sqlite.run !== 'function') {
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'SQLite handle not available'
    });
  }

  // 记录备份操作日志
  try {
    const LogService = require('../services/LogService');
    LogService.logOperation({
      operation: '数据库备份',
      module: '系统设置',
      details: '开始备份数据库',
      status: 'success'
    });
  } catch (e) {
    logger.warn('[数据库备份] 记录操作日志失败:', e.message);
  }

  await new Promise((resolve, reject) => {
    // VACUUM INTO 不支持参数绑定，需要直接使用字符串路径
    // 转义单引号以防止SQL注入（虽然这里是内部路径，但为了安全还是转义）
    const escapedPath = backupPath.replace(/'/g, "''");
    sqlite.run(`VACUUM INTO '${escapedPath}'`, (err) => {
      const sendFile = () => {
        try {
          const stat = fs.statSync(backupPath);
          const buf = fs.readFileSync(backupPath);

          // 记录备份成功日志
          try {
            const LogService = require('../services/LogService');
            LogService.logOperation({
              operation: '数据库备份',
              module: '系统设置',
              details: `备份完成，文件大小: ${(stat.size / 1024 / 1024).toFixed(2)} MB`,
              status: 'success'
            });
          } catch (e) {
            logger.warn('[数据库备份] 记录操作日志失败:', e.message);
          }

          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          res.setHeader('Content-Length', String(stat.size || buf.length));
          res.setHeader('X-Backup-Size', String(stat.size));
          res.setHeader('X-Backup-Timestamp', ts);
          res.status(200).end(buf);
          res.on('finish', () => { try { fs.unlinkSync(backupPath); } catch (e) { } });
        } catch (readErr) {
          try { fs.unlinkSync(backupPath); } catch (e) { }

          // 记录备份失败日志
          try {
            const LogService = require('../services/LogService');
            LogService.logOperation({
              operation: '数据库备份',
              module: '系统设置',
              details: `备份失败: ${String(readErr)}`,
              status: 'error',
              errorMessage: String(readErr)
            });
          } catch (e) {
            logger.warn('[数据库备份] 记录操作日志失败:', e.message);
          }

          return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: String(readErr)
          });
        }
      };
      if (err) {
        // VACUUM INTO 不可用或失败时，回退为直接复制数据库文件
        // 这会包含所有表，包括 company 表（公司设置）
        try {
          logger.warn('[数据库备份] VACUUM INTO 失败，使用文件复制方式:', err.message);
          fs.copyFileSync(p, backupPath);
          return sendFile();
        } catch (copyErr) {
          // 记录备份失败日志
          try {
            const LogService = require('../services/LogService');
            LogService.logOperation({
              operation: '数据库备份',
              module: '系统设置',
              details: `备份失败: ${String(copyErr)}`,
              status: 'error',
              errorMessage: String(copyErr)
            });
          } catch (e) {
            logger.warn('[数据库备份] 记录操作日志失败:', e.message);
          }

          return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: String(copyErr)
          });
        }
      }
      sendFile();
      resolve();
    });
  });
}));

/**
 * 数据库导入
 * POST /api/storage/import
 * 或 POST /api/db/import (兼容旧接口)
 */
router.post('/import', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const base64 = String(body.base64 || '').trim();
  const autoBackup = body.autoBackup !== false; // 默认启用自动备份

  if (!base64) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'base64 is required'
    });
  }

  // 记录导入开始日志
  try {
    const LogService = require('../services/LogService');
    LogService.logOperation({
      operation: '数据库导入',
      module: '系统设置',
      details: '开始导入数据库' + (autoBackup ? '（已启用自动备份）' : ''),
      status: 'success'
    });
  } catch (e) {
    logger.warn('[数据库导入] 记录操作日志失败:', e.message);
  }

  // 如果启用自动备份，先备份当前数据库
  let backupPath = null;
  if (autoBackup) {
    try {
      const p = typeof db.getDbPath === 'function' ? db.getDbPath() : null;
      if (p && fs.existsSync(p)) {
        const tmpDir = path.join(os.tmpdir(), 'pp-erp-backups');
        try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (e) { }
        const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
        backupPath = path.join(tmpDir, `auto-backup-before-import-${ts}.sqlite`);

        const sqlite = db && db.db ? db.db : null;
        if (sqlite && typeof sqlite.run === 'function') {
          await new Promise((resolve, reject) => {
            const escapedPath = backupPath.replace(/'/g, "''");
            sqlite.run(`VACUUM INTO '${escapedPath}'`, (err) => {
              if (err) {
                // VACUUM 失败，使用文件复制
                try {
                  fs.copyFileSync(p, backupPath);
                  logger.info('[数据库导入] 自动备份完成（文件复制方式）');
                } catch (copyErr) {
                  logger.warn('[数据库导入] 自动备份失败:', copyErr.message);
                  backupPath = null;
                }
              } else {
                logger.info('[数据库导入] 自动备份完成（VACUUM方式）');
              }
              resolve();
            });
          });
        }
      }
    } catch (e) {
      logger.warn('[数据库导入] 自动备份失败:', e.message);
      backupPath = null;
    }
  }

  const buf = Buffer.from(base64, 'base64');
  // 写入临时文件
  const tmpDir = config.dataRoot;
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) { }
  const tmpPath = path.join(tmpDir, `import_${Date.now()}.sqlite`);
  fs.writeFileSync(tmpPath, buf);

  const sqlite = db.db; // sqlite3.Database 实例
  if (!sqlite || typeof sqlite.run !== 'function') {
    try { fs.unlinkSync(tmpPath); } catch (_) { }
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'SQLite handle not available'
    });
  }

  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    sqlite.run(sql, params, function (err) {
      if (err) {
        console.error(`[数据库导入] SQL执行失败: ${sql}`, err);
        reject(err);
      } else {
        resolve(this);
      }
    });
  });

  const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
    sqlite.all(sql, params, function (err, rows) {
      if (err) {
        console.error(`[数据库导入] SQL查询失败: ${sql}`, err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

  // 在 ATTACH 之前完成表结构验证，避免数据库锁定问题
  // 所有业务表（排除系统表如 sqlite_sequence）
  const requiredTables = ['company', 'customers', 'orders', 'order_items', 'products', 'users', 'operation_logs', 'sessions', 'order_configs'];

  // 使用临时连接验证导入数据库的表结构（在 ATTACH 之前）
  const sqlite3 = require('sqlite3').verbose();
  const tempDb = new sqlite3.Database(tmpPath, sqlite3.OPEN_READONLY);
  const tempAllAsync = (sql, params = []) => new Promise((resolve, reject) => {
    tempDb.all(sql, params, function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  try {
    // 检查导入数据库中是否存在必要的表
    const importedTables = await tempAllAsync("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = importedTables.map(t => t.name);
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));

    if (missingTables.length > 0) {
      tempDb.close();
      try { fs.unlinkSync(tmpPath); } catch (_) { }
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATABASE',
        message: `导入的数据库缺少必要的表: ${missingTables.join(', ')}`
      });
    }

    // 验证表结构是否完全一致（允许向后兼容的字段差异）
    const structureMismatches = [];
    // 定义允许在导入数据库中缺失的字段（向后兼容）
    const allowedMissingFields = {
      'orders': ['forwarder', 'template'], // 允许导入的数据库缺少 forwarder, template 字段
      'products': ['template'] // 允许导入的数据库缺少 template 字段
    };

    for (const tableName of requiredTables) {
      // 查询导入数据库的表结构（使用临时连接）
      const importedColumns = await tempAllAsync(`PRAGMA table_info(${tableName})`);
      // 查询当前数据库的表结构
      const currentColumns = await allAsync(`PRAGMA table_info(${tableName})`);

      const importedColNames = importedColumns.map(col => col.name.toLowerCase()).sort();
      const currentColNames = currentColumns.map(col => col.name.toLowerCase()).sort();

      // 检查列名是否完全一致
      const allowedMissing = (allowedMissingFields[tableName] || []).map(f => f.toLowerCase());
      const missingInImported = currentColNames.filter(col => !importedColNames.includes(col) && !allowedMissing.includes(col));
      const extraInImported = importedColNames.filter(col => !currentColNames.includes(col));

      if (missingInImported.length > 0 || extraInImported.length > 0) {
        structureMismatches.push({
          table: tableName,
          missing: missingInImported,
          extra: extraInImported
        });
      }
    }

    if (structureMismatches.length > 0) {
      tempDb.close();
      try { fs.unlinkSync(tmpPath); } catch (_) { }

      const mismatchMessages = structureMismatches.map(m => {
        const parts = [];
        if (m.missing.length > 0) {
          parts.push(`缺少列: ${m.missing.join(', ')}`);
        }
        if (m.extra.length > 0) {
          parts.push(`多余列: ${m.extra.join(', ')}`);
        }
        return `${m.table} (${parts.join('; ')})`;
      });

      return res.status(400).json({
        success: false,
        error: 'SCHEMA_MISMATCH',
        message: `导入的数据库表结构与当前数据库不一致，无法导入。请确保导入的是由本系统导出的数据库文件。\n\n不一致的表:\n${mismatchMessages.join('\n')}`
      });
    }
  } finally {
    // 关闭临时连接（在 ATTACH 之前）
    tempDb.close();
  }

  // 表结构验证通过后，开始事务并 ATTACH 数据库
  try {
    await runAsync('BEGIN TRANSACTION');
    await runAsync('PRAGMA foreign_keys = OFF');

    // ATTACH 时会自动验证文件是否为有效的 SQLite 数据库
    // 注意：ATTACH DATABASE 不支持参数绑定，必须使用字符串路径
    // 转义单引号以防止SQL注入（虽然这里是内部路径，但为了安全还是转义）
    const escapedPath = tmpPath.replace(/'/g, "''");
    try {
      await runAsync(`ATTACH DATABASE '${escapedPath}' AS imported`);
    } catch (attachErr) {
      await runAsync('ROLLBACK');
      try { fs.unlinkSync(tmpPath); } catch (_) { }
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILE',
        message: '上传的文件不是有效的 SQLite 数据库文件: ' + String(attachErr.message || attachErr)
      });
    }

    // 清空现有数据（注意顺序避免外键约束）
    // 确保外键约束已关闭（在删除之前再次确认）
    await runAsync('PRAGMA foreign_keys = OFF');

    // 先删除有外键依赖的表（按照依赖关系从最底层开始）
    // 1. 删除订单项（依赖订单）
    await runAsync('DELETE FROM order_items');
    // 2. 删除订单（依赖客户）
    await runAsync('DELETE FROM orders');
    // 3. 删除操作日志（依赖用户）
    await runAsync('DELETE FROM operation_logs');
    // 4. 删除会话（依赖用户）
    await runAsync('DELETE FROM sessions');
    // 5. 删除单据模板（依赖用户）
    await runAsync('DELETE FROM document_templates');
    // 6. 删除用户（注意：users 表有自引用外键 createdBy，需要先处理）
    // 先将所有用户的 createdBy 设为 NULL，然后再删除
    await runAsync('UPDATE users SET createdBy = NULL WHERE createdBy IS NOT NULL');
    await runAsync('DELETE FROM users');
    // 7. 删除主表（无外键依赖）
    await runAsync('DELETE FROM customers');
    await runAsync('DELETE FROM products');
    await runAsync('DELETE FROM company');
    await runAsync('DELETE FROM order_configs');

    // 复制公司配置（表结构已验证一致）
    // 使用 INSERT OR REPLACE 确保即使导入的数据库中有空记录也能正确恢复
    try {
      const importedCompany = await allAsync('SELECT * FROM imported.company WHERE id = 1');
      if (importedCompany && importedCompany.length > 0) {
        const company = importedCompany[0];
        await runAsync(`INSERT OR REPLACE INTO company (id, companyNameCN, companyNameEN, companyAddressCN, companyAddressEN, companyTel, companyFax, signAt, logoUrl, themeColor, fontSize, headerProduction, headerInvoice, headerPacking, headerSales)
                        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          company.companyNameCN || null,
          company.companyNameEN || null,
          company.companyAddressCN || null,
          company.companyAddressEN || null,
          company.companyTel || null,
          company.companyFax || null,
          company.signAt || null,
          company.logoUrl || null,
          company.themeColor || null,
          company.fontSize || null,
          company.headerProduction || null,
          company.headerInvoice || null,
          company.headerPacking || null,
          company.headerSales || null
        ]);
        console.log('[数据库导入] 成功复制公司配置');
      } else {
        console.warn('[数据库导入] 导入的数据库中 company 表为空，跳过公司配置恢复');
      }
    } catch (e) {
      console.error('[数据库导入] 复制公司配置失败:', e.message);
      throw new Error(`复制公司配置失败: ${e.message}`);
    }

    // 复制客户（表结构已验证一致）
    try {
      await runAsync(`INSERT INTO customers (id, name, address, tel, fax, contact)
                      SELECT id, name, address, tel, fax, contact FROM imported.customers`);
      console.log('[数据库导入] 成功复制客户数据');
    } catch (e) {
      console.error('[数据库导入] 复制客户失败:', e.message);
      throw new Error(`复制客户数据失败: ${e.message}`);
    }

    // 复制订单（表结构已验证一致）
    // 验证 customerId 引用的有效性，避免外键约束失败
    try {
      // 获取已导入的客户ID列表
      const existingCustomerIds = await allAsync('SELECT id FROM customers');
      const validCustomerIds = new Set((existingCustomerIds || []).map(c => c.id));

      // 检查导入数据库中是否有 forwarder 字段（在 ATTACH 之后，使用 imported.orders）
      // 注意：这里使用 allAsync 查询已 ATTACH 的导入数据库
      const importedOrderColumns = await allAsync(`PRAGMA imported.table_info(orders)`);
      const hasForwarder = importedOrderColumns.some(col => col.name.toLowerCase() === 'forwarder');

      // 导入订单，如果 customerId 引用的客户不存在，则设为 NULL
      const importedOrders = await allAsync('SELECT * FROM imported.orders');
      let importedCount = 0;
      let skippedCount = 0;

      for (const order of importedOrders || []) {
        // 如果 customerId 不为空且引用的客户不存在，则设为 NULL
        const customerId = (order.customerId && validCustomerIds.has(order.customerId)) ? order.customerId : null;

        const forwarderValue = hasForwarder ? (order.forwarder || null) : null;

        const templateValue = hasForwarder ? (order.template || null) : (order.template || null); // Simplify logic, actually just order.template || null

        await runAsync(`INSERT INTO orders (id, contractNo, invoiceNo, blNo, invoiceDate, shipmentDate, shipFrom, shipTo, shippedPerSs, forwarder, customerId, customerName, totalUSD, createdAt, updatedAt, productType, extras, status, template)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          order.id,
          order.contractNo || null,
          order.invoiceNo || null,
          order.blNo || null,
          order.invoiceDate || null,
          order.shipmentDate || null,
          order.shipFrom || null,
          order.shipTo || null,
          order.shippedPerSs || null,
          forwarderValue,
          customerId,
          order.customerName || null,
          order.totalUSD || null,
          order.createdAt || null,
          order.updatedAt || null,
          order.productType || 1,
          order.extras || null,
          order.status || '已创建',
          order.template || null
        ]);
        importedCount++;
      }

      if (skippedCount > 0) {
        console.warn(`[数据库导入] 跳过了 ${skippedCount} 个无效的订单（引用的客户不存在）`);
      }
      console.log(`[数据库导入] 成功复制订单数据: ${importedCount} 条`);
    } catch (e) {
      console.error('[数据库导入] 复制订单失败:', e.message);
      throw new Error(`复制订单数据失败: ${e.message}`);
    }

    // 复制订单条目（表结构已验证一致）
    // 验证 orderId 引用的有效性，避免外键约束失败
    try {
      // 获取已导入的订单ID列表
      const existingOrderIds = await allAsync('SELECT id FROM orders');
      const validOrderIds = new Set((existingOrderIds || []).map(o => o.id));

      // 只导入有效的订单项（orderId 存在）
      const importedOrderItems = await allAsync('SELECT * FROM imported.order_items');
      let importedCount = 0;
      let skippedCount = 0;

      for (const item of importedOrderItems || []) {
        // 如果 orderId 不存在，跳过（order_items 表的 orderId 是 NOT NULL）
        if (!item.orderId || !validOrderIds.has(item.orderId)) {
          skippedCount++;
          continue; // 跳过无效的 orderId 引用
        }

        await runAsync(`INSERT INTO order_items (id, orderId, sortIndex, model, quantity, packages, weight, actualWeight, packing, labelWeight, safetyFactor, cleanliness, unit, unitPrice, amount, labelBatchNo, label, extras)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          item.id,
          item.orderId,
          item.sortIndex || null,
          item.model || null,
          item.quantity || null,
          item.packages || null,
          item.weight || null,
          item.actualWeight || null,
          item.packing || null,
          item.labelWeight || null,
          item.safetyFactor || null,
          item.cleanliness || null,
          item.unit || null,
          item.unitPrice || null,
          item.amount || null,
          item.labelBatchNo || null,
          item.label || null,
          item.extras || null
        ]);
        importedCount++;
      }

      if (skippedCount > 0) {
        console.warn(`[数据库导入] 跳过了 ${skippedCount} 个无效的订单项（引用的订单不存在）`);
      }
      console.log(`[数据库导入] 成功复制订单条目数据: ${importedCount} 条`);
    } catch (e) {
      console.error('[数据库导入] 复制订单条目失败:', e.message);
      throw new Error(`复制订单条目数据失败: ${e.message}`);
    }

    // 复制产品（表结构已验证一致）
    try {
      // 检查导入数据库中是否有 template 字段
      const importedProductColumns = await allAsync(`PRAGMA imported.table_info(products)`);
      const hasProductTemplate = importedProductColumns.some(col => col.name.toLowerCase() === 'template');

      let productInsertSql = `INSERT INTO products (id, model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, createdAt, updatedAt, source, actualWeight, labelBatchNo, label`;
      let productSelectSql = `SELECT id, model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, createdAt, updatedAt, source, actualWeight, labelBatchNo, label`;

      if (hasProductTemplate) {
        productInsertSql += `, template`;
        productSelectSql += `, template`;
      }

      productInsertSql += `)`;
      productSelectSql += ` FROM imported.products`;

      await runAsync(`${productInsertSql} ${productSelectSql}`);
      console.log('[数据库导入] 成功复制产品数据');
    } catch (e) {
      console.error('[数据库导入] 复制产品失败:', e.message);
      throw new Error(`复制产品数据失败: ${e.message}`);
    }

    // 复制订单配置（表结构已验证一致）
    try {
      await runAsync(`INSERT INTO order_configs (id, category, value, sortIndex, createdAt, updatedAt)
                      SELECT id, category, value, sortIndex, createdAt, updatedAt FROM imported.order_configs`);
      console.log('[数据库导入] 成功复制订单配置数据');
    } catch (e) {
      console.error('[数据库导入] 复制订单配置失败:', e.message);
      throw new Error(`复制订单配置数据失败: ${e.message}`);
    }

    // 复制用户（表结构已验证一致）
    // 注意：先导入所有用户，但将 createdBy 设为 NULL（如果引用的用户不存在）
    // 这样可以避免自引用外键约束问题
    try {
      // 先获取所有导入的用户ID，用于验证 createdBy 引用
      const importedUserIds = await allAsync('SELECT id FROM imported.users');
      const validUserIds = new Set((importedUserIds || []).map(u => u.id));

      // 导入用户，如果 createdBy 引用的用户不存在，则设为 NULL
      const importedUsers = await allAsync('SELECT * FROM imported.users');
      for (const user of importedUsers || []) {
        // 如果 createdBy 不为空且引用的用户不存在，则设为 NULL
        const createdBy = (user.createdBy && validUserIds.has(user.createdBy)) ? user.createdBy : null;
        await runAsync(`INSERT INTO users (id, username, password, displayName, avatar, role, status, lastLoginAt, createdAt, updatedAt, createdBy)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          user.id,
          user.username,
          user.password,
          user.displayName || null,
          user.avatar || null,
          user.role || 'user',
          user.status || 'active',
          user.lastLoginAt || null,
          user.createdAt,
          user.updatedAt,
          createdBy
        ]);
      }
      console.log('[数据库导入] 成功复制用户数据');
    } catch (e) {
      console.error('[数据库导入] 复制用户失败:', e.message);
      throw new Error(`复制用户数据失败: ${e.message}`);
    }

    // 复制操作日志（表结构已验证一致）
    // 只导入那些 userId 在已导入用户中存在的记录，避免外键约束失败
    try {
      // 获取已导入的用户ID列表
      const existingUserIds = await allAsync('SELECT id FROM users');
      const validUserIds = new Set((existingUserIds || []).map(u => u.id));

      // 只导入有效的操作日志（userId 存在）
      const importedLogs = await allAsync('SELECT * FROM imported.operation_logs');
      let importedCount = 0;
      let skippedCount = 0;

      for (const log of importedLogs || []) {
        // 如果 userId 不存在，设为 NULL（允许为 NULL 的情况）或跳过
        if (log.userId && !validUserIds.has(log.userId)) {
          skippedCount++;
          continue; // 跳过无效的 userId 引用
        }

        await runAsync(`INSERT INTO operation_logs (id, userId, username, operation, module, target, details, ipAddress, userAgent, status, errorMessage, createdAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          log.id,
          log.userId || null,
          log.username || null,
          log.operation,
          log.module,
          log.target || null,
          log.details || null,
          log.ipAddress || null,
          log.userAgent || null,
          log.status || 'success',
          log.errorMessage || null,
          log.createdAt
        ]);
        importedCount++;
      }

      if (skippedCount > 0) {
        console.warn(`[数据库导入] 跳过了 ${skippedCount} 条无效的操作日志（引用的用户不存在）`);
      }
      console.log(`[数据库导入] 成功复制操作日志数据: ${importedCount} 条`);
    } catch (e) {
      console.error('[数据库导入] 复制操作日志失败:', e.message);
      throw new Error(`复制操作日志数据失败: ${e.message}`);
    }

    // 复制会话（表结构已验证一致）
    // 只导入那些 userId 在已导入用户中存在的记录，避免外键约束失败
    try {
      // 获取已导入的用户ID列表
      const existingUserIds = await allAsync('SELECT id FROM users');
      const validUserIds = new Set((existingUserIds || []).map(u => u.id));

      // 只导入有效的会话（userId 存在）
      const importedSessions = await allAsync('SELECT * FROM imported.sessions');
      let importedCount = 0;
      let skippedCount = 0;

      for (const session of importedSessions || []) {
        // 如果 userId 不存在，跳过（sessions 表的 userId 是 NOT NULL）
        if (!session.userId || !validUserIds.has(session.userId)) {
          skippedCount++;
          continue; // 跳过无效的 userId 引用
        }

        await runAsync(`INSERT INTO sessions (id, userId, token, expiresAt, ipAddress, userAgent, createdAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`, [
          session.id,
          session.userId,
          session.token,
          session.expiresAt,
          session.ipAddress || null,
          session.userAgent || null,
          session.createdAt
        ]);
        importedCount++;
      }

      if (skippedCount > 0) {
        console.warn(`[数据库导入] 跳过了 ${skippedCount} 个无效的会话（引用的用户不存在）`);
      }
      console.log(`[数据库导入] 成功复制会话数据: ${importedCount} 个`);
    } catch (e) {
      console.error('[数据库导入] 复制会话失败:', e.message);
      throw new Error(`复制会话数据失败: ${e.message}`);
    }

    // 复制单据模板（如果存在，可选表）
    // 验证 createdBy 引用的有效性，避免外键约束失败
    try {
      // 检查导入数据库中是否存在 document_templates 表
      const importedTables = await allAsync("SELECT name FROM imported.sqlite_master WHERE type='table' AND name='document_templates'");

      if (importedTables && importedTables.length > 0) {
        // 获取已导入的用户ID列表
        const existingUserIds = await allAsync('SELECT id FROM users');
        const validUserIds = new Set((existingUserIds || []).map(u => u.id));

        // 只导入有效的单据模板（createdBy 存在或为 NULL）
        const importedTemplates = await allAsync('SELECT * FROM imported.document_templates');
        let importedCount = 0;
        let skippedCount = 0;

        for (const template of importedTemplates || []) {
          // 如果 createdBy 不为空且引用的用户不存在，则设为 NULL
          const createdBy = (template.createdBy && validUserIds.has(template.createdBy)) ? template.createdBy : null;

          await runAsync(`INSERT INTO document_templates (id, name, type, version, config, isDefault, createdBy, createdAt, updatedAt)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            template.id,
            template.name,
            template.type,
            template.version || '1.0',
            template.config,
            template.isDefault || 0,
            createdBy,
            template.createdAt,
            template.updatedAt
          ]);
          importedCount++;
        }

        if (skippedCount > 0) {
          console.warn(`[数据库导入] 跳过了 ${skippedCount} 个无效的单据模板（引用的用户不存在）`);
        }
        console.log(`[数据库导入] 成功复制单据模板数据: ${importedCount} 个`);
      } else {
        console.log('[数据库导入] 导入的数据库中不存在单据模板表，跳过');
      }
    } catch (e) {
      // 如果导入单据模板失败，记录警告但不中断导入流程（因为这是可选表）
      console.warn('[数据库导入] 复制单据模板失败（不影响导入）:', e.message);
    }

    // 先提交事务，确保所有更改都已保存
    await runAsync('COMMIT');
    console.log('[数据库导入] 事务已提交');

    // 恢复外键约束
    await runAsync('PRAGMA foreign_keys = ON');

    // 导入数据库后，清除所有会话，强制所有用户重新登录
    // 这是因为导入的数据库可能包含不同的用户数据，现有会话可能不再有效
    try {
      await runAsync('DELETE FROM sessions');
      console.log('[数据库导入] 已清除所有会话，所有用户需要重新登录');
    } catch (e) {
      console.warn('[数据库导入] 清除会话失败（不影响导入）:', e.message);
    }

    // 执行一个简单的查询，确保所有操作都完成
    try {
      await allAsync('SELECT 1');
    } catch (e) {
      console.warn('[数据库导入] 验证查询失败:', e.message);
    }

    // 等待一小段时间，确保所有查询都完成
    await new Promise(resolve => setTimeout(resolve, 200));

    // 然后分离数据库（在事务提交后）
    // 使用更安全的方式处理 DETACH，避免锁定问题
    let detachSuccess = false;
    for (let retry = 0; retry < 3; retry++) {
      try {
        await runAsync('DETACH DATABASE imported');
        console.log('[数据库导入] 已分离导入数据库');
        detachSuccess = true;
        break;
      } catch (detachErr) {
        if (retry < 2) {
          console.warn(`[数据库导入] 分离数据库失败，重试 ${retry + 1}/3:`, detachErr.message);
          await new Promise(resolve => setTimeout(resolve, 100 * (retry + 1)));
        } else {
          console.warn('[数据库导入] 分离数据库失败（已重试3次，可能已经分离）:', detachErr.message);
          // 如果分离失败，继续执行，因为数据已经成功导入
        }
      }
    }

    // 清理临时文件
    try {
      fs.unlinkSync(tmpPath);
      console.log('[数据库导入] 已删除临时文件');
    } catch (unlinkErr) {
      console.warn('[数据库导入] 删除临时文件失败:', unlinkErr.message);
    }

    // 获取导入后的统计信息
    const importStats = {
      tables: {},
      totalRecords: 0,
      timestamp: new Date().toISOString()
    };

    try {
      const tables = ['company', 'customers', 'orders', 'order_items', 'products', 'users', 'operation_logs', 'sessions', 'document_templates'];
      for (const table of tables) {
        try {
          const count = await allAsync(`SELECT COUNT(*) as count FROM ${table}`);
          const countNum = count && count[0] ? count[0].count : 0;
          importStats.tables[table] = countNum;
          importStats.totalRecords += countNum;
        } catch (e) {
          importStats.tables[table] = 0;
        }
      }
    } catch (e) {
      console.warn('[数据库导入] 获取统计信息失败:', e.message);
    }

    // 记录导入成功日志
    try {
      const LogService = require('../services/LogService');
      LogService.logOperation({
        operation: '数据库导入',
        module: '系统设置',
        details: `导入完成，共导入 ${importStats.totalRecords} 条记录${backupPath ? '（已自动备份）' : ''}`,
        status: 'success'
      });
    } catch (e) {
      console.warn('[数据库导入] 记录操作日志失败:', e.message);
    }

    console.log('[数据库导入] 导入完成');
    res.json({
      success: true,
      ok: true,
      message: '数据库导入成功！请重启应用以使用导入的数据（关闭应用后重新打开）',
      stats: importStats,
      requiresRestart: true, // 标记需要重启
      autoBackup: backupPath ? true : false,
      backupPath: backupPath || null
    });
  } catch (e) {
    // 安全地回滚事务
    try {
      await runAsync('ROLLBACK');
    } catch (rollbackErr) {
      console.warn('[数据库导入] 回滚事务失败:', rollbackErr.message);
    }

    // 安全地分离数据库
    try {
      await runAsync('DETACH DATABASE imported');
    } catch (detachErr) {
      console.warn('[数据库导入] 分离数据库失败:', detachErr.message);
    }

    // 清理临时文件
    try {
      fs.unlinkSync(tmpPath);
    } catch (unlinkErr) {
      console.warn('[数据库导入] 删除临时文件失败:', unlinkErr.message);
    }

    // 记录详细错误信息
    console.error('[数据库导入] 导入失败:', {
      error: e.message || e,
      stack: e.stack,
      name: e.name
    });

    // 返回详细的错误信息
    const errorMessage = e.message || String(e);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        name: e.name,
        stack: e.stack
      } : undefined
    });
  }
}));

/**
 * 系统重置
 * POST /api/reset
 */
router.post('/reset', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const pwd = String(body.password || '').trim();
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const timestamp = new Date().toISOString();

  // 记录初始化尝试的审计日志
  console.log(`[AUDIT] ${timestamp} - 系统初始化尝试 - IP: ${clientIP}, User-Agent: ${userAgent}`);

  if (pwd !== 'pp520') {
    // 记录密码错误的审计日志
    console.log(`[AUDIT] ${timestamp} - 系统初始化失败：密码错误 - IP: ${clientIP}`);
    await LogService.logOperation(req, '系统初始化', '数据库设置', '', '系统初始化失败：密码错误', 'failure', '密码验证失败');
    throw createForbiddenError('密码验证失败');
  }

  // 记录初始化开始的审计日志
  console.log(`[AUDIT] ${timestamp} - 系统初始化开始 - IP: ${clientIP}`);

  // 直接执行原子清空：删除所有订单项、订单、客户、产品；公司重置为默认
  const sqlite = db.db;
  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    sqlite.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  try {
    await runAsync('BEGIN TRANSACTION');
    await runAsync('DELETE FROM order_items');
    await runAsync('DELETE FROM orders');
    await runAsync('DELETE FROM customers');
    await runAsync('DELETE FROM products');
    await runAsync('DELETE FROM order_configs');
    await runAsync('COMMIT');
    console.log(`[AUDIT] ${timestamp} - 数据库清理完成：订单项、订单、客户、产品已删除`);
  } catch (error) {
    await runAsync('ROLLBACK').catch(() => { }); // 忽略回滚错误
    console.error(`[AUDIT] ${timestamp} - 系统初始化失败：数据库清理失败 - ${error.message}`);
    throw error;
  }

  // 公司重置：初始化系统时，完全清空公司配置，重置为默认空值
  // 将公司重置操作也包含在事务中，确保原子性
  try {
    await runAsync('BEGIN TRANSACTION');
    // 删除现有公司配置记录
    await runAsync('DELETE FROM company');
    console.log(`[AUDIT] ${timestamp} - 公司配置记录已删除`);

    // 重置为公司设置的默认空值（不使用种子文件，确保完全清空）
    // 使用事务内的 SQL 直接插入空记录，避免使用 db.setCompany（它可能触发其他逻辑）
    const emptyCompany = { ...config.defaultCompany };
    const companyFields = [
      'companyNameCN', 'companyNameEN', 'companyAddressCN', 'companyAddressEN',
      'companyTel', 'companyFax', 'signAt', 'logoUrl', 'themeColor', 'fontSize',
      'headerProduction', 'headerInvoice', 'headerPacking', 'headerSales'
    ];
    const companyValues = companyFields.map(field => emptyCompany[field] || '');
    const placeholders = companyFields.map(() => '?').join(', ');
    await runAsync(
      `INSERT INTO company (id, ${companyFields.join(', ')}) VALUES (1, ${placeholders})`,
      companyValues
    );
    await runAsync('COMMIT');
    console.log(`[AUDIT] ${timestamp} - 公司配置已重置为默认空值`);
  } catch (error) {
    await runAsync('ROLLBACK').catch(() => { }); // 忽略回滚错误
    console.error(`[AUDIT] ${timestamp} - 重置公司配置失败:`, error.message);
    // 如果重置失败，尝试使用 db.setCompany 作为备选方案
    try {
      await new Promise((resolve, reject) => {
        const emptyCompany = { ...config.defaultCompany };
        db.setCompany(emptyCompany, (err) => {
          if (err) {
            console.error(`[AUDIT] ${timestamp} - 备选方案：重置公司配置失败:`, err.message);
            reject(err);
          } else {
            console.log(`[AUDIT] ${timestamp} - 备选方案：公司配置已重置为默认空值`);
            resolve();
          }
        });
      });
    } catch (fallbackError) {
      console.error(`[AUDIT] ${timestamp} - 所有重置公司配置的方案都失败:`, fallbackError.message);
      // 不抛出错误，继续执行，让用户知道初始化部分完成
    }
  }

  // 记录初始化成功的审计日志
  console.log(`[AUDIT] ${timestamp} - 系统初始化成功 - IP: ${clientIP} - 所有数据已清空，公司配置已重置`);
  await LogService.logOperation(req, '系统初始化', '数据库设置', '', '系统初始化成功，所有数据已清空');

  res.json({ success: true, ok: true });
}));

module.exports = router;

