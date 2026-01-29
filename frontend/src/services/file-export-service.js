/**
 * 统一文件导出服务
 * 封装所有文件导出和保存逻辑，支持 Tauri 文件对话框
 * 所有页面的导出功能都应该使用此服务，而不是直接调用 file-save-helper
 */

import { saveFile, isTauriEnvironment } from '../utils/file-save-helper.js';

export class FileExportService {
  /**
   * 导出并保存文件（统一接口）
   * @param {Blob} blob - 文件 Blob
   * @param {string} fileName - 文件名（包含扩展名）
   * @param {string} fileType - 文件类型描述（用于对话框，如 'Excel文件'、'Word文件'、'PDF文件'）
   * @param {Object} options - 选项
   * @param {string} [options.successMessage] - 自定义成功消息（可选，默认自动生成）
   * @param {boolean} [options.showNotification=true] - 是否显示通知（默认 true）
   * @returns {Promise<string|null|undefined>} 
   *   - Tauri 环境：返回保存的文件路径（string）或 null（用户取消）
   *   - 浏览器环境：返回 undefined（文件已下载到默认下载文件夹）
   */
  static async exportAndSave(blob, fileName, fileType = '文件', options = {}) {
    const { 
      successMessage, 
      showNotification = true 
    } = options;

    try {
      const savedPath = await saveFile(blob, fileName, fileType);
      
      // 显示提示信息
      if (showNotification) {
        if (savedPath) {
          // Tauri 环境：显示保存路径
          const message = successMessage || `${fileType}导出完成\n保存位置: ${savedPath}`;
          window.NotificationSystem?.toast(message, 'success', 4000);
        } else if (savedPath === null) {
          // 用户取消了保存
          window.NotificationSystem?.toast('已取消导出', 'info');
        } else {
          // 浏览器环境：显示下载提示
          const downloadPath = isTauriEnvironment() 
            ? '默认下载文件夹' 
            : '浏览器默认下载文件夹（通常是"下载"文件夹）';
          const message = successMessage || 
            `${fileType}导出完成\n文件名: ${fileName}\n保存位置: ${downloadPath}`;
          window.NotificationSystem?.toast(message, 'success', 3000);
        }
      }
      
      return savedPath;
    } catch (error) {
      console.error(`[FileExportService] ${fileType}导出失败:`, error);
      if (showNotification) {
        window.NotificationSystem?.toast(
          `${fileType}导出失败: ${error.message || '未知错误'}`, 
          'error'
        );
      }
      throw error;
    }
  }

  /**
   * 从 API 响应导出文件
   * @param {Response} response - Fetch 响应对象
   * @param {string} fileName - 文件名（包含扩展名）
   * @param {string} fileType - 文件类型描述
   * @param {Object} options - 选项
   * @returns {Promise<string|null|undefined>}
   */
  static async exportFromResponse(response, fileName, fileType = '文件', options = {}) {
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`${fileType}导出失败: ${response.status} ${errorText}`);
    }

    const blob = await response.blob();
    return await this.exportAndSave(blob, fileName, fileType, options);
  }

  /**
   * 从 URL 导出文件
   * @param {string} url - API URL
   * @param {Object} fetchOptions - Fetch 选项（method, headers, body 等）
   * @param {string} fileName - 文件名（包含扩展名）
   * @param {string} fileType - 文件类型描述
   * @param {Object} options - 选项
   * @returns {Promise<string|null|undefined>}
   */
  static async exportFromUrl(url, fetchOptions, fileName, fileType = '文件', options = {}) {
    const response = await fetch(url, fetchOptions);
    return await this.exportFromResponse(response, fileName, fileType, options);
  }

  /**
   * 导出 Excel 文件（便捷方法）
   * @param {Blob} blob - Excel 文件 Blob
   * @param {string} fileName - 文件名（包含 .xlsx 扩展名）
   * @param {Object} options - 选项
   */
  static async exportExcel(blob, fileName, options = {}) {
    return await this.exportAndSave(blob, fileName, 'Excel文件', options);
  }

  /**
   * 导出 Word 文件（便捷方法）
   * @param {Blob} blob - Word 文件 Blob
   * @param {string} fileName - 文件名（包含 .docx 扩展名）
   * @param {Object} options - 选项
   */
  static async exportWord(blob, fileName, options = {}) {
    return await this.exportAndSave(blob, fileName, 'Word文件', options);
  }

  /**
   * 导出 PDF 文件（便捷方法）
   * @param {Blob} blob - PDF 文件 Blob
   * @param {string} fileName - 文件名（包含 .pdf 扩展名）
   * @param {Object} options - 选项
   */
  static async exportPDF(blob, fileName, options = {}) {
    return await this.exportAndSave(blob, fileName, 'PDF文件', options);
  }

  /**
   * 导出 CSV 文件（便捷方法）
   * @param {Blob} blob - CSV 文件 Blob
   * @param {string} fileName - 文件名（包含 .csv 扩展名）
   * @param {Object} options - 选项
   */
  static async exportCSV(blob, fileName, options = {}) {
    return await this.exportAndSave(blob, fileName, 'CSV文件', options);
  }
}

// 导出单例（保持向后兼容）
export const fileExportService = FileExportService;

