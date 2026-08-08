import { RefObject, useEffect, useRef } from 'react';
import {
  Application,
  BlurFilter,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
} from 'pixi.js';
import {
  useImageEditorStore,
  MosaicRegion,
} from '../../store/imageEditorStore';
import { screenToWorld } from './coords';

/** 新建马赛克区域时的默认参数。 */
export interface DefaultMosaicStyle {
  mode: 'mosaic' | 'blur';
  strength: number;
}

interface Options {
  appRef: RefObject<Application | null>;
  worldRef: RefObject<Container | null>;
  spriteRef: RefObject<Sprite | null>;
  activeTool: string;
  ready: boolean;
  imageSrc: string | null;
  defaultStyle: DefaultMosaicStyle;
}

/**
 * 为单块区域构建覆盖用的 Sprite：
 * - blur：取该区域子纹理叠加 BlurFilter；
 * - mosaic：把子纹理渲染到低分辨率 RenderTexture，再以最近邻放大回原尺寸形成格子。
 * 坐标：region 为 world 局部坐标；图片 sprite anchor 0.5、未单独缩放，故 world 坐标 = 纹理像素坐标 - 半尺寸。
 */
const buildOverlay = (
  renderer: Application['renderer'],
  base: Texture,
  region: MosaicRegion
): Sprite | null => {
  const tw = base.width;
  const th = base.height;

  // world 坐标 -> 纹理像素坐标，并裁剪到图片范围内
  const texX = region.x + tw / 2;
  const texY = region.y + th / 2;
  const x0 = Math.max(0, texX);
  const y0 = Math.max(0, texY);
  const x1 = Math.min(tw, texX + region.width);
  const y1 = Math.min(th, texY + region.height);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;

  const frame = new Rectangle(x0, y0, w, h);
  const sub = new Texture({ source: base.source, frame });

  // 覆盖 Sprite 的中心（world 坐标）
  const cx = x0 - tw / 2 + w / 2;
  const cy = y0 - th / 2 + h / 2;

  if (region.mode === 'blur') {
    const overlay = new Sprite(sub);
    overlay.anchor.set(0.5);
    overlay.position.set(cx, cy);
    overlay.filters = [new BlurFilter({ strength: region.strength })];
    return overlay;
  }

  // mosaic：降采样到 cols×rows，再最近邻放大
  const cols = Math.max(1, Math.round(w / region.strength));
  const rows = Math.max(1, Math.round(h / region.strength));
  const rt = RenderTexture.create({ width: cols, height: rows });
  const temp = new Sprite(sub);
  temp.width = cols;
  temp.height = rows;
  renderer.render({ container: temp, target: rt });
  temp.destroy();
  rt.source.scaleMode = 'nearest';

  const overlay = new Sprite(rt);
  overlay.anchor.set(0.5);
  overlay.position.set(cx, cy);
  overlay.width = w;
  overlay.height = h;
  return overlay;
};

/**
 * 马赛克/模糊工具：
 * - mosaic 工具下在图片上拖拽框选区域，松开后提交到 store；
 * - 根据 store 的 mosaics 重建覆盖 Sprite。
 */
const useMosaicTool = ({
  appRef,
  worldRef,
  spriteRef,
  activeTool,
  ready,
  imageSrc,
  defaultStyle,
}: Options) => {
  const mosaics = useImageEditorStore((s) => s.mosaics);
  const addMosaic = useImageEditorStore((s) => s.addMosaic);

  const overlayMapRef = useRef<Map<string, Sprite>>(new Map());
  // 正在框选的矩形预览
  const dragRef = useRef<{ startX: number; startY: number; graphics: Graphics } | null>(
    null
  );

  const isMosaicTool = activeTool === 'mosaic';

  // 框选交互
  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || !ready) return;

    const stage = app.stage;
    stage.eventMode = 'static';
    stage.hitArea = app.screen;

    const rectOf = (ax: number, ay: number, bx: number, by: number) => ({
      x: Math.min(ax, bx),
      y: Math.min(ay, by),
      w: Math.abs(bx - ax),
      h: Math.abs(by - ay),
    });

    const handleDown = (e: FederatedPointerEvent) => {
      if (!isMosaicTool || !spriteRef.current) return;
      const p = screenToWorld(world, e.global.x, e.global.y);
      const g = new Graphics();
      world.addChild(g);
      dragRef.current = { startX: p.x, startY: p.y, graphics: g };
    };

    const handleMove = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = screenToWorld(world, e.global.x, e.global.y);
      const r = rectOf(drag.startX, drag.startY, p.x, p.y);
      drag.graphics.clear();
      drag.graphics
        .rect(r.x, r.y, r.w, r.h)
        .fill({ color: 0x1677ff, alpha: 0.2 })
        .stroke({ width: 1 / world.scale.x, color: 0x1677ff });
    };

    const handleUp = (e: FederatedPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      world.removeChild(drag.graphics);
      drag.graphics.destroy();
      const p = screenToWorld(world, e.global.x, e.global.y);
      const r = rectOf(drag.startX, drag.startY, p.x, p.y);
      // 过小的框视为误操作
      if (r.w < 3 || r.h < 3) return;
      addMosaic({
        id: crypto.randomUUID(),
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        mode: defaultStyle.mode,
        strength: defaultStyle.strength,
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
  }, [ready, isMosaicTool, defaultStyle.mode, defaultStyle.strength]);

  // 根据 mosaics 重建覆盖 Sprite（数量少，直接全量重建）
  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    const sprite = spriteRef.current;
    if (!app || !world || !ready) return;

    const map = overlayMapRef.current;
    for (const o of map.values()) {
      world.removeChild(o);
      o.destroy();
    }
    map.clear();
    if (!sprite) return;

    for (const region of mosaics) {
      const overlay = buildOverlay(app.renderer, sprite.texture, region);
      if (!overlay) continue;
      world.addChild(overlay);
      map.set(region.id, overlay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mosaics, ready, imageSrc]);

  // 卸载清理
  useEffect(() => {
    return () => {
      const map = overlayMapRef.current;
      for (const o of map.values()) o.destroy();
      map.clear();
    };
  }, []);
};

export default useMosaicTool;
