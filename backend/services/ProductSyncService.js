/**
 * 从订单同步产品库：(型号 trim, 产品类型) 联合唯一；同组内取订单 updatedAt/createdAt 最新的一条明细。
 */

const LogService = require('./LogService');

const SETTINGS_KEYS = {
  enabled: 'product_sync_auto_enabled',
  intervalDays: 'product_sync_interval_days',
  lastRun: 'product_sync_last_run_at'
};

function runGet(sqlite, sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function runAll(sqlite, sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function runExec(sqlite, sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function ensureSettingsTable(sqlite) {
  await runExec(
    sqlite,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`
  );
}

async function getSyncSettings(sqlite) {
  await ensureSettingsTable(sqlite);
  const rows = await runAll(
    sqlite,
    `SELECT key, value FROM settings WHERE key IN (?, ?, ?)`,
    [SETTINGS_KEYS.enabled, SETTINGS_KEYS.intervalDays, SETTINGS_KEYS.lastRun]
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const enabled = String(map[SETTINGS_KEYS.enabled] || 'false').toLowerCase() === 'true';
  const intervalDays = Math.max(1, parseInt(map[SETTINGS_KEYS.intervalDays] || '3', 10) || 3);
  const lastRunAt = map[SETTINGS_KEYS.lastRun] || null;
  return { enabled, intervalDays, lastRunAt };
}

async function setSyncSettings(sqlite, opts) {
  await ensureSettingsTable(sqlite);
  const enabled = !!opts.enabled;
  const intervalDays = Math.max(1, Math.min(365, parseInt(opts.intervalDays, 10) || 3));
  await runExec(
    sqlite,
    `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
    [SETTINGS_KEYS.enabled, enabled ? 'true' : 'false']
  );
  await runExec(
    sqlite,
    `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
    [SETTINGS_KEYS.intervalDays, String(intervalDays)]
  );
  return { enabled, intervalDays };
}

async function setLastRunNow(sqlite) {
  await ensureSettingsTable(sqlite);
  const iso = new Date().toISOString();
  await runExec(sqlite, `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [
    SETTINGS_KEYS.lastRun,
    iso
  ]);
  return iso;
}

const SELECT_WINNING_ORDER_ITEMS = `
SELECT * FROM (
  SELECT
    TRIM(oi.model) AS modelKey,
    oi.weight AS estimatedWeight,
    oi.labelWeight,
    oi.safetyFactor,
    oi.cleanliness,
    oi.unit,
    oi.labelBatchNo,
    oi.label,
    oi.extras,
    COALESCE(o.productType, 1) AS productType,
    ROW_NUMBER() OVER (
      PARTITION BY TRIM(oi.model), COALESCE(o.productType, 1)
      ORDER BY COALESCE(NULLIF(TRIM(o.updatedAt), ''), o.createdAt) DESC, oi.id DESC
    ) AS rn
  FROM order_items oi
  INNER JOIN orders o ON oi.orderId = o.id
  WHERE TRIM(COALESCE(oi.model, '')) != ''
    AND (o.deletedAt IS NULL OR TRIM(o.deletedAt) = '')
) WHERE rn = 1
`;

/**
 * @param {import('sqlite3').Database} sqlite
 * @param {{ req?: object|null }} options
 */
async function syncFromOrders(sqlite, options = {}) {
  const req = options.req || null;

  const orderItems = await runAll(sqlite, SELECT_WINNING_ORDER_ITEMS, []);

  if (!orderItems.length) {
    return { added: 0, updated: 0, total: 0, message: '没有找到可同步的产品数据' };
  }

  let added = 0;
  let updated = 0;

  await runExec(sqlite, 'BEGIN IMMEDIATE');
  try {
    for (const item of orderItems) {
      const model = String(item.modelKey || '').trim();
      if (!model) continue;

      let marks = '';
      try {
        if (item.extras) {
          const parsedExtras = typeof item.extras === 'string' ? JSON.parse(item.extras) : item.extras;
          marks = parsedExtras.marks || '';
        }
      } catch (e) {
        console.warn(`解析产品 ${model} 的 extras 失败:`, e);
      }

      const finalProductType = item.productType || 1;
      const syncData = {
        productType: finalProductType,
        estimatedWeight: item.estimatedWeight || null,
        labelWeight: item.labelWeight || null,
        cleanliness: item.cleanliness || null,
        unit: item.unit || '',
        safetyFactor: finalProductType === 1 ? item.safetyFactor || null : null,
        // 注意：同步时不覆盖标签批号（labelBatchNo），该字段由用户手动维护
        label: finalProductType === 2 || finalProductType === 3 ? item.label || '' : null,
        marks: finalProductType === 3 ? marks || '' : null
      };

      const existingProduct = await runGet(sqlite, 'SELECT * FROM products WHERE model = ? AND productType = ?', [
        model,
        finalProductType
      ]);

      const updateFields = [];
      const updateValues = [];

      updateFields.push('productType = ?');
      updateValues.push(syncData.productType);
      updateFields.push('estimatedWeight = ?');
      updateValues.push(syncData.estimatedWeight);
      updateFields.push('labelWeight = ?');
      updateValues.push(syncData.labelWeight);
      updateFields.push('cleanliness = ?');
      updateValues.push(syncData.cleanliness);
      updateFields.push('unit = ?');
      updateValues.push(syncData.unit);

      // 根据产品类型设置各类型专属字段
      // 注意：同步不覆盖 labelBatchNo（标签批号），该字段由用户在产品库中手动维护
      if (finalProductType === 1) {
        updateFields.push('safetyFactor = ?');
        updateValues.push(syncData.safetyFactor);
        // A类品：清空标签类字段（但不修改 labelBatchNo）
        updateFields.push('label = NULL', 'marks = NULL');
      } else if (finalProductType === 2) {
        // B类品：同步标签说明，但不同步标签批号
        updateFields.push('label = ?');
        updateValues.push(syncData.label);
        updateFields.push('safetyFactor = NULL', 'marks = NULL');
      } else if (finalProductType === 3) {
        updateFields.push('marks = ?');
        updateValues.push(syncData.marks);
        updateFields.push('label = ?');
        updateValues.push(syncData.label);
        updateFields.push('safetyFactor = NULL');
        // C类品：不同步 labelBatchNo，保留用户手动设置的值
      }

      updateFields.push('source = ?', 'updatedAt = datetime("now")');
      updateValues.push('order');
      updateValues.push(model);
      updateValues.push(finalProductType);

      if (existingProduct) {
        await runExec(
          sqlite,
          `UPDATE products SET ${updateFields.join(', ')} WHERE model = ? AND productType = ?`,
          updateValues
        );
        updated++;
      } else {
        // 新增产品时 labelBatchNo 默认为 null，由用户在产品库中手动填写
        await runExec(
          sqlite,
          `INSERT INTO products (model, productType, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, marks, source, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            model,
            syncData.productType,
            syncData.estimatedWeight,
            syncData.labelWeight,
            syncData.safetyFactor,
            syncData.cleanliness,
            syncData.unit,
            null,            // labelBatchNo：不从订单同步，默认为 null
            syncData.label,
            syncData.marks,
            'order'
          ]
        );
        added++;
      }
    }

    const totalRow = await runGet(sqlite, 'SELECT COUNT(*) AS count FROM products');
    const total = totalRow ? totalRow.count : 0;

    await runExec(sqlite, 'COMMIT');

    const msg = `同步完成：新增 ${added} 个产品，更新 ${updated} 个产品`;
    if (req) {
      await LogService.logOperation(req, '同步产品', '产品库管理', '', msg);
    } else {
      const stubReq = {
        user: { id: null, username: '定时任务' },
        ip: '127.0.0.1',
        get: () => 'scheduler',
        connection: { remoteAddress: '127.0.0.1' }
      };
      await LogService.logOperation(stubReq, '同步产品', '产品库管理', '', `[自动] ${msg}`);
    }

    return { added, updated, total, message: msg };
  } catch (e) {
    await runExec(sqlite, 'ROLLBACK').catch(() => {});
    throw e;
  }
}

async function maybeRunScheduledSync(sqlite) {
  const { enabled, intervalDays, lastRunAt } = await getSyncSettings(sqlite);
  if (!enabled) return { ran: false };

  const now = Date.now();
  let last = 0;
  if (lastRunAt) {
    const t = Date.parse(lastRunAt);
    if (!Number.isNaN(t)) last = t;
  }
  const intervalMs = intervalDays * 86400000;
  if (last && now - last < intervalMs) {
    return { ran: false };
  }

  await syncFromOrders(sqlite, { req: null });
  await setLastRunNow(sqlite);
  return { ran: true };
}

function startScheduler(sqlite) {
  const HOUR = 3600000;
  setInterval(() => {
    maybeRunScheduledSync(sqlite).catch((err) => {
      console.error('[ProductSyncScheduler]', err);
    });
  }, HOUR);
  console.log('[ProductSyncScheduler] 已启动（每小时检查一次是否到达同步间隔）');
}

module.exports = {
  syncFromOrders,
  getSyncSettings,
  setSyncSettings,
  setLastRunNow,
  maybeRunScheduledSync,
  startScheduler,
  SETTINGS_KEYS
};
