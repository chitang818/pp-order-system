/**
 * Word 导出服务
 * 负责将 HTML 内容转换为 Word 文档
 * 使用 docx 库直接构建Word文档（更可靠，避免html-to-docx的问题）
 * 对于拉货通知，使用 Puppeteer + HTML内嵌方案，确保与预览窗口完全一致
 */

const path = require('path');
const fs = require('fs');
const config = require('../config');
const BrowserFinder = require('../utils/browser-finder');

// 重型依赖延迟加载
let _docx = null;
let _cheerio = null;
let _jszip = null;
let puppeteer;

function _getDocx() {
  if (!_docx) _docx = require('docx');
  return _docx;
}
function _getCheerio() {
  if (!_cheerio) _cheerio = require('cheerio');
  return _cheerio;
}
function _getJSZip() {
  if (!_jszip) _jszip = require('jszip');
  return _jszip;
}

class WordExportService {
  /**
   * 使用 Puppeteer + HTML内嵌方案将 HTML 转换为 Word 文档 Buffer（专门用于拉货通知）
   * 分步执行，避免一次性处理导致卡死
   * 
   * @param {string} html - HTML 内容（完整的HTML文档或body内容）
   * @param {string} fileName - 文件名（用于调试）
   * @returns {Promise<Buffer>} Word 文档 Buffer
   */
  static async htmlToWordWithPuppeteer(html, fileName = 'document') {
    if (!html) {
      throw new Error('HTML内容不能为空');
    }

    console.log('[Word导出-拉货通知] 使用 Puppeteer + HTML内嵌方案导出');
    console.log('[Word导出-拉货通知] 文件名:', fileName);
    console.log('[Word导出-拉货通知] HTML原始长度:', html.length);

    try {
      // 步骤1: 加载Puppeteer
      console.log('[Word导出-拉货通知] [步骤1/5] 加载Puppeteer...');
      let puppeteer;
      try {
        puppeteer = require('puppeteer-core');
        console.log('[Word导出-拉货通知] ✓ Puppeteer加载成功');
      } catch (err) {
        console.error('[Word导出-拉货通知] ❌ Puppeteer加载失败:', err.message);
        const error = new Error('Puppeteer未安装');
        error.code = 'PUPPETEER_NOT_INSTALLED';
        error.details = {
          message: '请按以下步骤安装：\n1. 打开项目根目录\n2. 运行命令: npm install puppeteer\n3. 等待安装完成（约5-10分钟）\n4. 重启服务器\n\n或双击运行: 安装Puppeteer.bat',
          fallback: true,
          needInstall: true
        };
        throw error;
      }


      // 步骤2: 启动浏览器
      console.log('[Word导出-拉货通知] [步骤2/5] 启动系统浏览器...');
      let browser;
      try {
        // 使用 BrowserFinder 获取系统浏览器配置
        const launchOptions = BrowserFinder.getBrowserLaunchOptions();
        launchOptions.protocolTimeout = config.export.puppeteerTimeout || 30000;

        browser = await puppeteer.launch(launchOptions);
        console.log('[Word导出-拉货通知] ✓ 浏览器启动成功');
      } catch (launchErr) {
        console.error('[Word导出-拉货通知] ❌ 浏览器启动失败:', launchErr.message);
        if (launchErr.message.includes('Could not find Chrome') ||
          launchErr.message.includes('Failed to launch') ||
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
            needInstall: true
          };
          throw error;
        }
        throw launchErr;
      }

      // 步骤3: 渲染HTML并获取完整内容
      console.log('[Word导出-拉货通知] [步骤3/5] 渲染HTML内容...');
      let page;
      let renderedHtml;
      try {
        page = await browser.newPage();

        // 设置视口大小（A4纸张比例：794x1123像素，96 DPI）
        await page.setViewport({
          width: 794,
          height: 1123,
          deviceScaleFactor: 1
        });

        // 设置内容，使用较短的超时避免卡死
        await page.setContent(html, {
          waitUntil: 'networkidle0',
          timeout: 20000
        });

        // 等待页面完全渲染
        await page.evaluate(() => {
          return new Promise((resolve) => {
            if (document.readyState === 'complete') {
              resolve();
            } else {
              window.addEventListener('load', resolve, { once: true });
              setTimeout(resolve, 2000); // 最多等待2秒
            }
          });
        });

        // 获取渲染后的完整HTML（直接获取body的HTML，保留原有内联样式）
        // 预览窗口的HTML已经包含了所有内联样式，直接获取即可
        renderedHtml = await page.evaluate(() => {
          // 直接获取body的HTML内容（保留所有内联样式）
          const body = document.body;

          // 创建一个深拷贝，保留所有属性和样式
          const clone = body.cloneNode(true);

          // 只移除script和style标签，保留其他所有内容（包括所有内联样式）
          const scripts = clone.querySelectorAll('script, style, noscript');
          scripts.forEach(el => el.remove());

          // 返回克隆后的HTML，cloneNode(true)已经保留了所有属性包括style
          // 所有内联样式都会被保留
          return clone.innerHTML;
        });

        console.log('[Word导出-拉货通知] ✓ HTML渲染完成，渲染后长度:', renderedHtml.length);

        await browser.close();
      } catch (renderErr) {
        console.error('[Word导出-拉货通知] ❌ HTML渲染失败:', renderErr.message);
        try {
          await browser.close();
        } catch (e) { }
        throw new Error(`HTML渲染失败: ${renderErr.message}`);
      }

      // 步骤4: 构建完整的HTML文档（Word可以直接打开的格式）
      console.log('[Word导出-拉货通知] [步骤4/5] 构建Word文档结构...');
      const completeHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40"
      xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Microsoft Word">
  <meta name="Originator" content="Microsoft Word">
  <title>拉货通知</title>
  <style>
    /* 全局字体设置：英文和数字使用Times New Roman，中文使用宋体 */
    body, div, span, p, td, th, table, h1, h2, h3, h4, h5, h6 {
      font-family: 'Times New Roman', SimSun, serif;
    }
    /* 确保所有元素继承字体设置 */
    * {
      font-family: 'Times New Roman', SimSun, serif;
    }
    /* 表格样式 */
    table {
      border-collapse: collapse;
    }
    /* body基础样式 - 最小化，不覆盖内容样式 */
    body {
      margin: 0;
      padding: 0;
      background: #fff;
    }
    /* 确保box-sizing被保留 */
    * {
      box-sizing: border-box;
    }
    /* 确保所有内联样式都被保留，不覆盖 */
    [style] {
      /* 内联样式优先级最高 */
    }
  </style>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
      <w:ValidateAgainstSchemas/>
      <w:SaveIfXMLInvalid>false</w:SaveIfXMLInvalid>
      <w:IgnoreMixedContent>false</w:IgnoreMixedContent>
      <w:AlwaysShowPlaceholderText>false</w:AlwaysShowPlaceholderText>
      <w:Compatibility>
        <w:BreakWrappedTables/>
        <w:SnapToGridInCell/>
        <w:WrapTextWithPunct/>
        <w:UseAsianBreakRules/>
        <w:DontGrowAutofit/>
      </w:Compatibility>
    </w:WordDocument>
  </xml>
  <![endif]-->
</head>
<body style="font-family: 'Times New Roman', SimSun, serif; margin: 0; padding: 0; background: #fff;">
${renderedHtml}
</body>
</html>`;

      // 步骤5: 创建.docx文件（使用JSZip打包，包含HTML作为MHTML内容）
      console.log('[Word导出-拉货通知] [步骤5/5] 生成.docx文档...');

      // 创建ZIP结构来构建.docx文件
      const JSZip = _getJSZip();
      const zip = new JSZip();

      // 添加Content Types文件
      const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/_rels/document.xml.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/altChunk1.mht" ContentType="application/x-mimearchive"/>
</Types>`;
      zip.file('[Content_Types].xml', contentTypes);

      // 添加主关系文件
      const mainRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
      zip.file('_rels/.rels', mainRels);

      // 创建MHTML格式的HTML内容（Word的AltChunk支持MHTML）
      const mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----=_NextPart_01D1234567890ABC"

------=_NextPart_01D1234567890ABC
Content-Location: file:///C:/temp/document.htm
Content-Transfer-Encoding: quoted-printable
Content-Type: text/html; charset="utf-8"

${completeHtml}

------=_NextPart_01D1234567890ABC--
`;

      // 添加Word文档主文件（包含HTML作为AltChunk）
      const altChunkId = 'altChunk1';
      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            mc:Ignorable="w14 wp14">
  <w:body>
    <w:altChunk r:id="${altChunkId}"/>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="450" w:footer="450" w:gutter="0"/>
      <w:cols w:space="708"/>
    </w:sectPr>
  </w:body>
</w:document>`;
      zip.file('word/document.xml', documentXml);

      // 添加MHTML内容作为AltChunk
      zip.file('word/altChunk1.mht', mhtmlContent);

      // 添加文档关系文件
      const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${altChunkId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="altChunk1.mht"/>
</Relationships>`;
      zip.file('word/_rels/document.xml.rels', docRels);

      // 生成Buffer（分块生成，避免一次性处理导致卡死）
      console.log('[Word导出-拉货通知] 正在压缩Word文档...');
      const docxBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
        streamFiles: true // 启用流式处理，避免内存溢出
      });

      console.log('[Word导出-拉货通知] ✓ Word文档生成成功，大小:', (docxBuffer.length / 1024).toFixed(2), 'KB');
      console.log('[Word导出-拉货通知] 💡 使用 Puppeteer 渲染，确保与预览窗口完全一致');

      return docxBuffer;
    } catch (error) {
      console.error('[Word导出-拉货通知] ❌ Word文档生成失败:', error);
      console.error('[Word导出-拉货通知] 错误详情:', error.message);
      if (error.stack) {
        console.error('[Word导出-拉货通知] 错误堆栈:', error.stack);
      }
      throw new Error(`拉货通知Word导出失败: ${error.message}`);
    }
  }

  /**
   * 使用 html-to-docx 库将 HTML 转换为 Word 文档 Buffer（已废弃，保留作为备用）
   * 
   * @param {string} html - HTML 内容（完整的HTML文档或body内容）
   * @param {string} fileName - 文件名（用于调试）
   * @returns {Promise<Buffer>} Word 文档 Buffer
   */
  static async htmlToWordWithHtmlToDocx(html, fileName = 'document') {
    if (!html) {
      throw new Error('HTML内容不能为空');
    }

    console.log('[Word导出-拉货通知] 使用 html-to-docx 库导出');
    console.log('[Word导出-拉货通知] 文件名:', fileName);
    console.log('[Word导出-拉货通知] HTML原始长度:', html.length);

    try {
      // 动态加载 html-to-docx 库
      if (!HTMLtoDOCX) {
        try {
          HTMLtoDOCX = require('html-to-docx');
          console.log('[Word导出-拉货通知] ✓ html-to-docx 库加载成功');
        } catch (err) {
          console.error('[Word导出-拉货通知] ❌ html-to-docx 库加载失败:', err.message);
          throw new Error('html-to-docx 库未安装，请运行: npm install html-to-docx');
        }
      }

      const cheerio = _getCheerio();

      // 解析HTML，提取主要内容
      const $ = cheerio.load(html, { decodeEntities: false });

      // 提取body内容或主容器
      let bodyContent = $('body').html() || $.root().html() || html;

      // 如果没有body标签，使用根内容
      if (!bodyContent || bodyContent.trim().length === 0) {
        bodyContent = html;
      }

      // 重新加载body内容以便清理
      const $body = cheerio.load(bodyContent, { decodeEntities: false });

      // 使用 cheerio 彻底清理所有无效属性
      // 重要：只移除 @ 和 data- 属性，保留所有 style 属性
      $body('*').each((i, elem) => {
        const $el = $body(elem);
        const attrs = $el.get(0).attribs || {};

        // 移除所有以 @ 开头的属性（但保留 style 属性）
        Object.keys(attrs).forEach(attr => {
          if (attr !== 'style' && (attr.startsWith('@') || attr.includes('@'))) {
            $el.removeAttr(attr);
          }
        });

        // 移除所有 data- 属性（但保留 style 属性）
        Object.keys(attrs).forEach(attr => {
          if (attr !== 'style' && attr.startsWith('data-')) {
            $el.removeAttr(attr);
          }
        });

        // 清理 style 属性中的 @ 字符（但保留所有其他样式）
        const style = $el.attr('style');
        if (style && style.includes('@')) {
          const cleanStyle = style.replace(/@/g, '').trim();
          if (cleanStyle) {
            $el.attr('style', cleanStyle);
          }
        }
      });

      // 特殊处理：标准化表格属性，确保 html-to-docx 库能正确处理
      // 移除表格元素上的所有 width 属性，只保留 CSS 样式中的 width
      $body('table, td, th, col, colgroup').each((i, elem) => {
        const $el = $body(elem);
        const tagName = $el.prop('tagName')?.toLowerCase();

        // 移除所有 width 相关的属性（避免 html-to-docx 库误解析）
        const attrs = $el.get(0).attribs || {};
        Object.keys(attrs).forEach(attr => {
          const lowerAttr = attr.toLowerCase();
          // 移除 width 属性（保留在 style 中）
          if (lowerAttr === 'width' || lowerAttr.startsWith('width') ||
            lowerAttr.includes('@w') || lowerAttr === '@w' ||
            (lowerAttr.includes('@') && lowerAttr.includes('width'))) {
            $el.removeAttr(attr);
          }
        });

        // 确保 style 中的 width 是标准格式
        if (tagName === 'table' || tagName === 'td' || tagName === 'th') {
          const style = $el.attr('style') || '';
          if (style.includes('width')) {
            // 标准化 width 属性，移除可能导致问题的格式
            const normalizedStyle = style
              .replace(/width\s*:\s*([^;]+)/gi, (match, value) => {
                // 确保 width 值是有效的 CSS 值，不包含 @
                const cleanValue = value.trim().replace(/@/g, '');
                if (cleanValue) {
                  return `width: ${cleanValue}`;
                }
                return '';
              })
              .replace(/;\s*;/g, ';')  // 移除多余的分号
              .replace(/^\s*;\s*|;\s*$/g, '')  // 移除开头和结尾的分号
              .trim();
            if (normalizedStyle) {
              $el.attr('style', normalizedStyle);
            } else {
              $el.removeAttr('style');
            }
          }
        }
      });

      // 移除 colgroup 和 col 元素（可能导致问题）
      $body('colgroup, col').remove();

      // 完全重写表格，确保所有属性都是标准的
      // 移除所有 width 相关的内容，避免 html-to-docx 库误解析
      $body('table').each((i, tableElem) => {
        const $table = $body(tableElem);

        // 创建一个新的干净表格
        const $newTable = $body('<table></table>');

        // 移除 width 相关的样式，但保留所有其他样式（包括边框、背景色等）
        const tableStyle = $table.attr('style');
        if (tableStyle && !tableStyle.includes('@')) {
          // 只移除 width 相关的样式，保留所有其他样式
          const cleanStyle = tableStyle
            .replace(/\b(?:width|min-width|max-width)\s*:\s*[^;]+;?/gi, '')  // 移除所有 width 相关样式
            .replace(/@/g, '')  // 移除所有 @
            .replace(/;\s*;/g, ';')  // 清理多余分号
            .replace(/^\s*;\s*|;\s*$/g, '')  // 移除开头结尾分号
            .trim();
          if (cleanStyle.trim()) {
            $newTable.attr('style', cleanStyle);
          } else if ($table.attr('style')) {
            // 如果清理后样式为空，但原样式存在，保留原样式（只移除 @）
            const fallbackStyle = $table.attr('style').replace(/@/g, '').trim();
            if (fallbackStyle) {
              $newTable.attr('style', fallbackStyle);
            }
          }
        } else if (tableStyle) {
          // 如果包含 @，只移除 @，保留其他样式
          const cleanStyle = tableStyle.replace(/@/g, '').trim();
          if (cleanStyle) {
            $newTable.attr('style', cleanStyle);
          }
        }

        // 复制所有行
        $table.find('tr').each((j, rowElem) => {
          const $row = $body(rowElem);
          const $newRow = $body('<tr></tr>');

          // 复制所有单元格
          $row.find('td, th').each((k, cellElem) => {
            const $cell = $body(cellElem);
            const $newCell = $body(`<${cellElem.tagName.toLowerCase()}></${cellElem.tagName.toLowerCase()}>`);

            // 移除 width 相关的样式，但保留所有其他样式（包括颜色、背景色等）
            const cellStyle = $cell.attr('style');
            if (cellStyle && !cellStyle.includes('@')) {
              // 只移除 width 相关的样式，保留所有其他样式（颜色、背景色、边框等）
              const cleanStyle = cellStyle
                .replace(/\b(?:width|min-width|max-width)\s*:\s*[^;]+;?/gi, '')  // 移除所有 width 相关样式
                .replace(/@/g, '')  // 移除所有 @
                .replace(/;\s*;/g, ';')  // 清理多余分号
                .replace(/^\s*;\s*|;\s*$/g, '')  // 移除开头结尾分号
                .trim();
              if (cleanStyle.trim()) {
                $newCell.attr('style', cleanStyle);
              } else if ($cell.attr('style')) {
                // 如果清理后样式为空，但原样式存在，保留原样式（只移除 @）
                const fallbackStyle = $cell.attr('style').replace(/@/g, '').trim();
                if (fallbackStyle) {
                  $newCell.attr('style', fallbackStyle);
                }
              }
            } else if (cellStyle) {
              // 如果包含 @，只移除 @，保留其他样式
              const cleanStyle = cellStyle.replace(/@/g, '').trim();
              if (cleanStyle) {
                $newCell.attr('style', cleanStyle);
              }
            }

            // 复制单元格内容（递归清理内容中的 @，但保留所有样式）
            let cellHtml = $cell.html() || '';
            // 清理内容中的 @ 字符（但保留 style 属性中的其他内容）
            // 只清理不在 style 属性中的 @
            cellHtml = cellHtml
              .replace(/style="([^"]*)"/gi, (match, styleContent) => {
                return `style="${styleContent.replace(/@/g, '')}"`;
              })
              .replace(/style='([^']*)'/gi, (match, styleContent) => {
                return `style='${styleContent.replace(/@/g, '')}'`;
              })
              .replace(/@/g, '');  // 最后清理剩余的 @
            $newCell.html(cellHtml);
            $newRow.append($newCell);
          });

          $newTable.append($newRow);
        });

        // 替换原表格
        $table.replaceWith($newTable);
      });

      // 获取清理后的HTML
      bodyContent = $body('body').html() || $body.root().html() || bodyContent;

      // 调试：检查关键内容是否存在
      console.log('[Word导出-拉货通知] 检查关键内容:');
      console.log('  - 是否包含"拉货备注":', bodyContent.includes('拉货备注'));
      console.log('  - 是否包含背景色样式:', bodyContent.includes('background: #f8f9fa') || bodyContent.includes('background:#f8f9fa'));
      console.log('  - 是否包含蓝色文字样式:', bodyContent.includes('color: #0066cc') || bodyContent.includes('color:#0066cc'));

      // 额外的字符串清理（作为备用，使用更强大的正则）
      // 重要：只清理 @ 字符，不破坏 style 属性
      bodyContent = bodyContent
        // 移除 @ 开头的属性（但不在 style 属性中）
        .replace(/\s+@[\w-]+(?:="[^"]*")?/gi, (match) => {
          // 如果这个 @ 在 style 属性中，保留它（只移除 @ 字符本身）
          return match.replace(/@/g, '');
        })
        .replace(/\s+@[\w-]+(?:='[^']*')?/gi, (match) => match.replace(/@/g, ''))
        .replace(/\s+@[\w-]+/gi, (match) => match.replace(/@/g, ''))
        .replace(/\s+[a-zA-Z-]*@[a-zA-Z-]*="[^"]*"/gi, (match) => match.replace(/@/g, ''))
        .replace(/\s+[a-zA-Z-]*@[a-zA-Z-]*='[^']*'/gi, (match) => match.replace(/@/g, ''))
        // 最后清理 style 属性中的 @ 字符（但保留其他所有内容）
        .replace(/style="([^"]*)"/gi, (match, styleContent) => {
          return `style="${styleContent.replace(/@/g, '')}"`;
        })
        .replace(/style='([^']*)'/gi, (match, styleContent) => {
          return `style='${styleContent.replace(/@/g, '')}'`;
        });

      // 检查是否还有 @ 属性残留
      if (bodyContent.includes('@')) {
        console.warn('[Word导出-拉货通知] ⚠️ 检测到仍有 @ 属性残留，进行二次清理');
        // 更激进的清理：移除所有包含 @ 的标签属性
        bodyContent = bodyContent.replace(/<([^>]+@[^>]*)>/gi, (match, attrs) => {
          // 移除所有包含 @ 的属性
          const cleaned = attrs.replace(/\s*@[\w-]+(?:="[^"]*"|='[^']*'|=\S+)?/gi, '')
            .replace(/\s*[a-zA-Z-]*@[a-zA-Z-]*(?:="[^"]*"|='[^']*'|=\S+)?/gi, '');
          return `<${cleaned}>`;
        });
      }

      console.log('[Word导出-拉货通知] 清理后是否包含 @ 属性:', bodyContent.includes('@') ? '是（警告）' : '否（正常）');

      // 构建完整的HTML文档
      // 注意：html-to-docx 库主要依赖内联样式，CSS选择器支持有限
      // 因此我们确保所有样式都以内联方式存在（已在 bodyContent 中）
      let completeHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* 基础样式 - html-to-docx 库支持的基本样式 */
    body { 
      font-family: SimSun, '微软雅黑', serif; 
      font-size: 14px;
      line-height: 1.6;
      color: #000;
      padding: 30px 40px;
      max-width: 850px;
      margin: 0 auto;
      background: #fff;
    }
    
    /* 表格基础样式 */
    table { 
      border-collapse: collapse;
      font-size: 14px;
    }
    
    /* 注意：所有其他样式（背景色、颜色等）都应该以内联方式存在于HTML中 */
    /* html-to-docx 库对内联样式的支持更好 */
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;

      // 构建完整HTML后，最后一次彻底清理（确保万无一失）
      // 使用 cheerio 再次解析和清理，确保所有属性都是标准的
      const $final = cheerio.load(completeHtml, { decodeEntities: false });

      // 再次遍历所有元素，确保没有任何 @ 属性
      $final('*').each((i, elem) => {
        const $el = $final(elem);
        const attrs = $el.get(0).attribs || {};

        // 移除所有包含 @ 的属性
        Object.keys(attrs).forEach(attr => {
          if (attr.includes('@') || attr.startsWith('@')) {
            $el.removeAttr(attr);
          }
        });
      });

      // 获取最终清理后的HTML
      completeHtml = $final.html();

      // 额外的字符串清理（作为最后一道防线）
      // 移除所有 @ 字符，包括在属性值中的
      // 使用更强大的正则表达式，匹配所有可能的 @ 出现位置
      completeHtml = completeHtml
        // 移除 @ 开头的属性名
        .replace(/\s+@[\w-]+(?:="[^"]*"|='[^']*'|=\S+)?/gi, '')
        // 移除属性名中包含 @ 的属性
        .replace(/\s+[a-zA-Z-]*@[a-zA-Z-]*(?:="[^"]*"|='[^']*'|=\S+)?/gi, '')
        // 移除属性值中的 @（双引号）
        .replace(/="([^"]*)"/gi, (match, value) => {
          if (value.includes('@')) {
            return `="${value.replace(/@/g, '')}"`;
          }
          return match;
        })
        // 移除属性值中的 @（单引号）
        .replace(/='([^']*)'/gi, (match, value) => {
          if (value.includes('@')) {
            return `='${value.replace(/@/g, '')}'`;
          }
          return match;
        })
        // 移除标签内容中的 @（但保留标签结构）
        .replace(/>([^<]*@[^<]*)</gi, (match, content) => {
          return `>${content.replace(/@/g, '')}<`;
        })
        // 最后移除所有剩余的 @ 字符（包括在标签名、属性名等任何地方）
        .replace(/@/g, '');

      // 如果还有残留，进行更激进的清理
      if (completeHtml.includes('@')) {
        console.warn('[Word导出-拉货通知] ⚠️ 完整HTML中仍有 @ 属性残留，进行最终清理');
        completeHtml = completeHtml.replace(/<([^>]+@[^>]*)>/gi, (match, attrs) => {
          const cleaned = attrs.replace(/\s*@[\w-]+(?:="[^"]*"|='[^']*'|=\S+)?/gi, '')
            .replace(/\s*[a-zA-Z-]*@[a-zA-Z-]*(?:="[^"]*"|='[^']*'|=\S+)?/gi, '');
          return `<${cleaned}>`;
        });
      }

      console.log('[Word导出-拉货通知] 最终HTML是否包含 @ 属性:', completeHtml.includes('@') ? '是（严重警告）' : '否（正常）');

      // 如果仍然包含 @，记录详细信息以便调试
      if (completeHtml.includes('@')) {
        const match = completeHtml.match(/<[^>]*@[^>]*>/gi);
        if (match) {
          console.error('[Word导出-拉货通知] ❌ 发现包含 @ 的标签:', match.slice(0, 5));
        }
        // 记录表格相关的 HTML 片段
        const tableMatch = completeHtml.match(/<table[^>]*>[\s\S]{0,500}/gi);
        if (tableMatch) {
          console.error('[Word导出-拉货通知] ❌ 表格HTML片段（前500字符）:', tableMatch[0]);
        }
      }

      // 在调用 html-to-docx 之前，再次确保没有任何 @ 字符
      // 这是最后的防线
      if (completeHtml.includes('@')) {
        console.warn('[Word导出-拉货通知] ⚠️ 最终清理：移除所有 @ 字符');
        completeHtml = completeHtml.replace(/@/g, '');
      }

      // 使用 html-to-docx 转换
      // 参数：htmlString, headerHTMLString, documentOptions, footerHTMLString
      const docxBuffer = await HTMLtoDOCX(completeHtml, null, {
        table: { row: { cantSplit: true } },
        footer: false,
        pageNumber: false,
        pageSize: {
          width: 12240, // A4 width in twips (8.5 inches)
          height: 15840, // A4 height in twips (11 inches)
        },
        margins: {
          top: 1440, // 1 inch
          right: 1440,
          bottom: 1440,
          left: 1440,
        },
        font: 'SimSun', // 使用宋体
        fontSize: 28, // 14pt = 28 HIP (Half of point)
      }, null);

      console.log('[Word导出-拉货通知] ✓ Word文档生成成功，大小:', docxBuffer.length, 'bytes');
      console.log('[Word导出-拉货通知] 💡 使用 html-to-docx 库完美复现排版和样式');

      return docxBuffer;
    } catch (error) {
      console.error('[Word导出-拉货通知] ❌ Word文档生成失败:', error);
      console.error('[Word导出-拉货通知] 错误详情:', error.message);
      console.error('[Word导出-拉货通知] 错误堆栈:', error.stack);

      throw new Error(`拉货通知Word导出失败: ${error.message}`);
    }
  }

  /**
   * 将 HTML 转换为 Word 文档 Buffer（通用方法，用于其他单据类型）
   * 
   * @param {string} html - HTML 内容（完整的HTML文档或body内容）
   * @param {string} fileName - 文件名（用于调试）
   * @returns {Promise<Buffer>} Word 文档 Buffer
   */
  static async htmlToWord(html, fileName = 'document') {
    if (!html) {
      throw new Error('HTML内容不能为空');
    }

    console.log('[Word导出] 收到请求');
    console.log('[Word导出] 文件名:', fileName);
    console.log('[Word导出] HTML原始长度:', html.length);

    try {
      const cheerio = _getCheerio();
      const { Document, Paragraph, TextRun, Packer } = _getDocx();

      // 解析HTML
      const $ = cheerio.load(html, { decodeEntities: false });

      // 提取body内容
      let bodyContent = $('body').html() || $.root().html() || html;

      // 如果没有body标签，使用根内容
      if (!bodyContent || bodyContent.trim().length === 0) {
        bodyContent = html;
      }

      // 重新加载body内容
      const $body = cheerio.load(bodyContent, { decodeEntities: false });

      // 构建Word文档内容
      const children = [];

      // 查找最外层的主容器（通常是包含所有内容的div）
      const mainContainer = $body('body > div').first();
      if (mainContainer.length > 0) {
        // 处理主容器内的所有子元素
        mainContainer.children().each((i, elem) => {
          const $el = $body(elem);
          const tagName = $el.prop('tagName')?.toLowerCase();

          if (!tagName) return;

          try {
            // 处理不同的HTML元素
            const wordElements = this.convertElementToWord($body, $el);
            if (wordElements) {
              if (Array.isArray(wordElements)) {
                children.push(...wordElements);
              } else {
                children.push(wordElements);
              }
            }
          } catch (err) {
            console.error(`[Word导出] ⚠️ 转换元素失败: ${tagName}`, err.message);
          }
        });
      } else {
        // 如果没有主容器，遍历所有顶级元素
        $body('body > *, :root > *').each((i, elem) => {
          const $el = $body(elem);
          const tagName = $el.prop('tagName')?.toLowerCase();

          if (!tagName) return;

          try {
            const wordElements = this.convertElementToWord($body, $el);
            if (wordElements) {
              if (Array.isArray(wordElements)) {
                children.push(...wordElements);
              } else {
                children.push(wordElements);
              }
            }
          } catch (err) {
            console.error(`[Word导出] ⚠️ 转换元素失败: ${tagName}`, err.message);
          }
        });
      }

      // 如果没有任何元素，尝试提取文本内容
      if (children.length === 0) {
        const text = $body('body').text() || $body.text() || bodyContent.replace(/<[^>]+>/g, '');
        if (text.trim()) {
          children.push(new Paragraph({
            children: [new TextRun({ text: text.trim(), size: 22, font: 'Arial' })]
          }));
        }
      }

      // 创建Word文档
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: 720,    // 0.5英寸
                right: 720,
                bottom: 720,
                left: 720
              }
            }
          },
          children: children.length > 0 ? children : [
            new Paragraph({
              children: [new TextRun({ text: '文档内容为空', size: 22, font: 'Arial' })]
            })
          ]
        }]
      });

      // 生成Buffer
      const docxBuffer = await Packer.toBuffer(doc);

      console.log('[Word导出] ✓ Word文档生成成功，大小:', docxBuffer.length, 'bytes');
      console.log('[Word导出] 💡 使用docx库直接构建，避免了html-to-docx的兼容性问题');

      return docxBuffer;
    } catch (error) {
      console.error('[Word导出] ❌ Word文档生成失败:', error);
      console.error('[Word导出] 错误详情:', error.message);
      console.error('[Word导出] 错误堆栈:', error.stack);

      throw new Error(`Word导出失败: ${error.message}`);
    }
  }

  /**
   * 解析样式字符串，提取样式属性
   */
  static parseStyle(styleStr) {
    const styles = {};
    if (!styleStr) return styles;

    styleStr.split(';').forEach(rule => {
      const [key, value] = rule.split(':').map(s => s.trim());
      if (key && value) {
        styles[key.toLowerCase()] = value;
      }
    });

    return styles;
  }

  /**
   * 将像素或磅转换为HIP单位（半磅）
   */
  static fontSizeToHIP(sizeStr) {
    if (!sizeStr) return 22; // 默认11pt

    const match = sizeStr.match(/(\d+)(?:pt|px)/i);
    if (match) {
      const size = parseInt(match[1]);
      // 如果是px，大致转换为pt（1px ≈ 0.75pt），然后转为HIP
      // 如果是pt，直接转为HIP（1pt = 2 HIP）
      if (sizeStr.includes('px')) {
        return Math.round(size * 0.75 * 2);
      } else {
        return size * 2;
      }
    }

    return 22;
  }

  /**
   * 将HTML元素转换为Word文档元素
   */
  static convertElementToWord($, $el) {
    const tagName = $el.prop('tagName')?.toLowerCase();
    const text = $el.text().trim();

    // 跳过script、style等标签
    if (['script', 'style', 'noscript'].includes(tagName)) {
      return null;
    }

    // 处理表格
    if (tagName === 'table') {
      return this.convertTable($, $el);
    }

    // 处理段落和文本元素
    if (['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const styleStr = $el.attr('style') || '';
      const styles = this.parseStyle(styleStr);

      // 检查是否包含表格（嵌套表格）
      if ($el.find('table').length > 0) {
        const results = [];
        // 先处理表格前的文本
        const beforeTable = $el.clone();
        beforeTable.find('table').remove();
        if (beforeTable.text().trim()) {
          const para = this.createParagraphFromElement($, beforeTable, styles);
          if (para) results.push(para);
        }
        // 处理表格
        $el.find('table').each((i, table) => {
          const tableResult = this.convertTable($, $(table));
          if (tableResult) results.push(tableResult);
        });
        return results.length > 0 ? (results.length === 1 ? results[0] : results) : null;
      }

      return this.createParagraphFromElement($, $el, styles);
    }

    // 处理换行
    if (tagName === 'br') {
      const { Paragraph } = _getDocx();
      return new Paragraph({ text: '' });
    }

    // 其他元素，提取文本内容
    if (text) {
      const { Paragraph, TextRun } = _getDocx();
      return new Paragraph({
        children: [new TextRun({ text: text, size: 22, font: 'Arial' })],
        spacing: { after: 200 }
      });
    }

    return null;
  }

  /**
   * 从HTML元素创建Word段落
   */
  static createParagraphFromElement($, $el, parentStyles = {}) {
    const { Paragraph, TextRun, AlignmentType } = _getDocx();
    const styleStr = $el.attr('style') || '';
    const styles = { ...parentStyles, ...this.parseStyle(styleStr) };

    const isBold = $el.find('strong, b').length > 0 ||
      styles['font-weight']?.includes('bold') ||
      styles['font-weight'] === 'bold' ||
      styles['font-weight'] === '600' ||
      styles['font-weight'] === '700';

    const isCenter = styles['text-align'] === 'center';
    const isRight = styles['text-align'] === 'right';
    const alignment = isCenter ? AlignmentType.CENTER : (isRight ? AlignmentType.RIGHT : AlignmentType.LEFT);

    // 获取字体大小
    const fontSize = this.fontSizeToHIP(styles['font-size'] || '11pt');

    // 获取颜色
    let color = undefined;
    if (styles['color']) {
      const colorMatch = styles['color'].match(/#([0-9a-f]{6})/i);
      if (colorMatch) {
        color = colorMatch[1].toUpperCase();
      }
    }

    // 构建文本运行
    const textRuns = [];
    this.buildTextRuns($, $el, textRuns, fontSize, isBold, color);

    if (textRuns.length === 0) {
      const text = $el.text().trim();
      if (text) {
        textRuns.push(new TextRun({
          text: text,
          bold: isBold,
          size: fontSize,
          font: 'Arial',
          color: color
        }));
      }
    }

    if (textRuns.length > 0) {
      // 计算间距
      const marginBottom = this.parseMargin(styles['margin-bottom'] || styles['margin']);
      const paddingBottom = this.parseMargin(styles['padding-bottom'] || styles['padding']);

      return new Paragraph({
        children: textRuns,
        alignment: alignment,
        spacing: {
          after: marginBottom || paddingBottom || 200
        }
      });
    }

    return null;
  }

  /**
   * 递归构建文本运行，保留嵌套样式
   */
  static buildTextRuns($, $el, textRuns, defaultFontSize, defaultBold, defaultColor) {
    const { TextRun } = _getDocx();
    $el.contents().each((i, node) => {
      if (node.type === 'text') {
        const nodeText = $(node).text();
        if (nodeText && nodeText.trim()) {
          textRuns.push(new TextRun({
            text: nodeText,
            bold: defaultBold,
            size: defaultFontSize,
            font: 'Arial',
            color: defaultColor
          }));
        }
      } else if (node.type === 'tag') {
        const $child = $(node);
        const childTag = $child.prop('tagName')?.toLowerCase();
        const childStyleStr = $child.attr('style') || '';
        const childStyles = this.parseStyle(childStyleStr);

        const childBold = childTag === 'strong' || childTag === 'b' ||
          childStyles['font-weight']?.includes('bold') ||
          childStyles['font-weight'] === '600' ||
          childStyles['font-weight'] === '700' ||
          defaultBold;

        const childFontSize = this.fontSizeToHIP(childStyles['font-size']) || defaultFontSize;

        let childColor = defaultColor;
        if (childStyles['color']) {
          const colorMatch = childStyles['color'].match(/#([0-9a-f]{6})/i);
          if (colorMatch) {
            childColor = colorMatch[1].toUpperCase();
          }
        }

        const childText = $child.text();
        if (childText && childText.trim()) {
          textRuns.push(new TextRun({
            text: childText,
            bold: childBold,
            italics: childTag === 'em' || childTag === 'i',
            size: childFontSize,
            font: 'Arial',
            color: childColor
          }));
        } else {
          // 递归处理嵌套元素
          this.buildTextRuns($, $child, textRuns, childFontSize, childBold, childColor);
        }
      }
    });
  }

  /**
   * 解析边距值
   */
  static parseMargin(marginStr) {
    if (!marginStr) return 0;
    const match = marginStr.match(/(\d+)(?:px|pt)/i);
    if (match) {
      return parseInt(match[1]) * 20; // 转换为twentieths of a point
    }
    return 0;
  }

  /**
   * 转换表格
   */
  static convertTable($, $table) {
    const { Paragraph, TextRun, Table, TableRow, TableCell,
      AlignmentType, WidthType, BorderStyle } = _getDocx();
    const rows = [];
    $table.find('tr').each((i, tr) => {
      const cells = [];
      $(tr).find('td, th').each((j, cell) => {
        const $cell = $(cell);
        const cellText = $cell.text().trim();
        const isHeader = $cell.is('th');
        const cellStyleStr = $cell.attr('style') || '';
        const cellStyles = this.parseStyle(cellStyleStr);

        const isCenter = cellStyles['text-align'] === 'center';
        const isRight = cellStyles['text-align'] === 'right';
        const cellAlignment = isCenter ? AlignmentType.CENTER : (isRight ? AlignmentType.RIGHT : AlignmentType.LEFT);

        // 构建单元格内容
        const cellTextRuns = [];
        this.buildTextRuns($, $cell, cellTextRuns, 22, isHeader, undefined);

        if (cellTextRuns.length === 0 && cellText) {
          cellTextRuns.push(new TextRun({
            text: cellText,
            bold: isHeader,
            size: 22,
            font: 'Arial'
          }));
        }

        cells.push(new TableCell({
          children: [
            new Paragraph({
              children: cellTextRuns,
              alignment: cellAlignment
            })
          ],
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "333333" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "333333" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "333333" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "333333" }
          }
        }));
      });

      if (cells.length > 0) {
        rows.push(new TableRow({ children: cells }));
      }
    });

    if (rows.length > 0) {
      return new Table({
        rows: rows,
        width: { size: 100, type: WidthType.PERCENTAGE }
      });
    }

    return null;
  }
}

module.exports = WordExportService;
