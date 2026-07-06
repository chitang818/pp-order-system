-- ================================================================
-- 数据库索引回滚脚本
-- 创建时间：2026-01-18
-- 用途：移除由 add-indexes.sql 创建的索引
-- ================================================================

-- 注意：此脚本会移除所有优化索引，仅在需要回滚时使用

BEGIN TRANSACTION;

-- ================================================================
-- 1. orders表索引
-- ================================================================
DROP INDEX IF EXISTS idx_orders_customer_id;
DROP INDEX IF EXISTS idx_orders_invoice_date;
DROP INDEX IF EXISTS idx_orders_shipment_date;
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_orders_created_at;
DROP INDEX IF EXISTS idx_orders_updated_at;
DROP INDEX IF EXISTS idx_orders_deleted_at;
DROP INDEX IF EXISTS idx_orders_customer_status;
DROP INDEX IF EXISTS idx_orders_date_range;

-- ================================================================
-- 2. order_items表索引
-- ================================================================
DROP INDEX IF EXISTS idx_order_items_order_id;
DROP INDEX IF EXISTS idx_order_items_model;
DROP INDEX IF EXISTS idx_order_items_order_sort;

-- ================================================================
-- 3. products表索引
-- ================================================================
DROP INDEX IF EXISTS idx_products_product_type;
DROP INDEX IF EXISTS idx_products_source;
DROP INDEX IF EXISTS idx_products_created_at;
DROP INDEX IF EXISTS idx_products_updated_at;

-- ================================================================
-- 4. customers表索引
-- ================================================================
DROP INDEX IF EXISTS idx_customers_contact;

-- ================================================================
-- 5. operation_logs表索引
-- ================================================================
DROP INDEX IF EXISTS idx_operation_logs_user_id;
DROP INDEX IF EXISTS idx_operation_logs_created_at;
DROP INDEX IF EXISTS idx_operation_logs_operation;
DROP INDEX IF EXISTS idx_operation_logs_module;
DROP INDEX IF EXISTS idx_operation_logs_status;
DROP INDEX IF EXISTS idx_operation_logs_user_time;
DROP INDEX IF EXISTS idx_operation_logs_module_op_time;

-- ================================================================
-- 6. sessions表索引
-- ================================================================
DROP INDEX IF EXISTS idx_sessions_user_id;
DROP INDEX IF EXISTS idx_sessions_expires_at;
DROP INDEX IF EXISTS idx_sessions_created_at;
DROP INDEX IF EXISTS idx_sessions_user_expires;

-- ================================================================
-- 7. users表索引
-- ================================================================
DROP INDEX IF EXISTS idx_users_role;
DROP INDEX IF EXISTS idx_users_status;
DROP INDEX IF EXISTS idx_users_last_login_at;
DROP INDEX IF EXISTS idx_users_created_at;

-- ================================================================
-- 8. document_templates表索引
-- ================================================================
DROP INDEX IF EXISTS idx_document_templates_type;
DROP INDEX IF EXISTS idx_document_templates_is_default;
DROP INDEX IF EXISTS idx_document_templates_created_at;
DROP INDEX IF EXISTS idx_document_templates_type_default;

COMMIT;

-- ================================================================
-- 回滚完成
-- ================================================================
-- 所有优化索引已移除
-- 数据库将恢复到优化前的状态
-- ================================================================
