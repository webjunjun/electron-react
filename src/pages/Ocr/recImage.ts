import * as ort from 'onnxruntime-web';

// PP-OCRv6_tiny_rec.yml PreProcess 配置：
//   DecodeImage(img_mode: BGR) -> RecResizeImg([3,48,320]) -> KeepKeys(image)
//   模型训练时固定 320 宽度，推理时对齐训练配置，所有 crop pad 到 320
// 归一化：PP-OCRv6 rec 模型内部已包含归一化，这里直接用 0-255 原始像素（与 PaddleOCR 官方实现一致）
const SCALE = 1 / 255;

export interface RecCrop {
  /** 裁剪并 RecResizeImg 后的 RGB 像素，HWC 排列（来自主进程 cropTextRegion，固定 48×320） */
  data: Uint8Array;
  /** 固定宽度 320 */
  width: number;
  height: number;
  channels: number;
}

export interface RecBatch {
  /** NCHW float32 张量，shape=[n,3,48,320] */
  tensor: ort.Tensor;
  /** 该 batch 在原 crops 数组中的索引，用于结果回填到原顺序 */
  indices: number[];
}

/**
 * 将多个文字条裁剪图打包为 ONNX batch 张量
 * 策略：所有 crop 已固定为 48×320，直接按 batchSize 分组即可
 * 预处理：BGR 通道转换 + 0-1 归一化 + HWC->NCHW
 */
export function buildRecTensors(crops: RecCrop[], batchSize = 8): RecBatch[] {
  if (crops.length === 0) return [];
  const C = 3;
  const H = crops[0].height;
  const W = crops[0].width; // 固定 320

  const batches: RecBatch[] = [];
  const channelMap = [2, 1, 0]; // B, G, R（sharp 输出 RGB，目标 BGR）

  for (let i = 0; i < crops.length; i += batchSize) {
    const batchOrder: number[] = [];
    for (let j = i; j < Math.min(i + batchSize, crops.length); j++) batchOrder.push(j);
    const n = batchOrder.length;
    const tensorData = new Float32Array(n * C * H * W);

    for (let bi = 0; bi < n; bi++) {
      const crop = crops[batchOrder[bi]];
      const data = crop.data;
      for (let c = 0; c < C; c++) {
        const srcC = channelMap[c];
        const outOff = (bi * C + c) * H * W;
        const inBase = srcC;
        for (let y = 0; y < H; y++) {
          const inRowOff = y * W * C;
          const outRowOff = outOff + y * W;
          for (let x = 0; x < W; x++) {
            // 模型内部已归一化，这里只做 0-1 缩放 + BGR 通道转换
            tensorData[outRowOff + x] = data[inBase + inRowOff + x * C] * SCALE;
          }
        }
      }
    }

    const tensor = new ort.Tensor('float32', tensorData, [n, C, H, W]);
    batches.push({ tensor, indices: batchOrder });
  }
  return batches;
}
