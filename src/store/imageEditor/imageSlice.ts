import { StateCreator } from 'zustand';
import { DEFAULT_ADJUSTMENTS, ImageEditorState, ImageSlice } from './types';
import { fullFrame } from './utils';

/** 图片加载与视图缩放 slice。 */
export const createImageSlice: StateCreator<
  ImageEditorState,
  [],
  [],
  ImageSlice
> = (set) => ({
  diskImageSrc: null,
  imageSrc: null,
  imageSize: null,
  zoom: 1,

  setImage: (diskSrc, resourceUrl, size) => {
    // 切换图片时清空标注与调色，并重置历史（新图是全新的基线）
    set({
      diskImageSrc: diskSrc,
      imageSize: size,
      imageSrc: resourceUrl,
      annotations: [],
      selectedId: null,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      filterId: null,
      mosaics: [],
      frame: fullFrame(size), // 默认全图
      cropRatio: null,
      past: [],
      future: [],
    });
  },

  setZoom: (zoom) => set({ zoom }),

  reset: () => {
    set({
      diskImageSrc: null,
      imageSrc: null,
      imageSize: null,
      zoom: 1,
      annotations: [],
      selectedId: null,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      filterId: null,
      mosaics: [],
      frame: null,
      cropRatio: null,
      past: [],
      future: [],
    });
  },
});
