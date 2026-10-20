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
  BrushAnnotation,
  BrushPoint,
} from '../../store/imageEditorStore';
import { clampPoint } from '../../store/imageEditor/utils';
import { screenToWorld } from './coords';

export interface DefaultBrushStyle {
  size: number;
  color: string;
}

interface Options {
  appRef: RefObject<Application | null>;
  worldRef: RefObject<Container | null>;
  /** 标注层容器：笔迹挂在此层（位于底图/马赛克之上）。 */
  annotationLayerRef: RefObject<Container | null>;
  spriteRef: RefObject<Sprite | null>;
  activeTool: string;
  ready: boolean;
  /** 新建笔迹时使用的默认样式。 */
  defaultStyle: DefaultBrushStyle;
}

/** 按锚点与相对路径点绘制一条笔迹到 Graphics。 */
const drawStroke = (
  g: Graphics,
  points: BrushPoint[],
  size: number,
  color: string
) => {
  g.clear();
  if (points.length === 0) return;
  g.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    // 单点：画一个圆点
    g.circle(points[0].x, points[0].y, size / 2).fill(color);
    return;
  }
  for (let i = 1; i < points.length; i++) {
    g.lineTo(points[i].x, points[i].y);
  }
  g.stroke({ width: size, color, cap: 'round', join: 'round' });
};

/**
 * 画笔标注的渲染与交互：
 * - brush 工具下在画布按下并拖动即可绘制自由笔迹；
 * - 松开后把笔迹提交到 store；
 * - 根据 store 的 annotations 同步 PIXI.Graphics 对象。
 */
const useBrushTool = ({
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
  const strokeMapRef = useRef<Map<string, Graphics>>(new Map());
  // 正在绘制的笔迹（相对 anchor 的路径点）
  const drawingRef = useRef<{
    graphics: Graphics;
    anchor: BrushPoint;
    points: BrushPoint[];
  } | null>(null);

  const isBrushTool = activeTool === 'brush';

  // 事件绑定：按下-移动-松开完成一条笔迹
  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || !ready) return;

    const stage = app.stage;
    stage.eventMode = 'static';
    stage.hitArea = app.screen;

    const handleDown = (e: FederatedPointerEvent) => {
      if (!isBrushTool || !spriteRef.current) return;
      const imageSize = useImageEditorStore.getState().imageSize;
      if (!imageSize) return;
      const layer = annotationLayerRef.current;
      if (!layer) return;
      // 起点限制在图片边界内
      const raw = screenToWorld(world, e.global.x, e.global.y);
      const anchor = clampPoint(raw.x, raw.y, imageSize);
      const g = new Graphics();
      g.position.set(anchor.x, anchor.y);
      layer.addChild(g);
      drawingRef.current = { graphics: g, anchor, points: [{ x: 0, y: 0 }] };
    };

    const handleMove = (e: FederatedPointerEvent) => {
      const drawing = drawingRef.current;
      if (!drawing) return;
      const imageSize = useImageEditorStore.getState().imageSize;
      if (!imageSize) return;
      // 每个轨迹点限制在图片边界内
      const raw = screenToWorld(world, e.global.x, e.global.y);
      const p = clampPoint(raw.x, raw.y, imageSize);
      drawing.points.push({
        x: p.x - drawing.anchor.x,
        y: p.y - drawing.anchor.y,
      });
      drawStroke(
        drawing.graphics,
        drawing.points,
        defaultStyle.size,
        defaultStyle.color
      );
    };

    const handleUp = () => {
      const drawing = drawingRef.current;
      if (!drawing) return;
      drawingRef.current = null;
      // 移除临时图形，交给 store 同步重建
      drawing.graphics.parent?.removeChild(drawing.graphics);
      drawing.graphics.destroy();
      pushHistory(); // 新增笔迹前记录历史
      // 少于 2 个点视为无效笔迹（点一下也保留为圆点）
      addAnnotation({
        id: crypto.randomUUID(),
        type: 'brush',
        x: drawing.anchor.x,
        y: drawing.anchor.y,
        points: drawing.points,
        size: defaultStyle.size,
        color: defaultStyle.color,
      });
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
  }, [ready, isBrushTool, defaultStyle.size, defaultStyle.color]);

  // 同步：根据 annotations 增量更新 PIXI.Graphics
  useEffect(() => {
    const layer = annotationLayerRef.current;
    if (!layer || !ready) return;

    const map = strokeMapRef.current;
    const seen = new Set<string>();

    for (const ann of annotations) {
      if (ann.type !== 'brush') continue;
      seen.add(ann.id);
      let g = map.get(ann.id);
      if (!g) {
        g = new Graphics();
        layer.addChild(g);
        map.set(ann.id, g);
      }
      g.position.set(ann.x, ann.y);
      drawStroke(g, ann.points, ann.size, ann.color);
    }

    // 删除已不存在的笔迹
    for (const [id, g] of map) {
      if (!seen.has(id)) {
        g.parent?.removeChild(g);
        g.destroy();
        map.delete(id);
      }
    }
  }, [annotations, ready]);

  // 图片切换/卸载时清理笔迹对象
  useEffect(() => {
    return () => {
      const map = strokeMapRef.current;
      for (const g of map.values()) g.destroy();
      map.clear();
    };
  }, []);
};

export default useBrushTool;
