/**
 * 输入验证中间件
 * 统一处理 API 输入验证，使用 express-validator
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * 验证结果处理中间件
 * 应在验证规则链的最后使用
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // 调试日志：记录验证错误详情
    console.log('[Validation] 验证失败:', {
      path: req.path,
      method: req.method,
      body: req.body,
      errors: errors.array()
    });
    
    // 提取第一个错误消息作为主要错误信息
    const firstError = errors.array()[0];
    const errorMessage = firstError ? firstError.msg : '输入验证失败';
    
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: errorMessage,
      details: errors.array()
    });
  }
  next();
};

/**
 * 自定义客户验证中间件
 * 确保 customerId 或 customerName 至少有一个有效值
 */
const validateCustomerField = (req, res, next) => {
  const customerId = req.body.customerId;
  const customerName = req.body.customerName;
  
  // 检查 customerId 是否有效
  // 注意：customerId 可能是数字、字符串形式的数字，或者 null/undefined/空字符串
  let hasValidCustomerId = false;
  if (customerId !== null && customerId !== undefined && customerId !== '') {
    const numId = Number(customerId);
    if (!isNaN(numId) && Number.isInteger(numId) && numId > 0) {
      hasValidCustomerId = true;
    }
  }
  
  // 检查 customerName 是否有效（不为空且不是默认值）
  // 注意：customerName 可能是字符串、null 或 undefined
  const nameStr = (customerName != null && customerName !== undefined) ? String(customerName).trim() : '';
  const invalidNames = ['未指定客户', '请选择客户（必选）', '请选择客户', ''];
  const hasValidCustomerName = nameStr.length > 0 && !invalidNames.includes(nameStr);
  
  // 调试日志
  console.log('[Validation] validateCustomerField:', {
    customerId,
    customerIdType: typeof customerId,
    customerName,
    customerNameType: typeof customerName,
    nameStr,
    hasValidCustomerId,
    hasValidCustomerName,
    reqBodyKeys: Object.keys(req.body || {})
  });
  
  // 至少需要一个有效的客户信息
  if (!hasValidCustomerId && !hasValidCustomerName) {
    console.log('[Validation] 客户验证失败：客户ID和客户名称都无效');
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: '客户信息不能为空：请选择客户或填写客户名称',
      details: [{
        field: 'customerId',
        value: customerId,
        message: '客户ID或客户名称至少需要一个有效值',
        received: {
          customerId,
          customerName,
          hasValidCustomerId,
          hasValidCustomerName
        }
      }]
    });
  }
  
  console.log('[Validation] 客户验证通过');
  next();
};

/**
 * 订单验证规则（用于创建订单，要求至少有一个订单项）
 */
const validateOrder = [
  // 自定义客户验证（必须在字段验证之前，以检查原始值）
  validateCustomerField,
  // 客户验证：customerId 和 customerName 至少需要一个（字段级验证）
  body('customerId').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    // 如果提供了 customerId，验证它是否为有效的正整数
    if (value !== null && value !== undefined && value !== '') {
      const num = Number(value);
      if (isNaN(num) || !Number.isInteger(num) || num <= 0) {
        throw new Error('客户ID必须是正整数');
      }
    }
    return true;
  }),
  body('customerName').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 200 }).withMessage('客户名称长度为1-200字符'),
  body('contractNo').optional().isString().trim().isLength({ max: 100 }).withMessage('合同号不能超过100个字符'),
  body('invoiceNo').optional().isString().trim().isLength({ max: 100 }).withMessage('发票号不能超过100个字符'),
  body('blNo').optional().isString().trim().isLength({ max: 100 }).withMessage('提单号不能超过100个字符'),
  body('items').isArray({ min: 1 }).withMessage('至少需要一个订单项'),
  body('items.*.model').notEmpty().trim().withMessage('产品型号不能为空'),
  body('items.*.quantity').optional({ checkFalsy: true }).custom((value) => {
    // 如果提供了 quantity，验证它是否为有效的数字（包括字符串形式的数字）
    if (value !== null && value !== undefined && value !== '') {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        throw new Error('数量必须大于等于0');
      }
    }
    return true;
  }),
  body('items.*.unitPrice').optional({ checkFalsy: true }).custom((value) => {
    // 如果提供了 unitPrice，验证它是否为有效的数字（包括字符串形式的数字）
    if (value !== null && value !== undefined && value !== '') {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        throw new Error('单价必须大于等于0');
      }
    }
    return true;
  }),
  handleValidationErrors
];

/**
 * 订单更新验证规则（用于更新订单，允许空订单项）
 */
const validateOrderUpdate = [
  // 自定义客户验证（必须在字段验证之前，以检查原始值）
  validateCustomerField,
  // 客户验证：customerId 和 customerName 至少需要一个（字段级验证）
  body('customerId').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    // 如果提供了 customerId，验证它是否为有效的正整数
    if (value !== null && value !== undefined && value !== '') {
      const num = Number(value);
      if (isNaN(num) || !Number.isInteger(num) || num <= 0) {
        throw new Error('客户ID必须是正整数');
      }
    }
    return true;
  }),
  body('customerName').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 200 }).withMessage('客户名称长度为1-200字符'),
  body('contractNo').optional().isString().trim().isLength({ max: 100 }).withMessage('合同号不能超过100个字符'),
  body('invoiceNo').optional().isString().trim().isLength({ max: 100 }).withMessage('发票号不能超过100个字符'),
  body('blNo').optional().isString().trim().isLength({ max: 100 }).withMessage('提单号不能超过100个字符'),
  body('items').optional().isArray().withMessage('订单项必须是数组'),
  body('items.*.model').optional().notEmpty().trim().withMessage('产品型号不能为空'),
  body('items.*.quantity').optional({ checkFalsy: true }).custom((value) => {
    // 如果提供了 quantity，验证它是否为有效的数字（包括字符串形式的数字）
    if (value !== null && value !== undefined && value !== '') {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        throw new Error('数量必须大于等于0');
      }
    }
    return true;
  }),
  body('items.*.unitPrice').optional({ checkFalsy: true }).custom((value) => {
    // 如果提供了 unitPrice，验证它是否为有效的数字（包括字符串形式的数字）
    if (value !== null && value !== undefined && value !== '') {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        throw new Error('单价必须大于等于0');
      }
    }
    return true;
  }),
  handleValidationErrors
];

/**
 * 客户验证规则
 */
const validateCustomer = [
  // 先sanitize（trim），再验证
  body('name')
    .trim()
    .customSanitizer((value) => {
      // 确保trim后的值被写回
      return value != null ? String(value).trim() : '';
    })
    .custom((value) => {
      // 验证不为空（此时value已经是trim后的值）
      if (!value || value.length === 0) {
        throw new Error('客户名称不能为空');
      }
      // 验证长度
      if (value.length > 100) {
        throw new Error('客户名称不能超过100个字符');
      }
      return true;
    }),
  body('address').optional({ checkFalsy: true }).trim().isString().isLength({ max: 500 }).withMessage('地址不能超过500个字符'),
  body('tel').optional({ checkFalsy: true }).trim().matches(/^[\d\s\-\+\(\)]*$/).withMessage('电话号码格式不正确'),
  body('fax').optional({ checkFalsy: true }).trim().matches(/^[\d\s\-\+\(\)]*$/).withMessage('传真号码格式不正确'),
  body('contact').optional({ checkFalsy: true }).trim().isString().isLength({ max: 100 }).withMessage('联系人不能超过100个字符'),
  handleValidationErrors
];

/**
 * 产品验证规则
 */
const validateProduct = [
  body('model').trim().notEmpty().withMessage('产品型号不能为空'),
  body('model').isLength({ max: 100 }).withMessage('产品型号不能超过100个字符'),
  body('description').optional().isString().trim().isLength({ max: 500 }).withMessage('产品描述不能超过500个字符'),
  body('estimatedWeight').optional().isFloat({ min: 0 }).withMessage('预估重量必须大于等于0'),
  body('labelWeight').optional().isFloat({ min: 0 }).withMessage('标签重量必须大于等于0'),
  body('actualWeight').optional().isFloat({ min: 0 }).withMessage('实际重量必须大于等于0'),
  body('unit').optional().isString().trim().isLength({ max: 20 }).withMessage('单位不能超过20个字符'),
  handleValidationErrors
];

/**
 * 用户验证规则（用于创建用户）
 */
const validateUser = [
  body('username').trim().notEmpty().withMessage('用户名不能为空'),
  body('username').isLength({ min: 3, max: 50 }).withMessage('用户名长度为3-50个字符'),
  body('username').matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名只能包含字母、数字和下划线'),
  body('password').optional().isLength({ min: 6 }).withMessage('密码长度至少6个字符'),
  body('displayName').optional().isString().trim().isLength({ max: 100 }).withMessage('显示名称不能超过100个字符'),
  body('role').optional().isIn(['admin', 'user']).withMessage('角色只能是admin或user'),
  handleValidationErrors
];

/**
 * 用户更新验证规则（用于更新用户，不要求username，因为更新时不允许修改用户名）
 */
const validateUserUpdate = [
  // 注意：更新用户时不允许修改用户名，所以不验证username字段
  body('displayName').optional({ checkFalsy: true }).isString().trim().isLength({ max: 100 }).withMessage('显示名称不能超过100个字符'),
  body('avatar').optional({ checkFalsy: true }).isString().trim().isLength({ max: 500 }).withMessage('头像URL不能超过500个字符'),
  body('role').optional().isIn(['admin', 'user']).withMessage('角色只能是admin或user'),
  body('status').optional().isIn(['active', 'disabled']).withMessage('状态只能是active或disabled'),
  handleValidationErrors
];

/**
 * ID 参数验证
 * 支持大整数ID（如时间戳生成的ID）
 */
const validateId = [
  param('id').custom((value) => {
    // 支持字符串形式的数字和大整数
    if (value === null || value === undefined || value === '') {
      throw new Error('ID不能为空');
    }
    const num = Number(value);
    if (isNaN(num) || num <= 0 || !Number.isFinite(num)) {
      throw new Error('ID必须是有效的正数');
    }
    // 允许整数或大整数（时间戳）
    return true;
  }).withMessage('ID必须是有效的正数'),
  handleValidationErrors
];

/**
 * 分页参数验证
 */
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateOrder,
  validateOrderUpdate,
  validateCustomer,
  validateProduct,
  validateUser,
  validateUserUpdate,
  validateId,
  validatePagination
};
