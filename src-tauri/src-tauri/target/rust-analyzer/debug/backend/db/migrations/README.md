# 数据库迁移和索引优化

## 📂 文件说明

### 索引优化相关

| 文件 | 用途 | 使用方式 |
|------|------|---------|
| `add-indexes.sql` | 索引创建SQL脚本 | 包含37个索引定义 |
| `apply-indexes.js` | 索引应用工具（Node.js） | `node apply-indexes.js` |
| `remove-indexes.sql` | 索引回滚SQL脚本 | 移除所有优化索引 |
| **推荐使用** | `scripts/utils/apply-indexes.bat` | Windows一键执行 |

### 其他迁移

| 文件 | 用途 |
|------|------|
| `migrate-label-to-label-b-c.js` | 标签数据迁移 |

---

## 🚀 快速开始

### Windows用户（推荐）

```batch
# 应用索引优化
scripts\utils\apply-indexes.bat

# 回滚索引（如需）
scripts\utils\remove-indexes.bat
```

### 命令行用户

```bash
# 进入项目根目录
cd /d/003vibe_coding/pp-order-system

# 应用索引
node backend/db/migrations/apply-indexes.js

# 或使用SQLite命令行（需安装sqlite3）
sqlite3 data/erp.sqlite < backend/db/migrations/add-indexes.sql
```

---

## 📊 索引详情

### 创建的索引列表

#### 1. orders表（9个索引）
- `idx_orders_customer_id` - 客户ID
- `idx_orders_invoice_date` - 发票日期
- `idx_orders_shipment_date` - 发货日期
- `idx_orders_status` - 订单状态
- `idx_orders_created_at` - 创建时间
- `idx_orders_updated_at` - 更新时间
- `idx_orders_deleted_at` - 删除时间（软删除）
- `idx_orders_customer_status` - 复合索引：客户+状态
- `idx_orders_date_range` - 复合索引：日期范围

#### 2. order_items表（3个索引）
- `idx_order_items_order_id` - 订单ID
- `idx_order_items_model` - 产品型号
- `idx_order_items_order_sort` - 复合索引：订单+排序

#### 3. products表（4个索引）
- `idx_products_product_type` - 产品类型
- `idx_products_source` - 数据来源
- `idx_products_created_at` - 创建时间
- `idx_products_updated_at` - 更新时间

#### 4. customers表（1个索引）
- `idx_customers_contact` - 联系人

#### 5. operation_logs表（7个索引）
- `idx_operation_logs_user_id` - 用户ID
- `idx_operation_logs_created_at` - 创建时间
- `idx_operation_logs_operation` - 操作类型
- `idx_operation_logs_module` - 模块
- `idx_operation_logs_status` - 状态
- `idx_operation_logs_user_time` - 复合索引：用户+时间
- `idx_operation_logs_module_op_time` - 复合索引：模块+操作+时间

#### 6. sessions表（4个索引）
- `idx_sessions_user_id` - 用户ID
- `idx_sessions_expires_at` - 过期时间
- `idx_sessions_created_at` - 创建时间
- `idx_sessions_user_expires` - 复合索引：用户+过期时间

#### 7. users表（5个索引）
- `idx_users_role` - 角色
- `idx_users_status` - 状态
- `idx_users_last_login_at` - 最后登录时间
- `idx_users_created_at` - 创建时间

#### 8. document_templates表（4个索引）
- `idx_document_templates_type` - 类型
- `idx_document_templates_is_default` - 是否默认
- `idx_document_templates_created_at` - 创建时间
- `idx_document_templates_type_default` - 复合索引：类型+默认

**总计：37个索引**

---

## 📈 性能提升

### 预期效果

| 场景 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 订单列表查询 | ~100ms | ~10-30ms | 70-90% |
| 按客户筛选订单 | ~80ms | ~5-15ms | 80-90% |
| 日志查询 | ~150ms | ~15-30ms | 80-90% |
| 会话验证 | ~50ms | ~5-10ms | 80-90% |
| 统计查询 | ~200ms | ~20-50ms | 75-90% |

### 实际效果

执行 `apply-indexes.js` 后会自动测试并显示性能对比报告。

示例输出：
```
📊 性能对比报告
================================================================
📈 订单-按客户查询
   优化前: 95ms
   优化后: 12ms
   提升: 87.4%

📈 订单-按状态查询
   优化前: 110ms
   优化后: 18ms
   提升: 83.6%

📈 日志-按用户查询
   优化前: 145ms
   优化后: 22ms
   提升: 84.8%

================================================================
✅ 总体性能提升: 85.3%
================================================================
```

---

## ⚠️ 注意事项

### 优点

✅ **查询性能大幅提升**：70-90%的性能提升  
✅ **用户体验改善**：页面加载更快  
✅ **服务器负载降低**：减少CPU和IO消耗  
✅ **支持大数据量**：数据量增长后性能依然稳定  

### 缺点

⚠️ **存储空间增加**：约占数据库大小的5-10%  
⚠️ **写入性能略降**：插入/更新操作约降低5-10%  
⚠️ **初次创建耗时**：大数据量时可能需要几分钟  

### 适用场景

✅ **读多写少的系统**（如订单管理系统）  
✅ **查询性能是瓶颈**  
✅ **数据量持续增长**  
✅ **用户抱怨响应慢**  

### 不适用场景

❌ 写入频繁的系统（如高频交易系统）  
❌ 数据量极小（<1000条记录）  
❌ 存储空间极度受限  

---

## 🔧 故障排除

### 问题：索引创建失败

**可能原因：**
1. 数据库文件被占用
2. 权限不足
3. 磁盘空间不足
4. 数据库文件损坏

**解决方法：**
```batch
# 1. 关闭所有使用数据库的应用
# 2. 检查磁盘空间
# 3. 重新执行
scripts\utils\apply-indexes.bat
```

### 问题：性能反而下降

**可能原因：**
1. 数据量太小，索引开销大于收益
2. 查询模式不匹配索引
3. 需要ANALYZE更新统计信息

**解决方法：**
```sql
-- 更新统计信息
ANALYZE;

-- 或回滚索引
scripts\utils\remove-indexes.bat
```

### 问题：数据库体积增大过多

**说明：**
这是正常现象。索引会占用额外空间（5-10%）。

**如果空间紧张：**
```batch
# 移除不常用的索引
# 或升级存储空间
```

---

## 📝 维护建议

### 定期维护

```sql
-- 1. 更新统计信息（每月一次）
ANALYZE;

-- 2. 清理碎片（每季度一次）
VACUUM;

-- 3. 检查索引使用情况
SELECT * FROM sqlite_stat1;
```

### 监控指标

定期检查以下指标：
- 查询响应时间
- 数据库文件大小
- 索引命中率
- 慢查询日志

---

## 🔄 回滚操作

如果索引导致问题，可以完全回滚：

```batch
# Windows
scripts\utils\remove-indexes.bat

# 命令行
node backend/db/migrations/apply-indexes.js --remove
# 或
sqlite3 data/erp.sqlite < backend/db/migrations/remove-indexes.sql
```

**注意：回滚不会影响数据，只移除索引。**

---

## 📖 参考资料

### SQLite索引文档
- [SQLite索引官方文档](https://www.sqlite.org/optoverview.html)
- [查询优化器](https://www.sqlite.org/queryplanner.html)
- [索引最佳实践](https://www.sqlite.org/queryplanner.html)

### 相关优化
- [数据库连接池优化](../../../docs/优化方案/项目优化建议-深度分析版.md#数据库连接池优化)
- [查询性能监控](../../../docs/优化方案/项目优化建议-深度分析版.md#性能监控)

---

## 📞 获取帮助

如有问题：
1. 查看本文档的故障排除章节
2. 检查应用日志
3. 联系技术支持

---

**最后更新：2026-01-18**  
**版本：1.0**
