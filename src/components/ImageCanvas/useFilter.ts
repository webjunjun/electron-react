import { RefObject, useEffect } from 'react';
import { ColorMatrixFilter, Sprite } from 'pixi.js';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { getFilterPreset } from './filterPresets';

type RoledFilter = ColorMatrixFilter & { __role?: string };

interface Options {
  spriteRef: RefObject<Sprite | null>;
  ready: boolean;
  /** 当前图片源，用于在图片切换（sprite 重建）后重新应用滤镜。 */
  imageSrc: string | null;
}

/**
 * 滤镜预设：把 store 的 filterId 通过独立的 ColorMatrixFilter 作用到图片 sprite。
 * 与调色（useAdjustments）各用一个 filter、互不覆盖，通过 __role 标记区分。
 */
const useFilter = ({ spriteRef, ready, imageSrc }: Options) => {
  const filterId = useImageEditorStore((s) => s.filterId);

  useEffect(() => {
    const sprite = spriteRef.current;
    if (!ready || !sprite) return;

    const current = sprite.filters
      ? Array.isArray(sprite.filters)
        ? sprite.filters
        : [sprite.filters]
      : [];

    // 找出「滤镜」角色的 filter
    let filter = current.find(
      (f): f is RoledFilter =>
        f instanceof ColorMatrixFilter && (f as RoledFilter).__role === 'filter'
    );

    const preset = getFilterPreset(filterId);

    // 无滤镜（none 或未选）：如已存在滤镜 filter 则重置为透明矩阵
    if (!preset || !preset.apply) {
      if (filter) filter.reset();
      return;
    }

    if (!filter) {
      filter = new ColorMatrixFilter();
      (filter as RoledFilter).__role = 'filter';
      // 追加到末尾，作用在调色之后
      sprite.filters = [...current, filter];
    }

    filter.reset();
    preset.apply(filter);
  }, [filterId, ready, imageSrc, spriteRef]);
};

export default useFilter;
