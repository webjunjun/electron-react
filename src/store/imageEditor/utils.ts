import { EditorSnapshot, Frame, ImageSize } from './types';

/** 画框最小尺寸（world 单位），避免拖成不可见。 */
const MIN_FRAME_SIZE = 20;

/**
 * 返回图片在 world 坐标系下的四个边界。
 * 图片 anchor 0.5（居中），所以边界为 [-w/2, -h/2, w/2, h/2]。
 */
export const imageBounds = (size: ImageSize) => ({
  left: -size.width / 2,
  top: -size.height / 2,
  right: size.width / 2,
  bottom: size.height / 2,
});

/** 把一个 world 坐标点夹到图片边界内。 */
export const clampPoint = (x: number, y: number, size: ImageSize) => {
  const b = imageBounds(size);
  return {
    x: Math.min(Math.max(x, b.left), b.right),
    y: Math.min(Math.max(y, b.top), b.bottom),
  };
};

/** 判断 world 坐标点是否严格在图片边界内（含边界）。 */
export const isInBounds = (x: number, y: number, size: ImageSize) => {
  const b = imageBounds(size);
  return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
};

/**
 * 把一个矩形夹到图片边界内（矩形不能超出图片范围）。
 * 坐标语义同 Frame：x/y 为左上角，width/height 为正数。
 */
export const clampRect = (
  rect: { x: number; y: number; width: number; height: number },
  size: ImageSize
) => {
  const b = imageBounds(size);
  // 尺寸先夹到图片能容纳的最大范围
  const width = Math.min(rect.width, size.width);
  const height = Math.min(rect.height, size.height);
  const x = Math.min(Math.max(rect.x, b.left), b.right - width);
  const y = Math.min(Math.max(rect.y, b.top), b.bottom - height);
  return { x, y, width, height };
};

/**
 * 把画框约束在图片边界内（图片 anchor 0.5，边界为 [-w/2, -h/2, w, h]），
 * 并保证宽高不小于 MIN_FRAME_SIZE。
 */
export const clampFrame = (frame: Frame, size: ImageSize): Frame => {
  const width = Math.min(Math.max(frame.width, MIN_FRAME_SIZE), size.width);
  const height = Math.min(Math.max(frame.height, MIN_FRAME_SIZE), size.height);
  return clampRect({ ...frame, width, height }, size) as Frame;
};

/** 由图片尺寸生成默认全图画框。 */
export const fullFrame = (size: ImageSize): Frame => ({
  x: -size.width / 2,
  y: -size.height / 2,
  width: size.width,
  height: size.height,
});

/** 从当前 state 抽取一份快照（深拷贝，避免与后续 set 共享引用）。 */
export const takeSnapshot = (s: {
  annotations: EditorSnapshot['annotations'];
  adjustments: EditorSnapshot['adjustments'];
  filterId: EditorSnapshot['filterId'];
  mosaics: EditorSnapshot['mosaics'];
  frame: EditorSnapshot['frame'];
  cropRatio: EditorSnapshot['cropRatio'];
}): EditorSnapshot => ({
  annotations: s.annotations.map((a) => ({ ...a })),
  adjustments: { ...s.adjustments },
  filterId: s.filterId,
  mosaics: s.mosaics.map((m) => ({ ...m })),
  frame: s.frame ? { ...s.frame } : null,
  cropRatio: s.cropRatio,
});
