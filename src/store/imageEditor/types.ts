// ── 数据类型 ────────────────────────────────────────────────

export interface ImageSize {
  width: number;
  height: number;
}

/** 标注类型，后续可扩展 'rect' 等。 */
export type AnnotationType = 'text' | 'brush' | 'shape';

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

/** 形状子工具类型。 */
export type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow';

export interface ShapeAnnotation extends BaseAnnotation {
  type: 'shape';
  /** 形状子类型。 */
  shape: ShapeType;
  /** 终点（相对 x/y 的偏移，world 单位）：矩形/椭圆为对角点，直线/箭头为终点。 */
  end: BrushPoint;
  /** 线宽，以 world 单位计（随缩放放大）。 */
  size: number;
  color: string;
  /** 是否填充（仅矩形/椭圆生效）。 */
  fill: boolean;
}

/** 所有标注对象的联合类型。 */
export type Annotation = TextAnnotation | BrushAnnotation | ShapeAnnotation;

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
export const HISTORY_LIMIT = 50;

// ── Slice 接口（每个 slice 对外暴露的字段集） ────────────────

export interface ImageSlice {
  /** 当前加载的图片在磁盘上的路径。 */
  diskImageSrc: string | null;
  /** 当前图片供渲染器加载的资源 URL（例如 app://local/...）。 */
  imageSrc: string | null;
  /** 加载的图片的原始像素尺寸。 */
  imageSize: ImageSize | null;
  /** 当前 world 缩放比例（1 = 100%）。 */
  zoom: number;
  /** 加载新图片，记录磁盘路径、资源 URL 与原始尺寸。 */
  setImage: (diskSrc: string, resourceUrl: string, size: ImageSize) => void;
  /** 更新显示的缩放比例（由画布调用）。 */
  setZoom: (zoom: number) => void;
  /** 清除当前图片及其编辑状态。 */
  reset: () => void;
}

export interface AnnotationSlice {
  /** 所有标注对象。 */
  annotations: Annotation[];
  /** 当前选中的标注 id。 */
  selectedId: string | null;
  /** 新增一个标注对象。 */
  addAnnotation: (ann: Annotation) => void;
  /** 局部更新指定标注对象（移动、改字号/颜色/内容都走它）。 */
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  /** 删除指定标注对象。 */
  removeAnnotation: (id: string) => void;
  /** 设置当前选中的标注（传 null 取消选中）。 */
  selectAnnotation: (id: string | null) => void;
}

export interface AdjustmentSlice {
  /** 图片调色参数（作用于图片本身，不影响标注）。 */
  adjustments: Adjustments;
  /** 局部更新调色参数。 */
  setAdjustment: (patch: Partial<Adjustments>) => void;
  /** 调色参数归零。 */
  resetAdjustments: () => void;
}

export interface FilterSlice {
  /** 当前选中的滤镜预设 id（null = 无滤镜）。 */
  filterId: string | null;
  /** 设置当前滤镜预设（传 null 取消滤镜）。 */
  setFilter: (id: string | null) => void;
}

export interface MosaicSlice {
  /** 所有马赛克/模糊区域。 */
  mosaics: MosaicRegion[];
  /** 新增一块马赛克/模糊区域。 */
  addMosaic: (region: MosaicRegion) => void;
  /** 清除全部马赛克/模糊区域。 */
  clearMosaics: () => void;
}

export interface CropSlice {
  /** 输出画框（裁剪框），null = 未初始化（无图片）。 */
  frame: Frame | null;
  /** 当前锁定的裁剪比例（宽/高），null = 自由。 */
  cropRatio: number | null;
  /** 设置输出画框（自动约束在图片边界内）。 */
  setFrame: (frame: Frame) => void;
  /** 重置画框为全图。 */
  resetFrame: () => void;
  /** 设置裁剪比例（宽/高，null = 自由）；非 null 时把当前画框调整到该比例。 */
  setCropRatio: (ratio: number | null) => void;
}

export interface HistorySlice {
  /** 历史记录：已发生的快照栈（不含当前状态）。 */
  past: EditorSnapshot[];
  /** 历史记录：被撤销的快照栈（可重做）。 */
  future: EditorSnapshot[];
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

/** 完整 store 状态：所有 slice 的交集。 */
export type ImageEditorState = ImageSlice &
  AnnotationSlice &
  AdjustmentSlice &
  FilterSlice &
  MosaicSlice &
  CropSlice &
  HistorySlice;
