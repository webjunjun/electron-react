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
  // 使用 sharp 调整输入的图片尺寸，适合 OCR 检测模型输入尺寸约束，返回原始 RGB 像素数据及尺寸/比例信息
  resizeImageDetOcr: (options: {
    path: string;
    /** 最长边上限，默认 960 */
    limitSideLen?: number;
    /** 尺寸对齐到的倍数，默认 32 */
    divisibleBy?: number;
  }) => Promise<
    | {
        success: true;
        /** 原始 RGB 像素数据，HWC 排列 */
        data: Uint8Array;
        width: number;
        height: number;
        channels: number;
        originalWidth: number;
        originalHeight: number;
        /** 宽高缩放比例，对齐后可能略有差异，供后处理还原坐标使用 */
        ratioW: number;
        ratioH: number;
      }
    | { success: false; error?: string }
  >;
  // 透视裁剪文字条：根据检测框 4 角点从原图透视裁剪并矫正为水平矩形，返回 RGB HWC 像素
  cropTextRegion: (options: {
    path: string;
    /** 检测框 4 个角点，原图坐标 */
    quad: [number, number][];
  }) => Promise<
    | {
        success: true;
        /** 裁剪后 RGB 像素数据，HWC 排列 */
        data: Uint8Array;
        width: number;
        height: number;
        channels: number;
      }
    | { success: false; error?: string }
  >;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
