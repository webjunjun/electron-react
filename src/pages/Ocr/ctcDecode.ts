import * as ort from 'onnxruntime-web';
// 字典已从 yml 预提取到 txt（每行一个字符，共 6904 项），运行时 ?raw 导入 + split，避免每次解析 yml
import dictRaw from '../../assets/ocr_lib/ppocr_keys_v1.txt?raw';

export interface RecResult {
  text: string;
  /** 平均置信度（0~1） */
  score: number;
}

// 字典：ppocr_keys_v1.txt 每行一个字符（共 6904 项），运行时 split
let cachedDict: string[] | null = null;
export function getRecCharDict(): string[] {
  if (cachedDict) return cachedDict;
  cachedDict = dictRaw.split(/\r?\n/).filter((s) => s.length > 0);
  return cachedDict;
}

/**
 * CTC greedy 解码（对应 PaddleOCR CTCLabelDecode）
 *
 * PP-OCRv6 字符布局：character = ['blank'] + dict + ['space']
 *   - 索引 0：blank（跳过）
 *   - 索引 1..dict.length：dict[0..dict.length-1]
 *   - 索引 dict.length+1：space（' '），仅 useSpace=true 时存在
 * 模型输出维度 = dict.length + 1(blank) + (1 if useSpace else 0)
 *
 * 自动检测输出布局：3D 张量 [d0,d1,d2]，类别轴 C = 值最接近 numClasses 的维，
 * 剩余两轴按值小=N(batch)、大=W(时间步) 区分，row-major stride 索引
 */
export function ctcDecode(
  outputTensor: ort.Tensor,
  options?: { useSpace?: boolean }
): RecResult[] {
  const dims = outputTensor.dims as number[];
  const data = outputTensor.data as Float32Array;
  const dict = getRecCharDict();
  const useSpace = options?.useSpace ?? true; // PP-OCRv6 默认 use_space=True
  const numClasses = dict.length + 1 + (useSpace ? 1 : 0);
  const blank = 0; // blank 在索引 0
  const spaceIdx = useSpace ? dict.length + 1 : -1;

  // 检测类别轴 C（值最接近 numClasses）
  let cAxis = 0;
  for (let i = 1; i < dims.length; i++) {
    if (Math.abs(dims[i] - numClasses) < Math.abs(dims[cAxis] - numClasses)) cAxis = i;
  }
  // 剩余轴按值小=N、大=W 排序
  const other: number[] = [];
  for (let i = 0; i < dims.length; i++) {
    if (i !== cAxis) other.push(i);
  }
  other.sort((a, b) => dims[a] - dims[b]);
  const nAxis = other[0];
  const wAxis = other[1];

  // row-major stride
  const stride = new Array(dims.length).fill(0);
  stride[dims.length - 1] = 1;
  for (let i = dims.length - 2; i >= 0; i--) {
    stride[i] = stride[i + 1] * dims[i + 1];
  }
  const nStride = stride[nAxis];
  const wStride = stride[wAxis];
  const cStride = stride[cAxis];

  const N = dims[nAxis];
  const W = dims[wAxis];
  const C = dims[cAxis];

  console.log(
    '[ctc] dims:', dims,
    'N:', N, 'W:', W, 'C:', C,
    'numClasses:', numClasses, 'blank:', blank, 'spaceIdx:', spaceIdx,
    'dictLen:', dict.length, 'useSpace:', useSpace
  );

  const results: RecResult[] = [];
  for (let n = 0; n < N; n++) {
    const chars: string[] = [];
    let scoreSum = 0;
    let scoreCount = 0;
    let prevIdx = -1;
    for (let t = 0; t < W; t++) {
      // argmax 沿 C 维
      let maxIdx = 0;
      let maxVal = -Infinity;
      const base = n * nStride + t * wStride;
      for (let c = 0; c < C; c++) {
        const v = data[base + c * cStride];
        if (v > maxVal) {
          maxVal = v;
          maxIdx = c;
        }
      }
      // blank：重置前一字符，跳过
      if (maxIdx === blank) {
        prevIdx = -1;
        continue;
      }
      // 合并相邻重复
      if (maxIdx === prevIdx) continue;
      // 映射到字符
      let ch: string | null = null;
      if (useSpace && maxIdx === spaceIdx) {
        ch = ' ';
      } else {
        const dictIdx = maxIdx - 1;
        if (dictIdx >= 0 && dictIdx < dict.length) {
          ch = dict[dictIdx];
        }
      }
      if (ch !== null) {
        chars.push(ch);
        scoreSum += maxVal;
        scoreCount++;
      }
      prevIdx = maxIdx;
    }
    results.push({
      text: chars.join(''),
      score: scoreCount > 0 ? scoreSum / scoreCount : 0,
    });
  }
  return results;
}
