import sharp from 'sharp';

// sharp 处理图片
export const registerSharpImageHandlers = (ipcMain) => {
  // 将图片转换为 ONNX 输入格式
  ipcMain.handle('sharp:imgToOnnxInput', async (_event, {
    path, width, height, format = 'jpg'
  }) => {
    try {
      const data = await sharp(path)
        .resize(width, height)
        .toBuffer();
      return data.toString('base64');
    } catch (error) {
      return null;
    }
  });
}
