import { StateCreator } from 'zustand';
import { ImageEditorState, MosaicSlice } from './types';

/** 马赛克/模糊区域 slice。 */
export const createMosaicSlice: StateCreator<
  ImageEditorState,
  [],
  [],
  MosaicSlice
> = (set) => ({
  mosaics: [],

  addMosaic: (region) => set((s) => ({ mosaics: [...s.mosaics, region] })),

  clearMosaics: () => set({ mosaics: [] }),
});
