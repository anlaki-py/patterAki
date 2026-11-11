import { documentSchema, type PatternDocument } from "./schema";
import { pieceForEdge } from "./pieces";
import { itemEditable } from "./pieceAccess";
import type { OutlineEdge } from "./pieceTopology";

/** Attach a deliberately selected, unbranched loose path. No closed path is
 * inferred as a piece and all existing geometry/identities are retained. */
export function attachInternalPath(
  doc: PatternDocument,
  pieceId: string,
  edgeIds: string[],
  pathId: string,
): PatternDocument {
  const piece = doc.pieces[pieceId];
  if (!piece || !piece.visible || piece.locked)
    throw new Error("Choose a visible, unlocked parent piece.");
  const ids = [...new Set(edgeIds)];
  if (
    !ids.length ||
    ids.some(
      (id) =>
        !doc.segments[id] || pieceForEdge(doc, id) || !itemEditable(doc, id),
    )
  )
    throw new Error("Select loose edges to attach as an internal path.");
  const adjacency = new Map<string, string[]>();
  for (const id of ids)
    for (const pointId of [doc.segments[id].from, doc.segments[id].to])
      adjacency.set(pointId, [...(adjacency.get(pointId) ?? []), id]);
  const ends = [...adjacency]
    .filter(([, edges]) => edges.length === 1)
    .map(([id]) => id);
  if (
    [...adjacency.values()].some((edges) => edges.length > 2) ||
    (ends.length !== 0 && ends.length !== 2)
  )
    throw new Error("Internal paths must be connected and unbranched.");
  const closed = ends.length === 0;
  let current = ends[0] ?? doc.segments[ids[0]].from;
  const remaining = new Set(ids),
    edges: OutlineEdge[] = [];
  while (remaining.size) {
    const id = adjacency.get(current)?.find((edgeId) => remaining.has(edgeId));
    if (!id) throw new Error("Select one connected internal path.");
    const edge = doc.segments[id],
      reversed = edge.to === current;
    edges.push({ segmentId: id, reversed });
    remaining.delete(id);
    current = reversed ? edge.from : edge.to;
  }
  return documentSchema.parse({
    ...doc,
    pieces: {
      ...doc.pieces,
      [pieceId]: {
        ...piece,
        internalPaths: [...piece.internalPaths, { id: pathId, closed, edges }],
      },
    },
  });
}
