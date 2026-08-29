import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 注册文件处理方法
  showOpenDialogSync: (options) => ipcRenderer.invoke('dialog:showOpenDialogSync', options),
  readSourceFile: (options) => ipcRenderer.invoke('readSourceFile', options),
  saveImage: (options) => ipcRenderer.invoke('saveImage', options),
  saveText: (options) => ipcRenderer.invoke('saveText', options),
  // 使用 sharp 调整输入的图片尺寸，适合 OCR 检测模型输入尺寸约束
  resizeImageDetOcr: (options) => ipcRenderer.invoke('sharp:resizeImageDetOcr', options),
  // 批量透视裁剪文字条：一次读图，根据检测框 4 角点数组透视裁剪并矫正为水平矩形
  cropTextRegions: (options) => ipcRenderer.invoke('sharp:cropTextRegions', options),
});
