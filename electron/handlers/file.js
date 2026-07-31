import { dialog } from 'electron';
import fs from 'node:fs'

export const registerFileHandlers = (ipcMain) => {
  // 注册打开文件对话框
  ipcMain.handle('dialog:showOpenDialogSync', (_event, options) => dialog.showOpenDialogSync({
    properties: ['openFile'],
    ...options,
  }));
  // 注册读取源文件内容
  ipcMain.handle('readSourceFile', (_event, {
    filePath, codeFormat = 'utf-8'
  }) => {
    try {
      // utf-8: 非图片需要传入编码
      const content = codeFormat ? fs.readFileSync(filePath, codeFormat) : fs.readFileSync(filePath);
      return content;
    } catch (error) {
      return null;
    }
  });
}
