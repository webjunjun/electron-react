import { StateCreator } from 'zustand';
import {
  AdjustmentSlice,
  DEFAULT_ADJUSTMENTS,
  ImageEditorState,
} from './types';

/** 调色参数（亮度/对比度/饱和度） slice。 */
export const createAdjustmentSlice: StateCreator<
  ImageEditorState,
  [],
  [],
  AdjustmentSlice
> = (set) => ({
  adjustments: { ...DEFAULT_ADJUSTMENTS },

  setAdjustment: (patch) =>
    set((s) => ({ adjustments: { ...s.adjustments, ...patch } })),

  resetAdjustments: () => set({ adjustments: { ...DEFAULT_ADJUSTMENTS } }),
});
