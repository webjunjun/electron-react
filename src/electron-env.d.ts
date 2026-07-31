// Types for the API exposed by electron/preload.js via contextBridge.
export interface ElectronAPI {
  showOpenDialogSync: (options?: Electron.OpenDialogSyncOptions) => Promise<string[] | undefined>;
  readSourceFile: (options: {
    filePath: string,
    codeFormat?: string
  }) => Promise<string | undefined>,
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
