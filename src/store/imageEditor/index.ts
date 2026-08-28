import { create } from 'zustand';
import { ImageEditorState } from './types';
import { createImageSlice } from './imageSlice';
import { createAnnotationSlice } from './annotationSlice';
import { createAdjustmentSlice } from './adjustmentSlice';
import { createFilterSlice } from './filterSlice';
import { createMosaicSlice } from './mosaicSlice';
import { createCropSlice } from './cropSlice';
import { createHistorySlice } from './historySlice';

// 重新导出所有类型与常量，调用方可直接从本文件 import
export * from './types';

/**
 * 图片编辑器单 store：所有 slice 在运行时合并为一个状态对象，
 * 保证历史栈（undo/redo）能跨域统筹 annotations/adjustments/filterId/
 * mosaics/frame/cropRatio 字段。
 */
export const useImageEditorStore = create<ImageEditorState>()((...a) => ({
  ...createImageSlice(...a),
  ...createAnnotationSlice(...a),
  ...createAdjustmentSlice(...a),
  ...createFilterSlice(...a),
  ...createMosaicSlice(...a),
  ...createCropSlice(...a),
  ...createHistorySlice(...a),
}));
