import { applyTransform } from "./pieceTransforms";
import { dartPoints, notchPoint, resolvedMark } from "./sewing";
import type { PatternDocument, PatternPiece } from "./schema";
export type SewingDrawing = {
  id: string;
  role: string;
  path?: string;
  text?: string;
  x?: number;
  y?: number;
  fontSize?: number;
};
export function sewingDrawing(
  doc: PatternDocument,
  piece: PatternPiece,
): SewingDrawing[] {
  const result: SewingDrawing[] = [],
    s = piece.sewing;
  if (!s) return result;
  for (const n of s.notches) {
    const { position: p, rotation } = notchPoint(doc, n),
      r =
        ((rotation +
          (piece.stitchingOutline.find((ref) => ref.segmentId === n.segmentId)
            ?.reversed
            ? 180
            : 0)) *
          Math.PI) /
        180;
    const at = (x: number, y: number) =>
      `${p.x + x * Math.cos(r) - y * Math.sin(r)} ${p.y + x * Math.sin(r) + y * Math.cos(r)}`;
    const d = n.depthMm;
    const path =
      n.style === "V"
        ? `M ${at(-d / 2, -d)} L ${at(0, 0)} L ${at(d / 2, -d)}`
        : n.style === "T"
          ? `M ${at(0, 0)} L ${at(0, -d)} M ${at(-d / 2, -d)} L ${at(d / 2, -d)}`
          : n.style === "double"
            ? `M ${at(-1, 0)} L ${at(-1, -d)} M ${at(1, 0)} L ${at(1, -d)}`
            : `M ${at(0, 0)} L ${at(0, -d)}`;
    result.push({ id: n.id, role: "notch", path });
  }
  for (const mark of s.marks) {
    const m = resolvedMark(doc, piece, mark),
      r = (m.rotation * Math.PI) / 180,
      l = m.lengthMm / 2;
    const at = (x: number, y: number) =>
      `${m.position.x + x * Math.cos(r) - y * Math.sin(r)} ${m.position.y + x * Math.sin(r) + y * Math.cos(r)}`;
    const path =
      m.kind === "grainline"
        ? `M ${at(-l, 0)} L ${at(l, 0)} M ${at(-l + 3, -2)} L ${at(-l, 0)} L ${at(-l + 3, 2)} M ${at(l - 3, -2)} L ${at(l, 0)} L ${at(l - 3, 2)}`
        : `M ${at(-l, 0)} L ${at(l, 0)} M ${at(-l, -3)} L ${at(-l, 3)} M ${at(l, -3)} L ${at(l, 3)}`;
    result.push({ id: m.id, role: m.kind, path });
    result.push({
      id: `${m.id}-label`,
      role: "dimension",
      x: m.position.x + 2,
      y: m.position.y - 3,
      fontSize: m.fontSizeMm ?? 4,
      text: m.label || `${m.kind} ${Number(m.rotation.toFixed(2))}°`,
    });
  }
  for (const dart of s.darts) {
    const points = dartPoints(dart),
      a = applyTransform(piece.transform, points.legA),
      b = applyTransform(piece.transform, points.legB),
      apex = applyTransform(piece.transform, points.apex);
    result.push({
      id: dart.id,
      role: "dart",
      path: `M ${a.x} ${a.y} L ${apex.x} ${apex.y} L ${b.x} ${b.y}`,
    });
    result.push({
      id: `${dart.id}-dimension`,
      role: "dimension",
      x: apex.x + 2,
      y: apex.y,
      text: `Intake ${dart.intakeMm} mm · Depth ${dart.depthMm} mm`,
    });
  }
  return result;
}
export const roleDash = (role: string) =>
  ({
    construction: "4 3",
    dart: "6 2 1 2",
    fold: "8 3",
    placement: "2 2",
    hem: "5 2",
  })[role];
