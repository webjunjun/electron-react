import { ColorMatrixFilter } from 'pixi.js';

/** 滤镜预设定义。 */
export interface FilterPreset {
  id: string;
  name: string;
  /** 面板缩览图预览用的 CSS filter；'none' 表示原图。 */
  preview: string;
  /** 把预设效果应用到给定的 ColorMatrixFilter（id 为 none 时不调用）。 */
  apply?: (f: ColorMatrixFilter) => void;
}

/** 第一期滤镜预设（一键套用，单选）。 */
export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', name: '原图', preview: 'none' },
  {
    id: 'grayscale',
    name: '黑白',
    preview: 'grayscale(1)',
    apply: (f) => f.grayscale(0.4, true),
  },
  {
    id: 'sepia',
    name: '复古',
    preview: 'sepia(0.8)',
    apply: (f) => f.sepia(true),
  },
  {
    id: 'cool',
    name: '冷色',
    preview: 'hue-rotate(180deg) saturate(1.2)',
    apply: (f) => {
      f.hue(180, true);
      f.saturate(0.2, true);
    },
  },
  {
    id: 'warm',
    name: '暖色',
    preview: 'sepia(0.4) saturate(1.6) hue-rotate(-15deg)',
    apply: (f) => {
      f.sepia(true);
      f.saturate(0.4, true);
    },
  },
  {
    id: 'contrast',
    name: '高对比',
    preview: 'contrast(1.5)',
    apply: (f) => f.contrast(0.5, true),
  },
];

/** 按 id 查预设。 */
export const getFilterPreset = (id: string | null): FilterPreset | undefined =>
  id ? FILTER_PRESETS.find((p) => p.id === id) : undefined;
