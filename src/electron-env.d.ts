// Types for the API exposed by electron/preload.js via contextBridge.
export interface ElectronAPI {
  // 注册文件处理方法
  showOpenDialogSync: (options?: Electron.OpenDialogSyncOptions) => Promise<string[] | undefined>;
  readSourceFile: (options: {
    filePath: string,
    codeFormat?: string
  }) => Promise<string | undefined>,
  saveImage: (options: {
    base64: string,
    defaultFileName?: string
  }) => Promise<{ saved: boolean; filePath?: string; error?: string }>,
  // 注册 ONNX 处理方法
  loadModel: (modelPath: string, options?: OnnxSessionOptions) => Promise<OnnxSession | null>,
  runModel: (session: OnnxSession, input: Record<string, OnnxValue>) => Promise<Record<string, OnnxValue> | null>,
  releaseModel: (session: OnnxSession) => void,
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
