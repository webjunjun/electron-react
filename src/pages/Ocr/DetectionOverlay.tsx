import { useEffect, useRef } from 'react';
import type { DetBox } from './dbPostProcess';

interface DetectionOverlayProps {
  /** 检测框（原图坐标系） */
  boxes: DetBox[];
  /** 被覆盖的图片元素引用 */
  imgRef: React.RefObject<HTMLImageElement>;
}

/**
 * 轻量检测框可视化：用一个绝对定位的 canvas 覆盖整个预览区，
 * 根据 img 在容器内的实际显示位置与缩放比，把原图坐标的检测框映射后绘制。
 * 不依赖 Pixi，pointerEvents:none 不拦截拖拽导入等交互。
 */
export default function DetectionOverlay({ boxes, imgRef }: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      if (!img) return;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!boxes.length) return;

      const origW = img.naturalWidth;
      const origH = img.naturalHeight;
      // img 显示尺寸与在预览区内的偏移（offsetParent 即 .ocr-preview）
      const dispW = img.offsetWidth;
      const dispH = img.offsetHeight;
      if (!origW || !origH || !dispW || !dispH) return;
      const scaleX = dispW / origW;
      const scaleY = dispH / origH;
      const offsetX = img.offsetLeft;
      const offsetY = img.offsetTop;

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00e676';
      ctx.fillStyle = 'rgba(0, 230, 118, 0.14)';
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#00e676';

      boxes.forEach((box, idx) => {
        ctx.beginPath();
        box.points.forEach(([x, y], i) => {
          const px = offsetX + x * scaleX;
          const py = offsetY + y * scaleY;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 230, 118, 0.14)';
        ctx.fill();
        ctx.strokeStyle = '#00e676';
        ctx.stroke();
        // 框序号
        const cx = offsetX + (box.points[0][0] + box.points[2][0]) / 2 * scaleX;
        const cy = offsetY + (box.points[0][1] + box.points[2][1]) / 2 * scaleY;
        ctx.fillStyle = '#00e676';
        ctx.fillText(String(idx + 1), cx - 4, offsetY + box.points[0][1] * scaleY - 4);
      });
    };

    draw();
    // 图片加载完成（含切换图片）后重绘
    const onLoad = () => draw();
    if (img) {
      if (img.complete) draw();
      else img.addEventListener('load', onLoad, { once: true });
    }
    // 容器/图片尺寸变化时重绘
    const ro = new ResizeObserver(() => draw());
    ro.observe(parent);
    if (img) ro.observe(img);
    window.addEventListener('resize', draw);

    return () => {
      if (img) img.removeEventListener('load', onLoad);
      ro.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [boxes, imgRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
    />
  );
}
