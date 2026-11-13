import type { Cubic } from "./bezier";
import type { Vec2 } from "./line";

/** At most 45 degrees per cubic; radial error is below 0.0005% of radius. */
export function ellipseArc(
  center: Vec2,
  rx: number,
  ry: number,
  start = 0,
  end = 2 * Math.PI,
): Cubic[] {
  const step = Math.PI / 4;
  const low = Math.min(start, end),
    high = Math.max(start, end);
  const angles = [low];
  for (let i = Math.floor(low / step) + 1; i * step < high; i++)
    angles.push(i * step);
  angles.push(high);
  if (end < start) angles.reverse();
  const curves: Cubic[] = [];
  const point = (t: number) => ({
    x: center.x + rx * Math.cos(t),
    y: center.y + ry * Math.sin(t),
  });
  for (let i = 0; i < angles.length - 1; i++) {
    const a = angles[i],
      b = angles[i + 1];
    const k = (4 / 3) * Math.tan((b - a) / 4),
      p = point(a),
      q = point(b);
    curves.push([
      p,
      { x: p.x - k * rx * Math.sin(a), y: p.y + k * ry * Math.cos(a) },
      { x: q.x + k * rx * Math.sin(b), y: q.y - k * ry * Math.cos(b) },
      q,
    ]);
  }
  return curves;
}
export function markCurvePath([a, b, c, d]: Cubic): string {
  return `M ${a.x} ${a.y} C ${b.x} ${b.y} ${c.x} ${c.y} ${d.x} ${d.y}`;
}
