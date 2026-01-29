/**
 * 文件保存辅助工具
 * 支持 Tauri 环境和浏览器环境
 */

/**
 * 保存文件（支持 Tauri 文件对话框和浏览器下载）
 * @param {Blob} blob - 要保存的文件 Blob
 * @param {string} defaultFileName - 默认文件名
 * @param {string} fileType - 文件类型描述（用于 Tauri 对话框）
 * @returns {Promise<string|null|undefined>} 
 *   - Tauri 环境：返回保存的文件路径（string）或 null（用户取消）
 *   - 浏览器环境：返回 undefined（文件已下载到默认下载文件夹）
 */
export async function saveFile(blob, defaultFileName, fileType = 'Excel文件') {
  console.log('[FileSaveHelper] 开始保存文件:', {
    defaultFileName,
    fileType,
    hasTauri: !!(typeof window !== 'undefined' && window.__TAURI__),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  });
  
  // 尝试使用 Tauri 文件保存对话框
  // 在 Tauri 2.x 中，即使 window.__TAURI__ 不存在，插件也可以直接导入
  try {
    console.log('[FileSaveHelper] 尝试使用 Tauri 文件保存对话框...');
    
    // 方法1: 尝试使用全局 Tauri API (如果可用)
    let save, writeBinaryFile;
    
    if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.dialog && window.__TAURI__.fs) {
      console.log('[FileSaveHelper] 使用全局 Tauri API');
      save = window.__TAURI__.dialog.save;
      // Tauri 2.x 使用 writeFile 而不是 writeBinaryFile
      writeBinaryFile = window.__TAURI__.fs.writeFile || window.__TAURI__.fs.writeBinaryFile;
    } else {
      // 方法2: 直接尝试动态导入插件（Tauri 2.x 推荐方式）
      console.log('[FileSaveHelper] 尝试动态导入 Tauri 插件...');
      
      let dialogModule, fsModule;
      
      try {
        dialogModule = await import('@tauri-apps/plugin-dialog');
        console.log('[FileSaveHelper] dialog 插件导入成功');
      } catch (error) {
        console.warn('[FileSaveHelper] dialog 插件导入失败，可能不在 Tauri 环境中:', error.message);
        throw new Error('NOT_TAURI_ENV'); // 抛出特殊错误，触发回退
      }
      
      try {
        fsModule = await import('@tauri-apps/plugin-fs');
        console.log('[FileSaveHelper] fs 插件导入成功');
      } catch (error) {
        console.warn('[FileSaveHelper] fs 插件导入失败，可能不在 Tauri 环境中:', error.message);
        throw new Error('NOT_TAURI_ENV'); // 抛出特殊错误，触发回退
      }
      
      // 检查插件是否成功加载
      // 注意：Tauri 2.x 使用 writeFile 而不是 writeBinaryFile
      if (!dialogModule || !fsModule || !dialogModule.save || !fsModule.writeFile) {
        console.warn('[FileSaveHelper] Tauri 插件未正确加载:', {
          hasDialogModule: !!dialogModule,
          hasFsModule: !!fsModule,
          hasSave: !!(dialogModule && dialogModule.save),
          hasWriteFile: !!(fsModule && fsModule.writeFile),
          fsModuleKeys: fsModule ? Object.keys(fsModule) : null
        });
        throw new Error('NOT_TAURI_ENV'); // 抛出特殊错误，触发回退
      }
      
      save = dialogModule.save;
      writeBinaryFile = fsModule.writeFile; // Tauri 2.x 使用 writeFile
    }
    
    // 验证函数是否可用
    if (typeof save !== 'function' || typeof writeBinaryFile !== 'function') {
      console.error('[FileSaveHelper] Tauri API 函数不可用:', {
        saveType: typeof save,
        writeBinaryFileType: typeof writeBinaryFile
      });
      throw new Error('NOT_TAURI_ENV'); // 抛出特殊错误，触发回退
    }
    
    console.log('[FileSaveHelper] 准备显示文件保存对话框...');
    
    // 确定文件扩展名
      const fileExtension = defaultFileName.split('.').pop()?.toLowerCase() || '';
      const extensions = fileExtension === 'xlsx' 
        ? ['xlsx'] 
        : fileExtension === 'docx'
        ? ['docx']
        : fileExtension === 'pdf'
        ? ['pdf']
        : fileExtension === 'txt'
        ? ['txt']
        : [fileExtension || '*'];
      
      // 显示文件保存对话框
      console.log('[FileSaveHelper] 调用 save 对话框，参数:', {
        defaultPath: defaultFileName,
        filters: [{
          name: fileType,
          extensions: extensions
        }]
      });
      
      const filePath = await save({
        defaultPath: defaultFileName,
        filters: [{
          name: fileType,
          extensions: extensions
        }]
      });
      
      console.log('[FileSaveHelper] 文件保存对话框返回:', filePath);
      
      if (filePath) {
        // 将 Blob 转换为 ArrayBuffer，然后转换为 Uint8Array
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // 写入文件
        await writeBinaryFile(filePath, uint8Array);
        
        console.log('[FileSaveHelper] 文件保存成功:', filePath);
        return filePath;
      }
      
    // 用户取消了保存
    console.log('[FileSaveHelper] 用户取消了文件保存');
    return null;
  } catch (error) {
    // 如果是特殊错误，说明不在 Tauri 环境中，回退到浏览器下载
    if (error.message === 'NOT_TAURI_ENV') {
      console.log('[FileSaveHelper] 不在 Tauri 环境中，使用浏览器下载');
      return saveFileBrowser(blob, defaultFileName);
    }
    // 其他错误也回退到浏览器下载
    console.error('[FileSaveHelper] Tauri 文件保存失败，回退到浏览器下载:', error);
    return saveFileBrowser(blob, defaultFileName);
  }
}

/**
 * 浏览器环境下的文件保存（下载）
 * @param {Blob} blob - 要保存的文件 Blob
 * @param {string} fileName - 文件名
 * @returns {Promise<null>}
 */
function saveFileBrowser(blob, fileName) {
  return new Promise((resolve) => {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = fileName;
    
    // 触发下载
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 清理 URL
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
    
    resolve(null);
  });
}

/**
 * 检测是否在 Tauri 环境中
 * @returns {boolean}
 */
export function isTauriEnvironment() {
  return typeof window !== 'undefined' && window.__TAURI__;
}

