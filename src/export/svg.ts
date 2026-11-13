import {
  drawingSegments,
  drawingAnnotations,
  emptyExportBounds,
  includeExportBounds,
  type DrawingItems,
} from "./drawingScope";
import { sewingExportBounds, metadataLines } from "./sewingBounds";
import type { PatternDocument } from "../document/schema";
import { segmentPath } from "../document/segments";
import { pieceBounds } from "../document/pieceTransforms";
import { roleDash, sewingDrawing } from "../document/sewingDrawing";
import { escapeXml as escape } from "./xml";
import { exportAnnotation } from "./annotations";
import { cutOutline } from "../document/seamAllowance";
import { documentSchema } from "../document/schema";
export type SewingExportOptions = {
  internal: boolean;
  marks: boolean;
  metadata: boolean;
};
export type SvgExportOptions = SewingExportOptions & {
  cut: boolean;
  stitch: boolean;
  /** Include all free marks; drawing scopes can also specify individual mark IDs. */
  annotations: boolean;
  drawing?: DrawingItems;
};
export function exportSvg(
  doc: PatternDocument,
  pieceIds: string[],
  options: SvgExportOptions,
) {
  if (!documentSchema.safeParse(doc).success)
    throw new Error("Cannot export an invalid pattern document.");
  if (pieceIds.some((id) => !doc.pieces[id]))
    throw new Error("An export piece no longer exists.");
  const loose = drawingSegments(doc, options.drawing);
  if (!(
    options.cut ||
    options.stitch ||
    options.internal ||
    options.marks ||
    options.metadata ||
    loose.length
  ))
    throw new Error("Choose at least one export layer.");
  const ids = [...new Set(pieceIds)].filter((id) => doc.pieces[id].visible);
  const bounds = ids.length
      ? sewingExportBounds(doc, ids, options)
      : emptyExportBounds(),
    margin = 10;
  const cuts = new Map<string, ReturnType<typeof cutOutline>>();
  if (options.cut)
    for (const id of ids) {
      try {
        const points = cutOutline(doc, doc.pieces[id]);
        cuts.set(id, points);
        for (const p of points) {
          bounds.min.x = Math.min(bounds.min.x, p.x);
          bounds.min.y = Math.min(bounds.min.y, p.y);
          bounds.max.x = Math.max(bounds.max.x, p.x);
          bounds.max.y = Math.max(bounds.max.y, p.y);
        }
      } catch (cause) {
        throw new Error(
          `Cannot export cut outline for "${doc.pieces[id].name}": ${cause instanceof Error ? cause.message : "Offset failed."}`,
          { cause },
        );
      }
    }
  const annotations = options.marks
    ? drawingAnnotations(doc, options.annotations, options.drawing).map(
        exportAnnotation,
      )
    : [];
  if (!ids.length && !loose.length && !annotations.length)
    throw new Error("The selected export layers contain no drawing geometry.");
  for (const item of loose) includeExportBounds(bounds, item.bounds);
  for (const item of annotations) includeExportBounds(bounds, item.bounds);
  const x = bounds.min.x - margin,
    y = bounds.min.y - margin,
    width = bounds.max.x - bounds.min.x + 2 * margin,
    height = bounds.max.y - bounds.min.y + 2 * margin;
  const body = ids
    .map((id) => {
      const p = doc.pieces[id];
      // Style each canonical stitch edge once, so a solid underlay cannot fill fold/hem dashes.
      let result = `<g data-piece="${escape(p.id)}">`;
      const cut = cuts.get(id);
      if (cut)
        result += `<g data-layer="cut"><path d="${cut.map((point, i) => `${i ? "L" : "M"} ${point.x} ${point.y}`).join(" ")} Z"/></g>`;
      if (options.stitch) {
        result += `<g data-layer="stitch" data-role="stitch-outline">`;
        for (const ref of p.stitchingOutline) {
          const role = p.sewing?.edges[ref.segmentId]?.role ?? "seam";
          result += `<path data-role="${role}" stroke-dasharray="${roleDash(role) ?? "none"}" d="${segmentPath(doc, doc.segments[ref.segmentId])}"/>`;
        }
        result += "</g>";
      }
      if (options.internal) {
        result += `<g data-layer="internal">`;
        for (const path of p.internalPaths) {
          const setting = p.sewing?.paths[path.id];
          if (setting?.export === false) continue;
          const role = setting?.role ?? "construction";
          for (const edge of path.edges)
            result += `<path data-role="${role}" stroke-dasharray="${roleDash(role) ?? "none"}" d="${segmentPath(doc, doc.segments[edge.segmentId])}"/>`;
        }
        result += "</g>";
      }
      if (options.marks) {
        result += `<g data-layer="marks">`;
        for (const item of sewingDrawing(doc, p))
          result += item.path
            ? `<path data-role="${item.role}" d="${item.path}" stroke-dasharray="${roleDash(item.role) ?? "none"}"/>`
            : `<text x="${item.x}" y="${item.y}" font-size="${item.fontSize ?? 3}">${escape(item.text!)}</text>`;
        result += "</g>";
      }
      if (options.metadata) {
        result += `<g data-layer="metadata">`;
        const lines = metadataLines(p);
        const base = pieceBounds(doc, [p.id]);
        lines.forEach((line, i) => {
          result += `<text font-size="4" x="${base.min.x}" y="${base.max.y + 10 + i * 6}">${escape(line)}</text>`;
        });
        result += "</g>";
      }
      return result + "</g>";
    })
    .join("");
  const drawing = loose.length
    ? `<g data-layer="drawing">${loose.map(({ edge }) => `<path data-segment="${escape(edge.id)}" d="${segmentPath(doc, edge)}"/>`).join("")}</g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${x} ${y} ${width} ${height}"><g fill="none" stroke="black" stroke-width="0.35">${body}${drawing}${annotations.length ? `<g data-layer="annotations">${annotations.map((item) => item.svg).join("")}</g>` : ""}</g><style>text{fill:black;stroke:none;font-family:sans-serif}</style></svg>`;
}

/** Existing per-piece sewing drawing uses the same canonical vector exporter. */
export function exportSewingSvg(
  doc: PatternDocument,
  pieceIds: string[],
  options: SewingExportOptions,
) {
  return exportSvg(doc, pieceIds, {
    ...options,
    cut: false,
    stitch: true,
    annotations: false,
  });
}
