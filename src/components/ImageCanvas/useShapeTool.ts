import { RefObject, useEffect, useRef } from 'react';
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Sprite,
} from 'pixi.js';
import {
  useImageEditorStore,
  ShapeAnnotation,
  ShapeType,
} from '../../store/imageEditorStore';
import { clampPoint, isInBounds } from '../../store/imageEditor/utils';
import { screenToWorld } from './coords';

export interface DefaultShapeStyle {
  shape: ShapeType;
  size: number;
  color: string;
  fill: boolean;
}

interface Options {
  appRef: RefObject<Application | null>;
  worldRef: RefObject<Container | null>;
  /** 标注层容器：形状挂在此层（位于底图/马赛克之上）。 */
  annotationLayerRef: RefObject<Container | null>;
  spriteRef: RefObject<Sprite | null>;
  activeTool: string;
  ready: boolean;
  /** 新建形状时使用的默认样式。 */
  defaultStyle: DefaultShapeStyle;
}

/** 箭头头长度系数：与线宽挂钩，但不短于固定值，且不超过线长一半。 */
const ARROW_HEAD_BASE = 12;
const ARROW_HEAD_WIDTH_FACTOR = 3;
/** 箭头头张角（单边），约 25°。 */
const ARROW_HEAD_ANGLE = Math.PI / 7;

/**
 * 按 shape 类型把一条形状绘制到 Graphics。
 * Graphics 已 position.set(anchor.x, anchor.y)，故传入的 end 为相对偏移。
 */
const drawShape = (
  g: Graphics,
  shape: ShapeType,
  end: { x: number; y: number },
  size: number,
  color: string,
  fill: boolean
) => {
  g.clear();
  switch (shape) {
    case 'rect': {
      // end 可正可负（向左/上拖），统一归到左上角 + 正尺寸
      g.rect(
        Math.min(0, end.x),
        Math.min(0, end.y),
        Math.abs(end.x),
        Math.abs(end.y)
      );
      if (fill) g.fill(color);
      g.stroke({ width: size, color, join: 'miter' });
      break;
    }
    case 'ellipse': {
      // 中心在 end/2，半径取绝对值一半
      g.ellipse(end.x / 2, end.y / 2, Math.abs(end.x) / 2, Math.abs(end.y) / 2);
      if (fill) g.fill(color);
      g.stroke({ width: size, color });
      break;
    }
    case 'line': {
      g.moveTo(0, 0).lineTo(end.x, end.y);
      g.stroke({ width: size, color, cap: 'round' });
      break;
    }
    case 'arrow': {
      // 主线
      g.moveTo(0, 0).lineTo(end.x, end.y);
      const len = Math.hypot(end.x, end.y);
      if (len > 0) {
        const headLen = Math.min(len * 0.5, size * ARROW_HEAD_WIDTH_FACTOR + ARROW_HEAD_BASE);
        const angle = Math.atan2(end.y, end.x);
        // 终点反向 ±ARROW_HEAD_ANGLE 两条斜线，构成 V 形开口朝向起点
        const a1 = angle + Math.PI - ARROW_HEAD_ANGLE;
        const a2 = angle + Math.PI + ARROW_HEAD_ANGLE;
        g.moveTo(end.x, end.y)
          .lineTo(end.x + headLen * Math.cos(a1), end.y + headLen * Math.sin(a1));
        g.moveTo(end.x, end.y)
          .lineTo(end.x + headLen * Math.cos(a2), end.y + headLen * Math.sin(a2));
      }
      g.stroke({ width: size, color, cap: 'round', join: 'round' });
      break;
    }
  }
};

/** 拖拽距离阈值：小于此值视为无效形状（点一下不创建）。 */
const MIN_DRAG = 2;

/**
 * 形状标注的渲染与交互：
 * - shape 工具下在画布按下并拖动绘制几何形状；
 * - 按住 Shift 锁定矩形/椭圆为等比（正方形/圆）；
 * - 松开后把形状提交到 store；
 * - 根据 store 的 annotations 同步 PIXI.Graphics 对象。
 */
const useShapeTool = ({
  appRef,
  worldRef,
  annotationLayerRef,
  spriteRef,
  activeTool,
  ready,
  defaultStyle,
}: Options) => {
  const annotations = useImageEditorStore((s) => s.annotations);
  const addAnnotation = useImageEditorStore((s) => s.addAnnotation);
  const pushHistory = useImageEditorStore((s) => s.pushHistory);

  // id -> PIXI.Graphics 映射，用于增量同步
  const shapeMapRef = useRef<Map<string, Graphics>>(new Map());
  // 正在绘制的形状（相对 anchor 的终点偏移）
  const drawingRef = useRef<{
    graphics: Graphics;
    anchor: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);

  const isShapeTool = activeTool === 'shape';

  // 事件绑定：按下-移动-松开完成一个形状
  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || !ready) return;

    const stage = app.stage;
    stage.eventMode = 'static';
    stage.hitArea = app.screen;

    const handleDown = (e: FederatedPointerEvent) => {
      if (!isShapeTool || !spriteRef.current) return;
      const imageSize = useImageEditorStore.getState().imageSize;
      if (!imageSize) return;
      const layer = annotationLayerRef.current;
      if (!layer) return;
      // 起点必须在图片边界内，否则不创建形状
      const raw = screenToWorld(world, e.global.x, e.global.y);
      if (!isInBounds(raw.x, raw.y, imageSize)) return;
      const g = new Graphics();
      g.position.set(raw.x, raw.y);
      layer.addChild(g);
      drawingRef.current = { graphics: g, anchor: raw, end: { x: 0, y: 0 } };
    };

    const handleMove = (e: FederatedPointerEvent) => {
      const drawing = drawingRef.current;
      if (!drawing) return;
      const imageSize = useImageEditorStore.getState().imageSize;
      if (!imageSize) return;
      // 拖动终点限制在图片边界内
      const raw = screenToWorld(world, e.global.x, e.global.y);
      const p = clampPoint(raw.x, raw.y, imageSize);
      let dx = p.x - drawing.anchor.x;
      let dy = p.y - drawing.anchor.y;
      // Shift 锁等比（仅矩形/椭圆）：以较大绝对值为基准，正负号保留方向
      if (
        e.shiftKey &&
        (defaultStyle.shape === 'rect' || defaultStyle.shape === 'ellipse')
      ) {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        dx = (dx >= 0 ? 1 : -1) * m;
        dy = (dy >= 0 ? 1 : -1) * m;
      }
      drawing.end = { x: dx, y: dy };
      drawShape(
        drawing.graphics,
        defaultStyle.shape,
        drawing.end,
        defaultStyle.size,
        defaultStyle.color,
        defaultStyle.fill
      );
    };

    const handleUp = () => {
      const drawing = drawingRef.current;
      if (!drawing) return;
      drawingRef.current = null;
      const end = drawing.end;
      // 拖拽距离过短视为无效形状
      if (Math.hypot(end.x, end.y) < MIN_DRAG) {
        drawing.graphics.parent?.removeChild(drawing.graphics);
        drawing.graphics.destroy();
        return;
      }
      // 移除临时图形，交给 store 同步重建
      drawing.graphics.parent?.removeChild(drawing.graphics);
      drawing.graphics.destroy();
      pushHistory(); // 新增形状前记录历史
      const ann: ShapeAnnotation = {
        id: crypto.randomUUID(),
        type: 'shape',
        shape: defaultStyle.shape,
        x: drawing.anchor.x,
        y: drawing.anchor.y,
        end,
        size: defaultStyle.size,
        color: defaultStyle.color,
        fill: defaultStyle.fill,
      };
      addAnnotation(ann);
    };

    stage.on('pointerdown', handleDown);
    stage.on('globalpointermove', handleMove);
    stage.on('pointerup', handleUp);
    stage.on('pointerupoutside', handleUp);

    return () => {
      stage.off('pointerdown', handleDown);
      stage.off('globalpointermove', handleMove);
      stage.off('pointerup', handleUp);
      stage.off('pointerupoutside', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isShapeTool, defaultStyle]);

  // 同步：根据 annotations 增量更新 PIXI.Graphics
  useEffect(() => {
    const layer = annotationLayerRef.current;
    if (!layer || !ready) return;

    const map = shapeMapRef.current;
    const seen = new Set<string>();

    for (const ann of annotations) {
      if (ann.type !== 'shape') continue;
      seen.add(ann.id);
      let g = map.get(ann.id);
      if (!g) {
        g = new Graphics();
        layer.addChild(g);
        map.set(ann.id, g);
      }
      g.position.set(ann.x, ann.y);
      drawShape(g, ann.shape, ann.end, ann.size, ann.color, ann.fill);
    }

    // 删除已不存在的形状
    for (const [id, g] of map) {
      if (!seen.has(id)) {
        g.parent?.removeChild(g);
        g.destroy();
        map.delete(id);
      }
    }
  }, [annotations, ready]);

  // 图片切换/卸载时清理形状对象
  useEffect(() => {
    return () => {
      const map = shapeMapRef.current;
      for (const g of map.values()) g.destroy();
      map.clear();
    };
  }, []);
};

export default useShapeTool;
