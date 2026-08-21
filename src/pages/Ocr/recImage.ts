import * as ort from 'onnxruntime-web';

// PP-OCRv6_tiny_rec.yml PreProcess 配置：
//   DecodeImage(img_mode: BGR) -> RecResizeImg([3,48,320]) -> KeepKeys(image)
// 注意：yml 未配置 NormalizeImage，但 PaddleOCR 惯例 rec 输入需归一化（与 det 一致）
// 此处先用 det 的 mean/std 归一化，若识别乱码再改为 0-255 原始像素
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const SCALE = 1 / 255;

export interface RecCrop {
  /** 裁剪并 RecResizeImg 后的 RGB 像素，HWC 排列（来自主进程 cropTextRegion） */
  data: Uint8Array;
  /** 动态宽度（随文字条宽高比变化，不固定 320） */
  width: number;
  height: number;
  channels: number;
}

export interface RecBatch {
  /** NCHW float32 张量，shape=[n,3,48,maxW] */
  tensor: ort.Tensor;
  /** 该 batch 在原 crops 数组中的索引，用于结果回填到原顺序 */
  indices: number[];
}

/**
 * 将多个文字条裁剪图打包为多个 ONNX batch 张量（动态宽度 + 分组 batch）
 * 策略（与 PaddleOCR 实用 rec 流程一致）：
 *   1. 按宽度排序 crops，使相邻 crop 宽度接近
 *   2. 每 batchSize 个为一组，组内用最大宽度 maxW 右侧 pad 0
 *   3. 每组 build 一个 [n,3,48,maxW] 张量，batch 推理
 * 优点：长文字行不被压缩到固定宽度（保精度），同组宽度接近减少 pad 浪费
 * 预处理对齐 PP-OCRv6_tiny_rec.yml：BGR 通道转换 + 归一化 + HWC->NCHW
 */
export function buildRecTensors(crops: RecCrop[], batchSize = 8): RecBatch[] {
  if (crops.length === 0) return [];
  const C = 3;
  const H = crops[0].height;

  // 按宽度排序，记录原索引（保持稳定排序便于回填）
  const order = crops
    .map((_, i) => i)
    .sort((a, b) => crops[a].width - crops[b].width);

  const batches: RecBatch[] = [];
  const channelMap = [2, 1, 0]; // B, G, R（sharp 输出 RGB，目标 BGR）

  for (let i = 0; i < order.length; i += batchSize) {
    const batchOrder = order.slice(i, i + batchSize);
    const n = batchOrder.length;
    const maxW = Math.max(...batchOrder.map((idx) => crops[idx].width));
    const tensorData = new Float32Array(n * C * H * maxW);

    for (let bi = 0; bi < n; bi++) {
      const crop = crops[batchOrder[bi]];
      const data = crop.data;
      const w = crop.width;
      for (let c = 0; c < C; c++) {
        const srcC = channelMap[c];
        const mean = MEAN[c];
        const invStd = 1 / STD[c];
        const outOff = (bi * C + c) * H * maxW;
        const inBase = srcC;
        for (let y = 0; y < H; y++) {
          const inRowOff = y * w * C;
          const outRowOff = outOff + y * maxW;
          for (let x = 0; x < w; x++) {
            const val = data[inBase + inRowOff + x * C] * SCALE;
            tensorData[outRowOff + x] = (val - mean) * invStd;
          }
          // x >= w 保持 0（右侧 pad）
        }
      }
    }

    const tensor = new ort.Tensor('float32', tensorData, [n, C, H, maxW]);
    batches.push({ tensor, indices: batchOrder });
  }
  return batches;
}
