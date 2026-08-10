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
  /** 底图层容器：马赛克/模糊覆盖块挂在此层（图片之上、标注之下）。 */
  baseLayerRef: RefObject<Container | null>;
  /** 标注层容器：框选预览挂在此层。 */
  annotationLayerRef: RefObject<Container | null>;
  spriteRef: RefObject<Sprite | null>;
  activeTool: string;
  ready: boolean;
  imageSrc: string | null;
  defaultStyle: DefaultMosaicStyle;
}

/**
 * 把图片 sprite 连同其调色/滤镜 filter 渲染到一张全尺寸 RenderTexture，
 * 得到「过滤后的底图」纹理，供马赛克/模糊取样，从而覆盖块也带上调色与滤镜效果。
 */
const renderFilteredSnapshot = (
  renderer: Application['renderer'],
  sprite: Sprite
): RenderTexture => {
  const tw = sprite.texture.width;
  const th = sprite.texture.height;
  const rt = RenderTexture.create({ width: tw, height: th });
  // 用无锚点的临时 sprite 填满 RT，复用 sprite 上的 filter 实例（一次性渲染，安全共享）。
  // sprite.filters 的 getter 是只读数组，需展开成可变数组再赋值。
  const temp = new Sprite(sprite.texture);
  temp.filters = sprite.filters ? [...sprite.filters] : [];
  renderer.render({ container: temp, target: rt });
  // 解除引用后销毁临时对象，避免连带销毁共享的 filter
  temp.filters = [];
  temp.destroy();
  return rt;
};

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
    // 向外扩边采样：BlurFilter 会向邻域取样，若只裁目标区域，边缘会采到空白产生暗边/透明边。
    // 先扩出 pad(>= 模糊半径) 的余量做模糊，再从结果里裁回目标区域。
    const pad = Math.ceil(region.strength) * 2;
    const px0 = Math.max(0, Math.floor(x0 - pad));
    const py0 = Math.max(0, Math.floor(y0 - pad));
    const px1 = Math.min(tw, Math.ceil(x1 + pad));
    const py1 = Math.min(th, Math.ceil(y1 + pad));
    const pw = px1 - px0;
    const ph = py1 - py0;

    const paddedSub = new Texture({ source: base.source, frame: new Rectangle(px0, py0, pw, ph) });
    const temp = new Sprite(paddedSub);
    temp.filters = [new BlurFilter({ strength: region.strength })];
    const rt = RenderTexture.create({ width: pw, height: ph });
    renderer.render({ container: temp, target: rt });
    temp.destroy();

    // 从模糊结果中裁出目标区域（去掉四周 padding），此时边缘已是有效模糊像素
    const innerTex = new Texture({
      source: rt.source,
      frame: new Rectangle(x0 - px0, y0 - py0, w, h),
    });
    const overlay = new Sprite(innerTex);
    overlay.anchor.set(0.5);
    overlay.position.set(cx, cy);
    return overlay;
  }

  // mosaic：降采样到 cols×rows，再最近邻放大
  const cols = Math.max(1, Math.round(w / region.strength));
  const rows = Math.max(1, Math.round(h / region.strength));
  const rt = RenderTexture.create({ width: cols, height: rows });
  // 必须在采样前设置为 nearest，否则放大仍走线性插值，出来是模糊而非清晰方块
  rt.source.scaleMode = 'nearest';
  const temp = new Sprite(sub);
  temp.width = cols;
  temp.height = rows;
  renderer.render({ container: temp, target: rt });
  temp.destroy();

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
  baseLayerRef,
  annotationLayerRef,
  spriteRef,
  activeTool,
  ready,
  imageSrc,
  defaultStyle,
}: Options) => {
  const mosaics = useImageEditorStore((s) => s.mosaics);
  const addMosaic = useImageEditorStore((s) => s.addMosaic);
  const pushHistory = useImageEditorStore((s) => s.pushHistory);
  // 覆盖块取样的是「过滤后的底图」，故调色/滤镜变化时需要重建
  const filterId = useImageEditorStore((s) => s.filterId);
  const adjustments = useImageEditorStore((s) => s.adjustments);

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
      const layer = annotationLayerRef.current;
      if (!layer) return;
      const p = screenToWorld(world, e.global.x, e.global.y);
      const g = new Graphics();
      layer.addChild(g);
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
      drag.graphics.parent?.removeChild(drag.graphics);
      drag.graphics.destroy();
      const p = screenToWorld(world, e.global.x, e.global.y);
      const r = rectOf(drag.startX, drag.startY, p.x, p.y);
      // 过小的框视为误操作
      if (r.w < 3 || r.h < 3) return;
      pushHistory(); // 新增马赛克前记录历史
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
  // 覆盖块取样「过滤后的底图」快照，故 filterId/adjustments 变化时也需重建。
  useEffect(() => {
    const app = appRef.current;
    const baseLayer = baseLayerRef.current;
    const sprite = spriteRef.current;
    if (!app || !baseLayer || !ready) return;

    const map = overlayMapRef.current;
    for (const o of map.values()) {
      o.parent?.removeChild(o);
      // overlay 独占一张 RenderTexture，必须连同 texture/source 一起销毁，否则每次重建都泄漏显存
      o.destroy({ texture: true, textureSource: true });
    }
    map.clear();
    if (!sprite || mosaics.length === 0) return;

    // 生成一次过滤后底图快照，所有区域共享取样
    const snapshot = renderFilteredSnapshot(app.renderer, sprite);
    for (const region of mosaics) {
      const overlay = buildOverlay(app.renderer, snapshot, region);
      if (!overlay) continue;
      baseLayer.addChild(overlay);
      map.set(region.id, overlay);
    }
    snapshot.destroy(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mosaics, ready, imageSrc, filterId, adjustments]);

  // 卸载清理
  useEffect(() => {
    return () => {
      const map = overlayMapRef.current;
      for (const o of map.values()) o.destroy({ texture: true, textureSource: true });
      map.clear();
    };
  }, []);
};

export default useMosaicTool;
