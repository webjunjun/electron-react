import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Application, Assets, Container, Sprite, Texture } from 'pixi.js';
import { useImageEditorStore } from '../../store/imageEditorStore';
import useCanvasInteraction from './useCanvasInteraction';
import useTextTool, { DefaultTextStyle } from './useTextTool';

const FIT_MARGIN = 0.9;

export interface ImageCanvasHandle {
  fitToScreen: () => void;
  /** 以 100% 原始像素大小显示（world 缩放为 1），并居中。 */
  actualSize: () => void;
}

interface ImageCanvasProps {
  /** 当前激活的工具，传给交互 Hook 用于区分 move 与其他工具。 */
  activeTool: string;
  /** 新建文字时的默认样式。 */
  defaultTextStyle: DefaultTextStyle;
}

// forwardRef: 用于外部获取组件实例，让ref如同props一样，可以透传给组件内部的ref。

const ImageCanvas = forwardRef<ImageCanvasHandle, ImageCanvasProps>(({ activeTool, defaultTextStyle }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const spriteRef = useRef<Sprite | null>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  const imageSrc = useImageEditorStore((s) => s.imageSrc);
  const setZoom = useImageEditorStore((s) => s.setZoom);

  useCanvasInteraction({ appRef, worldRef, spriteRef, activeTool, ready });
  useTextTool({ appRef, worldRef, spriteRef, activeTool, ready, defaultStyle: defaultTextStyle });

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

  // 暴露一些方法给外部调用
  useImperativeHandle(ref, () => ({ fitToScreen, actualSize }));

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
        app.stage.addChild(world);
        appRef.current = app;
        worldRef.current = world;
        setReady(true);
      });
    // 组件卸载时销毁应用
    return () => {
      disposed = true;
      spriteRef.current = null;
      worldRef.current = null;
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
      const world = worldRef.current;
      if (spriteRef.current) { world.removeChild(spriteRef.current); spriteRef.current.destroy(); spriteRef.current = null; }
      if (loadedSrcRef.current) { URL.revokeObjectURL(loadedSrcRef.current); loadedSrcRef.current = null; }
      if (!imageSrc) return;
      // 使用 blobUrl 必须指定 parser 解析器，因为无法通过后缀名判断是哪种纹理
      const texture: Texture = await Assets.load({
        src: imageSrc,
        parser: 'texture'
      });
      if (cancelled || !worldRef.current) return;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      worldRef.current.addChild(sprite);
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
