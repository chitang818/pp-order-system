/**
 * PP外贸订单管理系统 - 主入口文件（重构版）
 * 使用模块化架构，路由和服务分离
 */

const BACKEND_BOOT_T0 = Date.now();
/** 分段记录 Node 进程从 app.js 入口到各阶段的耗时（用于首启分析） */
function bootLog(label) {
  console.log(`[BackendBoot] ${label} +${Date.now() - BACKEND_BOOT_T0}ms`);
}
bootLog('app.js 开始');

const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

// 引入工具
const logger = require('./utils/logger');
// 引入配置
const config = require('./config');

// 引入数据库
const db = require('./db');

// 引入中间件
const { errorHandler, asyncHandler, createForbiddenError } = require('./middleware/errorHandler');
const { optionalAuth } = require('./middleware/auth');

// ==================== 路由注册 ====================
// 临时恢复所有路由 - Tauri 开发模式下 window.__TAURI__ 未定义
// 前端会降级到 HTTP API

// 核心路由（Rust Commands 已实现但开发模式下需要 HTTP fallback）
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const customersRoutes = require('./routes/customers');
const forwardersRoutes = require('./routes/forwarders'); // 新增货代路由
const productsRoutes = require('./routes/products');
const ordersRoutes = require('./routes/orders');
const companyRoutes = require('./routes/company');

// 未迁移的路由（document-center / export 含 puppeteer、docx 等重依赖，见下方懒加载挂载）
const storageRoutes = require('./routes/storage');
const dashboardRoutes = require('./routes/dashboard');
const remindersRoutes = require('./routes/reminders');
const logsRoutes = require('./routes/logs');
const orderConfigsRoutes = require('./routes/order-configs');

// 引入服务
const LogService = require('./services/LogService');

bootLog('顶层 sync require 完成（document-center/export 未加载）');
// const OrderService = require('./services/OrderService');

// 异步初始化数据库（不阻塞服务器启动）
let dbInitialized = false;
if (db.db && !db.db.isMock) {
  db.init((err) => {
    if (err) {
      logger.error('[DB] 数据库初始化失败:', err);
    } else {
      dbInitialized = true;
      logger.info('[DB] 数据库初始化完成');

      // 数据库初始化完成后，再执行种子数据检查
      seedCompanyIfEmpty();

      try {
        const ProductSyncService = require('./services/ProductSyncService');
        if (db.db && !db.db.isMock) {
          ProductSyncService.startScheduler(db.db);
        }
      } catch (e) {
        logger.warn('[ProductSyncScheduler] 启动失败:', e.message);
      }
    }
  });
} else {
  logger.info('[DB] 数据库连接未就绪，跳过自动初始化。');
}

// 若数据库中无公司配置，尝试从 data/company.json 种子导入
function seedCompanyIfEmpty() {
  db.getCompany((err, row) => {
    if (err) { console.error('DB error getCompany', err); return; }
    if (row) return; // 已存在
    try {
      const seedPath = path.join(config.dataRoot, 'company.json');
      let payload = config.defaultCompany;
      if (fs.existsSync(seedPath)) {
        const raw = fs.readFileSync(seedPath, 'utf8');
        const obj = JSON.parse(raw || '{}');
        payload = { ...config.defaultCompany, ...obj };
      }
      db.setCompany(payload, (e2) => {
        if (e2) console.error('Seed company failed', e2);
        else console.log('Seeded company config');
      });
    } catch (e) { console.error('Seed company exception', e); }
  });
}

const app = express();

/**
 * 首次命中对应路径时再 require。
 * 收益：显著缩短进程启动到 app.listen 的时间（Tauri 轮询 3000 更快结束）。
 * 代价：第一次访问单据中心/导出相关接口时可能多一次磁盘加载；后续请求走缓存模块。
 */
function lazyApiRouter(relativePath) {
  let router = null;
  return (req, res, next) => {
    if (!router) {
      router = require(relativePath);
      bootLog(`懒加载路由 ${relativePath}`);
    }
    return router(req, res, next);
  };
}

// 添加请求日志中间件（生产环境可禁用或简化以减少I/O开销）
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    logger.info(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });
}

// CORS 配置
app.use(cors(config.cors));

// 启用响应压缩（gzip/deflate），提升传输效率
app.use(compression());

// 请求体解析
app.use(bodyParser.json({ limit: config.export.maxFileSize }));
app.use(cookieParser());

// 注意：操作日志功能已迁移到 LogService，各路由文件中已使用

// ==================== 路由注册 ====================

// 健康检查端点（不需要认证，用于启动检测）
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    mode: 'hybrid', // 混合模式：部分Rust + 部分Node.js
    rust_apis: ['auth', 'users', 'products', 'customers', 'company', 'order-configs', 'orders(query)'],
    nodejs_apis: ['export', 'document-center', 'dashboard', 'orders(crud)', 'storage'],
    timestamp: new Date().toISOString(),
    note: 'Hybrid Mode: Core business logic migrated to Rust. Node.js handles complex logic and legacy routes.'
  });
});

// 关闭端点（供 Tauri 在退出前调用，用于优雅关闭 Puppeteer 等资源）
app.post('/api/shutdown', async (req, res) => {
  logger.info('[Shutdown] 收到关闭请求');

  // 先返回响应，然后异步执行关闭
  res.json({ success: true, message: '正在关闭...' });

  // 延迟执行关闭，确保响应已发送
  setTimeout(async () => {
    try {
      // 关闭 Puppeteer 浏览器实例
      const PdfExportService = require('./services/PdfExportService');
      if (PdfExportService.browserInstance) {
        logger.info('[Shutdown] 正在关闭 Puppeteer 浏览器实例...');
        await PdfExportService.browserInstance.close();
        PdfExportService.browserInstance = null;
        logger.info('[Shutdown] Puppeteer 浏览器已关闭');
      }
    } catch (err) {
      logger.error('[Shutdown] 关闭 Puppeteer 失败:', err.message);
    }

    // 退出进程
    logger.info('[Shutdown] 正在退出进程...');
    process.exit(0);
  }, 100);
});

// 应用可选认证中间件到所有API路由
app.use('/api', optionalAuth);
// 已登录用户自动下发 CSRF Cookie；写操作启用 CSRF 保护
const { ensureCsrfCookieIfAuthenticated, protectIfAuthenticated } = require('./middleware/csrf');
app.use('/api', ensureCsrfCookieIfAuthenticated);
app.use('/api', protectIfAuthenticated);

// ==================== 活跃路由 ====================
// 混合模式：支持 Tauri Invoke（桌面应用）+ HTTP API（Web 开发模式）
// 在 Tauri 开发模式下，window.__TAURI__ 未定义，前端会降级到 HTTP API
// 因此需要保持这些路由启用，以支持 Web 开发模式

// 核心业务路由（同时支持 Tauri Invoke 和 HTTP fallback）
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/forwarders', forwardersRoutes); // 新增货代路由
app.use('/api/products', productsRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/order-configs', orderConfigsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/document-center', lazyApiRouter('./routes/document-center'));

// 导出服务预热端点：前端进入单据生成页时调用，后台异步加载重型依赖
app.post('/api/export/warmup', (req, res) => {
  res.json({ success: true, message: '预热任务已启动' });
  setImmediate(() => {
    try {
      require('./routes/document-center');
      require('./routes/export');
      bootLog('warmup: document-center + export 路由已加载');
    } catch (e) {
      console.warn('[warmup] 预热加载失败:', e.message);
    }
  });
});
app.use('/api/logs', logsRoutes);

// Node.js 保留的服务（需要 Puppeteer 或复杂文件操作）
app.use('/api/storage', storageRoutes);  // 数据库导入/导出/备份
app.use('/api/export', lazyApiRouter('./routes/export'));    // PDF/Word/Excel 导出

// ==================== 兼容旧接口 ====================

// 兼容旧接口：数据库备份 /api/db/backup -> /api/storage/backup
// 注意：这个路由必须在 /api/storage 路由注册之后定义，以确保正确转发
app.get('/api/db/backup', (req, res, next) => {
  // 修改请求路径，使其匹配 storageRoutes 中的 /backup 路由
  req.url = '/backup';
  req.originalUrl = '/api/storage/backup';
  // 直接调用 storageRoutes 中间件
  storageRoutes(req, res, next);
});

// 兼容旧接口：数据库导入 /api/db/import -> /api/storage/import
// 注意：这个路由必须在 /api/storage 路由注册之后定义，以确保正确转发
app.post('/api/db/import', (req, res, next) => {
  // 修改请求路径，使其匹配 storageRoutes 中的 /import 路由
  req.url = '/import';
  req.originalUrl = '/api/storage/import';
  // 直接调用 storageRoutes 中间件
  storageRoutes(req, res, next);
});

// 兼容旧接口：系统重置 /api/reset -> /api/storage/reset
// 直接定义路由处理器，使用与 storage 路由相同的处理逻辑
app.post('/api/reset', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const pwd = String(body.password || '').trim();
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const timestamp = new Date().toISOString();

  // 记录初始化尝试的审计日志
  logger.audit(`[AUDIT] ${timestamp} - 系统初始化尝试 - IP: ${clientIP}, User-Agent: ${userAgent}`);

  if (pwd !== 'pp520') {
    // 记录密码错误的审计日志
    logger.audit(`[AUDIT] ${timestamp} - 系统初始化失败：密码错误 - IP: ${clientIP}`);
    await LogService.logOperation(req, '系统初始化', '数据库设置', '', '系统初始化失败：密码错误', 'failure', '密码验证失败');
    throw createForbiddenError('密码验证失败');
  }

  // 记录初始化开始的审计日志
  logger.audit(`[AUDIT] ${timestamp} - 系统初始化开始 - IP: ${clientIP}`);

  // 直接执行原子清空：删除所有订单项、订单、客户、产品；公司重置为默认
  const sqlite = db.db;
  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    sqlite.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  try {
    await runAsync('BEGIN TRANSACTION');
    await runAsync('DELETE FROM order_items');
    await runAsync('DELETE FROM orders');
    await runAsync('DELETE FROM customers');
    await runAsync('DELETE FROM products');
    await runAsync('DELETE FROM order_configs');
    await runAsync('COMMIT');
    console.log(`[AUDIT] ${timestamp} - 数据库清理完成：订单项、订单、客户、产品、订单参数配置已删除`);
  } catch (error) {
    await runAsync('ROLLBACK').catch(() => { }); // 忽略回滚错误
    logger.audit(`[AUDIT] ${timestamp} - 系统初始化失败：数据库清理失败 - ${error.message}`);
    throw error;
  }

  // 公司重置：初始化系统时，完全清空公司配置，重置为默认空值
  // 将公司重置操作也包含在事务中，确保原子性
  try {
    await runAsync('BEGIN TRANSACTION');
    // 删除现有公司配置记录
    await runAsync('DELETE FROM company');
    logger.audit(`[AUDIT] ${timestamp} - 公司配置记录已删除`);

    // 重置为公司设置的默认空值（不使用种子文件，确保完全清空）
    // 使用事务内的 SQL 直接插入空记录，避免使用 db.setCompany（它可能触发其他逻辑）
    const emptyCompany = { ...config.defaultCompany };
    const companyFields = [
      'companyNameCN', 'companyNameEN', 'companyAddressCN', 'companyAddressEN',
      'companyTel', 'companyFax', 'signAt', 'logoUrl', 'themeColor', 'fontSize',
      'headerProduction', 'headerInvoice', 'headerPacking', 'headerSales'
    ];
    const companyValues = companyFields.map(field => emptyCompany[field] || '');
    const placeholders = companyFields.map(() => '?').join(', ');
    await runAsync(
      `INSERT INTO company (id, ${companyFields.join(', ')}) VALUES (1, ${placeholders})`,
      companyValues
    );
    await runAsync('COMMIT');
    logger.audit(`[AUDIT] ${timestamp} - 公司配置已重置为默认空值`);
  } catch (error) {
    await runAsync('ROLLBACK').catch(() => { }); // 忽略回滚错误
    logger.audit(`[AUDIT] ${timestamp} - 重置公司配置失败:`, error.message);
    // 如果重置失败，尝试使用 db.setCompany 作为备选方案
    try {
      await new Promise((resolve, reject) => {
        const emptyCompany = { ...config.defaultCompany };
        db.setCompany(emptyCompany, (err) => {
          if (err) {
            console.error(`[AUDIT] ${timestamp} - 备选方案：重置公司配置失败:`, err.message);
            reject(err);
          } else {
            console.log(`[AUDIT] ${timestamp} - 备选方案：公司配置已重置为默认空值`);
            resolve();
          }
        });
      });
    } catch (fallbackError) {
      logger.error(`[AUDIT] ${timestamp} - 所有重置公司配置的方案都失败:`, fallbackError.message);
      // 不抛出错误，继续执行，让用户知道初始化部分完成
    }
  }

  // 记录初始化成功的审计日志
  logger.audit(`[AUDIT] ${timestamp} - 系统初始化成功 - IP: ${clientIP} - 所有数据已清空，公司配置已重置`);
  await LogService.logOperation(req, '系统初始化', '数据库设置', '', '系统初始化成功，所有数据已清空');

  res.json({ success: true, ok: true });
}));

// ==================== 静态文件服务 ====================

// 印章图片路由（备用访问方式）
app.get('/stamp', (req, res) => {
  const stampPath = path.resolve(__dirname, '..', 'images', 'AuthSig.png');
  console.log('Stamp request - Path:', stampPath);
  console.log('Stamp request - File exists:', fs.existsSync(stampPath));

  if (fs.existsSync(stampPath)) {
    console.log('Sending stamp file');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(stampPath);
  } else {
    console.log('Stamp file not found');
    res.status(404).send('Stamp not found');
  }
});

// 图片路由处理
const imagesDir = path.resolve(__dirname, '..', 'images');
app.get('/images/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(imagesDir, filename);

  console.log(`Images request - File: ${filename}`);
  console.log(`Images request - Path: ${filePath}`);
  console.log(`Images request - File exists: ${fs.existsSync(filePath)}`);

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    if (ext === '.gif') contentType = 'image/gif';
    if (ext === '.bmp') contentType = 'image/bmp';
    if (ext === '.svg') contentType = 'image/svg+xml';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
    console.log(`Sending images file: ${filename}`);
  } else {
    console.log(`Images file not found: ${filename}`);
    res.status(404).send('Image not found');
  }
});

// 静态文件服务
app.use('/images', express.static(imagesDir, {
  maxAge: '1h',
  etag: true,
  lastModified: true
}));

// 只在生产模式下提供前端静态文件服务
// 开发模式下，前端由 Vite 开发服务器提供（端口 5173）
if (config.nodeEnv === 'production') {
  // 生产环境静态资源缓存策略：HTML 不缓存，静态资源 7 天
  app.use(express.static(config.publicRoot, {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        // 7 天缓存
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
    }
  }));

  // SPA 路由
  app.get('/', (req, res) => {
    res.sendFile(path.join(config.publicRoot, 'index.html'));
  });
  app.get(['/index.html', '/docs.html', '/customer-new.html'], (req, res) => {
    res.sendFile(path.join(config.publicRoot, req.path));
  });

  // 前端脚本路由（兼容）
  app.get('/api.js', (req, res) => {
    res.sendFile(path.join(config.publicRoot, 'js', 'api', 'api.js'));
  });
  app.get('/spa.js', (req, res) => {
    res.sendFile(path.join(config.publicRoot, 'js', 'pages', 'spa.js'));
  });
} else {
  // 开发模式下，提示使用 Vite 开发服务器
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>开发模式提示</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 100px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #2c3e50; margin-top: 0; }
          .info { background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .link { 
            display: inline-block; 
            margin-top: 15px; 
            padding: 10px 20px; 
            background: #2196F3; 
            color: white; 
            text-decoration: none; 
            border-radius: 4px;
          }
          .link:hover { background: #1976D2; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🚀 开发模式</h1>
          <div class="info">
            <strong>后端 API 服务器正在运行</strong><br>
            端口: 3000<br>
            当前模式: 开发模式
          </div>
          <p>前端应用由 <strong>Vite 开发服务器</strong> 提供，请访问：</p>
          <a href="http://localhost:5173" class="link">打开前端应用 (http://localhost:5173)</a>
          <p style="margin-top: 20px; color: #666; font-size: 14px;">
            💡 提示：开发模式下，前端文件由 Vite 提供（支持热重载），后端只提供 API 服务。
          </p>
        </div>
      </body>
      </html>
    `);
  });
}

// ==================== 404 处理 ====================
// API 路由 404 处理 - 返回 JSON 而不是 HTML
// 使用中间件检查所有以 /api 开头的未匹配路由
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}`
    });
  }
  next();
});

// ==================== 错误处理 ====================
// 全局错误处理中间件必须放在最后
app.use(errorHandler);

// ==================== 启动服务器 ====================
bootLog('即将 app.listen（端口绑定后 TCP 即可连通）');
const startTime = Date.now();
const server = app.listen(config.port, () => {
  const startupTime = Date.now() - startTime;
  bootLog(`HTTP listen 回调（绑定耗时约 ${startupTime}ms）`);
  logger.info('================================================================');
  logger.info('🚀 PP订单管理系统 - 混合架构后端服务');
  logger.info('================================================================');
  logger.info(`[Status]  Server running at http://127.0.0.1:${config.port}/`);
  logger.info(`[Info]    Mode: ${config.nodeEnv}`);
  logger.info(`[Info]    Database: ${config.db.path}`);
  logger.info(`[Perf]    Listen bind latency: ${startupTime}ms`);
  logger.info(`[Perf]    Process start → listening: ${Date.now() - BACKEND_BOOT_T0}ms (sync require + 路由注册)`);
  logger.info('----------------------------------------------------------------');
  logger.info('✅ 运行模式: Tauri (Rust) + Node.js (辅助服务)');
  logger.info('');
  logger.info('📌 Node.js 仅负责以下功能 (Legacy Support):');
  logger.info('   1. 文档导出服务 (PDF/Word/Excel) -> /api/export');
  logger.info('   2. 数据存储辅助 (Import/Backup)  -> /api/storage');
  logger.info('');
  logger.info('⚡ 核心业务已完全迁移至 Rust后端 (Tauri Commands)');
  logger.info('----------------------------------------------------------------');

  if (config.nodeEnv === 'development') {
    console.log('🛠️  开发环境提示:');
    console.log('   - Backend API: http://127.0.0.1:3000/api');
    console.log('   - Frontend:    http://localhost:5173 (Vite)');
    console.log('================================================================');
  }
});

// ==================== 优雅关闭处理 ====================
// 优雅关闭函数（按需 require PdfExportService，避免 listen 后再同步拉起重依赖）
async function gracefulShutdown(signal) {
  logger.info(`[Shutdown] 收到 ${signal} 信号，正在优雅关闭...`);

  // 1. 关闭 Puppeteer 浏览器实例
  try {
    const PdfExportService = require('./services/PdfExportService');
    if (PdfExportService.browserInstance) {
      logger.info('[Shutdown] 正在关闭 Puppeteer 浏览器实例...');
      await PdfExportService.browserInstance.close();
      PdfExportService.browserInstance = null;
      logger.info('[Shutdown] Puppeteer 浏览器已关闭');
    }
  } catch (err) {
    logger.error('[Shutdown] 关闭 Puppeteer 浏览器失败:', err.message);
  }

  // 2. 关闭 HTTP 服务器
  server.close(() => {
    logger.info('[Shutdown] HTTP 服务器已关闭');

    // 3. 关闭数据库连接
    if (db.db && typeof db.db.close === 'function') {
      db.db.close((err) => {
        if (err) {
          logger.error('[Shutdown] 关闭数据库失败:', err.message);
        } else {
          logger.info('[Shutdown] 数据库连接已关闭');
        }
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  // 如果 5 秒内没有完成关闭，强制退出
  setTimeout(() => {
    logger.warn('[Shutdown] 关闭超时，强制退出');
    process.exit(1);
  }, 5000);
}

// 监听退出信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Windows 不支持 SIGTERM，但 taskkill 会触发进程退出
// 监听 exit 事件作为最后的清理机会
process.on('exit', (code) => {
  logger.info(`[Shutdown] 进程退出，退出码: ${code}`);
});

module.exports = app;
