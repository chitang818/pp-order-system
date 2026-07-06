/**
 * 提醒相关路由
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const ReminderService = require('../services/ReminderService');

/**
 * 获取发货提醒设置
 */
router.get('/shipment-reminder-settings', asyncHandler(async (req, res) => {
  const settings = await ReminderService.getShipmentReminderSettings();
  res.json(settings);
}));

/**
 * 保存发货提醒设置
 */
router.post('/shipment-reminder-settings', asyncHandler(async (req, res) => {
  const { advanceDays } = req.body;
  
  if (!advanceDays || isNaN(advanceDays) || advanceDays < 0) {
    return res.status(400).json({ 
      error: '提前天数必须是大于等于0的数字' 
    });
  }
  
  await ReminderService.saveShipmentReminderSettings(parseInt(advanceDays));
  res.json({ success: true });
}));

/**
 * 获取发货提醒列表
 */
router.get('/shipment-reminders', asyncHandler(async (req, res) => {
  const advanceDays = parseInt(req.query.advanceDays) || 5;
  const limit = parseInt(req.query.limit) || 5;
  
  const reminders = await ReminderService.getShipmentReminders(advanceDays, limit);
  res.json(reminders);
}));

/**
 * 获取收款提醒列表
 */
router.get('/payment-reminders', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  
  const reminders = await ReminderService.getPaymentReminders(limit);
  res.json(reminders);
}));

module.exports = router;

