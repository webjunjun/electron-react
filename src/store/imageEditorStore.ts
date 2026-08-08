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

  setImage: (diskSrc, blobUrl, size) => {
    const prev = get().imageSrc;
    if (prev) {
      // 先撤销之前的ObjectURL，避免内存泄漏
      URL.revokeObjectURL(prev);
    }
    // 切换图片时清空标注与调色
    set({
      diskImageSrc: diskSrc,
      imageSize: size,
      imageSrc: blobUrl,
      annotations: [],
      selectedId: null,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      filterId: null,
      mosaics: [],
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
}));
