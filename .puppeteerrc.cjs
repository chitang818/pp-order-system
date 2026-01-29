/**
 * Puppeteer 配置文件
 * 配置 Puppeteer 使用系统已安装的浏览器，而不是下载独立的 Chromium
 * 
 * 这样可以节省约 637 MB 的磁盘空间
 * 
 * 注意：使用此配置后，用户电脑必须安装 Chrome 或 Edge 浏览器
 */

const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
    // 跳过 Chromium 下载
    skipDownload: true,

    // 不缓存浏览器二进制文件
    cacheDirectory: join(__dirname, '.puppeteer_cache'),

    // 可选：设置默认浏览器
    // defaultProduct: 'chrome',
};
