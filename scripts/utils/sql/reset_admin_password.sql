-- ========================================
-- 重置管理员密码脚本
-- ========================================
-- 用途: 将 admin 用户的密码重置为 admin123
-- ========================================

-- 操作步骤:
-- 1. 关闭 PP订单管理系统 应用
-- 2. 下载并安装 DB Browser for SQLite: https://sqlitebrowser.org/dl/
-- 3. 打开数据库文件: C:\Users\chitang\AppData\Roaming\com.pp.ordermanagement\data\erp.sqlite
-- 4. 点击 "执行SQL" 标签
-- 5. 复制下面的 SQL 命令并粘贴到SQL窗口
-- 6. 点击 "执行" 按钮 (▶️)
-- 7. 点击 "保存" 按钮保存更改
-- 8. 关闭 DB Browser
-- 9. 重新启动应用，使用 admin/admin123 登录

-- ========================================
-- SQL 命令开始
-- ========================================

-- 更新密码为 admin123
UPDATE users 
SET password = '4cb07fb4f629954aa6cdf6ee8963bbed:2414df5357154c261be4e26fa91934fbd49253d70c4af121138f1303f533fd801d031568fff38823d1e728a309b7566bfd2eba5707cae883e93a404c196e0d8e'
WHERE username = 'admin';

-- 验证更新结果
SELECT 
    id,
    username,
    role,
    SUBSTR(password, 1, 30) || '...' as password_preview,
    '密码已重置为 admin123' as status
FROM users 
WHERE username = 'admin';

-- ========================================
-- 预期输出示例:
-- id | username | role  | password_preview              | status
-- 1  | admin    | admin | 4cb07fb4f629954aa6cdf6ee8963bb... | 密码已重置为 admin123
-- ========================================
