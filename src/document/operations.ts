import { itemEditable, pieceForItem } from "./pieceAccess";
import { cubicLength } from "../geometry/bezier";
import { asCubic } from "./segments";
import { splitCubic } from "../geometry/bezier";
import { moveVertex } from "./curves";
import {
  distance,
  lerp,
  resizeLine,
  type Anchor,
  type Vec2,
} from "../geometry/line";
import type { PatternDocument } from "./schema";
import { withSplitPieceEdge, withoutBrokenPieces } from "./pieces";
import {
  formatContourIssues,
  validateClosedPositions,
} from "../geometry/contourValidation";
type IdFactory = () => string;
export function addPath(
  doc: PatternDocument,
  positions: Vec2[],
  closed: boolean,
  id: IdFactory,
): PatternDocument {
  if (positions.length < 2) throw new Error("A path needs two points.");
  if (closed) {
    const check = validateClosedPositions(positions);
    if (!check.valid) throw new Error(formatContourIssues(check));
  }
  const next = structuredClone(doc);
  const ids = positions.map((p) => {
    const existing = Object.keys(next.points).find(
      (key) => !pieceForItem(next, key) && distance(next.points[key], p) < 1e-9,
    );
    const key = existing ?? id();
    next.points[key] = { ...p };
    return key;
  });
  for (let i = 0; i < ids.length - (closed ? 0 : 1); i++) {
    const from = ids[i],
      to = ids[(i + 1) % ids.length];
    if (from === to) throw new Error("A line must have positive length.");
    const key = id();
    next.segments[key] = { id: key, kind: "line", from, to };
  }
  return next;
}
export function changeLength(
  doc: PatternDocument,
  id: string,
  length: number,
  anchor: Anchor,
): PatternDocument {
  const edge = doc.segments[id];
  if (edge.kind !== "line")
    throw new Error(
      "Arc length cannot be set by moving endpoints. Use curve handles.",
    );
  const [a, b] = resizeLine(
    doc.points[edge.from],
    doc.points[edge.to],
    length,
    anchor,
  );
  return moveVertex(moveVertex(doc, edge.from, a), edge.to, b);
}
export function splitLine(
  doc: PatternDocument,
  id: string,
  t: number,
  createId: IdFactory,
): PatternDocument {
  if (!Number.isFinite(t) || t <= 0 || t >= 1)
    throw new Error("Split position must be inside the line.");
  if (!itemEditable(doc, id))
    throw new Error("Locked or hidden pieces cannot be split.");
  const edge = doc.segments[id],
    pointId = createId(),
    edgeId = createId();
  if (edge.kind === "cubic") {
    const [left, right] = splitCubic(asCubic(doc, edge), t);
    return withSplitPieceEdge(
      {
        ...doc,
        points: { ...doc.points, [pointId]: left[3] },
        segments: {
          ...doc.segments,
          [id]: { ...edge, to: pointId, control1: left[1], control2: left[2] },
          [edgeId]: {
            ...edge,
            id: edgeId,
            from: pointId,
            control1: right[1],
            control2: right[2],
          },
        },
      },
      id,
      edgeId,
      cubicLength(left) / (cubicLength(left) + cubicLength(right)),
    );
  }

  return withSplitPieceEdge(
    {
      ...doc,
      points: {
        ...doc.points,
        [pointId]: lerp(doc.points[edge.from], doc.points[edge.to], t),
      },
      segments: {
        ...doc.segments,
        [id]: { ...edge, to: pointId },
        [edgeId]: { ...edge, id: edgeId, from: pointId },
      },
    },
    id,
    edgeId,
    t,
  );
}
export function deleteSegments(
  doc: PatternDocument,
  ids: string[],
): PatternDocument {
  if (ids.some((id) => !itemEditable(doc, id)))
    throw new Error("Locked or hidden pieces cannot be deleted.");
  const segments = { ...doc.segments };
  for (const id of ids) delete segments[id];
  const used = new Set(
    Object.values(segments).flatMap((edge) => [edge.from, edge.to]),
  );
  return withoutBrokenPieces({
    ...doc,
    segments,
    points: Object.fromEntries(
      Object.entries(doc.points).filter(([key]) => used.has(key)),
    ),
  });
}
