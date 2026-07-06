/**
 * PDF 导出服务
 * 负责将 HTML 内容转换为 PDF 文档
 */

const path = require('path');
const fs = require('fs');
const config = require('../config');
const BrowserFinder = require('../utils/browser-finder');

class PdfExportService {

  // 单例浏览器实例
  static browserInstance = null;
  static isLaunching = false;

  /**
   * 获取浏览器实例（单例模式）
   */
  static async getBrowser() {
    // 如果浏览器正在运行且连接正常，直接返回
    if (this.browserInstance && this.browserInstance.isConnected()) {
      return this.browserInstance;
    }

    // 如果正在启动中，等待现有启动完成（简单的防抖）
    if (this.isLaunching) {
      console.log('[PDF导出] 浏览器正在启动中，等待...');
      // 简单轮询等待
      const start = Date.now();
      while (this.isLaunching) {
        if (Date.now() - start > 120000) { // 延长到 120 秒
          this.isLaunching = false; // 超时后重置状态
          throw new Error('等待浏览器启动超时 (120s)');
        }
        await new Promise(r => setTimeout(r, 500)); // 增加轮询间隔，减少CPU占用
        if (this.browserInstance && this.browserInstance.isConnected()) return this.browserInstance;
      }
    }

    this.isLaunching = true;

    try {
      console.log('[PDF导出] 初始化浏览器实例...');

      // 动态导入puppeteer（首次使用时才加载）
      let puppeteer;
      try {
        console.log('[PDF导出] 正在加载 puppeteer-core...');
        console.log('[PDF导出] 当前工作目录:', process.cwd());
        console.log('[PDF导出] 模块搜索路径:', JSON.stringify(module.paths, null, 2));
        
        puppeteer = require('puppeteer-core');
        console.log('[PDF导出] puppeteer-core 模块加载成功');
      } catch (err) {
        console.error('[PDF导出] Puppeteer加载核心失败:', err);
        // 尝试手动构建路径加载 (兼容 sidecar 环境)
        try {
          // 1) 当前工作目录（通常是 backend/）
          const manualPath = path.join(process.cwd(), 'node_modules', 'puppeteer-core');
          console.log('[PDF导出] 尝试手动路径加载:', manualPath);
          puppeteer = require(manualPath);
          console.log('[PDF导出] 手动路径加载成功');
        } catch (err2) {
          // 2) 进一步兜底：基于 __dirname（更稳健，避免 cwd 异常）
          try {
            const dirnamePath = path.join(__dirname, '..', 'node_modules', 'puppeteer-core');
            console.log('[PDF导出] 尝试 __dirname 路径加载:', dirnamePath);
            puppeteer = require(dirnamePath);
            console.log('[PDF导出] __dirname 路径加载成功');
          } catch (_) {
            console.error('[PDF导出] 所有加载尝试均失败');
            const error = new Error('Puppeteer组件无法加载。请确保安装了组件。详情: ' + err.message);
            error.code = 'PUPPETEER_NOT_INSTALLED';
            error.details = {
              message: '无法找到导出组件。请尝试运行脚本重装。\n系统信息: ' + process.platform + ' / ' + process.arch,
              fallback: true,
              needInstall: true,
              originalError: err.message
            };
            throw error;
          }
        }
      }

      // 获取系统浏览器启动配置
      const launchOptions = BrowserFinder.getBrowserLaunchOptions();
      console.log('[PDF导出] 浏览器启动配置:', JSON.stringify(launchOptions, null, 2));
      
      // 检查是否找到浏览器
      if (!launchOptions.executablePath) {
        console.error('[PDF导出] 未找到系统浏览器可执行文件');
        const error = new Error('未找到 Chrome 或 Edge 浏览器');
        error.code = 'CHROME_NOT_FOUND';
        error.details = {
          message: '在您的电脑上未找到 Chrome 或 Edge 浏览器。\n检查路径: ' + (process.env.PATH || 'unknown'),
          fallback: true,
          needInstall: true,
          chromeMissing: true
        };
        throw error;
      }

      // 添加性能优化：设置超时
      launchOptions.protocolTimeout = config.export.puppeteerTimeout || 60000;
      launchOptions.timeout = 60000; // 启动超时 60 秒

      // 简化诊断输出（仅在首次或出错时详细输出）
      console.log('[PDF导出] 浏览器路径:', launchOptions.executablePath);
      console.log('[PDF导出] headless:', launchOptions.headless);
      console.log('[PDF导出] userDataDir:', launchOptions.userDataDir || '(自动管理)');

      console.log('[PDF导出] 正在启动浏览器...');
      let browser;
      let lastError = null;

      // 直接尝试启动，如果失败则使用回退策略
      const launchConfigs = [
        // 配置1: 默认配置（不指定 userDataDir）
        launchOptions,
        // 配置2: 最简配置
        {
          executablePath: launchOptions.executablePath,
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        }
      ];

      for (let i = 0; i < launchConfigs.length; i++) {
        try {
          const config = launchConfigs[i];
          if (i > 0) {
            console.log(`[PDF导出] 尝试配置 ${i + 1}/${launchConfigs.length}...`);
          }

          const launchPromise = puppeteer.launch(config);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('浏览器启动超时 (60s)')), 65000)
          );

          browser = await Promise.race([launchPromise, timeoutPromise]);
          if (i > 0) {
            console.log(`[PDF导出] ✅ 配置 ${i + 1} 成功！`);
          }
          break; // 成功则跳出循环
        } catch (err) {
          lastError = err;
          if (i === 0) {
            console.warn('[PDF导出] 首次启动失败:', err.message?.split('\n')[0] || err);
          } else {
            console.error(`[PDF导出] 配置 ${i + 1} 失败:`, err.message?.split('\n')[0] || err);
          }
        }
      }

      // 如果所有配置都失败
      if (!browser) {
        console.error('[PDF导出] ❌ 所有启动配置均失败');
        const error = new Error('浏览器进程启动失败');
        error.code = 'BROWSER_LAUNCH_FAILED';
        error.details = {
          message:
            '浏览器进程启动失败。\n\n' +
            `浏览器路径: ${String(launchOptions.executablePath || '(未找到)')}\n\n` +
            '可能原因：\n' +
            '• 安全软件/杀毒拦截子进程启动\n' +
            '• 浏览器版本不兼容\n' +
            '• 系统权限问题\n\n' +
            '建议：\n' +
            '1) 确保 Chrome 或 Edge 浏览器已正确安装\n' +
            '2) 将本软件加入杀软白名单\n' +
            '3) 尝试以管理员身份运行\n\n' +
            `错误详情: ${String(lastError?.message || lastError)}`,
          executablePath: launchOptions.executablePath,
          originalError: String(lastError?.message || lastError),
        };
        throw error;
      }

      console.log('[PDF导出] ✅ 浏览器启动成功, PID:', browser.process().pid);

      this.browserInstance = browser;

      // 监听断开连接，清理引用
      browser.on('disconnected', () => {
        console.log('[PDF导出] 浏览器已断开连接');
        if (this.browserInstance === browser) {
          this.browserInstance = null;
        }
      });

      return browser;
    } finally {
      this.isLaunching = false;
    }
  }

  /**
   * 预热浏览器
   * 在系统空闲或页面加载时提前启动浏览器
   */
  static async warmup() {
    try {
      console.log('[PDF导出] 收到预热请求，检查浏览器状态...');
      if (this.browserInstance && this.browserInstance.isConnected()) {
        console.log('[PDF导出] 浏览器已就绪，无需预热');
        return true;
      }
      await this.getBrowser();
      console.log('[PDF导出] 预热完成');
      return true;
    } catch (err) {
      // 预热失败不抛出错误，仅记录日志，以免影响主流程
      console.warn('[PDF导出] 预热失败:', err.message);
      return false;
    }
  }

  /**
   * 将 HTML 转换为 PDF Buffer
   * 
   * @param {string} html - HTML 内容
   * @param {Object} options - 选项
   * @param {string} options.fileName - 文件名（用于日志）
   * @param {string} options.spacingMode - 间距模式
   * @returns {Promise<Buffer>} PDF 文档 Buffer
   */
  static async htmlToPdf(html, options = {}) {
    const { fileName = 'document.pdf', spacingMode = 'standard' } = options;

    if (!html) {
      throw new Error('HTML内容不能为空');
    }

    console.log('[PDF导出] 开始处理PDF任务...');
    console.log('[PDF导出] 文件名:', fileName);

    // 获取单例浏览器
    let browser;
    try {
      browser = await this.getBrowser();
    } catch (launchErr) {
      console.error('[PDF导出] 浏览器获取失败:', launchErr.message);

      // 重新包装详细的错误信息（如果是Chrome缺失等）
      if (launchErr.code === 'CHROME_NOT_FOUND' || (launchErr.details && launchErr.details.chromeMissing)) {
        // 直接抛出原错误，保留details
        throw launchErr;
      }

      // 检查是否是Chrome未找到的常见错误信息
      if (launchErr.message.includes('Could not find Chrome') ||
        launchErr.message.includes('Failed to launch') ||
        launchErr.message.includes('No usable sandbox') ||
        launchErr.message.includes('Executable doesn\'t exist')) {
        const error = new Error('Chrome 或 Edge 浏览器未找到');
        error.code = 'CHROME_NOT_FOUND';
        error.details = {
          message: '请确保您的电脑已安装以下浏览器之一：\n\n' +
            '• Google Chrome\n' +
            '• Microsoft Edge\n\n' +
            '下载链接：\n' +
            'Chrome: https://www.google.com/chrome/\n' +
            'Edge: https://www.microsoft.com/edge\n\n' +
            '安装后请重启应用。',
          fallback: true,
          needInstall: true,
          chromeMissing: true,
          originalError: launchErr.message
        };
        throw error;
      }
      throw launchErr;
    }

    let page;
    try {
      page = await browser.newPage();

      // 优化：设置页面内容 - 使用更快的等待策略
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',  // 改为domcontentloaded，更快
        timeout: 15000  // 设置超时
      });

      // A4真实尺寸方案：不需要额外边距，因为HTML中已经包含了10mm padding
      // console.log('[PDF导出] 使用A4格式，无额外边距（内容已包含padding）');

      // 生成PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0mm',
          right: '0mm',
          bottom: '0mm',
          left: '0mm'
        },
        preferCSSPageSize: true  // 使用CSS定义的页面尺寸
      });

      await page.close(); // 只关闭页面，保持浏览器运行

      console.log('[PDF导出] PDF生成成功，大小:', (pdfBuffer.length / 1024).toFixed(2), 'KB');

      return pdfBuffer;
    } catch (error) {
      // 如果页面出错，尝试关闭页面
      if (page) {
        try { await page.close(); } catch (e) { }
      }
      // 注意：不要关闭浏览器实例，除非检测到崩溃（由 disconnect 处理）
      console.error('[PDF导出] 生成过程出错:', error);
      throw error;
    }
  }
}

module.exports = PdfExportService;
