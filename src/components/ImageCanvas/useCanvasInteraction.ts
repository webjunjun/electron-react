import { RefObject, useEffect } from 'react';
import { Application, Container, Sprite } from 'pixi.js';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { getCanvasPoint, screenToWorld } from './coords';

const MIN_SCALE = 0.05;
const MAX_SCALE = 40;
const ZOOM_STEP = 1.1;

interface Options {
  /** Pixi 应用实例的 ref。 */
  appRef: RefObject<Application | null>;
  /** 承载图片的世界容器 ref（缩放/平移都作用在它上面）。 */
  worldRef: RefObject<Container | null>;
  /** 当前图片精灵 ref，用于判断是否有内容可交互。 */
  spriteRef: RefObject<Sprite | null>;
  /** 当前激活的工具，仅在 move 工具下允许拖拽平移。 */
  activeTool: string;
  /** Pixi 应用是否初始化完成，用于触发事件重新绑定。 */
  ready: boolean;
}

// 限制缩放比例在 MIN_SCALE 和 MAX_SCALE 之间
// css里有 clamp 函数，未来估计会成为js的原生方法
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * 实现画布的缩放（以光标为锚点）与拖拽平移逻辑。
 */
const useCanvasInteraction = ({ appRef, worldRef, spriteRef, activeTool, ready }: Options) => {
  const setZoom = useImageEditorStore((s) => s.setZoom);

  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world) return;

    const canvas = app.canvas;

    // 滚轮缩放：保持光标指向的图片位置不动
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!spriteRef.current) return;

      const { x: mouseX, y: mouseY } = getCanvasPoint(canvas, e);

      // 缩放前，光标位置在 world 局部坐标系中的点
      const { x: localX, y: localY } = screenToWorld(world, mouseX, mouseY);

      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newScale = clamp(world.scale.x * factor, MIN_SCALE, MAX_SCALE);

      world.scale.set(newScale);
      // 反推 position，使光标锚点保持不动
      world.position.set(mouseX - localX * newScale, mouseY - localY * newScale);

      setZoom(newScale);
    };

    // 拖拽平移
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startPosX = 0;
    let startPosY = 0;

    const canPan = () => activeTool === 'move' && !!spriteRef.current;

    const handlePointerDown = (e: PointerEvent) => {
      if (!canPan()) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPosX = world.position.x;
      startPosY = world.position.y;
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      world.position.set(
        startPosX + (e.clientX - startX),
        startPosY + (e.clientY - startY)
      );
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = canPan() ? 'grab' : 'default';
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };

    // 初始光标反馈
    canvas.style.cursor = canPan() ? 'grab' : 'default';

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerUp);
    };
    // ready 变化时重新绑定，确保 app 初始化完成后事件生效
  }, [appRef, worldRef, spriteRef, activeTool, ready, setZoom]);
};

export default useCanvasInteraction;
