# 模板引擎 (Template Engine)

新的模板引擎系统，用于解析和渲染单据中心模板。

## 目录结构

```
template-engine/
├── parser/              # 解析器
│   ├── tokenizer.js     # 词法分析器
│   ├── ast-builder.js   # AST构建器
│   └── template-parser.js # 模板解析器
├── resolver/            # 解析器
│   ├── variable-resolver.js # 变量解析器
│   ├── filter-registry.js   # 过滤器注册表
│   └── data-accessor.js     # 数据访问器
├── binder/              # 绑定器（阶段二）
│   ├── data-binder-v2.js     # 新数据绑定器
│   ├── loop-processor.js     # 循环处理器
│   └── condition-processor.js # 条件处理器
├── validator/           # 验证器（阶段三）
├── utils/               # 工具类
│   ├── cache.js         # 缓存工具
│   └── error-handler.js # 错误处理
└── index.js             # 主入口
```

## 核心组件

### 1. Tokenizer (词法分析器)

将模板字符串分解为标记（Token）。

```javascript
import { Tokenizer } from './template-engine/index.js';

const template = '{{order.contractNo}}';
const tokens = Tokenizer.tokenize(template);
```

### 2. TemplateParser (模板解析器)

将模板字符串解析为抽象语法树（AST）。

```javascript
import { TemplateParser } from './template-engine/index.js';

const template = '{{order.contractNo}}';
const ast = TemplateParser.parse(template);

// 验证模板
const validation = TemplateParser.validate(template);
if (validation.valid) {
  console.log('模板有效');
} else {
  console.error('模板错误:', validation.errors);
}
```

### 3. VariableResolver (变量解析器)

解析变量名称，验证变量存在性，应用过滤器。

```javascript
import { VariableResolver } from './template-engine/index.js';

const resolved = VariableResolver.resolve('order.contractNo|format:2', {
  data: { order: { contractNo: 'SC2025-001' } }
});

const value = VariableResolver.getValue(resolved, data);
```

### 4. FilterRegistry (过滤器注册表)

管理和注册所有可用的过滤器。

```javascript
import { FilterRegistry } from './template-engine/index.js';

// 注册自定义过滤器
FilterRegistry.register('custom', (value, param) => {
  return `Custom: ${value} (${param})`;
});

// 应用过滤器
const result = FilterRegistry.apply('test', 'custom', ['param']);
```

### 5. DataAccessor (数据访问器)

根据命名空间和字段路径从数据对象中获取值。

```javascript
import { DataAccessor } from './template-engine/index.js';

const data = {
  order: {
    contractNo: 'SC2025-001',
    extras: {
      orderNo: 'NO-001'
    }
  }
};

const value = DataAccessor.getValue('order', 'contractNo', data);
const nestedValue = DataAccessor.getValue('order', 'extras.orderNo', data);
```

### 6. DataBinderV2 (数据绑定器) - 阶段二

绑定数据到模板，生成最终HTML。

```javascript
import { DataBinderV2 } from './template-engine/index.js';

const template = '合同号: {{order.contractNo}}';
const data = {
  order: { contractNo: 'SC2025-001' }
};

const result = DataBinderV2.bind(template, data);
// 输出: "合同号: SC2025-001"
```

### 7. LoopProcessor (循环处理器) - 阶段二

处理模板中的循环节点。

```javascript
import { LoopProcessor } from './template-engine/index.js';

const node = {
  type: 'LOOP',
  source: 'order.items',
  children: [...]
};

const result = LoopProcessor.process(node, data, context, processChildren);
```

### 8. ConditionProcessor (条件处理器) - 阶段二

处理模板中的条件节点。

```javascript
import { ConditionProcessor } from './template-engine/index.js';

const node = {
  type: 'CONDITION',
  test: 'order.items.length > 0',
  then: [...],
  else: [...]
};

const result = ConditionProcessor.process(node, data, context, processChildren);
```

## 内置过滤器

- `format` - 格式化数字：`{{order.totalAmount|format:2}}`
- `currency` - 货币格式：`{{order.totalAmount|currency:USD}}`
- `date` - 日期格式：`{{order.shipmentDate|date:YYYY-MM-DD}}`
- `upper` - 转大写：`{{order.contractNo|upper}}`
- `lower` - 转小写：`{{order.contractNo|lower}}`
- `default` - 默认值：`{{order.blNo|default:--}}`
- `number` - 转换为数字
- `string` - 转换为字符串
- `trim` - 去除首尾空格

## 使用示例

### 解析简单模板

```javascript
import { TemplateParser } from './template-engine/index.js';

const template = '合同号: {{order.contractNo}}';
const ast = TemplateParser.parse(template);
```

### 解析和绑定循环模板

```javascript
import { DataBinderV2 } from './template-engine/index.js';

const template = `
{{#each order.items}}
  <tr>
    <td>{{meta.index}}</td>
    <td>{{item.model}}</td>
    <td>{{item.quantity}}</td>
  </tr>
{{/each}}
`;

const data = {
  order: {
    items: [
      { model: 'Model-A', quantity: 100 },
      { model: 'Model-B', quantity: 200 }
    ]
  }
};

const result = DataBinderV2.bind(template, data);
// 输出包含两行的表格
```

### 解析带过滤器的变量

```javascript
const template = '总金额: {{order.totalAmount|format:2|currency:USD}}';
const ast = TemplateParser.parse(template);
```

## 错误处理

```javascript
import { SyntaxError, ErrorFormatter } from './template-engine/index.js';

try {
  const ast = TemplateParser.parse(template);
} catch (error) {
  if (error instanceof SyntaxError) {
    const formatted = ErrorFormatter.format(error, template);
    console.error('语法错误:', formatted);
  }
}
```

## 缓存

```javascript
import { globalCache } from './template-engine/index.js';

// 获取缓存的AST
let ast = globalCache.get(template);
if (!ast) {
  ast = TemplateParser.parse(template);
  globalCache.set(template, ast);
}
```

## 测试

运行测试：

```bash
npm test -- template-engine
```

## 完整使用示例

### 绑定完整模板

```javascript
import { DataBinderV2 } from './template-engine/index.js';

const template = `
  <div class="invoice">
    <h1>INVOICE</h1>
    <p>合同号: {{order.contractNo}}</p>
    <p>客户: {{customer.name}}</p>
    <table>
      <tbody>
        {{#each order.items}}
        <tr>
          <td>{{meta.index}}</td>
          <td>{{item.model}}</td>
          <td>{{item.quantity}}</td>
          <td>{{item.unitPrice|format:2}}</td>
        </tr>
        {{/each}}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3">总计</td>
          <td>{{order.totalAmount|format:2}}</td>
        </tr>
      </tfoot>
    </table>
  </div>
`;

const data = {
  order: {
    contractNo: 'SC2025-001',
    totalAmount: 1234.56,
    items: [
      { model: 'Model-A', quantity: 100, unitPrice: 5.5 },
      { model: 'Model-B', quantity: 200, unitPrice: 3.2 }
    ]
  },
  customer: {
    name: 'Test Customer'
  }
};

const html = DataBinderV2.bind(template, data);
```

## 下一步

阶段一和阶段二已完成，接下来将进行：
- 阶段三：集成到模板编辑器（变量自动补全、模板验证）
- 阶段四：优化单据生成页面
- 阶段五：迁移和测试

