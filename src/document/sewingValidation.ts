import type { z } from "zod";
import type { PatternPiece } from "./pieceSchema";
type SewingDocument = {
  points: Record<string, unknown>;
  segments: Record<string, unknown>;
  annotations: Record<string, unknown>;
  guides: Record<string, unknown>;
  pieces: Record<string, PatternPiece>;
};
export function validateSewing(doc: SewingDocument, ctx: z.RefinementCtx) {
  const used = new Set([
    ...Object.keys(doc.points),
    ...Object.keys(doc.segments),
    ...Object.keys(doc.annotations),
    ...Object.keys(doc.guides),
    ...Object.keys(doc.pieces),
    ...Object.values(doc.pieces).flatMap((p) =>
      p.internalPaths.map((x) => x.id),
    ),
  ]);
  for (const piece of Object.values(doc.pieces)) {
    const sewing = piece.sewing;
    if (!sewing) continue;
    const outline = new Set(piece.stitchingOutline.map((e) => e.segmentId));
    const paths = new Set(piece.internalPaths.map((p) => p.id));
    if (
      Object.keys(sewing.edges).some((id) => !outline.has(id)) ||
      Object.keys(sewing.paths).some((id) => !paths.has(id)) ||
      sewing.notches.some((n) => !outline.has(n.segmentId)) ||
      sewing.marks.some((m) => m.segmentId && !outline.has(m.segmentId))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Sewing attachment must reference its parent outline or internal path.",
      });
    for (const item of [...sewing.notches, ...sewing.marks, ...sewing.darts]) {
      if (used.has(item.id))
        ctx.addIssue({
          code: "custom",
          message: "Duplicate sewing record ID.",
        });
      used.add(item.id);
    }
  }
}
