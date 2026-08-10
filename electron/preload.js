import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  showOpenDialogSync: (options) => ipcRenderer.invoke('dialog:showOpenDialogSync', options),
  readSourceFile: (options) => ipcRenderer.invoke('readSourceFile', options),
  saveImage: (options) => ipcRenderer.invoke('saveImage', options),
});
