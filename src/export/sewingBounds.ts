import { transformMarkPoint } from "../geometry/marks";
import type { PatternDocument, PatternPiece } from "../document/schema";
import { pieceBounds, applyTransform } from "../document/pieceTransforms";
import { dartPoints, notchPoint, resolvedMark } from "../document/sewing";
import { sewingDrawing, type SewingDrawing } from "../document/sewingDrawing";
import type { SewingExportOptions } from "./svg";
export function metadataLines(p: PatternPiece) {
  const m = p.metadata;
  return [
    p.name,
    `Size: ${m.size} Fabric: ${m.fabric}`,
    `Cut ${m.cutQuantity}${m.onFold ? " on fold" : ""}${m.mirroredPair ? " mirrored pair" : ""}`,
    `Version: ${m.version}`,
    m.notes,
  ].flatMap((line) =>
    line.split(/\r?\n/).flatMap((row) => row.match(/.{1,70}/gu) ?? [""]),
  );
}
export function sewingItemRole(piece: PatternPiece, item: SewingDrawing) {
  return item.role === "dimension"
    ? (piece.sewing?.marks.find((mark) => `${mark.id}-label` === item.id)
        ?.kind ?? "dart")
    : item.role;
}
type SewingBoundsOptions = SewingExportOptions & {
  text?: boolean;
  roleVisible?: (role: string) => boolean;
};
/** Conservative text bounds reserve one em per character without depending on DOM fonts. */
export function sewingExportBounds(
  doc: PatternDocument,
  ids: string[],
  options: SewingBoundsOptions,
) {
  const boundedDoc = { ...doc, pieces: { ...doc.pieces } };
  for (const id of ids) {
    const p = doc.pieces[id];
    boundedDoc.pieces[id] = {
      ...p,
      internalPaths: options.internal
        ? p.internalPaths.filter(
            (path) =>
              p.sewing?.paths[path.id]?.export !== false &&
              options.roleVisible?.(
                p.sewing?.paths[path.id]?.role ?? "construction",
              ) !== false,
          )
        : [],
    };
  }
  const bounds = pieceBounds(boundedDoc, ids);
  const include = (x: number, y: number, r = 0) => {
    bounds.min.x = Math.min(bounds.min.x, x - r);
    bounds.min.y = Math.min(bounds.min.y, y - r);
    bounds.max.x = Math.max(bounds.max.x, x + r);
    bounds.max.y = Math.max(bounds.max.y, y + r);
  };
  for (const id of ids) {
    const p = doc.pieces[id];
    if (options.marks) {
      for (const mark of p.sewing?.marks ?? []) {
        if (options.roleVisible?.(mark.kind) === false) continue;
        const m = resolvedMark(doc, p, mark);
        include(m.position.x, m.position.y, m.lengthMm / 2 + 4);
      }
      for (const notch of p.sewing?.notches ?? []) {
        if (options.roleVisible?.("notch") === false) continue;
        const n = notchPoint(doc, notch);
        include(n.position.x, n.position.y, notch.depthMm + 2);
      }
      for (const dart of p.sewing?.darts ?? []) {
        if (options.roleVisible?.("dart") === false) continue;
        for (const point of Object.values(dartPoints(dart))) {
          const world = applyTransform(p.transform, point);
          include(world.x, world.y);
        }
      }
      for (const item of sewingDrawing(doc, p))
        if (
          options.text !== false &&
          options.roleVisible?.(sewingItemRole(p, item)) !== false &&
          item.text &&
          item.x !== undefined &&
          item.y !== undefined
        ) {
          const font = item.fontSize ?? 3;
          for (const x of [0, item.text.length * font])
            for (const y of [-font, font]) {
              const p = transformMarkPoint(
                { x, y },
                { x: item.x, y: item.y },
                item.rotation ?? 0,
              );
              include(p.x, p.y);
            }
        }
    }
    if (options.metadata) {
      const base = pieceBounds(doc, [id]);
      metadataLines(p).forEach((line, i) => {
        include(base.min.x, base.max.y + 10 + i * 6 - 4);
        include(base.min.x + line.length * 4, base.max.y + 12 + i * 6);
      });
    }
  }
  return bounds;
}
