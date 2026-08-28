import { StateCreator } from 'zustand';
import { Annotation, AnnotationSlice, ImageEditorState } from './types';

/** 标注对象（文字 / 笔迹）的增删改与选中 slice。 */
export const createAnnotationSlice: StateCreator<
  ImageEditorState,
  [],
  [],
  AnnotationSlice
> = (set) => ({
  annotations: [],
  selectedId: null,

  addAnnotation: (ann) =>
    set((s) => ({ annotations: [...s.annotations, ann], selectedId: ann.id })),

  updateAnnotation: (id, patch) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a
      ),
    })),

  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  selectAnnotation: (id) => set({ selectedId: id }),
});
