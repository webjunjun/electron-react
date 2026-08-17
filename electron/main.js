import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { registerFileHandlers } from './handlers/file.js';
import {
  registerAppProtocolSchemes,
  registerAppProtocolHandler,
} from './handlers/protocol.js';
import { registerOnnxHandlers } from './handlers/onnx.js';

const isDev = process.env.NODE_ENV !== 'production';

// 必须在 app ready 之前声明特权协议
registerAppProtocolSchemes();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, '../public/icon.png'),
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境用自定义协议加载，运行在安全上下文中，避免 file:// 的各种限制
    mainWindow.loadURL('app://bundle/');
  }
}

app.whenReady().then(() => {
  // 注册自定义协议处理器（渲染产物目录 out/renderer）
  registerAppProtocolHandler(path.join(__dirname, '../renderer'));
  // 注册给渲染进程使用的方法
  registerFileHandlers(ipcMain);
  // 注册 ONNX 处理方法
  registerOnnxHandlers(ipcMain);
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});