/**
 * 浏览器查找工具
 * 在 Windows 系统上查找已安装的 Chrome 或 Edge 浏览器
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

class BrowserFinder {
    /**
     * 从配置文件读取用户手动指定的浏览器路径（用于 PDF/Word 导出）
     * @returns {string|null}
     */
    static getManualBrowserPath() {
        try {
            // 使用 AppConfig 工具读取，避免直接引用全局 config 对象导致循环依赖
            const AppConfig = require('./app-config');
            const cfg = AppConfig.readConfig();
            const p = String(cfg?.pdfBrowserPath || cfg?.browserPath || '').trim();
            if (!p) return null;
            if (fs.existsSync(p)) return p;
        } catch (_) { }
        return null;
    }

    /**
     * Windows：通过注册表读取 App Paths 的浏览器安装路径（Chrome/Edge）
     * 优先 Chrome（Puppeteer 支持更好，企业策略限制更少）
     * @returns {string|null}
     */
    static findWindowsBrowserFromRegistry() {
        if (process.platform !== 'win32') return null;

        const keys = [
            // Chrome 优先（Puppeteer 支持更好）
            'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
            'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
            'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
            // Edge 备选
            'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
            'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
            'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
        ];

        const parseRegOutput = (out) => {
            const text = String(out || '');
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                // (Default)    REG_SZ    C:\...\msedge.exe
                const m = line.match(/\sREG_\w+\s+(.+\.exe)\s*$/i);
                if (m && m[1]) return m[1].trim().replace(/^"|"$/g, '');
            }
            const exeMatch = text.match(/([A-Za-z]:\\[^"\r\n]+?\.exe)/i);
            return exeMatch ? exeMatch[1] : null;
        };

        for (const k of keys) {
            try {
                const out = child_process.execSync(`reg query "${k}" /ve`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
                const exePath = parseRegOutput(out);
                if (exePath && fs.existsSync(exePath)) {
                    console.log('[BrowserFinder] 🔑 通过注册表找到浏览器:', exePath);
                    return exePath;
                }
            } catch (_) { }
        }
        return null;
    }
    /**
     * 查找系统已安装的 Chrome 或 Edge 浏览器路径
     * @returns {string|null} 浏览器可执行文件路径，未找到返回 null
     */
    static findSystemBrowser() {
        const platform = process.platform;
        console.log('[BrowserFinder] 当前平台:', platform);

        if (platform === 'win32') {
            return this.findWindowsBrowser();
        } else if (platform === 'darwin') {
            return this.findMacBrowser();
        } else if (platform === 'linux') {
            return this.findLinuxBrowser();
        }

        return null;
    }

    /**
     * 在 Windows 系统查找浏览器
     * @returns {string|null}
     */
    static findWindowsBrowser() {
        // 打印环境变量用于调试
        console.log('[BrowserFinder] 环境变量:');
        console.log('  LOCALAPPDATA:', process.env.LOCALAPPDATA || '(未设置)');
        console.log('  PROGRAMFILES:', process.env.PROGRAMFILES || '(未设置)');
        console.log('  PROGRAMFILES(X86):', process.env['PROGRAMFILES(X86)'] || '(未设置)');

        const appData = process.env.LOCALAPPDATA || '';
        const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
        const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

        // 0) 优先：用户手动指定路径
        const manual = this.getManualBrowserPath();
        if (manual) {
            console.log('[BrowserFinder] 🎯 使用用户手动指定的浏览器:', manual);
            return manual;
        }

        // 1) 优先：注册表 App Paths（更可靠）
        const regPath = this.findWindowsBrowserFromRegistry();
        if (regPath) {
            return regPath;
        }

        const possiblePaths = [
            // Chrome 优先（Puppeteer 支持更好，企业策略限制更少）
            path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(appData, 'Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            
            // Edge 备选（Windows 10/11 自带）
            path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
            path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ];

        console.log('[BrowserFinder] 正在顺序检查路径...');
        for (const browserPath of possiblePaths) {
            try {
                if (fs.existsSync(browserPath)) {
                    console.log('[BrowserFinder] ✅ 找到系统浏览器:', browserPath);
                    return browserPath;
                }
            } catch (e) {
                // 忽略权限错误
            }
        }

        // 备选：where 命令（PATH 中有 chrome.exe/msedge.exe 时可用）
        // Chrome 优先
        try {
            const out = child_process.execSync('where chrome.exe', { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim();
            if (out && fs.existsSync(out)) {
                console.log('[BrowserFinder] 🔍 通过 where 找到 Chrome:', out);
                return out;
            }
        } catch (_) { }

        // Edge 备选
        try {
            const out = child_process.execSync('where msedge.exe', { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim();
            if (out && fs.existsSync(out)) {
                console.log('[BrowserFinder] 🔍 通过 where 找到 Edge:', out);
                return out;
            }
        } catch (_) { }

        console.warn('[BrowserFinder] ❌ 未找到系统浏览器 (Chrome/Edge)');
        return null;
    }

    /**
     * 在 macOS 系统查找浏览器
     * @returns {string|null}
     */
    static findMacBrowser() {
        const possiblePaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            path.join(process.env.HOME || '', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
            path.join(process.env.HOME || '', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
        ].filter(Boolean);

        for (const browserPath of possiblePaths) {
            if (fs.existsSync(browserPath)) {
                console.log('[BrowserFinder] 找到系统浏览器:', browserPath);
                return browserPath;
            }
        }

        console.warn('[BrowserFinder] 未找到系统浏览器 (Chrome/Edge)');
        return null;
    }

    /**
     * 在 Linux 系统查找浏览器
     * @returns {string|null}
     */
    static findLinuxBrowser() {
        const possiblePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            '/usr/bin/microsoft-edge',
            '/usr/bin/microsoft-edge-stable',
        ];

        for (const browserPath of possiblePaths) {
            if (fs.existsSync(browserPath)) {
                console.log('[BrowserFinder] 找到系统浏览器:', browserPath);
                return browserPath;
            }
        }

        console.warn('[BrowserFinder] 未找到系统浏览器 (Chrome/Chromium/Edge)');
        return null;
    }

    /**
     * 获取浏览器启动参数
     * @returns {Object} Puppeteer launch 配置对象
     */
    static getBrowserLaunchOptions() {
        const executablePath = this.findSystemBrowser();

        // 不指定 userDataDir，让 Puppeteer 自动管理临时目录
        // 这样可以避免目录锁定、权限问题，且每次启动都是干净的环境
        // 注意：这意味着不会保留浏览器状态（cookies、缓存等），但对于 PDF 导出场景无影响
        let userDataDir = null;

        const options = {
            // 使用 headless: true（经典模式），兼容性更好
            headless: true,
            // 不指定 userDataDir，让浏览器使用默认临时目录，避免锁定问题
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-dev-shm-usage',  // 避免 /dev/shm 空间不足问题
                '--mute-audio',
                '--window-size=1280,1696'
            ]
        };

        if (executablePath) {
            options.executablePath = executablePath;
            console.log('[BrowserFinder] 使用系统浏览器:', executablePath);
        } else {
            console.warn('[BrowserFinder] 未找到系统浏览器，Puppeteer 将尝试使用默认配置');
            // 不设置 executablePath，让 Puppeteer 自己寻找
        }

        return options;
    }
}

module.exports = BrowserFinder;
