import * as ort from 'onnxruntime-web';

// PP-OCRv6_tiny_det.yml PreProcess 配置
// DecodeImage(img_mode: BGR) -> NormalizeImage -> ToCHWImage
// NormalizeImage: scale=1/255, mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225], order=hwc
// 注意：PaddleOCR 中 DecodeImage 后图片为 BGR，mean/std 按 [B,G,R] 顺序逐通道应用
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const SCALE = 1 / 255;

export interface ResizedImage {
  /** 原始 RGB 像素数据，HWC 排列（来自 sharp） */
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
  originalWidth: number;
  originalHeight: number;
  ratioW: number;
  ratioH: number;
}

/**
 * 将 sharp 返回的 RGB HWC 像素数据处理为 ONNX NCHW float32 张量
 * 对应 PP-OCRv6_tiny_det.yml 预处理流程：
 *   1. BGR 通道转换（DecodeImage: img_mode=BGR）
 *   2. 归一化（NormalizeImage: (x*scale - mean) / std，按 BGR 顺序）
 *   3. HWC -> CHW（ToCHWImage），并加上 batch 维 -> NCHW
 */
export function buildDetInputTensor(resized: ResizedImage): {
  tensor: ort.Tensor;
  shape: [number, number, number, number];
} {
  const { data, width: W, height: H, channels: C } = resized;
  const pixelCount = H * W;

  // 输出 NCHW float32，通道顺序为 BGR
  const tensorData = new Float32Array(C * H * W);

  // sharp 输出为 RGB HWC：data[i*C + 0]=R, [1]=G, [2]=B
  // 目标为 BGR CHW：输出通道 0=B, 1=G, 2=R
  // 通道映射：输出通道 c 对应输入通道 channelMap[c]
  const channelMap = [2, 1, 0]; // B, G, R

  for (let c = 0; c < C; c++) {
    const srcC = channelMap[c];
    const mean = MEAN[c];
    const std = STD[c];
    const invStd = 1 / std;
    const outOffset = c * pixelCount;
    // HWC 中同一通道的像素 stride 为 C
    const inBase = srcC;
    for (let i = 0; i < pixelCount; i++) {
      const val = data[inBase + i * C] * SCALE;
      tensorData[outOffset + i] = (val - mean) * invStd;
    }
  }

  const shape: [number, number, number, number] = [1, C, H, W];
  const tensor = new ort.Tensor('float32', tensorData, shape);
  return { tensor, shape };
}
