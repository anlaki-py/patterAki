import { edgeAllowance } from "./sewing";
import { emptySewing } from "./sewingSchema";
import { asCubic } from "./segments";
import type { PatternDocument, PatternPiece } from "./schema";
import { offsetOutline } from "../geometry/offsets";
import {
  defaultSeamAllowance,
  seamAllowanceSchema,
  type SeamAllowance,
} from "./seamSchema";
export function cutOutline(doc: PatternDocument, piece: PatternPiece) {
  const settings = piece.seamAllowance ?? defaultSeamAllowance();
  return offsetOutline(
    piece.stitchingOutline.map((ref) => {
      const edge = doc.segments[ref.segmentId];
      const c = asCubic(doc, edge);
      return {
        curve: ref.reversed ? ([c[3], c[2], c[1], c[0]] as typeof c) : c,
        cubic: edge.kind === "cubic",
        width: edgeAllowance(piece, ref.segmentId, settings.widthMm),
      };
    }),
    settings,
  );
}
export function cutPath(doc: PatternDocument, piece: PatternPiece) {
  return (
    cutOutline(doc, piece)
      .map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`)
      .join(" ") + " Z"
  );
}
export function setSeamAllowance(
  doc: PatternDocument,
  id: string,
  settings: SeamAllowance,
  overrides?: Record<string, number | undefined>,
): PatternDocument {
  const piece = doc.pieces[id];
  if (!piece?.visible || piece.locked)
    throw new Error("Choose a visible, unlocked piece.");
  const parsed = seamAllowanceSchema.safeParse(settings);
  if (!parsed.success)
    throw new Error(
      "Enter a seam width from 0 to 1000 mm, a valid join, and a miter limit from 1 to 20.",
    );
  const next = { ...piece, seamAllowance: parsed.data };
  if (overrides && Object.keys(overrides).length) {
    next.sewing = structuredClone(piece.sewing ?? emptySewing());
    for (const [edgeId, width] of Object.entries(overrides)) {
      if (
        !piece.stitchingOutline.some((r) => r.segmentId === edgeId) ||
        (width !== undefined &&
          (!Number.isFinite(width) || width < 0 || width > 1000))
      )
        throw new Error("Invalid edge allowance.");
      const entry = {
        ...(next.sewing.edges[edgeId] ?? { role: "seam" as const }),
      };
      if (width === undefined) delete entry.allowanceMm;
      else entry.allowanceMm = width;
      next.sewing.edges[edgeId] = entry;
    }
  }
  cutOutline(doc, next);
  return { ...doc, pieces: { ...doc.pieces, [id]: next } };
}
export function seamIssue(doc: PatternDocument): string | null {
  for (const p of Object.values(doc.pieces)) {
    if (
      !p.seamAllowance &&
      !Object.values(p.sewing?.edges ?? {}).some((e) => e.allowanceMm)
    )
      continue;
    try {
      cutOutline(doc, p);
    } catch (error) {
      return `${p.name}: ${error instanceof Error ? error.message : "Cannot resolve cut outline."}`;
    }
  }
  return null;
}
