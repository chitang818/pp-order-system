/**
 * 应用配置管理
 * 支持环境变量覆盖默认值
 */

const path = require('path');

// 尝试加载 .env 文件（如果存在）
try {
  // 使用 require 方式加载，避免添加新依赖
  const fs = require('fs');
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = value;
          }
        }
      }
    });
  }
} catch (e) {
  // 忽略加载错误
}

const config = {
  // 服务器配置
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  // 路径配置
  root: __dirname,
  // 根据环境变量决定使用开发目录还是构建目录
  publicRoot: process.env.NODE_ENV === 'production'
    ? path.join(__dirname, '..', '..', 'dist', 'frontend')
    : path.join(__dirname, '..', '..', 'frontend'),
  dataRoot: process.env.DATA_ROOT || path.join(__dirname, '..', '..', 'data'),
  configRoot: process.env.CONFIG_ROOT || path.join(__dirname, '..', '..', 'config'),

  // 数据库配置
  // 优先使用 Tauri AppData 目录 (与 Rust 后端共享同一数据库)
  // Windows: C:\Users\<USER>\AppData\Roaming\com.pp.ordermanagement\data\erp.sqlite
  db: (() => {
    const appIdentifier = 'com.pp.ordermanagement';
    let dbPath = process.env.DB_PATH;

    if (!dbPath) {
      // 强制使用 Tauri AppData 目录 (符合用户要求：仅保留 Tauri AppData 路径)
      // 注意：这里不再检查目录是否存在，也不再回退到本地项目目录
      const appDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : process.env.HOME);

      if (appDataDir) {
        dbPath = path.join(appDataDir, appIdentifier, 'data', 'erp.sqlite');
        console.log('[DB] Enforcing Tauri AppData path:', dbPath);
      } else {
        console.warn('[DB] WARNING: Could not determine AppData directory. Database path might be invalid.');
      }
    }

    // 已移除本地回退逻辑


    // 关键修正：将计算出的统一路径设置回环境变量（仅在环境变量未设置时）
    // 确保后续初始化的 db/connection.js (它会读取 process.env.DB_PATH) 能获取到相同路径，
    // 避免 Node.js 后端打印两个不同的路径，或与 Rust 端不一致。
    // 注意：如果环境变量已设置（如从批处理脚本传递），则不应覆盖
    if (!process.env.DB_PATH) {
      process.env.DB_PATH = dbPath;
      console.log('[DB] 从 config/index.js 设置 DB_PATH 环境变量:', dbPath);
    } else {
      console.log('[DB] 使用已设置的 DB_PATH 环境变量:', process.env.DB_PATH);
    }

    return {
      path: dbPath,

      configPath: (process.env.CONFIG_ROOT || path.join(__dirname, '..', '..', 'config')) + '/config.json'
    };
  })(),

  // 认证配置
  auth: {
    sessionExpiry: Number(process.env.SESSION_EXPIRY || 7), // 天
    rememberMeExpiry: Number(process.env.REMEMBER_ME_EXPIRY || 30), // 天
    passwordMinLength: Number(process.env.PASSWORD_MIN_LENGTH || 6)
  },

  // 导出配置
  export: {
    puppeteerTimeout: Number(process.env.PUPPETEER_TIMEOUT || 30000),
    maxFileSize: process.env.MAX_FILE_SIZE || '50mb'
  },

  // 默认公司配置
  defaultCompany: {
    companyNameCN: "",
    companyNameEN: "",
    companyAddressCN: "",
    companyAddressEN: "",
    companyTel: "",
    companyFax: "",
    signAt: "",
    logoUrl: "",
    themeColor: "#2c3e50",
    fontSize: 14,
    headerProduction: "",
    headerInvoice: "",
    headerPacking: "",
    headerSales: ""
  },

  // CORS 配置
  cors: {
    origin: function (origin, callback) {
      // 允许没有 origin 的请求（如移动应用或 curl）
      if (!origin) return callback(null, true);

      // 允许 Tauri 和本地开发环境
      const allowedOrigins = [
        'tauri://localhost',
        'tauri://127.0.0.1',
        'http://localhost:1420',
        'http://127.0.0.1:1420',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      ];

      if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('tauri://') || origin === 'null') {
        callback(null, true);
      } else {
        // 在开发模式下允许所有
        if (process.env.NODE_ENV === 'development') {
          callback(null, true);
        } else {
          // 生产环境默认允许，避免配置丢失导致不可用，但打印警告
          console.warn('[CORS] Warning: Origin not explicitly allowed:', origin);
          callback(null, true);
        }
      }
    },
    credentials: true
  }
};

// 开发环境特殊配置
if (config.nodeEnv === 'development') {
  config.debug = true;
}

// 生产环境特殊配置
if (config.nodeEnv === 'production') {
  config.debug = false;
}

module.exports = config;

