import { RefObject, useEffect, useRef } from 'react';
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Sprite,
  Text,
} from 'pixi.js';
import { useImageEditorStore, TextAnnotation } from '../../store/imageEditorStore';
import { screenToWorld } from './coords';

export interface DefaultTextStyle {
  fontSize: number;
  color: string;
}

interface Options {
  appRef: RefObject<Application | null>;
  worldRef: RefObject<Container | null>;
  spriteRef: RefObject<Sprite | null>;
  activeTool: string;
  ready: boolean;
  /** 新建文字时使用的默认样式。 */
  defaultStyle: DefaultTextStyle;
}

/** 新建文字的初始内容（空文字不可见、无法选中）。 */
const NEW_TEXT_CONTENT = '默认文字';

/**
 * 文字标注的渲染与交互：
 * - text 工具下点击空白处新增文字；
 * - 点击已有文字进行选中；
 * - 拖动已选中文字改变位置；
 * - 根据 store 的 annotations 同步 PIXI.Text 对象。
 */
const useTextTool = ({
  appRef,
  worldRef,
  spriteRef,
  activeTool,
  ready,
  defaultStyle,
}: Options) => {
  const annotations = useImageEditorStore((s) => s.annotations);
  const selectedId = useImageEditorStore((s) => s.selectedId);
  const zoom = useImageEditorStore((s) => s.zoom);
  const addAnnotation = useImageEditorStore((s) => s.addAnnotation);
  const updateAnnotation = useImageEditorStore((s) => s.updateAnnotation);
  const selectAnnotation = useImageEditorStore((s) => s.selectAnnotation);

  // id -> PIXI.Text 映射，用于增量同步
  const textMapRef = useRef<Map<string, Text>>(new Map());
  // 选中高亮框
  const selectionBoxRef = useRef<Graphics | null>(null);
  // 拖动状态
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(
    null
  );

  // 当前选中的工具是否是 text 工具
  const isTextTool = activeTool === 'text';

  // 事件绑定：新增文字（点击空白）+ 拖动已有文字
  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || !ready) return;

    const stage = app.stage;
    stage.eventMode = 'static';
    stage.hitArea = app.screen;

    // 点击空白处新增文字（仅 text 工具、且点到的是舞台本身）
    const handleTap = (e: FederatedPointerEvent) => {
      if (!isTextTool || !spriteRef.current) return;
      if (e.target !== stage) return; // 点到已有文字时交给文字自身处理

      const { x, y } = screenToWorld(world, e.global.x, e.global.y);

      addAnnotation({
        id: crypto.randomUUID(),
        type: 'text',
        x,
        y,
        content: NEW_TEXT_CONTENT,
        fontSize: defaultStyle.fontSize,
        color: defaultStyle.color,
      });
    };

    // 拖动中：直接更新 Text 位置与高亮框，避免频繁写 store
    const handleDragMove = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const text = textMapRef.current.get(drag.id);
      if (!text) return;
      const { x, y } = screenToWorld(world, e.global.x, e.global.y);
      text.position.set(x - drag.offsetX, y - drag.offsetY);
      drawSelectionBox(text);
    };

    // 拖动结束：把最终位置提交到 store
    const handleDragEnd = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const text = textMapRef.current.get(drag.id);
      if (text) {
        updateAnnotation(drag.id, { x: text.position.x, y: text.position.y });
      }
      dragRef.current = null;
    };

    stage.on('pointertap', handleTap);
    stage.on('globalpointermove', handleDragMove);
    stage.on('pointerup', handleDragEnd);
    stage.on('pointerupoutside', handleDragEnd);

    return () => {
      stage.off('pointertap', handleTap);
      stage.off('globalpointermove', handleDragMove);
      stage.off('pointerup', handleDragEnd);
      stage.off('pointerupoutside', handleDragEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isTextTool, defaultStyle.fontSize, defaultStyle.color]);

  // 绘制选中高亮框（world 坐标，线宽随缩放补偿）
  const drawSelectionBox = (text: Text) => {
    const world = worldRef.current;
    const box = selectionBoxRef.current;
    if (!world || !box) return;
    const pad = 2 / world.scale.x;
    box
      .clear()
      .rect(
        text.position.x - pad,
        text.position.y - pad,
        text.width + pad * 2,
        text.height + pad * 2
      )
      .stroke({ width: 1.5 / world.scale.x, color: 0x1677ff });
    box.visible = true;
  };

  // 同步：根据 annotations / selectedId 增量更新 PIXI.Text
  useEffect(() => {
    const world = worldRef.current;
    if (!world || !ready) return;

    // 确保高亮框存在且位于最上层
    if (!selectionBoxRef.current) {
      const box = new Graphics();
      box.visible = false;
      selectionBoxRef.current = box;
    }
    const box = selectionBoxRef.current;
    world.addChild(box);

    const map = textMapRef.current;
    const seen = new Set<string>();

    for (const ann of annotations) {
      if (ann.type !== 'text') continue;
      seen.add(ann.id);
      let text = map.get(ann.id);
      if (!text) {
        // 新增文字纹理对象
        text = new Text();
        text.on('pointerdown', (e: FederatedPointerEvent) => {
          // 非文字工具时 text.eventMode 为 'none'，此处不会触发，无需再判断工具
          e.stopPropagation();
          selectAnnotation(ann.id);
          const p = screenToWorld(world, e.global.x, e.global.y);
          dragRef.current = {
            id: ann.id,
            offsetX: p.x - text!.position.x,
            offsetY: p.y - text!.position.y,
          };
        });
        world.addChild(text);
        map.set(ann.id, text);
      }
      // 更新属性
      text.text = ann.content;
      text.style = {
        fontSize: ann.fontSize,
        fill: ann.color,
        fontFamily: ann.fontFamily ?? 'sans-serif',
      };
      text.position.set(ann.x, ann.y);
      text.eventMode = isTextTool ? 'static' : 'none';
      text.cursor = 'move';
    }

    // 删除已不存在的文字
    for (const [id, text] of map) {
      if (!seen.has(id)) {
        world.removeChild(text);
        text.destroy();
        map.delete(id);
      }
    }

    // 高亮框始终置顶并跟随选中项（仅文字工具下显示）
    world.addChild(box);
    const selected = selectedId ? map.get(selectedId) : undefined;
    if (selected && isTextTool) drawSelectionBox(selected);
    else box.visible = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, selectedId, ready, isTextTool]);

  // 缩放变化时重绘选中框，保持描边视觉宽度恒定（仅文字工具下）
  useEffect(() => {
    if (!ready) return;
    const selected =
      selectedId && isTextTool ? textMapRef.current.get(selectedId) : undefined;
    if (selected) drawSelectionBox(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, ready, selectedId, isTextTool]);

  // 图片切换/卸载时清理文字对象
  useEffect(() => {
    return () => {
      const map = textMapRef.current;
      for (const text of map.values()) text.destroy();
      map.clear();
      selectionBoxRef.current = null;
    };
  }, []);
};

export default useTextTool;
