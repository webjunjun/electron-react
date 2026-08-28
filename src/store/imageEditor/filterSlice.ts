import { StateCreator } from 'zustand';
import { FilterSlice, ImageEditorState } from './types';

/** 滤镜预设选中 slice。 */
export const createFilterSlice: StateCreator<
  ImageEditorState,
  [],
  [],
  FilterSlice
> = (set) => ({
  filterId: null,

  setFilter: (id) => set({ filterId: id }),
});
