# frontend/src/assets

统一管理前端静态资源：
- `images/` 图片与图标（SVG 优先）
- `icons/` 独立图标资源
- `fonts/` 字体文件

当前仍有资源位于项目根目录 `images/` 与 `frontend/css/` 引用，请在迁移时：
1. 将图片移动到 `assets/images/` 并更新 HTML/CSS 引用路径；
2. 保持构建兼容，逐步完成迁移，避免一次性大改造成风险。

## 与 public 的分工

- 放在 `frontend/src/assets` 的资源会参与打包（可指纹、按需加载），适合模块化导入：
  - 示例：`import logo from '@assets/images/logo.svg'`
- 放在 `public` 的资源原样拷贝到产物，不参与打包处理，适合直接通过 URL 引用：
  - 示例：`<img src="images/lpp.jpg">`
- 迁移建议：
  - 组件内使用的图标、按需图片 → `src/assets`；
  - 页面模板中静态背景或不需打包的通用图片 → `public/images`。