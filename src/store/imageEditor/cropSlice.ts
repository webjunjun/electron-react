import { StateCreator } from 'zustand';
import { CropSlice, ImageEditorState } from './types';
import { clampFrame, fullFrame } from './utils';

/** 输出画框（裁剪框）与裁剪比例 slice。 */
export const createCropSlice: StateCreator<
  ImageEditorState,
  [],
  [],
  CropSlice
> = (set) => ({
  frame: null,
  cropRatio: null,

  setFrame: (frame) =>
    set((s) => {
      if (!s.imageSize) return {};
      return { frame: clampFrame(frame, s.imageSize) };
    }),

  resetFrame: () =>
    set((s) => {
      if (!s.imageSize) return {};
      return { frame: fullFrame(s.imageSize), cropRatio: null };
    }),

  setCropRatio: (ratio) =>
    set((s) => {
      if (ratio === null || !s.imageSize || !s.frame) return { cropRatio: ratio };
      // 以当前画框中心为锚，在图片内生成尽可能大的目标比例画框
      const size = s.imageSize;
      const cx = s.frame.x + s.frame.width / 2;
      const cy = s.frame.y + s.frame.height / 2;
      // 目标比例下，先按图片可容纳的最大尺寸求解
      let width = Math.min(s.frame.width, size.width);
      let height = width / ratio;
      if (height > size.height) {
        height = size.height;
        width = height * ratio;
      }
      const next = clampFrame(
        { x: cx - width / 2, y: cy - height / 2, width, height },
        size
      );
      return { cropRatio: ratio, frame: next };
    }),
});
