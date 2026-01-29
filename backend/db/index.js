/**
 * 数据库层统一导出入口
 * 从各个模块导入并统一导出，保持向后兼容
 */

// 导入数据库连接（db 和 getDbPath）
const { db, getDbPath } = require('./connection');

// 导入数据库初始化
const { init } = require('./init');

// 导入公司配置模块
const { getCompany, setCompany } = require('./company');

// 导入客户模块
const { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, clearCustomers } = require('./customers');

// 导入货代模块
const { listForwarders, getForwarder, createForwarder, updateForwarder, deleteForwarder, clearForwarders } = require('./forwarders');

// 导入订单模块
const { listOrders, listDeletedOrders, getOrder, createOrder, updateOrder, deleteOrder, restoreOrder, permanentlyDeleteOrder, cleanupExpiredDeletedOrders } = require('./orders');

// 导入产品模块
const { listProducts, getProduct, createProduct, updateProduct, deleteProduct, searchProducts, syncProductFromOrder } = require('./products');

// 导入用户模块
const { createUser, listUsers, getUser, getUserByUsername, updateUser, updateUserPassword, updateUserLastLogin, deleteUser, verifyPassword } = require('./users');

// 导入会话模块
const { createSession, getSessionByToken, deleteSession, deleteUserSessions, cleanExpiredSessions } = require('./sessions');

// 导入操作日志模块
const { createOperationLog, listOperationLogs, deleteOperationLog, clearOperationLogs, cleanOldOperationLogs } = require('./logs');

// 导入单据中心模块
const { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, deleteAllTemplates, getDefaultTemplate } = require('./document-center');

// 导入订单配置模块
const orderConfigs = require('./order-configs');

// 统一导出所有函数，保持向后兼容
module.exports = {
  db,
  init,
  // storage
  getDbPath,
  // company
  getCompany,
  setCompany,
  // customers
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  clearCustomers,
  // forwarders
  listForwarders,
  getForwarder,
  createForwarder,
  updateForwarder,
  deleteForwarder,
  clearForwarders,
  // orders
  listOrders,
  listDeletedOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  restoreOrder,
  permanentlyDeleteOrder,
  cleanupExpiredDeletedOrders,
  // products
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  syncProductFromOrder,
  // users
  createUser,
  listUsers,
  getUser,
  getUserByUsername,
  updateUser,
  updateUserPassword,
  updateUserLastLogin,
  deleteUser,
  verifyPassword,
  // sessions
  createSession,
  getSessionByToken,
  deleteSession,
  deleteUserSessions,
  cleanExpiredSessions,
  // operation logs
  createOperationLog,
  listOperationLogs,
  deleteOperationLog,
  clearOperationLogs,
  cleanOldOperationLogs,
  // document center
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  deleteAllTemplates,
  getDefaultTemplate,
  // order configs
  ...orderConfigs
};
