-- ========================================
-- 添加订单参数配置脚本
-- ========================================
-- 用途: 向现有数据库添加默认的订单参数配置
-- 使用方法: 使用 SQLite 工具执行此脚本
-- ========================================

-- Trade Terms
INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES 
('trade_term', 'CIF', 0, datetime('now'), datetime('now')),
('trade_term', 'CNF', 1, datetime('now'), datetime('now')),
('trade_term', 'FOB', 2, datetime('now'), datetime('now'));

-- Units
INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES 
('unit', '件', 0, datetime('now'), datetime('now')),
('unit', '托盘', 1, datetime('now'), datetime('now')),
('unit', '捆包', 2, datetime('now'), datetime('now'));

-- Cleanliness
INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES 
('cleanliness', 'A', 0, datetime('now'), datetime('now')),
('cleanliness', 'B', 1, datetime('now'), datetime('now')),
('cleanliness', 'B+', 2, datetime('now'), datetime('now'));

-- Safety Factor
INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES 
('safety_factor', '不写', 0, datetime('now'), datetime('now')),
('safety_factor', '5:1', 1, datetime('now'), datetime('now')),
('safety_factor', '6:1', 2, datetime('now'), datetime('now'));

-- B Label Configs
INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES 
('label_b', '红色KTC标签', 0, datetime('now'), datetime('now')),
('label_b', 'KT QR 食品标签', 1, datetime('now'), datetime('now')),
('label_b', 'ECHO标签', 2, datetime('now'), datetime('now')),
('label_b', 'JD标签（食品）', 3, datetime('now'), datetime('now')),
('label_b', 'KT标签', 4, datetime('now'), datetime('now')),
('label_b', 'AC标签', 5, datetime('now'), datetime('now')),
('label_b', '103K新标签', 6, datetime('now'), datetime('now')),
('label_b', 'SCC标签', 7, datetime('now'), datetime('now')),
('label_b', 'SSMD标签', 8, datetime('now'), datetime('now')),
('label_b', '无需标签', 9, datetime('now'), datetime('now'));

-- C Label Configs
INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES 
('label_c', 'KWS标签', 0, datetime('now'), datetime('now')),
('label_c', 'CD3标签', 1, datetime('now'), datetime('now')),
('label_c', 'F标签', 2, datetime('now'), datetime('now')),
('label_c', 'YS标签', 3, datetime('now'), datetime('now')),
('label_c', '无需标签', 4, datetime('now'), datetime('now'));

-- Wrapping Cloth
INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES 
('wrapping_cloth', '要', 0, datetime('now'), datetime('now')),
('wrapping_cloth', '不要', 1, datetime('now'), datetime('now'));

-- Box Type
INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES 
('box_type', '20GP', 0, datetime('now'), datetime('now')),
('box_type', '40GP', 1, datetime('now'), datetime('now')),
('box_type', '40HC', 2, datetime('now'), datetime('now')),
('box_type', '45HQ', 3, datetime('now'), datetime('now')),
('box_type', 'L-107', 4, datetime('now'), datetime('now')),
('box_type', '其他', 5, datetime('now'), datetime('now'));

-- Box Quantity
INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES 
('box_quantity', '1', 0, datetime('now'), datetime('now')),
('box_quantity', '2', 1, datetime('now'), datetime('now')),
('box_quantity', '3', 2, datetime('now'), datetime('now')),
('box_quantity', '4', 3, datetime('now'), datetime('now')),
('box_quantity', '5', 4, datetime('now'), datetime('now'));
