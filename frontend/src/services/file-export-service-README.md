# 统一文件导出服务使用说明

## 概述

`FileExportService` 是一个统一的文件导出服务模块，封装了所有文件导出和保存逻辑，支持 Tauri 文件对话框和浏览器下载。所有页面的导出功能都应该使用此服务，而不是直接调用 `file-save-helper`。

## 优势

1. **统一管理**：所有文件保存逻辑集中在一个模块
2. **易于维护**：只需修改一处即可更新所有导出功能
3. **代码复用**：各页面只需调用统一接口
4. **扩展性强**：新增导出功能只需调用服务即可
5. **自动处理**：自动处理 Tauri 和浏览器环境的差异

## 使用方法

### 1. 从 Blob 导出文件

```javascript
import { FileExportService } from '../services/file-export-service.js';

// 生成文件 Blob
const blob = await generateExcelBlob();

// 导出 Excel
await FileExportService.exportExcel(blob, '订单数据.xlsx');

// 导出 Word
await FileExportService.exportWord(blob, '订单数据.docx');

// 导出 PDF
await FileExportService.exportPDF(blob, '订单数据.pdf');

// 导出 CSV
await FileExportService.exportCSV(blob, '订单数据.csv');

// 通用方法（指定文件类型）
await FileExportService.exportAndSave(blob, '订单数据.xlsx', 'Excel文件');
```

### 2. 从 API 响应导出文件

```javascript
import { FileExportService } from '../services/file-export-service.js';

// 从 Fetch 响应导出
const response = await fetch('/api/document-center/export/excel', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId, templateId, fileName })
});

await FileExportService.exportFromResponse(response, '订单数据.xlsx', 'Excel文件');
```

### 3. 从 URL 导出文件

```javascript
import { FileExportService } from '../services/file-export-service.js';

await FileExportService.exportFromUrl(
  '/api/document-center/export/excel',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, templateId, fileName })
  },
  '订单数据.xlsx',
  'Excel文件'
);
```

### 4. 自定义选项

```javascript
import { FileExportService } from '../services/file-export-service.js';

await FileExportService.exportExcel(blob, '订单数据.xlsx', {
  successMessage: '订单数据导出成功！',  // 自定义成功消息
  showNotification: true                  // 是否显示通知（默认 true）
});
```

## 返回值

- **Tauri 环境**：
  - `string`：保存的文件路径（用户选择了保存位置）
  - `null`：用户取消了保存操作
- **浏览器环境**：
  - `undefined`：文件已下载到默认下载文件夹

## 已更新的服务

以下服务已更新为使用 `FileExportService`：

1. **DocumentCenterService** - 单据中心服务
   - `exportPDF()` - PDF 导出
   - `exportWord()` - Word 导出
   - `exportExcel()` - Excel 导出

2. **ExportManager** - 导出管理器
   - `exportAndDownload()` - 导出并下载（支持所有格式）

## 已更新的页面

以下页面的导出功能已更新为使用 `FileExportService`：

1. **单据生成页面** (`document-center-generate-page.js`)
   - 通过 `DocumentCenterService` 使用统一服务

2. **文档生成器** (`docs.js`)
   - Excel 导出
   - Word 导出
   - PDF 导出（可编辑 PDF）

3. **出口统计视图** (`export-statistics-view.js`)
   - Excel 导出

4. **订单分析视图** (`order-analysis-view.js`)
   - 订单分析 Excel 导出
   - 出货情况统计表 Excel 导出
   - 用料情况统计表 Excel 导出

5. **客户分析视图** (`customer-analysis-view.js`)
   - 订单分析 Excel 导出

6. **导出工具** (`export-utils.js`)
   - 客户数据 CSV 导出

## 迁移指南

### 旧代码（不推荐）

```javascript
// ❌ 不推荐：直接使用 file-save-helper
const { saveFile, isTauriEnvironment } = await import('../utils/file-save-helper.js');
const savedPath = await saveFile(blob, fileName, 'Excel文件');

if (savedPath) {
  window.NotificationSystem?.toast(`Excel导出完成\n保存位置: ${savedPath}`, 'success', 4000);
} else if (savedPath === null) {
  window.NotificationSystem?.toast('已取消导出', 'info');
} else {
  const downloadPath = isTauriEnvironment() 
    ? '默认下载文件夹' 
    : '浏览器默认下载文件夹';
  window.NotificationSystem?.toast(`Excel导出完成\n文件名: ${fileName}\n保存位置: ${downloadPath}`, 'success', 3000);
}
```

### 新代码（推荐）

```javascript
// ✅ 推荐：使用统一文件导出服务
import { FileExportService } from '../services/file-export-service.js';

await FileExportService.exportExcel(blob, fileName);
```

## 注意事项

1. **文件扩展名**：文件名必须包含正确的扩展名（如 `.xlsx`、`.docx`、`.pdf`）
2. **文件类型描述**：用于 Tauri 文件对话框的文件类型筛选
3. **错误处理**：服务会自动显示错误通知，但建议在调用处也进行 try-catch 处理
4. **通知系统**：确保 `window.NotificationSystem` 已初始化

## 技术实现

- **Tauri 环境**：使用 `@tauri-apps/plugin-dialog` 和 `@tauri-apps/plugin-fs` 实现原生文件保存对话框
- **浏览器环境**：使用 `URL.createObjectURL` 和 `<a>` 标签触发下载
- **自动回退**：如果 Tauri API 不可用，自动回退到浏览器下载

## 相关文件

- `frontend/src/services/file-export-service.js` - 统一文件导出服务
- `frontend/src/utils/file-save-helper.js` - 底层文件保存工具（被服务调用）
- `frontend/src/services/document-center-service.js` - 单据中心服务（已更新）
- `frontend/src/services/export/export-manager.js` - 导出管理器（已更新）

