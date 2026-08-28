import { StateCreator } from 'zustand';
import { HISTORY_LIMIT, HistorySlice, ImageEditorState } from './types';
import { takeSnapshot } from './utils';

/**
 * 撤销/重做 slice。
 *
 * EditorSnapshot 统筹 annotations/adjustments/filterId/mosaics/frame/cropRatio
 * 六个字段，因此历史栈必须放在跨域可达的位置——slice 模式下 set/get
 * 拿到完整 ImageEditorState，可同时回滚多域状态。
 */
export const createHistorySlice: StateCreator<
  ImageEditorState,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  past: [],
  future: [],

  pushHistory: () =>
    set((s) => {
      // 记录“操作前”的当前状态；一旦产生新历史，重做栈失效
      const snap = takeSnapshot(s);
      const past = [...s.past, snap];
      // 超出上限丢弃最旧的
      if (past.length > HISTORY_LIMIT) past.shift();
      return { past, future: [] };
    }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {};
      const past = [...s.past];
      const prev = past.pop()!;
      // 把当前状态推入 future，供重做
      const current = takeSnapshot(s);
      return {
        past,
        future: [...s.future, current],
        annotations: prev.annotations,
        adjustments: prev.adjustments,
        filterId: prev.filterId,
        mosaics: prev.mosaics,
        frame: prev.frame,
        cropRatio: prev.cropRatio,
        selectedId: null,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      const future = [...s.future];
      const next = future.pop()!;
      const current = takeSnapshot(s);
      return {
        past: [...s.past, current],
        future,
        annotations: next.annotations,
        adjustments: next.adjustments,
        filterId: next.filterId,
        mosaics: next.mosaics,
        frame: next.frame,
        cropRatio: next.cropRatio,
        selectedId: null,
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
});
