import { sewingExportBounds, metadataLines } from "./sewingBounds";
import type { PatternDocument } from "../document/schema";
import { segmentPath } from "../document/segments";
import { pieceBounds } from "../document/pieceTransforms";
import { roleDash, sewingDrawing } from "../document/sewingDrawing";
const escape = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export type SewingExportOptions = {
  internal: boolean;
  marks: boolean;
  metadata: boolean;
};
/** Physical vector sewing drawing. Offset cut contours are provided by the M3 engine. */
export function exportSewingSvg(
  doc: PatternDocument,
  pieceIds: string[],
  options: SewingExportOptions,
) {
  const ids = pieceIds.filter((id) => doc.pieces[id]?.visible),
    bounds = sewingExportBounds(doc, ids, options),
    margin = 10;
  const x = bounds.min.x - margin,
    y = bounds.min.y - margin,
    width = bounds.max.x - bounds.min.x + 2 * margin,
    height = bounds.max.y - bounds.min.y + 2 * margin;
  const body = ids
    .map((id) => {
      const p = doc.pieces[id];
      // Style each canonical stitch edge once, so a solid underlay cannot fill fold/hem dashes.
      let result = `<g data-piece="${escape(p.id)}"><g data-role="stitch-outline">`;
      for (const ref of p.stitchingOutline) {
        const role = p.sewing?.edges[ref.segmentId]?.role ?? "seam";
        result += `<path data-role="${role}" stroke-dasharray="${roleDash(role) ?? "none"}" d="${segmentPath(doc, doc.segments[ref.segmentId])}"/>`;
      }
      result += "</g>";
      if (options.internal)
        for (const path of p.internalPaths) {
          const setting = p.sewing?.paths[path.id];
          if (setting?.export === false) continue;
          const role = setting?.role ?? "construction";
          for (const edge of path.edges)
            result += `<path data-role="${role}" stroke-dasharray="${roleDash(role) ?? "none"}" d="${segmentPath(doc, doc.segments[edge.segmentId])}"/>`;
        }
      if (options.marks)
        for (const item of sewingDrawing(doc, p))
          result += item.path
            ? `<path data-role="${item.role}" d="${item.path}" stroke-dasharray="${roleDash(item.role) ?? "none"}"/>`
            : `<text x="${item.x}" y="${item.y}" font-size="${item.fontSize ?? 3}">${escape(item.text!)}</text>`;
      if (options.metadata) {
        const lines = metadataLines(p);
        const base = pieceBounds(doc, [p.id]);
        lines.forEach((line, i) => {
          result += `<text font-size="4" x="${base.min.x}" y="${base.max.y + 10 + i * 6}">${escape(line)}</text>`;
        });
      }
      return result + "</g>";
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${x} ${y} ${width} ${height}"><g fill="none" stroke="black" stroke-width="0.35">${body}</g><style>text{fill:black;stroke:none;font-family:sans-serif}</style></svg>`;
}
