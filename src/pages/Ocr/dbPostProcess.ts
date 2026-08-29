// DBPostProcess 纯 JS 实现（对应 PP-OCRv6_tiny_det.yml PostProcess）
// 不依赖 OpenCV.js / Clipper，使用连通域 + 凸包 + 旋转卡壳最小外接矩形 + 凸多边形 offset
// 算法对照 PaddleOCR ppocr/postprocess/db_postprocess.py 的 boxes_from_bitmap

export interface DetBox {
  /** 检测框 4 个角点，已还原回原图坐标 */
  points: [number, number][];
  /** 框内平均概率分数（0~1） */
  score: number;
}

export interface DBPostProcessOptions {
  /** 二值化阈值，对应 yml thresh */
  thresh?: number;
  /** 框评分阈值，对应 yml box_thresh */
  box_thresh?: number;
  /** 框扩展系数，对应 yml unclip_ratio */
  unclip_ratio?: number;
  /** 最大候选轮廓数，对应 yml max_candidates */
  max_candidates?: number;
  /** 最短边过滤阈值（像素），PaddleOCR 默认 3 */
  min_size?: number;
}

type Pt = [number, number];

// 8 连通连通域标记（BFS），返回每个连通域的像素一维索引列表
function connectedComponents(bitmap: Uint8Array, w: number, h: number): number[][] {
  const labels = new Uint8Array(w * h)
  const components: number[][] = []
  const stack: number[] = []
  for (let i = 0; i < bitmap.length; i++) {
    if (bitmap[i] === 0 || labels[i]) continue
    const comp: number[] = []
    const label = components.length + 1
    stack.push(i)
    labels[i] = label
    while (stack.length) {
      const p = stack.pop()!
      comp.push(p)
      const x = p % w
      const y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const np = ny * w + nx
          if (bitmap[np] && !labels[np]) {
            labels[np] = label
            stack.push(np)
          }
        }
      }
    }
    components.push(comp)
  }
  return components
}

// 凸包（Andrew's monotone chain），返回逆时针顶点
function convexHull(points: Pt[]): Pt[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const n = pts.length
  if (n <= 2) return pts
  const cross = (O: Pt, A: Pt, B: Pt) =>
    (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = n - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

// 最小面积外接矩形（旋转卡壳思想：枚举凸包每条边作为矩形一边方向）
function minAreaRect(hull: Pt[]): { points: Pt[]; width: number; height: number } | null {
  const n = hull.length
  if (n < 3) return null
  let minArea = Infinity
  let best: { points: Pt[]; width: number; height: number } | null = null
  for (let i = 0; i < n; i++) {
    const p1 = hull[i]
    const p2 = hull[(i + 1) % n]
    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const ux = dx / len
    const uy = dy / len
    const vx = -uy
    const vy = ux
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const p of hull) {
      const ox = p[0] - p1[0]
      const oy = p[1] - p1[1]
      const pu = ox * ux + oy * uy
      const pv = ox * vx + oy * vy
      if (pu < minU) minU = pu
      if (pu > maxU) maxU = pu
      if (pv < minV) minV = pv
      if (pv > maxV) maxV = pv
    }
    const w = maxU - minU
    const h = maxV - minV
    const area = w * h
    if (area < minArea) {
      minArea = area
      best = {
        width: w,
        height: h,
        points: [
          [p1[0] + ux * minU + vx * minV, p1[1] + uy * minU + vy * minV],
          [p1[0] + ux * maxU + vx * minV, p1[1] + uy * maxU + vy * minV],
          [p1[0] + ux * maxU + vx * maxV, p1[1] + uy * maxU + vy * maxV],
          [p1[0] + ux * minU + vx * maxV, p1[1] + uy * minU + vy * maxV],
        ],
      }
    }
  }
  return best
}

// 射线法判断点是否在多边形内
function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

// 框评分：在多边形 AABB 内采样 pred（连续概率图）求均值，对应 PaddleOCR box_score
function boxScore(pred: Float32Array, predW: number, predH: number, box: Pt[]): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of box) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const x1 = Math.max(0, Math.floor(minX))
  const x2 = Math.min(predW, Math.ceil(maxX))
  const y1 = Math.max(0, Math.floor(minY))
  const y2 = Math.min(predH, Math.ceil(maxY))
  let sum = 0
  let count = 0
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, box)) {
        sum += pred[y * predW + x]
        count++
      }
    }
  }
  return count > 0 ? sum / count : 0
}

// 两直线交点（参数式）
function lineIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1]
  const x3 = p3[0], y3 = p3[1], x4 = p4[0], y4 = p4[1]
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 1e-12) return null
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
}

// 凸多边形 offset（unclip）：沿每条边外法线平移 distance 后求相邻边交点
// distance = area * unclip_ratio / perimeter，对应 PaddleOCR pyclipper 实现
function unclip(polygon: Pt[], unclipRatio: number): Pt[] {
  const n = polygon.length
  if (n < 3) return polygon
  let sArea2 = 0 // 2 * 带符号面积
  let cxNum = 0
  let cyNum = 0
  let perimeter = 0
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i]
    const [x2, y2] = polygon[(i + 1) % n]
    const cross = x1 * y2 - x2 * y1
    sArea2 += cross
    cxNum += (x1 + x2) * cross
    cyNum += (y1 + y2) * cross
    perimeter += Math.hypot(x2 - x1, y2 - y1)
  }
  const A = sArea2 / 2
  if (Math.abs(A) < 1e-6 || perimeter < 1e-6) return polygon
  const cx = cxNum / (6 * A)
  const cy = cyNum / (6 * A)
  const distance = (Math.abs(A) * unclipRatio) / perimeter

  // 每条边沿外法线（远离质心方向）平移后的直线
  const offsetLines: (Pt[] | null)[] = []
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i]
    const [x2, y2] = polygon[(i + 1) % n]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) {
      offsetLines.push(null)
      continue
    }
    let nx = -dy / len
    let ny = dx / len
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    // 法线应远离质心：比较平移后中点与质心距离
    const d0 = (cx - mx) ** 2 + (cy - my) ** 2
    const d1 = (cx - (mx + nx)) ** 2 + (cy - (my + ny)) ** 2
    if (d1 < d0) {
      nx = -nx
      ny = -ny
    }
    offsetLines.push([
      [x1 + nx * distance, y1 + ny * distance],
      [x2 + nx * distance, y2 + ny * distance],
    ])
  }

  const newPoly: Pt[] = []
  for (let i = 0; i < n; i++) {
    const prev = offsetLines[(i - 1 + n) % n]
    const cur = offsetLines[i]
    if (prev && cur) {
      const pt = lineIntersect(prev[0], prev[1], cur[0], cur[1])
      newPoly.push(pt ?? polygon[i])
    } else {
      newPoly.push(polygon[i])
    }
  }
  return newPoly
}

/**
 * DBPostProcess：把检测模型输出的概率图转换为文字框
 * @param pred 概率图（sigmoid 后，0~1），按 [H, W] 行优先排布
 * @param predH 概率图高
 * @param predW 概率图宽
 * @param ratioW 缩放比 = resizedW / origW，用于把框 x 还原回原图
 * @param ratioH 缩放比 = resizedH / origH，用于把框 y 还原回原图
 */
export function dbPostProcess(
  pred: Float32Array,
  predH: number,
  predW: number,
  ratioW: number,
  ratioH: number,
  options?: DBPostProcessOptions,
): DetBox[] {
  const thresh = options?.thresh ?? 0.2
  const boxThresh = options?.box_thresh ?? 0.4
  const unclipRatio = options?.unclip_ratio ?? 1.4
  const maxCandidates = options?.max_candidates ?? 3000
  const minSize = options?.min_size ?? 3

  // 1. 二值化得到 bitmap
  const bitmap = new Uint8Array(predH * predW)
  for (let i = 0; i < pred.length; i++) {
    bitmap[i] = pred[i] > thresh ? 1 : 0
  }

  // 2. 连通域（对应 cv2.findContours）
  const components = connectedComponents(bitmap, predW, predH)

  // 3. 逐轮廓处理
  const boxes: DetBox[] = []
  const candidateCount = Math.min(components.length, maxCandidates)
  for (let c = 0; c < candidateCount; c++) {
    const comp = components[c]
    // 像素索引 -> 坐标点
    const points: Pt[] = new Array(comp.length)
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k]
      points[k] = [p % predW, (p - (p % predW)) / predW]
    }
    // 凸包 + 最小外接矩形（对应 get_mini_boxes）
    const hull = convexHull(points)
    if (hull.length < 3) continue
    const rect = minAreaRect(hull)
    if (!rect) continue
    const shortSide = Math.min(rect.width, rect.height)
    if (shortSide < minSize) continue

    // 框评分（对应 box_score，用连续概率图）
    const score = boxScore(pred, predW, predH, rect.points)
    if (boxThresh > score) continue

    // 扩展框（对应 unclip）
    const expanded = unclip(rect.points, unclipRatio)
    if (expanded.length < 3) continue
    // 扩展后再次求最小外接矩形
    const expandedHull = convexHull(expanded)
    const rect2 = minAreaRect(expandedHull)
    if (!rect2) continue
    const shortSide2 = Math.min(rect2.width, rect2.height)
    if (shortSide2 < minSize + 2) continue

    // 坐标还原回原图
    const restored: Pt[] = rect2.points.map(([x, y]) => [x / ratioW, y / ratioH])
    boxes.push({ points: restored, score })
  }
  return boxes
}

/**
 * 按阅读顺序排序检测框：按中心 y 分行（行高 60% 为容差），行内按中心 x 从左到右。
 * dbPostProcess 的输出顺序是连通域行扫描序，同一行片段、跨行框可能交错，
 * 排序后文本行拼接顺序与视觉阅读顺序一致。
 */
export function sortBoxesReadingOrder(boxes: DetBox[]): DetBox[] {
  const items = boxes.map((box) => {
    const xs = box.points.map((p) => p[0])
    const ys = box.points.map((p) => p[1])
    return {
      box,
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cy: (Math.min(...ys) + Math.max(...ys)) / 2,
      h: Math.max(...ys) - Math.min(...ys),
    }
  })
  items.sort((a, b) => a.cy - b.cy)
  const lines: typeof items[] = []
  for (const it of items) {
    const line = lines[lines.length - 1]
    if (line) {
      const lineCy = line.reduce((s, x) => s + x.cy, 0) / line.length
      const lineH = Math.max(...line.map((x) => x.h), it.h)
      if (Math.abs(it.cy - lineCy) < lineH * 0.6) {
        line.push(it)
        continue
      }
    }
    lines.push([it])
  }
  return lines.flatMap((line) => line.sort((a, b) => a.cx - b.cx)).map((x) => x.box)
}
