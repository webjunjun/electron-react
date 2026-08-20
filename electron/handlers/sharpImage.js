import sharp from 'sharp';

// OCR 检测模型输入尺寸约束（来自 PP-OCRv6_tiny_det.yml dynamic shapes）：
// 最小 32x32，最优 736x736，最大 4000x4000，尺寸需为 32 的倍数
const DEFAULT_LIMIT_SIDE_LEN = 960;
const DEFAULT_DIVISIBLE_BY = 32;

export const registerSharpImageHandlers = (ipcMain) => {
  // 调整图片尺寸：保持宽高比，限制最长边，并对齐到 divisibleBy 的倍数
  // 返回原始 RGB 像素数据（HWC 排列），供渲染进程做归一化/通道转换后送入 ONNX 模型
  ipcMain.handle('sharp:resizeImageDetOcr', async (_event, {
    path,
    limitSideLen = DEFAULT_LIMIT_SIDE_LEN,
    divisibleBy = DEFAULT_DIVISIBLE_BY,
  } = {}) => {
    try {
      if (!path) return { success: false, error: '缺少图片路径' };

      const meta = await sharp(path).metadata();
      const origW = meta.width || 0;
      const origH = meta.height || 0;
      if (!origW || !origH) {
        return { success: false, error: '无法读取图片尺寸' };
      }

      // 计算缩放比例：最长边不超过 limitSideLen
      let ratio = 1;
      const maxSide = Math.max(origW, origH);
      if (maxSide > limitSideLen) {
        ratio = limitSideLen / maxSide;
      }

      let targetW = Math.round(origW * ratio);
      let targetH = Math.round(origH * ratio);

      // 对齐到 divisibleBy 的倍数（至少为 divisibleBy）
      const minSize = Math.max(divisibleBy, 32);
      targetW = Math.max(minSize, Math.floor(targetW / divisibleBy) * divisibleBy);
      targetH = Math.max(minSize, Math.floor(targetH / divisibleBy) * divisibleBy);

      // fit: 'fill' 拉伸到精确目标尺寸，与 PaddleOCR cv2.resize 行为一致
      const { data, info } = await sharp(path)
        .resize(targetW, targetH, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      return {
        success: true,
        data, // Buffer: 原始 RGB 像素，HWC 排列
        width: info.width,
        height: info.height,
        channels: info.channels,
        originalWidth: origW,
        originalHeight: origH,
        // 对齐到 32 倍数后宽高比例可能略有差异，分别返回供后处理还原坐标使用
        ratioW: info.width / origW,
        ratioH: info.height / origH,
      };
    } catch (error) {
      console.error('[sharpImage] resizeImageDetOcr failed:', error);
      return { success: false, error: String(error) };
    }
  });
};
