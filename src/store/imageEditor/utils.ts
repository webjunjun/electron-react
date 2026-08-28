import { EditorSnapshot, Frame, ImageSize } from './types';

/** 画框最小尺寸（world 单位），避免拖成不可见。 */
const MIN_FRAME_SIZE = 20;

/**
 * 把画框约束在图片边界内（图片 anchor 0.5，边界为 [-w/2, -h/2, w, h]），
 * 并保证宽高不小于 MIN_FRAME_SIZE。
 */
export const clampFrame = (frame: Frame, size: ImageSize): Frame => {
  const left = -size.width / 2;
  const top = -size.height / 2;
  const right = size.width / 2;
  const bottom = size.height / 2;
  // 尺寸先夹到 [MIN, 图片尺寸]
  const width = Math.min(Math.max(frame.width, MIN_FRAME_SIZE), size.width);
  const height = Math.min(Math.max(frame.height, MIN_FRAME_SIZE), size.height);
  // 位置夹到边界内
  const x = Math.min(Math.max(frame.x, left), right - width);
  const y = Math.min(Math.max(frame.y, top), bottom - height);
  return { x, y, width, height };
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
