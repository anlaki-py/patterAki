import type { Vec2 } from "../geometry/line";

/** Screen-space speed changes only the view translation, never document coordinates. */
export function autoPanDelta(
  point: Vec2,
  size: { width: number; height: number },
  elapsedMs: number,
): Vec2 {
  const speed = (position: number, extent: number) => {
    if (position < 0 || position > extent || extent < 64) return 0;
    if (position < 32) return (32 - position) / 32;
    if (position > extent - 32) return -(position - extent + 32) / 32;
    return 0;
  };
  const step = (300 * Math.min(50, Math.max(0, elapsedMs))) / 1000;
  return {
    x: speed(point.x, size.width) * step,
    y: speed(point.y, size.height) * step,
  };
}
