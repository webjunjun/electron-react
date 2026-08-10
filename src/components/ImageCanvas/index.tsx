import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
// 必须在任何 PIXI 渲染器初始化前导入：用静态 polyfill 替换 new Function() 代码生成，
// 以适配 Electron 禁止 unsafe-eval 的 CSP 环境（否则挂载滤镜会报错）。
import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Matrix, RenderTexture, Sprite, Texture } from 'pixi.js';
import { useImageEditorStore } from '../../store/imageEditorStore';
import useCanvasInteraction from './useCanvasInteraction';
import useTextTool, { DefaultTextStyle } from './useTextTool';
import useBrushTool, { DefaultBrushStyle } from './useBrushTool';
import useAdjustments from './useAdjustments';
import useFilter from './useFilter';
import useMosaicTool, { DefaultMosaicStyle } from './useMosaicTool';
import useCropFrame from './useCropFrame';

const FIT_MARGIN = 0.9;

export interface ImageCanvasHandle {
  fitToScreen: () => void;
  /** 以 100% 原始像素大小显示（world 缩放为 1），并居中。 */
  actualSize: () => void;
  /** 按当前输出画框(frame)渲染框内所有图层，返回 PNG 的 base64 dataURL。 */
  exportImage: () => Promise<string | null>;
}

interface ImageCanvasProps {
  /** 当前激活的工具，传给交互 Hook 用于区分 move 与其他工具。 */
  activeTool: string;
  /** 新建文字时的默认样式。 */
  defaultTextStyle: DefaultTextStyle;
  /** 新建笔迹时的默认样式。 */
  defaultBrushStyle: DefaultBrushStyle;
  /** 新建马赛克/模糊区域时的默认参数。 */
  defaultMosaicStyle: DefaultMosaicStyle;
}

// forwardRef: 用于外部获取组件实例，让ref如同props一样，可以透传给组件内部的ref。

const ImageCanvas = forwardRef<ImageCanvasHandle, ImageCanvasProps>(({
  activeTool,
  defaultTextStyle,
  defaultBrushStyle,
  defaultMosaicStyle
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  // world 下的两个子层：底图层（图片+调色/滤镜+马赛克覆盖块）与标注层（文字/画笔/预览）。
  // 两层均为 identity 变换，其局部坐标 = world 局部坐标，故坐标换算仍统一走 world。
  const baseLayerRef = useRef<Container | null>(null);
  const annotationLayerRef = useRef<Container | null>(null);
  const spriteRef = useRef<Sprite | null>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  const imageSrc = useImageEditorStore((s) => s.imageSrc);
  const setZoom = useImageEditorStore((s) => s.setZoom);

  // 画布缩放与拖拽
  useCanvasInteraction({ appRef, worldRef, spriteRef, activeTool, ready });
  // 文字工具
  useTextTool({ appRef, worldRef, annotationLayerRef, spriteRef, activeTool, ready, defaultStyle: defaultTextStyle });
  // 笔迹工具
  useBrushTool({ appRef, worldRef, annotationLayerRef, spriteRef, activeTool, ready, defaultStyle: defaultBrushStyle });
  // 调整工具
  useAdjustments({ spriteRef, ready, imageSrc });
  // 滤镜工具
  useFilter({ spriteRef, ready, imageSrc });
  // 马赛克/模糊区域工具
  useMosaicTool({ appRef, worldRef, baseLayerRef, annotationLayerRef, spriteRef, activeTool, ready, imageSrc, defaultStyle: defaultMosaicStyle });
  // 裁剪画框
  useCropFrame({ appRef, worldRef, annotationLayerRef, activeTool, ready, imageSrc });

  const fitToScreen = () => {
    const app = appRef.current;
    const world = worldRef.current;
    const sprite = spriteRef.current;
    if (!app || !world || !sprite) return;
    const scale = Math.min(app.screen.width / sprite.texture.width, app.screen.height / sprite.texture.height) * FIT_MARGIN;
    world.scale.set(scale);
    world.position.set(app.screen.width / 2, app.screen.height / 2);
    setZoom(scale);
  };

  // 100% 原始像素显示：world 缩放归 1，并居中
  const actualSize = () => {
    const app = appRef.current;
    const world = worldRef.current;
    const sprite = spriteRef.current;
    if (!app || !world || !sprite) return;
    world.scale.set(1);
    world.position.set(app.screen.width / 2, app.screen.height / 2);
    setZoom(1);
  };

  // 导出：按输出画框(frame)把框内所有图层渲染为 PNG dataURL
  const exportImage = async (): Promise<string | null> => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world) return null;
    // frame 为 world 局部坐标下的输出画框（anchor 0.5，故可能为负）
    const frame = useImageEditorStore.getState().frame;
    if (!frame || frame.width <= 0 || frame.height <= 0) return null;

    // 临时隐藏裁剪画框叠加层（遮罩/边框/手柄不应出现在成品里）
    const cropGroup = annotationLayerRef.current?.children.find(
      (c) => c.label === 'crop-frame'
    );
    const prevVisible = cropGroup?.visible ?? false;
    if (cropGroup) cropGroup.visible = false;

    // 以 1:1 像素导出：输出尺寸 = frame 的 world 尺寸
    const outW = Math.max(1, Math.round(frame.width));
    const outH = Math.max(1, Math.round(frame.height));
    const rt = RenderTexture.create({ width: outW, height: outH });

    // 用变换矩阵把 world 局部坐标系中 frame 左上角平移到 (0,0)，不缩放（1:1）
    const transform = new Matrix().translate(-frame.x, -frame.y);

    let dataUrl: string | null = null;
    try {
      app.renderer.render({
        container: world,
        target: rt,
        transform,
        clear: true,
      });
      // 提取像素并转 PNG dataURL
      const canvas = app.renderer.extract.canvas(rt);
      dataUrl = canvas.toDataURL ? canvas.toDataURL('image/png') : null;
    } finally {
      rt.destroy(true);
      if (cropGroup) cropGroup.visible = prevVisible;
    }
    return dataUrl;
  };

  // 暴露一些方法给外部调用
  useImperativeHandle(ref, () => ({ fitToScreen, actualSize, exportImage }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    // 初始化Pixi.js应用
    const app = new Application();
    app.init({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true 
    })
      .then(() => {
        if (disposed) { app.destroy(true); return; }
        // 初始化Pixi.js应用的canvas
        container.appendChild(app.canvas);
        const world = new Container();
        // 底图层在下、标注层在上，保证文字/画笔始终盖在图片与马赛克之上
        const baseLayer = new Container();
        const annotationLayer = new Container();
        world.addChild(baseLayer);
        world.addChild(annotationLayer);
        app.stage.addChild(world);
        appRef.current = app;
        worldRef.current = world;
        baseLayerRef.current = baseLayer;
        annotationLayerRef.current = annotationLayer;
        setReady(true);
      });
    // 组件卸载时销毁应用
    return () => {
      disposed = true;
      spriteRef.current = null;
      worldRef.current = null;
      baseLayerRef.current = null;
      annotationLayerRef.current = null;
      if (appRef.current) { appRef.current.destroy(true); appRef.current = null; }
      loadedSrcRef.current = null;
      setReady(false);
    };
  }, []);

  // 监听 imageSrc 变化，加载图片
  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (!worldRef.current) {
        if (!cancelled) retry = setTimeout(load, 50);
        return;
      }
      const baseLayer = baseLayerRef.current;
      if (spriteRef.current) { spriteRef.current.parent?.removeChild(spriteRef.current); spriteRef.current.destroy(); spriteRef.current = null; }
      if (loadedSrcRef.current) { URL.revokeObjectURL(loadedSrcRef.current); loadedSrcRef.current = null; }
      if (!imageSrc) return;
      // 使用 blobUrl 必须指定 parser 解析器，因为无法通过后缀名判断是哪种纹理
      const texture: Texture = await Assets.load({
        src: imageSrc,
        parser: 'texture'
      });
      if (cancelled || !worldRef.current || !baseLayer) return;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      // 图片放入底图层最底部
      baseLayer.addChildAt(sprite, 0);
      spriteRef.current = sprite;
      loadedSrcRef.current = imageSrc;
      fitToScreen();
    };
    load();
    return () => { cancelled = true; if (retry) clearTimeout(retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  return <div ref={containerRef} className="image-canvas__stage" />;
});

ImageCanvas.displayName = 'ImageCanvas';
export default ImageCanvas;
