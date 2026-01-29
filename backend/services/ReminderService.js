/**
 * 提醒服务
 * 处理发货提醒和收款提醒相关的业务逻辑
 */

const { db } = require('../db/connection');
const { promisify } = require('util');

const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbRun = promisify(db.run.bind(db));

/**
 * 获取发货提醒设置（提前天数）
 */
async function getShipmentReminderSettings() {
  try {
    // 从系统设置表或配置中获取，这里先使用默认值
    // 可以后续扩展为从数据库读取
    const result = await dbGet(
      `SELECT value FROM settings WHERE key = 'shipment_reminder_advance_days'`
    );
    
    return {
      advanceDays: result ? parseInt(result.value) : 5
    };
  } catch (error) {
    // 如果表不存在或查询失败，返回默认值
    console.warn('[ReminderService] 获取发货提醒设置失败，使用默认值:', error.message);
    return { advanceDays: 5 };
  }
}

/**
 * 保存发货提醒设置
 */
async function saveShipmentReminderSettings(advanceDays) {
  try {
    // 确保设置表存在
    await dbRun(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    
    await dbRun(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      ['shipment_reminder_advance_days', String(advanceDays)]
    );
    
    return { success: true };
  } catch (error) {
    console.error('[ReminderService] 保存发货提醒设置失败:', error);
    throw error;
  }
}

/**
 * 获取发货提醒订单列表
 */
async function getShipmentReminders(advanceDays = 5, limit = 5) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // 使用更宽松的查询条件，处理日期格式问题
    const query = `
      SELECT 
        o.id,
        o.contractNo,
        COALESCE(c.name, o.customerName, '') as customerName,
        o.shipmentDate,
        o.status,
        CASE 
          WHEN o.shipmentDate IS NOT NULL AND o.shipmentDate != ''
          THEN CAST(julianday(date(o.shipmentDate)) - julianday(date(?)) AS INTEGER)
          ELSE NULL
        END as daysUntilShipment
      FROM orders o
      LEFT JOIN customers c ON o.customerId = c.id
      WHERE 
        o.shipmentDate IS NOT NULL
        AND o.shipmentDate != ''
        AND o.status IS NOT NULL
        AND o.status != '已完成'
        AND o.status != '已发货'
        AND date(o.shipmentDate) IS NOT NULL
        AND julianday(date(o.shipmentDate)) - julianday(date(?)) <= ?
        AND julianday(date(o.shipmentDate)) - julianday(date(?)) >= 0
      ORDER BY date(o.shipmentDate) ASC
      LIMIT ?
    `;
    
    const orders = await dbAll(query, [today, today, advanceDays, today, limit]);
    
    // 计算总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      WHERE 
        o.shipmentDate IS NOT NULL
        AND o.shipmentDate != ''
        AND o.status IS NOT NULL
        AND o.status != '已完成'
        AND o.status != '已发货'
        AND date(o.shipmentDate) IS NOT NULL
        AND julianday(date(o.shipmentDate)) - julianday(date(?)) <= ?
        AND julianday(date(o.shipmentDate)) - julianday(date(?)) >= 0
    `;
    
    const countResult = await dbGet(countQuery, [today, advanceDays, today]);
    const total = countResult ? countResult.total : 0;
    
    return {
      orders: orders || [],
      total: total,
      advanceDays: advanceDays
    };
  } catch (error) {
    console.error('[ReminderService] 获取发货提醒失败:', error);
    throw error;
  }
}

/**
 * 获取收款提醒订单列表
 */
async function getPaymentReminders(limit = 5) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // 查询已发货但未完成的订单（等待收款）
    // 拉货日期存储在 extras JSON 字段的 pickupDate 中
    const query = `
      SELECT 
        o.id,
        o.contractNo,
        o.invoiceNo,
        COALESCE(c.name, o.customerName, '') as customerName,
        o.totalUSD as totalAmount,
        o.paymentDate,
        o.shipmentDate,
        o.status,
        o.extras,
        CASE 
          WHEN o.paymentDate IS NOT NULL AND o.paymentDate != '' AND date(o.paymentDate) IS NOT NULL
          THEN CAST(julianday(date(o.paymentDate)) - julianday(date(?)) AS INTEGER)
          ELSE NULL
        END as daysUntilPayment,
        CASE 
          WHEN json_extract(o.extras, '$.pickupDate') IS NOT NULL 
            AND json_extract(o.extras, '$.pickupDate') != ''
            AND date(json_extract(o.extras, '$.pickupDate')) IS NOT NULL
          THEN CAST(julianday(date(?)) - julianday(date(json_extract(o.extras, '$.pickupDate'))) AS INTEGER)
          ELSE NULL
        END as daysSinceShipment
      FROM orders o
      LEFT JOIN customers c ON o.customerId = c.id
      WHERE 
        o.status IS NOT NULL
        AND o.status = '已发货'
        AND (
          o.paymentDate IS NULL 
          OR o.paymentDate = ''
          OR date(o.paymentDate) IS NULL
          OR julianday(date(o.paymentDate)) - julianday(date(?)) >= 0
        )
      ORDER BY 
        CASE 
          WHEN o.paymentDate IS NOT NULL AND o.paymentDate != '' AND date(o.paymentDate) IS NOT NULL
          THEN date(o.paymentDate)
          ELSE '9999-12-31' 
        END ASC,
        o.createdAt DESC
      LIMIT ?
    `;
    
    const orders = await dbAll(query, [today, today, today, limit]);
    
    // 计算总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      WHERE 
        o.status IS NOT NULL
        AND o.status = '已发货'
        AND (
          o.paymentDate IS NULL 
          OR o.paymentDate = ''
          OR date(o.paymentDate) IS NULL
          OR julianday(date(o.paymentDate)) - julianday(date(?)) >= 0
        )
    `;
    
    const countResult = await dbGet(countQuery, [today]);
    const total = countResult ? countResult.total : 0;
    
    return {
      orders: orders || [],
      total: total
    };
  } catch (error) {
    console.error('[ReminderService] 获取收款提醒失败:', error);
    throw error;
  }
}

module.exports = {
  getShipmentReminderSettings,
  saveShipmentReminderSettings,
  getShipmentReminders,
  getPaymentReminders
};

