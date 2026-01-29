# 区块渲染引擎 (Block Engine)

新版单据模板系统的核心渲染引擎，完全独立于 `docs.html`。

## 目录结构

```
block-engine/
├── index.js                 # 引擎入口，导出所有核心类
├── block-registry.js        # 区块注册表，管理所有区块类型
├── block-renderer.js        # 区块渲染器，负责渲染模板
├── data-resolver.js         # 数据解析器，解析数据绑定表达式
├── font-size-manager.js     # 字号管理器，统一管理字号
└── blocks/                  # 区块组件目录
    ├── base-block.js        # 基础区块类（所有区块的父类）
    └── ...                  # 其他具体区块实现
```

## 核心类说明

### BlockRegistry (区块注册表)
管理所有可用的区块类型，提供注册、获取、创建等功能。

```javascript
import { BlockRegistry } from './block-engine/index.js';

// 注册区块
BlockRegistry.register('company-header', CompanyHeaderBlock);

// 创建区块实例
const block = BlockRegistry.createBlock({ type: 'company-header', config: {...} });

// 获取所有区块类型
const types = BlockRegistry.getAllTypes();
```

### BlockRenderer (区块渲染器)
负责将模板配置渲染为HTML。

```javascript
import { BlockRenderer } from './block-engine/index.js';

// 渲染完整模板
const html = BlockRenderer.render(template, data);

// 渲染到DOM元素
BlockRenderer.renderToElement('preview-container', template, data);

// 只渲染内容（不包含完整HTML文档）
const content = BlockRenderer.renderContent(template, data);
```

### DataResolver (数据解析器)
解析数据绑定表达式，格式化值。

```javascript
import { DataResolver } from './block-engine/index.js';

// 解析绑定表达式
const value = DataResolver.resolve('order.contractNo', data);

// 格式化值
const formatted = DataResolver.format(1234.56, { format: 'currencyUSD' });
```

### FontSizeManager (字号管理器)
统一管理字号，确保各导出格式一致。

```javascript
import { FontSizeManager } from './block-engine/index.js';

// pt转Excel字号
const excelSize = FontSizeManager.ptToExcel(12);

// pt转Word字号（半点单位）
const wordSize = FontSizeManager.ptToWord(12);

// 获取CSS字号字符串
const cssSize = FontSizeManager.toCSSFontSize(12);
```

### BaseBlock (基础区块类)
所有区块组件的父类，提供通用方法。

```javascript
import { BaseBlock } from './block-engine/index.js';

class MyBlock extends BaseBlock {
  render(data) {
    // 实现渲染逻辑
  }
  
  static getDefaultConfig() {
    return { ... };
  }
  
  static getPropertyDefinitions() {
    return [ ... ];
  }
}
```

## 使用示例

```javascript
import { BlockRegistry, BlockRenderer } from './block-engine/index.js';

// 1. 注册区块（通常在应用启动时）
BlockRegistry.register('company-header', CompanyHeaderBlock);

// 2. 定义模板
const template = {
  type: 'invoice',
  blocks: [
    {
      id: 'block_001',
      type: 'company-header',
      config: { ... }
    }
  ],
  pageSettings: { margin: { top: 15, bottom: 15, left: 15, right: 15 } },
  globalStyles: { fontSize: 11 }
};

// 3. 准备数据
const data = {
  order: { contractNo: 'SC2025-001', ... },
  customer: { name: 'DAINEN TRADING', ... },
  company: { companyNameEN: 'QINGDAO SHENGCHI...', ... }
};

// 4. 渲染模板
const html = BlockRenderer.render(template, data);
```

## 注意事项

⚠️ **重要约束**：本引擎完全独立于 `docs.html`，不会修改 `docs.html` 的任何代码。

## 下一步

- 实现具体的区块组件（company-header, document-title, product-table 等）
- 实现模板编辑器 UI
- 实现导出模块

