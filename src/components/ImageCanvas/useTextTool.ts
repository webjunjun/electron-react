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
import { clampPoint } from '../../store/imageEditor/utils';
import { screenToWorld } from './coords';

export interface DefaultTextStyle {
  fontSize: number;
  color: string;
}

interface Options {
  appRef: RefObject<Application | null>;
  worldRef: RefObject<Container | null>;
  /** 标注层容器：文字对象与高亮框挂在此层（位于底图/马赛克之上）。 */
  annotationLayerRef: RefObject<Container | null>;
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
  annotationLayerRef,
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
  const pushHistory = useImageEditorStore((s) => s.pushHistory);

  // id -> PIXI.Text 映射，用于增量同步
  const textMapRef = useRef<Map<string, Text>>(new Map());
  // 选中高亮框
  const selectionBoxRef = useRef<Graphics | null>(null);
  // 拖动状态
  const dragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  // 刚完成了一次拖拽：阻止紧接而来的 pointertap 误触发 handleTap 新建文字
  // （clamp 把文字位置固定后，鼠标可能已偏离文字 bounds，pointerup 解析到 stage，
  //  pointertap 随即在 stage 上触发，导致重复创建）
  const justDraggedRef = useRef(false);

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
      // 刚拖完一个文字，pointertap 可能因 clamp 偏移误触发 → 跳过
      if (justDraggedRef.current) {
        justDraggedRef.current = false;
        return;
      }
      if (!isTextTool || !spriteRef.current) return;
      if (e.target !== stage) return; // 点到已有文字时交给文字自身处理
      const imageSize = useImageEditorStore.getState().imageSize;
      if (!imageSize) return;

      // 文字锚点限制在图片边界内
      const raw = screenToWorld(world, e.global.x, e.global.y);
      const { x, y } = clampPoint(raw.x, raw.y, imageSize);

      pushHistory(); // 新增文字前记录历史
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
      const imageSize = useImageEditorStore.getState().imageSize;
      if (!imageSize) return;
      const raw = screenToWorld(world, e.global.x, e.global.y);
      let nx = raw.x - drag.offsetX;
      let ny = raw.y - drag.offsetY;
      // 把文字框整体限制在图片内（anchor 默认 0,0 即左上角）
      const b = {
        left: -imageSize.width / 2,
        top: -imageSize.height / 2,
        right: imageSize.width / 2,
        bottom: imageSize.height / 2,
      };
      nx = Math.min(Math.max(nx, b.left), Math.max(b.left, b.right - text.width));
      ny = Math.min(Math.max(ny, b.top), Math.max(b.top, b.bottom - text.height));
      text.position.set(nx, ny);
      drag.moved = true;
      drawSelectionBox(text);
    };

    // 拖动结束：把最终位置提交到 store
    const handleDragEnd = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const text = textMapRef.current.get(drag.id);
      if (text && drag.moved) {
        pushHistory(); // 仅真正发生移动时记录历史
        updateAnnotation(drag.id, { x: text.position.x, y: text.position.y });
      }
      justDraggedRef.current = drag.moved;
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
    const layer = annotationLayerRef.current;
    if (!world || !layer || !ready) return;

    // 确保高亮框存在且位于最上层
    if (!selectionBoxRef.current) {
      const box = new Graphics();
      box.visible = false;
      box.label = 'selection-box'; // 导出时据此隐藏选中框
      selectionBoxRef.current = box;
    }
    const box = selectionBoxRef.current;
    layer.addChild(box);

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
            moved: false,
          };
        });
        layer.addChild(text);
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
        layer.removeChild(text);
        text.destroy();
        map.delete(id);
      }
    }

    // 高亮框始终置顶并跟随选中项（仅文字工具下显示）
    layer.addChild(box);
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
