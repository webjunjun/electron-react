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
  // 注册保存图片：弹出另存为对话框并写入 PNG
  ipcMain.handle('saveImage', async (_event, { base64, defaultFileName = 'export.png' }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出图片',
      defaultPath: defaultFileName,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    if (canceled || !filePath) return { saved: false };
    try {
      // base64 去掉 data:image/png;base64, 前缀后写入
      const data = base64.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      return { saved: true, filePath };
    } catch (error) {
      return { saved: false, error: String(error) };
    }
  });
}
