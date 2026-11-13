import { distance } from "../geometry/line";
import { assertValidDocumentEdit } from "./contourValidation";
import { itemEditable, itemVisible } from "./pieceAccess";
import type { OutlineEdge } from "./pieceTopology";
import { documentSchema, type PatternDocument } from "./schema";

/** Replace an open chain with its endpoint chord. Refuse to erase attached geometry. */
export function mergeLines(
  doc: PatternDocument,
  edgeIds: string[],
): PatternDocument {
  const ids = new Set(edgeIds);
  if (ids.size < 2)
    throw new Error("Select at least two connected straight lines.");
  const adjacent = new Map<string, string[]>();
  for (const id of ids) {
    const edge = doc.segments[id];
    if (!edge || edge.kind !== "line")
      throw new Error("Select only straight lines to merge.");
    if (!itemEditable(doc, id) || !itemVisible(doc, id))
      throw new Error("Locked or hidden lines cannot be merged.");
    for (const point of [edge.from, edge.to])
      adjacent.set(point, [...(adjacent.get(point) ?? []), id]);
  }
  const ends = [...adjacent.keys()].filter(
    (p) => adjacent.get(p)!.length === 1,
  );
  if (
    ends.length !== 2 ||
    [...adjacent.values()].some((edges) => edges.length > 2)
  )
    throw new Error("Select one connected, open chain without branches.");
  const remaining = new Set(ids);
  let current = ends[0];
  while (remaining.size) {
    const id = adjacent.get(current)?.find((id) => remaining.has(id));
    if (!id) throw new Error("Select one connected chain of lines.");
    remaining.delete(id);
    const edge = doc.segments[id];
    current = edge.from === current ? edge.to : edge.from;
  }
  if (distance(doc.points[ends[0]], doc.points[ends[1]]) <= 1e-9)
    throw new Error("The merged line must have distinct outer endpoints.");
  const interior = new Set(
    [...adjacent.keys()].filter((p) => !ends.includes(p)),
  );
  if (
    Object.values(doc.segments).some(
      (edge) =>
        !ids.has(edge.id) && (interior.has(edge.from) || interior.has(edge.to)),
    )
  )
    throw new Error(
      "An intermediate point connects to another edge. Keep that junction.",
    );

  const survivor = edgeIds[0];
  const merged = {
    id: survivor,
    kind: "line" as const,
    from: ends[0],
    to: ends[1],
  };
  // Rotate closed paths to an unselected edge so a chain crossing the array boundary stays contiguous.
  const replaceRefs = (refs: OutlineEdge[], closed: boolean): OutlineEdge[] => {
    const selected = refs.filter((ref) => ids.has(ref.segmentId));
    if (!selected.length) return refs;
    if (selected.length !== ids.size)
      throw new Error("Merge lines from the same outline or internal path.");
    let ordered = refs;
    if (closed) {
      const start = refs.findIndex((ref) => !ids.has(ref.segmentId));
      if (start < 0)
        throw new Error("A closed path cannot be replaced by one line.");
      ordered = [...refs.slice(start), ...refs.slice(0, start)];
    }
    const first = ordered.find((ref) => ids.has(ref.segmentId))!;
    const edge = doc.segments[first.segmentId];
    const startPoint = first.reversed ? edge.to : edge.from;
    let inserted = false;
    return ordered.flatMap((ref) => {
      if (!ids.has(ref.segmentId)) return [ref];
      if (inserted) return [];
      inserted = true;
      return [{ segmentId: survivor, reversed: startPoint !== merged.from }];
    });
  };
  const pieces = Object.fromEntries(
    Object.entries(doc.pieces).map(([id, piece]) => {
      const stitchingOutline = replaceRefs(piece.stitchingOutline, true);
      const internalPaths = piece.internalPaths.map((path) => ({
        ...path,
        edges: replaceRefs(path.edges, path.closed),
      }));
      const sewing = piece.sewing;
      if (sewing) {
        if (
          sewing.notches.some((n) => ids.has(n.segmentId)) ||
          sewing.marks.some((m) => m.segmentId && ids.has(m.segmentId))
        )
          throw new Error(
            "Remove or move attached notches and fold marks before merging these lines.",
          );
        const settings = [...ids].map((edgeId) => sewing.edges[edgeId]);
        if (
          settings.some(
            (s) =>
              s?.role !== settings[0]?.role ||
              s?.allowanceMm !== settings[0]?.allowanceMm,
          )
        )
          throw new Error(
            "Lines must have matching sewing roles and allowances to merge.",
          );
      }
      return [
        id,
        {
          ...piece,
          stitchingOutline,
          internalPaths,
          rootSegmentId: ids.has(piece.rootSegmentId)
            ? survivor
            : piece.rootSegmentId,
          ...(sewing
            ? {
                sewing: {
                  ...sewing,
                  edges: Object.fromEntries(
                    Object.entries(sewing.edges).filter(
                      ([edgeId]) => !ids.has(edgeId) || edgeId === survivor,
                    ),
                  ),
                },
              }
            : {}),
        },
      ];
    }),
  );
  const next = documentSchema.parse({
    ...doc,
    pieces,
    points: Object.fromEntries(
      Object.entries(doc.points).filter(([id]) => !interior.has(id)),
    ),
    segments: {
      ...Object.fromEntries(
        Object.entries(doc.segments).filter(([id]) => !ids.has(id)),
      ),
      [survivor]: merged,
    },
  });
  return assertValidDocumentEdit(doc, next);
}
