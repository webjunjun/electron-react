import { RefObject, useEffect } from 'react';
import { ColorMatrixFilter, Sprite } from 'pixi.js';
import { useImageEditorStore } from '../../store/imageEditorStore';

interface Options {
  spriteRef: RefObject<Sprite | null>;
  ready: boolean;
  /** 当前图片源，用于在图片切换（sprite 重建）后重新应用滤镜。 */
  imageSrc: string | null;
}

/**
 * 图片调色：把 store 的 adjustments 通过 ColorMatrixFilter 作用到图片 sprite。
 * 仅影响图片本身，不影响文字/画笔等标注（它们不在 sprite 上）。
 */
const useAdjustments = ({ spriteRef, ready, imageSrc }: Options) => {
  const adjustments = useImageEditorStore((s) => s.adjustments);

  useEffect(() => {
    const sprite = spriteRef.current;
    if (!ready || !sprite) return;

    // 复用已挂载的 ColorMatrixFilter，没有则新建
    let filter = sprite.filters
      ? (Array.isArray(sprite.filters) ? sprite.filters : [sprite.filters]).find(
          (f): f is ColorMatrixFilter => f instanceof ColorMatrixFilter
        )
      : undefined;
    if (!filter) {
      filter = new ColorMatrixFilter();
      sprite.filters = [filter];
    }

    const { brightness, contrast, saturation } = adjustments;
    // 每次先重置矩阵，再依次叠加，避免多次调用累积
    filter.reset();
    // brightness: 1 = 原样，范围映射到 0.5 ~ 1.5
    filter.brightness(1 + brightness / 200, true);
    // contrast/saturate: 0 = 原样，范围映射到 -0.5 ~ 0.5
    filter.contrast(contrast / 200, true);
    filter.saturate(saturation / 200, true);
  }, [adjustments, ready, imageSrc, spriteRef]);
};

export default useAdjustments;
