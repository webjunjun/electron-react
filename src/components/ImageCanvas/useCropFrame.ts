import { RefObject, useEffect, useRef } from 'react';
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
} from 'pixi.js';
import { useImageEditorStore, Frame } from '../../store/imageEditorStore';
import { screenToWorld } from './coords';

interface Options {
  appRef: RefObject<Application | null>;
  worldRef: RefObject<Container | null>;
  /** 标注层容器：画框可视化挂在此层顶部（盖在所有内容之上）。 */
  annotationLayerRef: RefObject<Container | null>;
  activeTool: string;
  ready: boolean;
  imageSrc: string | null;
}

/** 手柄种类：四角 + 四边中点 + 内部移动。 */
type HandleKind =
  | 'nw' | 'n' | 'ne'
  | 'w' | 'e'
  | 'sw' | 's' | 'se'
  | 'move';

/** 8 个可拖拽手柄的相对定位（0=起边, 0.5=中点, 1=末边）。 */
const HANDLES: { kind: Exclude<HandleKind, 'move'>; fx: number; fy: number }[] = [
  { kind: 'nw', fx: 0, fy: 0 },
  { kind: 'n', fx: 0.5, fy: 0 },
  { kind: 'ne', fx: 1, fy: 0 },
  { kind: 'w', fx: 0, fy: 0.5 },
  { kind: 'e', fx: 1, fy: 0.5 },
  { kind: 'sw', fx: 0, fy: 1 },
  { kind: 's', fx: 0.5, fy: 1 },
  { kind: 'se', fx: 1, fy: 1 },
];

// 屏幕像素常量（实际使用时除以 world.scale 转 world 单位）
const HANDLE_SIZE = 8; // 手柄边长
const HANDLE_HIT = 12; // 手柄命中半径
const BORDER_WIDTH = 1.5;

const useCropFrame = ({
  appRef,
  worldRef,
  annotationLayerRef,
  activeTool,
  ready,
  imageSrc,
}: Options) => {
  const frame = useImageEditorStore((s) => s.frame);
  const cropRatio = useImageEditorStore((s) => s.cropRatio);
  const imageSize = useImageEditorStore((s) => s.imageSize);
  const zoom = useImageEditorStore((s) => s.zoom);
  const setFrame = useImageEditorStore((s) => s.setFrame);
  const pushHistory = useImageEditorStore((s) => s.pushHistory);

  const isCropTool = activeTool === 'crop';

  // 判断画框是否等于全图（即用户尚未真正裁剪）。
  const isFullFrame = (f: Frame): boolean => {
    if (!imageSize) return true;
    const eps = 0.5;
    return (
      Math.abs(f.x - -imageSize.width / 2) < eps &&
      Math.abs(f.y - -imageSize.height / 2) < eps &&
      Math.abs(f.width - imageSize.width) < eps &&
      Math.abs(f.height - imageSize.height) < eps
    );
  };

  // 画框容器与其子图形
  const groupRef = useRef<Container | null>(null);
  const maskRef = useRef<Graphics | null>(null);
  const borderRef = useRef<Graphics | null>(null);
  const handlesRef = useRef<Graphics | null>(null);
  // 拖拽状态：起始 frame、命中的手柄种类
  const dragRef = useRef<{ kind: HandleKind; start: Frame } | null>(null);

  // 绘制画框（overlay 压暗 + 边框 + 手柄），传入要渲染的 frame。
  // interactive=true 时画三分线与 8 手柄（crop 工具下）；否则仅压暗+边框（其它工具下持续提示裁剪范围）。
  const redraw = (f: Frame, interactive: boolean) => {
    const world = worldRef.current;
    const mask = maskRef.current;
    const border = borderRef.current;
    const handles = handlesRef.current;
    if (!world || !mask || !border || !handles || !imageSize) return;

    const scale = world.scale.x || 1;

    // 框外压暗：铺满一个远大于画布/图片的范围，只挖出 frame 这个洞。
    // 这样 frame 之外的一切（包括画在图片外的文字/画笔草稿）都统一变暗，
    // 语义为「亮 = 成品，暗 = 导出时丢弃」。
    // 非交互态（已裁剪、非 crop 工具）用更深的压暗，让被裁掉的区域更明显。
    mask.clear();
    const dim = { color: 0x000000, alpha: interactive ? 0.5 : 0.6 };
    // 足够大的外框边界（world 单位），覆盖整个可视区乃至更远
    const BIG = 1e6;
    const outL = -BIG;
    const outT = -BIG;
    const outR = BIG;
    const outB = BIG;
    // frame 之外的四块矩形（上/下/左/右）拼成挖洞遮罩
    // 上
    mask.rect(outL, outT, outR - outL, f.y - outT).fill(dim);
    // 下
    mask.rect(outL, f.y + f.height, outR - outL, outB - (f.y + f.height)).fill(dim);
    // 左
    mask.rect(outL, f.y, f.x - outL, f.height).fill(dim);
    // 右
    mask.rect(f.x + f.width, f.y, outR - (f.x + f.width), f.height).fill(dim);

    // 边框
    border.clear();
    border
      .rect(f.x, f.y, f.width, f.height)
      .stroke({ width: BORDER_WIDTH / scale, color: 0xffffff });

    // 三分线 + 手柄，仅交互态（crop 工具）绘制
    handles.clear();
    if (interactive) {
      const thin = 1 / scale;
      const gridColor = { width: thin, color: 0xffffff, alpha: 0.4 };
      for (let i = 1; i <= 2; i++) {
        const gx = f.x + (f.width * i) / 3;
        handles.moveTo(gx, f.y).lineTo(gx, f.y + f.height).stroke(gridColor);
        const gy = f.y + (f.height * i) / 3;
        handles.moveTo(f.x, gy).lineTo(f.x + f.width, gy).stroke(gridColor);
      }
      // 8 个手柄方块
      const hs = HANDLE_SIZE / scale;
      for (const h of HANDLES) {
        const hx = f.x + f.width * h.fx;
        const hy = f.y + f.height * h.fy;
        handles
          .rect(hx - hs / 2, hy - hs / 2, hs, hs)
          .fill({ color: 0xffffff })
          .stroke({ width: thin, color: 0x1677ff });
      }
    }
  };

  // 命中测试：返回被点中的手柄种类（含内部 move），未命中返回 null。
  const hitTest = (f: Frame, px: number, py: number, scale: number): HandleKind | null => {
    const hit = HANDLE_HIT / scale;
    for (const h of HANDLES) {
      const hx = f.x + f.width * h.fx;
      const hy = f.y + f.height * h.fy;
      if (Math.abs(px - hx) <= hit && Math.abs(py - hy) <= hit) return h.kind;
    }
    // 内部区域 → 移动
    if (px >= f.x && px <= f.x + f.width && py >= f.y && py <= f.y + f.height) {
      return 'move';
    }
    return null;
  };

  // 根据拖拽手柄计算新 frame（未 clamp；clamp 交给 store）。
  const applyDrag = (
    kind: HandleKind,
    start: Frame,
    dx: number,
    dy: number,
    ratio: number | null
  ): Frame => {
    if (kind === 'move') {
      return { ...start, x: start.x + dx, y: start.y + dy };
    }

    let l = start.x;
    let t = start.y;
    let r = start.x + start.width;
    let b = start.y + start.height;

    const affectL = kind === 'w' || kind === 'nw' || kind === 'sw';
    const affectR = kind === 'e' || kind === 'ne' || kind === 'se';
    const affectT = kind === 'n' || kind === 'nw' || kind === 'ne';
    const affectB = kind === 's' || kind === 'sw' || kind === 'se';

    if (affectL) l = start.x + dx;
    if (affectR) r = start.x + start.width + dx;
    if (affectT) t = start.y + dy;
    if (affectB) b = start.y + start.height + dy;

    let x = Math.min(l, r);
    let y = Math.min(t, b);
    let w = Math.abs(r - l);
    let h = Math.abs(b - t);

    if (ratio) {
      const isCorner =
        kind === 'nw' || kind === 'ne' || kind === 'sw' || kind === 'se';
      if (isCorner) {
        // 角：以宽为驱动，锚定对角固定
        h = w / ratio;
        const anchorX = affectL ? r : l; // 未被拖动的水平边
        const anchorY = affectT ? b : t; // 未被拖动的垂直边
        x = affectL ? anchorX - w : anchorX;
        y = affectT ? anchorY - h : anchorY;
      } else if (kind === 'w' || kind === 'e') {
        // 左右边：宽驱动，垂直居中锚定
        h = w / ratio;
        const cy = start.y + start.height / 2;
        y = cy - h / 2;
        x = affectL ? r - w : l;
      } else {
        // 上下边：高驱动，水平居中锚定
        w = h * ratio;
        const cx = start.x + start.width / 2;
        x = cx - w / 2;
        y = affectT ? b - h : t;
      }
    }

    return { x, y, width: w, height: h };
  };

  // 事件绑定：拖拽画框（仅 crop 工具）
  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || !ready) return;

    const stage = app.stage;
    stage.eventMode = 'static';
    stage.hitArea = app.screen;

    // 拖拽起点（world 坐标）
    let startWX = 0;
    let startWY = 0;

    const handleDown = (e: FederatedPointerEvent) => {
      if (!isCropTool) return;
      const f = useImageEditorStore.getState().frame;
      if (!f) return;
      const p = screenToWorld(world, e.global.x, e.global.y);
      const kind = hitTest(f, p.x, p.y, world.scale.x || 1);
      if (!kind) return;
      dragRef.current = { kind, start: f };
      startWX = p.x;
      startWY = p.y;
    };

    const handleMove = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = screenToWorld(world, e.global.x, e.global.y);
      const next = applyDrag(
        drag.kind,
        drag.start,
        p.x - startWX,
        p.y - startWY,
        useImageEditorStore.getState().cropRatio
      );
      // 实时预览（不写 store，避免高频渲染）
      redraw(next, true);
    };

    const handleUp = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const p = screenToWorld(world, e.global.x, e.global.y);
      const next = applyDrag(
        drag.kind,
        drag.start,
        p.x - startWX,
        p.y - startWY,
        useImageEditorStore.getState().cropRatio
      );
      // 拖拽过程未写 store，此刻 store 仍是拖拽前的 frame，先记录历史再提交
      const changed =
        Math.abs(next.x - drag.start.x) > 0.01 ||
        Math.abs(next.y - drag.start.y) > 0.01 ||
        Math.abs(next.width - drag.start.width) > 0.01 ||
        Math.abs(next.height - drag.start.height) > 0.01;
      if (changed) pushHistory();
      setFrame(next); // store 内 clamp 到图片边界
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
  }, [ready, isCropTool]);

  // 同步：创建/更新画框图形，跟随 frame / 工具 / 缩放变化重绘
  useEffect(() => {
    const layer = annotationLayerRef.current;
    if (!layer || !ready) return;

    // 懒创建画框容器与子图形
    if (!groupRef.current) {
      const group = new Container();
      group.label = 'crop-frame'; // 导出时据此隐藏画框叠加层
      group.eventMode = 'none'; // 事件走 stage，容器本身不拦截
      const mask = new Graphics();
      const border = new Graphics();
      const handles = new Graphics();
      group.addChild(mask, border, handles);
      groupRef.current = group;
      maskRef.current = mask;
      borderRef.current = border;
      handlesRef.current = handles;
    }
    const group = groupRef.current;
    // 始终置于标注层顶部
    layer.addChild(group);

    // 显示规则：
    // - crop 工具：交互态，显示压暗 + 边框 + 三分线 + 手柄
    // - 其它工具：若已裁剪（frame ≠ 全图），持续显示压暗 + 边框，让用户始终感知被裁掉的范围；未裁剪则隐藏
    if (frame && imageSize) {
      if (isCropTool) {
        group.visible = true;
        redraw(frame, true);
      } else if (!isFullFrame(frame)) {
        group.visible = true;
        redraw(frame, false);
      } else {
        group.visible = false;
      }
    } else {
      group.visible = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, cropRatio, imageSize, isCropTool, ready, imageSrc, zoom]);

  // 卸载清理
  useEffect(() => {
    return () => {
      groupRef.current?.destroy({ children: true });
      groupRef.current = null;
      maskRef.current = null;
      borderRef.current = null;
      handlesRef.current = null;
    };
  }, []);
};

export default useCropFrame;
