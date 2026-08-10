import { create } from 'zustand';

export interface ImageSize {
  width: number;
  height: number;
}

/** 标注类型，后续可扩展 'rect' 等。 */
export type AnnotationType = 'text' | 'brush';

interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  /** world 局部坐标。 */
  x: number;
  y: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  content: string;
  /** 字号，以 world 单位计（随缩放放大）。 */
  fontSize: number;
  color: string;
  fontFamily?: string;
}

/** world 局部坐标点。 */
export interface BrushPoint {
  x: number;
  y: number;
}

export interface BrushAnnotation extends BaseAnnotation {
  type: 'brush';
  /** 笔迹路径点（相对 x/y 的偏移，world 单位）。 */
  points: BrushPoint[];
  /** 线宽，以 world 单位计（随缩放放大）。 */
  size: number;
  color: string;
}

/** 所有标注对象的联合类型。 */
export type Annotation = TextAnnotation | BrushAnnotation;

/** 马赛克/模糊区域的效果类型。 */
export type MosaicMode = 'mosaic' | 'blur';

/** 一块马赛克/模糊区域，坐标与尺寸均为 world 局部单位。 */
export interface MosaicRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: MosaicMode;
  /** 马赛克格子大小 / 模糊强度（world 单位）。 */
  strength: number;
}

/** 调色参数，取值范围 -100 ~ 100，0 表示无调整。 */
export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

/** 调色参数的初始（无调整）值。 */
export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

/** 输出画框（裁剪框），world 局部坐标，与 sprite/mosaic 同坐标系。 */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 画框最小尺寸（world 单位），避免拖成不可见。 */
const MIN_FRAME_SIZE = 20;

/**
 * 把画框约束在图片边界内（图片 anchor 0.5，边界为 [-w/2, -h/2, w, h]），
 * 并保证宽高不小于 MIN_FRAME_SIZE。
 */
const clampFrame = (frame: Frame, size: ImageSize): Frame => {
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
const fullFrame = (size: ImageSize): Frame => ({
  x: -size.width / 2,
  y: -size.height / 2,
  width: size.width,
  height: size.height,
});

/** 纳入历史记录的可编辑状态快照。 */
export interface EditorSnapshot {
  annotations: Annotation[];
  adjustments: Adjustments;
  filterId: string | null;
  mosaics: MosaicRegion[];
  frame: Frame | null;
  cropRatio: number | null;
}

/** 历史栈上限，超出丢弃最旧的。 */
const HISTORY_LIMIT = 50;

/** 从当前 state 抽取一份快照（深拷贝，避免与后续 set 共享引用）。 */
const takeSnapshot = (s: {
  annotations: Annotation[];
  adjustments: Adjustments;
  filterId: string | null;
  mosaics: MosaicRegion[];
  frame: Frame | null;
  cropRatio: number | null;
}): EditorSnapshot => ({
  annotations: s.annotations.map((a) => ({ ...a })),
  adjustments: { ...s.adjustments },
  filterId: s.filterId,
  mosaics: s.mosaics.map((m) => ({ ...m })),
  frame: s.frame ? { ...s.frame } : null,
  cropRatio: s.cropRatio,
});

interface ImageEditorState {
  /** 当前加载的图片在磁盘上的路径。 */
  diskImageSrc: string | null;
  /** 当前加载的图片在内存中的路径 blob 格式，方便后续操作。 */
  imageSrc: string | null;
  /** 加载的图片的原始像素尺寸。 */
  imageSize: ImageSize | null;
  /** 当前 world 缩放比例（1 = 100%）。 */
  zoom: number;

  /** 所有标注对象。 */
  annotations: Annotation[];
  /** 当前选中的标注 id。 */
  selectedId: string | null;

  /** 图片调色参数（作用于图片本身，不影响标注）。 */
  adjustments: Adjustments;

  /** 当前选中的滤镜预设 id（null = 无滤镜）。 */
  filterId: string | null;

  /** 所有马赛克/模糊区域。 */
  mosaics: MosaicRegion[];

  /** 输出画框（裁剪框），null = 未初始化（无图片）。 */
  frame: Frame | null;
  /** 当前锁定的裁剪比例（宽/高），null = 自由。 */
  cropRatio: number | null;

  /** 历史记录：已发生的快照栈（不含当前状态）。 */
  past: EditorSnapshot[];
  /** 历史记录：被撤销的快照栈（可重做）。 */
  future: EditorSnapshot[];

  /** 加载新的图片，撤销之前的 ObjectURL 来避免内存泄漏。 */
  setImage: (diskSrc: string, blobUrl: string, size: ImageSize) => void;
  /** 更新显示的缩放比例（由画布调用）。 */
  setZoom: (zoom: number) => void;
  /** 清除当前图片并撤销其 ObjectURL。 */
  reset: () => void;

  /** 新增一个标注对象。 */
  addAnnotation: (ann: Annotation) => void;
  /** 局部更新指定标注对象（移动、改字号/颜色/内容都走它）。 */
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  /** 删除指定标注对象。 */
  removeAnnotation: (id: string) => void;
  /** 设置当前选中的标注（传 null 取消选中）。 */
  selectAnnotation: (id: string | null) => void;

  /** 局部更新调色参数。 */
  setAdjustment: (patch: Partial<Adjustments>) => void;
  /** 调色参数归零。 */
  resetAdjustments: () => void;

  /** 设置当前滤镜预设（传 null 取消滤镜）。 */
  setFilter: (id: string | null) => void;

  /** 新增一块马赛克/模糊区域。 */
  addMosaic: (region: MosaicRegion) => void;
  /** 清除全部马赛克/模糊区域。 */
  clearMosaics: () => void;

  /** 设置输出画框（自动约束在图片边界内）。 */
  setFrame: (frame: Frame) => void;
  /** 重置画框为全图。 */
  resetFrame: () => void;
  /** 设置裁剪比例（宽/高，null = 自由）；非 null 时把当前画框调整到该比例。 */
  setCropRatio: (ratio: number | null) => void;

  /** 把当前状态压入历史（在“完成一步操作”后调用）。 */
  pushHistory: () => void;
  /** 撤销：回到上一个快照。 */
  undo: () => void;
  /** 重做：恢复被撤销的快照。 */
  redo: () => void;
  /** 是否可撤销/重做（供按钮禁用态使用）。 */
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useImageEditorStore = create<ImageEditorState>((set, get) => ({
  diskImageSrc: null, // 图片在磁盘上的路径
  imageSrc: null, // 图片在内存中的路径 blob 格式，方便后续操作
  imageSize: null, // 图片的原始像素尺寸
  zoom: 1,
  annotations: [], // 所有标注对象
  selectedId: null, // 当前选中的标注 id
  adjustments: { ...DEFAULT_ADJUSTMENTS }, // 图片调色参数
  filterId: null, // 当前滤镜预设 id
  mosaics: [], // 所有马赛克/模糊区域
  frame: null, // 输出画框
  cropRatio: null, // 裁剪比例锁定
  past: [], // 历史快照栈
  future: [], // 重做快照栈

  setImage: (diskSrc, blobUrl, size) => {
    const prev = get().imageSrc;
    if (prev) {
      // 先撤销之前的ObjectURL，避免内存泄漏
      URL.revokeObjectURL(prev);
    }
    // 切换图片时清空标注与调色，并重置历史（新图是全新的基线）
    set({
      diskImageSrc: diskSrc,
      imageSize: size,
      imageSrc: blobUrl,
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
    const prev = get().imageSrc;
    if (prev) {
      // 先撤销之前的ObjectURL，避免内存泄漏
      URL.revokeObjectURL(prev);
    }
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

  setAdjustment: (patch) =>
    set((s) => ({ adjustments: { ...s.adjustments, ...patch } })),

  resetAdjustments: () => set({ adjustments: { ...DEFAULT_ADJUSTMENTS } }),

  setFilter: (id) => set({ filterId: id }),

  addMosaic: (region) => set((s) => ({ mosaics: [...s.mosaics, region] })),

  clearMosaics: () => set({ mosaics: [] }),

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
}));
