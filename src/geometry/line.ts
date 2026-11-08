export type Vec2 = { x: number; y: number };
export type Anchor = "start" | "center" | "end";
export const distance = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);
export const angle = (a: Vec2, b: Vec2) =>
  (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function endpoint(a: Vec2, length: number, degrees: number): Vec2 {
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(degrees))
    throw new Error("Enter a positive length and finite angle.");
  return {
    x: a.x + length * Math.cos((degrees * Math.PI) / 180),
    y: a.y + length * Math.sin((degrees * Math.PI) / 180),
  };
}
export function resizeLine(
  a: Vec2,
  b: Vec2,
  length: number,
  anchor: Anchor,
): [Vec2, Vec2] {
  const old = distance(a, b);
  if (old < 1e-9) throw new Error("A zero-length line has no direction.");
  const end = endpoint(a, length, angle(a, b));
  const shift = anchor === "start" ? 0 : anchor === "center" ? 0.5 : 1;
  const dx = (end.x - b.x) * shift,
    dy = (end.y - b.y) * shift;
  return [
    { x: a.x - dx, y: a.y - dy },
    { x: end.x - dx, y: end.y - dy },
  ];
}
export function project(a: Vec2, b: Vec2, point: Vec2): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    squared = dx * dx + dy * dy;
  return squared === 0
    ? 0
    : Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared),
      );
}
