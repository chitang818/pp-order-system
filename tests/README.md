# 测试目录说明

## 📁 目录结构

```
tests/
├── unit/              # 单元测试
│   ├── backend/       # 后端单元测试
│   │   └── utils.test.js
│   └── utils/         # 工具函数测试
│       └── sample.test.js
├── integration/       # 集成测试（待添加）
└── e2e/              # 端到端测试（待添加）
```

## 🧪 运行测试

### 所有测试
```bash
npm run test
```

### 测试覆盖率
```bash
npm run test:coverage
```

### 测试UI（推荐）
```bash
npm run test:ui
```

### 监听模式
```bash
npm run test
# 然后按 w 查看可用命令
```

## ✍️ 编写测试

### 基础测试示例

```javascript
import { describe, it, expect } from 'vitest';

describe('测试套件名称', () => {
  it('测试用例描述', () => {
    const result = 1 + 1;
    expect(result).toBe(2);
  });
});
```

### 异步测试示例

```javascript
import { describe, it, expect } from 'vitest';

describe('异步测试', () => {
  it('async/await', async () => {
    const data = await fetchData();
    expect(data).toBeDefined();
  });

  it('Promise', () => {
    return fetchData().then(data => {
      expect(data).toBeDefined();
    });
  });
});
```

### Mock 示例

```javascript
import { describe, it, expect, vi } from 'vitest';

describe('Mock 测试', () => {
  it('mock 函数', () => {
    const mockFn = vi.fn();
    mockFn('test');
    
    expect(mockFn).toHaveBeenCalled();
    expect(mockFn).toHaveBeenCalledWith('test');
  });
});
```

## 📋 测试清单

### 需要添加的测试

- [ ] 数据库连接测试
- [ ] API路由测试
- [ ] 认证中间件测试
- [ ] 订单管理测试
- [ ] 客户管理测试
- [ ] 产品管理测试
- [ ] 导出功能测试
- [ ] 工具函数测试

### 测试优先级

**高优先级**：
- 数据库操作
- 认证逻辑
- 核心业务逻辑

**中优先级**：
- API路由
- 中间件
- 工具函数

**低优先级**：
- UI交互
- 边缘情况

## 📊 测试覆盖率目标

| 类型 | 目标覆盖率 |
|------|-----------|
| 语句覆盖率 | 80% |
| 分支覆盖率 | 75% |
| 函数覆盖率 | 80% |
| 行覆盖率 | 80% |

## 💡 最佳实践

1. **测试命名**：清晰描述测试内容
2. **单一职责**：每个测试只测试一个功能点
3. **独立性**：测试之间互不依赖
4. **可重复性**：测试结果可重复
5. **快速执行**：避免耗时操作

## 🔗 相关文档

- [Vitest 官方文档](https://vitest.dev/)
- [测试最佳实践](https://testingjavascript.com/)

---

**最后更新**：2026年1月
