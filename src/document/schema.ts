import { referenceSchema } from "./referenceSchema";
import { validateSewing } from "./sewingValidation";
import {
  patternPieceSchema,
  defaultPieceMetadata,
  identityTransform,
} from "./pieceSchema";
import {
  connectedPath,
  orderedOutline,
  outlineArea,
  PIECE_AREA_TOLERANCE_MM2,
} from "./pieceTopology";
export { patternPieceSchema, type PatternPiece } from "./pieceSchema";
import { z } from "zod";
import { annotationInRange } from "./annotationGeometry";
import { annotationSchema } from "./annotationSchema";
import { constructionGuideSchema } from "./guideSchema";
import {
  validateContourSegments,
  type ContourSegment,
} from "../geometry/contourValidation";

const coordinate = z.number().finite().min(-1e7).max(1e7);
const point = z.object({ x: coordinate, y: coordinate }).strict();
const lineSegment = z
  .object({
    id: z.string().min(1),
    kind: z.literal("line"),
    from: z.string(),
    to: z.string(),
  })
  .strict();
const segment = z.discriminatedUnion("kind", [
  lineSegment,
  lineSegment.extend({
    kind: z.literal("cubic"),
    control1: point,
    control2: point,
  }),
]);

const legacyPieceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    rootSegmentId: z.string().min(1),
  })
  .strict();
const version2Base = z
  .object({
    schemaVersion: z.literal(2),
    id: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    points: z.record(z.string(), point),
    segments: z.record(z.string(), segment),
    unitsDisplay: z.enum(["mm", "cm", "in"]),
  })
  .strict();
function validateSegments(
  doc: Pick<z.infer<typeof version2Base>, "points" | "segments">,
  ctx: z.RefinementCtx,
) {
  for (const [id, edge] of Object.entries(doc.segments)) {
    const a = doc.points[edge.from],
      b = doc.points[edge.to];
    if (
      id !== edge.id ||
      !Object.hasOwn(doc.points, edge.from) ||
      !Object.hasOwn(doc.points, edge.to) ||
      !a ||
      !b ||
      Math.hypot(a.x - b.x, a.y - b.y) < 1e-9
    )
      ctx.addIssue({
        code: "custom",
        message: `Invalid endpoints for segment ${id}`,
      });
  }
}
const version2Schema = version2Base.superRefine(validateSegments);
const version1Schema = z
  .object({
    ...version2Schema.shape,
    schemaVersion: z.literal(1),
    segments: z.record(z.string(), lineSegment),
  })
  .strict();
const version3Schema = z
  .object({
    ...version2Base.shape,
    schemaVersion: z.literal(3),
    annotations: z.record(z.string(), annotationSchema),
  })
  .strict()
  .superRefine(validateSegments)
  .superRefine((doc, ctx) => {
    for (const [id, mark] of Object.entries(doc.annotations)) {
      if (
        id !== mark.id ||
        Object.hasOwn(doc.segments, id) ||
        !annotationInRange(mark)
      )
        ctx.addIssue({
          code: "custom",
          message: `Invalid or duplicate annotation ID ${id}`,
        });
    }
  });
const version4Schema = z
  .object({
    ...version2Base.shape,
    schemaVersion: z.literal(4),
    annotations: z.record(z.string(), annotationSchema),
    guides: z.record(z.string(), constructionGuideSchema),
  })
  .strict()
  .superRefine(validateSegments)
  .superRefine((doc, ctx) => {
    for (const [id, mark] of Object.entries(doc.annotations)) {
      if (
        id !== mark.id ||
        Object.hasOwn(doc.segments, id) ||
        !annotationInRange(mark)
      )
        ctx.addIssue({
          code: "custom",
          message: `Invalid or duplicate annotation ID ${id}`,
        });
    }
    for (const [id, guide] of Object.entries(doc.guides)) {
      if (
        id !== guide.id ||
        Object.hasOwn(doc.segments, id) ||
        Object.hasOwn(doc.annotations, id)
      )
        ctx.addIssue({
          code: "custom",
          message: `Invalid or duplicate guide ID ${id}`,
        });
    }
  });
/** Resolve a simple closed component without referring to the current schema type.
 *  This keeps schema inference acyclic and makes malformed imports safe. */
function pieceCycle(
  doc: Pick<z.infer<typeof version2Base>, "points" | "segments">,
  root: string,
): string[] | null {
  if (!doc.segments[root]) return null;
  const adjacent = new Map<string, string[]>();
  for (const edge of Object.values(doc.segments)) {
    for (const pointId of [edge.from, edge.to])
      adjacent.set(pointId, [...(adjacent.get(pointId) ?? []), edge.id]);
  }
  const members = new Set<string>();
  const visit = [root];
  while (visit.length) {
    const id = visit.pop()!;
    if (members.has(id)) continue;
    const edge = doc.segments[id];
    if (!edge || !doc.points[edge.from] || !doc.points[edge.to]) return null;
    members.add(id);
    for (const pointId of [edge.from, edge.to]) {
      const neighbours = adjacent.get(pointId) ?? [];
      if (neighbours.length !== 2) return null;
      for (const next of neighbours) if (!members.has(next)) visit.push(next);
    }
  }
  if (members.size < 3) return null;
  const first = doc.segments[root];
  const startPoint = first.from;
  const ordered: string[] = [];
  let pointId = startPoint;
  let previous: string | null = null;
  do {
    const next = (adjacent.get(pointId) ?? []).find(
      (id) => id !== previous && !ordered.includes(id),
    );
    if (!next) return null;
    ordered.push(next);
    const edge = doc.segments[next];
    pointId = edge.from === pointId ? edge.to : edge.from;
    previous = next;
    if (ordered.length > members.size) return null;
  } while (pointId !== startPoint);
  return ordered.length === members.size ? ordered : null;
}
function validPieceContour(
  doc: Pick<z.infer<typeof version2Base>, "points" | "segments">,
  ids: string[],
) {
  const segments: ContourSegment[] = ids.map((id) => {
    const edge = doc.segments[id];
    const a = doc.points[edge.from],
      b = doc.points[edge.to];
    return edge.kind === "cubic"
      ? {
          id,
          kind: "cubic",
          a,
          b,
          control1: edge.control1,
          control2: edge.control2,
        }
      : { id, kind: "line", a, b };
  });
  return validateContourSegments(segments).valid;
}
function validateCurrentDocument(
  doc: Omit<z.infer<typeof version4Schema>, "schemaVersion"> & {
    pieces: Record<string, z.infer<typeof legacyPieceSchema>>;
  },
  ctx: z.RefinementCtx,
) {
  validateSegments(doc, ctx);
  for (const [id, mark] of Object.entries(doc.annotations)) {
    if (
      id !== mark.id ||
      Object.hasOwn(doc.segments, id) ||
      !annotationInRange(mark)
    )
      ctx.addIssue({
        code: "custom",
        message: `Invalid or duplicate annotation ID ${id}`,
      });
  }
  for (const [id, guide] of Object.entries(doc.guides)) {
    if (
      id !== guide.id ||
      Object.hasOwn(doc.segments, id) ||
      Object.hasOwn(doc.annotations, id)
    )
      ctx.addIssue({
        code: "custom",
        message: `Invalid or duplicate guide ID ${id}`,
      });
  }
  const owned = new Set<string>();
  for (const [id, piece] of Object.entries(doc.pieces)) {
    const cycle = pieceCycle(doc, piece.rootSegmentId);
    if (
      id !== piece.id ||
      Object.hasOwn(doc.segments, id) ||
      Object.hasOwn(doc.annotations, id) ||
      Object.hasOwn(doc.guides, id) ||
      !cycle ||
      !validPieceContour(doc, cycle) ||
      cycle.some((edgeId) => owned.has(edgeId))
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid or overlapping pattern piece ${id}`,
      });
      continue;
    }
    cycle.forEach((edgeId) => owned.add(edgeId));
  }
}
const version5Schema = z
  .object({
    ...version4Schema.shape,
    schemaVersion: z.literal(5),
    pieces: z.record(z.string(), legacyPieceSchema),
  })
  .strict()
  .superRefine(validateCurrentDocument);

export const pointModeSchema = z.enum(["corner", "smooth", "symmetric"]);
const version6Schema = z
  .object({
    ...version5Schema.shape,
    schemaVersion: z.literal(6),
    points: z.record(
      z.string(),
      point.extend({ mode: pointModeSchema.optional() }),
    ),
  })
  .strict()
  .superRefine(validateCurrentDocument);

const version7Schema = z
  .object({
    ...version6Schema.shape,
    schemaVersion: z.literal(7),
    pieces: z.record(
      z.string(),
      patternPieceSchema.omit({ sewing: true, seamAllowance: true }),
    ),
  })
  .strict()
  .superRefine((doc, ctx) => {
    // Legacy validation owns annotations and guides; explicit outlines below own topology.
    validateCurrentDocument({ ...doc, pieces: {} }, ctx);
    const owned = new Set<string>();
    const pathIds = new Set<string>();
    for (const [id, piece] of Object.entries(doc.pieces)) {
      const outline = piece.stitchingOutline;
      const paths = [outline, ...piece.internalPaths.map((path) => path.edges)];
      const refs = paths.flat();
      const ids = refs.map((ref) => ref.segmentId);
      let valid: boolean =
        id === piece.id &&
        !doc.points[id] &&
        !doc.segments[id] &&
        !doc.annotations[id] &&
        !doc.guides[id] &&
        outline.some((ref) => ref.segmentId === piece.rootSegmentId) &&
        connectedPath(doc, outline, true) &&
        new Set(ids).size === ids.length &&
        ids.every(
          (edgeId) =>
            !owned.has(edgeId) &&
            Object.hasOwn(doc.segments, edgeId) &&
            !!doc.points[doc.segments[edgeId].from] &&
            !!doc.points[doc.segments[edgeId].to],
        );
      if (valid) {
        const pointIds = outline.map((ref) => {
          const e = doc.segments[ref.segmentId];
          return ref.reversed ? e.to : e.from;
        });
        valid =
          new Set(pointIds).size === pointIds.length &&
          outlineArea(doc, outline) > PIECE_AREA_TOLERANCE_MM2 &&
          validPieceContour(
            doc,
            outline.map((ref) => ref.segmentId),
          );
        // Piece points cannot also belong to unowned geometry: transforming a piece must never tear a neighbour.
        const members = new Set(ids);
        const points = new Set(
          ids.flatMap((edgeId) => [
            doc.segments[edgeId].from,
            doc.segments[edgeId].to,
          ]),
        );
        valid =
          valid &&
          Object.values(doc.segments).every(
            (edge) =>
              members.has(edge.id) ||
              (!points.has(edge.from) && !points.has(edge.to)),
          );
      }
      for (const path of piece.internalPaths) {
        valid =
          valid &&
          !pathIds.has(path.id) &&
          !doc.points[path.id] &&
          !doc.segments[path.id] &&
          !doc.pieces[path.id] &&
          !doc.annotations[path.id] &&
          !doc.guides[path.id] &&
          connectedPath(doc, path.edges, path.closed);
        pathIds.add(path.id);
      }
      if (!valid)
        ctx.addIssue({
          code: "custom",
          message: `Invalid topology, winding or identity for pattern piece ${id}`,
        });
      ids.forEach((edgeId) => owned.add(edgeId));
    }
  });

const version8Schema = z
  .object({
    ...version7Schema.shape,
    schemaVersion: z.literal(8),
    pieces: z.record(
      z.string(),
      patternPieceSchema.omit({ seamAllowance: true }),
    ),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const topology = version7Schema.safeParse({
      ...doc,
      schemaVersion: 7,
      pieces: Object.fromEntries(
        Object.entries(doc.pieces).map(([id, p]) => {
          const { sewing: _sewing, ...rest } = p;
          void _sewing;
          return [id, rest];
        }),
      ),
    });
    if (!topology.success)
      for (const issue of topology.error.issues)
        ctx.addIssue({ code: "custom", message: issue.message });
    validateSewing(doc, ctx);
  });

const version9Schema = z
  .object({
    ...version8Schema.shape,
    schemaVersion: z.literal(9),
    pieces: z.record(z.string(), patternPieceSchema),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const legacy = version8Schema.safeParse({
      ...doc,
      schemaVersion: 8,
      pieces: Object.fromEntries(
        Object.entries(doc.pieces).map(([id, p]) => {
          const { seamAllowance: _seam, ...rest } = p;
          void _seam;
          return [id, rest];
        }),
      ),
    });
    if (!legacy.success)
      for (const issue of legacy.error.issues)
        ctx.addIssue({ code: "custom", message: issue.message });
  });

const currentSchema = z
  .object({
    ...version9Schema.shape,
    schemaVersion: z.literal(10),
    references: z.record(z.string(), referenceSchema).optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const { references, ...rest } = doc;
    const legacy = version9Schema.safeParse({ ...rest, schemaVersion: 9 });
    if (!legacy.success)
      for (const issue of legacy.error.issues)
        ctx.addIssue({ code: "custom", message: issue.message });
    if (Object.keys(references ?? {}).length > 100)
      ctx.addIssue({
        code: "custom",
        message: "A project supports up to 100 reference layers.",
      });
    for (const [id, ref] of Object.entries(references ?? {}))
      if (
        id !== ref.id ||
        doc.points[id] ||
        doc.segments[id] ||
        doc.pieces[id] ||
        doc.annotations[id] ||
        doc.guides[id]
      )
        ctx.addIssue({
          code: "custom",
          message: "Reference identity mismatch.",
        });
  });

// Validate each historical representation before migration: malformed v1–v4
// must not be silently accepted, and newer unknown versions are rejected.
export const documentSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || !("schemaVersion" in input))
    return input;
  let candidate = input as Record<string, unknown>;
  if (candidate.schemaVersion === 1) {
    const legacy = version1Schema.safeParse(candidate);
    if (!legacy.success) return input;
    candidate = { ...legacy.data, schemaVersion: 2 };
  }
  if (candidate.schemaVersion === 2) {
    const legacy = version2Schema.safeParse(candidate);
    if (!legacy.success) return input;
    candidate = { ...legacy.data, schemaVersion: 3, annotations: {} };
  }
  if (candidate.schemaVersion === 3) {
    const legacy = version3Schema.safeParse(candidate);
    if (!legacy.success) return input;
    candidate = { ...legacy.data, schemaVersion: 4, guides: {} };
  }
  if (candidate.schemaVersion === 4) {
    // A relabelled v5 document is not a valid v4 import: never drop piece data.
    if (Object.hasOwn(candidate, "pieces")) return input;
    const legacy = version4Schema.safeParse(candidate);
    if (!legacy.success) return input;
    candidate = { ...legacy.data, schemaVersion: 5, pieces: {} };
  }
  if (candidate.schemaVersion === 5) {
    const legacy = version5Schema.safeParse(candidate);
    if (!legacy.success) return input;
    candidate = { ...legacy.data, schemaVersion: 6 };
  }
  if (candidate.schemaVersion === 6) {
    const legacy = version6Schema.safeParse(candidate);
    if (!legacy.success) return input;
    let pieces;
    try {
      pieces = Object.fromEntries(
        Object.entries(legacy.data.pieces).map(([id, piece]) => {
          const cycle = pieceCycle(legacy.data, piece.rootSegmentId)!;
          return [
            id,
            {
              ...piece,
              version: 1,
              stitchingOutline: orderedOutline(legacy.data, cycle),
              internalPaths: [],
              transform: identityTransform(),
              metadata: defaultPieceMetadata(),
              locked: false,
              visible: true,
            },
          ];
        }),
      );
    } catch {
      return input;
    }
    candidate = { ...legacy.data, schemaVersion: 7, pieces };
  }
  if (candidate.schemaVersion === 7) {
    const legacy = version7Schema.safeParse(candidate);
    if (!legacy.success) return input;
    candidate = { ...legacy.data, schemaVersion: 8 };
  }
  if (candidate.schemaVersion === 8) {
    const legacy = version8Schema.safeParse(candidate);
    if (!legacy.success) return input;
    candidate = { ...legacy.data, schemaVersion: 9 };
  }
  if (candidate.schemaVersion === 9) {
    const legacy = version9Schema.safeParse(candidate);
    if (!legacy.success) return input;
    candidate = { ...legacy.data, schemaVersion: 10 };
  }
  return candidate;
}, currentSchema);
export type PatternDocument = z.infer<typeof documentSchema>;
export const emptyDocument = (id: string): PatternDocument => ({
  schemaVersion: 10,
  annotations: {},
  guides: {},
  pieces: {},
  id,
  name: "Untitled pattern",
  points: {},
  segments: {},
  unitsDisplay: "cm",
});
export function parseProject(text: string): PatternDocument {
  if (text.length > 10_000_000)
    throw new Error("Project exceeds the 10 MB import limit.");
  return documentSchema.parse(JSON.parse(text));
}
export const unitFactor = { mm: 1, cm: 10, in: 25.4 };
export function formatLength(
  mm: number,
  units: PatternDocument["unitsDisplay"],
): string {
  return `${Number((mm / unitFactor[units]).toFixed(2))} ${units}`;
}
