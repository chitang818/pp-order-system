import { defineConfig } from 'vite';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import legacy from '@vitejs/plugin-legacy';
import fs from 'fs';

// 在 ES 模块中获取 __dirname 的等价物
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ command, mode }) => {
  // 开发模式和构建模式使用不同的配置
  const isBuild = command === 'build';
  
  // 在开发模式下，拦截并静默代理连接错误
  if (mode === 'development') {
    // 保存原始的 console.error
    const originalConsoleError = console.error;
    
    // 重写 console.error 以过滤代理连接错误
    console.error = (...args) => {
      const errorMsg = args.join(' ');
      // 过滤掉后端启动时的连接错误（这是正常情况）
      if (
        errorMsg.includes('http proxy error') ||
        errorMsg.includes('ECONNREFUSED') ||
        (errorMsg.includes('127.0.0.1:3000') && errorMsg.includes('Error: connect'))
      ) {
        // 完全静默，不输出这些错误
        return;
      }
      // 其他错误正常输出
      originalConsoleError.apply(console, args);
    };
  }

  // 基础配置
  const baseConfig = {
    // 基础路径，必须为相对路径才能在 Electron (file://) 中正常工作
    base: './',
    // 设置根目录
    root: 'frontend',

    // 路径别名（统一前端目录层级的开发体验）
    resolve: {
      alias: {
        '@api': resolve(__dirname, 'frontend/src/api'),
        '@utils': resolve(__dirname, 'frontend/src/utils'),
        '@components': resolve(__dirname, 'frontend/src/components'),
        '@pages': resolve(__dirname, 'frontend/src/pages'),
        '@assets': resolve(__dirname, 'frontend/src/assets'),
        '@styles': resolve(__dirname, 'frontend/src/styles'),
      }
    },

    // 服务器配置
    server: {
      port: 5173, // Vite 开发服务器端口
      // 启用 HTTP/2 以提升性能（如果支持）
      http2: false,
      // 配置代理，将 /api 请求转发到后端服务器
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          ws: true, // 支持 WebSocket
          // 配置超时时间
          timeout: 30000,
          // 静默代理日志，避免启动时的连接错误输出噪音
          logLevel: 'silent',
          // 自定义日志提供者，完全静默所有代理日志（包括错误）
          logProvider: () => ({
            log: () => {},
            logError: () => {},
            logWarn: () => {},
            logInfo: () => {},
            logDebug: () => {}
          }),
          // 配置错误处理，静默处理连接错误（后端启动时可能暂时不可用）
          onError: (err, req, res) => {
            // 如果是连接被拒绝错误（后端未启动或暂时不可用），完全静默处理
            if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.message?.includes('ECONNREFUSED')) {
              // 如果响应对象存在且未发送，发送一个 503 响应
              if (res && !res.headersSent) {
                res.writeHead(503, {
                  'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                  success: false,
                  error: 'Service temporarily unavailable',
                  message: '后端服务正在启动中，请稍后重试'
                }));
              }
              // 完全静默处理，不输出任何错误日志（这是启动时的正常情况）
              // 前端代码会处理这些错误并重试
              return;
            }
            // 其他错误仅在非启动相关的情况下输出
            if (err.code !== 'EPIPE' && err.code !== 'ETIMEDOUT') {
              // 仅在开发环境且不是连接错误时输出
              if (mode === 'development') {
                console.error('[Vite Proxy] Error:', err.message);
              }
            }
          },
          configure: (proxy, options) => {
            // 完全静默代理错误日志
            // 拦截所有错误事件，特别是连接被拒绝的错误
            proxy.on('error', (err, req, res) => {
              // 如果是连接被拒绝或重置错误（后端启动时的正常情况），完全静默
              if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || 
                  err.message?.includes('ECONNREFUSED') || err.message?.includes('ECONNRESET')) {
                // 已经被 onError 处理，完全静默返回，不输出任何日志
                return;
              }
              // 其他错误仅在开发环境且不是常见网络错误时输出
              if (mode === 'development' && err.code !== 'EPIPE' && err.code !== 'ETIMEDOUT') {
                console.warn('[Vite Proxy] Error:', err.message);
              }
            });
            
            // 拦截代理日志输出，完全静默连接错误
            const originalLog = proxy.log;
            if (originalLog) {
              proxy.log = (req, res, target) => {
                // 完全静默处理，不输出任何代理日志
                // 只在需要调试时才启用（设置环境变量 VITE_DEBUG_PROXY=true）
                if (process.env.VITE_DEBUG_PROXY === 'true') {
                  originalLog(req, res, target);
                }
              };
            }
            
            // 拦截代理的日志方法，防止输出错误信息
            const originalLogger = proxy.logger;
            if (originalLogger) {
              proxy.logger = {
                ...originalLogger,
                error: (...args) => {
                  // 检查是否是连接错误，如果是则完全静默
                  const errorMsg = args.join(' ');
                  if (errorMsg.includes('ECONNREFUSED') || 
                      errorMsg.includes('ECONNRESET') ||
                      errorMsg.includes('connect') && errorMsg.includes('127.0.0.1:3000')) {
                    // 完全静默，不输出
                    return;
                  }
                  // 其他错误才输出
                  if (process.env.VITE_DEBUG_PROXY === 'true') {
                    originalLogger.error(...args);
                  }
                }
              };
            }
          },
          // 注意：后端启动可能需要几秒钟，前端会自动重试
          // 这些连接错误是正常的，不会影响最终功能
        }
      }
    },

    // 优化依赖预构建
    optimizeDeps: {
      // 预构建的依赖（包括ExcelJS，确保在浏览器中正常工作）
      include: [
        'exceljs',
        'jspdf',
        'html2canvas',
        'docx',
        'html-to-docx',
      ],
      // 排除的依赖（Tauri 插件仅在 Tauri 环境中可用，不应在浏览器中预构建）
      exclude: [
        '@tauri-apps/plugin-dialog',
        '@tauri-apps/plugin-fs'
      ],
      // 强制预构建，提高启动速度
      force: false,
      // 预构建缓存目录
      cacheDir: 'node_modules/.vite',
    },

    // 插件配置
    plugins: [
      // 构建后复制 HTML 视图模板到 dist/frontend/views（ViewLoader 依赖 ./views/*.html）
      ...(isBuild
        ? [
            {
              name: 'copy-frontend-views',
              apply: 'build',
              closeBundle() {
                const srcDir = resolve(__dirname, 'frontend/views');
                const outDir = resolve(__dirname, 'dist/frontend');
                const destDir = resolve(outDir, 'views');

                function copyDirRecursive(src, dest) {
                  if (!fs.existsSync(src)) return;
                  fs.mkdirSync(dest, { recursive: true });
                  const entries = fs.readdirSync(src, { withFileTypes: true });
                  for (const entry of entries) {
                    const s = join(src, entry.name);
                    const d = join(dest, entry.name);
                    if (entry.isDirectory()) {
                      copyDirRecursive(s, d);
                    } else if (entry.isFile()) {
                      fs.mkdirSync(dirname(d), { recursive: true });
                      fs.copyFileSync(s, d);
                    }
                  }
                }

                try {
                  copyDirRecursive(srcDir, destDir);
                  // eslint-disable-next-line no-console
                  console.log(`[copy-frontend-views] Copied ${srcDir} -> ${destDir}`);
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.warn('[copy-frontend-views] Failed to copy views:', e?.message || e);
                }
              }
            }
          ]
        : []),
      // 支持旧版浏览器（仅在构建时启用，开发服务器禁用以避免警告）
      // 开发环境通常使用现代浏览器，不需要 polyfill，也可以避免 DOMNodeInsertedIntoDocument 警告
      ...(isBuild ? [
        legacy({
          targets: ['defaults', 'not IE 11'],
          // 生成现代和传统版本的 chunk
          modernPolyfills: true,
          // 渲染传统浏览器需要的 polyfill
          renderLegacyChunks: true,
        })
      ] : [])
    ],

    // 公共路径
    // 指向项目根级的 public 目录，确保 /images/* 在开发与构建均可用
    publicDir: '../public',

    // 环境变量配置
    envPrefix: 'VITE_',

    // 定义全局常量替换
    // 注意：console 的移除应该在 esbuild 配置中处理，而不是在 define 中
    // define 只能用于简单的字符串字面量替换
    define: {
      __DEV__: JSON.stringify(!isBuild),
    },

    // 使用 esbuild 在生产环境移除 console
    esbuild: {
      drop: isBuild ? ['console', 'debugger'] : [],
    },
  };

  // 构建配置（仅在构建时添加，开发模式完全不设置 build 配置）
  if (isBuild) {
    baseConfig.build = {
      outDir: '../dist/frontend',
      emptyOutDir: true,

      // 代码分割和优化配置
      rollupOptions: {
        // 多入口配置
        input: {
          main: resolve(__dirname, 'frontend/index.html'),
          login: resolve(__dirname, 'frontend/login.html'),
          docs: resolve(__dirname, 'frontend/docs.html'),
          setupWizard: resolve(__dirname, 'frontend/setup-wizard.html'),
        },

        // 代码分割配置
        output: {
          // 手动代码分割：将共享依赖提取到单独的 chunk
          manualChunks: (id) => {
            // 将 node_modules 中的依赖分离到 vendor chunk
            if (id.includes('node_modules')) {
              // 将大型库分离到单独的 chunk
              if (id.includes('jspdf') || id.includes('html2canvas')) {
                return 'pdf-libs';
              }
              if (id.includes('docx') || id.includes('html-to-docx')) {
                return 'docx-libs';
              }
              // 其他第三方库
              return 'vendor';
            }

            // 将共享的工具类分离到 common chunk
            if (id.includes('/src/utils/')) {
              return 'utils';
            }

            // 将 API 层分离到 api chunk
            if (id.includes('/src/api/')) {
              return 'api';
            }

            // 将配置和组件分离到 config chunk
            if (id.includes('/src/config/') || id.includes('/src/components/')) {
              return 'config';
            }
          },

          // Chunk 文件命名策略
          chunkFileNames: (chunkInfo) => {
            const facadeModuleId = chunkInfo.facadeModuleId
              ? chunkInfo.facadeModuleId.split('/').pop().replace(/\.[^/.]+$/, '')
              : 'chunk';
            return `assets/js/${facadeModuleId}-[hash].js`;
          },

          // 入口文件命名策略
          entryFileNames: 'assets/js/[name]-[hash].js',

          // 资源文件命名策略
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash][extname]`;
            }
            if (/woff2?|eot|ttf|otf/i.test(ext)) {
              return `assets/fonts/[name]-[hash][extname]`;
            }
            return `assets/[name]-[hash][extname]`;
          },
        },
      },

      // 构建优化配置
      // Tree Shaking 默认启用（ESM 格式）
      // 启用 CSS 代码分割
      cssCodeSplit: true,

      // 资源内联阈值（小于此大小的资源会被内联为 base64）
      assetsInlineLimit: 4096, // 4KB

      // 启用源映射（生产环境建议关闭以提高安全性）
      sourcemap: false,

      // Chunk 大小警告阈值
      chunkSizeWarningLimit: 1000, // 1MB

      // 压缩配置（Vite 默认使用 esbuild 压缩，更快）
      // esbuild 会自动移除未使用的代码和 console（通过 define 配置）
      minify: 'esbuild', // 可选: 'terser' (更小的体积，但更慢)

      // 报告压缩后的大小
      reportCompressedSize: true,
    };
  }

  return baseConfig;
});
