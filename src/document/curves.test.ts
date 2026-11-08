import { beforeEach, expect, it } from "vitest";
import { emptyDocument, parseProject, documentSchema } from "./schema";
import { addPath, splitLine, changeLength } from "./operations";
import {
  bendCurve,
  convertToCurve,
  moveHandle,
  moveVertex,
  straightenCurve,
} from "./curves";
import { asCubic, segmentLength, segmentPoint } from "./segments";
import { applyPointPlacement, placementOnEdge } from "./pointPlacement";
import { cubicLength, cubicPoint } from "../geometry/bezier";
import { distance } from "../geometry/line";
import { useEditor } from "../editor/store";
import { findPointInsertion } from "../editor/pointTool";
let i = 0;
const id = () => String(++i);
const fixture = () => {
  const doc = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  return { doc, edge: Object.values(doc.segments)[0] };
};
beforeEach(() => {
  i = 0;
});
it("converts a line without changing its shape", () => {
  const { doc, edge } = fixture();
  const next = convertToCurve(doc, edge.id);
  expect(next.segments[edge.id].kind).toBe("cubic");
  expect(segmentLength(next, next.segments[edge.id])).toBeCloseTo(100, 10);
  expect(next.points).toEqual(doc.points);
});
it("bends through the dragged location and keeps endpoints fixed", () => {
  const { doc, edge } = fixture();
  const next = bendCurve(doc, edge.id, 0.5, { x: 0, y: 40 });
  expect(
    distance(segmentPoint(next, next.segments[edge.id], 0.5), { x: 50, y: 40 }),
  ).toBeLessThan(1e-10);
  expect(next.points).toEqual(doc.points);
  expect(segmentLength(next, next.segments[edge.id])).toBeGreaterThan(100);
});
it("moves each arm independently and carries attached arms with an endpoint", () => {
  const { doc, edge } = fixture();
  const curved = convertToCurve(doc, edge.id),
    moved = moveHandle(curved, edge.id, "control1", { x: 0, y: 50 });
  expect(asCubic(moved, moved.segments[edge.id])[2]).toEqual(
    asCubic(curved, curved.segments[edge.id])[2],
  );
  const shifted = moveVertex(moved, edge.from, { x: 10, y: 20 });
  expect(asCubic(shifted, shifted.segments[edge.id])[1]).toEqual({
    x: 10,
    y: 70,
  });
  expect(shifted.points[edge.to]).toEqual(doc.points[edge.to]);
});
it("splits a curve into two exact cubics, with two arms at the new vertex", () => {
  const { doc, edge } = fixture(),
    curved = bendCurve(doc, edge.id, 0.5, { x: 0, y: 40 }),
    original = asCubic(curved, curved.segments[edge.id]);
  const split = splitLine(curved, edge.id, 0.4, id),
    edges = Object.values(split.segments);
  expect(edges.every((e) => e.kind === "cubic")).toBe(true);
  expect(edges[0].to).toBe(edges[1].from);
  for (let n = 0; n <= 20; n++) {
    const t = n / 20;
    const p =
      t <= 0.4
        ? segmentPoint(split, edges[0], t / 0.4)
        : segmentPoint(split, edges[1], (t - 0.4) / 0.6);
    expect(distance(p, cubicPoint(original, t))).toBeLessThan(1e-9);
  }
});
it("inserts by arc distance and hit-tests the visible curve", () => {
  const { doc, edge } = fixture(),
    curved = bendCurve(doc, edge.id, 0.5, { x: 0, y: 40 });
  const hit = findPointInsertion(curved, { x: 50, y: 42 }, 3);
  expect(hit?.t).toBeCloseTo(0.5, 4);
  const target = placementOnEdge(curved, edge.id, 0.5, {
      pointId: "p",
      newEdgeId: "s",
    }),
    next = applyPointPlacement(curved, target, 25);
  expect(segmentLength(next, next.segments[edge.id])).toBeCloseTo(25, 3);
  expect(
    segmentLength(next, next.segments[edge.id]) +
      segmentLength(next, next.segments.s),
  ).toBeCloseTo(target.lengthMm, 3);
});
it("round-trips curves and safely migrates version 1 lines", () => {
  const { doc, edge } = fixture(),
    curved = bendCurve(doc, edge.id, 0.5, { x: 0, y: 40 });
  expect(parseProject(JSON.stringify(curved))).toEqual(curved);
  const { annotations: _annotations, ...legacy } = doc;
  expect(_annotations).toEqual({});
  expect(parseProject(JSON.stringify({ ...legacy, schemaVersion: 1 }))).toEqual(
    doc,
  );
  expect(() =>
    parseProject(JSON.stringify({ ...curved, schemaVersion: 1 })),
  ).toThrow();
  const broken = structuredClone(curved);
  const e = broken.segments[edge.id];
  if (e.kind === "cubic") e.control1.x = NaN;
  expect(documentSchema.safeParse(broken).success).toBe(false);
});
it("keeps a bend in one undo entry and supports cancelling previews", () => {
  const { doc, edge } = fixture();
  useEditor.getState().load(doc);
  const preview = bendCurve(doc, edge.id, 0.5, { x: 0, y: 40 });
  useEditor.setState({ preview });
  useEditor.getState().cancel();
  expect(useEditor.getState().document).toEqual(doc);
  useEditor.getState().commit(preview);
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(preview);
});
it("rejects chord-based resizing of an arc and supports straightening", () => {
  const { doc, edge } = fixture(),
    curved = bendCurve(doc, edge.id, 0.5, { x: 0, y: 40 });
  expect(() => changeLength(curved, edge.id, 120, "start")).toThrow(
    "Arc length",
  );
  expect(straightenCurve(curved, edge.id)).toEqual(doc);
  expect(
    cubicLength(asCubic(curved, curved.segments[edge.id])),
  ).toBeGreaterThan(100);
});
