# 导出模块

统一的导出功能模块，支持PDF、Excel、Word三种格式，确保字号统一。

## 目录结构

```
export/
├── base-exporter.js      # 基础导出类
├── pdf-exporter.js       # PDF导出模块
├── excel-exporter.js     # Excel导出模块
├── word-exporter.js      # Word导出模块
├── export-manager.js     # 导出管理器
├── index.js              # 统一入口
└── README.md             # 说明文档
```

## 使用方法

### 基本使用

```javascript
import { exportManager } from './services/export/index.js';

// 导出PDF
await exportManager.exportAndDownload('pdf', template, data, 'invoice');

// 导出Excel
await exportManager.exportAndDownload('excel', template, data, 'invoice');

// 导出Word
await exportManager.exportAndDownload('word', template, data, 'invoice');
```

### 获取Blob（不自动下载）

```javascript
import { exportManager } from './services/export/index.js';

// 获取PDF Blob
const pdfBlob = await exportManager.export('pdf', template, data);

// 获取Excel Blob
const excelBlob = await exportManager.export('excel', template, data);

// 获取Word Blob
const wordBlob = await exportManager.export('word', template, data);
```

### 使用特定导出器

```javascript
import { PDFExporter } from './services/export/index.js';

const exporter = new PDFExporter({ useBackend: true });
const blob = await exporter.export(template, data);
```

## 导出格式

### PDF导出
- **格式**: PDF
- **扩展名**: `.pdf`
- **MIME类型**: `application/pdf`
- **实现方式**: 
  - 推荐：后端Puppeteer（效果最好）
  - 说明：为保证“可编辑PDF”，PDF导出仅使用后端 Puppeteer（前端 html2pdf 属于截图式PDF，不可编辑）

### Excel导出
- **格式**: Excel
- **扩展名**: `.xlsx`
- **MIME类型**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **实现方式**: 后端ExcelJS（支持统一字号）

### Word导出
- **格式**: Word
- **扩展名**: `.docx`
- **MIME类型**: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- **实现方式**: 后端docx库（支持统一字号）

## 字号统一

所有导出格式都使用`FontSizeManager`进行字号转换：

- **PDF**: 直接使用pt单位
- **Excel**: 使用`FontSizeManager.ptToExcel(pt)`转换
- **Word**: 使用`FontSizeManager.ptToWord(pt)`转换（半点单位）

## API接口

### 后端导出接口

所有导出接口都支持两种方式：

1. **新方式（推荐）**: 基于模板导出
   ```json
   POST /api/document-center/export/{format}
   {
     "template": { /* 模板配置 */ },
     "data": { /* 数据对象 */ },
     "fileName": "document"
   }
   ```

2. **旧方式（兼容）**: 基于HTML/订单ID导出
   ```json
   POST /api/document-center/export/{format}
   {
     "html": "<html>...</html>",  // 或 "orderId": 123
     "fileName": "document"
   }
   ```

## 扩展性

### 添加新的导出格式

```javascript
import { BaseExporter } from './base-exporter.js';
import { exportManager } from './export-manager.js';

class CustomExporter extends BaseExporter {
  static formatName = 'custom';
  static formatExtension = '.custom';
  static formatMime = 'application/custom';
  
  async export(template, data) {
    // 实现导出逻辑
    return blob;
  }
}

// 注册新格式
exportManager.register('custom', CustomExporter);
```

## 注意事项

1. **HTML渲染**: PDF和Word导出时，前端会先使用BlockRenderer渲染HTML，确保样式一致
2. **字号统一**: 所有导出格式都使用统一的字号转换规则
3. **向后兼容**: 导出接口同时支持新旧两种方式
4. **错误处理**: 导出失败时会抛出错误，需要捕获处理

## 示例

### 在单据生成页面使用

```javascript
import { exportManager } from '../services/export/index.js';

// 导出按钮点击事件
async function handleExport(format) {
  try {
    const template = getSelectedTemplate();
    const orderData = getOrderData();
    
    await exportManager.exportAndDownload(
      format, 
      template, 
      orderData, 
      `${orderData.order.contractNo}_${template.name}`
    );
    
    console.log('导出成功');
  } catch (error) {
    console.error('导出失败:', error);
    alert('导出失败: ' + error.message);
  }
}
```

