import { Container } from 'pixi.js';

export interface Point {
  x: number;
  y: number;
}

/**
 * 获取鼠标事件相对于 canvas 左上角的坐标。
 * @param canvas Pixi 的 canvas 元素
 * @param e 指针/滚轮事件
 */
export const getCanvasPoint = (
  canvas: HTMLCanvasElement,
  e: { clientX: number; clientY: number }
): Point => {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

/**
 * 屏幕坐标（相对 canvas）转换为 world 容器的局部坐标。
 * @param world 世界容器
 * @param screenX 相对 canvas 的 x
 * @param screenY 相对 canvas 的 y
 */
export const screenToWorld = (
  world: Container,
  screenX: number,
  screenY: number
): Point => ({
  x: (screenX - world.position.x) / world.scale.x,
  y: (screenY - world.position.y) / world.scale.y,
});

/**
 * world 容器的局部坐标转换为屏幕坐标（相对 canvas）。
 * @param world 世界容器
 * @param worldX world 局部 x
 * @param worldY world 局部 y
 */
export const worldToScreen = (
  world: Container,
  worldX: number,
  worldY: number
): Point => ({
  x: worldX * world.scale.x + world.position.x,
  y: worldY * world.scale.y + world.position.y,
});
