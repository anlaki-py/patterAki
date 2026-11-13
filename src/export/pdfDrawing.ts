import { markCurvePath } from "../geometry/markCurves";
import type { Cubic } from "../geometry/bezier";
import { documentSchema, type PatternDocument } from "../document/schema";
import { segmentPath } from "../document/segments";
import { cutOutline } from "../document/seamAllowance";
import { pieceBounds } from "../document/pieceTransforms";
import { roleDash, sewingDrawing } from "../document/sewingDrawing";
import { annotationShape } from "../document/annotationGeometry";
import { markBounds, transformMarkPoint } from "../geometry/marks";
import type { Vec2 } from "../geometry/line";
import {
  metadataLines,
  sewingExportBounds,
  sewingItemRole,
} from "./sewingBounds";

export const defaultPdfLayers = {
  stitch: true,
  cut: true,
  fold: true,
  grainline: true,
  notches: true,
  darts: true,
  text: true,
  guides: false,
  internal: true,
  metadata: true,
};
export type PdfLayers = typeof defaultPdfLayers;
type PdfPath = { path: string; role: string; dash?: number[] };
type PdfText = {
  text: string;
  position: Vec2;
  size: number;
  rotation: number;
};
export function pdfDrawing(
  doc: PatternDocument,
  pieceIds: string[],
  layers: PdfLayers,
  annotations: boolean,
) {
  if (!documentSchema.safeParse(doc).success)
    throw new Error("Cannot export an invalid pattern document.");
  if (pieceIds.some((id) => !doc.pieces[id]))
    throw new Error("An export piece no longer exists.");
  const ids = [...new Set(pieceIds)].filter((id) => doc.pieces[id].visible);
  if (!ids.length) throw new Error("Choose at least one visible piece.");
  if (!Object.values(layers).some(Boolean))
    throw new Error("Choose at least one PDF layer.");
  const allowed = (role: string) =>
    role === "fold"
      ? layers.fold
      : role === "grainline"
        ? layers.grainline
        : role === "notch"
          ? layers.notches
          : role === "dart"
            ? layers.darts
            : true;
  const bounds = sewingExportBounds(doc, ids, {
    internal: layers.internal,
    text: layers.text,
    roleVisible: (role) =>
      allowed(role) && (role !== "stitch" || layers.stitch),
    marks: layers.fold || layers.grainline || layers.notches || layers.darts,
    metadata: layers.text && layers.metadata,
  });
  const paths: PdfPath[] = [],
    texts: PdfText[] = [],
    circles: { center: Vec2; radius: number }[] = [];
  const include = (p: Vec2) => {
    bounds.min.x = Math.min(bounds.min.x, p.x);
    bounds.min.y = Math.min(bounds.min.y, p.y);
    bounds.max.x = Math.max(bounds.max.x, p.x);
    bounds.max.y = Math.max(bounds.max.y, p.y);
  };
  const path = (d: string, role: string) =>
    paths.push({ path: d, role, dash: roleDash(role)?.split(" ").map(Number) });
  for (const id of ids) {
    const piece = doc.pieces[id];
    if (layers.cut) {
      try {
        const points = cutOutline(doc, piece);
        points.forEach(include);
        path(
          points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ") +
            " Z",
          "cut",
        );
      } catch (cause) {
        throw new Error(
          `Cannot export cut outline for "${piece.name}". ${cause instanceof Error ? cause.message : "Offset failed."}`,
          { cause },
        );
      }
    }
    for (const ref of piece.stitchingOutline) {
      const role = piece.sewing?.edges[ref.segmentId]?.role ?? "stitch";
      if (role === "fold" ? layers.fold : layers.stitch)
        path(segmentPath(doc, doc.segments[ref.segmentId]), role);
    }
    if (layers.internal)
      for (const internal of piece.internalPaths) {
        const setting = piece.sewing?.paths[internal.id];
        const role = setting?.role ?? "construction";
        if (
          setting?.export === false ||
          !allowed(role) ||
          (role === "stitch" && !layers.stitch)
        )
          continue;
        for (const ref of internal.edges)
          path(segmentPath(doc, doc.segments[ref.segmentId]), role);
      }
    for (const item of sewingDrawing(doc, piece)) {
      const parentRole = sewingItemRole(piece, item);
      if (!allowed(parentRole)) continue;
      if (item.path) path(item.path, item.role);
      else if (layers.text && item.text)
        texts.push({
          text: item.text,
          position: { x: item.x!, y: item.y! },
          size: item.fontSize ?? 3,
          rotation: 0,
        });
    }
    if (layers.text && layers.metadata) {
      const base = pieceBounds(doc, [id]);
      metadataLines(piece).forEach((text, i) =>
        texts.push({
          text,
          position: { x: base.min.x, y: base.max.y + 10 + i * 6 },
          size: 4,
          rotation: 0,
        }),
      );
    }
  }
  if (annotations)
    for (const mark of Object.values(doc.annotations)) {
      if (!allowed(mark.kind) || (mark.kind === "text" && !layers.text))
        continue;
      const shape = annotationShape(mark);
      const transform = (p: Vec2) =>
        transformMarkPoint(p, mark.position, mark.rotation);
      for (const [a, b] of shape.lines) {
        const start = transform(a),
          end = transform(b);
        path(`M ${start.x} ${start.y} L ${end.x} ${end.y}`, mark.kind);
      }
      for (const curve of shape.curves ?? [])
        path(markCurvePath(curve.map(transform) as Cubic), mark.kind);
      for (const c of shape.circles)
        circles.push({ center: transform(c.center), radius: c.radius });
      if (layers.text)
        for (const t of shape.texts)
          texts.push({
            text: t.text,
            position: transform({ x: t.position.x, y: t.position.y + t.size }),
            size: t.size,
            rotation: mark.rotation,
          });
      const b = markBounds(
        {
          ...shape,
          texts: layers.text
            ? shape.texts.map((t) => ({ ...t, width: t.text.length * t.size }))
            : [],
        },
        mark.position,
        mark.rotation,
      );
      include(b.min);
      include(b.max);
    }
  // Infinite workspace guides stop at the drawing bounds and never change paper extent.
  if (layers.guides)
    for (const guide of Object.values(doc.guides)) {
      if (!guide.visible) continue;
      const d =
        guide.axis === "x"
          ? `M ${guide.positionMm} ${bounds.min.y} L ${guide.positionMm} ${bounds.max.y}`
          : `M ${bounds.min.x} ${guide.positionMm} L ${bounds.max.x} ${guide.positionMm}`;
      paths.push({ path: d, role: "guide", dash: [2, 2] });
    }
  if (!paths.length && !texts.length && !circles.length)
    throw new Error("The selected PDF layers contain no printable geometry.");
  return { paths, texts, circles, bounds };
}
