import { create } from 'zustand';

export interface ImageSize {
  width: number;
  height: number;
}

/** 标注类型，后续可扩展 'brush' | 'rect' 等。 */
export type AnnotationType = 'text';

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

/** 所有标注对象的联合类型。 */
export type Annotation = TextAnnotation;

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
}

export const useImageEditorStore = create<ImageEditorState>((set, get) => ({
  diskImageSrc: null, // 图片在磁盘上的路径
  imageSrc: null, // 图片在内存中的路径 blob 格式，方便后续操作
  imageSize: null, // 图片的原始像素尺寸
  zoom: 1,
  annotations: [], // 所有标注对象
  selectedId: null, // 当前选中的标注 id

  setImage: (diskSrc, blobUrl, size) => {
    const prev = get().imageSrc;
    if (prev) {
      // 先撤销之前的ObjectURL，避免内存泄漏
      URL.revokeObjectURL(prev);
    }
    // 切换图片时清空标注
    set({
      diskImageSrc: diskSrc,
      imageSize: size,
      imageSrc: blobUrl,
      annotations: [],
      selectedId: null,
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
}));
