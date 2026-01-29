# 模板编辑器 V2

新版模板编辑器，提供傻瓜式、可视化、零代码的模板创建体验。

## 功能特性

- ✅ **可视化编辑**：拖拽式添加区块，所见即所得
- ✅ **属性配置**：右侧面板实时配置区块属性
- ✅ **变量选择**：可视化选择数据变量，无需记忆变量名
- ✅ **字号统一**：统一的字号管理，确保导出格式一致
- ✅ **适用规则**：配置模板适用的客户和产品品类
- ✅ **实时预览**：随时预览模板效果

## 目录结构

```
template-editor-v2/
├── index.js                    # 编辑器主入口
├── block-palette.js            # 区块面板组件
├── editor-canvas.js            # 画布组件
├── property-panel.js           # 属性配置面板
├── variable-selector.js        # 变量选择器
├── font-size-selector.js       # 字号选择器
├── applicability-config.js     # 适用规则配置
├── styles.css                  # 样式文件
└── README.md                   # 说明文档
```

## 使用方法

### 基本使用

```javascript
import { TemplateEditorV2 } from './template-editor-v2/index.js';

// 创建编辑器实例
const editor = new TemplateEditorV2('editor-container', {
  template: null,  // 可选：初始模板
  mockData: null,  // 可选：预览数据
  onSave: (template) => {
    console.log('模板已保存:', template);
  },
  onBack: () => {
    console.log('返回');
  }
});

// 初始化编辑器
editor.init();
```

### HTML结构

```html
<div id="editor-container" style="height: 100vh;"></div>
```

### 加载现有模板

```javascript
const template = {
  id: 'template_001',
  name: 'INVOICE模板',
  type: 'invoice',
  blocks: [
    {
      id: 'block_001',
      type: 'company-header',
      config: { /* ... */ }
    },
    // ...
  ],
  pageSettings: { /* ... */ },
  globalStyles: { /* ... */ },
  applicability: { /* ... */ }
};

const editor = new TemplateEditorV2('editor-container', {
  template: template
});
editor.init();
```

### 获取模板数据

```javascript
const template = editor.getTemplate();
console.log(template);
```

## 组件说明

### TemplateEditorV2

主编辑器类，负责整体布局和协调各子组件。

**方法：**
- `init()` - 初始化编辑器
- `loadTemplate(template)` - 加载模板
- `getTemplate()` - 获取当前模板数据
- `preview()` - 预览模板
- `save()` - 保存模板

### BlockPalette

区块面板，显示所有可用的区块类型。

**功能：**
- 按类别分组显示区块
- 点击添加区块
- 支持拖拽（✅ 已实现）

### EditorCanvas

画布组件，显示模板的区块列表。

**功能：**
- 显示所有区块
- 选择区块
- 删除区块
- 区块排序（✅ 已实现）

### PropertyPanel

属性配置面板，根据选中的区块显示可配置属性。

**功能：**
- 自动识别区块属性定义
- 支持多种输入类型（text, number, select, boolean, color等）
- 集成变量选择器和字号选择器

### VariableSelector

变量选择器，提供可视化的数据变量选择。

**功能：**
- 分类显示变量树
- 点击选择变量
- 支持手动输入

### FontSizeSelector

字号选择器，统一管理字号设置。

**功能：**
- 预设字号选项
- 自定义字号输入
- 实时预览效果

### ApplicabilityConfig

适用规则配置组件，配置模板的适用范围。

**功能：**
- 设置默认模板
- 选择适用产品品类
- 选择适用客户
- 设置优先级

## 区块属性定义

每个区块通过 `getPropertyDefinitions()` 方法定义可配置的属性：

```javascript
static getPropertyDefinitions() {
  return [
    {
      name: 'text',              // 属性路径（支持嵌套，如 'style.fontSize'）
      label: '标题文本',         // 显示标签
      type: 'text',              // 类型：text, number, boolean, select, color, fontSize, variable, textarea
      required: false,           // 是否必填
      description: '提示信息'    // 说明文字
    },
    {
      name: 'style.fontSize',
      label: '字体大小',
      type: 'fontSize',          // 使用字号选择器
      min: 8,
      max: 72
    },
    {
      name: 'binding',
      label: '数据绑定',
      type: 'variable'           // 使用变量选择器
    }
  ];
}
```

## 样式定制

编辑器样式在 `styles.css` 中定义，可以通过覆盖CSS类来自定义样式。

主要CSS类：
- `.template-editor-v2` - 编辑器容器
- `.block-palette-panel` - 区块面板
- `.canvas-panel` - 画布面板
- `.property-panel` - 属性面板
- `.canvas-block` - 画布中的区块
- `.property-field` - 属性字段

## 注意事项

1. **容器高度**：编辑器需要明确的高度，建议使用 `100vh` 或固定高度
2. **数据格式**：模板数据格式需符合区块引擎规范
3. **API接口**：保存功能需要后端API支持 `/api/document-center/templates`
4. **浏览器兼容**：需要支持ES6+的现代浏览器

## 后续优化

- [x] 区块拖拽排序
- [ ] 列编辑器弹窗
- [ ] 撤销/重做功能
- [ ] 模板导入/导出
- [ ] 更多区块类型
- [ ] 响应式布局优化

