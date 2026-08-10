// Types for the API exposed by electron/preload.js via contextBridge.
export interface ElectronAPI {
  showOpenDialogSync: (options?: Electron.OpenDialogSyncOptions) => Promise<string[] | undefined>;
  readSourceFile: (options: {
    filePath: string,
    codeFormat?: string
  }) => Promise<string | undefined>,
  saveImage: (options: {
    base64: string,
    defaultFileName?: string
  }) => Promise<{ saved: boolean; filePath?: string; error?: string }>,
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
