import { beforeEach, expect, it } from "vitest";
import { mergeLines } from "./mergeLines";
import { addPath, splitLine } from "./operations";
import { emptyDocument, parseProject } from "./schema";
import { createPieceFromEdge } from "./pieces";
import { attachInternalPath } from "./piecePathsEdit";
import { emptySewing } from "./sewingSchema";
import { commands } from "../editor/commands";
import { useEditor } from "../editor/store";
let sequence = 0;
const id = () => `merge-${++sequence}`;
beforeEach(() => {
  sequence = 0;
});
const chain = () =>
  addPath(
    emptyDocument("merge"),
    [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 60, y: 20 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
const rectangle = () => {
  const doc = addPath(
    emptyDocument("piece"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    id,
  );
  return createPieceFromEdge(doc, Object.keys(doc.segments)[0], "piece");
};
it("merges unordered and reversed lines, removes all interior points and preserves source", () => {
  const doc = chain(),
    ids = Object.keys(doc.segments);
  doc.segments[ids[1]] = {
    ...doc.segments[ids[1]],
    from: doc.segments[ids[1]].to,
    to: doc.segments[ids[1]].from,
  };
  const before = structuredClone(doc);
  const next = mergeLines(doc, [ids[2], ids[0], ids[1]]);
  expect(Object.keys(next.segments)).toEqual([ids[2]]);
  expect(Object.values(next.points)).toEqual([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
  expect(parseProject(JSON.stringify(next))).toEqual(next);
  expect(doc).toEqual(before);
});
it("merges two split edges in a piece and preserves outline, metadata and allowance", () => {
  let doc = rectangle();
  const edge = Object.keys(doc.segments)[0];
  doc.pieces.piece.seamAllowance = { widthMm: 5, join: "miter", miterLimit: 4 };
  doc = splitLine(doc, edge, 0.3, id);
  const second = Object.keys(doc.segments).at(-1)!;
  doc.pieces.piece.sewing = {
    ...emptySewing(),
    edges: {
      [edge]: { role: "hem", allowanceMm: 10 },
      [second]: { role: "hem", allowanceMm: 10 },
    },
  };
  const next = mergeLines(doc, [second, edge]);
  expect(next.pieces.piece.stitchingOutline).toHaveLength(4);
  expect(next.pieces.piece.rootSegmentId).toBe(second);
  expect(next.pieces.piece.sewing?.edges).toEqual({
    [second]: { role: "hem", allowanceMm: 10 },
  });
  expect(next.pieces.piece.metadata).toEqual(doc.pieces.piece.metadata);
  expect(next.pieces.piece.seamAllowance).toEqual(
    doc.pieces.piece.seamAllowance,
  );
});
it("merges an outline chain spanning its stored start", () => {
  let doc = rectangle();
  const last = Object.keys(doc.segments).at(-1)!;
  doc = splitLine(doc, last, 0.5, id);
  const added = Object.keys(doc.segments).at(-1)!;
  const refs = doc.pieces.piece.stitchingOutline;
  doc.pieces.piece.stitchingOutline = [...refs.slice(-1), ...refs.slice(0, -1)];
  expect(
    mergeLines(doc, [last, added]).pieces.piece.stitchingOutline,
  ).toHaveLength(4);
});
it("preserves internal path identity and its parent outline", () => {
  let doc = rectangle();
  const oldIds = new Set(Object.keys(doc.segments));
  doc = addPath(
    doc,
    [
      { x: 20, y: 20 },
      { x: 40, y: 20 },
      { x: 70, y: 20 },
    ],
    false,
    id,
  );
  const ids = Object.keys(doc.segments).filter((id) => !oldIds.has(id));
  doc = attachInternalPath(doc, "piece", ids, "internal");
  const next = mergeLines(doc, ids);
  expect(next.pieces.piece.internalPaths[0]).toEqual({
    id: "internal",
    closed: false,
    edges: [{ segmentId: ids[0], reversed: false }],
  });
  expect(next.pieces.piece.stitchingOutline).toEqual(
    doc.pieces.piece.stitchingOutline,
  );
});
it("refuses disconnected, closed, curved, branched and missing selections without mutation", () => {
  const doc = chain(),
    ids = Object.keys(doc.segments),
    before = structuredClone(doc);
  for (const selection of [[], [ids[0]], [ids[0], ids[2]], [ids[0], "missing"]])
    expect(() => mergeLines(doc, selection)).toThrow();
  expect(doc).toEqual(before);
  const closed = rectangle();
  expect(() => mergeLines(closed, Object.keys(closed.segments))).toThrow(
    /open chain/,
  );
  const curved = structuredClone(doc);
  curved.segments[ids[1]] = {
    ...curved.segments[ids[1]],
    kind: "cubic",
    control1: { x: 40, y: 0 },
    control2: { x: 50, y: 10 },
  };
  expect(() => mergeLines(curved, ids)).toThrow(/straight/);
  const branched = addPath(
    doc,
    [doc.points[doc.segments[ids[0]].to], { x: 30, y: 50 }],
    false,
    id,
  );
  expect(() => mergeLines(branched, ids)).toThrow(/junction/);
  expect(() => mergeLines(branched, Object.keys(branched.segments))).toThrow(
    /branches/,
  );
});
it("refuses locked/hidden pieces, conflicting allowances, attached notches and collapsed outlines", () => {
  let doc = rectangle();
  const edge = Object.keys(doc.segments)[0];
  doc = splitLine(doc, edge, 0.5, id);
  const ids = [edge, Object.keys(doc.segments).at(-1)!];
  for (const property of ["locked", "visible"] as const) {
    const locked = structuredClone(doc);
    locked.pieces.piece[property] = property === "locked";
    expect(() => mergeLines(locked, ids)).toThrow(/Locked or hidden/);
  }
  doc.pieces.piece.sewing = {
    ...emptySewing(),
    edges: { [edge]: { role: "hem" } },
  };
  expect(() => mergeLines(doc, ids)).toThrow(/matching/);
  doc.pieces.piece.sewing = {
    ...emptySewing(),
    notches: [
      { id: "n", segmentId: edge, fraction: 0.5, style: "single", depthMm: 3 },
    ],
  };
  expect(() => mergeLines(doc, ids)).toThrow(/notches/);
  const triangle = addPath(
    emptyDocument("triangle"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ],
    true,
    id,
  );
  expect(() =>
    mergeLines(triangle, Object.keys(triangle.segments).slice(0, 2)),
  ).toThrow();
});
it("commits one undo entry, selects the survivor and restores exact documents through undo/redo", () => {
  const doc = chain(),
    ids = Object.keys(doc.segments);
  useEditor.getState().load(doc);
  useEditor.setState({ selected: ids });
  commands.merge.run();
  const next = useEditor.getState().document;
  expect(useEditor.getState().past).toHaveLength(1);
  expect(useEditor.getState().selected).toEqual([ids[0]]);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(next);
});
it("failed merges and active previews preserve document and history", () => {
  const doc = chain(),
    ids = Object.keys(doc.segments);
  useEditor.getState().load(doc);
  useEditor.setState({ selected: [ids[0], ids[2]] });
  expect(() => commands.merge.run()).toThrow();
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().past).toHaveLength(0);
  useEditor.setState({ selected: ids, preview: doc });
  expect(commands.merge.enabled()).toBe(false);
  commands.merge.run();
  expect(useEditor.getState().past).toHaveLength(0);
});

it("rejects coincident outer endpoints without losing the chain", () => {
  const doc = chain(),
    ids = Object.keys(doc.segments);
  doc.points[doc.segments[ids.at(-1)!].to] = {
    ...doc.points[doc.segments[ids[0]].from],
  };
  const before = structuredClone(doc);
  expect(() => mergeLines(doc, ids)).toThrow(/distinct outer endpoints/);
  expect(doc).toEqual(before);
});
