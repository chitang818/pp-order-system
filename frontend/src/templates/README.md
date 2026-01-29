# 单据模板库

本目录包含所有预定义的单据模板，包括默认模板、品类专用模板和客户专用模板。

## 目录结构

```
templates/
├── defaults/              # 默认模板（5个）
│   ├── sales-default.json
│   ├── production-default.json
│   ├── invoice-default.json
│   ├── packing-default.json
│   └── pickup-default.json
├── product-types/         # 品类专用模板（3个）
│   ├── production-type-a.json
│   ├── production-type-b.json
│   └── production-type-c.json
└── customers/            # 客户专用模板（2个）
    ├── invoice-dainen.json
    └── packing-dainen.json
```

## 模板清单

### 默认模板（5个）

| 模板名称 | 类型 | 适用范围 | 优先级 |
|---------|------|---------|--------|
| 销售确认书-标准模板 | sales | 全部客户/品类 | 0 |
| 生产通知单-标准模板 | production | 全部客户/品类 | 0 |
| 商业发票-标准模板 | invoice | 全部客户/品类 | 0 |
| 装箱单-标准模板 | packing | 全部客户/品类 | 0 |
| 拉货通知-标准模板 | pickup | 全部客户/品类 | 0 |

### 品类专用模板（3个）

| 模板名称 | 类型 | 适用品类 | 优先级 |
|---------|------|---------|--------|
| 生产通知单-A类品 | production | A类品 | 10 |
| 生产通知单-B类品 | production | B类品 | 10 |
| 生产通知单-C类品 | production | C类品 | 10 |

### 客户专用模板（2个）

| 模板名称 | 类型 | 适用客户 | 优先级 |
|---------|------|---------|--------|
| 商业发票-DAINEN专用 | invoice | DAINEN TRADING | 20 |
| 装箱单-DAINEN专用 | packing | DAINEN TRADING | 20 |

## 模板匹配规则

模板匹配优先级（从高到低）：

1. **客户+品类+类型** (优先级: 30+)
2. **客户+类型** (优先级: 20) - 如DAINEN专用模板
3. **品类+类型** (优先级: 10) - 如A/B/C类品模板
4. **默认模板** (优先级: 0)

## 模板导入

### 方法1：使用导入脚本

```javascript
import { importAllTemplates } from './templates/import-templates.js';

// 导入所有模板
await importAllTemplates();
```

### 方法2：使用API

```javascript
// 导入单个模板
const template = await import('./templates/defaults/invoice-default.json');

const response = await fetch('/api/document-center/templates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: template.name,
    type: template.type,
    config: template,
    applicability: template.applicability
  })
});
```

### 方法3：使用模板编辑器

1. 打开模板编辑器
2. 选择"导入模板"
3. 选择模板JSON文件
4. 保存

## 模板结构

每个模板包含以下字段：

```json
{
  "id": "模板ID",
  "name": "模板名称",
  "type": "单据类型",
  "applicability": {
    "isDefault": false,
    "productTypes": [],
    "customerIds": [],
    "customerNames": [],
    "priority": 0
  },
  "blocks": [
    // 区块配置数组
  ],
  "pageSettings": {
    "margin": {
      "top": 15,
      "bottom": 15,
      "left": 15,
      "right": 15
    }
  },
  "globalStyles": {
    "fontFamily": "Arial, \"Microsoft YaHei\", sans-serif",
    "fontSize": 11,
    "lineHeight": 1.4,
    "color": "#000"
  }
}
```

## 特殊说明

### DAINEN客户模板

DAINEN客户的INVOICE和PACKING LIST使用特殊的CONTRACT No格式：

- 字段绑定：`order.contractNoSpecial`
- 回退字段：`order.contractNo`（如果special不存在）

### 品类模板

A/B/C类品生产通知单模板：
- 自动匹配对应品类订单
- 显示品类标识
- 可配置品类特殊要求

## 模板更新

如需更新模板：

1. 修改对应的JSON文件
2. 使用模板编辑器重新导入
3. 或通过API更新现有模板

## 注意事项

1. **模板ID唯一性**：确保每个模板的ID唯一
2. **优先级设置**：客户专用 > 品类专用 > 默认模板
3. **数据绑定**：确保所有数据绑定路径正确
4. **字号统一**：所有字号使用pt单位，确保导出一致

