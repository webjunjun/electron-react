import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 注册文件处理方法
  showOpenDialogSync: (options) => ipcRenderer.invoke('dialog:showOpenDialogSync', options),
  readSourceFile: (options) => ipcRenderer.invoke('readSourceFile', options),
  saveImage: (options) => ipcRenderer.invoke('saveImage', options),
  // 注册 ONNX 处理方法
  loadModel: (modelPath, options) => ipcRenderer.invoke('onnx:loadModel', modelPath, options),
  runModel: (session, input) => ipcRenderer.invoke('onnx:runModel', { session, input }),
  releaseModel: (session) => ipcRenderer.invoke('onnx:releaseModel', session),
});
