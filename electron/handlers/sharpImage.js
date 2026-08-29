import sharp from 'sharp';

// OCR 检测模型输入尺寸约束（来自 PP-OCRv6_tiny_det.yml dynamic shapes）：
// 最小 32x32，最优 736x736，最大 4000x4000，尺寸需为 32 的倍数
const DEFAULT_LIMIT_SIDE_LEN = 960;
const DEFAULT_DIVISIBLE_BY = 32;

// rec 识别模型输入尺寸
//   PP-OCRv6_tiny_rec.yml 训练配置 image_shape: [3, 48, 320]
//   dynamic_shapes 范围 [1,3,48,160] ~ [8,3,48,3200] 仅为 ONNX 推理灵活性，实际推理应对齐训练宽度
const REC_IMAGE_H = 48;
const REC_IMAGE_W = 320;

// 透视变换辅助函数（手写实现，与 cv2.warpPerspective 数学等价，零依赖）
// 对应 PaddleOCR 的 get_rotate_crop_image：根据 4 角点从原图透视裁剪并矫正为水平矩形

// 将 4 个角点排序为 [左上, 右上, 右下, 左下]（按中心点象限划分，保证顺序稳定）
function orderQuadPoints(pts) {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
  let tl = null, tr = null, br = null, bl = null;
  for (const p of pts) {
    const [x, y] = p;
    if (x < cx && y < cy) tl = tl || p;
    else if (x >= cx && y < cy) tr = tr || p;
    else if (x >= cx && y >= cy) br = br || p;
    else bl = bl || p;
  }
  // 退化情况兜底：取 pts 原顺序
  return [tl || pts[0], tr || pts[1], br || pts[2], bl || pts[3]];
}

// 解 8x8 线性方程组 A·x = b（Gauss-Jordan 消元，带部分主元）
function solveLinearSystem(A, b) {
  const n = b.length;
  // 增广矩阵 M = [A | b]
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // 选主元
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }
    if (Math.abs(M[col][col]) < 1e-12) return null; // 奇异矩阵
    // 归一化主元行
    const diag = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= diag;
    // 消去其他行
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

// 求 dst->src 的 3x3 透视矩阵（返回 [a,b,c,d,e,f,g,h,1]，行主序）
// 使得对目标点 (xd,yd)，源点坐标为：
//   xs = (a·xd + b·yd + c) / (g·xd + h·yd + 1)
//   ys = (d·xd + e·yd + f) / (g·xd + h·yd + 1)
function getDstToSrcMatrix(dstQuad, srcQuad) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [xd, yd] = dstQuad[i];
    const [xs, ys] = srcQuad[i];
    A.push([xd, yd, 1, 0, 0, 0, -xd * xs, -yd * xs]);
    b.push(xs);
    A.push([0, 0, 0, xd, yd, 1, -xd * ys, -yd * ys]);
    b.push(ys);
  }
  const sol = solveLinearSystem(A, b);
  if (!sol) return null;
  return [sol[0], sol[1], sol[2], sol[3], sol[4], sol[5], sol[6], sol[7], 1];
}

// 双线性插值采样（边界外填 0）
function bilinearSample(data, w, h, x, y, out, outOff) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) {
    out[outOff] = 0;
    out[outOff + 1] = 0;
    out[outOff + 2] = 0;
    return;
  }
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const dx = x - x0, dy = y - y0;
  const i00 = (y0 * w + x0) * 3;
  const i01 = (y0 * w + x1) * 3;
  const i10 = (y1 * w + x0) * 3;
  const i11 = (y1 * w + x1) * 3;
  const w00 = (1 - dx) * (1 - dy);
  const w01 = dx * (1 - dy);
  const w10 = (1 - dx) * dy;
  const w11 = dx * dy;
  for (let c = 0; c < 3; c++) {
    out[outOff + c] = Math.round(
      data[i00 + c] * w00 + data[i01 + c] * w01 + data[i10 + c] * w10 + data[i11 + c] * w11
    );
  }
}

// 透视重采样：对目标矩形每像素用 dst->src 矩阵映射回源图，双线性采样
function warpPerspective(srcData, srcW, srcH, dstW, dstH, m) {
  const dstData = Buffer.alloc(dstW * dstH * 3);
  const [a, b, c, d, e, f, g, h] = m;
  for (let y = 0; y < dstH; y++) {
    const rowOff = y * dstW;
    for (let x = 0; x < dstW; x++) {
      const wDen = g * x + h * y + 1;
      const xs = (a * x + b * y + c) / wDen;
      const ys = (d * x + e * y + f) / wDen;
      bilinearSample(srcData, srcW, srcH, xs, ys, dstData, (rowOff + x) * 3);
    }
  }
  return dstData;
}

// 双线性 resize（半像素中心对齐，与 cv2.resize INTER_LINEAR 一致）
function resizeBilinear(srcData, srcW, srcH, dstW, dstH) {
  const dstData = Buffer.alloc(dstW * dstH * 3);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy = (y + 0.5) * yRatio - 0.5;
    for (let x = 0; x < dstW; x++) {
      const sx = (x + 0.5) * xRatio - 0.5;
      bilinearSample(srcData, srcW, srcH, sx, sy, dstData, (y * dstW + x) * 3);
    }
  }
  return dstData;
}

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
      // EXIF orientation 5-8 表示横竖交换（如手机竖拍照片），需交换宽高与实际显示一致
      const swap = meta.orientation >= 5 && meta.orientation <= 8;
      const origW = swap ? meta.height || 0 : meta.width || 0;
      const origH = swap ? meta.width || 0 : meta.height || 0;
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
      // .rotate() 按 EXIF 自动旋转，与浏览器 <img> 显示方向一致，保证坐标还原正确
      const { data, info } = await sharp(path)
        .rotate()
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

  // 批量透视裁剪文字条并 resize 到 rec 输入尺寸：一次读取原图，
  // 对所有检测框执行透视裁剪 + RecResizeImg（保持宽高比 resize 到高 48，右侧 pad 0 到宽 320），
  // 对应 PaddleOCR 的 get_rotate_crop_image + RecResizeImg，输出 RGB HWC 像素供 rec 模型预处理
  // 返回 crops 数组与传入 quads 一一对应，单个 quad 失败不影响其他框
  ipcMain.handle('sharp:cropTextRegions', async (_event, { path, quads = [] } = {}) => {
    try {
      if (!path) return { success: false, error: '缺少图片路径' };
      if (!Array.isArray(quads) || quads.length === 0) {
        return { success: false, error: 'quads 不能为空' };
      }

      // 读取原图 RGB HWC 像素（.rotate() 按 EXIF 自动旋转，与浏览器显示一致）
      const { data, info } = await sharp(path)
        .rotate()
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const srcW = info.width;
      const srcH = info.height;

      const crops = [];
      for (const quad of quads) {
        try {
          if (!quad || quad.length !== 4) {
            crops.push({ success: false, error: 'quad 需要 4 个角点' });
            continue;
          }

          // 排序角点为 [左上, 右上, 右下, 左下]
          const srcQuad = orderQuadPoints(quad);

          // 计算裁剪图原尺寸（与 PaddleOCR get_rotate_crop_image 一致）
          // 宽 = max(上边长, 下边长)，高 = max(左边长, 右边长)
          const dist = (p1, p2) => Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
          const W = Math.round(Math.max(dist(srcQuad[0], srcQuad[1]), dist(srcQuad[2], srcQuad[3])));
          const H = Math.round(Math.max(dist(srcQuad[0], srcQuad[3]), dist(srcQuad[1], srcQuad[2])));
          if (W < 1 || H < 1) {
            crops.push({ success: false, error: '裁剪区域过小' });
            continue;
          }

          // 透视重采样得到裁剪图（原尺寸 W×H，RGB HWC）
          const dstQuad = [[0, 0], [W, 0], [W, H], [0, H]];
          const m = getDstToSrcMatrix(dstQuad, srcQuad);
          if (!m) {
            crops.push({ success: false, error: '透视矩阵求解失败（4 点共线）' });
            continue;
          }
          const cropped = warpPerspective(data, srcW, srcH, W, H, m);

          // RecResizeImg（对齐 PaddleOCR 训练配置）：
          //   保持宽高比 resize 到高 48，宽 > 320 时缩小到 320
          const ratio = W / H;
          let resW = Math.round(REC_IMAGE_H * ratio);
          if (resW > REC_IMAGE_W) resW = REC_IMAGE_W;
          if (resW < 1) resW = 1;

          // 用 sharp 做高质量 resize（Lanczos 插值，与 cv2.INTER_LINEAR 接近但更优）
          const resizedRaw = await sharp(cropped, {
            raw: { width: W, height: H, channels: 3 },
          })
            .resize(resW, REC_IMAGE_H, { fit: 'fill', kernel: 'lanczos3' })
            .raw()
            .toBuffer();

          // pad 到 320 宽度（右侧补 0）
          const finalData = Buffer.alloc(REC_IMAGE_W * REC_IMAGE_H * 3);
          for (let y = 0; y < REC_IMAGE_H; y++) {
            const srcOff = y * resW * 3;
            const dstOff = y * REC_IMAGE_W * 3;
            resizedRaw.copy(finalData, dstOff, srcOff, srcOff + resW * 3);
          }

          crops.push({
            success: true,
            data: finalData, // rec 输入图像，48×320 RGB HWC，右侧 pad 0
            width: REC_IMAGE_W,
            height: REC_IMAGE_H,
            channels: 3,
          });
        } catch (err) {
          console.error('[sharpImage] cropTextRegions single crop failed:', err);
          crops.push({ success: false, error: String(err) });
        }
      }

      return { success: true, crops };
    } catch (error) {
      console.error('[sharpImage] cropTextRegions failed:', error);
      return { success: false, error: String(error) };
    }
  });
};
