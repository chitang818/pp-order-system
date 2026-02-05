# PP 外贸订单管理系统 (PP Order System)

> 一个现代化、跨平台的外贸订单管理解决方案，支持桌面端（Tauri）和 Web 端双模式运行。

## 📖 项目简介

PP 外贸订单管理系统是专为外贸企业设计的业务管理工具，集成了订单管理、单证生成（发票、装箱单）、客户管理和财务统计等核心功能。系统采用前后端分离架构，结合 Tauri 技术，既保留了 Web 应用的灵活性，又提供了桌面应用的系统级集成体验。

### 🌟 核心功能

- **订单全流程管理**：从下单到出运的全生命周期追踪。
- **智能单证生成**：一键生成商业发票 (Invoice)、装箱单 (Packing
  List)、销售合同 (Sales Confirmation)。
- **多平台支持**：支持 Windows、macOS 和 Linux，同时提供 Web 访问模式。
- **本地化数据安全**：数据存储在本地 AppData 目录 (SQLite)，安全可控。
- **自动化工具**：内置浏览器自动化工具（用于跨平台数据抓取/同步）。

## 🛠️ 技术栈

- **前端**：Vue 3, Vite, TailwindCSS (如适用), JavaScript
- **后端**：Node.js, Express, SQLite3
- **桌面框架**：Tauri v2 (Rust)
- **测试**：Vitest

## 🚀 快速开始

本项目提供了高度自动化的开发脚本，位于 `scripts/` 目录。

### 环境要求

- Node.js 18+
- Rust (仅 Tauri 开发模式需要)
- npm 或 yarn

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境 (推荐)

使用我们的一键启动脚本，同时启动前端和后端服务：

```bash
# Windows
scripts\dev\快速启动.bat
```

或使用 npm 命令：

```bash
npm run dev:all
```

访问地址：

- 前端: http://localhost:5173
- 后端: http://localhost:3000

### 3. 启动桌面应用开发模式

如果您需要测试文件保存、系统托盘等原生功能：

```bash
# Windows
scripts\dev\Tauri开发.bat
```

## 📂 项目结构

```
pp-order-system/
├── backend/            # Node.js 后端服务 API
├── frontend/           # Vue 3 前端应用
├── src-tauri/          # Rust 桌面应用主进程代码
├── scripts/            # 开发与构建脚本 (详见 scripts/README.md)
├── docs/               # 项目文档
└── README.md           # 本文件
```

> 详细的目录说明和开发指南，请参考 [scripts/README.md](scripts/README.md)。

## 📦 构建与部署

请参考 `scripts/build/README.md` 获取详细的打包指南。

简易打包命令：

```bash
scripts\build\一键打包.bat
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request。

## 📄 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。
